import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import test from "node:test";

import {
  createNativeActivityActorCatalog,
} from "../play/events/NativeActivityActorCatalog.js";

const manifest = JSON.parse(
  fs.readFileSync("play/data/events/nativeActivityActors.json", "utf8"),
);
const assetEvidence = JSON.parse(
  fs.readFileSync("tools/evidence/native-activity-actor-assets.json", "utf8"),
);

test("native activity actors expose only exact world-scoped definitions", () => {
  const catalog = createNativeActivityActorCatalog(manifest);
  assert.deepEqual(
    catalog.forWorld("dobuita").map(actor => [actor.actorCode, actor.modelCode]),
    [
      ["SMTH", "GIB_M"],
      ["HARY", "GIE_L"],
      ["TONY", "GIJ_M"],
      ["SERA", "TUW_L"],
      ["JONZ", "GIF_L"],
      ["HRSK", "NZM_L"],
      ["YKHI", "KHI_L"],
      ["YAMA", "YMG_L"],
    ],
  );
  assert.deepEqual(catalog.forWorld("harbor"), []);
  assert.deepEqual(
    catalog.forWorld("sakuragaoka").map(actor => [actor.actorCode, actor.modelCode]),
    [
      ["HRSK", "NZM_L"],
      ["ENKI", "YAA_L"],
      ["NGSM", "YAB_L"],
    ],
  );
});

test("native activity actors reject unverified model mappings", () => {
  const invalid = structuredClone(manifest);
  invalid.worlds.dobuita[0].modelCode = "BAD_L";
  assert.throws(
    () => createNativeActivityActorCatalog(invalid),
    /unverified model/,
  );
});

test("every native activity actor asset matches exact HUMANS provenance", () => {
  assert.equal(assetEvidence.assets.length, manifest.modelCodes.length);
  for (const asset of assetEvidence.assets) {
    const model = fs.readFileSync(`play/assets/characters/${asset.modelFile}`);
    const textures = fs.readFileSync(
      `play/assets/characters/${asset.textureFile}`,
    );
    assert.equal(
      crypto.createHash("sha256").update(model).digest("hex"),
      asset.modelSha256,
    );
    assert.equal(
      crypto.createHash("sha256").update(textures).digest("hex"),
      asset.texturePackSha256,
    );
  }
});
