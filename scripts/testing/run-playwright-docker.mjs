#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { playwrightRendererOptions } from "./playwright-renderer.mjs";
import { dockerTestMemoryArgs, runSerialTest, runProcess, TEST_MEMORY_MIB } from "./test-resources.mjs";

const require = createRequire(import.meta.url);
const cwd = resolve(import.meta.dirname, "../..");
const playwrightVersion = require("@playwright/test/package.json").version;
playwrightRendererOptions(); // Reject implicit software opt-outs before Docker starts.
const software = process.env.PLAYWRIGHT_SOFTWARE_RENDERING === "true";
const gpuImage = `new-yokosuka-playwright-gpu:${playwrightVersion}`;
const image = process.env.PLAYWRIGHT_DOCKER_IMAGE
  || (software ? `mcr.microsoft.com/playwright:v${playwrightVersion}-noble` : gpuImage);
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
const containerName = `new-yokosuka-playwright-${process.pid}-${randomUUID()}`;
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
  ...dockerTestMemoryArgs(),
  "--cpus",
  process.env.PLAYWRIGHT_DOCKER_CPUS?.trim() || "4",
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
if (software) {
  dockerArgs.push("-e", "PLAYWRIGHT_SOFTWARE_RENDERING=true");
} else {
  const requestedDevice = process.env.PLAYWRIGHT_DRI_DEVICE?.trim();
  const devices = requestedDevice ? [requestedDevice] : existsSync("/dev/dri")
    ? readdirSync("/dev/dri").filter(name => /^renderD\d+$/.test(name)).map(name => `/dev/dri/${name}`)
    : [];
  if (!devices.length || devices.some(device => !/^\/dev\/dri\/renderD\d+$/.test(device)
    || !existsSync(device) || !statSync(device).isCharacterDevice())) {
    throw new Error("Hardware rendering requires an available /dev/dri/renderD* device");
  }
  for (const device of devices) dockerArgs.push("--device", device);
  for (const gid of new Set(devices.map(device => statSync(device).gid))) {
    dockerArgs.push("--group-add", String(gid));
  }
  if (!process.env.PLAYWRIGHT_DOCKER_IMAGE
    && spawnSync(dockerBinary, ["image", "inspect", gpuImage], { stdio: "ignore" }).status !== 0) {
    const build = spawnSync(dockerBinary, ["build", "--build-arg", `PLAYWRIGHT_VERSION=${playwrightVersion}`,
      "-t", gpuImage, "-f", "scripts/testing/Dockerfile.playwright-gpu", "scripts/testing"], { cwd, stdio: "inherit" });
    if (build.error || build.status !== 0) throw new Error(build.error?.message || "GPU browser image build failed");
  }
}
if (useHostNetwork) {
  dockerArgs.splice(2, 0, "--network", "host");
} else {
  dockerArgs.splice(2, 0, "--add-host", "host.docker.internal:host-gateway");
}
dockerArgs.push(image, "node", "scripts/testing/run-tests.mjs", "--inside", "playwright", ...playwrightArgs.slice(2));

console.info(`[Playwright Docker] renderer=${software ? "explicit-software" : "hardware-gpu"} RAM=${TEST_MEMORY_MIB.browser} MiB swap=0 serial image=${image}`);

try {
  const result = await runSerialTest(dockerBinary, dockerArgs, {
    cwd,
    cleanup: () => runProcess(dockerBinary, ["rm", "-f", containerName], { cwd, stdio: "ignore" }),
  });
  process.exitCode = result.code ?? 1;
} catch (error) {
  console.error(
    error.code === "ENOENT" ? "Docker/flock is not installed or is not on PATH." : error.message,
  );
  process.exitCode = 1;
}
