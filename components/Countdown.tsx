"use client";

import { useEffect, useState } from "react";

export type CountdownVariant = "auto" | "mmss" | "hm";

function format(msLeft: number, variant: CountdownVariant) {
  if (msLeft <= 0) {
    if (variant === "mmss") return "00:00";
    if (variant === "hm") return "0h 00m";
    return "0h 00m 00s";
  }
  const totalSeconds = Math.floor(msLeft / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  // Strict MM:SS — used for the short, action-specific timers (2-minute
  // booth-selection session, 5-minute payment hold) where every second is
  // meaningful and the value never runs into hours.
  if (variant === "mmss") {
    const totalMinutes = Math.floor(totalSeconds / 60);
    return `${String(totalMinutes).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  // Compact hours+minutes, no seconds — used for the de-emphasized outer
  // acceptance deadline shown alongside a shorter, bolder stage timer.
  if (variant === "hm") {
    return `${h}h ${String(m).padStart(2, "0")}m`;
  }
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

export function Countdown({
  target,
  onExpire,
  className = "",
  variant = "auto",
}: {
  target: string; // ISO timestamp
  onExpire?: () => void;
  className?: string;
  variant?: CountdownVariant;
}) {
  const [msLeft, setMsLeft] = useState(() => new Date(target).getTime() - Date.now());
  const [firedExpire, setFiredExpire] = useState(false);

  useEffect(() => {
    const id = setInterval(() => {
      const left = new Date(target).getTime() - Date.now();
      setMsLeft(left);
      if (left <= 0 && !firedExpire) {
        setFiredExpire(true);
        onExpire?.();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [target, onExpire, firedExpire]);

  const urgent = variant !== "hm" && msLeft < 60_000;

  return (
    <span className={`font-mono tabular-nums ${urgent ? "text-red-700" : ""} ${className}`}>
      {format(msLeft, variant)}
    </span>
  );
}
