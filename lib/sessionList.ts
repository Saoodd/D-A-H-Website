import "server-only";
import { prisma } from "./prisma";
import { describeDevice } from "./device";

// Rows for the "Active sessions" cards. Only what the owner needs to
// recognise a device: a device label and timestamps. No IP address is
// stored or shown, and the raw User-Agent never leaves the server.
export interface SessionRow {
  id: string;
  device: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  current: boolean;
}

type Row = { id: string; userAgent: string | null; createdAt: Date; lastSeenAt: Date | null };

function toRows(sessions: Row[], currentId: string): SessionRow[] {
  return sessions
    .map((s) => ({
      id: s.id,
      device: describeDevice(s.userAgent),
      createdAt: s.createdAt.toISOString(),
      lastSeenAt: s.lastSeenAt?.toISOString() ?? null,
      current: s.id === currentId,
    }))
    .sort((a, b) => Number(b.current) - Number(a.current) || (b.lastSeenAt ?? b.createdAt).localeCompare(a.lastSeenAt ?? a.createdAt));
}

const select = { id: true, userAgent: true, createdAt: true, lastSeenAt: true } as const;

export async function listVendorSessions(vendorId: string, currentId: string): Promise<SessionRow[]> {
  const sessions = await prisma.vendorSession.findMany({
    where: { vendorId, revokedAt: null, expiresAt: { gt: new Date() } },
    select,
  });
  return toRows(sessions, currentId);
}

export async function listAdminSessions(currentId: string): Promise<SessionRow[]> {
  const sessions = await prisma.adminSession.findMany({
    where: { revokedAt: null, expiresAt: { gt: new Date() } },
    select,
  });
  return toRows(sessions, currentId);
}
