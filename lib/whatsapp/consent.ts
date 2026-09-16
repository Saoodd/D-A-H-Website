import "server-only";
import { normalizePhoneToE164 } from "../phone";

// The one WhatsApp consent gate — shared by the Admin Communications
// Center's manual broadcasts (lib/communications/audience.ts) AND every
// automatic use-case notification (lib/notifications/notify.ts). Consent
// (Vendor.whatsappOptInAt/whatsappOptOutAt) is deliberately separate from
// phone VERIFICATION (Vendor.phoneVerifiedAt) — a verified number proves
// it's reachable, not that the vendor agreed to be messaged proactively.
export function whatsappEligibility(vendor: {
  phone: string;
  whatsappOptInAt: Date | null;
  whatsappOptOutAt: Date | null;
}): { eligible: boolean; reason: string | null } {
  const normalized = normalizePhoneToE164(vendor.phone);
  if (!normalized) return { eligible: false, reason: "Invalid phone number" };
  if (!vendor.whatsappOptInAt) return { eligible: false, reason: "No WhatsApp opt-in" };
  if (vendor.whatsappOptOutAt && vendor.whatsappOptOutAt > vendor.whatsappOptInAt) {
    return { eligible: false, reason: "Opted out of WhatsApp" };
  }
  return { eligible: true, reason: null };
}
