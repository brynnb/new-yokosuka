import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const entrySource = await readFile(
  new URL("../play/play.js", import.meta.url),
  "utf8",
);
const applicationSource = await readFile(
  new URL("../play/PlayApplication.js", import.meta.url),
  "utf8",
);

test("play entrypoint only constructs and starts PlayApplication", () => {
  assert.match(entrySource, /import \{ PlayApplication \}/);
  assert.match(entrySource, /new PlayApplication\(\)/);
  assert.match(entrySource, /application\.start\(\)/);
  assert.ok(entrySource.split("\n").length <= 6);
});

test("PlayApplication owns startup and startup-error presentation", () => {
  assert.match(applicationSource, /export class PlayApplication/);
  assert.match(applicationSource, /async start\(\)/);
  assert.match(applicationSource, /showStartupError\(error\)/);
});
