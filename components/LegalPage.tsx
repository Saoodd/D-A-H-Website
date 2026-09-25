export function LegalPage({ title, updated, children }: { title: string; updated?: Date | null; children: React.ReactNode }) {
  return (
    <div className="container-page py-16 max-w-2xl">
      <h1 className="font-heading text-3xl text-brown-dark mb-2">{title}</h1>
      {updated ? (
        <p className="text-xs text-brown-light mb-6">
          Last updated {updated.toLocaleDateString("en-AE", { day: "numeric", month: "long", year: "numeric" })}
        </p>
      ) : (
        <div className="mb-4" />
      )}
      <div className="prose prose-sm max-w-none text-brown-light space-y-4 leading-relaxed [&_p]:mb-4">{children}</div>
    </div>
  );
}
