// Public API of the email module — every existing `@/lib/email` import
// keeps working unchanged (this directory resolves the same way the old
// lib/email.ts single file did).
export * from "./messages";
export { isEmailConfigured, sendEmail } from "./core";
