import {
  AttendanceSubject,
  TimetableSlot,
  Semester,
  Holiday,
  AttendanceEntry,
  BunkPlan,
  AttendanceSettings,
} from "../models/attendance.model.js";
import { ApiError } from "../utils/api-error.js";
import { ApiResponse } from "../utils/api-response.js";
import { asyncHandler } from "../utils/async-handler.js";
import {
  calculateSubjectStats,
  calculateOverallStats,
  calculateSemesterForecast,
} from "../utils/attendance-calculator.js";

// Helper: Normalize date to 'YYYY-MM-DD'
export const toDateString = (dateInput = new Date()) => {
  const d = new Date(dateInput);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// Helper: Add days to 'YYYY-MM-DD'
export const addDays = (dateStr, days) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return toDateString(date);
};

// Helper: Get day of week (0 = Sun, 1 = Mon, ..., 6 = Sat)
export const getWeekday = (dateStr) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
};

// ── GET OR INITIALIZE USER SETTINGS & SEMESTER ───────────────────────────────
export const getOrCreateSettings = async (userId) => {
  let settings = await AttendanceSettings.findOne({ userId });
  if (!settings) {
    settings = await AttendanceSettings.create({ userId });
  }
  return settings;
};

export const getOrCreateSemester = async (userId) => {
  let semester = await Semester.findOne({ userId, active: true });
  if (!semester) {
    const today = toDateString();
    // Default semester: started 30 days ago, ends in 90 days
    const start = addDays(today, -30);
    const end = addDays(today, 90);
    semester = await Semester.create({
      userId,
      name: "Current Semester",
      startDate: start,
      endDate: end,
      active: true,
    });
  }
  return semester;
};

// ── 1. SUBJECTS (FR-S1 to FR-S6) ─────────────────────────────────────────────
export const getAttendanceSubjects = asyncHandler(async (req, res) => {
  const { includeArchived } = req.query;
  const filter = { userId: req.user._id };
  if (includeArchived !== "true") {
    filter.archivedAt = null;
  }

  const subjects = await AttendanceSubject.find(filter).sort({ name: 1 });
  const settings = await getOrCreateSettings(req.user._id);

  // Compute live stats for each subject
  const subjectStatsList = await Promise.all(
    subjects.map(async (subj) => {
      const entries = await AttendanceEntry.find({
        userId: req.user._id,
        subjectId: subj._id,
      });

      let presentCount = 0;
      let absentCount = 0;
      let cancelledCount = 0;

      entries.forEach((e) => {
        if (e.status === "present") presentCount++;
        else if (e.status === "absent") absentCount++;
        else if (e.status === "cancelled") cancelledCount++;
      });

      const stats = calculateSubjectStats({
        openingAttended: subj.openingAttended,
        openingConducted: subj.openingConducted,
        presentCount,
        absentCount,
        cancelledCount,
        minPercent: subj.minPercent,
        safetyMargin: settings.safetyMargin,
      });

      return {
        ...subj.toObject(),
        stats,
      };
    })
  );

  return res.status(200).json(
    new ApiResponse(200, { subjects: subjectStatsList }, "Attendance subjects fetched")
  );
});

export const createAttendanceSubject = asyncHandler(async (req, res) => {
  const {
    name,
    code,
    teacher,
    color,
    minPercent,
    openingAttended,
    openingConducted,
  } = req.body;

  if (!name || !name.trim()) {
    throw new ApiError(400, "Subject name is required");
  }

  const attended = Number(openingAttended || 0);
  const conducted = Number(openingConducted || 0);

  if (attended > conducted) {
    throw new ApiError(400, "Opening attended classes cannot exceed opening conducted classes");
  }

  const settings = await getOrCreateSettings(req.user._id);

  const subject = await AttendanceSubject.create({
    userId: req.user._id,
    name: name.trim(),
    code: (code || "").trim(),
    teacher: (teacher || "").trim(),
    color: color || "#0A84FF",
    minPercent: minPercent ? Number(minPercent) : settings.defaultMinPercent,
    openingAttended: attended,
    openingConducted: conducted,
  });

  const stats = calculateSubjectStats({
    openingAttended: subject.openingAttended,
    openingConducted: subject.openingConducted,
    minPercent: subject.minPercent,
    safetyMargin: settings.safetyMargin,
  });

  return res.status(201).json(
    new ApiResponse(201, { subject: { ...subject.toObject(), stats } }, "Subject created")
  );
});

export const updateAttendanceSubject = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const {
    name,
    code,
    teacher,
    color,
    minPercent,
    openingAttended,
    openingConducted,
    archivedAt,
  } = req.body;

  const subject = await AttendanceSubject.findOne({
    _id: id,
    userId: req.user._id,
  });

  if (!subject) {
    throw new ApiError(404, "Subject not found");
  }

  if (openingAttended !== undefined || openingConducted !== undefined) {
    const attended =
      openingAttended !== undefined ? Number(openingAttended) : subject.openingAttended;
    const conducted =
      openingConducted !== undefined ? Number(openingConducted) : subject.openingConducted;
    if (attended > conducted) {
      throw new ApiError(400, "Opening attended classes cannot exceed opening conducted classes");
    }
    subject.openingAttended = attended;
    subject.openingConducted = conducted;
  }

  if (name !== undefined) subject.name = name.trim();
  if (code !== undefined) subject.code = (code || "").trim();
  if (teacher !== undefined) subject.teacher = (teacher || "").trim();
  if (color !== undefined) subject.color = color;
  if (minPercent !== undefined) subject.minPercent = Number(minPercent);
  if (archivedAt !== undefined) subject.archivedAt = archivedAt;

  await subject.save();

  return res.status(200).json(
    new ApiResponse(200, { subject }, "Subject updated successfully")
  );
});

export const deleteAttendanceSubject = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { permanent } = req.query;

  const subject = await AttendanceSubject.findOne({
    _id: id,
    userId: req.user._id,
  });

  if (!subject) {
    throw new ApiError(404, "Subject not found");
  }

  const entriesCount = await AttendanceEntry.countDocuments({
    userId: req.user._id,
    subjectId: id,
  });

  if (entriesCount > 0 && permanent !== "true") {
    // Offer archive as default (FR-S4)
    subject.archivedAt = new Date();
    await subject.save();
    return res.status(200).json(
      new ApiResponse(
        200,
        { archived: true, subject },
        "Subject has existing records and was archived safely"
      )
    );
  }

  // Permanent deletion: clean up entries and timetable slots
  await AttendanceEntry.deleteMany({ userId: req.user._id, subjectId: id });
  await TimetableSlot.updateMany(
    { userId: req.user._id, subjectId: id },
    { $set: { subjectId: null } }
  );
  await AttendanceSubject.deleteOne({ _id: id });

  return res.status(200).json(
    new ApiResponse(200, { deleted: true }, "Subject and associated records deleted")
  );
});

// ── 2. TIMETABLE WITH EFFECTIVE DATING (FR-T1 to FR-T4) ───────────────────────
export const getTimetable = asyncHandler(async (req, res) => {
  const targetDate = req.query.date || toDateString();
  const settings = await getOrCreateSettings(req.user._id);

  // Find all slots effective for targetDate:
  // effectiveFrom <= targetDate AND (effectiveTo == null OR effectiveTo >= targetDate)
  const slots = await TimetableSlot.find({
    userId: req.user._id,
    effectiveFrom: { $lte: targetDate },
    $or: [{ effectiveTo: null }, { effectiveTo: { $gte: targetDate } }],
  })
    .populate("subjectId", "name code color minPercent")
    .sort({ weekday: 1, slotIndex: 1 });

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        date: targetDate,
        slots,
        weekStart: settings.weekStart,
        maxSlots: settings.maxSlots,
      },
      "Timetable fetched"
    )
  );
});

export const saveTimetable = asyncHandler(async (req, res) => {
  const { slots, applyFrom } = req.body;
  const effectiveDate = applyFrom || toDateString();

  if (!Array.isArray(slots)) {
    throw new ApiError(400, "Slots array is required");
  }

  // Step 1: For any current active slot:
  // - If effectiveFrom < effectiveDate, set effectiveTo = dayBefore(effectiveDate)
  // - If effectiveFrom >= effectiveDate, it can be deleted (being replaced)
  const dayBefore = addDays(effectiveDate, -1);

  await TimetableSlot.deleteMany({
    userId: req.user._id,
    effectiveFrom: { $gte: effectiveDate },
  });

  await TimetableSlot.updateMany(
    {
      userId: req.user._id,
      effectiveFrom: { $lt: effectiveDate },
      $or: [{ effectiveTo: null }, { effectiveTo: { $gte: effectiveDate } }],
    },
    {
      $set: { effectiveTo: dayBefore },
    }
  );

  // Step 2: Insert new slots with effectiveFrom = effectiveDate, effectiveTo = null
  const newSlotsData = slots.map((s) => ({
    userId: req.user._id,
    subjectId: s.subjectId || null,
    weekday: Number(s.weekday),
    slotIndex: Number(s.slotIndex),
    startTime: s.startTime || "09:00",
    endTime: s.endTime || "10:00",
    room: s.room || "",
    slotType: s.slotType || "lecture",
    effectiveFrom: effectiveDate,
    effectiveTo: null,
    weekType: s.weekType || "all",
  }));

  const inserted = await TimetableSlot.insertMany(newSlotsData);

  return res.status(200).json(
    new ApiResponse(
      200,
      { count: inserted.length, applyFrom: effectiveDate },
      `Timetable updated effective from ${effectiveDate}`
    )
  );
});

// ── 3. DAY SESSIONS & LIVE MARKING (FR-A1 to FR-A9, FR-K2) ───────────────────
export const getDaySessions = asyncHandler(async (req, res) => {
  const date = req.params.date || toDateString();
  const weekday = getWeekday(date);
  const settings = await getOrCreateSettings(req.user._id);

  // Check if date is a declared holiday
  const holiday = await Holiday.findOne({ userId: req.user._id, date });

  // Get scheduled timetable slots effective on this date
  const slots = await TimetableSlot.find({
    userId: req.user._id,
    weekday,
    effectiveFrom: { $lte: date },
    $or: [{ effectiveTo: null }, { effectiveTo: { $gte: date } }],
    subjectId: { $ne: null },
  })
    .populate("subjectId", "name code color minPercent openingAttended openingConducted")
    .sort({ slotIndex: 1 });

  // Get all attendance entries recorded for this date
  const existingEntries = await AttendanceEntry.find({
    userId: req.user._id,
    date,
  }).populate("subjectId", "name code color minPercent openingAttended openingConducted");

  // Fetch all user's subjects to compute live bunk badges
  const allSubjects = await AttendanceSubject.find({
    userId: req.user._id,
    archivedAt: null,
  });

  // Calculate live stats per subject across all dates to compute "Can I bunk?" (FR-K2)
  const subjectStatsMap = new Map();
  for (const subj of allSubjects) {
    const entries = await AttendanceEntry.find({
      userId: req.user._id,
      subjectId: subj._id,
    });
    let p = 0;
    let a = 0;
    let c = 0;
    entries.forEach((e) => {
      if (e.status === "present") p++;
      else if (e.status === "absent") a++;
      else if (e.status === "cancelled") c++;
    });

    const stats = calculateSubjectStats({
      openingAttended: subj.openingAttended,
      openingConducted: subj.openingConducted,
      presentCount: p,
      absentCount: a,
      cancelledCount: c,
      minPercent: subj.minPercent,
      safetyMargin: settings.safetyMargin,
    });
    subjectStatsMap.set(String(subj._id), stats);
  }

  // Combine scheduled slots with existing marks
  const sessions = [];

  for (const slot of slots) {
    const entry = existingEntries.find(
      (e) => e.slotId && String(e.slotId) === String(slot._id)
    );

    const subj = slot.subjectId;
    const currentStats = subj ? subjectStatsMap.get(String(subj._id)) : null;

    // Live "Can I bunk?" badge computation (FR-K2):
    // What if the student marks absent for this session?
    let bunkBadge = null;
    if (subj && currentStats) {
      let projectedAttended = currentStats.attended;
      let projectedConducted = currentStats.conducted;

      if (!entry) {
        // Unmarked currently: skipping adds 1 to conducted only
        projectedConducted += 1;
      } else if (entry.status === "present") {
        // Currently present: switching to absent reduces attended by 1, conducted unchanged
        projectedAttended = Math.max(0, projectedAttended - 1);
      } else if (entry.status === "absent") {
        // Already marked absent: already reflected in stats
      }

      const projectedPct =
        projectedConducted > 0
          ? Number(((projectedAttended / projectedConducted) * 100).toFixed(1))
          : 0;
      const isSafe = projectedPct >= currentStats.effectiveLimit;

      bunkBadge = {
        canBunk: isSafe,
        projectedPct,
        limit: currentStats.effectiveLimit,
        text: isSafe
          ? `Safe to skip (you'd stay at ${projectedPct}%)`
          : `Skipping drops you to ${projectedPct}%, below limit (${currentStats.effectiveLimit}%)`,
      };
    }

    sessions.push({
      slotId: slot._id,
      subjectId: subj ? subj._id : null,
      subject: subj,
      slotIndex: slot.slotIndex,
      startTime: slot.startTime,
      endTime: slot.endTime,
      room: slot.room,
      slotType: slot.slotType || "lecture",
      status: entry ? entry.status : holiday ? "cancelled" : null,
      entryId: entry ? entry._id : null,
      source: entry ? entry.source : "scheduled",
      notes: entry ? entry.notes : "",
      bunkBadge,
    });
  }

  // Add extra sessions that don't belong to regular timetable slots (FR-A5)
  const extraEntries = existingEntries.filter((e) => !e.slotId);
  for (const extra of extraEntries) {
    const subj = extra.subjectId;
    const currentStats = subj ? subjectStatsMap.get(String(subj._id)) : null;

    let bunkBadge = null;
    if (subj && currentStats) {
      const projectedConducted = currentStats.conducted + (extra.status === "present" ? 0 : 1);
      const projectedAttended =
        extra.status === "present"
          ? currentStats.attended - 1
          : currentStats.attended;
      const projectedPct =
        projectedConducted > 0
          ? Number(((projectedAttended / projectedConducted) * 100).toFixed(1))
          : 0;
      const isSafe = projectedPct >= currentStats.effectiveLimit;
      bunkBadge = {
        canBunk: isSafe,
        projectedPct,
        limit: currentStats.effectiveLimit,
        text: isSafe
          ? `Safe to skip (${projectedPct}%)`
          : `Skipping drops to ${projectedPct}%`,
      };
    }

    sessions.push({
      slotId: null,
      subjectId: subj ? subj._id : null,
      subject: subj,
      slotIndex: 99,
      startTime: extra.startTime || "Extra",
      endTime: extra.endTime || "",
      room: "Extra Session",
      slotType: extra.slotType || "lecture",
      status: extra.status,
      entryId: extra._id,
      source: extra.source,
      notes: extra.notes,
      bunkBadge,
    });
  }

  // Overall day status
  const allMarked =
    sessions.length > 0 && sessions.every((s) => s.status !== null);
  const isHoliday = Boolean(holiday);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        date,
        weekday,
        holiday: holiday ? { label: holiday.label, id: holiday._id } : null,
        isHoliday,
        sessions,
        allMarked,
      },
      "Day sessions fetched"
    )
  );
});

export const markAttendance = asyncHandler(async (req, res) => {
  const { date, slotId, subjectId, status, notes } = req.body;

  if (!date || !subjectId || !status) {
    throw new ApiError(400, "Date, subjectId, and status are required");
  }

  if (!["present", "absent", "cancelled"].includes(status)) {
    throw new ApiError(400, "Invalid status. Must be present, absent, or cancelled");
  }

  const query = {
    userId: req.user._id,
    date,
    subjectId,
  };
  if (slotId) {
    query.slotId = slotId;
  }

  let entry = await AttendanceEntry.findOne(query);

  if (entry) {
    entry.status = status;
    if (notes !== undefined) entry.notes = notes;
    await entry.save();
  } else {
    entry = await AttendanceEntry.create({
      userId: req.user._id,
      date,
      slotId: slotId || null,
      subjectId,
      status,
      notes: notes || "",
      source: "scheduled",
    });
  }

  return res.status(200).json(
    new ApiResponse(200, { entry }, `Marked as ${status}`)
  );
});

export const bulkMarkDayPresent = asyncHandler(async (req, res) => {
  const { date } = req.params;
  const weekday = getWeekday(date);

  const slots = await TimetableSlot.find({
    userId: req.user._id,
    weekday,
    effectiveFrom: { $lte: date },
    $or: [{ effectiveTo: null }, { effectiveTo: { $gte: date } }],
    subjectId: { $ne: null },
  });

  const updatedEntries = [];

  for (const slot of slots) {
    let entry = await AttendanceEntry.findOne({
      userId: req.user._id,
      date,
      slotId: slot._id,
    });

    if (entry) {
      entry.status = "present";
      await entry.save();
    } else {
      entry = await AttendanceEntry.create({
        userId: req.user._id,
        date,
        slotId: slot._id,
        subjectId: slot.subjectId,
        status: "present",
        source: "scheduled",
      });
    }
    updatedEntries.push(entry);
  }

  return res.status(200).json(
    new ApiResponse(200, { count: updatedEntries.length }, "All sessions marked present")
  );
});

export const markDayHoliday = asyncHandler(async (req, res) => {
  const { date } = req.params;
  const { label } = req.body;
  const weekday = getWeekday(date);

  // 1. Create or update Holiday record
  let holiday = await Holiday.findOne({ userId: req.user._id, date });
  if (holiday) {
    holiday.label = label || "Holiday";
    await holiday.save();
  } else {
    holiday = await Holiday.create({
      userId: req.user._id,
      date,
      label: label || "Holiday",
    });
  }

  // 2. Mark all scheduled sessions on that day as 'cancelled' (FR-A6)
  const slots = await TimetableSlot.find({
    userId: req.user._id,
    weekday,
    effectiveFrom: { $lte: date },
    $or: [{ effectiveTo: null }, { effectiveTo: { $gte: date } }],
    subjectId: { $ne: null },
  });

  for (const slot of slots) {
    let entry = await AttendanceEntry.findOne({
      userId: req.user._id,
      date,
      slotId: slot._id,
    });

    if (entry) {
      entry.status = "cancelled";
      await entry.save();
    } else {
      await AttendanceEntry.create({
        userId: req.user._id,
        date,
        slotId: slot._id,
        subjectId: slot.subjectId,
        status: "cancelled",
        source: "scheduled",
      });
    }
  }

  return res.status(200).json(
    new ApiResponse(200, { holiday }, "Day marked as holiday and sessions cancelled")
  );
});

export const addExtraSession = asyncHandler(async (req, res) => {
  const { date, subjectId, startTime, endTime, notes, status } = req.body;

  if (!date || !subjectId) {
    throw new ApiError(400, "Date and subjectId are required");
  }

  const entry = await AttendanceEntry.create({
    userId: req.user._id,
    date,
    slotId: null,
    subjectId,
    status: status || "present",
    source: "extra",
    startTime: startTime || "Extra",
    endTime: endTime || "",
    notes: notes || "",
  });

  return res.status(201).json(
    new ApiResponse(201, { entry }, "Extra session added successfully")
  );
});

export const deleteAttendanceEntry = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const entry = await AttendanceEntry.findOneAndDelete({
    _id: id,
    userId: req.user._id,
  });

  if (!entry) {
    throw new ApiError(404, "Attendance entry not found");
  }

  return res.status(200).json(
    new ApiResponse(200, { deleted: true }, "Entry deleted")
  );
});

// ── 4. OVERALL STATS & DASHBOARD (FR-C1 to FR-C3, FR-K1, FR-K3) ───────────────
export const getAttendanceStats = asyncHandler(async (req, res) => {
  const settings = await getOrCreateSettings(req.user._id);
  const subjects = await AttendanceSubject.find({
    userId: req.user._id,
    archivedAt: null,
  }).sort({ name: 1 });

  const subjectStatsList = await Promise.all(
    subjects.map(async (subj) => {
      const entries = await AttendanceEntry.find({
        userId: req.user._id,
        subjectId: subj._id,
      });

      let presentCount = 0;
      let absentCount = 0;
      let cancelledCount = 0;

      entries.forEach((e) => {
        if (e.status === "present") presentCount++;
        else if (e.status === "absent") absentCount++;
        else if (e.status === "cancelled") cancelledCount++;
      });

      const stats = calculateSubjectStats({
        openingAttended: subj.openingAttended,
        openingConducted: subj.openingConducted,
        presentCount,
        absentCount,
        cancelledCount,
        minPercent: subj.minPercent,
        safetyMargin: settings.safetyMargin,
      });

      return {
        _id: subj._id,
        name: subj.name,
        code: subj.code,
        color: subj.color,
        teacher: subj.teacher,
        minPercent: subj.minPercent,
        openingAttended: subj.openingAttended,
        openingConducted: subj.openingConducted,
        ...stats,
      };
    })
  );

  const overall = calculateOverallStats(subjectStatsList);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        overall,
        subjects: subjectStatsList,
        safetyMargin: settings.safetyMargin,
      },
      "Attendance stats calculated"
    )
  );
});

// ── 5. PENDING DAYS TRACKER (FR-B3 & FR-A8) ──────────────────────────────────
export const getPendingDays = asyncHandler(async (req, res) => {
  const semester = await getOrCreateSemester(req.user._id);
  const today = toDateString();
  const yesterday = addDays(today, -1);

  // We look between semester.startDate and yesterday
  const startDate = semester.startDate > yesterday ? yesterday : semester.startDate;

  const holidays = await Holiday.find({
    userId: req.user._id,
    date: { $gte: startDate, $lte: yesterday },
  });
  const holidayDates = new Set(holidays.map((h) => h.date));

  const pendingDaysList = [];
  let currentDate = startDate;

  while (currentDate <= yesterday) {
    if (!holidayDates.has(currentDate)) {
      const weekday = getWeekday(currentDate);

      // Check if scheduled slots exist on this day
      const scheduledSlots = await TimetableSlot.find({
        userId: req.user._id,
        weekday,
        effectiveFrom: { $lte: currentDate },
        $or: [{ effectiveTo: null }, { effectiveTo: { $gte: currentDate } }],
        subjectId: { $ne: null },
      });

      if (scheduledSlots.length > 0) {
        // Check how many slots have entries
        const entries = await AttendanceEntry.find({
          userId: req.user._id,
          date: currentDate,
        });

        const markedSlotIds = new Set(
          entries.map((e) => (e.slotId ? String(e.slotId) : null)).filter(Boolean)
        );

        const unmarkedCount = scheduledSlots.filter(
          (s) => !markedSlotIds.has(String(s._id))
        ).length;

        if (unmarkedCount > 0) {
          pendingDaysList.push({
            date: currentDate,
            weekday,
            unmarkedCount,
            totalSlots: scheduledSlots.length,
          });
        }
      }
    }

    currentDate = addDays(currentDate, 1);
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        pendingCount: pendingDaysList.length,
        pendingDays: pendingDaysList,
      },
      "Pending days fetched"
    )
  );
});

// ── 6. BACK-FILL WIZARD & BATCH UNDO (FR-B1 to FR-B8) ─────────────────────────
export const previewBackfill = asyncHandler(async (req, res) => {
  const { startDate, endDate, defaultStatus } = req.body;

  if (!startDate || !endDate) {
    throw new ApiError(400, "Start date and end date are required");
  }

  if (startDate > endDate) {
    throw new ApiError(400, "Start date cannot be after end date");
  }

  const holidays = await Holiday.find({
    userId: req.user._id,
    date: { $gte: startDate, $lte: endDate },
  });
  const holidayDates = new Set(holidays.map((h) => h.date));

  // Check if any subjects have opening balance (FR-B4 double counting warning)
  const subjectsWithOpening = await AttendanceSubject.find({
    userId: req.user._id,
    archivedAt: null,
    $or: [{ openingAttended: { $gt: 0 } }, { openingConducted: { $gt: 0 } }],
  });

  const openingWarning =
    subjectsWithOpening.length > 0
      ? `Warning: ${subjectsWithOpening.length} subject(s) (${subjectsWithOpening
          .map((s) => s.name)
          .join(
            ", "
          )}) already have an opening balance. Please verify opening balances do not double-count sessions in this date range.`
      : null;

  const generatedSessions = [];
  let currentDate = startDate;

  while (currentDate <= endDate) {
    if (!holidayDates.has(currentDate)) {
      const weekday = getWeekday(currentDate);

      const slots = await TimetableSlot.find({
        userId: req.user._id,
        weekday,
        effectiveFrom: { $lte: currentDate },
        $or: [{ effectiveTo: null }, { effectiveTo: { $gte: currentDate } }],
        subjectId: { $ne: null },
      }).populate("subjectId", "name code color");

      for (const slot of slots) {
        generatedSessions.push({
          date: currentDate,
          slotId: slot._id,
          subjectId: slot.subjectId ? slot.subjectId._id : null,
          subjectName: slot.subjectId ? slot.subjectId.name : "",
          color: slot.subjectId ? slot.subjectId.color : "#0A84FF",
          startTime: slot.startTime,
          endTime: slot.endTime,
          status: defaultStatus || "present",
        });
      }
    }
    currentDate = addDays(currentDate, 1);
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        totalSessions: generatedSessions.length,
        hasOpeningConflict: Boolean(openingWarning),
        openingWarning,
        sessions: generatedSessions,
      },
      "Back-fill preview generated"
    )
  );
});

export const commitBackfill = asyncHandler(async (req, res) => {
  const { entries, clearOpeningBalances } = req.body;

  if (!Array.isArray(entries) || entries.length === 0) {
    throw new ApiError(400, "Entries array is required and cannot be empty");
  }

  const batchId = `backfill_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  // Optional: clear opening balances if user confirmed (FR-B4)
  if (clearOpeningBalances === true) {
    await AttendanceSubject.updateMany(
      { userId: req.user._id },
      { $set: { openingAttended: 0, openingConducted: 0 } }
    );
  }

  const docs = entries.map((e) => ({
    userId: req.user._id,
    subjectId: e.subjectId,
    date: e.date,
    slotId: e.slotId || null,
    status: e.status || "present",
    source: "backfill",
    batchId,
    notes: e.notes || "Back-filled session",
  }));

  // Insert or update entries for that batch
  await AttendanceEntry.insertMany(docs);

  return res.status(201).json(
    new ApiResponse(
      201,
      {
        batchId,
        recordedSessions: docs.length,
      },
      `Successfully recorded ${docs.length} sessions (Batch ID: ${batchId})`
    )
  );
});

export const undoBackfillBatch = asyncHandler(async (req, res) => {
  const { batchId } = req.params;

  if (!batchId) {
    throw new ApiError(400, "Batch ID is required");
  }

  const result = await AttendanceEntry.deleteMany({
    userId: req.user._id,
    batchId,
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      { deletedCount: result.deletedCount, batchId },
      `Undid batch ${batchId}: deleted ${result.deletedCount} sessions`
    )
  );
});

// ── 7. CSV IMPORT (FR-B6) ───────────────────────────────────────────────────
export const importCsv = asyncHandler(async (req, res) => {
  const { rows } = req.body; // Array of { date, subject, status }

  if (!Array.isArray(rows) || rows.length === 0) {
    throw new ApiError(400, "Rows array is required");
  }

  const subjects = await AttendanceSubject.find({ userId: req.user._id });
  const subjectMap = new Map();
  subjects.forEach((s) => {
    subjectMap.set(s.name.trim().toLowerCase(), s._id);
    if (s.code) subjectMap.set(s.code.trim().toLowerCase(), s._id);
  });

  const batchId = `import_${Date.now()}`;
  const validEntries = [];
  const errors = [];

  rows.forEach((row, idx) => {
    const rawDate = (row.date || "").trim();
    const rawSubject = (row.subject || "").trim().toLowerCase();
    const rawStatus = (row.status || "").trim().toLowerCase();

    if (!rawDate || !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      errors.push({ row: idx + 1, error: "Invalid date format (must be YYYY-MM-DD)" });
      return;
    }

    const subjectId = subjectMap.get(rawSubject);
    if (!subjectId) {
      errors.push({ row: idx + 1, error: `Subject '${row.subject}' not found` });
      return;
    }

    if (!["present", "absent", "cancelled"].includes(rawStatus)) {
      errors.push({
        row: idx + 1,
        error: `Invalid status '${row.status}' (must be present, absent, or cancelled)`,
      });
      return;
    }

    validEntries.push({
      userId: req.user._id,
      subjectId,
      date: rawDate,
      slotId: null,
      status: rawStatus,
      source: "import",
      batchId,
      notes: "Imported via CSV",
    });
  });

  if (validEntries.length > 0) {
    await AttendanceEntry.insertMany(validEntries);
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        importedCount: validEntries.length,
        errorCount: errors.length,
        batchId,
        errors,
      },
      `Imported ${validEntries.length} entries successfully`
    )
  );
});

// ── 8. BUNK PLANNER & SEMESTER FORECAST (FR-K4, FR-K5, FR-K7) ────────────────
export const getSemesterForecast = asyncHandler(async (req, res) => {
  const semester = await getOrCreateSemester(req.user._id);
  const settings = await getOrCreateSettings(req.user._id);
  const today = toDateString();
  const tomorrow = addDays(today, 1);
  const endDate = semester.endDate || addDays(today, 60);

  const subjects = await AttendanceSubject.find({
    userId: req.user._id,
    archivedAt: null,
  }).sort({ name: 1 });

  // Fetch all holidays between tomorrow and semester end
  const holidays = await Holiday.find({
    userId: req.user._id,
    date: { $gte: tomorrow, $lte: endDate },
  });
  const holidayDates = new Set(holidays.map((h) => h.date));

  // Count remaining scheduled sessions for each subject
  const remainingCounts = new Map();
  subjects.forEach((s) => remainingCounts.set(String(s._id), 0));

  let d = tomorrow;
  while (d <= endDate) {
    if (!holidayDates.has(d)) {
      const weekday = getWeekday(d);
      const slots = await TimetableSlot.find({
        userId: req.user._id,
        weekday,
        effectiveFrom: { $lte: d },
        $or: [{ effectiveTo: null }, { effectiveTo: { $gte: d } }],
        subjectId: { $ne: null },
      });

      slots.forEach((s) => {
        const idStr = String(s.subjectId);
        if (remainingCounts.has(idStr)) {
          remainingCounts.set(idStr, remainingCounts.get(idStr) + 1);
        }
      });
    }
    d = addDays(d, 1);
  }

  // Calculate forecast metrics per subject
  const forecasts = await Promise.all(
    subjects.map(async (subj) => {
      const entries = await AttendanceEntry.find({
        userId: req.user._id,
        subjectId: subj._id,
      });

      let presentCount = 0;
      let absentCount = 0;
      entries.forEach((e) => {
        if (e.status === "present") presentCount++;
        else if (e.status === "absent") absentCount++;
      });

      const attended = subj.openingAttended + presentCount;
      const conducted = subj.openingConducted + presentCount + absentCount;
      const remaining = remainingCounts.get(String(subj._id)) || 0;

      const forecast = calculateSemesterForecast({
        attended,
        conducted,
        remaining,
        minPercent: subj.minPercent,
        safetyMargin: settings.safetyMargin,
      });

      return {
        _id: subj._id,
        name: subj.name,
        code: subj.code,
        color: subj.color,
        minPercent: subj.minPercent,
        attended,
        conducted,
        ...forecast,
      };
    })
  );

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        semesterStartDate: semester.startDate,
        semesterEndDate: semester.endDate,
        forecasts,
      },
      "Semester forecast calculated"
    )
  );
});

export const projectBunkPlan = asyncHandler(async (req, res) => {
  const { plannedSkips } = req.body; // Array of { date, subjectId }
  const settings = await getOrCreateSettings(req.user._id);

  if (!Array.isArray(plannedSkips)) {
    throw new ApiError(400, "plannedSkips array is required");
  }

  // Sort skips chronologically
  const sortedSkips = [...plannedSkips].sort((a, b) => a.date.localeCompare(b.date));

  const subjects = await AttendanceSubject.find({
    userId: req.user._id,
    archivedAt: null,
  });

  // Calculate current baseline stats
  const subjectState = new Map();
  for (const s of subjects) {
    const entries = await AttendanceEntry.find({
      userId: req.user._id,
      subjectId: s._id,
    });
    let p = 0;
    let a = 0;
    entries.forEach((e) => {
      if (e.status === "present") p++;
      else if (e.status === "absent") a++;
    });

    subjectState.set(String(s._id), {
      name: s.name,
      minPercent: s.minPercent,
      effectiveLimit: s.minPercent + settings.safetyMargin,
      attended: s.openingAttended + p,
      conducted: s.openingConducted + p + a,
    });
  }

  let firstBreach = null;
  const simulationTimeline = [];

  for (const skip of sortedSkips) {
    const state = subjectState.get(String(skip.subjectId));
    if (state) {
      // Skipping increments conducted by 1, attended unchanged
      state.conducted += 1;
      const pct =
        state.conducted > 0
          ? Number(((state.attended / state.conducted) * 100).toFixed(1))
          : 0;

      const isBreach = pct < state.effectiveLimit;
      if (isBreach && !firstBreach) {
        firstBreach = {
          date: skip.date,
          subjectName: state.name,
          projectedPct: pct,
          limit: state.effectiveLimit,
          message: `${state.name} breaches limit on ${skip.date} (drops to ${pct}%)`,
        };
      }

      simulationTimeline.push({
        date: skip.date,
        subjectId: skip.subjectId,
        subjectName: state.name,
        projectedPct: pct,
        isBreach,
      });
    }
  }

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        firstBreach,
        timeline: simulationTimeline,
        hasBreach: Boolean(firstBreach),
      },
      "Bunk plan projected"
    )
  );
});

export const getBunkPlans = asyncHandler(async (req, res) => {
  const plans = await BunkPlan.find({ userId: req.user._id }).sort({ createdAt: -1 });
  return res.status(200).json(
    new ApiResponse(200, { plans }, "Bunk plans fetched")
  );
});

export const saveBunkPlan = asyncHandler(async (req, res) => {
  const { name, items } = req.body;
  if (!name || !name.trim()) {
    throw new ApiError(400, "Plan name is required");
  }

  const plan = await BunkPlan.create({
    userId: req.user._id,
    name: name.trim(),
    items: items || [],
  });

  return res.status(201).json(
    new ApiResponse(201, { plan }, "Bunk plan saved")
  );
});

export const deleteBunkPlan = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await BunkPlan.deleteOne({ _id: id, userId: req.user._id });
  return res.status(200).json(
    new ApiResponse(200, { deleted: true }, "Bunk plan deleted")
  );
});

// ── 9. WEEKLY REPORTS (FR-R1) ────────────────────────────────────────────────
export const getWeeklyReport = asyncHandler(async (req, res) => {
  const requestedStart = req.query.week_start || toDateString();
  const settings = await getOrCreateSettings(req.user._id);

  // Determine the start of this 7-day window
  const days = [];
  for (let i = 0; i < 7; i++) {
    days.push(addDays(requestedStart, i));
  }

  const dailyBreakdown = await Promise.all(
    days.map(async (d) => {
      const entries = await AttendanceEntry.find({
        userId: req.user._id,
        date: d,
      });

      let present = 0;
      let absent = 0;
      let cancelled = 0;

      entries.forEach((e) => {
        if (e.status === "present") present++;
        else if (e.status === "absent") absent++;
        else if (e.status === "cancelled") cancelled++;
      });

      return {
        date: d,
        weekday: getWeekday(d),
        present,
        absent,
        cancelled,
        total: present + absent,
      };
    })
  );

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        weekStart: requestedStart,
        dailyBreakdown,
      },
      "Weekly report fetched"
    )
  );
});

// ── 10. SETTINGS & HOLIDAYS (FR-G1 to FR-G4) ──────────────────────────────────
export const getAttendanceSettings = asyncHandler(async (req, res) => {
  const settings = await getOrCreateSettings(req.user._id);
  const semester = await getOrCreateSemester(req.user._id);
  const holidays = await Holiday.find({ userId: req.user._id }).sort({ date: 1 });

  return res.status(200).json(
    new ApiResponse(200, { settings, semester, holidays }, "Settings fetched")
  );
});

export const updateAttendanceSettings = asyncHandler(async (req, res) => {
  const settings = await getOrCreateSettings(req.user._id);
  const {
    defaultMinPercent,
    safetyMargin,
    weekStart,
    maxSlots,
    dailyReminderTime,
    weeklyReportDay,
    weeklyReportEnabled,
  } = req.body;

  if (defaultMinPercent !== undefined) settings.defaultMinPercent = Number(defaultMinPercent);
  if (safetyMargin !== undefined) settings.safetyMargin = Number(safetyMargin);
  if (weekStart !== undefined) settings.weekStart = Number(weekStart);
  if (maxSlots !== undefined) settings.maxSlots = Number(maxSlots);
  if (dailyReminderTime !== undefined) settings.dailyReminderTime = dailyReminderTime;
  if (weeklyReportDay !== undefined) settings.weeklyReportDay = Number(weeklyReportDay);
  if (weeklyReportEnabled !== undefined) settings.weeklyReportEnabled = Boolean(weeklyReportEnabled);

  await settings.save();

  return res.status(200).json(
    new ApiResponse(200, { settings }, "Settings updated")
  );
});

export const updateSemesterDates = asyncHandler(async (req, res) => {
  const { startDate, endDate, name } = req.body;
  const semester = await getOrCreateSemester(req.user._id);

  if (startDate) semester.startDate = startDate;
  if (endDate !== undefined) semester.endDate = endDate;
  if (name) semester.name = name;

  await semester.save();

  return res.status(200).json(
    new ApiResponse(200, { semester }, "Semester dates updated")
  );
});

export const addHoliday = asyncHandler(async (req, res) => {
  const { date, label } = req.body;
  if (!date || !label) {
    throw new ApiError(400, "Date and label are required");
  }

  const holiday = await Holiday.findOneAndUpdate(
    { userId: req.user._id, date },
    { label: label.trim() },
    { upsert: true, new: true }
  );

  return res.status(200).json(
    new ApiResponse(200, { holiday }, "Holiday added/updated")
  );
});

export const deleteHoliday = asyncHandler(async (req, res) => {
  const { id } = req.params;
  await Holiday.deleteOne({ _id: id, userId: req.user._id });
  return res.status(200).json(
    new ApiResponse(200, { deleted: true }, "Holiday removed")
  );
});

export const autoPopulateHolidays = asyncHandler(async (req, res) => {
  const currentYear = new Date().getFullYear();
  const year = Number(req.body.year) || currentYear;

  const standardHolidays = [
    { date: `${year}-01-26`, label: "Republic Day" },
    { date: `${year}-03-08`, label: "Maha Shivratri" },
    { date: `${year}-03-25`, label: "Holi" },
    { date: `${year}-03-29`, label: "Good Friday" },
    { date: `${year}-04-11`, label: "Eid-ul-Fitr" },
    { date: `${year}-04-17`, label: "Ram Navami" },
    { date: `${year}-04-21`, label: "Mahavir Jayanti" },
    { date: `${year}-05-23`, label: "Buddha Purnima" },
    { date: `${year}-06-17`, label: "Bakrid (Eid al-Adha)" },
    { date: `${year}-07-17`, label: "Muharram" },
    { date: `${year}-08-15`, label: "Independence Day" },
    { date: `${year}-08-26`, label: "Janmashtami" },
    { date: `${year}-09-16`, label: "Eid-e-Milad" },
    { date: `${year}-10-02`, label: "Mahatma Gandhi Jayanti" },
    { date: `${year}-10-12`, label: "Dussehra (Vijayadashami)" },
    { date: `${year}-10-31`, label: "Diwali (Deepavali)" },
    { date: `${year}-11-01`, label: "Govardhan Puja" },
    { date: `${year}-11-15`, label: "Guru Nanak Jayanti" },
    { date: `${year}-12-25`, label: "Christmas" },
    { date: `${year + 1}-01-01`, label: "New Year's Day" },
    { date: `${year + 1}-01-26`, label: "Republic Day" },
  ];

  let addedCount = 0;
  for (const item of standardHolidays) {
    const existing = await Holiday.findOne({
      userId: req.user._id,
      date: item.date,
    });
    if (!existing) {
      await Holiday.create({
        userId: req.user._id,
        date: item.date,
        label: item.label,
      });
      addedCount++;
    }
  }

  const holidays = await Holiday.find({ userId: req.user._id }).sort({ date: 1 });

  return res.status(200).json(
    new ApiResponse(
      200,
      { addedCount, totalHolidays: holidays.length, holidays },
      `Added ${addedCount} academic holidays to your calendar!`
    )
  );
});

export const resetSemester = asyncHandler(async (req, res) => {
  const { action } = req.body; // 'clear_records' | 'archive_subjects'

  if (action === "archive_subjects") {
    await AttendanceSubject.updateMany(
      { userId: req.user._id },
      { $set: { archivedAt: new Date() } }
    );
  }

  // Clear attendance entries and current timetable
  await AttendanceEntry.deleteMany({ userId: req.user._id });
  await TimetableSlot.deleteMany({ userId: req.user._id });
  await BunkPlan.deleteMany({ userId: req.user._id });

  return res.status(200).json(
    new ApiResponse(200, { reset: true }, "Semester reset completed")
  );
});

// ── 11. EXPORT (FR-R3) ────────────────────────────────────────────────────────
export const exportAttendanceData = asyncHandler(async (req, res) => {
  const subjects = await AttendanceSubject.find({ userId: req.user._id });
  const entries = await AttendanceEntry.find({ userId: req.user._id })
    .populate("subjectId", "name code")
    .sort({ date: -1 });
  const slots = await TimetableSlot.find({ userId: req.user._id })
    .populate("subjectId", "name code");

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        exportDate: new Date().toISOString(),
        subjects,
        slots,
        entries,
      },
      "Data exported"
    )
  );
});
