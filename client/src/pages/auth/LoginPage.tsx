import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { motion } from "framer-motion";
import {
  Eye,
  EyeOff,
  AlertCircle,
  Zap,
  Brain,
  BarChart2,
} from "lucide-react";

const schema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: z.string().min(1, "Password is required"),
});

type FormData = z.infer<typeof schema>;

const features = [
  { icon: Zap, label: "AI-powered prioritization" },
  { icon: Brain, label: "Adaptive scheduling" },
  { icon: BarChart2, label: "Progress analytics" },
];

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: FormData) => {
    setServerError("");
    try {
      await login(data.email, data.password);
      navigate("/");
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || "Invalid email or password.";
      setServerError(msg);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* ── Left branding panel (hidden on mobile) ── */}
      <div className="hidden md:flex md:w-[45%] lg:w-[42%] bg-ink flex-col justify-between p-10 lg:p-14">
        <div>
          {/* Logo */}
          <div className="flex items-center gap-3 mb-16">
            <div className="w-10 h-10 rounded-full bg-lamp" />
            <span className="font-display text-xl text-white font-semibold tracking-tight">
              StudyMate AI
            </span>
          </div>

          {/* Tagline */}
          <h2 className="font-display text-3xl lg:text-4xl text-white/90 italic leading-snug mb-12">
            Plan smarter.
            <br />
            Study better.
          </h2>

          {/* Feature bullets */}
          <ul className="space-y-5">
            {features.map(({ icon: Icon, label }) => (
              <li key={label} className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-white/10 flex items-center justify-center">
                  <Icon className="w-[18px] h-[18px] text-lamp" />
                </div>
                <span className="font-body text-sm text-white/75">{label}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="font-body text-xs text-white/40">
          Built with ❤️ by Aashish Kumar
        </p>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex items-center justify-center bg-fog px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="w-full max-w-md"
        >
          {/* Mobile logo (visible only below md) */}
          <div className="flex items-center gap-2.5 justify-center mb-10 md:hidden">
            <div className="w-9 h-9 rounded-full bg-lamp" />
            <span className="font-display text-lg text-ink font-semibold">
              StudyMate AI
            </span>
          </div>

          {/* Form card */}
          <div className="bg-white rounded-2xl shadow-lg border border-ink/8 p-8">
            {/* Header */}
            <div className="mb-6 text-center">
              <h1 className="font-display text-2xl text-ink font-semibold">
                Welcome back
              </h1>
              <p className="font-body text-sm text-ink-60 mt-1">
                Pick up right where you left off.
              </p>
            </div>

            {/* Server error banner */}
            {serverError && (
              <div className="mb-4 flex items-start gap-2.5 px-3.5 py-3 rounded-lg bg-deadline/10 border border-deadline/20">
                <AlertCircle className="w-4 h-4 text-deadline shrink-0 mt-0.5" />
                <p className="text-sm text-deadline font-body">{serverError}</p>
              </div>
            )}

            <form
              onSubmit={handleSubmit(onSubmit)}
              className="space-y-4"
              noValidate
            >
              {/* Email */}
              <div>
                <label
                  className="block font-body text-sm text-ink mb-1"
                  htmlFor="email"
                >
                  Email address
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  {...register("email")}
                  className="w-full px-3 py-2.5 rounded-lg border border-ink/15 bg-white font-body text-sm text-ink placeholder:text-ink-60 focus:outline-none focus:ring-2 focus:ring-lamp/50"
                  placeholder="you@example.com"
                />
                {errors.email && (
                  <p className="mt-1 text-xs text-deadline font-body">
                    {errors.email.message}
                  </p>
                )}
              </div>

              {/* Password */}
              <div>
                <label
                  className="block font-body text-sm text-ink mb-1"
                  htmlFor="password"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    {...register("password")}
                    className="w-full px-3 py-2.5 pr-10 rounded-lg border border-ink/15 bg-white font-body text-sm text-ink placeholder:text-ink-60 focus:outline-none focus:ring-2 focus:ring-lamp/50"
                    placeholder="Your password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-60 hover:text-ink transition-colors"
                    tabIndex={-1}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                {errors.password && (
                  <p className="mt-1 text-xs text-deadline font-body">
                    {errors.password.message}
                  </p>
                )}
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 rounded-lg bg-lamp hover:bg-lamp/90 active:scale-[0.98] text-ink font-body font-semibold text-sm transition-all disabled:opacity-60 disabled:pointer-events-none"
              >
                {isSubmitting ? "Logging in…" : "Log in"}
              </button>
            </form>

            {/* Divider */}
            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-ink/10" />
              <span className="font-body text-xs text-ink-60">or</span>
              <div className="flex-1 h-px bg-ink/10" />
            </div>

            {/* Switch link */}
            <p className="text-center font-body text-sm text-ink-60">
              Don't have an account?{" "}
              <Link
                to="/signup"
                className="text-lamp font-medium hover:underline"
              >
                Sign up free
              </Link>
            </p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
