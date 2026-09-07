import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { test } from "node:test";
import manifest from "../play/data/shenmue1-scheduled-scene-objects.json" with {
  type: "json",
};
import {
  ScheduledSceneObjectCatalog,
} from "../play/world/ScheduledSceneObjectCatalog.js";

function sha256(filename) {
  return crypto.createHash("sha256").update(
    fs.readFileSync(filename),
  ).digest("hex");
}

test("Shenmue I scheduled scene-object catalog covers every asset area", () => {
  const models = JSON.parse(fs.readFileSync("public/models.json", "utf8"));
  const assetAreas = new Set(models.flatMap((model) => {
    const match = model.match(/^S[123]_([A-Z0-9]{4})_/);
    return match ? [match[1]] : [];
  }));
  assert.deepEqual(
    new Set(manifest.coverage.areas.map((entry) => entry.area)),
    assetAreas,
  );
  assert.equal(manifest.summary.cataloguedAreaCount, assetAreas.size);
  assert.equal(manifest.summary.runtimePlacementManifestCount, 10);
  assert.equal(
    manifest.coverage.runtimePlacedModels.length,
    manifest.summary.runtimePlacementCount,
  );
  assert.ok(manifest.coverage.runtimePlacedModels.some((placement) => (
    placement.area === "MA00"
    && placement.objectTag === "SHT2"
    && placement.model === "S3_M3FB_B49M2S2G.MT5"
  )));
  for (const generated of manifest.generatedFrom.runtimePlacements) {
    assert.equal(sha256(generated.path), generated.sha256);
  }
});

test("all extracted scene-object commands resolve to reviewed D000 shutters", () => {
  assert.equal(manifest.summary.scheduledOperationCount, 41);
  assert.equal(manifest.summary.assignedScheduledOperationCount, 41);
  assert.equal(manifest.summary.reviewedSceneObjectCount, 16);
  assert.equal(manifest.summary.reviewedObjectPlacementCount, 16);
  assert.equal(manifest.summary.enabledAreaCount, 1);
  assert.equal(manifest.summary.enabledWorldCount, 1);

  const enabled = manifest.coverage.areas.filter(
    (area) => area.activationStatus === "reviewed-and-enabled",
  );
  assert.deepEqual(enabled.map((area) => area.area), ["D000"]);
  assert.equal(enabled[0].scheduledOperationCount, 41);
  assert.equal(enabled[0].reviewedSceneObjectCount, 16);
  assert.equal(
    manifest.worlds[0].sceneObjects.reduce(
      (total, definition) => total + definition.events.length,
      0,
    ),
    41,
  );
});

test("catalog selects definitions by world without a Dobuita special case", () => {
  const catalog = new ScheduledSceneObjectCatalog(manifest);
  assert.equal(catalog.workCount("dobuita"), 16);
  assert.equal(catalog.definitions("dobuita").length, 16);
  assert.equal(catalog.workCount("sakuragaoka"), 0);
  assert.deepEqual(catalog.definitions("sakuragaoka"), []);
});
