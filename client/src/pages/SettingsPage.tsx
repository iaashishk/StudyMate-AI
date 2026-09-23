import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { LogOut, Trash2, Save, Clock, User } from "lucide-react";
import { useAuth } from "../context/AuthContext";
import api from "../lib/api";
import Modal from "../components/Modal";

export default function SettingsPage() {
  const { user, logout, updateUser } = useAuth();
  const navigate = useNavigate();

  const [name, setName] = useState(user?.name || "");
  const [dailyHours, setDailyHours] = useState(user?.dailyStudyHours || 2);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      await api.patch("/auth/me", { name, dailyStudyHours: dailyHours });
      updateUser({ name, dailyStudyHours: dailyHours });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      await api.delete("/auth/me");
      await logout();
      navigate("/signup");
    } catch {
      setError("Failed to delete account");
      setDeleting(false);
      setDeleteOpen(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="px-6 md:px-10 py-8 max-w-lg pb-24 md:pb-8"
    >
      <h1 className="font-display text-2xl text-ink font-semibold mb-8">Settings</h1>

      {/* Profile section */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <User size={14} className="text-ink-60" />
          <h2 className="font-body text-xs text-ink-60 uppercase tracking-widest">
            Profile
          </h2>
        </div>
        <div className="space-y-4 p-5 bg-white rounded-2xl border border-ink/8 shadow-sm">
          <div>
            <label className="block font-body text-sm text-ink mb-1.5">Full name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-ink/15 font-body text-sm text-ink focus:outline-none focus:ring-2 focus:ring-lamp/50"
            />
          </div>
          <div>
            <label className="block font-body text-sm text-ink mb-1.5">Email</label>
            <input
              value={user?.email}
              disabled
              className="w-full px-3 py-2.5 rounded-xl border border-ink/10 bg-fog font-body text-sm text-ink-60 cursor-not-allowed"
            />
            <p className="mt-1.5 text-[11px] font-body text-ink-60/70">
              Email cannot be changed.
            </p>
          </div>
        </div>
      </section>

      {/* Study schedule section */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Clock size={14} className="text-ink-60" />
          <h2 className="font-body text-xs text-ink-60 uppercase tracking-widest">
            Study schedule
          </h2>
        </div>
        <div className="p-5 bg-white rounded-2xl border border-ink/8 shadow-sm space-y-4">
          <label className="block font-body text-sm text-ink">
            Daily study hours
          </label>
          <div className="text-center">
            <span className="font-mono text-4xl font-medium text-ink">
              {dailyHours}
            </span>
            <span className="font-body text-sm text-ink-60 ml-2">
              hour{dailyHours !== 1 ? "s" : ""} / day
            </span>
          </div>
          <input
            type="range"
            min={0.5}
            max={8}
            step={0.5}
            value={dailyHours}
            onChange={(e) => setDailyHours(Number(e.target.value))}
            className="w-full accent-lamp"
          />
          <div className="flex justify-between text-[11px] font-body text-ink-60/70">
            <span>30 min</span>
            <span>8 hours</span>
          </div>
        </div>
      </section>

      {error && (
        <div className="mb-4 px-3 py-2.5 rounded-xl bg-deadline/10 border border-deadline/20">
          <p className="text-xs text-deadline font-body">{error}</p>
        </div>
      )}

      {/* Save button */}
      <button
        onClick={handleSave}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-lamp text-ink font-body font-semibold text-sm mb-3 disabled:opacity-60 hover:bg-lamp/90 active:scale-[0.98] transition-all"
      >
        <Save size={15} />
        {saving ? "Saving…" : saved ? "✓ Saved!" : "Save changes"}
      </button>

      {/* Logout */}
      <button
        onClick={handleLogout}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-ink/15 text-ink font-body text-sm mb-3 hover:bg-ink/5 transition-colors"
      >
        <LogOut size={15} />
        Log out
      </button>

      {/* Delete account */}
      <button
        onClick={() => setDeleteOpen(true)}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-deadline/20 text-deadline font-body text-sm hover:bg-deadline/5 transition-colors"
      >
        <Trash2 size={15} />
        Delete account
      </button>

      {/* Delete confirmation */}
      <Modal
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title="Delete your account?"
      >
        <p className="font-body text-sm text-ink-60 mb-6">
          This will permanently delete your account, all subjects, topics, and
          study plans. There is no undo.
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => setDeleteOpen(false)}
            className="flex-1 py-2.5 rounded-xl border border-ink/15 font-body text-sm text-ink-60 hover:bg-ink/5"
          >
            Cancel
          </button>
          <button
            onClick={handleDeleteAccount}
            disabled={deleting}
            className="flex-1 py-2.5 rounded-xl bg-deadline text-white font-body font-semibold text-sm disabled:opacity-60 hover:bg-deadline/90"
          >
            {deleting ? "Deleting…" : "Yes, delete everything"}
          </button>
        </div>
      </Modal>
    </motion.div>
  );
}
