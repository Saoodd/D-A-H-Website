import { ImageResponse } from "next/og";
import { DAH_IVORY, DAH_OLIVE } from "@/lib/theme/brand";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// Apple touch icon — same standalone mark as icon.tsx, scaled up; iOS
// applies its own corner rounding, so no borderRadius here.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: DAH_IVORY,
        }}
      >
        <svg width="96" height="120" viewBox="0 0 120 150" fill={DAH_OLIVE}>
          <path d="M18,148 C18,95 24,50 60,10 C52,48 46,95 44,148 Z" />
          <path d="M102,148 C102,95 96,50 60,10 C68,48 74,95 76,148 Z" />
          <path d="M60,84 L71,97 L60,110 L49,97 Z" />
        </svg>
      </div>
    ),
    size
  );
}
