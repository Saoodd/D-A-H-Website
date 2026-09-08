"use client";

import { useLocale } from "@/lib/i18n/context";
import { Reveal } from "@/components/Reveal";
import { EmptyState, PageHeader } from "@/components/ui/Card";

interface Img {
  id: string;
  url: string;
  caption: string;
}

export function GalleryClient({ images }: { images: Img[] }) {
  const { t } = useLocale();
  return (
    <div className="container-page py-16">
      <Reveal>
        <PageHeader title={t("gallery.title")} description={t("gallery.subtitle")} />
      </Reveal>

      {images.length === 0 ? (
        <EmptyState title={t("gallery.empty")} />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {images.map((img, i) => (
            <Reveal key={img.id} delayMs={(i % 6) * 70}>
              <figure className="rounded-xl overflow-hidden bg-cream-deep">
                {/* eslint-disable-next-line @next/next/no-img-element -- admin-managed external URLs, not local static assets */}
                <img src={img.url} alt={img.caption || "Dar Al Hay event"} className="w-full h-48 object-cover" />
                {img.caption && <figcaption className="text-xs text-brown-light p-2">{img.caption}</figcaption>}
              </figure>
            </Reveal>
          ))}
        </div>
      )}
    </div>
  );
}
