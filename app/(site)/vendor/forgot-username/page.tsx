import type { Metadata } from "next";
import { ForgotUsernameClient } from "./ForgotUsernameClient";

export const metadata: Metadata = { title: "Forgot Username" };

export default function ForgotUsernamePage() {
  return <ForgotUsernameClient />;
}
