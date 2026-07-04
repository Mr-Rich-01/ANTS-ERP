import { createWriteStream, existsSync, mkdirSync, statSync, unlinkSync } from "node:fs";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";

const composeFile = process.env.COMPOSE_FILE || "docker-compose.staging.yml";
const envFile = process.env.ENV_FILE || ".env.staging";
const backupDir = process.env.BACKUP_DIR || "backups/staging";

function usage() {
  console.log(`Usage:
  pnpm ops:staging:backup
  node scripts/ops/staging-backup-db.mjs

Creates a PostgreSQL custom-format dump from the staging Docker database.
Output: backups/staging/ants-erp-staging-YYYYMMDD-HHMMSS.dump

Environment overrides:
  COMPOSE_FILE=docker-compose.staging.yml
  ENV_FILE=.env.staging
  BACKUP_DIR=backups/staging`);
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  usage();
  process.exit(0);
}

if (!existsSync(envFile)) {
  console.error(`Missing ${envFile}. Create it from .env.staging.example before backing up staging.`);
  process.exit(1);
}

mkdirSync(backupDir, { recursive: true });

const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "").replace("T", "-");
const backupFile = join(backupDir, `ants-erp-staging-${timestamp}.dump`);

console.log(`Creating staging PostgreSQL backup: ${backupFile}`);

const output = createWriteStream(backupFile, { flags: "wx" });
const child = spawn(
  "docker",
  [
    "compose",
    "--env-file",
    envFile,
    "-f",
    composeFile,
    "exec",
    "-T",
    "postgres",
    "sh",
    "-c",
    'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-privileges',
  ],
  { stdio: ["ignore", "pipe", "inherit"] },
);

try {
  const [closeResult] = await Promise.all([once(child, "close"), pipeline(child.stdout, output)]);
  const [code] = closeResult;

  if (code !== 0) {
    unlinkSync(backupFile);
    process.exit(code || 1);
  }

  const { size } = statSync(backupFile);
  if (size <= 0) {
    unlinkSync(backupFile);
    console.error(`Backup file is empty: ${backupFile}`);
    process.exit(1);
  }

  console.log(`Backup created: ${backupFile} (${size} bytes)`);
} catch (error) {
  try {
    unlinkSync(backupFile);
  } catch {
    // ignore cleanup failure
  }
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
