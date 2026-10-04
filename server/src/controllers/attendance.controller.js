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
import {
  toCivil,
  parseCivil,
  todayForTimezone,
  addDaysCivil,
  weekdayOf,
  rangeCivil,
  diffDaysCivil,
  isValidCivilDate,
} from "../utils/civil-date.js";
import {
  evaluateDay,
  evaluateDateRange,
  countRemainingSessionsBySubject,
} from "../services/calendar-engine.js";

// Helper: Normalize date to 'YYYY-MM-DD' in user's timezone (default Asia/Kolkata)
export const toDateString = (dateInput = new Date(), timezone = "Asia/Kolkata") => {
  if (typeof dateInput === "string" && isValidCivilDate(dateInput)) {
    return dateInput;
  }
  return todayForTimezone(timezone);
};

// Helper: Add days to 'YYYY-MM-DD'
export const addDays = (dateStr, days) => {
  return addDaysCivil(dateStr, days);
};

// Helper: Get day of week (0 = Sun, 1 = Mon, ..., 6 = Sat)
export const getWeekday = (dateStr) => {
  return weekdayOf(dateStr);
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
    shortName: (req.body.shortName || "").trim().slice(0, 12),
    teacher: (teacher || "").trim(),
    defaultRoom: (req.body.defaultRoom || "").trim(),
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
  if (req.body.shortName !== undefined) subject.shortName = (req.body.shortName || "").trim().slice(0, 12);
  if (teacher !== undefined) subject.teacher = (teacher || "").trim();
  if (req.body.defaultRoom !== undefined) subject.defaultRoom = (req.body.defaultRoom || "").trim();
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
  let slots = await TimetableSlot.find({
    userId: req.user._id,
    effectiveFrom: { $lte: targetDate },
    $or: [{ effectiveTo: null }, { effectiveTo: { $gte: targetDate } }],
  })
    .populate("subjectId", "name code color minPercent shortName defaultRoom teacher")
    .sort({ weekday: 1, slotIndex: 1 });

  // Intelligent Fallback: If no slots match for this date because effectiveFrom was set later,
  // use the active timetable (effectiveTo: null) so timetable is always accessible across the semester.
  if (slots.length === 0) {
    slots = await TimetableSlot.find({
      userId: req.user._id,
      effectiveTo: null,
    })
      .populate("subjectId", "name code color minPercent shortName defaultRoom teacher")
      .sort({ weekday: 1, slotIndex: 1 });
  }

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
  const semester = await getOrCreateSemester(req.user._id);
  const effectiveDate = applyFrom || semester.startDate || toDateString();

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
    blockId: s.blockId || null,
    blockSpan: Number(s.blockSpan) || 1,
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

export const clearTimetable = asyncHandler(async (req, res) => {
  const result = await TimetableSlot.deleteMany({ userId: req.user._id });
  return res.status(200).json(
    new ApiResponse(
      200,
      { deletedCount: result.deletedCount },
      "Timetable cleared successfully"
    )
  );
});

/**
 * 2b. AI Timetable Vision Extraction (Gemini Multimodal Vision)
 */
export const parseAiTimetable = asyncHandler(async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ success: false, error: "AI not configured", fallback: true });
  }

  const { imageBase64, mimeType } = req.body;
  if (!imageBase64 || !mimeType) {
    throw new ApiError(400, "imageBase64 and mimeType are required");
  }

  const prompt = `You are a precision timetable parsing system designed to extract university class schedules into structured JSON with 100% fidelity.
Analyze this timetable image with extreme care and accuracy.

CRITICAL INSTRUCTIONS:

1. MASTER TIMING GRID & PERIOD SLOTS:
- Do NOT include LUNCH, recess, interval, or tea breaks in the "timings" slot array! Skip the LUNCH column completely.
- Period slots must be consecutive integers starting from 1 (1, 2, 3, 4, 5, 6, 7, 8).
- Morning periods (before lunch) are Slots 1 to 4:
  - Slot 1: 09:00 - 09:55
  - Slot 2: 09:55 - 10:50
  - Slot 3: 10:50 - 11:45
  - Slot 4: 11:45 - 12:40
- Afternoon periods (after lunch, 14:30 onwards) are Slots 5 to 8:
  - When column headers show combined 2-hour ranges like "2:30-4:20" and "4:25-6:15", break them into standard sequential period slots:
    - Slot 5: 14:30 - 15:25
    - Slot 6: 15:25 - 16:20
    - Slot 7: 16:25 - 17:20
    - Slot 8: 17:20 - 18:15
  - NEVER output overlapping start/end times in the "timings" array. Each slot must be strictly sequential!

2. MULTI-PERIOD DURATION & SLOTS ARRAY:
- A 2-hour lecture block occupying 09:00-10:50 has slots: [1, 2].
- A 2-hour lecture block occupying 10:50-12:40 has slots: [3, 4].
- A 4-hour morning lab block occupying 09:00-12:40 has slots: [1, 2, 3, 4].
- A 2-hour afternoon class occupying 14:30-16:20 has slots: [5, 6].
- A 2-hour afternoon/evening class occupying 16:25-18:15 has slots: [7, 8].
- An afternoon 4-hour lab occupying 14:30-18:15 has slots: [5, 6, 7, 8].

3. CORRELATE ROOMS FROM HEADER INSTRUCTIONS:
- Check header text like "(Monday:LT04), Tuesday_Forenoon:CSA304), Tuesday_Afternoon:CSA305), Wednesday_afternoon:303".
- Monday classes are in room "LT04".
- Tuesday morning classes (slots 1-4) are in room "CSA304".
- Tuesday afternoon classes (slots 5-8) are in room "CSA305".
- Wednesday afternoon classes (slots 5-8) are in room "303".
- Labs are in room "Lab" or "CCIH" as indicated in cells.
- Rooms (like "LT04", "CSA304", "CSA305", "303") are NOT subject course codes! Do NOT put room names in "code"! If no course code like MCA-101 is explicitly written, leave "code" empty ("").

4. CORRELATE SUBJECTS, SHORT NAMES & FACULTY FROM LEGEND:
- Read the faculty/subject legend at the bottom or margin (e.g. "Dr. Manvi: Cloud Computing, Dr. Manjeet: DS & DS Lab, Ms. Kiran: Computer Networks, Dr. Vedpal: Java & Java Lab, Ms. Palak: DBMS, Ms. Jyoti & Ms. Reena DBMS Lab").
- Use clean, full subject names (e.g. "Cloud Computing", "Data Structure", "Computer Networks", "Java Programming", "Data Base Management System", "Data Structure Lab", "Java Programming Lab", "Data Base Management System Lab").
- "shortName" must be the standard abbreviation: "CC", "DS", "CN", "Java", "DBMS", "DS Lab", "Java Lab", "DBMS Lab".
- For batch-split lab cells (e.g. "Data Structure Lab (Batch 1/2)... JAVA Programming Lab (Batch 2/2)"), choose the primary lab subject and DO NOT include "Batch 1/2" or raw teacher names in the subject title.
- "type" must be "lab" for labs/practicals, and "lecture" for normal lectures. DO NOT label lectures as labs!

Return ONLY valid JSON matching this schema:
{
  "timings": [
    {"slot": 1, "start": "09:00", "end": "09:55"},
    {"slot": 2, "start": "09:55", "end": "10:50"},
    {"slot": 3, "start": "10:50", "end": "11:45"},
    {"slot": 4, "start": "11:45", "end": "12:40"},
    {"slot": 5, "start": "14:30", "end": "15:25"},
    {"slot": 6, "start": "15:25", "end": "16:20"},
    {"slot": 7, "start": "16:25", "end": "17:20"},
    {"slot": 8, "start": "17:20", "end": "18:15"}
  ],
  "schedule": [
    {
      "day": "Monday",
      "classes": [
        {
          "slots": [1, 2],
          "subject": "Data Base Management System",
          "code": "",
          "shortName": "DBMS",
          "type": "lecture",
          "room": "LT04",
          "teacher": "Ms. Palak"
        }
      ]
    }
  ]
}`;

  let cleanMime = (mimeType || "").toLowerCase().trim();
  if (cleanMime.includes("png")) cleanMime = "image/png";
  else if (cleanMime.includes("webp")) cleanMime = "image/webp";
  else cleanMime = "image/jpeg";

  const candidateModels = [
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-flash-lite-latest",
    "gemini-2.5-flash-lite",
    "gemini-pro-latest",
    "gemini-2.5-pro",
    "gemini-3.8-flash",
    "gemini-3.7-flash",
    "gemini-3.5-flash",
  ];
  let lastError = null;

  for (const modelName of candidateModels) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt },
                  {
                    inlineData: {
                      mimeType: cleanMime,
                      data: imageBase64,
                    },
                  },
                ],
              },
            ],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.1,
              maxOutputTokens: 8192,
            },
          }),
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        console.warn(`Gemini model ${modelName} HTTP ${response.status}:`, errText);
        lastError = new Error(`Model ${modelName} HTTP ${response.status}: ${errText}`);
        continue;
      }

      const data = await response.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const jsonText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

      let parsed;
      try {
        parsed = JSON.parse(jsonText);
      } catch {
        console.error("Gemini returned non-JSON:", rawText.slice(0, 500));
        continue;
      }

      return res.status(200).json({
        success: true,
        modelUsed: modelName,
        timings: parsed.timings || [],
        schedule: parsed.schedule || [],
      });
    } catch (err) {
      lastError = err;
      console.warn(`Gemini model ${modelName} call failed:`, err.message);
    }
  }

  return res.status(502).json({
    success: false,
    error: lastError?.message || "AI timetable extraction unavailable. Falling back to OCR.",
    fallback: true,
  });
});

/**
 * Gemini Vision AI Academic Calendar & Holiday Parser
 * Extracts holidays, vacations, restricted holidays, and semester date boundaries with 100% precision.
 */
export const parseAiHolidayCalendar = asyncHandler(async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ success: false, error: "AI not configured", fallback: true });
  }

  const { imageBase64, mimeType } = req.body;
  if (!imageBase64 || !mimeType) {
    throw new ApiError(400, "imageBase64 and mimeType are required");
  }

  const prompt = `You are a precision academic calendar and university holiday list parser.
Analyze this image or circular document and extract all holiday dates and academic schedule boundaries into structured JSON.

CRITICAL INSTRUCTIONS:
1. HOLIDAYS & OFF-DAYS:
- Extract all Gazetted Holidays, Public Holidays, University Holidays, and Vacation periods.
- Format all dates in strict 'YYYY-MM-DD' ISO format (e.g. '2026-01-26').
- If a holiday spans multiple consecutive days (e.g. '20 Oct to 24 Oct'), generate an entry for EACH day in that range.
- Assign appropriate category: 'gazetted' (mandatory off-day), 'restricted' (restricted / optional holiday), 'special_day' (celebration/observance where classes are held).
- Set isOffDay: true for days when college/classes are closed; false for days where classes are held.

2. SEMESTER DATES & VARIANTS:
- Detect the semester start date ('semesterStartDate') and end date ('semesterEndDate') if mentioned.
- If multiple columns exist (e.g. 1st Sem Freshers vs 3rd-7th Sem), populate 'semesterDateVariants'.

Return ONLY valid JSON matching this schema:
{
  "semesterStartDate": "YYYY-MM-DD or null",
  "semesterEndDate": "YYYY-MM-DD or null",
  "semesterName": "string or null",
  "holidays": [
    {
      "date": "YYYY-MM-DD",
      "label": "Name of holiday (e.g. Republic Day)",
      "category": "gazetted",
      "isOffDay": true
    }
  ],
  "semesterDateVariants": [
    {
      "label": "1st Sem (Fresh Batch)",
      "shortLabel": "1st Sem",
      "startDate": "YYYY-MM-DD",
      "endDate": "YYYY-MM-DD"
    }
  ]
}`;

  let cleanMime = (mimeType || "").toLowerCase().trim();
  if (cleanMime.includes("png")) cleanMime = "image/png";
  else if (cleanMime.includes("webp")) cleanMime = "image/webp";
  else cleanMime = "image/jpeg";

  const candidateModels = [
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
    "gemini-flash-lite-latest",
    "gemini-2.5-flash-lite",
    "gemini-pro-latest",
    "gemini-2.5-pro",
    "gemini-3.8-flash",
  ];
  let lastError = null;

  for (const modelName of candidateModels) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt },
                  {
                    inlineData: {
                      mimeType: cleanMime,
                      data: imageBase64,
                    },
                  },
                ],
              },
            ],
            generationConfig: {
              responseMimeType: "application/json",
              temperature: 0.1,
              maxOutputTokens: 8192,
            },
          }),
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        console.warn(`Gemini holiday model ${modelName} HTTP ${response.status}:`, errText);
        lastError = new Error(`Model ${modelName} HTTP ${response.status}: ${errText}`);
        continue;
      }

      const data = await response.json();
      const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const jsonText = rawText.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

      let parsed;
      try {
        parsed = JSON.parse(jsonText);
      } catch {
        console.error("Gemini returned non-JSON for holiday parse:", rawText.slice(0, 500));
        continue;
      }

      return res.status(200).json({
        success: true,
        modelUsed: modelName,
        holidays: parsed.holidays || [],
        semesterStartDate: parsed.semesterStartDate || null,
        semesterEndDate: parsed.semesterEndDate || null,
        semesterName: parsed.semesterName || null,
        semesterDateVariants: parsed.semesterDateVariants || [],
      });
    } catch (err) {
      lastError = err;
      console.warn(`Gemini holiday model ${modelName} call failed:`, err.message);
    }
  }

  return res.status(502).json({
    success: false,
    error: lastError?.message || "AI holiday calendar extraction unavailable. Falling back to OCR.",
    fallback: true,
  });
});

// ── 3. DAY SESSIONS & LIVE MARKING (FR-A1 to FR-A9, FR-K2) ───────────────────
export const getDaySessions = asyncHandler(async (req, res) => {
  const date = req.params.date || toDateString();
  const weekday = getWeekday(date);
  const settings = await getOrCreateSettings(req.user._id);

  // Check if date is a declared holiday
  const holiday = await Holiday.findOne({ userId: req.user._id, date });

  // Get scheduled timetable slots effective on this date
  let slots = await TimetableSlot.find({
    userId: req.user._id,
    weekday,
    effectiveFrom: { $lte: date },
    $or: [{ effectiveTo: null }, { effectiveTo: { $gte: date } }],
    subjectId: { $ne: null },
  })
    .populate("subjectId", "name code color minPercent openingAttended openingConducted shortName defaultRoom teacher")
    .sort({ slotIndex: 1 });

  // Intelligent Fallback: If no slots match for past dates (e.g. user added timetable later than semester start date),
  // fallback to active slots (effectiveTo: null) so user can view & mark past dates seamlessly!
  if (slots.length === 0) {
    slots = await TimetableSlot.find({
      userId: req.user._id,
      weekday,
      effectiveTo: null,
      subjectId: { $ne: null },
    })
      .populate("subjectId", "name code color minPercent openingAttended openingConducted shortName defaultRoom teacher")
      .sort({ slotIndex: 1 });
  }

  // Get all attendance entries recorded for this date
  const existingEntries = await AttendanceEntry.find({
    userId: req.user._id,
    date,
  }).populate("subjectId", "name code color minPercent openingAttended openingConducted shortName defaultRoom teacher");

  // Fetch all user's subjects to compute live bunk badges
  const allSubjects = await AttendanceSubject.find({
    userId: req.user._id,
    archivedAt: null,
  });

  // Calculate live stats per subject with ONE batched entries query (eliminates N+1)
  const allUserEntries = await AttendanceEntry.find({ userId: req.user._id });
  const entryCountMap = new Map();
  for (const e of allUserEntries) {
    const sId = String(e.subjectId);
    if (!entryCountMap.has(sId)) entryCountMap.set(sId, { p: 0, a: 0, c: 0 });
    const cnt = entryCountMap.get(sId);
    if (e.status === "present") cnt.p++;
    else if (e.status === "absent") cnt.a++;
    else if (e.status === "cancelled") cnt.c++;
  }

  const subjectStatsMap = new Map();
  for (const subj of allSubjects) {
    const cnt = entryCountMap.get(String(subj._id)) || { p: 0, a: 0, c: 0 };
    const stats = calculateSubjectStats({
      openingAttended: subj.openingAttended,
      openingConducted: subj.openingConducted,
      presentCount: cnt.p,
      absentCount: cnt.a,
      cancelledCount: cnt.c,
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

  const source = req.body.source || (slotId ? "scheduled" : "extra");

  // Calendar validation (F14): Cannot mark scheduled attendance on a declared holiday
  const holiday = await Holiday.findOne({ userId: req.user._id, date });
  if (holiday && source === "scheduled" && status !== "cancelled") {
    throw new ApiError(
      422,
      `Cannot mark scheduled attendance on "${holiday.label}" (${date}). If an extra class was held, mark as 'Extra Class'.`
    );
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
    entry.source = source;
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
      source,
    });
  }

  return res.status(200).json(
    new ApiResponse(200, { entry }, `Marked as ${status}`)
  );
});

export const bulkMarkDayPresent = asyncHandler(async (req, res) => {
  const { date } = req.params;

  // Calendar validation: Cannot bulk mark on declared holiday
  const holiday = await Holiday.findOne({ userId: req.user._id, date });
  if (holiday) {
    throw new ApiError(
      422,
      `Cannot bulk mark attendance on declared holiday "${holiday.label}" (${date}).`
    );
  }

  const weekday = getWeekday(date);

  let slots = await TimetableSlot.find({
    userId: req.user._id,
    weekday,
    effectiveFrom: { $lte: date },
    $or: [{ effectiveTo: null }, { effectiveTo: { $gte: date } }],
    subjectId: { $ne: null },
  });

  if (slots.length === 0) {
    slots = await TimetableSlot.find({
      userId: req.user._id,
      weekday,
      effectiveTo: null,
      subjectId: { $ne: null },
    });
  }

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
  let slots = await TimetableSlot.find({
    userId: req.user._id,
    weekday,
    effectiveFrom: { $lte: date },
    $or: [{ effectiveTo: null }, { effectiveTo: { $gte: date } }],
    subjectId: { $ne: null },
  });

  if (slots.length === 0) {
    slots = await TimetableSlot.find({
      userId: req.user._id,
      weekday,
      effectiveTo: null,
      subjectId: { $ne: null },
    });
  }

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

export const clearDayAttendanceMarks = asyncHandler(async (req, res) => {
  const { date } = req.params;

  const result = await AttendanceEntry.deleteMany({
    userId: req.user._id,
    date,
  });

  await Holiday.deleteMany({
    userId: req.user._id,
    date,
  });

  return res.status(200).json(
    new ApiResponse(
      200,
      { deletedCount: result.deletedCount },
      `Cleared all attendance marks and holiday status for ${date}`
    )
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
  const today = req.query.today || toDateString();
  const yesterday = addDays(today, -1);

  // We look between semester.startDate and yesterday
  const startDate = semester.startDate > yesterday ? yesterday : semester.startDate;

  const holidays = await Holiday.find({
    userId: req.user._id,
    date: { $gte: startDate, $lte: yesterday },
  });
  const holidayDates = new Set(holidays.map((h) => h.date));

  // Batch query all slots and entries in range (eliminates N+1 loop)
  const allSlots = await TimetableSlot.find({
    userId: req.user._id,
    subjectId: { $ne: null },
  });

  const allEntriesInRange = await AttendanceEntry.find({
    userId: req.user._id,
    date: { $gte: startDate, $lte: yesterday },
  });

  const markedSlotsByDate = new Map();
  for (const entry of allEntriesInRange) {
    if (!markedSlotsByDate.has(entry.date)) {
      markedSlotsByDate.set(entry.date, new Set());
    }
    if (entry.slotId) {
      markedSlotsByDate.get(entry.date).add(String(entry.slotId));
    }
  }

  const pendingDaysList = [];
  let currentDate = startDate;

  while (currentDate <= yesterday) {
    if (!holidayDates.has(currentDate)) {
      const weekday = getWeekday(currentDate);

      // Filter slots active on this day in memory
      let scheduledSlots = allSlots.filter((slot) => {
        if (slot.weekday !== weekday) return false;
        if (slot.effectiveFrom && slot.effectiveFrom > currentDate) return false;
        if (slot.effectiveTo && slot.effectiveTo < currentDate) return false;
        return true;
      });

      // Intelligent Fallback: If no slots match for past dates, fallback to active slots (effectiveTo: null)
      if (scheduledSlots.length === 0) {
        scheduledSlots = allSlots.filter((slot) => {
          if (slot.weekday !== weekday) return false;
          if (slot.effectiveTo !== null && slot.effectiveTo !== undefined) return false;
          return true;
        });
      }

      if (scheduledSlots.length > 0) {
        const markedSet = markedSlotsByDate.get(currentDate) || new Set();
        const unmarkedCount = scheduledSlots.filter(
          (s) => !markedSet.has(String(s._id))
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

      let slots = await TimetableSlot.find({
        userId: req.user._id,
        weekday,
        effectiveFrom: { $lte: currentDate },
        $or: [{ effectiveTo: null }, { effectiveTo: { $gte: currentDate } }],
        subjectId: { $ne: null },
      }).populate("subjectId", "name code color shortName defaultRoom teacher");

      // Intelligent Fallback: If no slots match for past dates (e.g. user added timetable later than semester start date),
      // fallback to active slots (effectiveTo: null) so backfill can generate past sessions seamlessly!
      if (slots.length === 0) {
        slots = await TimetableSlot.find({
          userId: req.user._id,
          weekday,
          effectiveTo: null,
          subjectId: { $ne: null },
        }).populate("subjectId", "name code color shortName defaultRoom teacher");
      }

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
  const today = req.query.today || toDateString();
  const tomorrow = addDays(today, 1);
  const endDate = semester.endDate || addDays(today, 60);

  const subjects = await AttendanceSubject.find({
    userId: req.user._id,
    archivedAt: null,
  }).sort({ name: 1 });

  // 1. Fetch holidays
  const holidays = await Holiday.find({
    userId: req.user._id,
    date: { $gte: tomorrow, $lte: endDate },
  });
  const holidayMap = new Map(holidays.map((h) => [h.date, h]));

  // 2. Fetch all slots once
  const slots = await TimetableSlot.find({
    userId: req.user._id,
    subjectId: { $ne: null },
  });

  // 3. Count remaining sessions via CalendarEngine (zero per-day DB queries)
  const remainingCounts = countRemainingSessionsBySubject(tomorrow, endDate, {
    semester,
    holidayMap,
    slots,
  });

  // 4. Batch query all attendance entries once (eliminates N+1 loop)
  const allEntries = await AttendanceEntry.find({ userId: req.user._id });
  const entryCountMap = new Map();
  for (const e of allEntries) {
    const sId = String(e.subjectId);
    if (!entryCountMap.has(sId)) entryCountMap.set(sId, { p: 0, a: 0 });
    const cnt = entryCountMap.get(sId);
    if (e.status === "present") cnt.p++;
    else if (e.status === "absent") cnt.a++;
  }

  // Calculate forecast metrics per subject
  const forecasts = subjects.map((subj) => {
    const sId = String(subj._id);
    const cnt = entryCountMap.get(sId) || { p: 0, a: 0 };
    const attended = subj.openingAttended + cnt.p;
    const conducted = subj.openingConducted + cnt.p + cnt.a;
    const remaining = remainingCounts.get(sId) || 0;

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
  });

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
  const holiday = await Holiday.findOne({ _id: id, userId: req.user._id });
  if (holiday) {
    // If sessions were auto-cancelled by markDayHoliday with notes 'Holiday: ...',
    // remove the cancelled mark so removing a holiday restores original schedule state (Invariant I3)
    await AttendanceEntry.deleteMany({
      userId: req.user._id,
      date: holiday.date,
      status: "cancelled",
      notes: { $regex: /Holiday/i },
    });
    await Holiday.deleteOne({ _id: id, userId: req.user._id });
  }
  return res.status(200).json(
    new ApiResponse(200, { deleted: true }, "Holiday removed and schedule restored")
  );
});

export const clearAllHolidays = asyncHandler(async (req, res) => {
  const result = await Holiday.deleteMany({ userId: req.user._id });
  return res.status(200).json(
    new ApiResponse(200, { deletedCount: result.deletedCount }, "All holidays cleared")
  );
});

export const autoPopulateHolidays = asyncHandler(async (req, res) => {
  const currentYear = new Date().getFullYear();
  const year = Number(req.body.year) || currentYear;

  // Fixed-date national public holidays only (WP4 / Rule 3: Never hardcode lunar/variable festivals)
  const standardHolidays = [
    { date: `${year}-01-26`, label: "Republic Day" },
    { date: `${year}-08-15`, label: "Independence Day" },
    { date: `${year}-10-02`, label: "Mahatma Gandhi Jayanti" },
    { date: `${year}-12-25`, label: "Christmas" },
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
      `Added ${addedCount} national fixed-date public holidays. For university-specific circulars, upload your circular notice.`
    )
  );
});

export const getSyncReport = asyncHandler(async (req, res) => {
  const semester = await getOrCreateSemester(req.user._id);
  const settings = await getOrCreateSettings(req.user._id);
  const today = req.query.today || toDateString();

  const semStart = semester?.startDate || null;
  const semEnd = semester?.endDate || null;

  const holidays = await Holiday.find({ userId: req.user._id }).sort({ date: 1 });
  const holidayMap = new Map(holidays.map((h) => [h.date, h]));

  const slots = await TimetableSlot.find({
    userId: req.user._id,
    subjectId: { $ne: null },
  });

  const subjects = await AttendanceSubject.find({
    userId: req.user._id,
    archivedAt: null,
  }).sort({ name: 1 });

  const allEntries = await AttendanceEntry.find({ userId: req.user._id });
  const entryCountMap = new Map();
  for (const e of allEntries) {
    const sId = String(e.subjectId);
    if (!entryCountMap.has(sId)) entryCountMap.set(sId, { p: 0, a: 0 });
    const cnt = entryCountMap.get(sId);
    if (e.status === "present") cnt.p++;
    else if (e.status === "absent") cnt.a++;
  }

  // Evaluate semester calendar
  let totalCalendarDays = 0;
  let totalTeachingDays = 0;
  let totalWeekendDays = 0;
  let totalHolidayDays = 0;

  if (semStart && semEnd && semStart <= semEnd) {
    const dayInfos = evaluateDateRange(semStart, semEnd, {
      semester,
      holidayMap,
      slots,
    });
    totalCalendarDays = dayInfos.length;
    for (const d of dayInfos) {
      if (d.type === "teaching") totalTeachingDays++;
      else if (d.type === "weekend") totalWeekendDays++;
      else if (d.type === "holiday") totalHolidayDays++;
    }
  }

  // Count remaining sessions from tomorrow
  const tomorrow = addDays(today, 1);
  const remainingCounts = (semStart && semEnd && tomorrow <= semEnd)
    ? countRemainingSessionsBySubject(tomorrow, semEnd, { semester, holidayMap, slots })
    : new Map();

  const perSubject = subjects.map((subj) => {
    const sId = String(subj._id);
    const cnt = entryCountMap.get(sId) || { p: 0, a: 0 };
    const attended = subj.openingAttended + cnt.p;
    const conducted = subj.openingConducted + cnt.p + cnt.a;
    const remaining = remainingCounts.get(sId) || 0;
    const weeklySlots = slots.filter((s) => String(s.subjectId) === sId).length;

    const forecast = calculateSemesterForecast({
      attended,
      conducted,
      remaining,
      minPercent: subj.minPercent,
      safetyMargin: settings.safetyMargin,
    });

    return {
      subjectId: sId,
      name: subj.name,
      code: subj.code,
      color: subj.color,
      weeklySlots,
      attended,
      conducted,
      sessionsLeft: remaining,
      currentPct: conducted > 0 ? Math.round((attended / conducted) * 100) : 100,
      target: subj.minPercent,
      ...forecast,
    };
  });

  const conflicts = [];
  if (!semStart) {
    conflicts.push({
      type: "semester_not_set",
      severity: "error",
      message: "Semester start date is not configured.",
    });
  }
  if (slots.length === 0) {
    conflicts.push({
      type: "timetable_empty",
      severity: "warning",
      message: "No timetable slots found.",
    });
  }

  // Conflicts on holidays on weekends
  for (const h of holidays) {
    const wd = weekdayOf(h.date);
    if (wd === 0 || (wd === 6 && !slots.some((s) => s.weekday === 6))) {
      conflicts.push({
        type: "holiday_on_weekend",
        severity: "info",
        message: `"${h.label}" falls on a ${wd === 0 ? "Sunday" : "Saturday"} — no weekday class impact.`,
        date: h.date,
        label: h.label,
      });
    }
  }

  let syncScore = 0;
  if (semStart) syncScore += 30;
  if (semEnd) syncScore += 15;
  if (slots.length > 0) syncScore += 25;
  if (subjects.length > 0) syncScore += 15;
  if (holidays.length > 0) syncScore += 15;

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        semester,
        calendarSummary: {
          totalCalendarDays,
          teachingDays: totalTeachingDays,
          holidaysCount: totalHolidayDays,
          weekendDays: totalWeekendDays,
        },
        perSubject,
        conflicts,
        syncScore,
      },
      "Sync report generated"
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
    .populate("subjectId", "name code shortName")
    .sort({ date: -1 });
  const slots = await TimetableSlot.find({ userId: req.user._id })
    .populate("subjectId", "name code shortName");

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
