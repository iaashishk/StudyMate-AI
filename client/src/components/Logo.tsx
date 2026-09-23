import React from "react";

interface LogoProps {
  size?: number | string;
  showText?: boolean;
  showTagline?: boolean;
  className?: string;
  textClassName?: string;
}

/**
 * StudyMate AI Official Brand Logo
 * Features:
 * - Purple gradient bear/panda silhouette with rounded ears
 * - Radiant 4-point golden star on forehead
 * - Open white book with gentle curved pages
 * - Bold typography with "AI" violet accent & optional tagline
 */
export const LogoIcon: React.FC<{ size?: number | string; className?: string }> = ({
  size = 32,
  className = "",
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`shrink-0 select-none ${className}`}
    >
      <defs>
        {/* Bear silhouette gradient */}
        <linearGradient id="sm-bear-grad" x1="50" y1="6" x2="50" y2="92" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#7C3AED" />
          <stop offset="45%" stopColor="#6D28D9" />
          <stop offset="100%" stopColor="#5B21B6" />
        </linearGradient>

        {/* Soft highlight on top */}
        <linearGradient id="sm-bear-highlight" x1="50" y1="12" x2="50" y2="55" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#A78BFA" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#7C3AED" stopOpacity="0" />
        </linearGradient>

        {/* Star golden gradient */}
        <linearGradient id="sm-star-grad" x1="50" y1="20" x2="50" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FEF08A" />
          <stop offset="50%" stopColor="#FACC15" />
          <stop offset="100%" stopColor="#EAB308" />
        </linearGradient>

        {/* Book shadow & gradient */}
        <linearGradient id="sm-book-right-grad" x1="52" y1="50" x2="78" y2="76" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F8FAFC" />
          <stop offset="100%" stopColor="#EEF2F6" />
        </linearGradient>
      </defs>

      {/* ── Left Ear ── */}
      <circle cx="27" cy="22" r="14" fill="url(#sm-bear-grad)" />

      {/* ── Right Ear ── */}
      <circle cx="73" cy="22" r="14" fill="url(#sm-bear-grad)" />

      {/* ── Main Body (Squircle head/torso) ── */}
      <rect x="15" y="16" width="70" height="72" rx="22" fill="url(#sm-bear-grad)" />
      <rect x="15" y="16" width="70" height="72" rx="22" fill="url(#sm-bear-highlight)" />

      {/* ── 4-point golden sparkle star ── */}
      <path
        d="M 50 19 Q 50 26.5 56.5 26.5 Q 50 26.5 50 34 Q 50 26.5 43.5 26.5 Q 50 26.5 50 19 Z"
        fill="url(#sm-star-grad)"
      />

      {/* ── Open Book: Left Page ── */}
      <path
        d="M 48 51.5 
           C 40 48.5, 30 49, 24 51.5 
           C 23.2 51.8, 22.5 52.5, 22.5 53.5 
           L 22.5 73.5 
           C 22.5 74.5, 23.3 75.2, 24.2 75 
           C 30.5 72.8, 40 72.2, 48 75.2 
           Z"
        fill="#FFFFFF"
      />

      {/* ── Open Book: Right Page ── */}
      <path
        d="M 52 51.5 
           C 60 48.5, 70 49, 76 51.5 
           C 76.8 51.8, 77.5 52.5, 77.5 53.5 
           L 77.5 73.5 
           C 77.5 74.5, 76.7 75.2, 75.8 75 
           C 69.5 72.8, 60 72.2, 52 75.2 
           Z"
        fill="url(#sm-book-right-grad)"
      />

      {/* ── Center Book Spine crease ── */}
      <path
        d="M 50 52 L 50 74.8"
        stroke="#CBD5E1"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
};

export default function Logo({
  size = 32,
  showText = true,
  showTagline = false,
  className = "",
  textClassName = "",
}: LogoProps) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <LogoIcon size={size} />
      {showText && (
        <div className="flex flex-col justify-center leading-none">
          <div className={`flex items-center text-white tracking-tight ${textClassName}`}>
            <span className="font-bold text-base md:text-lg text-white">StudyMate</span>
            <span className="font-bold text-base md:text-lg ml-1 text-[#8B5CF6]">AI</span>
          </div>
          {showTagline && (
            <span className="text-[11px] text-[#8E8E93] font-normal tracking-normal mt-0.5">
              Your personal AI study partner
            </span>
          )}
        </div>
      )}
    </div>
  );
}

