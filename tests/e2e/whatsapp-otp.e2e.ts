// WhatsApp OTP end-to-end regression test. Drives the real API routes of a
// running server whose INFOBIP_WHATSAPP_* variables point at
// tests/e2e/fake-infobip.mjs, and checks exactly what reaches "Infobip",
// what's stored, and what's logged. See tests/e2e/README.md to run it.
//
// Creates and deletes its own throwaway vendors. Refuses to run against
// anything but a local database.
import "dotenv/config";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import bcrypt from "bcryptjs";
import { prisma } from "../../lib/prisma";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3200";
const FAKE = process.env.FAKE_INFOBIP_URL ?? "http://127.0.0.1:4010";
const SERVER_LOG = process.env.E2E_SERVER_LOG; // optional: path to the server's stdout/stderr
const API_KEY = process.env.INFOBIP_WHATSAPP_API_KEY ?? "";
const SENDER = (process.env.INFOBIP_WHATSAPP_SENDER ?? "").replace(/^\+/, "");

const dbUrl = process.env.DATABASE_URL ?? "";
if (!/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(dbUrl)) {
  console.error("Refusing to run: DATABASE_URL is not a local database.");
  process.exit(2);
}

type Check = [name: string, ok: boolean, detail?: unknown];
const checks: Check[] = [];
const check = (name: string, ok: boolean, detail?: unknown) => checks.push([name, ok, ok ? undefined : detail]);

interface FakeRequest {
  method: string;
  path: string;
  authorization: string | null;
  body: {
    messages?: {
      from: string;
      to: string;
      content: { templateName: string; language: string; templateData: { body: { placeholders: string[] }; buttons?: { type: string; parameter: string }[] } };
    }[];
  } | null;
}
const fake = {
  reset: () => fetch(`${FAKE}/__reset`, { method: "POST" }),
  failNext: () => fetch(`${FAKE}/__fail-next`, { method: "POST" }),
  sends: async () => ((await (await fetch(`${FAKE}/__requests`)).json()) as FakeRequest[]).filter((r) => r.path === "/whatsapp/1/message/template"),
};

async function makeVendor(tag: string) {
  const u = `otp${tag}${Date.now()}`;
  const phone = `+9715${String(Date.now()).slice(-8)}`;
  return prisma.vendor.create({
    data: {
      email: `${u}@example.test`,
      username: u,
      usernameLower: u,
      passwordHash: await bcrypt.hash("E2e-test-password-1", 10),
      businessName: "OTP Test Biz",
      contactName: "OTP",
      phone,
      category: "Food",
    },
  });
}

async function login(username: string) {
  const r = await fetch(`${BASE}/api/vendor/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ identifier: username, password: "E2e-test-password-1" }),
  });
  return r.headers.get("set-cookie")!.split(";")[0];
}

const api = (path: string, cookie?: string, body?: unknown) =>
  fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).then(async (r) => ({ status: r.status, json: (await r.json().catch(() => ({}))) as Record<string, unknown> }));

// Local only: lets the test send a second code without waiting out the
// 45-second resend cooldown.
const clearLimits = () => prisma.rateLimitBucket.deleteMany({});

async function main() {
  const created: string[] = [];
  try {
    await clearLimits();
    await fake.reset();
    const v = await makeVendor("a");
    created.push(v.id);
    const cookie = await login(v.username);

    check("send without a session is rejected", (await api("/api/vendor/phone-verification/send")).status === 401);

    // --- Send ---
    const sent = await api("/api/vendor/phone-verification/send", cookie);
    check("send succeeds", sent.status === 200, sent);
    let sends = await fake.sends();
    check("exactly one WhatsApp template message sent", sends.length === 1, sends.length);
    const msg = sends[0]?.body?.messages?.[0];
    const code = msg?.content.templateData.body.placeholders[0] ?? "";
    check("authenticated with the Infobip App key header", sends[0]?.authorization === `App ${API_KEY}`);
    check("sent from the configured WhatsApp sender", msg?.from === SENDER, msg?.from);
    check("sent to the vendor's number, E.164 without +", msg?.to === v.phone.replace(/^\+/, ""), msg?.to);
    check("uses the configured AUTHENTICATION template", msg?.content.templateName === "dah_verify" && msg?.content.language === "en", msg?.content);
    check("code is 6 digits", /^\d{6}$/.test(code), code);
    check("Copy Code button carries the same code", msg?.content.templateData.buttons?.[0]?.parameter === code, msg?.content.templateData.buttons);

    let row = await prisma.vendor.findUniqueOrThrow({ where: { id: v.id } });
    check("stored hash is a 64-char hex HMAC", /^[0-9a-f]{64}$/.test(row.phoneOtpCodeHash ?? ""));
    check("stored hash is not the code or a bare SHA-256 of it", row.phoneOtpCodeHash !== code && row.phoneOtpCodeHash !== createHash("sha256").update(code).digest("hex"));
    const delivery = await prisma.whatsAppDelivery.findFirst({ where: { vendorId: v.id }, orderBy: { queuedAt: "desc" } });
    check("delivery logged as PHONE_VERIFICATION / SENT", delivery?.type === "PHONE_VERIFICATION" && delivery?.status === "SENT", delivery);
    check("delivery log never contains the code", !JSON.stringify(delivery).includes(code));

    check("immediate resend is rate limited", (await api("/api/vendor/phone-verification/send", cookie)).status === 429);

    // --- Wrong codes, attempt cap ---
    const wrong = code === "000000" ? "111111" : "000000";
    const w1 = await api("/api/vendor/phone-verification/confirm", cookie, { code: wrong });
    check("wrong code is rejected", w1.status === 400, w1);
    for (let i = 0; i < 4; i++) await api("/api/vendor/phone-verification/confirm", cookie, { code: wrong });
    const capped = await api("/api/vendor/phone-verification/confirm", cookie, { code });
    check("after 5 wrong attempts even the right code is refused", capped.status !== 200, capped);
    row = await prisma.vendor.findUniqueOrThrow({ where: { id: v.id } });
    check("vendor still unverified", row.phoneVerifiedAt === null);

    // --- Fresh code resets the counter, correct code verifies ---
    await clearLimits();
    await fake.reset();
    check("new code can be requested", (await api("/api/vendor/phone-verification/send", cookie)).status === 200);
    sends = await fake.sends();
    const code2 = sends[0]?.body?.messages?.[0]?.content.templateData.body.placeholders[0] ?? "";
    check("new code differs from the old one or is freshly issued", /^\d{6}$/.test(code2));
    const oldCodeNow = await api("/api/vendor/phone-verification/confirm", cookie, { code: code === code2 ? wrong : code });
    check("the previous code no longer works", oldCodeNow.status === 400, oldCodeNow);
    const ok = await api("/api/vendor/phone-verification/confirm", cookie, { code: code2 });
    check("correct code verifies", ok.status === 200 && ok.json.ok === true, ok);
    row = await prisma.vendor.findUniqueOrThrow({ where: { id: v.id } });
    check("vendor marked verified via WHATSAPP for this exact number", row.phoneVerifiedMethod === "WHATSAPP" && row.phoneVerifiedNumber === v.phone && row.phoneVerifiedAt !== null);
    check("OTP state cleared after success", row.phoneOtpCodeHash === null && row.phoneOtpAttempts === 0);
    const log = await prisma.vendorPhoneVerificationLog.findFirst({ where: { vendorId: v.id } });
    check("verification audit log written", log?.method === "WHATSAPP" && log?.phone === v.phone, log);
    const again = await api("/api/vendor/phone-verification/send", cookie);
    check("already-verified vendor can't trigger another send", again.status === 409, again);

    // --- Provider failure: honest error, code never logged ---
    await clearLimits();
    await fake.reset();
    const v2 = await makeVendor("b");
    created.push(v2.id);
    const cookie2 = await login(v2.username);
    await fake.failNext();
    const failed = await api("/api/vendor/phone-verification/send", cookie2);
    check("provider failure surfaces as an error, not success", failed.status >= 400, failed);
    const failedCode = (await fake.sends())[0]?.body?.messages?.[0]?.content.templateData.body.placeholders[0] ?? "";
    const d2 = await prisma.whatsAppDelivery.findFirst({ where: { vendorId: v2.id }, orderBy: { queuedAt: "desc" } });
    check("failed delivery recorded as FAILED", d2?.status === "FAILED", d2);
    check("failure reason redacts the code even though the provider echoed it", !!failedCode && !(d2?.failReason ?? "").includes(failedCode), d2?.failReason);
    if (SERVER_LOG && existsSync(SERVER_LOG)) {
      const logText = readFileSync(SERVER_LOG, "utf8");
      check("server log never contains an OTP code", ![code, code2, failedCode].some((c) => c && logText.includes(c)));
      check("server log never contains the API key", !logText.includes(API_KEY));
    }
  } finally {
    await prisma.vendor.deleteMany({ where: { id: { in: created } } });
    await clearLimits();
    await prisma.$disconnect();
  }

  const failed = checks.filter((c) => !c[1]);
  for (const [name, ok, detail] of checks) console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok ? "" : ` -> ${JSON.stringify(detail)?.slice(0, 300)}`}`);
  console.log(`\n${checks.length - failed.length}/${checks.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
