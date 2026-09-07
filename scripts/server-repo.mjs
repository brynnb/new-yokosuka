import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_MODULE = "github.com/brynnb/new-yokosuka-server";

export const clientRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
);

export function resolveServerRepo({
  environment = process.env,
  projectRoot = clientRoot,
} = {}) {
  const configuredPath = environment.NEW_YOKOSUKA_SERVER_DIR?.trim();
  const serverRoot = resolve(
    projectRoot,
    configuredPath || "../new-yokosuka-server",
  );
  const modulePath = resolve(serverRoot, "go.mod");
  if (!existsSync(modulePath)) {
    throw new Error(
      `New Yokosuka Server was not found at ${serverRoot}. Clone `
      + "https://github.com/brynnb/new-yokosuka-server beside this repo, "
      + "or set NEW_YOKOSUKA_SERVER_DIR.",
    );
  }
  const moduleName = readFileSync(modulePath, "utf8")
    .match(/^module\s+(\S+)\s*$/m)?.[1];
  if (moduleName !== EXPECTED_MODULE) {
    throw new Error(
      `${serverRoot} is not the New Yokosuka Server repository `
      + `(expected Go module ${EXPECTED_MODULE}).`,
    );
  }
  return serverRoot;
}

export function runServerCommand(command, args, {
  environment = process.env,
  serverRoot = resolveServerRepo({ environment }),
} = {}) {
  const executable = process.platform === "win32" && command === "npm"
    ? "npm.cmd"
    : command;
  const result = spawnSync(executable, args, {
    cwd: serverRoot,
    env: environment,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...args] = process.argv.slice(2);
  if (!command) {
    console.error("usage: node scripts/server-repo.mjs COMMAND [ARG ...]");
    process.exitCode = 2;
  } else {
    try {
      process.exitCode = runServerCommand(command, args);
    } catch (error) {
      console.error(`[server-repo] ${error.message}`);
      process.exitCode = 1;
    }
  }
}
