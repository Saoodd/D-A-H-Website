// "Continue with Google" end to end against tests/e2e/fake-oidc.mjs. Needs
// a NON-production server with GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET=test-secret
// and GOOGLE_OAUTH_DEV_ISSUER_URL pointing at the fake (scripts/e2e.mjs).
// Covers: no account creation from Google, linking only while signed in,
// no duplicate identities, state/nonce/PKCE/replay protection, open
// redirects, closed accounts, unlinking.
import { BASE, check, cleanup, finish, Jar, makeVendor, PASSWORD, prisma, setup } from "./_lib";

const FAKE = process.env.GOOGLE_OAUTH_DEV_ISSUER_URL ?? "http://localhost:4555";

async function go(jar: Jar, url: string) {
  const res = await fetch(url, { redirect: "manual", headers: { cookie: jar.header() } });
  jar.take(res);
  return { status: res.status, location: res.headers.get("location") ?? "" };
}
const setUser = (sub: string, email: string, mode = "ok") => fetch(`${FAKE}/set?sub=${sub}&email=${email}&mode=${mode}`);

/** start -> fake Google -> callback; returns the callback's redirect. */
async function flow(jar: Jar, intent: "login" | "link", next = "/vendor/applications", tamper?: (cb: URL) => void) {
  const s = await go(jar, `${BASE}/api/auth/google/start?intent=${intent}&next=${encodeURIComponent(next)}`);
  if (!s.location.startsWith(FAKE)) return { step: "start", ...s, cbUrl: "" };
  const a = await go(jar, s.location);
  const cb = new URL(a.location);
  tamper?.(cb);
  const c = await go(jar, cb.toString());
  return { step: "callback", ...c, cbUrl: cb.toString() };
}
const q = (loc: string) => new URL(loc, BASE).searchParams.get("google");
const path = (loc: string) => new URL(loc, BASE).pathname;
async function passwordLogin(jar: Jar, username: string) {
  jar.take(await fetch(`${BASE}/api/vendor/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ identifier: username, password: PASSWORD }) }));
}
// Read-only probe: an unknown application id answers 404 when signed in, 401 when not.
const signedIn = async (jar: Jar) => (await fetch(`${BASE}/api/applications/none/status`, { headers: { cookie: jar.header() } })).status === 404;

async function main() {
  await setup();
  const A = await makeVendor({ tag: "ga" });
  const B = await makeVendor({ tag: "gb" });
  const subA = `sub-a-${Date.now()}`;
  const subB = `sub-b-${Date.now()}`;
  try {
    await setUser(subA, "a@gmail.test");
    const before = await prisma.vendor.count();
    let j = new Jar();
    let r = await flow(j, "login");
    check("unlinked Google account can't sign in (not_linked)", path(r.location) === "/vendor/login" && q(r.location) === "not_linked", r);
    check("...and no vendor account is created", (await prisma.vendor.count()) === before);
    check("...and no session cookie is set", !j.c.has("dah_vendor_session"));
    check("flow cookie cleared after the callback", !j.c.has("dah_oauth_google"), [...j.c.keys()]);

    j = new Jar();
    r = await flow(j, "link");
    check("linking while signed out -> login page", r.step === "start" && path(r.location) === "/vendor/login", r);

    const ja = new Jar();
    await passwordLogin(ja, A.username);
    r = await flow(ja, "link");
    check("signed-in vendor links Google", path(r.location) === "/vendor/profile" && q(r.location) === "linked", r);
    const idA = await prisma.vendorIdentity.findFirst({ where: { vendorId: A.id } });
    check("identity stores Google's subject and verified email", idA?.providerAccountId === subA && idA?.email === "a@gmail.test", idA);

    j = new Jar();
    r = await flow(j, "login", "/vendor/applications");
    check("Google sign-in goes to the requested page", path(r.location) === "/vendor/applications", r);
    check("...signed in as that vendor", j.c.has("dah_vendor_session") && (await signedIn(j)));

    j = new Jar();
    r = await flow(j, "login", "//evil.example/steal");
    check("open redirect via next is neutralised", path(r.location) === "/vendor/dashboard" && new URL(r.location, BASE).host === new URL(BASE).host, r);

    const jb = new Jar();
    await passwordLogin(jb, B.username);
    r = await flow(jb, "link");
    check("another vendor can't link an already-linked Google account (taken)", q(r.location) === "taken", r);
    check("still exactly one identity for that Google account", (await prisma.vendorIdentity.count({ where: { providerAccountId: subA } })) === 1);

    await setUser(subB, "b@gmail.test");
    r = await flow(ja, "link");
    check("a vendor can't link a second Google account (already)", q(r.location) === "already", r);

    await setUser(subA, "a@gmail.test");
    j = new Jar();
    r = await flow(j, "login", "/vendor/dashboard", (u) => u.searchParams.set("state", "forged"));
    check("forged state -> failed, no session", q(r.location) === "failed" && !j.c.has("dah_vendor_session"), r);
    j = new Jar();
    const okFlow = await flow(j, "login");
    const replay = await go(new Jar(), okFlow.cbUrl);
    check("callback replayed without the flow cookie -> failed", q(replay.location) === "failed", replay);

    await setUser(subA, "a@gmail.test", "badnonce");
    j = new Jar();
    r = await flow(j, "login");
    check("ID token with the wrong nonce -> failed", q(r.location) === "failed" && !j.c.has("dah_vendor_session"), r);
    await setUser(subA, "a@gmail.test", "deny");
    j = new Jar();
    r = await flow(j, "login");
    check("user cancels at Google -> cancelled", q(r.location) === "cancelled", r);
    await setUser(subA, "a@gmail.test");

    await prisma.vendor.update({ where: { id: A.id }, data: { accountStatus: "CLOSED" } });
    j = new Jar();
    r = await flow(j, "login");
    check("closed account can't sign in with Google", q(r.location) === "failed" && !j.c.has("dah_vendor_session"), r);
    await prisma.vendor.update({ where: { id: A.id }, data: { accountStatus: "ACTIVE" } });

    const un = await fetch(`${BASE}/api/vendor/identities/google/unlink`, { method: "POST", headers: { cookie: ja.header() } });
    check("unlink succeeds", un.status === 200);
    j = new Jar();
    r = await flow(j, "login");
    check("after unlinking, Google sign-in is refused (not_linked)", q(r.location) === "not_linked", r);
    check("unlink unauthenticated -> 401", (await fetch(`${BASE}/api/vendor/identities/google/unlink`, { method: "POST" })).status === 401);
  } finally {
    await cleanup({ vendorIds: [A.id, B.id] });
    await finish(`google-signin @ ${BASE}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
