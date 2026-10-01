#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";
import { assertTestMemoryBudget, runSerialTest, runProcess, hostTestServiceArgs,
  TEST_MEMORY_MIB, TEST_NODE_HEAP_MIB } from "./test-resources.mjs";

const require = createRequire(import.meta.url);
const cwd = path.resolve(import.meta.dirname, "../..");
const inside = process.argv[2] === "--inside";
const [mode, ...extraArgs] = process.argv.slice(inside ? 3 : 2);
const kind = mode === "playwright" ? "browser" : "node";
let args;
if (mode === "node") {
  if (extraArgs.some(arg => /^--test-concurrency(?:=|$)/.test(arg))) {
    throw new Error("The bounded Node launcher enforces --test-concurrency=1.");
  }
  args = ["--test", "--test-concurrency=1", ...extraArgs];
} else if (mode === "playwright") {
  args = [require.resolve("@playwright/test/cli"), "test", ...extraArgs];
} else if (mode === "script" && extraArgs.length > 0) {
  args = [...extraArgs];
} else {
  throw new Error("Usage: run-tests.mjs node [test options/files] | playwright [options] | script <file> [args]");
}
args.unshift(`--max-old-space-size=${TEST_NODE_HEAP_MIB}`);
// Test children inherit NODE_OPTIONS. Append the heap ceiling while keeping
// unrelated options such as coverage/import hooks. The OS cap is final.
const env = { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS || ""} --max-old-space-size=${TEST_NODE_HEAP_MIB}`.trim() };
try {
  let result;
  if (inside) {
    // Host services and Docker both verify actual kernel limits before loading
    // any test. An unsupported/ignored setting must not become a silent opt-out.
    assertTestMemoryBudget(kind);
    result = await runProcess(process.execPath, args, { cwd, env });
  } else {
    const unit = `new-yokosuka-test-${randomUUID()}.service`;
    console.info(`[Tests] ${mode}: RAM=${TEST_MEMORY_MIB[kind]} MiB, swap=0, Node heap=${TEST_NODE_HEAP_MIB} MiB, serial`);
    result = await runSerialTest("systemd-run", hostTestServiceArgs({
      unit, command: process.execPath,
      args: [`--max-old-space-size=${TEST_NODE_HEAP_MIB}`, import.meta.filename, "--inside", mode, ...extraArgs],
      cwd, kind, env,
    }), {
      cwd, env,
      cleanup: () => runProcess("systemctl", ["--user", "stop", unit], { stdio: "ignore" }),
    });
  }
  process.exitCode = result.code ?? 1;
  if (result.code && result.code !== 75) {
    console.error("Test run failed. Memory limits remain enforced; there is no unbounded retry.");
  }
} catch (error) {
  console.error(`Could not start bounded tests: ${error.message}. Linux systemd user services and flock are required.`);
  process.exitCode = 1;
}
