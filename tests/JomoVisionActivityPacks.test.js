import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const codes = ["kkya", "kkyb", "kkyc", "kkyd", "kkye", "kkyf"];
const manifests = codes.map(code => JSON.parse(fs.readFileSync(
  `play/assets/hazuki/${code}/manifest.json`,
)));

test("JOMO visions retain the six exact native selector bindings", () => {
  assert.deepEqual(manifests.map(manifest => {
    const activity = manifest.activities[0];
    return [activity.slot, activity.primaryPointer, activity.secondaryPointer];
  }), [
    [50, 614163, 614176],
    [51, 614200, 614213],
    [52, 614237, 614250],
    [53, 614274, 614287],
    [54, 614311, 614324],
    [55, 614348, 614361],
  ]);
});

test("JOMO vision environments use exact persistent archive layers", () => {
  assert.deepEqual(
    manifests.map(manifest => manifest.activities[0].nativeSceneObjectStates
      ?.filter(state => state.presented).map(state => state.actorTag) || []),
    [["MAP1", "MAP2"], ["DRE1", "PNR1"], [], ["MAP3"], ["MAP3"], []],
  );
  assert.equal(manifests[1].sceneObjects.HOMR.assetPath, "play/assets/hazuki/kkya/PNX02H6G.CHRM");
  assert.equal(manifests[5].sceneObjects.RYMR.assetPath, "play/assets/hazuki/kkyb/DRGS502G.CHRM");
});

test("JOMO vision actors share byte-identical package resources", () => {
  assert.equal(manifests[3].packageActors, undefined);
  assert.equal(manifests[2].packageActors.SINF.assetPath, "play/assets/hazuki/kkyc/SIN_M.CHRM");
  assert.equal(manifests[5].packageActors.SORY.assetPath, "play/assets/characters/KOK_M.CHRM");
  assert.equal(manifests[4].motionBanks[0].path, "play/assets/hazuki/kkyc/M_01KKY.MOTN");
});
