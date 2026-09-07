export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="container-page py-16 max-w-2xl">
      <div className="mb-8 rounded-xl border border-dashed border-brown/30 bg-cream px-4 py-3 text-xs text-brown-light">
        Placeholder / template text — for DAH to review and replace with final legal copy before launch.
      </div>
      <h1 className="font-heading text-3xl text-brown-dark mb-6">{title}</h1>
      <div className="prose prose-sm max-w-none text-brown-light space-y-4 leading-relaxed">
        {children}
      </div>
    </div>
  );
}
