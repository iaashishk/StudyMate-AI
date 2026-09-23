# StudyMate AI 📚

> A full-stack AI-powered study planner for students — built with React, Node.js, Express, MongoDB, and a custom scoring algorithm.

**Live Demo:** [https://study-mate-ai-wheat-seven.vercel.app/] (#) &nbsp;|&nbsp; **API:** [https://studymate-ai-me50.onrender.com](#)

![StudyMate AI](https://img.shields.io/badge/React-19-blue?logo=react) ![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue?logo=typescript) ![Node.js](https://img.shields.io/badge/Node.js-Express_5-green?logo=nodedotjs) ![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose_9-green?logo=mongodb)

---

## What It Does

StudyMate AI helps students manage multiple subjects and upcoming exams by generating a personalised, day-by-day study schedule — automatically prioritising the topics you're least confident about and the exams closest to you.

### Key Features

- 🔐 **JWT Authentication** — signup, login, secure token refresh with HTTP-only cookies
- 📚 **Subject & Topic Tracker** — add subjects with exam dates, topics with confidence ratings (1–5) and estimated time
- 🤖 **AI Scoring Algorithm** — generates a prioritised study plan using:
  ```
  Priority Score = urgency × (6 − confidence) × topicWeight
  ```
  where urgency = 1 / days until exam
- 📅 **Day-by-day Plan View** — mark tasks done or missed; missed tasks auto-reschedule
- 📊 **Analytics Dashboard** — completion %, streak tracker, 14-day history chart, subject time breakdown
- 💡 **AI Insights** — plain-language explanation of why each topic is prioritised
- 🎨 **Polished UI** — Framer Motion animations, split-screen auth, skeleton loading, toast notifications
- 📱 **Responsive** — mobile-first with bottom tab navigation, works on 360px screens

---

## Screenshots

> _Add screenshots of the dashboard, subjects page, and study plan view here_

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Tailwind CSS v4, Vite |
| Routing | React Router v7 |
| Forms | React Hook Form + Zod validation |
| Charts | Recharts v3 |
| Animation | Framer Motion |
| Icons | Lucide React |
| Backend | Node.js, Express 5 |
| Database | MongoDB + Mongoose v9 |
| Auth | JWT (access + refresh tokens), bcrypt |
| Deployment | Vercel (frontend) + Render (backend) + MongoDB Atlas |

---

## Project Structure

```
StudyMate-AI/
├── server/                      # Express API
│   ├── src/
│   │   ├── controllers/         # Auth, Subject, Plan, Dashboard
│   │   ├── models/              # User, Subject, StudyPlan (Mongoose)
│   │   ├── routes/              # RESTful API routes
│   │   ├── middlewares/         # JWT auth, express-validator
│   │   ├── services/
│   │   │   └── study-planner.js # ← The AI scoring engine
│   │   └── utils/               # ApiError, ApiResponse, asyncHandler
│   └── package.json
└── client/                      # React SPA
    ├── src/
    │   ├── pages/               # 10 MVP screens
    │   │   ├── auth/            # Login, Signup (split-screen)
    │   │   ├── DashboardPage    # Hero ring + task list
    │   │   ├── SubjectsPage     # Subject cards + modals
    │   │   ├── StudyPlanPage    # Day-by-day schedule
    │   │   ├── InsightsPage     # AI priority explanations
    │   │   └── AnalyticsPage    # Recharts visualizations
    │   ├── components/          # NavRail, FocusRing, TaskItem, Modal, Toast
    │   ├── context/             # AuthContext, ToastContext
    │   └── lib/api.ts           # Axios + auto token refresh
    └── package.json
```

---

## The AI Algorithm

> This is the section interviewers will ask about. Memorise the formula and the reasoning.

Each pending topic gets a **priority score**:

```
score = urgency × (6 − confidence) × topicWeight

urgency     = 1 / max(daysUntilExam, 1)        # closer exam → higher urgency
confidence  = user-rated 1–5                    # lower confidence → more priority
topicWeight = topic.estimatedMinutes / totalSubjectMinutes
```

**What this means in practice:**
- A DBMS topic with exam in 3 days and confidence 1 → very high score → scheduled first
- An OS topic with exam in 30 days and confidence 5 → very low score → pushed later

Topics are sorted by score (highest first) and greedily assigned to calendar days within the user's daily hour budget. If a task is marked "missed", it's re-inserted into the earliest available future slot automatically.

**Why not use an LLM?** This algorithm is 100% offline, zero API cost, deterministic, and fully explainable. There's no black box — you can walk through the math for any topic and show exactly why it's scheduled where it is.

---

## Running Locally

### Prerequisites
- Node.js 18+
- A [MongoDB Atlas](https://cloud.mongodb.com) free cluster (M0 tier)

### 1. Clone
```bash
git clone https://github.com/yourusername/studymate-ai.git
cd studymate-ai
```

### 2. Configure environment
```bash
cp server/.env.example server/.env
```
Edit `server/.env`:
```env
MONGODB_URI=mongodb+srv://<user>:<password>@cluster0.xxx.mongodb.net/studymate-ai
ACCESS_TOKEN_SECRET=<generate: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))">
REFRESH_TOKEN_SECRET=<generate again with different value>
```

### 3. Backend
```bash
cd server && npm install && npm run dev
# → http://localhost:5000
```

### 4. Frontend
```bash
cd client && npm install && npm run dev
# → http://localhost:5173
```

Open **http://localhost:5173**, sign up, complete onboarding, generate your first plan.

---

## Deployment

| Service | Platform | Root Directory | Notes |
|---------|----------|---------------|-------|
| Frontend | **Vercel** | `client/` | Set `VITE_API_URL` env var |
| Backend | **Render** | `server/` | Set all `.env` vars, start command: `node src/index.js` |
| Database | **MongoDB Atlas** | — | Free M0 tier, whitelist `0.0.0.0/0` |

> After deploying both, update `CORS_ORIGIN` on Render to your Vercel URL.

---

## Design System

| Token | Hex | Usage |
|-------|-----|-------|
| `ink` | `#1B2140` | Dark surfaces, headings, nav |
| `fog` | `#EEF1F5` | Page background |
| `lamp` | `#E8A23C` | Primary accent (CTAs, focus ring) — used sparingly |
| `confidence` | `#5C8368` | Done/mastered states |
| `deadline` | `#B14B3A` | Urgent/overdue — used sparingly |
| `ink-60` | `#6B728E` | Secondary text, borders |

**Fonts:** Fraunces (display), IBM Plex Sans (body), IBM Plex Mono (numbers)

---

## Author

**Aashish Kumar** — MCA Student (AI/ML)  
[GitHub](https://github.com/iaashishk) · [LinkedIn](https://www.linkedin.com/in/aashish-k-b53778261/)

---

## License

This project is open source under the [MIT License](LICENSE).
