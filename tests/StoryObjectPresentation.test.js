import test from "node:test";
import assert from "node:assert/strict";
import {NullEngine, Scene, Mesh, Vector3} from "@babylonjs/core";
import {applyStoryObjectTransforms, StoryObjectPresentation} from "../play/scripts/StoryObjectPresentation.js";

function fixture() {
  const engine = new NullEngine(), scene = new Scene(engine);
  const roots = ["KAK2", "KAK1", "SKAB"].map(tag => {
    const root = new Mesh(tag, scene);
    root._runtimePlacementRecord = {runtime: {objectTag: tag}};
    root.position.copyFromFloats(11, 2, -22);
    return root;
  });
  return {engine, roots};
}

test("personal switch presentation restores across mode/character/world changes without accumulating offsets", () => {
  const {engine, roots} = fixture();
  let character = {id: 1, playMode: "story", openingCompleted: true, storyFlags: {}};
  const runtime = new StoryObjectPresentation({getCharacter: () => character});
  try {
    runtime.load("JHD0", roots);
    character.storyFlags["story.s1.dojo-handguard-switch.completed"] = true;
    runtime.update();
    assert.equal(roots[0].isEnabled(false), false);
    assert.equal(roots[1].isEnabled(false), true);
    character.storyFlags["story.s1.dojo-sword-switch.completed"] = true;
    runtime.update(); runtime.update();
    assert.equal(roots[1].isEnabled(false), false);
    assert.equal(roots[2].position.z, -19.85);
    character = {id: 2, playMode: "story", openingCompleted: true, storyFlags: {}};
    runtime.update();
    assert.ok(roots.every(root => root.isEnabled(false)));
    assert.equal(roots[2].position.z, -22);
    character.storyFlags["story.s1.dojo-sword-switch.completed"] = true;
    runtime.update(); character.playMode = "free_roam"; runtime.update();
    assert.ok(roots.every(root => root.isEnabled(false)));
    assert.equal(roots[2].position.z, -22);
    runtime.clear();
    assert.equal(runtime.roots.length, 0);
  } finally {engine.dispose();}
});

test("inspection transforms restore cancellation and reject missing/ambiguous/invalid targets before mutation", () => {
  const {engine, roots} = fixture();
  try {
    const restore = applyStoryObjectTransforms(roots, [{object: "KAK2", visible: false}, {object: "SKAB", offset: [0, 0, 2]}]);
    assert.equal(roots[0].isEnabled(false), false); assert.equal(roots[2].position.z, -20);
    restore(); assert.equal(roots[0].isEnabled(false), true); assert.equal(roots[2].position.z, -22);
    for (const transforms of [[{object: "missing"}], [{object: "KAK2", offset: [NaN, 0, 0]}]]) {
      assert.throws(() => applyStoryObjectTransforms(roots, [{object: "KAK2", visible: false}, ...transforms]));
      assert.equal(roots[0].isEnabled(false), true);
    }
    assert.throws(() => applyStoryObjectTransforms([...roots, roots[0]], [{object: "KAK2"}]), /found 2/);
    assert.ok(roots[2].position.equals(new Vector3(11, 2, -22)));
  } finally {engine.dispose();}
});
