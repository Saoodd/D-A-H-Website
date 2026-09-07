import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { GalleryClient } from "./GalleryClient";

export const metadata: Metadata = {
  title: "Gallery",
  description: "Photos from past Dar Al Hay community markets.",
};

export default async function GalleryPage() {
  const images = await prisma.galleryImage.findMany({ orderBy: { sortOrder: "asc" } });
  return (
    <GalleryClient
      images={images.map((i) => ({ id: i.id, url: i.url, caption: i.caption }))}
    />
  );
}
