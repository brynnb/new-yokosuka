import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { assertBrowserProcessMemoryBudget, dockerTestMemoryArgs, hostTestServiceArgs, testLockPath } from "../scripts/testing/test-resources.mjs";

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


function browserResourceFixture({ worker = "/tests/run.service", memory = "8589934592", swap = "0", groups = {} } = {}) {
  const files = new Map([
    ["/proc/self/cgroup", `0::${worker}\n`],
    [path.join("/sys/fs/cgroup", worker, "memory.max"), memory + "\n"],
    [path.join("/sys/fs/cgroup", worker, "memory.swap.max"), swap + "\n"],
    ...Object.entries(groups).map(([pid, group]) => [`/proc/${pid}/cgroup`, `0::${group}\n`]),
  ]);
  const reads = [];
  const readFile = (filename, encoding) => {
    reads.push(filename);
    assert.equal(encoding, "utf8");
    if (!files.has(filename)) throw Object.assign(new Error(`No fixture for ${filename}`), { code: "ENOENT" });
    const value = files.get(filename);
    if (value instanceof Error) throw value;
    return value;
  };
  return { files, reads, readFile };
}

test("CDP browser, renderer, GPU and utility processes share one aggregate budget across descendants", () => {
  const fixture = browserResourceFixture({ worker: "/tests/run:one.service ", groups: {
    41: "/tests/run:one.service ", 42: "/tests/run:one.service /renderer", 43: "/tests/run:one.service /gpu/nested",
  } });
  fixture.files.set("/proc/41/cgroup", "7:cpu:/legacy\n0::/tests/run:one.service \n");
  const evidence = assertBrowserProcessMemoryBudget([
    { id: 41, type: "browser" }, { id: 42, type: "renderer" }, { id: 43, type: "GPU" }, { id: 43, type: "utility" },
  ], fixture);
  assert.equal(evidence.worker.memoryMaxBytes, "8589934592");
  assert.equal(evidence.worker.swapMaxBytes, "0");
  assert.equal(evidence.worker.cgroupAfter, evidence.worker.cgroup);
  assert.deepEqual(evidence.processes.map(record => record.relation), ["same", "descendant", "descendant"]);
  assert.deepEqual(evidence.processes[2].types, ["GPU", "utility"]);
  assert.equal(fixture.reads.filter(filename => filename === "/proc/43/cgroup").length, 1);
  assert.deepEqual([...new Set(fixture.reads)].sort(), [...fixture.files.keys()].sort(), "read only the supplied browser PIDs and the bounded worker's files");
});

test("a sibling app scope, parent, or deceptive path prefix cannot escape the aggregate browser budget", () => {
  for (const outside of ["/user.slice/app-chromium.scope", "/tests/run.service-other", "/tests"]) {
    const fixture = browserResourceFixture({ groups: { 41: "/tests/run.service", 42: outside } });
    assert.throws(() => assertBrowserProcessMemoryBudget([
      { id: 41, type: "browser" }, { id: 42, type: "GPU" },
    ], fixture), error => {
      assert.equal(error.resourceEvidence.processes[0].relation, "same");
      assert.equal(error.resourceEvidence.processes[1].relation, "outside");
      assert.equal(error.resourceEvidence.processes[1].cgroup, outside);
      assert.deepEqual(error.resourceEvidence.failures, [{ pid: 42, reason: "outside_worker_cgroup" }]);
      return true;
    });
  }
});

test("a bounded container cgroup namespace root accepts descendants but rejects namespace escapes", () => {
  const fixture = browserResourceFixture({ worker: "/", groups: { 41: "/", 42: "/renderer" } });
  const processes = [{ id: 41, type: "browser" }, { id: 42, type: "renderer" }];
  assert.deepEqual(assertBrowserProcessMemoryBudget(processes, fixture).processes.map(record => record.relation), ["same", "descendant"]);
  fixture.files.set("/proc/42/cgroup", "0::/../outside\n");
  assert.throws(() => assertBrowserProcessMemoryBudget(processes, fixture), error => {
    assert.equal(error.resourceEvidence.processes[1].relation, "unreadable");
    assert.equal(error.resourceEvidence.processes[1].readError.code, "INVALID_CGROUP");
    return true;
  });
});

test("browser verification rejects invalid PIDs before constructing a process read", () => {
  for (const id of [undefined, null, "41", 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    const fixture = browserResourceFixture();
    assert.throws(() => assertBrowserProcessMemoryBudget([{ id, type: "browser" }], fixture));
    assert.ok(fixture.reads.every(filename => filename === "/proc/self/cgroup" || filename.startsWith("/sys/fs/cgroup/")));
  }
});

test("browser verification requires its own browser PID, not just other reported processes", () => {
  for (const processInfo of [[], [{ id: 42, type: "renderer" }]]) {
    const fixture = browserResourceFixture({ groups: { 42: "/tests/run.service" } });
    assert.throws(() => assertBrowserProcessMemoryBudget(processInfo, fixture));
    assert.ok(!fixture.reads.includes("/proc/42/cgroup"));
  }
});

test("malformed unified worker memberships fail before reading a cgroup budget", () => {
  for (const source of ["1:memory:/tests/run.service\n", "0::/one\n0::/two\n", "0::relative\n", "0::/tests/run.service\ntrailing-garbage\n",
    "0::/tests/../escape\n", "0::/tests//run\n", "0::/tests/run/\n", "0::/tests/./run\n", "0::/tests/\u0000run\n"]) {
    const fixture = browserResourceFixture();
    fixture.files.set("/proc/self/cgroup", source);
    assert.throws(() => assertBrowserProcessMemoryBudget([{ id: 41, type: "browser" }], fixture));
    assert.deepEqual(fixture.reads, ["/proc/self/cgroup"]);
  }
});

test("unbounded RAM or swap fails before any browser process can pass containment", () => {
  for (const limits of [{ memory: "max" }, { memory: "8589934593" }, { swap: "1" }, { swap: "max" }]) {
    const fixture = browserResourceFixture(limits);
    assert.throws(() => assertBrowserProcessMemoryBudget([{ id: 41, type: "browser" }], fixture), error => {
      assert.equal(error.resourceEvidence.worker.memoryMaxBytes, limits.memory || "8589934592");
      assert.equal(error.resourceEvidence.worker.swapMaxBytes, limits.swap || "0");
      return true;
    });
    assert.ok(!fixture.reads.includes("/proc/41/cgroup"));
  }
});

test("an exited or unreadable CDP process fails closed without hiding a separate scope violation", () => {
  for (const code of ["ENOENT", "EACCES"]) {
    const fixture = browserResourceFixture({ groups: { 41: "/tests/run.service", 43: "/user.slice/app-chromium.scope" } });
    fixture.files.set("/proc/42/cgroup", Object.assign(new Error("Process membership unavailable"), { code }));
    assert.throws(() => assertBrowserProcessMemoryBudget([
      { id: 41, type: "browser" }, { id: 42, type: "renderer" }, { id: 43, type: "utility" },
    ], fixture), error => {
      assert.equal(error.resourceEvidence.processes[1].readError.code, code);
      assert.equal(error.resourceEvidence.processes[2].relation, "outside");
      assert.deepEqual(error.resourceEvidence.failures, [
        { pid: 42, reason: "unverifiable_process" }, { pid: 43, reason: "outside_worker_cgroup" },
      ]);
      return true;
    });
  }
});

test("worker migration cannot substitute an unverified cgroup for the budget-checked ancestor", () => {
  const fixture = browserResourceFixture({ groups: { 41: "/tests/run.service" } });
  let selfReads = 0;
  const readFile = (filename, encoding) => filename === "/proc/self/cgroup" && ++selfReads === 2
    ? "0::/user.slice/app-node.scope\n" : fixture.readFile(filename, encoding);
  assert.throws(() => assertBrowserProcessMemoryBudget([{ id: 41, type: "browser" }], { readFile }), error => {
    assert.equal(error.resourceEvidence.worker.cgroup, "/tests/run.service");
    assert.equal(error.resourceEvidence.worker.cgroupAfter, "/user.slice/app-node.scope");
    assert.deepEqual(error.resourceEvidence.failures, [{ pid: process.pid, reason: "worker_cgroup_changed" }]);
    return true;
  });
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
