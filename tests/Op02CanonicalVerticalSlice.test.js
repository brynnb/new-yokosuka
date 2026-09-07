import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import { CUTSCENES } from "../play/config/cutscenes.js";

function json(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

const graph = json(
  "play/assets/introduction/op02/cutscene-source-graph.generated.json",
);
const program = json(
  "play/assets/introduction/op02/cutscene-program.generated.json",
);
const manifest = json("play/assets/introduction/op02/manifest.json");
const music = json("public/music/manifest.json");

test("OP02 selector uses the canonical activity sequence in native order", () => {
  const cutscene = CUTSCENES.find(value => value.id === "S1-OP02-00");
  assert.deepEqual(cutscene.program, {
    programId: "preview-s1-op02-00",
    entryFunction: "$activity-sequence",
    area: "OP02",
    worldId: "op02",
  });
  assert.equal(cutscene.lightingPresetIndex, 1);
  assert.deepEqual(cutscene.depthHaze, {
    startDistance: 5,
    endDistance: 800,
    foregroundEndDistance: 90,
    foregroundOpacity: 0.4,
    maximumOpacity: 0.85,
    color: [0.62, 0.36, 0.22],
  });
  assert.deepEqual(
    CUTSCENES
      .filter(value => value.lightingPresetIndex !== undefined)
      .map(value => value.id),
    ["S1-OP02-00"],
  );
  assert.deepEqual(
    CUTSCENES
      .filter(value => value.depthHaze !== undefined)
      .map(value => value.id),
    ["S1-OP02-00"],
  );
  assert.equal(cutscene.activity, undefined);
  assert.equal(graph.id, "S1-OP02-00");
  assert.equal(program.id, "S1-OP02-00");
  assert.equal(program.entryFunction, "0x23c8");
  assert.equal(program.compile.status, "compiled");
  assert.deepEqual(program.compile.blockers, []);

  assert.equal(manifest.schema, "new-yokosuka-aseq-activity-pack-v1");
  assert.equal(manifest.activities.some(activity => "nodeMotion" in activity), false);
  const builder = readFileSync("tools/cutscenes/build_op02_opening_assets.mjs", "utf8");
  assert.doesNotMatch(builder, /nodeMotionSequenceByTrack|owner-playlist/i);

  const packages = readFileSync(
    "play/cutscenes/nativeCutscenePackages.js",
    "utf8",
  );
  const op02Start = packages.indexOf('id: "op02-opening"');
  const op02End = packages.indexOf('id: "drauth"', op02Start);
  assert.ok(op02Start >= 0 && op02End > op02Start);
  const op02Package = packages.slice(op02Start, op02End);
  assert.match(op02Package, /manifest: op02ActivityManifest/);
  assert.match(op02Package, /ownerAudioCommands: op02ActivityManifest\.ownerAudioCommands/);
  assert.doesNotMatch(op02Package, /playback\.kind|OpeningTimeline|playlistManifest/);
});

test("OP02 exact resources cross-link scroll, FACE, TMNM variants, and BGM019", () => {
  const outputs = new Map(manifest.outputs.map(output => [output.path, output]));
  for (const resource of [
    ...manifest.scrollSprites,
    manifest.nodeMotion,
    manifest.facialAssets.SINF.model,
    manifest.facialAssets.SINF.texturePack,
    manifest.facialAssets.SINF.table,
  ]) {
    const output = outputs.get(resource.path);
    assert.ok(output, resource.path);
    assert.equal(sha256(resource.path), output.sha256, resource.path);
  }
  assert.deepEqual(
    manifest.scrollSprites.map(resource => resource.imagePath),
    [
      "play/assets/introduction/op02/SCROLL53.png",
      "play/assets/introduction/op02/SCROLL67.png",
    ],
  );

  assert.deepEqual(
    manifest.packageActors.HAWK.variants.map(value => value.modelCode),
    ["TAK02M7G", "TAK02M8G"],
  );
  assert.deepEqual(manifest.nodeMotion.resourceIds, [
    0xe001, 0xe002, 0xe003, 0xe004,
    0xe005, 0xe006, 0xe007, 0xe008,
  ]);
  assert.deepEqual(manifest.nodeMotion.modelCodesBySequenceIndex, [
    "TAK02M7G", "TAK02M7G", "TAK02M7G", "TAK02M7G",
    "TAK02M7G", "TAK02M8G", "TAK02M8G", "TAK02M8G",
  ]);
  assert.deepEqual(
    manifest.activities.map(activity => ({
      slot: activity.slot,
      timeline: [
        ...activity.programPresentationCues.before.map(cue => [0, cue.resourceId]),
        ...activity.programPresentationCues.frames.map(record => (
          [record.frame, record.cues[0].resourceId]
        )),
      ],
      after: activity.programPresentationCues.after,
    })),
    [
      { slot: 0, timeline: [[0, 0xe002]], after: [] },
      { slot: 1, timeline: [[0, 0xe002], [101, 0xe001], [152, 0xe006], [196, 0xe008], [253, 0xe007], [281, 0xe005]], after: [] },
      { slot: 2, timeline: [], after: [] },
      { slot: 3, timeline: [[0, 0xe004], [167, 0xe003], [234, 0xe002]], after: [] },
      { slot: 4, timeline: [[0, 0xe002]], after: [{ kind: "scroll-transition", slotIndex: 1, controlMode: 0, durationFrames: 560, sourceCallFileOffset: "0xf7e" }] },
      { slot: 5, timeline: [], after: [] },
      { slot: 6, timeline: [[0, 0xe002], [75, 0xe001], [153, 0xe003], [220, 0xe002]], after: [] },
    ],
  );

  const route = manifest.ownerAudioCommands.find(
    value => value.commandHex === "a82b0000",
  );
  assert.deepEqual(route, {
    commandHex: "a82b0000",
    exactArguments: [0, 0],
    kind: "music",
    trackId: "bgm019",
    callFileOffsets: ["0x192"],
  });
  assert.equal(music.tracks[route.trackId].source.file, "BGM019.SND");
  assert.equal(music.tracks[route.trackId].source.groupCommand, "A82B0000");
});

test("OP02 compiled owner retains shared presentation command families", () => {
  const semanticCounts = new Map();
  for (const action of program.functions.flatMap(fn => (
    fn.blocks.flatMap(block => block.actions)
  ))) {
    if (!action.semanticId) continue;
    semanticCounts.set(
      action.semanticId,
      (semanticCounts.get(action.semanticId) || 0) + 1,
    );
  }
  assert.deepEqual(Object.fromEntries([
    "native-operation-0050-aseq-activity-control",
    "resolved-object-tmnm-parameter-write",
    "resolved-object-runtime-flag",
    "resolved-object-presentation-flag",
    "numbered-map-layer-state",
    "scroll-sprite-transition-request",
    "scroll-sprite-slot-release",
    "sound-command-dispatch",
  ].map(id => [id, semanticCounts.get(id)])), {
    "native-operation-0050-aseq-activity-control": 21,
    "resolved-object-tmnm-parameter-write": 40,
    "resolved-object-runtime-flag": 9,
    "resolved-object-presentation-flag": 1,
    "numbered-map-layer-state": 2,
    "scroll-sprite-transition-request": 1,
    "scroll-sprite-slot-release": 1,
    "sound-command-dispatch": 4,
  });
});
