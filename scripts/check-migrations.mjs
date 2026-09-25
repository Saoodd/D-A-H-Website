// Fails when a migration contains SQL that can lose or rewrite production
// data (dropping or retyping columns, dropping tables, bulk UPDATE/DELETE,
// NOT NULL on existing columns, renames) unless a human has marked it as
// reviewed. Runs as part of `npm run check`.
//
// To mark a deliberate destructive step as reviewed, put this line in the
// migration.sql (with the reason and the release that stopped using it):
//   -- destructive-reviewed: <why this is safe>
// See docs/DATABASE.md for the two-step removal process.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const DIR = "prisma/migrations";

// Already applied to production before this check existed. Each was
// reviewed at the time; listed here so the check only guards new work.
const HISTORICAL = new Set([
  "20260907131521_event_pricing_categories_floorplan_image",
  "20260907133953_vendor_accounts",
  "20260908150000_backfill_booth_prices",
  "20260909095240_vendor_username",
  "20260909154518_acceptance_3h_default_and_booth_selection_session",
  "20260911163520_email_always_verified_phone_admin_verify",
  "20260915202511_repair_paid_applications_flagged_expired",
  "20260916103327_remove_booth_selection_timer",
  "20260916125728_whatsapp_otp_migration",
]);

const RULES = [
  [/\bDROP\s+TABLE\b/i, "drops a table"],
  [/\bDROP\s+COLUMN\b/i, "drops a column"],
  [/\bALTER\s+COLUMN\s+"?\w+"?\s+(SET\s+DATA\s+)?TYPE\b/i, "changes a column type"],
  [/\bALTER\s+COLUMN\s+"?\w+"?\s+SET\s+NOT\s+NULL\b/i, "makes an existing column NOT NULL"],
  [/\bRENAME\s+(COLUMN|TO)\b/i, "renames a table or column"],
  [/\bTRUNCATE\b/i, "truncates a table"],
  [/^\s*DELETE\s+FROM\b/im, "deletes rows"],
  [/^\s*UPDATE\s+"?\w+"?/im, "rewrites existing rows"],
  [/\bDROP\s+TYPE\b/i, "drops an enum/type"],
];

const problems = [];
for (const name of readdirSync(DIR).sort()) {
  const file = join(DIR, name, "migration.sql");
  if (!existsSync(file) || HISTORICAL.has(name)) continue;
  const sql = readFileSync(file, "utf8");
  if (/^\s*--\s*destructive-reviewed:\s*\S/m.test(sql)) continue;
  const withoutComments = sql.replace(/--.*$/gm, "");
  for (const [re, what] of RULES) if (re.test(withoutComments)) problems.push(`${name}: ${what}`);
}

if (problems.length) {
  console.error("Migration safety check failed:\n  " + problems.join("\n  "));
  console.error("\nIf this is intentional, add `-- destructive-reviewed: <reason>` to the migration after reading docs/DATABASE.md.");
  process.exit(1);
}
console.log("Migration safety check passed.");
