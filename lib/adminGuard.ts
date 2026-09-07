import "server-only";
import { getAdminSession } from "./auth";

export async function requireAdmin(): Promise<boolean> {
  return getAdminSession();
}
