import "server-only";
import { prisma } from "./prisma";

export async function getSettings() {
  const existing = await prisma.settings.findUnique({ where: { id: "singleton" } });
  if (existing) return existing;
  return prisma.settings.create({
    data: { id: "singleton", defaultAcceptanceDeadlineHours: 24 },
  });
}

export async function getAcceptanceDeadlineHours(eventAcceptanceDeadlineHours: number | null) {
  if (eventAcceptanceDeadlineHours && eventAcceptanceDeadlineHours > 0) {
    return eventAcceptanceDeadlineHours;
  }
  const settings = await getSettings();
  return settings.defaultAcceptanceDeadlineHours;
}

/** Whether this event allows a vendor to hold/book more than one booth
 *  (still capped at MAX_BOOTHS_PER_BOOKING — see lib/constants.ts) — an
 *  explicit per-event override always wins; otherwise falls back to the
 *  site-wide default, same nullable-override pattern as
 *  getAcceptanceDeadlineHours above. */
export async function getAllowMultipleBooths(eventAllowMultipleBooths: boolean | null) {
  if (eventAllowMultipleBooths !== null) return eventAllowMultipleBooths;
  const settings = await getSettings();
  return settings.allowMultipleBoothsDefault;
}
