import test from "node:test";
import assert from "node:assert/strict";
import placements from "../play/data/d000-runtime-placements.json" with {type: "json"};
import scheduledManifest from "../play/data/shenmue1-scheduled-scene-objects.json" with {type: "json"};
import fixtures from "../tools/evidence/d000-static-fixtures.json" with {type: "json"};
import {auditFixedSceneryPlacements, preparedPlacementModels} from "../tools/assets/scenery-placement-policy.js";
import {ScheduledSceneObjectCatalog} from "../play/world/ScheduledSceneObjectCatalog.js";

const sceneObjects = new ScheduledSceneObjectCatalog(scheduledManifest).definitions("dobuita");

test("prepared rigid models cover doors and vending only, with a single asset identity per model", () => {
  const models = preparedPlacementModels(placements.placements);
  assert.equal(models.length, 35);
  assert.equal(placements.placements.filter(row => models.includes(row.model)).length, 70);
  const door = placements.placements.find(row => row.runtime.staticDoorType === 2);
  const eligible = row => preparedPlacementModels([row]).includes(row.model);
  assert.equal(eligible(door), true);
  for (const changes of [{authoredMovementFile: "motion.AUTH"}, {stateDependent: true}, {inactiveBelowMap: true}]) {
    assert.equal(eligible({...door, runtime: {...door.runtime, ...changes}}), false);
  }
  for (const key of ["assetFile", "texturePackFile", "texturePackModel"]) {
    assert.deepEqual(preparedPlacementModels([door, {...door, [key]: "different-source"}]), []);
  }
});

test("Dobuita policy accounts for every placement and retains all scheduled, interactive and unknown owners", () => {
  const audit = auditFixedSceneryPlacements(placements.placements, sceneObjects, fixtures);
  assert.equal(audit.summary.total, 154);
  assert.equal(audit.summary.included, 56);
  assert.equal(audit.summary.retained, 98);
  assert.equal(audit.summary.scheduledObjectsRetained, 16);
  const included = audit.rows.filter(row => row.included);
  assert.equal(included.filter(row => row.reason === "fixed-mapinfo-proxy").length, 55);
  assert.deepEqual(included.filter(row => row.tag).map(row => row.tag), ["HDCA"]);
  for (const tag of ["CAR7", "BUS_", "BUSS", "WAGK", "TEL0", "TKOK", "BN01"]) {
    assert.equal(audit.rows.find(row => row.tag === tag).included, false, tag);
  }
  assert.equal(audit.summary.reasons["scheduled-or-paired-object"], 13);
});

test("new state ownership or changed source evidence removes approval instead of silently baking it", () => {
  const source = placements.placements.find(row => row.runtime.objectTag === "HDCA");
  const proxy = placements.placements.find(row => row.runtime.staticDoorType === 1);
  const approve = (row, evidence = fixtures) => auditFixedSceneryPlacements([row], sceneObjects, evidence).rows[0].included;
  assert.equal(approve(source), true);
  assert.equal(approve({...source, runtime: {...source.runtime, stateDependent: true}}), false);
  assert.equal(approve({...proxy, runtime: {...proxy.runtime, authoredMovementFile: "motion.AUTH"}}), false);
  assert.equal(approve({...proxy, runtime: {...proxy.runtime, staticDoorType: 2}}), false);
  const changed = structuredClone(fixtures);
  changed.fixtures.find(row => row.tag === "HDCA").directDispatch.push({operationHex: "0x001f", arguments: ["HDCA", 2]});
  assert.equal(approve(source, changed), false);
  assert.equal(approve({...source, model: "UNKNOWN.MT5", assetFile: "UNKNOWN.CHRM"}), false);
});
