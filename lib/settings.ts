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
