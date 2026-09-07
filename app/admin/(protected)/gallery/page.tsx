import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { GalleryAdminClient } from "./GalleryAdminClient";

export const metadata: Metadata = { title: "Gallery — Admin" };

export default async function AdminGalleryPage() {
  const images = await prisma.galleryImage.findMany({ orderBy: { sortOrder: "asc" } });
  return (
    <div className="max-w-3xl">
      <h1 className="font-heading text-2xl text-brown-dark mb-6">Gallery</h1>
      <GalleryAdminClient
        images={images.map((i) => ({ id: i.id, url: i.url, caption: i.caption, sortOrder: i.sortOrder }))}
      />
    </div>
  );
}
