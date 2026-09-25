// Active sessions: device info is recorded, a vendor can revoke one device
// or all others, can never touch another vendor's sessions, and a revoked
// session stops working immediately.
import { BASE, check, cleanup, finish, makeVendor, post, prisma, vendorLogin, setup } from "./_lib";

const UA_A = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
const UA_B = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const UA_C = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";

async function main() {
  await setup();
  const v1 = await makeVendor({ tag: "s1" });
  const v2 = await makeVendor({ tag: "s2" });
  try {
    const a = await vendorLogin(v1.username, UA_A);
    const b = await vendorLogin(v1.username, UA_B);
    const c = await vendorLogin(v1.username, UA_C);
    const other = await vendorLogin(v2.username, UA_A);
    const rows = await prisma.vendorSession.findMany({ where: { vendorId: v1.id }, orderBy: { createdAt: "asc" } });
    check("3 sessions recorded with device + last-seen", rows.length === 3 && rows.every((r) => r.userAgent && r.lastSeenAt), rows.length);
    const [sa, sb] = rows;
    const otherSess = await prisma.vendorSession.findFirstOrThrow({ where: { vendorId: v2.id } });

    check("can't revoke another vendor's session (404)", (await post(`/api/vendor/sessions/${otherSess.id}/revoke`, a)).status === 404);
    check("...which stays live", !(await prisma.vendorSession.findUnique({ where: { id: otherSess.id } }))?.revokedAt);
    check("revoke one device", (await post(`/api/vendor/sessions/${sb.id}/revoke`, a)).status === 200);
    check("revoked device is signed out at once (401)", (await post(`/api/vendor/sessions/revoke-others`, b)).status === 401);
    const ro = await post(`/api/vendor/sessions/revoke-others`, a);
    check("'sign out other devices' signs out the 1 remaining", ro.status === 200 && ro.json.count === 1, ro.json);
    check("that device is now 401", (await post(`/api/vendor/sessions/revoke-others`, c)).status === 401);
    check("the current device still works", (await post(`/api/vendor/sessions/revoke-others`, a)).status === 200);
    const self = await post(`/api/vendor/sessions/${sa.id}/revoke`, a);
    check("revoking the current session signs out and clears the cookie", self.status === 200 && self.json.signedOut === true && /dah_vendor_session=;|Max-Age=0|Expires=Thu, 01 Jan 1970/.test(self.setCookie ?? ""), self);
    check("...and it's 401 afterwards", (await post(`/api/vendor/sessions/revoke-others`, a)).status === 401);
    check("unauthenticated revoke -> 401", (await post(`/api/vendor/sessions/${otherSess.id}/revoke`, null)).status === 401);
    check("the other vendor was untouched throughout", (await post(`/api/vendor/sessions/revoke-others`, other)).status === 200);
  } finally {
    await cleanup({ vendorIds: [v1.id, v2.id] });
    await finish(`sessions @ ${BASE}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
