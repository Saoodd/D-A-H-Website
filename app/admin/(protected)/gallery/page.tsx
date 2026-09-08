import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/Card";
import { GalleryAdminClient } from "./GalleryAdminClient";

export const metadata: Metadata = { title: "Gallery — Admin" };

export default async function AdminGalleryPage() {
  const images = await prisma.galleryImage.findMany({ orderBy: { sortOrder: "asc" } });
  return (
    <div className="max-w-3xl">
      <PageHeader title="Gallery" description="Photos shown on the public gallery page and homepage preview." />
      <GalleryAdminClient
        images={images.map((i) => ({ id: i.id, url: i.url, caption: i.caption, sortOrder: i.sortOrder }))}
      />
    </div>
  );
}
