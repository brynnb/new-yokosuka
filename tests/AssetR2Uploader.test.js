import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createHash } from "node:crypto";
import { buildRuntimePlan } from "../tools/runtime-assets.mjs";

import {
  buildShenmue1Plan,
  buildShenmue2Plan,
  parseArguments,
} from "../tools/lib/R2AssetUploadPlan.js";

function temporaryDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "new-yokosuka-r2-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test("shared uploader keeps Shenmue I in the flat runtime namespace", (t) => {
  const root = temporaryDirectory(t);
  fs.mkdirSync(path.join(root, "models"));
  fs.writeFileSync(path.join(root, "models", "MODEL.MT5"), "model");
  fs.writeFileSync(path.join(root, "models", "AREA_textures.bin"), "textures");
  fs.writeFileSync(path.join(root, "models.json"), JSON.stringify(["MODEL.MT5"]));

  const plan = buildShenmue1Plan(root, "shenmue");
  assert.deepEqual(plan.map((item) => item.key), [
    "shenmue/AREA_textures.bin",
    "shenmue/MODEL.MT5",
    "shenmue/models.json",
  ]);
  assert.equal(plan.at(-1).phase, "catalog");
});

test("shared uploader gives Shenmue II separate model and texture paths", (t) => {
  const root = temporaryDirectory(t);
  fs.mkdirSync(path.join(root, "models"));
  fs.mkdirSync(path.join(root, "textures"));
  fs.writeFileSync(path.join(root, "models", "MAP.MT7"), "model");
  fs.writeFileSync(path.join(root, "textures", "PACK.bin"), "textures");
  fs.writeFileSync(path.join(root, "viewer-models.json"), JSON.stringify({
    models: [{ filename: "MAP.MT7", texturePack: "PACK.bin" }],
  }));

  const plan = buildShenmue2Plan(root, "shenmue");
  assert.deepEqual(plan.map((item) => item.key), [
    "shenmue/shenmue2/models/MAP.MT7",
    "shenmue/shenmue2/textures/PACK.bin",
    "shenmue/shenmue2/models.json",
  ]);
  assert.equal(plan.at(-1).filePath, path.join(root, "viewer-models.json"));
  assert.equal(plan.at(-1).phase, "catalog");
});

test("Shenmue II plans reject catalogs whose referenced files are absent", (t) => {
  const root = temporaryDirectory(t);
  fs.mkdirSync(path.join(root, "models"));
  fs.mkdirSync(path.join(root, "textures"));
  fs.writeFileSync(path.join(root, "viewer-models.json"), JSON.stringify({
    models: [{ filename: "MISSING.MT7" }],
  }));

  assert.throws(
    () => buildShenmue2Plan(root, "shenmue"),
    /missing model: MISSING\.MT7/,
  );
});

test("CLI requires an explicit game and supports external S2 staging", () => {
  assert.throws(() => parseArguments(["--dry-run"]), /--game must be/);
  const options = parseArguments([
    "--game", "s2",
    "--s2-root", "../staging",
    "--dry-run",
  ]);
  assert.equal(options.game, "s2");
  assert.equal(options.s2Root, path.resolve("../staging"));
  assert.equal(options.dryRun, true);
});

test("runtime publication can select new audio without requiring unrelated restored assets", (t) => {
  const root = temporaryDirectory(t);
  fs.mkdirSync(path.join(root, "src"));
  const source = "public/music/shenmue2/example.ogg";
  fs.mkdirSync(path.dirname(path.join(root, source)), { recursive: true });
  fs.writeFileSync(path.join(root, source), "audio");
  const sha256 = createHash("sha256").update("audio").digest("hex");
  fs.writeFileSync(path.join(root, "src/runtime-assets.generated.json"), JSON.stringify({ assets: {
    [source]: { sha256, size: 5 },
    "play/assets/unrestored.bin": { sha256, size: 5 },
  } }));
  const options = parseArguments(["--game", "runtime", "--source-prefix", "public/music/shenmue2/",
    "--request-timeout-ms", "15000"]);
  assert.equal(options.requestTimeoutMs, 15000);
  const plan = buildRuntimePlan(root, options);
  assert.equal(plan.length, 1);
  assert.match(plan[0].key, /\/public\/music\/shenmue2\/example\.ogg$/);
  assert.throws(() => parseArguments(["--game", "s2", "--source-prefix", "public/music"]), /requires/);
  assert.throws(() => parseArguments(["--game", "runtime", "--source-prefix", "public/../music"]), /Invalid/);
  assert.throws(() => parseArguments(["--game", "runtime", "--request-timeout-ms", "0"]), /timeout/);
});
