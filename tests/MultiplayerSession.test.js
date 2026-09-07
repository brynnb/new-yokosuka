import assert from "node:assert/strict";
import test from "node:test";

test("multiplayer session module has an explicit public boundary", async () => {
  const { MultiplayerSession } = await import(
    "../play/multiplayer/MultiplayerSession.js"
  );
  assert.equal(typeof MultiplayerSession, "function");
  assert.deepEqual(
    Object.getOwnPropertyNames(MultiplayerSession.prototype)
      .filter((name) => !name.startsWith("#")),
    ["constructor", "connect"],
  );
});

test("warp coordinates accept spaces, commas, or both", async () => {
  const { parseWarpCoordinates } = await import(
    "../play/multiplayer/MultiplayerSession.js"
  );
  assert.deepEqual(parseWarpCoordinates("1 2 3"), [1, 2, 3]);
  assert.deepEqual(parseWarpCoordinates("1,2,3"), [1, 2, 3]);
  assert.deepEqual(parseWarpCoordinates("-1.5, 2 .75"), [-1.5, 2, 0.75]);
  assert.deepEqual(parseWarpCoordinates("1e2, -2E-1, +3.0"), [100, -0.2, 3]);
});

test("warp coordinates reject anything except three finite numbers", async () => {
  const { parseWarpCoordinates } = await import(
    "../play/multiplayer/MultiplayerSession.js"
  );
  for (const input of [
    "",
    "1 2",
    "1 2 3 4",
    "1 two 3",
    "1;drop table players 2 3",
    "1 OR 1=1,2,3",
    "NaN 2 3",
    "Infinity 2 3",
    "1e999 2 3",
  ]) {
    assert.equal(parseWarpCoordinates(input), null, input);
  }
});

test("multiplayer session forwards authoritative script event callbacks", async () => {
  const source = await import("node:fs/promises").then(fs => (
    fs.readFile(new URL(
      "../play/multiplayer/MultiplayerSession.js",
      import.meta.url,
    ), "utf8")
  ));
  assert.match(source, /onScriptEventYield: game\.onScriptEventYield/);
  assert.match(source, /onScriptEventRejected: game\.onScriptEventRejected/);
});
