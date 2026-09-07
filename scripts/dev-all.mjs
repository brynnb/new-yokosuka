import { spawn, spawnSync } from "node:child_process";
import {
  existsSync,
  readFileSync,
} from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  nextAvailablePort,
  portFromAddress,
  requestedPort,
} from "./dev-port-selection.mjs";
import { prepareDevPostgres } from "./dev-postgres.mjs";
import { prepareDevYarnCompiler } from "./dev-yarn-compiler.mjs";
import { resolveServerRepo } from "./server-repo.mjs";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const serverRoot = resolveServerRepo({ projectRoot });

function loadEnvironmentFile(path, environment) {
  if (!existsSync(path)) return;
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match || environment[match[1]] !== undefined) continue;
    let value = match[2].trim();
    if (
      (value.startsWith("\"") && value.endsWith("\""))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    environment[match[1]] = value;
  }
}

const childEnvironment = { ...process.env };
for (const path of [
  resolve(serverRoot, "server.env"),
  resolve(projectRoot, ".env"),
  resolve(projectRoot, ".env.local"),
]) {
  loadEnvironmentFile(path, childEnvironment);
}
const preferredServerPort = requestedPort(
  childEnvironment.DEV_SERVER_PORT,
  portFromAddress(childEnvironment.HTTP_ADDR, 8080),
);
const preferredVitePort = requestedPort(childEnvironment.VITE_DEV_PORT, 5173);
const serverPort = await nextAvailablePort(preferredServerPort);
const vitePort = await nextAvailablePort(preferredVitePort);
const devOrigins = [
  `http://127.0.0.1:${vitePort}`,
  `http://localhost:${vitePort}`,
];
const allowedOrigins = [
  ...(childEnvironment.ALLOWED_ORIGINS || "").split(","),
  ...devOrigins,
].map((origin) => origin.trim()).filter(Boolean);
Object.assign(childEnvironment, {
  HTTP_ADDR: `127.0.0.1:${serverPort}`,
  NEW_YOKOSUKA_DEV_SERVER_PORT: String(serverPort),
  VITE_DEV_PORT: String(vitePort),
  ALLOWED_ORIGINS: [...new Set(allowedOrigins)].join(","),
  COOKIE_SECURE: childEnvironment.COOKIE_SECURE || "false",
});
const yarnCompiler = prepareDevYarnCompiler({
  environment: childEnvironment,
  projectRoot: serverRoot,
});
const developmentDatabase = await prepareDevPostgres({
  environment: childEnvironment,
  projectRoot,
});
if (yarnCompiler.configured) {
  console.log("[dev:all] Importing reviewed official Yarn scripts");
  const imported = spawnSync(
    "go",
    ["run", "./cmd/script-import", "-builtin", "all"],
    {
      cwd: serverRoot,
      env: childEnvironment,
      stdio: "inherit",
    },
  );
  if (imported.error) throw imported.error;
  if (imported.status !== 0) {
    developmentDatabase.stop();
    throw new Error("reviewed official Yarn scripts could not be imported");
  }
}
const taskDefinitions = [
  ["multiplayer server", "go", ["run", "./cmd/server"], serverRoot],
  [
    "Vite",
    npmCommand,
    [
      "run",
      "dev",
      "--",
      "--host",
      "127.0.0.1",
      "--port",
      String(vitePort),
      "--strictPort",
    ],
    projectRoot,
  ],
];

console.log(`[dev:all] Game:   http://127.0.0.1:${vitePort}/play/`);
console.log(`[dev:all] Server: http://127.0.0.1:${serverPort}`);
if (serverPort !== preferredServerPort || vitePort !== preferredVitePort) {
  console.log("[dev:all] One or more preferred ports were occupied; using free ports.");
}

const tasks = taskDefinitions.map(([name, command, args, cwd]) => ({
  name,
  child: spawn(command, args, {
    cwd,
    detached: process.platform !== "win32",
    env: childEnvironment,
    stdio: "inherit",
  }),
}));

let stopping = false;
let exitCode = 0;
let forceStopTimer = null;
const exited = new Set();
process.once("exit", () => developmentDatabase.stop());

function signalTask(task, signal) {
  if (task.child.exitCode !== null || task.child.signalCode !== null) return;
  try {
    if (process.platform === "win32") {
      task.child.kill(signal);
    } else {
      process.kill(-task.child.pid, signal);
    }
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
}

function stopAll(signal, code) {
  if (stopping) return;
  stopping = true;
  exitCode = code;
  for (const task of tasks) signalTask(task, signal);
  forceStopTimer = setTimeout(() => {
    for (const task of tasks) signalTask(task, "SIGKILL");
  }, 3000);
  forceStopTimer.unref();
}

function finishIfReady() {
  if (exited.size !== tasks.length) return;
  if (forceStopTimer) clearTimeout(forceStopTimer);
  process.exitCode = exitCode;
}

for (const task of tasks) {
  task.child.on("error", (error) => {
    console.error(`[dev:all] Could not start ${task.name}:`, error.message);
    stopAll("SIGTERM", 1);
  });
  task.child.on("exit", (code, signal) => {
    exited.add(task);
    if (!stopping) {
      const reason = signal ? `signal ${signal}` : `exit code ${code}`;
      console.error(`[dev:all] ${task.name} stopped (${reason}).`);
      stopAll("SIGTERM", code || 1);
    }
    finishIfReady();
  });
}

process.on("SIGINT", () => stopAll("SIGINT", 130));
process.on("SIGTERM", () => stopAll("SIGTERM", 143));
