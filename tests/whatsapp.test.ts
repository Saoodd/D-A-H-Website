// WhatsApp / Infobip regression guards. The full send -> confirm flow is
// covered end to end by tests/e2e/whatsapp-otp.e2e.ts against a fake
// Infobip; these are the fast checks that run on every `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { normalizePhoneToE164, maskPhoneForDisplay } from "../lib/phone";
import { isPhoneVerified } from "../lib/verification";
import { buildTemplateMessagePayload } from "../lib/whatsapp/infobip";

const ROOT = join(__dirname, "..");

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = join(dir, name);
    if (name === "generated" || name === "node_modules") continue;
    if (statSync(join(ROOT, rel)).isDirectory()) sourceFiles(rel, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(name)) out.push(rel);
  }
  return out;
}
const SOURCES = ["app", "lib", "components"].flatMap((d) => sourceFiles(d));
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
// Strip comments so explanations of the migration ("moved off Twilio")
// don't count as usage.
const code = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

test("phone verification never goes back to SMS/Twilio", () => {
  const pkg = JSON.parse(read("package.json"));
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  assert.equal(deps.filter((d) => /twilio|messagebird|vonage|nexmo|plivo/i.test(d)).length, 0, "an SMS provider SDK is installed");
  assert.equal(existsSync(join(ROOT, "lib/sms")), false, "lib/sms was reintroduced");
  const offenders = SOURCES.filter((f) => /from\s+["']twilio["']|api\.twilio\.com|\/sms\/\d+\/text|sendSms\s*\(/i.test(code(f)));
  assert.deepEqual(offenders, []);
});

test("Infobip secrets never reach client code", () => {
  const clientFiles = SOURCES.filter((f) => /^\s*["']use client["']/m.test(read(f)));
  assert.ok(clientFiles.length > 20, "expected to find client components");
  // Client components may only read NEXT_PUBLIC_* (and NODE_ENV).
  const leaks = clientFiles.flatMap((f) => [...code(f).matchAll(/process\.env\.([A-Z0-9_]+)/g)].map((m) => `${f}: ${m[1]}`)).filter((l) => !/: (NEXT_PUBLIC_\w+|NODE_ENV)$/.test(l));
  assert.deepEqual(leaks, []);
  // And nothing secret-looking is ever made public.
  const publicSecrets = [...SOURCES, ".env.example"].filter((f) => /NEXT_PUBLIC_\w*(INFOBIP|SECRET|API_KEY|TOKEN|PASSWORD)/.test(read(f)));
  assert.deepEqual(publicSecrets, []);
  // The Infobip modules are server-only.
  for (const f of ["lib/whatsapp/infobip.ts", "lib/whatsapp/otp.ts", "lib/notifications/notify.ts"]) assert.match(read(f), /^import "server-only";/, f);
});

test("phone numbers normalise to E.164 with UAE as the default region", () => {
  for (const s of ["0501234567", "+971501234567", "971 50 123 4567", "+971 50 123 4567", "50 123 4567"]) assert.equal(normalizePhoneToE164(s), "+971501234567", s);
  assert.equal(normalizePhoneToE164("+44 20 7946 0958"), "+442079460958");
  for (const bad of ["", "abc", "12", "+971 5"]) assert.equal(normalizePhoneToE164(bad), null, bad);
  assert.equal(maskPhoneForDisplay("+971561234800"), "+971 56 *** 4800");
});

test("verification follows the number: changing the phone un-verifies", () => {
  const verified = { phone: "050 123 4567", phoneVerifiedAt: new Date(), phoneVerifiedNumber: "+971501234567" };
  assert.equal(isPhoneVerified(verified), true); // formatting differences don't matter
  assert.equal(isPhoneVerified({ ...verified, phone: "0509999999" }), false);
  assert.equal(isPhoneVerified({ ...verified, phoneVerifiedAt: null }), false);
});

test("template payload matches Infobip's documented WhatsApp template shape", () => {
  const withButton = buildTemplateMessagePayload({ from: "971500000001", to: "971501234567", messageId: "m1", templateName: "dah_verify", language: "en", placeholders: ["123456"], buttons: [{ type: "URL", parameter: "123456" }] });
  assert.deepEqual(withButton, {
    messages: [
      {
        from: "971500000001",
        to: "971501234567",
        messageId: "m1",
        content: { templateName: "dah_verify", templateData: { body: { placeholders: ["123456"] }, buttons: [{ type: "URL", parameter: "123456" }] }, language: "en" },
      },
    ],
  });
  const plain = buildTemplateMessagePayload({ from: "a", to: "b", messageId: "m2", templateName: "t", language: "en", placeholders: [] });
  assert.equal("buttons" in plain.messages[0].content.templateData, false);
});
