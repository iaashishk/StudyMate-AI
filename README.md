# StudyMate AI 📚 (v2.1)

> A production-grade, AI-powered academic curriculum, attendance, lab code, and study planner for university students — engineered with React 19, TypeScript, Node.js, Express, MongoDB Atlas, and a pedagogical prerequisite scheduling engine.

**Live Application:** [study-mate-ai-wheat-seven.vercel.app](https://study-mate-ai-wheat-seven.vercel.app/) | **API Service:** [studymate-ai-me50.onrender.com](https://studymate-ai-me50.onrender.com)

![StudyMate AI v2.1](https://img.shields.io/badge/Version-2.1.0--Release-blue?style=flat-square) ![React](https://img.shields.io/badge/React-19-blue?logo=react&style=flat-square) ![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue?logo=typescript&style=flat-square) ![Node.js](https://img.shields.io/badge/Node.js-Express_5-green?logo=nodedotjs&style=flat-square) ![MongoDB](https://img.shields.io/badge/MongoDB-Atlas_Mongoose_9-green?logo=mongodb&style=flat-square) ![Vite](https://img.shields.io/badge/Vite-6.4-purple?logo=vite&style=flat-square)

---

## 🚀 What's New in v2.1 Update

StudyMate AI v2.1 introduces major academic companion workspaces to help university students manage assignments, lab practicals, attendance, and exam prep in one unified dashboard:

### 1. 📝 Academic Assignments Hub (`/assignments`)
- **Dictate or Upload**: Enter questions dictated by professors in class or upload assignment sheet PDFs/images.
- **AI Professor Solutions**: 1-click **"Solve with AI"** generates textbook-grade answers structured with formal definitions, theoretical frameworks, operational mechanics, and high-yield exam takeaways.
- **Soft Copy Reader Mode**: Formats answers into clean, read-only documents for exam cramming or copying into register sheets.
- **Active Recall Self-Test Mode**: Blurs the answers so students can practice recall before revealing solutions.
- **"Copy for Register"**: 1-click plain text copy that automatically strips markdown symbols, code wrappers, and asterisks for direct handwriting into physical assignment sheets.
- **Inline Question Editing & Re-Solving**: Modify question text and marks (2M, 5M, 10M, 16M) anytime, with an instant **"Save & Re-Solve with AI"** action.
- **Inline Solution Editing**: Fine-tune solutions with personal professor tips or lecture notes.

### 2. 💻 Practical Lab Codes & Manual Hub (`/lab-codes`)
- **Multi-Language Support**: Supports `C++`, `C`, `Python`, `Java`, `SQL`, `JavaScript`, and `Bash`.
- **AI Solution Derivation**: Derives self-contained, compilable code, step-by-step algorithms, sample console inputs, expected outputs, and time/space complexity analysis ($O(\log n)$, $O(n \log n)$, $O(1)$).
- **Oral Viva-Voce Practice Suite**: Generates examination viva questions and answers with an interactive **Viva Quiz Mode** (hidden answers with tap-to-reveal for self-testing).
- **Lab Manual Record Sheet**: Complete soft copy ready to print or submit for lab manual records.
- **Experiment Edit & Re-Derive**: Edit experiment numbers, titles, aims, target languages, or teacher prompts, with 1-click **"Save & Re-Derive with AI"**.

### 3. 📅 Smart Attendance & Timetable Manager (`/attendance`)
- **75% Attendance Safeguard**: Live tracking with predictive safety metrics (*"You can safely bunk X more sessions"* or *"You must attend the next Y classes to reach 75%"*).
- **Weekly Schedule & Quick Toggles**: Mark daily lectures and labs in 1 click across 4 statuses: **Present**, **Absent**, **Bunked**, or **Cancelled**.
- **Timetable OCR/Document Parser**: Upload a timetable image or PDF to auto-populate weekly slots.
- **Academic Holiday Calendar Parser**: Upload academic calendar PDFs or images to auto-exclude university holidays and semester breaks.

### 4. ⚡ Dynamic Schedule Synchronization (Day-Off & Revision Sync)
- **"Take Day Off" Button**: Postpones today's study agenda and shifts the study plan forward seamlessly without losing past completion history.
- **"Revise Today" Sync**: Instantly switches today's agenda into an active recall review session and synchronizes the plan forward.
- **Prerequisite Topic Flow Guard**: Guarantees topics within each subject follow a strict pedagogical flow (Unit 1 before Unit 2, related conceptual progression) without disconnected topic jumping.

### 5. 🧠 Dual AI Engine (Gemini 1.5 Flash + Encyclopedic Fallback)
- **Google Gemini 1.5 Flash Integration**: Optional live API connection via `GEMINI_API_KEY` for dynamic answers to arbitrary university questions.
- **Deep Offline CS Knowledge Base**: Built-in comprehensive answers for core computer science domains (Java, Python, C++, OOP 4 Pillars, JIT Compiler & JVM Execution Engine, Garbage Collection, DBMS/SQL, Computer Networks, Operating Systems, Data Structures & Algorithms).
- **Universal Math & Pipeline Formatter**: Renders architectural flow diagrams, system execution pipelines, and mathematical proofs cleanly in Unicode and interactive flow cards without raw unparsed LaTeX.

---

## Core Features

- 🔐 **JWT Authentication** — Signup, login, secure token refresh with HTTP-only cookies
- 📚 **Subject & Topic Tracker** — Add subjects with exam dates, topics with confidence ratings (1–5), and estimated study hours
- 🤖 **Pedagogical AI Scoring Engine** — Generates a personalized daily study plan using:
  ```
  Priority Score = Urgency × (6 − Confidence) × Unit Factor × Topic Weight
  ```
- 📅 **Day-by-Day Adaptive Plan** — Mark tasks done, missed, or revised; missed tasks auto-reschedule
- 📊 **Analytics Dashboard** — Completion %, streak tracker, 14-day history chart, subject time breakdown
- 💡 **AI Insights** — Plain-language explanation of why each topic is prioritized
- 🎨 **Polished Dark Glassmorphism UI** — Framer Motion page transitions, split-screen auth, skeleton loading, and toast notifications
- 📱 **Mobile-First Responsive** — Optimized for mobile phones (360px+) and desktop monitors

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, TypeScript (Strict), Vite 6, Tailwind CSS v4 |
| **Routing & Code-Splitting** | React Router v7 with route-level `React.lazy` + `Suspense` |
| **Animations** | Framer Motion (page transitions, roadmaps, modals) |
| **Icons** | Lucide React |
| **Forms & Validation** | React Hook Form + Zod v3 |
| **Data Visualization** | Recharts v3 |
| **Backend API** | Node.js, Express 5 |
| **Database** | MongoDB Atlas, Mongoose v9 |
| **AI Engine** | Google Gemini 1.5 Flash + Built-in Academic Synthesizer Engine |
| **Document OCR** | Tesseract.js / pdfjs-dist file extractor |
| **Authentication** | JWT (Access + Refresh tokens with HTTP-only cookies), bcrypt |
| **Deployment** | Vercel (Frontend SPA) + Render (Backend Web Service) |

---

## The Cognitive AI Algorithm

Each pending topic receives a real-time **Pedagogical Priority Score**:

$$\text{Priority Score} = \text{Urgency} \times (6 - \text{Confidence}) \times \text{Unit Factor} \times \text{Topic Weight}$$

Where:
- $\text{Urgency} = \frac{1}{\max(\text{daysUntilExam}, 1)}$ — Closer exams generate higher urgency.
- $\text{Confidence} = 1 \dots 5$ — Lower student confidence yields a higher priority multiplier ($6 - \text{confidence}$).
- $\text{Unit Factor} = \frac{1}{\text{unitNumber}}$ — Enforces foundational prerequisite progression (Unit 1 scheduled before Unit 4).
- $\text{Topic Weight} = \frac{\text{estimatedMinutes}}{\text{totalSubjectMinutes}}$.

---

## Project Structure

```
StudyMate-AI/
├── server/                      # Express 5 API
│   ├── src/
│   │   ├── controllers/         # Auth, Subject, Plan, Assignment, LabCode, Attendance
│   │   ├── models/              # User, Subject, StudyPlan, Assignment, LabCode, Attendance
│   │   ├── routes/              # RESTful API routes
│   │   ├── middlewares/         # JWT auth, express-validator, CORS regex
│   │   ├── services/
│   │   │   ├── study-planner.js    # ← Pedagogical AI Engine
│   │   │   └── academic-ai.service.js # ← Gemini & Academic Synthesizer
│   │   └── utils/               # ApiError, ApiResponse, asyncHandler, attendance-calculator.js
│   └── package.json
└── client/                      # React 19 SPA (Vite)
    ├── src/
    │   ├── pages/               # Lazy-loaded route views
    │   │   ├── auth/            # Login, Signup (Split-screen)
    │   │   ├── DashboardPage    # Focus Ring, Daily Agenda, Day-Off / Revise sync
    │   │   ├── SubjectsPage     # Folder Explorer & Grid views
    │   │   ├── SubjectDetailPage# Curriculum checklist, Vault, Cloud Notes
    │   │   ├── StudyPlanPage    # Day-by-Day schedule & Mountain Roadmap
    │   │   ├── AssignmentsPage  # Academic Assignments Hub & Soft Copy Reader
    │   │   ├── LabCodesPage     # Practical Lab Codes, Derivations & Viva Suite
    │   │   ├── AttendancePage   # Timetable, Calendar Parser & 75% Tracker
    │   │   ├── NotesPage        # Centralized Cloud Notes Vault
    │   │   ├── InsightsPage     # Pedagogical AI explanations
    │   │   └── AnalyticsPage    # Recharts metrics
    │   ├── components/          # Reusable UI components
    │   │   ├── AcademicAnswerCard.tsx # Exam answer renderer with TeX & Active Recall
    │   │   ├── CurriculumFolderTree.tsx # Degree -> Semester -> Subject -> Unit explorer
    │   │   ├── LearningRoadmap.tsx    # Mountain Expedition Quest Trail
    │   │   └── InlineDocViewerModal.tsx# On-Site Drive/PDF viewer
    │   ├── context/             # AuthContext, ToastContext, ConfirmContext, ThemeContext
    │   └── lib/                 # academic-api.ts, attendance-api.ts, file-extractor.ts
    └── package.json
```

---

## Running Locally

### Prerequisites
- Node.js 18+
- MongoDB instance (Local or [MongoDB Atlas](https://cloud.mongodb.com))
- *(Optional)* Free Google Gemini API Key from [Google AI Studio](https://aistudio.google.com/app/apikey)

### 1. Clone & Setup
```bash
git clone https://github.com/iaashishk/StudyMate-AI.git
cd StudyMate-AI
```

### 2. Configure Server Environment
Create `server/.env`:
```env
PORT=5000
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.xxx.mongodb.net/studymate-ai
ACCESS_TOKEN_SECRET=your_access_token_secret_here
REFRESH_TOKEN_SECRET=your_refresh_token_secret_here
CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173

# Optional: Add your free Google Gemini API Key for live AI answers
GEMINI_API_KEY=your_gemini_api_key_here
```

### 3. Start Backend
```bash
cd server
npm install
npm run dev
# → API running on http://localhost:5000
```

### 4. Start Frontend
```bash
cd ../client
npm install
npm run dev
# → Client running on http://localhost:5173
```

---

## Deployment

| Service | Platform | Root Directory | Configuration |
|---|---|---|---|
| **Frontend** | **Vercel** | `client/` | `VITE_API_URL=https://studymate-ai-me50.onrender.com/api` |
| **Backend** | **Render** | `server/` | Build: `npm install`, Start: `node src/index.js` |
| **Database** | **MongoDB Atlas** | — | M0 Free Tier with network access enabled |

---

## Author

**Aashish Kumar** — MCA Student (AI/ML)  
[GitHub](https://github.com/iaashishk) • [LinkedIn](https://www.linkedin.com/in/aashish-k-b53778261/)
