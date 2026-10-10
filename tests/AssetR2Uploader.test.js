import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createHash } from "node:crypto";
import { buildRuntimePlan } from "../tools/runtime-assets.mjs";
import {buildSceneryUploadPlan} from '../tools/assets/scenery-publication.mjs';
import {gunzipSync} from 'node:zlib';
import uploadWorker from '../tools/r2-asset-upload-worker/worker.js';

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

test('scenery publication compresses losslessly without changing decoded content keys', t => {
  const root = temporaryDirectory(t);
  const directory = path.join(root, '.disc-work/scenery-bundle/dobuita');
  fs.mkdirSync(directory, {recursive: true});
  fs.mkdirSync(path.join(root, 'play/data'), {recursive: true});
  const bytes = Buffer.from('original decoded scene');
  const record = {size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex')};
  for (const file of ['world.json', 'world.bin']) fs.writeFileSync(path.join(directory, file), bytes);
  fs.writeFileSync(path.join(root, 'play/data/scenery-bundles.generated.json'), JSON.stringify({
    schema: 'new-yokosuka-scenery-catalog-v1', bundles: {dobuita: {manifest: record, binary: record, policyHashes: {}}}}));
  const plan = buildSceneryUploadPlan(root);
  assert.equal(plan.length, 2);
  assert.equal(parseArguments(['--game', 'scenery']).game, 'scenery');
  for (const item of plan) {
    assert.deepEqual(gunzipSync(fs.readFileSync(item.filePath)), bytes);
    assert.equal(item.contentEncoding, 'gzip');
    assert.match(item.key, new RegExp(`/scenery/${record.sha256}/dobuita/`));
  }
  fs.writeFileSync(path.join(directory, 'world.bin'), 'changed');
  assert.throws(() => buildSceneryUploadPlan(root), /Unregistered scenery change/);
});

test('the shared R2 bridge retains transfer encoding and compressed checksum metadata', async () => {
  let options;
  const response = await uploadWorker.fetch(new Request('http://localhost/', {
    method: 'PUT', body: 'compressed bytes', headers: {'x-r2-object-key': 'shenmue/scenery/test/world.bin',
      'x-r2-sha256': 'a'.repeat(64), 'content-type': 'application/octet-stream', 'content-encoding': 'gzip',
      'cache-control': 'public, max-age=31536000, immutable'}}),
    {BUCKET: {put: async (_key, _body, metadata) => {options = metadata}}});
  assert.equal(response.status, 201);
  assert.equal(options.httpMetadata.contentEncoding, 'gzip');
  assert.equal(options.customMetadata.sha256, 'a'.repeat(64));
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
  const exact = parseArguments(["--game", "runtime", "--source-path", source, "--source-path", source]);
  assert.deepEqual(buildRuntimePlan(root, exact), plan);
  assert.throws(() => buildRuntimePlan(root, { sourcePaths: ["public/music/missing.ogg"] }), /Unregistered/);
  assert.throws(() => parseArguments(["--game", "s1", "--source-path", source]), /requires/);
});
