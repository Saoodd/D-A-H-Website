"use client";

export function PrintButton({ label }: { label: string }) {
  return (
    <button
      onClick={() => window.print()}
      className="print:hidden px-5 py-2 rounded-full border border-brown/30 text-sm hover:bg-brown/5"
    >
      {label}
    </button>
  );
}
