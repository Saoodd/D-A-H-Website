export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="container-page py-16 max-w-2xl">
      <h1 className="font-heading text-3xl text-brown-dark mb-6">{title}</h1>
      <div className="prose prose-sm max-w-none text-brown-light space-y-4 leading-relaxed">
        {children}
      </div>
    </div>
  );
}
