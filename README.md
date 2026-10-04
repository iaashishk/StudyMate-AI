# StudyMate AI 📚 (v2.2)

> A production-grade, AI-powered academic curriculum, attendance, lab code, and study planner for university students — engineered with React 19, TypeScript, Node.js, Express, MongoDB Atlas, and a pedagogical prerequisite scheduling engine.

**Live Application:** [study-mate-ai-wheat-seven.vercel.app](https://study-mate-ai-wheat-seven.vercel.app/) | **API Service:** [studymate-ai-me50.onrender.com](https://studymate-ai-me50.onrender.com)

![StudyMate AI v2.2](https://img.shields.io/badge/Version-2.2.0--Release-blue?style=flat-square) ![React](https://img.shields.io/badge/React-19-blue?logo=react&style=flat-square) ![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue?logo=typescript&style=flat-square) ![Node.js](https://img.shields.io/badge/Node.js-Express_5-green?logo=nodedotjs&style=flat-square) ![MongoDB](https://img.shields.io/badge/MongoDB-Atlas_Mongoose_9-green?logo=mongodb&style=flat-square) ![Vite](https://img.shields.io/badge/Vite-6.4-purple?logo=vite&style=flat-square)

---

## 🚀 What's New in v2.2 Update

StudyMate AI v2.2 introduces an end-to-end multimodal timetable scanner, atomic smart import with 1-click undo, mobile-first responsive polish, and an in-app companion guide:

### 1. 📅 Multimodal Smart Timetable Scanner (`/attendance`)
- **Direct Camera & PDF Parsing**: Upload routine photos (JPG, PNG) or circular PDFs directly. The vision pipeline reads periods, courses, faculty, and room numbers.
- **Batch Split Detection**: Automatically identifies practical lab batch splits (*Batch 1/2* vs *Batch 2/2*) and multi-hour laboratory blocks (up to 4-hour lab sessions).
- **Type-Aware Vocabulary Snapping**: Strict lab-versus-lecture normalization ensures lab practicals (e.g. *DBMS Lab*, *Java Lab*) are never conflated with lecture courses.
- **Atomic Import & 1-Click Undo**: Review detected courses and confidence ratings before saving. Undo any import batch atomically with a single tap.

### 2. ⏳ Mid-Semester Attendance Backfill Suite
- **Bulk Past Records Filling**: If joining mid-semester (e.g. classes started in August and it is now October), backfill your past attendance across date ranges.
- **Day-by-Day Preview & Undo**: Preview affected sessions before committing, with 1-click batch undo support to revert any backfill batch cleanly.
- **Opening Attendance Balances**: Set past attended and conducted class numbers on individual subjects without tedious manual logging.

### 3. 📱 Mobile-First Attendance & Layout Polish
- **Zero-Overflow Timetable View**: Responsive date pickers, subject filters, and a single-row swipeable weekday selector pill bar (`All Week`, `Mon`, `Tue`, `Wed`, `Thu`, `Fri`).
- **Clean Today Tab Actions**: Date navigation and action buttons (*Mark All Present*, *Holiday*, *Extra Class*) consolidated into a unified, non-congested toolbar.
- **Compact Subtab Navigation**: Mobile-optimized subtab labels (*Today*, *Brain*, *Subjects*, *Timetable*, *Holidays*, *Bunk Planner*, *Backfill*, *Reports*) with horizontal snap scrolling.

### 4. 🐼 In-App StudyMate Companion Guide
- **Homescreen Quick Help**: Floating companion button located on the homescreen with 1-tap guidance for navigating any feature.
- **Contextual In-App Navigation**: Clickable links in answers navigate directly to corresponding modules (*Timetable*, *Study Planner*, *Lab Codes*, *Curriculum Hub*).
- **Clean Non-Intrusive Design**: Minimalist dark UI styled with the official app symbol, free of distracting artificial filler.

---

## 📚 Core Features & Architecture

### 1. 📝 Academic Assignments Hub (`/assignments`)
- **Dictate or Upload**: Enter questions dictated by professors in class or upload assignment sheet PDFs/images.
- **Structured Academic Solutions**: Generates textbook-grade answers structured with formal definitions, theoretical frameworks, operational mechanics, and high-yield exam takeaways.
- **Soft Copy Reader Mode**: Formats answers into clean, read-only documents for exam cramming or copying into register sheets.
- **Active Recall Self-Test Mode**: Blurs answers so students can practice recall before revealing solutions.
- **"Copy for Register"**: 1-click plain text copy that automatically strips markdown symbols, code wrappers, and asterisks for direct handwriting into physical assignment sheets.

### 2. 💻 Practical Lab Codes & Manual Hub (`/lab-codes`)
- **Multi-Language Support**: Supports `C++`, `C`, `Python`, `Java`, `SQL`, `JavaScript`, and `Bash`.
- **Code & Viva Derivations**: Derives self-contained, compilable code, step-by-step algorithms, sample console inputs, expected outputs, and time/space complexity analysis ($O(\log n)$, $O(n \log n)$, $O(1)$).
- **Oral Viva-Voce Practice Suite**: Generates examination viva questions and answers with an interactive **Viva Quiz Mode** (hidden answers with tap-to-reveal for self-testing).
- **Lab Manual Record Sheet**: Complete soft copy ready to print or submit for lab manual records.

### 3. 🎯 75% Attendance Safeguard & Bunk Planner (`/attendance`)
- **75% Attendance Safeguard**: Live tracking with predictive safety metrics (*"You can safely bunk X more sessions"* or *"You must attend the next Y classes to reach 75%"*).
- **"Can I Bunk?" Indicator**: Live safety badges on daily sessions showing whether skipping a class keeps attendance above target.
- **Academic Holiday Tracker**: Auto-excludes university holidays, gazetted off-days, and semester circular breaks.

### 4. ⚡ Dynamic Schedule Synchronization & Pedagogical Engine (`/plan`)
- **Cognitive AI Algorithm**: Each pending topic receives a real-time **Pedagogical Priority Score**:
  $$\text{Priority Score} = \text{Urgency} \times (6 - \text{Confidence}) \times \text{Unit Factor} \times \text{Topic Weight}$$
- **"Take Day Off"**: Postpones today's study agenda and shifts the study plan forward seamlessly without losing past completion history.
- **"Revise Today"**: Instantly switches today's agenda into an active recall review session and synchronizes the plan forward.

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, TypeScript (Strict), Vite 6, Tailwind CSS v4 |
| **Routing & Code-Splitting** | React Router v7 with route-level `React.lazy` + `Suspense` |
| **Animations** | Framer Motion (page transitions, roadmaps, modals) |
| **Icons** | Lucide React |
| **Forms & Validation** | React Hook Form + Zod v3 |
| **Data Visualization** | Recharts v3 |
| **Backend API** | Node.js, Express 5 (50MB payload streaming) |
| **Database** | MongoDB Atlas, Mongoose v9 |
| **Multimodal Vision Engine** | Google Gemini Vision (high-availability cascade) + Academic Knowledge Synthesizer |
| **Document OCR** | Tesseract.js / pdfjs-dist file extractor |
| **Authentication** | JWT (Access + Refresh tokens with HTTP-only cookies), bcrypt |
| **Deployment** | Vercel (Frontend SPA) + Render (Backend Web Service) |

---

## 📁 Project Structure

```
StudyMate-AI/
├── server/                      # Express 5 API
│   ├── src/
│   │   ├── controllers/         # Auth, Subject, Plan, Assignment, LabCode, Attendance, HelpBot
│   │   ├── models/              # User, Subject, StudyPlan, Assignment, LabCode, Attendance, ImportJob
│   │   ├── routes/              # RESTful API routes (/attendance, /helpbot, /subjects, /plan, /labs)
│   │   ├── middlewares/         # JWT auth, express-validator, CORS regex
│   │   ├── services/
│   │   │   ├── study-planner.js    # ← Pedagogical AI Engine
│   │   │   └── academic-ai.service.js # ← Gemini & Academic Synthesizer
│   │   └── utils/               # ApiError, ApiResponse, asyncHandler, attendance-calculator.js
│   └── package.json
└── client/                      # React 19 SPA (Vite)
    ├── src/
    │   ├── pages/               # Lazy-loaded route views
    │   │   ├── DashboardPage    # Focus Ring, Daily Agenda, Companion Guide
    │   │   ├── AttendancePage   # Timetable, Calendar, 75% Tracker, Backfill Suite
    │   │   ├── SubjectsPage     # Folder Explorer & Grid views
    │   │   ├── SubjectDetailPage# Curriculum checklist, Vault, Cloud Notes
    │   │   ├── StudyPlanPage    # Day-by-Day schedule & Mountain Roadmap
    │   │   ├── AssignmentsPage  # Academic Assignments Hub & Soft Copy Reader
    │   │   ├── LabCodesPage     # Practical Lab Codes, Derivations & Viva Suite
    │   │   ├── NotesPage        # Centralized Cloud Notes Vault
    │   │   ├── InsightsPage     # Pedagogical AI explanations
    │   │   └── AnalyticsPage    # Recharts metrics
    │   ├── components/          # Reusable UI components
    │   │   ├── StudyMateHelpBot.tsx # Homescreen Companion Guide
    │   │   ├── TimetableParserModal.tsx # Multimodal Routine Scanner
    │   │   ├── AcademicAnswerCard.tsx # Exam answer renderer with TeX
    │   │   └── InlineDocViewerModal.tsx# On-Site Drive/PDF viewer
    │   ├── context/             # AuthContext, ToastContext, ConfirmContext, ThemeContext
    │   └── lib/                 # academic-api.ts, attendance-api.ts, timetable-parser.ts
    └── package.json
```

---

## 🏃 Running Locally

### Prerequisites
- Node.js 18+
- MongoDB instance (Local or [MongoDB Atlas](https://cloud.mongodb.com))
- *(Optional)* Google Gemini API Key from [Google AI Studio](https://aistudio.google.com/app/apikey)

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

# Optional: Add your Google Gemini API Key for live multimodal timetable vision & answers
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

## 🚢 Deployment

| Service | Platform | Root Directory | Configuration |
|---|---|---|---|
| **Frontend** | **Vercel** | `client/` | `VITE_API_URL=https://studymate-ai-me50.onrender.com/api` |
| **Backend** | **Render** | `server/` | Build: `npm install`, Start: `node src/index.js` |
| **Database** | **MongoDB Atlas** | — | M0 Free Tier with network access enabled |

---

## 👨‍💻 Author

**Aashish Kumar** — MCA Student (AI/ML)  
[GitHub](https://github.com/iaashishk) • [LinkedIn](https://www.linkedin.com/in/aashish-k-b53778261/)
