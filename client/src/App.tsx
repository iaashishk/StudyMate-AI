import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";

// Pages
import LoginPage from "./pages/auth/LoginPage";
import SignupPage from "./pages/auth/SignupPage";
import OnboardingPage from "./pages/OnboardingPage";
import DashboardPage from "./pages/DashboardPage";
import SubjectsPage from "./pages/SubjectsPage";
import SubjectDetailPage from "./pages/SubjectDetailPage";
import StudyPlanPage from "./pages/StudyPlanPage";
import InsightsPage from "./pages/InsightsPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import SettingsPage from "./pages/SettingsPage";
import NotesPage from "./pages/NotesPage";

// Layout
import AppLayout from "./components/AppLayout";

// ── Protected route wrapper ────────────────────────────────────────────────────
function ProtectedRoute() {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-fog">
        <div className="w-8 h-8 border-2 border-lamp border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" replace />;

  // Redirect to onboarding if not completed
  if (user && !user.onboardingComplete) {
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
}

// ── Auth-only route (no onboarding check, no layout) ──────────────────────────
function AuthOnlyRoute() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-fog">
        <div className="w-8 h-8 border-2 border-lamp border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Outlet />;
}

// ── Public route wrapper (redirect to dashboard if already logged in) ─────────
function PublicRoute() {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return null;
  if (isAuthenticated) return <Navigate to="/" replace />;
  return <Outlet />;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route element={<PublicRoute />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
          </Route>

          {/* Onboarding (auth required, but no layout yet) */}
          <Route element={<AuthOnlyRoute />}>
            <Route path="/onboarding" element={<OnboardingPage />} />
          </Route>

          {/* Protected — inside AppLayout (nav rail) */}
          <Route element={<ProtectedRoute />}>
            <Route element={<AppLayout />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/subjects" element={<SubjectsPage />} />
              <Route path="/subjects/:id" element={<SubjectDetailPage />} />
              <Route path="/notes" element={<NotesPage />} />
              <Route path="/plan" element={<StudyPlanPage />} />
              <Route path="/insights" element={<InsightsPage />} />
              <Route path="/analytics" element={<AnalyticsPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;

