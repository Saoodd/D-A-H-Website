"use client";

interface ChecklistItem {
  label: string;
  done: boolean;
  required?: boolean;
}

// A subtle, informational setup checklist for Draft events — shown only
// while a DRAFT, so it never lingers once an event is live. Only the item
// marked `required` (Terms & Conditions) actually gates Publish — everything
// else here is a helpful nudge, never a hidden blocker (see the server-side
// enforcement in PATCH /api/admin/events/[id], which checks Terms alone).
export function EventSetupChecklist({ items, onGoToTerms }: { items: ChecklistItem[]; onGoToTerms: () => void }) {
  const doneCount = items.filter((i) => i.done).length;

  return (
    <div className="rounded-[10px] border border-brown/10 bg-cream-soft/60 p-5 mb-6">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <p className="label-caps">Event Setup</p>
        <p className="text-xs text-brown-light">
          Ready to Publish: <span className="text-brown-dark font-medium">{doneCount} / {items.length}</span>
        </p>
      </div>
      <ul className="flex flex-col gap-1.5">
        {items.map((item) => (
          <li key={item.label} className="flex items-center gap-2 text-sm">
            <span
              aria-hidden="true"
              className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] shrink-0 ${
                item.done ? "bg-emerald-700/15 text-emerald-800 dark:text-emerald-400" : "border border-brown/25 text-transparent"
              }`}
            >
              {item.done ? "✓" : "○"}
            </span>
            <span className={item.done ? "text-brown-dark" : "text-brown-light"}>{item.label}</span>
            {item.required && !item.done && (
              <button type="button" onClick={onGoToTerms} className="text-xs underline text-brown-dark hover:text-brown ms-1">
                Required to publish — add now
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
