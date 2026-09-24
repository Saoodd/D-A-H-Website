// Runs once per server instance at startup (Next.js instrumentation hook).
// Logs which environment variables are missing and what each one disables;
// never logs values, and never throws — a misconfigured integration should
// degrade that one feature, not take the whole site down on deploy.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { reportEnv } = await import("./lib/env");
    reportEnv();
  }
}
