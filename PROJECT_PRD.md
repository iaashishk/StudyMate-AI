# StudyMate AI — Project PRD and AI Context

> A repository-grounded product and engineering brief for AI assistants working on StudyMate AI. It describes the current product and implementation, not a promise that every proposed future improvement is already built.

## 1. Product at a glance

**Product:** StudyMate AI  
**Category:** Academic planning and study companion for university students  
**Primary value:** Bring curriculum planning, adaptive study scheduling, attendance tracking, assignments, practical lab work, and learning progress into one student workspace.

StudyMate AI helps a student turn courses, topics, deadlines, confidence ratings, and available study time into an actionable study plan. It also provides purpose-built workspaces for assignments, programming labs, attendance, notes, and academic progress.

The app is a responsive, authenticated single-page application backed by a REST API and MongoDB. Its scheduling engine is explainable and rule-based; optional generative AI is used by academic answer/code-generation workflows when configured, with built-in fallback behavior in the academic AI service.

## 2. Product goals

1. Help students know what to study next and why.
2. Make a multi-course study workload practical through a day-by-day plan.
3. Make plans more personal by considering exam dates, topic confidence, estimated effort, curriculum order, and daily availability.
4. Make it easier to manage university-specific work (assignments, practicals, timetable, attendance, holidays) without leaving the app.
5. Show progress and risks clearly, particularly study consistency and attendance thresholds.
6. Provide useful core planning and academic assistance without requiring a configured external AI API key.

## 3. Users and needs

### Primary user

An individual university student managing one or more subjects, semester or certification tracks, exams, assignments, lab work, and attendance requirements.

### User needs

- Set up a study profile quickly and begin with a generated plan.
- Organize subjects, units, topics, resources, and personal notes.
- Prioritize weak or urgent topics while preserving sensible curriculum order.
- See and update daily tasks, recover from missed study sessions, and adjust the schedule.
- Record attendance against a weekly timetable and estimate whether future absences are safe.
- Prepare assignment answers and lab records, then review them actively.
- Understand progress and the reasons behind scheduling recommendations.

## 4. Product scope and current capabilities

### 4.1 Account, onboarding, and preferences

- Email/password signup and login.
- Authenticated routes are protected; unauthenticated users are redirected to login.
- New authenticated users who have not completed onboarding are routed to onboarding.
- Three-step onboarding: create a subject with a target/exam date, add topics with confidence and time estimates, then choose daily study hours.
- Completing onboarding saves preferences, generates the initial study plan, and opens the dashboard.
- Settings allow profile-name and daily-hours changes, logout, and account deletion.
- Authentication uses JWT access/refresh tokens; refresh tokens are stored in HTTP-only cookies. Passwords are hashed with bcrypt.

### 4.2 Subjects and curriculum

- Create and manage subjects/courses with degree/program, semester/track, target or exam date, category, and color.
- Organize subjects in track-filtered folder/tree or grid views.
- Manage topics with unit number/title, confidence rating from 1–5, estimated study minutes, completion state, and optional notes/resource query.
- Subject detail supports curriculum progress and a resource/notes area.
- Resources can represent Drive items, YouTube videos/playlists, PDFs, books, or general links.
- Notes can be categorized as study notes, syllabus, code, or general reference material.
- A centralized notes view supports search, subject/category filtering, and different arrangements.
- Syllabus/document text extraction is available in relevant upload flows; client dependencies include PDF.js and Tesseract.js.

### 4.3 Study planning and dashboard

- Generate a day-by-day plan from pending topics and available daily study hours.
- Plan entries include date, subject/topic, unit, estimate, status, priority score, entry type, XP reward, and a plain-language `whyLogic` explanation.
- Plan views include a roadmap and calendar mode, plus subject filtering.
- Students can mark plan entries done, missed, or revised where supported by the interface/API; remove entries or clear the plan.
- Missed work can be rescheduled. Dashboard actions include taking a day off and revising today's agenda; there is also a “pull next” study-plan action.
- The dashboard presents a daily agenda and study progress.
- Analytics include curriculum completion, current streak, today's completed-task count, recent history, and remaining study workload by subject.
- AI Schedule Insights explains deterministic topic-priority decisions.

#### Scheduling behavior (implementation reference)

The planner is algorithmic and transparent; do not describe it as a generative model. Its current service considers urgency, confidence, estimated effort, unit progression, topic order, subject interleaving, and a daily practice allocation. The README summarizes the score as:

```text
Priority = Urgency × (6 − Confidence) × Unit Factor × Topic Weight
Urgency = 1 / max(daysUntilExam, 1)
```

The implementation in `server/src/services/study-planner.js` also maintains topic order within units and allocates time between core study and practice. The exact formula/weights should be verified in that service before making behavioral changes; use the implementation as the source of truth if it differs from this summary.

### 4.4 Assignments workspace

- Create assignments linked to a subject, with unit, optional due date, and questions with marks.
- Import question text from supported PDF/image documents through client-side extraction; extracted text pre-fills the assignment form.
- Ask the academic AI service to solve one or more questions.
- Edit assignment questions and generated answers, and re-solve after edits.
- Read formatted solutions in a soft-copy/reader mode, use active-recall reveal behavior, and copy plain text for handwriting.
- Track assignment lifecycle using pending, in-progress, completed, and submitted statuses.

### 4.5 Practical labs workspace

- Create and manage subject-linked experiments with number, title, aim, language, and optional instructor prompt.
- Supported languages currently include C++, C, Python, Java, SQL, JavaScript, and Bash (model also permits `other`).
- Derive code and academic material such as algorithm, sample input/output, complexity, and viva questions through the lab AI workflow.
- Edit experiment details and re-derive generated material.
- Review/print a lab-record presentation and use viva questions in a hidden-answer quiz/reveal flow.

### 4.6 Attendance and timetable

Attendance is a substantial separate workspace, with tabs for Today, Academic Brain, Subjects & Bunks, Weekly Timetable, Holiday Calendar, Bunk Planner & Forecast, Back-fill, and Reports.

- Maintain attendance-specific subjects, per-subject minimum percentage (default 75%), opening attendance balances, and archive state.
- Create a weekly timetable with lectures, labs, and tutorials; timetable slots use effective dates and may support A/B week patterns.
- Mark daily sessions as present, absent, bunked, or cancelled; add extra sessions and mark holidays.
- Parse timetable and holiday calendar documents via the available AI-assisted flows.
- Configure semester dates, manage holidays, and auto-populate/parse holidays.
- Back-fill past attendance using preview/commit operations and undo a committed batch.
- View attendance stats, weekly reports, pending days, forecasts, and saved bunk plans.
- Import CSV and export attendance data.
- Attendance is modeled separately from the curriculum `Subject` model. Do not assume that creating a curriculum subject automatically creates an attendance subject unless the implementation explicitly synchronizes them.

### 4.7 AI and document processing

- The scheduling/insight engine is deterministic, local to the backend, and should explain its decisions.
- `server/src/services/academic-ai.service.js` can call Google Gemini when `GEMINI_API_KEY` is configured, and has a built-in academic synthesizer fallback.
- Assignment solving and lab derivation are the main AI-assisted academic workflows.
- AI output is editable study assistance, not guaranteed correct academic truth. Keep user review possible and avoid implying generated work has been verified.
- PDF/image extraction uses client-side libraries in the frontend. Verify actual extraction paths before changing upload handling or making data-retention claims.

## 5. Main user journeys

### First-time student

1. Sign up or log in.
2. Complete onboarding by creating a subject and target date.
3. Add curriculum topics, confidence ratings, and study-time estimates.
4. Set daily study hours.
5. Generate the first plan and land on the dashboard.
6. Work through the daily agenda, update task status, and monitor progress.

### Student adjusting study priorities

1. Add/edit subjects and topics, including target dates and confidence.
2. Regenerate or adjust the study plan.
3. Review the roadmap/calendar and transparent priority reasoning.
4. Mark work complete, reschedule missed work, or use day-off/revision actions.
5. Check analytics for completion, consistency, and workload.

### Assignment preparation

1. Select a subject and create an assignment.
2. Enter questions or extract them from an uploaded document.
3. Optionally generate answers with the academic AI workflow.
4. Edit questions/answers as needed.
5. Review in reader or recall mode and copy/print the final material.

### Attendance tracking

1. Configure semester dates and attendance subjects/thresholds.
2. Create or parse a timetable; add holiday dates/calendar data.
3. Record present/absent/bunked/cancelled sessions and resolve pending historical days.
4. Review subject-level safety, semester forecasts, bunk plans, and reports.

## 6. Information architecture and routes

| Route | Access | Purpose |
|---|---|---|
| `/login` | Public when logged out | Sign in |
| `/signup` | Public when logged out | Create account |
| `/onboarding` | Authenticated | Initial academic setup |
| `/` | Authenticated + onboarding complete | Dashboard and daily agenda |
| `/subjects` | Authenticated | Course/track organization |
| `/subjects/:id` | Authenticated | Subject detail and curriculum |
| `/notes` | Authenticated | Central notes/resource library |
| `/plan` | Authenticated | Generated plan and roadmap/calendar |
| `/attendance` | Authenticated | Attendance, timetable, forecasts, reports |
| `/assignments` | Authenticated | Assignment management and AI answers |
| `/lab-codes` | Authenticated | Lab experiments and generated solutions |
| `/insights` | Authenticated | Schedule-priority explanations |
| `/analytics` | Authenticated | Learning progress metrics |
| `/settings` | Authenticated | Profile and study preferences |

The client uses React Router with lazy-loaded page modules and a shared authenticated layout. Unknown routes redirect to `/`.

## 7. Architecture and technology

### Frontend

- React 19, TypeScript (strict), Vite 6, Tailwind CSS v4.
- React Router v7 with lazy-loaded route chunks.
- React Hook Form and Zod for form handling/validation.
- Framer Motion for transitions and interactive presentation.
- Recharts for analytics and Lucide React for icons.
- Axios-based API helpers and shared auth, theme, confirmation, and toast contexts.
- PDF.js/Tesseract.js for document text extraction.

### Backend

- Node.js, Express 5, ES modules.
- MongoDB with Mongoose 9.
- JWT, bcrypt, cookie-parser, CORS, express-validator.
- Controllers, routes, models, middleware, and service modules are separated under `server/src`.
- API errors use a shared Express error handler and JSON response shape.

### Persistence domains

- `User`: identity, password hash, daily study hours, onboarding state, refresh token.
- `Subject`: owner, academic track, date, topics, resources, and cloud notes.
- `StudyPlan`: owner, daily hours, generated plan entries and their statuses/reasoning.
- `Assignment`: owner, subject, due date, questions, marks, answers, and status.
- `LabCode`: owner, subject, experiment details, code, algorithm, I/O, complexity, viva, and status.
- Attendance domain: attendance subjects, effective-dated timetable slots, semester settings, holidays, sessions/marks, bunk plans and related history; see `server/src/models/attendance.model.js`.

User-owned records should remain scoped to the authenticated user. Follow existing controller/model patterns when adding fields, endpoints, or persistence.

### API route groups

The server mounts:

- `/api/auth`
- `/api/subjects`
- `/api/plan`
- `/api/dashboard`
- `/api/attendance`
- `/api/assignments`
- `/api/labs`
- `/api/health` and `/api/health/insights`

Attendance endpoints are JWT-protected and include timetable, day marking, parsing, back-fill, CSV import, forecasts/bunk plans, reports, settings, holidays, semester reset, and export operations. Consult `server/src/routes/` for exact methods, request shapes, and route behavior before implementation.

## 8. UX and design principles

- Dark-first visual style with glass-like surfaces, high-contrast text, blue accent color, and distinct semantic colors.
- Responsive layouts designed for mobile as well as desktop; the README states a mobile target from 360px.
- Use clear loading, empty, and error states; preserve user feedback via toasts and confirmation dialogs.
- Use accessible labels and meaningful button text/icons; do not rely on color alone for status.
- Keep important study reasoning visible and understandable.
- Preserve the existing component patterns and avoid introducing a second design system.

## 9. Non-functional expectations

- Authentication and all user-specific endpoints must be enforced on the server, not only hidden in the client.
- Validate incoming user input and preserve established API error-response conventions.
- Keep secrets (JWT secrets, database URI, Gemini key) in environment variables; never add secrets to source control.
- Keep document parsing and potentially slow AI calls responsive with loading/progress/error feedback.
- Ensure all persisted dates and attendance records behave consistently across local time zones; use existing civil-date utilities for calendar-only dates where appropriate.
- Keep planner recommendations explainable and deterministic unless a deliberate product change is requested.
- Preserve responsive behavior and route-level code splitting.

## 10. Current setup and deployment (from repository documentation)

Prerequisites documented in README:

- Node.js 18+
- Local MongoDB or MongoDB Atlas
- Optional Gemini API key

Local development runs separate Vite and Express processes:

- Client: `cd client && npm install && npm run dev` (default Vite URL: `http://localhost:5173`)
- Server: `cd server && npm install && npm run dev` (configure `server/.env`)

Server environment variables documented in README:

```env
PORT=5000
MONGODB_URI=<MongoDB connection string>
ACCESS_TOKEN_SECRET=<secret>
REFRESH_TOKEN_SECRET=<secret>
CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173
GEMINI_API_KEY=<optional>
```

README deployment topology: Vercel SPA frontend, Render backend, MongoDB Atlas database. Verify actual deployment configuration and environment variable names before changing deployment.

## 11. Product boundaries and open decisions

These are not established requirements unless a future task explicitly defines them:

- No documented roles, multi-user classroom, teacher/admin console, or institution-wide tenancy.
- No documented billing, subscriptions, or pricing tiers.
- No documented native mobile app; the product is a responsive web SPA.
- External Gemini availability is optional; do not assume it is configured in every deployment.
- AI-generated academic output is not documented as formally verified or plagiarism-safe.
- Do not invent guarantees about privacy, document retention, backups, uptime, or regulatory compliance beyond what the implementation/deployment can prove.
- A student’s attendance subject and curriculum subject are separate data concepts unless current code synchronizes them.
- Product behavior around reminders, notifications, integrations, and collaboration is not specified here.

When a task depends on one of these decisions, ask the product owner rather than silently inventing behavior.

## 12. Guidance for AI coding agents

1. Read the relevant current source files before changing behavior; this document is orientation, not a substitute for code.
2. Treat source code and tests as authoritative when they conflict with this summary or older README descriptions.
3. Keep changes focused and preserve existing patterns, API response shapes, authentication, and user ownership checks.
4. Avoid converting deterministic scheduling into LLM behavior unless explicitly asked.
5. Make any AI-generated content user-editable and retain clear loading, error, and fallback states.
6. Update this PRD when a meaningful product capability or architectural contract changes.
7. Run the smallest relevant build, lint, or test command after code changes. This document-only addition does not require a build.

## 13. Key repository references

- `README.md` — current feature overview, setup, and deployment notes.
- `client/src/App.tsx` — route and authentication/onboarding guards.
- `client/src/pages/` — primary user-facing product modules.
- `client/src/components/attendance/` — attendance workspace.
- `client/src/lib/` — API clients, date helpers, and document extraction.
- `server/src/app.js` and `server/src/routes/` — API setup and endpoint groups.
- `server/src/models/` — persistence schemas.
- `server/src/services/study-planner.js` — deterministic study planning engine.
- `server/src/services/academic-ai.service.js` — optional Gemini integration and built-in academic fallback.
