// Runs every end-to-end suite in tests/e2e against real servers, with
// outside providers (Infobip, Google, the bank) replaced by local fakes.
//
//   npm run test:e2e                 # build, then run everything
//   npm run test:e2e -- --skip-build # reuse the existing .next build
//   npm run test:e2e -- sessions     # only suites whose name matches
//
// Two server groups, because some behaviour only exists in one mode:
//   production build (next start): WhatsApp OTP, sessions, legal CMS, and
//     "online payments are disabled in production"
//   dev server (next dev): the LIVE payment path via the local-test gateway,
//     and Google sign-in via the fake issuer (both refused in production)
//
// Local database only: refuses to run otherwise. Don't run it while
// `npm run dev` is running in this folder (Next allows one dev server).
import "dotenv/config";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, openSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const skipBuild = args.includes("--skip-build");
const only = args.filter((a) => !a.startsWith("--"));

if (!/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(process.env.DATABASE_URL ?? "")) {
  console.error("Refusing to run: DATABASE_URL is not a local database.");
  process.exit(2);
}

const PROD_PORT = 3310;
const DEV_PORT = 3311;
const INFOBIP_PORT = 4010;
const OIDC_PORT = 4555;
const logDir = mkdtempSync(join(tmpdir(), "dah-e2e-"));
const children = [];

const fakeInfobip = {
  INFOBIP_WHATSAPP_BASE_URL: `http://127.0.0.1:${INFOBIP_PORT}`,
  INFOBIP_WHATSAPP_API_KEY: "e2e-fake-infobip-key",
  INFOBIP_WHATSAPP_SENDER: "+971500000001",
  INFOBIP_WHATSAPP_AUTH_TEMPLATE: "dah_verify",
  INFOBIP_WHATSAPP_AUTH_TEMPLATE_LANGUAGE: "en",
};
// Settings that could change which paths the servers take are cleared, so
// the suites see a known configuration whatever is in .env.
const neutral = { PAYMENT_PROVIDER: "", ALLOW_SANDBOX_PAYMENTS: "", GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "", GOOGLE_OAUTH_DEV_ISSUER_URL: "", RESEND_API_KEY: "" };

const SUITES = [
  { name: "whatsapp-otp", group: "prod", file: "tests/e2e/whatsapp-otp.e2e.ts", env: { ...fakeInfobip, FAKE_INFOBIP_URL: `http://127.0.0.1:${INFOBIP_PORT}` }, withServerLog: true },
  { name: "sessions", group: "prod", file: "tests/e2e/sessions.e2e.ts" },
  { name: "legal-cms", group: "prod", file: "tests/e2e/legal-cms.e2e.ts" },
  { name: "payments-offline", group: "prod", file: "tests/e2e/payments-offline.e2e.ts", env: { E2E_PAYMENT_MODE: "disabled" } },
  { name: "payments-live", group: "dev", file: "tests/e2e/payments-live.e2e.ts", env: { LOCAL_TEST_PAYMENTS_SECRET: "e2e-local-test-secret" } },
  { name: "google-signin", group: "dev", file: "tests/e2e/google-signin.e2e.ts", env: { GOOGLE_OAUTH_DEV_ISSUER_URL: `http://localhost:${OIDC_PORT}` } },
].filter((s) => only.length === 0 || only.some((o) => s.name.includes(o)));

function start(name, cmd, cmdArgs, env) {
  const log = join(logDir, `${name}.log`);
  const fd = openSync(log, "a");
  const child = spawn(cmd, cmdArgs, { env: { ...process.env, ...env }, stdio: ["ignore", fd, fd], detached: true });
  children.push(child);
  return { child, log };
}
function stop(child) {
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    /* already gone */
  }
}
async function waitFor(url, timeoutMs = 120_000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`timed out waiting for ${url}`);
}
function runSuite(suite, base, serverLog) {
  console.log(`\n=== ${suite.name} (${suite.group}) ===`);
  const r = spawnSync("npx", ["tsx", "--require", "./tests/setup.cjs", suite.file], {
    stdio: "inherit",
    env: { ...process.env, ...neutral, ...suite.env, E2E_BASE_URL: base, ...(suite.withServerLog ? { E2E_SERVER_LOG: serverLog } : {}) },
  });
  return r.status === 0;
}

const results = [];
try {
  start("fake-infobip", "node", ["tests/e2e/fake-infobip.mjs"], { FAKE_INFOBIP_PORT: String(INFOBIP_PORT) });
  start("fake-oidc", "node", ["tests/e2e/fake-oidc.mjs"], { FAKE_OIDC_PORT: String(OIDC_PORT) });

  const prodSuites = SUITES.filter((s) => s.group === "prod");
  if (prodSuites.length) {
    if (!skipBuild) {
      console.log("Building (production)...");
      const b = spawnSync("npm", ["run", "build"], { stdio: "inherit", env: { ...process.env, ...neutral } });
      if (b.status !== 0) throw new Error("build failed");
    }
    const prod = start("server-prod", "npx", ["next", "start", "-p", String(PROD_PORT)], { ...neutral, ...fakeInfobip });
    await waitFor(`http://localhost:${PROD_PORT}/api/health`);
    for (const s of prodSuites) results.push([s.name, runSuite(s, `http://localhost:${PROD_PORT}`, prod.log)]);
    stop(prod.child);
  }

  const devSuites = SUITES.filter((s) => s.group === "dev");
  if (devSuites.length) {
    const dev = start("server-dev", "npx", ["next", "dev", "-p", String(DEV_PORT)], {
      ...neutral,
      ...fakeInfobip, // booking notifications must never reach a real WhatsApp account
      NODE_ENV: "development",
      NEXT_PUBLIC_SITE_URL: `http://localhost:${DEV_PORT}`,
      PAYMENT_PROVIDER: "local-test",
      LOCAL_TEST_PAYMENTS_SECRET: "e2e-local-test-secret",
      GOOGLE_CLIENT_ID: "e2e-google-client",
      GOOGLE_CLIENT_SECRET: "test-secret",
      GOOGLE_OAUTH_DEV_ISSUER_URL: `http://localhost:${OIDC_PORT}`,
    });
    await waitFor(`http://localhost:${DEV_PORT}/api/health`, 240_000);
    for (const s of devSuites) results.push([s.name, runSuite(s, `http://localhost:${DEV_PORT}`, dev.log)]);
    stop(dev.child);
  }
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  results.push(["runner", false]);
} finally {
  for (const c of children) stop(c);
}

console.log("\n=== e2e summary ===");
for (const [name, ok] of results) console.log(`${ok ? "ok  " : "FAIL"} ${name}`);
console.log(`server/fake logs: ${logDir}`);
process.exit(results.every(([, ok]) => ok) && results.length > 0 ? 0 : 1);
