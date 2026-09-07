import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#EDE9E2",
        }}
      >
        <div style={{ fontSize: 72, color: "#6B4429", letterSpacing: 12, fontWeight: 300 }}>D·A·H</div>
        <div style={{ fontSize: 24, color: "#96775C", letterSpacing: 6, marginTop: 16 }}>
          COMMUNITY POP-UP MARKETS · DUBAI
        </div>
      </div>
    ),
    size
  );
}
