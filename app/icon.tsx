import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

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
          background: "#EDE9E2",
          borderRadius: 14,
          color: "#6B4429",
          fontSize: 22,
          fontWeight: 500,
          letterSpacing: 1,
        }}
      >
        DAH
      </div>
    ),
    size
  );
}
