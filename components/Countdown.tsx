"use client";

import { useEffect, useState } from "react";

function format(msLeft: number) {
  if (msLeft <= 0) return "0h 00m 00s";
  const totalSeconds = Math.floor(msLeft / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

export function Countdown({
  target,
  onExpire,
  className = "",
}: {
  target: string; // ISO timestamp
  onExpire?: () => void;
  className?: string;
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

  const urgent = msLeft < 60_000;

  return (
    <span className={`font-mono tabular-nums ${urgent ? "text-red-700" : ""} ${className}`}>
      {format(msLeft)}
    </span>
  );
}
