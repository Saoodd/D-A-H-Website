import { DisplayStatus } from "./constants";

export function getDisplayStatus(
  application: { status: string },
  hasSucceededPayment: boolean
): DisplayStatus {
  if (application.status === "PENDING") return "PENDING";
  if (application.status === "REJECTED") return "REJECTED";
  if (application.status === "ACCEPTANCE_EXPIRED") return "EXPIRED";
  if (application.status === "ACCEPTED") {
    return hasSucceededPayment ? "PAID" : "ACCEPTED_UNPAID";
  }
  return "PENDING";
}
