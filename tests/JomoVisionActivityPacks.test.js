import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const codes = ["kkya", "kkyb", "kkyc", "kkyd", "kkye", "kkyf"];
const manifests = codes.map(code => JSON.parse(fs.readFileSync(
  `play/assets/hazuki/${code}/manifest.json`,
)));

test("two-mirror vision retains native entry scale without enlarging other uses of those assets", () => {
  const evidence = JSON.parse(fs.readFileSync("tools/evidence/jomo-mirrors-native-setup-ir.json"));
  const writes = evidence.function.blocks.flatMap(block => block.actions)
    .filter(action => action.semanticId === "resolved-object-scale-vector-write");
  assert.deepEqual(writes.map(action => action.arguments[0].ascii), ["RYMR", "HOMR"]);
  for (const action of writes) {
    const definition = manifests[1].sceneObjects[action.arguments[0].ascii];
    const scale = action.arguments[1].staticWords.map(word => {
      const bytes = Buffer.alloc(4); bytes.writeUInt32LE(word); return bytes.readFloatLE();
    });
    assert.deepEqual(scale, [100, 100, 100]);
    assert.deepEqual(definition.initialPresentation.scale, scale);
    assert.equal(definition.initialPresentationSource.callFileOffset, action.callFileOffset);
  }
  assert.equal(manifests[0].sceneObjects.HOMR.initialPresentation, undefined);
  assert.equal(manifests[5].sceneObjects.RYMR.initialPresentation, undefined);
});

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
