import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

import {
  nextAvailablePort,
  requestedPort,
} from "./dev-port-selection.mjs";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0 && !options.allowFailure) {
    const detail = String(result.stderr || result.stdout || "").trim();
    throw new Error(
      `${command} ${args.join(" ")} failed`
      + (detail ? `: ${detail}` : ""),
    );
  }
  return result;
}

function postgresBinDirectory(environment) {
  if (environment.POSTGRES_BIN) return resolve(environment.POSTGRES_BIN);
  const result = run("pg_config", ["--bindir"], {
    allowFailure: true,
    capture: true,
  });
  if (result.status === 0 && result.stdout.trim()) {
    return result.stdout.trim();
  }
  throw new Error(
    "PostgreSQL development tools were not found. Install PostgreSQL, "
    + "set POSTGRES_BIN, or provide DATABASE_URL.",
  );
}

function runningPort(dataDirectory) {
  const pidPath = join(dataDirectory, "postmaster.pid");
  if (!existsSync(pidPath)) return null;
  const lines = readFileSync(pidPath, "utf8").split(/\r?\n/);
  return requestedPort(lines[3], 0) || null;
}

export function developmentDatabaseName(environment) {
  const databaseName = (
    environment.DEV_POSTGRES_DATABASE ?? "new_yokosuka_server"
  ).trim();
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(databaseName)) {
    throw new Error(
      "DEV_POSTGRES_DATABASE must be a lowercase PostgreSQL identifier",
    );
  }
  return databaseName;
}

export async function prepareDevPostgres({
  environment,
  projectRoot,
  log = console.log,
}) {
  if (environment.DATABASE_URL) {
    return { stop() {} };
  }

  const databaseName = developmentDatabaseName(environment);

  const binDirectory = postgresBinDirectory(environment);
  const executable = (name) => join(
    binDirectory,
    process.platform === "win32" ? `${name}.exe` : name,
  );
  const developmentDirectory = join(projectRoot, ".dev", "postgres");
  const dataDirectory = join(developmentDirectory, "data");
  const socketDirectory = join(developmentDirectory, "socket");
  const logPath = join(developmentDirectory, "postgres.log");
  mkdirSync(socketDirectory, { recursive: true });

  if (!existsSync(join(dataDirectory, "PG_VERSION"))) {
    mkdirSync(dataDirectory, { recursive: true });
    log("[dev:all] Initializing local PostgreSQL data in .dev/postgres/data");
    run(executable("initdb"), [
      "--pgdata",
      dataDirectory,
      "--username",
      "postgres",
      "--auth",
      "trust",
      "--no-locale",
      "--encoding",
      "UTF8",
    ]);
  }

  const status = run(executable("pg_ctl"), [
    "--pgdata",
    dataDirectory,
    "status",
  ], {
    allowFailure: true,
    capture: true,
  });
  let port = status.status === 0 ? runningPort(dataDirectory) : null;
  let startedHere = false;
  if (!port) {
    port = await nextAvailablePort(
      requestedPort(environment.DEV_POSTGRES_PORT, 55432),
    );
    run(executable("pg_ctl"), [
      "--pgdata",
      dataDirectory,
      "--log",
      logPath,
      "--options",
      `-p ${port} -h 127.0.0.1 -k ${socketDirectory}`,
      "start",
      "--wait",
    ]);
    startedHere = true;
  }

  const connectionArgs = [
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--username",
    "postgres",
  ];
  const databaseExists = run(executable("psql"), [
    ...connectionArgs,
    "--dbname",
    "postgres",
    "--tuples-only",
    "--no-align",
    "--command",
    `SELECT 1 FROM pg_database WHERE datname = '${databaseName}'`,
  ], { capture: true });
  if (databaseExists.stdout.trim() !== "1") {
    run(executable("createdb"), [...connectionArgs, databaseName]);
  }

  environment.DATABASE_URL =
    `postgresql://postgres@127.0.0.1:${port}/${databaseName}?sslmode=disable`;
  log(`[dev:all] PostgreSQL: ${environment.DATABASE_URL}`);

  let stopped = false;
  return {
    stop() {
      if (stopped || !startedHere) return;
      stopped = true;
      run(executable("pg_ctl"), [
        "--pgdata",
        dataDirectory,
        "stop",
        "--mode",
        "fast",
        "--wait",
      ], { allowFailure: true, capture: true });
    },
  };
}
