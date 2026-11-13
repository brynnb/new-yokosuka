import { spawn } from "node:child_process";
import { closeSync, constants, lstatSync, openSync, readFileSync } from "node:fs";
import path from "node:path";

export const TEST_MEMORY_MIB = Object.freeze({ node: 2048, browser: 8192 });
export const TEST_NODE_HEAP_MIB = 1024;

function readUnifiedCgroup(pid, readFile) {
  const filename = `/proc/${pid}/cgroup`;
  const source = readFile(filename, "utf8");
  if (typeof source !== "string") throw new Error(`Invalid cgroup data in ${filename}`);
  const lines = source.split("\n");
  if (lines.some(line => line && !/^\d+:[^:]*:\/.*$/.test(line))) throw new Error(`Malformed cgroup membership in ${filename}`);
  const unified = lines.filter(line => line.startsWith("0::"));
  if (unified.length !== 1) throw new Error(`Bounded tests require exactly one cgroup v2 membership in ${filename}`);
  // Keep colons and ordinary spaces in names. Normalizing /../ would conceal
  // a process outside a container's cgroup namespace instead of rejecting it.
  const relative = unified[0].slice(3);
  if (!relative.startsWith("/") || relative.length > 4096 || /[\x00-\x1f\x7f]/.test(relative)
    || (relative !== "/" && relative.slice(1).split("/").some(part => !part || part === "." || part === ".."))) {
    throw new Error(`Invalid absolute cgroup v2 membership in ${filename}`);
  }
  return relative;
}

function readTestMemoryBudget(kind, readFile, record = {}) {
  const expected = TEST_MEMORY_MIB[kind];
  if (!expected) throw new Error(`Unknown test resource budget: ${kind}`);
  record.pid = process.pid;
  record.cgroup = readUnifiedCgroup("self", readFile);
  const directory = path.join("/sys/fs/cgroup", record.cgroup);
  record.memoryMaxBytes = readFile(path.join(directory, "memory.max"), "utf8").trim();
  record.swapMaxBytes = readFile(path.join(directory, "memory.swap.max"), "utf8").trim();
  const memory = record.memoryMaxBytes, swap = record.swapMaxBytes;
  if (!/^\d+$/.test(memory) || BigInt(memory) > BigInt(expected * 1024 * 1024) || swap !== "0") {
    throw new Error(`Refusing unbounded tests: expected <=${expected} MiB RAM and no swap, received memory.max=${memory}, memory.swap.max=${swap}`);
  }
  return record;
}

export function assertTestMemoryBudget(kind) {
  readTestMemoryBudget(kind, readFileSync);
}

// CDP must come from the locally launched test browser in this PID namespace.
// Inspect only its reported PIDs: never enumerate or stop other browsers.
// A descendant shares its ancestor's aggregate budget even if its own local
// memory.max is "max". A sibling app scope does not share that test budget.
export function assertBrowserProcessMemoryBudget(processInfo, { readFile = readFileSync } = {}) {
  const evidence = { budgetMiB: TEST_MEMORY_MIB.browser, worker: {}, processes: [], failures: [] };
  try {
    readTestMemoryBudget("browser", readFile, evidence.worker);
    if (!Array.isArray(processInfo) || processInfo.length === 0 || processInfo.length > 256) {
      throw new Error("Browser CDP must report between 1 and 256 processes");
    }
    evidence.reportedProcessCount = processInfo.length;
    const byPid = new Map();
    for (const [index, info] of processInfo.entries()) {
      if (!Number.isSafeInteger(info?.id) || info.id <= 0
        || typeof info.type !== "string" || !info.type || info.type.length > 64 || /[\x00-\x1f\x7f]/.test(info.type)) {
        throw new Error(`Invalid browser CDP process entry ${index}: positive integer PID and process type required`);
      }
      if (!byPid.has(info.id)) byPid.set(info.id, { pid: info.id, types: [], cgroup: null, relation: "unreadable" });
      const record = byPid.get(info.id);
      if (!record.types.includes(info.type)) record.types.push(info.type);
    }
    evidence.processes = [...byPid.values()];
    if (!evidence.processes.some(record => record.types.includes("browser"))) {
      throw new Error("Browser CDP did not report a browser process");
    }
    for (const record of evidence.processes) {
      try {
        record.cgroup = readUnifiedCgroup(record.pid, readFile);
        record.relation = record.cgroup === evidence.worker.cgroup ? "same"
          : evidence.worker.cgroup === "/" || record.cgroup.startsWith(evidence.worker.cgroup + "/") ? "descendant" : "outside";
        if (record.relation === "outside") evidence.failures.push({ pid: record.pid, reason: "outside_worker_cgroup" });
      } catch (error) {
        record.readError = { code: error.code || "INVALID_CGROUP", message: error.message.slice(0, 300) };
        evidence.failures.push({ pid: record.pid, reason: "unverifiable_process" });
      }
    }
    evidence.worker.cgroupAfter = readUnifiedCgroup("self", readFile);
    if (evidence.worker.cgroupAfter !== evidence.worker.cgroup) {
      evidence.failures.push({ pid: process.pid, reason: "worker_cgroup_changed" });
    }
    if (evidence.failures.length) {
      throw new Error(`Browser processes are not verified inside the bounded worker cgroup: ${evidence.failures.map(failure => `${failure.reason} PID ${failure.pid}`).join(", ")}`);
    }
    return evidence;
  } catch (cause) {
    const error = new Error(`Browser resource containment failed: ${cause.message}`, { cause });
    error.resourceEvidence = evidence;
    throw error;
  }
}

// One lock per user, shared by host/Docker launchers and by every worktree.
// Do not unlink it on completion: replacing a locked inode breaks exclusion.
export function testLockPath() {
  if (process.platform !== "linux") {
    throw new Error("Bounded test launchers require Linux (flock and cgroup memory limits).");
  }
  const directory = process.env.XDG_RUNTIME_DIR || `/run/user/${process.getuid()}`;
  const info = lstatSync(directory);
  if (!info.isDirectory() || info.uid !== process.getuid() || (info.mode & 0o077)) {
    throw new Error("Test lock requires a private, user-owned runtime directory.");
  }
  const filename = path.join(directory, "new-yokosuka-tests.lock");
  const fd = openSync(filename, constants.O_WRONLY | constants.O_CREAT | constants.O_NOFOLLOW, 0o600);
  closeSync(fd);
  return filename;
}

export function dockerTestMemoryArgs() {
  return ["--memory", `${TEST_MEMORY_MIB.browser}m`,
    // Docker's swap budget is RAM + swap; equal values prohibit swapping.
    "--memory-swap", `${TEST_MEMORY_MIB.browser}m`,
    // Host IPC shares the host's /dev/shm. Use private, bounded Chromium IPC.
    "--ipc", "private", "--shm-size", "512m", "--ulimit", "core=0"];
}

export function hostTestServiceArgs({ unit, command, args, cwd, kind, env = process.env }) {
  const memory = TEST_MEMORY_MIB[kind];
  if (!memory) throw new Error(`Unknown test resource budget: ${kind}`);
  return ["--user", "--quiet", "--wait", "--collect", "--pipe",
    "--expand-environment=no", `--unit=${unit}`, `--working-directory=${cwd}`,
    `--property=MemoryMax=${memory}M`, "--property=MemorySwapMax=0",
    // Kill the test service's whole process tree on OOM, not unrelated apps.
    "--property=OOMPolicy=kill", "--property=KillMode=control-group",
    "--property=LimitCORE=0", "--property=TimeoutStopSec=5s",
    ...Object.keys(env).filter(key => /^[A-Za-z_][A-Za-z_0-9]*$/.test(key))
      .map(key => `--setenv=${key}`),
    "--", command, ...args];
}

export function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", ...options });
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
}

export async function runSerialTest(command, args, { cleanup, ...options } = {}) {
  const lock = testLockPath();
  let interrupted = null;
  const cleanupOwned = async () => {
    if (cleanup) await cleanup();
  };
  const cancel = signal => {
    interrupted ||= signal;
    // The launcher supplies one exact unit/container it created. Never scan
    // process names, kill MCP servers, or touch other tasks' browser sessions.
    void cleanupOwned().catch(error => console.error(error.message));
  };
  const onInterrupt = () => cancel("SIGINT");
  const onTerminate = () => cancel("SIGTERM");
  process.on("SIGINT", onInterrupt);
  process.on("SIGTERM", onTerminate);
  try {
    const result = await runProcess("flock", ["--exclusive", "--nonblock",
      "--conflict-exit-code", "75", lock, command, ...args], options);
    if (result.code === 75) {
      console.error("Another New Yokosuka test run is active. Wait for it to finish, then retry.");
    }
    return interrupted ? { code: interrupted === "SIGINT" ? 130 : 143, signal: interrupted } : result;
  } finally {
    await cleanupOwned();
    process.off("SIGINT", onInterrupt);
    process.off("SIGTERM", onTerminate);
  }
}
