import { createReadStream, existsSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { pipeline } from "node:stream/promises";

const composeFile = process.env.COMPOSE_FILE || "docker-compose.staging.yml";
const envFile = process.env.ENV_FILE || ".env.staging";
const restoreTargetEnv = process.env.RESTORE_TARGET_ENV || "staging";
const requiredConfirmation = "I_UNDERSTAND_THIS_DESTROYS_STAGING_DATA";

function usage() {
  console.log(`Usage:
  CONFIRM_RESTORE=I_UNDERSTAND_THIS_DESTROYS_STAGING_DATA pnpm ops:staging:restore -- backups/staging/<file>.dump
  node scripts/ops/staging-restore-db.mjs backups/staging/<file>.dump

Destructively replaces the staging/local PostgreSQL database with a custom-format dump.

Required:
  CONFIRM_RESTORE=I_UNDERSTAND_THIS_DESTROYS_STAGING_DATA

Optional:
  RESTORE_TARGET_ENV=staging|local  (default: staging)
  COMPOSE_FILE=docker-compose.staging.yml
  ENV_FILE=.env.staging`);
}

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  usage();
  process.exit(0);
}

const backupFile = process.argv[2];

if (!backupFile) {
  usage();
  process.exit(1);
}

if (!existsSync(backupFile)) {
  console.error(`Backup file not found: ${backupFile}`);
  process.exit(1);
}

if (restoreTargetEnv === "production") {
  console.error("Refusing to restore into production from this staging/local script.");
  process.exit(1);
}

if (!["staging", "local"].includes(restoreTargetEnv)) {
  console.error(`RESTORE_TARGET_ENV must be staging or local. Got: ${restoreTargetEnv}`);
  process.exit(1);
}

if (process.env.CONFIRM_RESTORE !== requiredConfirmation) {
  console.error(`Restore is destructive. Set CONFIRM_RESTORE=${requiredConfirmation} to continue.`);
  process.exit(1);
}

if (!existsSync(envFile)) {
  console.error(`Missing ${envFile}. Create it from .env.staging.example before restoring staging.`);
  process.exit(1);
}

function runDockerCompose(args, options = {}) {
  const result = spawnSync("docker", ["compose", "--env-file", envFile, "-f", composeFile, ...args], {
    stdio: options.stdio || "inherit",
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0 && !options.allowFailure) {
    process.exit(result.status || 1);
  }
}

console.log(`Restoring ${backupFile} into ${restoreTargetEnv} database defined by ${composeFile}.`);
console.log("Stopping web/worker to avoid active application connections during restore.");

runDockerCompose(["up", "-d", "postgres"]);
runDockerCompose(["stop", "web", "worker"], { stdio: "ignore", allowFailure: true });

const restore = spawn(
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
    'dropdb --if-exists --force -U "$POSTGRES_USER" "$POSTGRES_DB" && createdb -U "$POSTGRES_USER" "$POSTGRES_DB" && pg_restore --no-owner --no-privileges -U "$POSTGRES_USER" -d "$POSTGRES_DB"',
  ],
  { stdio: ["pipe", "inherit", "inherit"] },
);

try {
  const [closeResult] = await Promise.all([once(restore, "close"), pipeline(createReadStream(backupFile), restore.stdin)]);
  const [code] = closeResult;

  if (code !== 0) {
    process.exit(code || 1);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

console.log("Restore completed. Run migrations if needed, then start staging and validate health/login.");
