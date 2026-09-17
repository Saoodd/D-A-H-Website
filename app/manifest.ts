import type { MetadataRoute } from "next";
import { DAH_IVORY, DAH_OLIVE } from "@/lib/theme/brand";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Dar Al Hay (DAH) Events",
    short_name: "Dar Al Hay",
    description:
      "Dar Al Hay (DAH) curates events and pop-ups across Dubai that give ambitious businesses a real audience, real sales, and room to grow.",
    start_url: "/",
    display: "standalone",
    background_color: DAH_IVORY,
    theme_color: DAH_OLIVE,
    icons: [
      { src: "/icon", sizes: "64x64", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
