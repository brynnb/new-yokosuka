import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  authoredControllerFamilyIndexFromMt5,
  controllerFamilyIndexFromMt5NodeFlag,
  inspectMt5ControllerFamily,
} from "../src/Mt5ControllerFamily.js";
import {
  NPC_CONTROLLER_FAMILY_BY_MODEL,
} from "../play/data/npc-controller-target-families.web.js";

function characterModel(modelCode) {
  return fs.readFileSync(
    path.resolve(`play/assets/characters/${modelCode}.CHRM`),
  );
}

test("decodes the executable's controller-family node-type rule", () => {
  assert.equal(controllerFamilyIndexFromMt5NodeFlag(0x7001), 0);
  assert.equal(controllerFamilyIndexFromMt5NodeFlag(0x1700b), 10);
  assert.equal(controllerFamilyIndexFromMt5NodeFlag(0x7015), 20);
  assert.equal(controllerFamilyIndexFromMt5NodeFlag(0x003e), 0);
});

test("reads authored target families from exact CHRM hierarchy roots", () => {
  assert.equal(authoredControllerFamilyIndexFromMt5(
    characterModel("GKA_L"),
  ), 4);
  assert.equal(authoredControllerFamilyIndexFromMt5(
    characterModel("PAN_L"),
  ), 10);
  assert.equal(authoredControllerFamilyIndexFromMt5(
    characterModel("NZM_L"),
  ), 15);
});

test("generated NPC families reproduce every scheduled CHRM root", () => {
  const manifest = JSON.parse(
    fs.readFileSync("play/data/scheduled-actor-assets.json", "utf8"),
  );
  for (const asset of manifest.assets) {
    const inspection = inspectMt5ControllerFamily(
      characterModel(asset.assetModelCode),
    );
    assert.equal(inspection.hasAuthoredFamilyType, true, asset.assetModelCode);
    assert.equal(
      NPC_CONTROLLER_FAMILY_BY_MODEL[asset.assetModelCode],
      inspection.familyIndex,
      asset.assetModelCode,
    );
    assert.equal(
      NPC_CONTROLLER_FAMILY_BY_MODEL[asset.mappedModelCode],
      inspection.familyIndex,
      asset.mappedModelCode,
    );
  }
});

test("all retained RAM family observations agree with Disc metadata", () => {
  const ramEvidence = JSON.parse(
    fs.readFileSync(
      "tools/evidence/npc-controller-family-evidence.json",
      "utf8",
    ),
  );
  for (const model of ramEvidence.models) {
    if (!Number.isInteger(model.consistentFamilyIndex)) continue;
    assert.equal(
      NPC_CONTROLLER_FAMILY_BY_MODEL[model.modelCode],
      model.consistentFamilyIndex,
      model.modelCode,
    );
  }
});
