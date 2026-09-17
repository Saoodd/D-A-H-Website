import { ImageResponse } from "next/og";
import { readFileSync } from "fs";
import { join } from "path";
import { DAH_IVORY, DAH_TERRACOTTA } from "@/lib/theme/brand";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  const badge = readFileSync(join(process.cwd(), "public/brand/logo-dark-lg.png")).toString("base64");

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
          background: DAH_IVORY,
        }}
      >
        <img src={`data:image/png;base64,${badge}`} width={220} height={220} alt="" />
        <div style={{ fontSize: 22, color: DAH_TERRACOTTA, letterSpacing: 6, marginTop: 22 }}>
          EVENTS &amp; POP-UPS · DUBAI
        </div>
      </div>
    ),
    size
  );
}
