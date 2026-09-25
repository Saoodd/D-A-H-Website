// `npm run build`: apply database migrations, then build Next.js.
//
// Migrations run for Production deployments and for any build outside
// Vercel (local, CI). They are SKIPPED for Vercel Preview/Development
// builds unless MIGRATE_ON_PREVIEW=true, because a Preview deployment is
// built from an unmerged branch: if Preview shares the production
// database URL, running `prisma migrate deploy` there would change the
// production schema before the change is reviewed and merged. Give
// Preview its own database (e.g. a Neon branch) before setting
// MIGRATE_ON_PREVIEW=true. See docs/DEPLOYMENT.md.
import { spawnSync } from "node:child_process";

function run(cmd, args) {
  const res = spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (res.status !== 0) process.exit(res.status ?? 1);
}

const onVercel = Boolean(process.env.VERCEL);
const vercelEnv = process.env.VERCEL_ENV; // production | preview | development
const migrate = !onVercel || vercelEnv === "production" || process.env.MIGRATE_ON_PREVIEW === "true";

if (migrate) {
  console.log(`[build] Applying database migrations (${onVercel ? `Vercel ${vercelEnv}` : "non-Vercel build"}).`);
  run("npx", ["prisma", "migrate", "deploy"]);
} else {
  console.log(
    `[build] Skipping database migrations for this Vercel ${vercelEnv} build (set MIGRATE_ON_PREVIEW=true once Preview has its own database).`
  );
}

run("npx", ["next", "build"]);
