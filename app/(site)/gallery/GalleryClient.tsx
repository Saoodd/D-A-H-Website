"use client";

import { useLocale } from "@/lib/i18n/context";

interface Img {
  id: string;
  url: string;
  caption: string;
}

export function GalleryClient({ images }: { images: Img[] }) {
  const { t } = useLocale();
  return (
    <div className="container-page py-16">
      <header className="max-w-2xl mb-12">
        <h1 className="font-heading text-3xl md:text-4xl text-brown-dark">{t("gallery.title")}</h1>
        <p className="mt-3 text-brown-light">{t("gallery.subtitle")}</p>
      </header>

      {images.length === 0 ? (
        <p className="text-brown-light">
          {/* eslint-disable-next-line react/no-unescaped-entities */}
          No photos yet — add some from the admin panel's Gallery section.
        </p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {images.map((img) => (
            <figure key={img.id} className="rounded-xl overflow-hidden bg-cream-deep">
              {/* eslint-disable-next-line @next/next/no-img-element -- admin-managed external URLs, not local static assets */}
              <img src={img.url} alt={img.caption || "Dar Al Hay market"} className="w-full h-48 object-cover" />
              {img.caption && <figcaption className="text-xs text-brown-light p-2">{img.caption}</figcaption>}
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
