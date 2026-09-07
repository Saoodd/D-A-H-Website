"use client";

import { useEffect, useState } from "react";

/** Types `text` out one character at a time on mount/change. The full text
 *  stays available to assistive tech via aria-label; the animated glyphs are
 *  aria-hidden so screen readers don't read it twice or mid-type. */
export function Typewriter({
  text,
  speed = 28,
  className = "",
}: {
  text: string;
  speed?: number;
  className?: string;
}) {
  const [shown, setShown] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets the typing animation when `text` changes
    setShown("");
    setDone(false);
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setShown(text.slice(0, i));
      if (i >= text.length) {
        clearInterval(id);
        setDone(true);
      }
    }, speed);
    return () => clearInterval(id);
  }, [text, speed]);

  return (
    <span aria-label={text} className={className}>
      <span aria-hidden="true">{shown}</span>
      <span
        aria-hidden="true"
        className={`inline-block w-[2px] h-[0.9em] bg-current align-middle ml-1 ${done ? "animate-pulse" : "opacity-70"}`}
      />
    </span>
  );
}
