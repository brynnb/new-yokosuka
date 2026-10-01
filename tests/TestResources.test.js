import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { dockerTestMemoryArgs, hostTestServiceArgs, testLockPath } from "../scripts/testing/test-resources.mjs";

const cwd = path.resolve(import.meta.dirname, "..");

test("browser containers have a hard RAM limit, no swap and private bounded IPC", () => {
  const args = dockerTestMemoryArgs();
  const value = name => args[args.indexOf(name) + 1];
  assert.equal(value("--memory"), "8192m");
  assert.equal(value("--memory-swap"), value("--memory"));
  assert.equal(value("--ipc"), "private");
  assert.equal(value("--shm-size"), "512m");
  assert.equal(value("--ulimit"), "core=0");
});

test("host budgets cover child processes and cannot expand test arguments as environment variables", () => {
  const args = hostTestServiceArgs({ unit: "test.service", command: "/usr/bin/node",
    args: ["-e", "console.log('$NAME')"], cwd, kind: "node", env: { NAME: "private" } });
  assert.ok(args.includes("--property=MemoryMax=2048M"));
  assert.ok(args.includes("--property=MemorySwapMax=0"));
  assert.ok(args.includes("--property=OOMPolicy=kill"));
  assert.ok(args.includes("--property=KillMode=control-group"));
  assert.ok(args.includes("--property=LimitCORE=0"));
  assert.ok(args.includes("--expand-environment=no"));
  assert.ok(args.includes("--setenv=NAME"));
  assert.ok(!args.some(arg => arg.includes("private")), "do not print environment values in command arguments");
});

test("the real bounded Node launcher rejects an overlapping test run", () => {
  const directory = mkdtempSync("/var/tmp/new-yokosuka-lock-proof-");
  const env = { ...process.env, XDG_RUNTIME_DIR: directory };
  try {
    const result = spawnSync("flock", ["--exclusive", path.join(directory, "new-yokosuka-tests.lock"), process.execPath,
      "scripts/testing/run-tests.mjs", "node", "--help"], { cwd, env, encoding: "utf8", timeout: 5000 });
    assert.equal(result.status, 75);
    assert.match(result.stderr, /Another New Yokosuka test run is active/);
  } finally {
    rmSync(directory, { recursive: true });
  }
});

test("cancelling a launcher stops its owned service and releases the test lock", async () => {
  const directory = mkdtempSync("/var/tmp/new-yokosuka-cancel-proof-");
  // Isolate the lock, not the systemd user manager. systemctl resolves its bus
  // via XDG_RUNTIME_DIR, so this private fixture must retain the real user bus.
  symlinkSync(path.join(path.dirname(testLockPath()), "bus"), path.join(directory, "bus"));
  symlinkSync(path.join(path.dirname(testLockPath()), "systemd"), path.join(directory, "systemd"), "dir");
  const env = { ...process.env, XDG_RUNTIME_DIR: directory };
  const probe = `const fs=require('node:fs'); const relative=fs.readFileSync('/proc/self/cgroup','utf8').trim().split(':').at(-1);
    console.log('READY ' + relative.split('/').at(-1)); setInterval(()=>{},1000);`;
  const child = spawn(process.execPath, ["scripts/testing/run-tests.mjs", "script", "-e", probe], { cwd, env });
  let output = "";
  let stderr = "";
  child.stderr.on("data", chunk => { stderr = (stderr + chunk).slice(-2000); });
  let unit = null;
  const completed = new Promise(resolve => child.once("exit", code => resolve(code)));
  const timer = setTimeout(() => child.kill("SIGTERM"), 5000);
  try {
    await new Promise((resolve, reject) => {
      child.stdout.on("data", chunk => {
        output += chunk;
        unit = output.match(/READY (new-yokosuka-test-[\w-]+\.service)/)?.[1] || null;
        if (unit) resolve();
      });
      child.once("error", reject);
      child.once("exit", () => reject(new Error("Probe exited before owning its test service")));
    });
    assert.equal(child.kill("SIGTERM"), true); // Only the exact child this test launched.
    const deadline = new Promise((resolve, reject) => {
      setTimeout(() => reject(new Error(`Cancellation did not finish: ${stderr} ${output.slice(-2000)}`)), 8000).unref();
    });
    assert.equal(await Promise.race([completed, deadline]), 143);
    const status = spawnSync("systemctl", ["--user", "is-active", unit], { encoding: "utf8", timeout: 5000 });
    assert.notEqual(status.status, 0);
    const retry = spawnSync(process.execPath, ["scripts/testing/run-tests.mjs", "script", "-e", "process.exit(0)"],
      { cwd, env, encoding: "utf8", timeout: 5000 });
    assert.equal(retry.status, 0, "the next run must be able to acquire the released lock");
  } finally {
    clearTimeout(timer);
    if (unit) spawnSync("systemctl", ["--user", "stop", unit], { stdio: "ignore", timeout: 5000 });
    rmSync(directory, { recursive: true });
  }
});

test("an actual user service enforces memory limits and contains an allocation runaway", () => {
  const unit = `new-yokosuka-test-budget-proof-${randomUUID()}.service`;
  const probe = `
    const fs = require('node:fs');
    const relative = fs.readFileSync('/proc/self/cgroup', 'utf8').trim().split(':').at(-1);
    const directory = '/sys/fs/cgroup' + relative;
    const budget = fs.readFileSync(directory + '/memory.max', 'utf8').trim();
    const swap = fs.readFileSync(directory + '/memory.swap.max', 'utf8').trim();
    const group = fs.readFileSync(directory + '/memory.oom.group', 'utf8').trim();
    console.log(JSON.stringify({ budget, swap, group }));
    // Verify the tiny OS budget BEFORE allocating. Never reproduce a runaway
    // against host-wide memory, even if a future launcher regression occurs.
    if (budget !== '134217728' || swap !== '0' || group !== '1') process.exit(42);
    const retained = [];
    setInterval(() => retained.push(Buffer.alloc(8 * 1024 * 1024, 1)), 10);
  `;
  const args = hostTestServiceArgs({ unit, command: process.execPath, args: ["-e", probe], cwd, kind: "node" })
    .map(arg => arg === "--property=MemoryMax=2048M" ? "--property=MemoryMax=128M" : arg);
  try {
    const result = spawnSync("systemd-run", args, { encoding: "utf8", timeout: 10_000, maxBuffer: 16_384 });
    assert.equal(result.error, undefined);
    assert.match(result.stdout, /"budget":"134217728","swap":"0","group":"1"/);
    assert.notEqual(result.status, 0, "runaway must terminate inside its test budget");
    assert.notEqual(result.status, 42, "the OS must actually enforce the requested properties");
  } finally {
    spawnSync("systemctl", ["--user", "stop", unit], { stdio: "ignore", timeout: 10_000 });
  }
});
