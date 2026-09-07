import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import config from "../vite.config.js";

test("locally vendored engines bypass Vite's persistent dependency cache", () => {
  assert.ok(
    config.optimizeDeps.exclude.includes("@brynnb/lucky-break-engine"),
  );
});

test("local model middleware searches every available extraction root per file", async () => {
  const source = await readFile(
    new URL("../vite.config.js", import.meta.url),
    "utf8",
  );
  assert.match(source, /const localModelRoots = \[/);
  assert.match(
    source,
    /localModelRoots\s*\.map\(\(root\) => resolve\(root, filename\)\)\s*\.find\(existsSync\)/,
  );
});

test("development R2 requests use Vite's same-origin asset proxy", () => {
  const proxy = config.server.proxy["/r2-assets"];
  assert.equal(
    proxy.target,
    "https://pub-c3aa1dfd53424ee9af1b87ad19954589.r2.dev",
  );
  assert.equal(proxy.changeOrigin, true);
  assert.equal(
    proxy.rewrite("/r2-assets/shenmue/S1_JHD0_MAP.MT5"),
    "/shenmue/S1_JHD0_MAP.MT5",
  );
});
