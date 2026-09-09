import type { Metadata } from "next";
import { ConfirmEmailClient } from "./ConfirmEmailClient";

export const metadata: Metadata = { title: "Confirm Email" };

export default async function ConfirmEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <ConfirmEmailClient token={token || ""} />;
}
