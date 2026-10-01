import { spawn } from "node:child_process";
import { closeSync, constants, lstatSync, openSync, readFileSync } from "node:fs";
import path from "node:path";

export const TEST_MEMORY_MIB = Object.freeze({ node: 2048, browser: 8192 });
export const TEST_NODE_HEAP_MIB = 1024;

export function assertTestMemoryBudget(kind) {
  const expected = TEST_MEMORY_MIB[kind];
  if (!expected) throw new Error(`Unknown test resource budget: ${kind}`);
  const relative = readFileSync("/proc/self/cgroup", "utf8").split("\n")
    .find(line => line.startsWith("0::"))?.slice(3);
  if (relative === undefined) throw new Error("Bounded tests require cgroup v2.");
  const directory = path.join("/sys/fs/cgroup", relative);
  const memory = readFileSync(path.join(directory, "memory.max"), "utf8").trim();
  const swap = readFileSync(path.join(directory, "memory.swap.max"), "utf8").trim();
  if (!/^\d+$/.test(memory) || Number(memory) > expected * 1024 * 1024 || swap !== "0") {
    throw new Error(`Refusing unbounded tests: expected <=${expected} MiB RAM and no swap, received memory.max=${memory}, memory.swap.max=${swap}`);
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
