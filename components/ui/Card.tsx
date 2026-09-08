export function Card({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <div className={`rounded-[10px] border border-brown/10 bg-cream ${className}`}>{children}</div>;
}

export function SectionLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <p className={`label-caps ${className}`}>{children}</p>;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
      <div>
        {eyebrow && <SectionLabel className="mb-2 block">{eyebrow}</SectionLabel>}
        <h1 className="font-heading text-2xl md:text-3xl text-brown-dark">{title}</h1>
        {description && <p className="mt-2 text-sm text-brown-light max-w-xl">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-[10px] border border-dashed border-brown/15 bg-cream/50 px-6 py-12 text-center">
      <p className="font-heading text-lg text-brown-dark">{title}</p>
      {description && <p className="mt-2 text-sm text-brown-light max-w-sm mx-auto">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-[10px] border border-brown/10 bg-cream px-5 py-4">
      <p className="label-caps">{label}</p>
      <p className="mt-2 font-heading text-2xl text-brown-dark">{value}</p>
      {hint && <p className="mt-1 text-xs text-brown-light">{hint}</p>}
    </div>
  );
}
