import { asyncHandler } from "../utils/async-handler.js";
import { ApiResponse } from "../utils/api-response.js";
import { ApiError } from "../utils/api-error.js";

const SYSTEM_INSTRUCTION = `You are the StudyMate Guide inside StudyMate — an all-in-one college academic and attendance companion.
Your goal is to guide students on how to use every feature of StudyMate and answer academic or study questions concisely and accurately.

CRITICAL INSTRUCTIONS:
- NEVER mention "Gemini", "AI", "artificial intelligence", "Google", "model", or "bot".
- Speak directly, simply, and warmly as the in-app StudyMate guide.

Key StudyMate Modules & Workflows:
1. Homescreen / Today (Dashboard):
   - Shows the Daily Focus Ring, today's class schedule, quick attendance buttons, and quick actions.
   - Click "Start Focus Session" for a Pomodoro timer with ambient sounds.

2. Attendance Tracker & Bunk Manager (/attendance):
   - Tracks 75% university attendance requirement with safety margins.
   - "Can I Bunk?" indicator calculates whether skipping a class drops attendance below target.
   - Timetable Scanner: Click "Import Timetable" to upload timetable photos or PDFs. Automatically extracts days, times, faculty, room numbers, and practical lab batch splits (Batch 1/2 vs 2/2).
   - Multi-Hour Periods: Supports 1h, 2h, 3h, and 4h combined blocks (like 4-hour lab sessions).
   - Subjects Tab: Set opening attended and conducted numbers if joining mid-semester.
   - Backfill Tab: Bulk marks past attendance records across date ranges (e.g. August to October) with 1-click preview and undo.
   - Holiday Tracker: Automatically skips gazetted national holidays and circular notices.

3. Curriculum & Subjects (/subjects):
   - Manage subjects, add syllabus topics, and rate confidence (1 to 5 stars).
   - Set exam target dates to prioritize weak topics.

4. Smart Study Planner (/plan):
   - Generates daily study plans based on Urgency, Weakness (6 - Confidence), and Topic Weight.
   - Allows rebalancing when study sessions are missed.

5. Lab Codes Vault (/lab-codes):
   - Save lab programs with syntax highlighting, viva questions, and outputs.

6. Assignments (/assignments):
   - Track university submission deadlines and view comprehensive solutions.

7. Cloud Notes (/notes):
   - Clean markdown note-taking with search and tagging.

Guidelines:
- Keep responses concise, friendly, and structured (bullet points or short paragraphs).
- You can include markdown links like [Open Attendance](/attendance), [Go to Timetable](/attendance), [Study Planner](/plan), [Lab Codes](/lab-codes), [Curriculum](/subjects).
- Be polite, helpful, and encourage good study habits!`;

const FALLBACK_FAQS = [
  {
    keywords: ["timetable", "scan", "upload routine", "routine", "schedule", "parser", "camera"],
    reply: `📅 **How to scan your timetable:**\n\n1. Go to **[Attendance](/attendance)** and open the **Timetable** tab.\n2. Click the **"Import Timetable"** button.\n3. Drop your routine photo or document PDF.\n4. StudyMate will automatically extract periods, courses, faculty, and room numbers.\n5. Select your practical lab batch (*Batch 1/2* or *Batch 2/2*) if applicable, review courses, and click **Apply Timetable**!`
  },
  {
    keywords: ["bunk", "skip", "safe to skip", "can i bunk", "percentage", "75", "attendance rule"],
    reply: `🎯 **How "Can I Bunk?" works:**\n\n- StudyMate monitors your target percentage (default **75%**) plus an optional safety margin buffer.\n- On your **[Today's Schedule](/)** and **[Attendance](/attendance)** tabs, each class shows a live badge:\n  - 🟢 **Safe to skip**: Skipping keeps your attendance above the required target.\n  - 🔴 **Below limit**: Skipping drops you below the target, indicating you should attend!`
  },
  {
    keywords: ["backfill", "past attendance", "past record", "august", "mid semester", "history", "previous classes"],
    reply: `⏳ **How to backfill past attendance:**\n\n1. Go to **[Attendance](/attendance)** and click the **Backfill** tab.\n2. Select your date range (e.g., from semester start date to today).\n3. Choose your pattern (e.g., *Mark All Present*, *Mark All Absent*, or custom).\n4. Click **Preview** to review the affected sessions day-by-day.\n5. Click **Commit** — you can revert the entire batch anytime with 1-click **Undo**!`
  },
  {
    keywords: ["study plan", "plan", "revision", "smart plan", "pacing"],
    reply: `📚 **How the Study Plan works:**\n\n- The engine schedules topics based on:  \n  $$\\text{Priority} = \\text{Urgency} \\times (6 - \\text{Confidence}) \\times \\text{Weight}$$\n- To set up: go to **[Subjects](/subjects)**, rate your confidence (1-5 stars) on each topic, then open **[Smart Plan](/plan)** to generate an adaptive study roadmap!`
  },
  {
    keywords: ["lab", "code", "viva", "practical", "program"],
    reply: `💻 **How to use Lab Codes Vault:**\n\n- Open **[Lab Codes](/lab-codes)**.\n- Save your university lab practicals with syntax highlighting across Python, Java, C++, and C.\n- StudyMate can derive step-by-step algorithms, sample terminal outputs, and typical viva voce examination questions!`
  },
  {
    keywords: ["holiday", "circular", "off day", "vacation"],
    reply: `🏖️ **Holiday and Non-Working Day Tracking:**\n\n- National gazetted holidays (Republic Day, Independence Day, Gandhi Jayanti, Christmas) are automatically tracked.\n- In **[Attendance](/attendance)** under Settings, you can click **"Scan Circular"** to upload your university calendar notices, auto-cancelling classes on closed days!`
  }
];

function getLocalFallback(query) {
  const q = query.toLowerCase();
  for (const faq of FALLBACK_FAQS) {
    if (faq.keywords.some((k) => q.includes(k))) {
      return faq.reply;
    }
  }
  return `👋 Hi! I'm your **StudyMate Guide**.\n\nI can help you with:\n- 📅 [Scanning your Timetable](/attendance)\n- 🎯 [Tracking the 75% Rule & Bunking](/attendance)\n- ⏳ [Backfilling past attendance](/attendance)\n- 📚 [Generating Study Plans](/plan)\n- 💻 [Managing Lab Practical Codes](/lab-codes)\n\nWhat would you like assistance with today?`;
}

export const askHelpBot = asyncHandler(async (req, res) => {
  const { message, history = [] } = req.body;
  if (!message || !message.trim()) {
    throw new ApiError(400, "Message is required");
  }

  const userQuery = message.trim();
  const apiKey = process.env.GEMINI_API_KEY;

  if (apiKey) {
    const candidateModels = [
      "gemini-3.5-flash-lite",
      "gemini-3.1-flash-lite",
      "gemini-3.5-flash",
      "gemini-flash-latest",
    ];

    // Format chat history for Gemini
    const contents = [
      {
        role: "user",
        parts: [{ text: `System Context & Guidelines:\n${SYSTEM_INSTRUCTION}` }],
      },
      {
        role: "model",
        parts: [{ text: "Understood! I am StudyMate Bot, ready to assist with all features of StudyMate AI." }],
      },
    ];

    for (const h of history.slice(-6)) {
      if (h.text && (h.role === "user" || h.role === "model")) {
        contents.push({
          role: h.role,
          parts: [{ text: h.text }],
        });
      }
    }

    contents.push({
      role: "user",
      parts: [{ text: userQuery }],
    });

    for (const model of candidateModels) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents,
              generationConfig: {
                temperature: 0.3,
                maxOutputTokens: 1024,
              },
            }),
          }
        );

        if (response.ok) {
          const data = await response.json();
          const reply = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (reply && reply.trim().length > 0) {
            return res.status(200).json(
              new ApiResponse(
                200,
                { reply: reply.trim(), modelUsed: model },
                "Helpbot response generated"
              )
            );
          }
        }
      } catch (err) {
        console.warn(`Gemini model ${model} helpbot call failed:`, err.message);
      }
    }
  }

  // Graceful offline fallback
  const fallbackReply = getLocalFallback(userQuery);
  return res.status(200).json(
    new ApiResponse(
      200,
      { reply: fallbackReply, modelUsed: "Built-in StudyMate Knowledge Base" },
      "Fallback response provided"
    )
  );
});

