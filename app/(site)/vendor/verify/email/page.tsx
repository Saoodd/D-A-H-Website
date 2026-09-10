import type { Metadata } from "next";
import { ConfirmEmailVerificationClient } from "./ConfirmEmailVerificationClient";

export const metadata: Metadata = { title: "Verify Email" };

export default async function VerifyEmailLinkPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <ConfirmEmailVerificationClient token={token || ""} />;
}
