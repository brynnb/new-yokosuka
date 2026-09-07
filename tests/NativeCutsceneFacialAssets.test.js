import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveNativeCutsceneFacialAssets,
} from "../play/cutscenes/NativeCutsceneFacialAssets.js";

test("cutscene FACE aliases borrow exact assets while retaining authored identity", () => {
  const source = Object.freeze({
    actorTag: "AKIR",
    faceCode: "YKC",
    poses: Object.freeze({ actorTag: "AKIR", path: "poses.json" }),
  });
  const result = resolveNativeCutsceneFacialAssets(
    { AKIR: source },
    { AKID: "AKIR" },
  );
  assert.equal(result.AKIR, source);
  assert.equal(result.AKID.actorTag, "AKID");
  assert.equal(result.AKID.faceCode, "YKC");
  assert.equal(result.AKID.poses.actorTag, "AKIR");
  assert.equal(result.AKID.poses.path, "poses.json");
  assert.throws(
    () => resolveNativeCutsceneFacialAssets({ AKIR: source }, { AKIR: "AKIR" }),
    /conflicts/,
  );
});
