import { ImageResponse } from "next/og";
import { DAH_IVORY, DAH_OLIVE } from "@/lib/theme/brand";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

// Favicon-scale render of just the standalone arch+diamond mark (never the
// full wordmark at this size — see Logo.tsx's LogoMark for the same path
// data used at header scale).
export default function Icon() {
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
          borderRadius: 14,
        }}
      >
        <svg width="34" height="42" viewBox="0 0 120 150" fill={DAH_OLIVE}>
          <path d="M18,148 C18,95 24,50 60,10 C52,48 46,95 44,148 Z" />
          <path d="M102,148 C102,95 96,50 60,10 C68,48 74,95 76,148 Z" />
          <path d="M60,84 L71,97 L60,110 L49,97 Z" />
        </svg>
      </div>
    ),
    size
  );
}
