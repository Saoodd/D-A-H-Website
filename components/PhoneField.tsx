"use client";

import { useState } from "react";

// Common Gulf/regional country codes first (DAH is Dubai-based), then a few
// other commonly-relevant ones. Not exhaustive — easy to extend.
const COUNTRY_CODES = [
  { code: "+971", label: "🇦🇪 +971" },
  { code: "+966", label: "🇸🇦 +966" },
  { code: "+974", label: "🇶🇦 +974" },
  { code: "+973", label: "🇧🇭 +973" },
  { code: "+965", label: "🇰🇼 +965" },
  { code: "+968", label: "🇴🇲 +968" },
  { code: "+20", label: "🇪🇬 +20" },
  { code: "+91", label: "🇮🇳 +91" },
  { code: "+92", label: "🇵🇰 +92" },
  { code: "+63", label: "🇵🇭 +63" },
  { code: "+44", label: "🇬🇧 +44" },
  { code: "+1", label: "🇺🇸/🇨🇦 +1" },
];

export function PhoneField({
  name = "phone",
  label,
  required,
  defaultCountryCode = "+971",
  defaultNumber = "",
}: {
  name?: string;
  label: string;
  required?: boolean;
  defaultCountryCode?: string;
  defaultNumber?: string;
}) {
  const [countryCode, setCountryCode] = useState(defaultCountryCode);
  const [number, setNumber] = useState(defaultNumber);

  return (
    <label className="flex flex-col gap-1 text-sm">
      <span>
        {label}
        {required && (
          <span className="text-brown/40" aria-hidden="true">
            {" "}
            *
          </span>
        )}
      </span>
      <div className="flex gap-2">
        <select
          value={countryCode}
          onChange={(e) => setCountryCode(e.target.value)}
          aria-label="Country code"
          className="border border-brown/20 rounded-lg px-2 py-2 bg-cream-soft w-[110px] shrink-0"
        >
          {COUNTRY_CODES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.label}
            </option>
          ))}
        </select>
        <input
          type="tel"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          required={required}
          placeholder="50 123 4567"
          className="border border-brown/20 rounded-lg px-3 py-2 bg-cream-soft flex-1 min-w-0"
        />
      </div>
      {/* Combined value is what actually gets submitted via FormData under `name` */}
      <input type="hidden" name={name} value={number ? `${countryCode} ${number}` : ""} />
    </label>
  );
}
