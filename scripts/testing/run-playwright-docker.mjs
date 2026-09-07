#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(import.meta.url);
const cwd = resolve(import.meta.dirname, "../..");
const playwrightVersion = require("@playwright/test/package.json").version;
const image = process.env.PLAYWRIGHT_DOCKER_IMAGE
  || `mcr.microsoft.com/playwright:v${playwrightVersion}-noble`;
const dockerBinary = process.env.DOCKER || "docker";
const dockerNetwork = process.env.PLAYWRIGHT_DOCKER_NETWORK || "host";
const useHostNetwork = dockerNetwork === "host";
const appHostName = useHostNetwork ? "localhost" : "host.docker.internal";
const appUrl = process.env.E2E_APP_URL || `http://${appHostName}:5175`;
const extraArgs = process.argv.slice(2);
const hasExplicitConfig = extraArgs.some(
  argument => argument === "-c"
    || argument === "--config"
    || argument.startsWith("--config="),
);
const playwrightArgs = [
  "playwright",
  "test",
  ...(hasExplicitConfig ? [] : ["-c", "playwright.config.js"]),
  ...extraArgs,
];
const containerName = `new-yokosuka-playwright-${process.pid}`;
const dockerArgs = [
  "run",
  "--rm",
  "--init",
  "--stop-timeout",
  "5",
  "--name",
  containerName,
  "--label",
  "new-yokosuka.playwright=true",
  "--ipc",
  "host",
  "--cpus",
  process.env.PLAYWRIGHT_DOCKER_CPUS?.trim() || "6",
  "-v",
  `${cwd}:/work`,
  "-w",
  "/work",
  "-e",
  "HOME=/tmp",
  "-e",
  "PLAYWRIGHT_SKIP_WEB_SERVER=true",
  "-e",
  `E2E_APP_URL=${appUrl}`,
];

for (const key of Object.keys(process.env).sort()) {
  if (!key.startsWith("NY_E2E_")) continue;
  dockerArgs.push("-e", `${key}=${process.env[key]}`);
}
if (useHostNetwork) {
  dockerArgs.splice(2, 0, "--network", "host");
} else {
  dockerArgs.splice(2, 0, "--add-host", "host.docker.internal:host-gateway");
}
dockerArgs.push(image, "npx", ...playwrightArgs);

const result = spawnSync(dockerBinary, dockerArgs, {
  cwd,
  stdio: "inherit",
});
spawnSync(dockerBinary, ["rm", "-f", containerName], {
  cwd,
  stdio: "ignore",
});

if (result.error) {
  console.error(
    result.error.code === "ENOENT"
      ? "Docker is not installed or is not on PATH."
      : result.error.message,
  );
  process.exit(1);
}
process.exit(result.status ?? 1);
