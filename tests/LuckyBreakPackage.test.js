import test from "node:test";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("vendored pool engine contains no private source or source maps", () => {
  execFileSync(process.execPath, ["scripts/verify-lucky-break-package.mjs"], {
    cwd: fileURLToPath(new URL("..", import.meta.url)),
    stdio: "pipe",
  });
});
