import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as BABYLON from "@babylonjs/core";

import { parseAuthCamera } from "../src/AuthCamera.js";
import { parseAuthMovement } from "../src/AuthMovement.js";
import { parseAuthSequence } from "../src/AuthSequence.js";
import { parseAuthStrings } from "../src/AuthStrings.js";
import { parseAuthTrack } from "../src/AuthTrack.js";
import { Mt5Loader } from "../src/Mt5Loader.js";
import { WORLDS } from "../play/config/worlds.js";
import { NativeAseqAudioCatalog } from "../play/events/NativeAseqAudioCatalog.js";
import { NativeAseqActivityRuntime } from "../play/events/NativeAseqActivityRuntime.js";
import { resolveSceneComposition } from "../src/SceneCompositions.js";

const inventory = JSON.parse(readFileSync(
  "play/assets/introduction/op00/asset-inventory.generated.json",
  "utf8",
));
const scene = JSON.parse(readFileSync(
  "play/data/events/op00-introduction-scene.json",
  "utf8",
));
const activityManifest = JSON.parse(readFileSync(
  "play/assets/introduction/op00/manifest.json",
  "utf8",
));
const ownerProgram = JSON.parse(readFileSync(
  "play/assets/introduction/op00/cutscene-program.generated.json",
  "utf8",
));
const audio = JSON.parse(readFileSync(
  "public/audio/world/op00/manifest.json",
  "utf8",
));
const music = JSON.parse(readFileSync("public/music/manifest.json", "utf8"));

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function arrayBuffer(filename) {
  const bytes = readFileSync(filename);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

test("OP00 introduction reuses canonical characters and emits unique scenery", () => {
  const required = inventory.assets.filter(asset => asset.requiredByOpening);
  const environment = required.filter(asset => asset.role === "environment");
  const characters = required.filter(asset => asset.role === "character");
  const sceneObjects = required.filter(asset => asset.role === "scene-object");
  const attachedObjects = required.filter(asset => asset.role === "attached-object");

  assert.equal(inventory.schema, "new-yokosuka-op00-asset-inventory-v10");
  assert.equal(environment.length, 7);
  assert.equal(characters.length, 6);
  assert.equal(sceneObjects.length, 6);
  assert.equal(attachedObjects.length, 1);
  assert.equal(inventory.summary.persistentSceneObjectCount, 4);
  assert.equal(new Set(required.map(asset => asset.sha256)).size, required.length);

  for (const asset of characters) {
    assert.equal(asset.resolution, "canonical-byte-match");
    assert.ok(!asset.assetPath.startsWith("play/assets/introduction/op00/"));
    assert.equal(sha256(readFileSync(asset.assetPath)), asset.sha256);
  }
  for (const asset of [...environment, ...sceneObjects, ...attachedObjects]) {
    assert.equal(asset.resolution, "new-required-extraction");
    assert.ok(asset.assetPath.startsWith("play/assets/introduction/op00/models/"));
    assert.equal(sha256(readFileSync(asset.assetPath)), asset.sha256);
  }

  assert.deepEqual(
    scene.environment.models,
    environment.map(asset => asset.nativeName),
  );
  assert.equal(
    scene.environment.activation,
    "native-op00-composition-with-native-shot-state-and-explicit-cutaway",
  );
  assert.equal(scene.environment.season, "winter");
  assert.equal(scene.environment.weather, "snow");
  assert.equal(scene.environment.composition, "op00-introduction");
  assert.equal(scene.environment.family, "op00-cinematic");
  assert.equal(scene.environment.source, "OP00");
  assert.deepEqual(scene.environment.texturePacks, ["S1_OP00_textures.bin"]);
  assert.deepEqual(
    Object.keys(inventory.sceneObjects).sort(),
    [...scene.nativeSceneObjects].sort(),
  );
  assert.deepEqual(
    Object.values(inventory.sceneObjects).map(binding => binding.model).sort(),
    sceneObjects.map(asset => asset.nativeName).sort(),
  );
  assert.deepEqual(
    Object.keys(inventory.attachedObjects).sort(),
    [...scene.nativeAttachedObjects].sort(),
  );
  assert.deepEqual(
    Object.values(inventory.attachedObjects).map(binding => binding.model).sort(),
    attachedObjects.map(asset => asset.nativeName).sort(),
  );
  assert.deepEqual(
    Object.fromEntries(Object.entries(inventory.sceneObjects).map(
      ([actorTag, binding]) => [actorTag, binding.image],
    )),
    {
      KNBS: "KANBANS",
      KNBU: "KANBANU",
      MNLF: "MONLEFT",
      ODR1: "DOOR_L",
      ODR2: "DOOR_R",
      RMJN: "RMJN",
    },
  );
  assert.deepEqual(inventory.attachedObjects.RYUK, {
    actorTag: "RYUK",
    image: "RYUKYO",
    model: "DRGS502G",
    characterRecordOffset: 328,
    imagePropertyOffset: 336,
    defImageRecordOffset: 72,
    archiveEntryIndex: 12,
    childIndex: 0,
    browserFilename: "S1_OP00_DRGS502G.MT5",
    attachments: [
      {
        activitySlot: 20,
        frame: 0,
        parentActorTag: "SORY",
        controlId: 12,
        translation: [0.05999999865889549, 0, 0.07999999821186066],
        rotationRaw: [0x2888, 0, 0xc444],
        source: {
          operation: "0x00e6",
          governingFrame: 0,
          setupFunctionFileOffset: "0xb3f8",
          setupFunctionEndFileOffset: "0xb6c8",
          callFileOffset: "0xb59e",
          operationLiteralOffset: "0xb61c",
          actorLiteralOffset: "0xb618",
          parentLiteralOffset: "0xb5fc",
          controlInstructionOffset: "0xb588",
          translationSources: [
            { literalOffset: "0xb608" },
            { immediateValue: 0, instructionOffset: "0xb546" },
            { literalOffset: "0xb60c" },
          ],
          rotationSources: [
            { literalOffset: "0xb610" },
            { immediateValue: 0, instructionOffset: "0xb56c" },
            { literalOffset: "0xb614" },
          ],
        },
      },
      {
        activitySlot: 15,
        frame: 0,
        parentActorTag: "KURA",
        controlId: 18,
        translation: [
          0.14499999582767487,
          0.07100000232458115,
          -0.050999999046325684,
        ],
        rotationRaw: [0xd82d, 0x149f, 0x1777],
        source: {
          operation: "0x00e6",
          governingFrame: 0,
          setupFunctionFileOffset: "0xc3d4",
          setupFunctionEndFileOffset: "0xc608",
          callFileOffset: "0xc536",
          operationLiteralOffset: "0xc578",
          actorLiteralOffset: "0xc574",
          parentLiteralOffset: "0xc570",
          controlInstructionOffset: "0xc520",
          translationSources: [
            { literalOffset: "0xc558" },
            { literalOffset: "0xc55c" },
            { literalOffset: "0xc560" },
          ],
          rotationSources: [
            { literalOffset: "0xc564" },
            { literalOffset: "0xc568" },
            { literalOffset: "0xc56c" },
          ],
        },
      },
      {
        activitySlot: 17,
        frame: 0,
        parentActorTag: "SORY",
        controlId: 12,
        translation: [
          0.164000004529953,
          0.0729999989271164,
          0.020999999716877937,
        ],
        rotationRaw: [0x2000, 0x071c, 0x182d],
        source: {
          operation: "0x00e6",
          governingFrame: 0,
          setupFunctionFileOffset: "0xc700",
          setupFunctionEndFileOffset: "0xcb9c",
          callFileOffset: "0xc89e",
          operationLiteralOffset: "0xc8e0",
          actorLiteralOffset: "0xc8dc",
          parentLiteralOffset: "0xc8b8",
          controlInstructionOffset: "0xc888",
          translationSources: [
            { literalOffset: "0xc8c4" },
            { literalOffset: "0xc8c8" },
            { literalOffset: "0xc8cc" },
          ],
          rotationSources: [
            { literalOffset: "0xc8d0" },
            { literalOffset: "0xc8d4" },
            { literalOffset: "0xc8d8" },
          ],
        },
      },
    ],
  });
  assert.equal(inventory.texturePack.resolution, "existing-production-asset");
  assert.deepEqual(Object.keys(inventory.facialAssets).sort(), [
    "AKIR", "FUKU", "INE_", "IWAO", "SORY",
  ]);
  assert.equal(inventory.summary.requiredFacialAssetCount, 5);
  for (const [actorTag, face] of Object.entries(inventory.facialAssets)) {
    assert.equal(face.actorTag, actorTag);
    assert.equal(face.attachmentRenderKey, -67);
    assert.equal(face.faceRootRenderKey, 3);
    assert.deepEqual(face.eyeRenderKeys, [77, 78]);
    assert.equal(face.poses.actorTag, actorTag);
    // Published package provenance stays pinned when its producer is relocated.
    assert.equal(face.poses.generatedBy, "tools/extract_native_face_poses.py");
    for (const asset of [face.model, face.table, face.poses]) {
      const bytes = readFileSync(asset.path);
      assert.equal(bytes.length, asset.byteLength);
      assert.equal(sha256(bytes), asset.sha256);
    }
    assert.ok(face.model.path.startsWith("play/assets/introduction/op00/faces/"));
    assert.ok(face.table.path.startsWith("play/assets/introduction/op00/faces/"));
    assert.equal(
      face.poses.path,
      "play/assets/cutscenes/native-faces/native-talk-poses.generated.json",
    );
  }
  assert.deepEqual(Object.keys(inventory.handAssets).sort(), [
    "AKIR", "FUKU", "INE_", "IWAO", "SORY",
  ]);
  assert.equal(inventory.summary.requiredHandAssetCount, 5);
  for (const [actorTag, hand] of Object.entries(inventory.handAssets)) {
    assert.equal(hand.actorTag, actorTag);
    assert.deepEqual(hand.bodyHandRenderKeys, { left: -66, right: -65 });
    assert.equal(hand.rig.transformNodeCount, 71);
    assert.equal(hand.rig.vertexCount, 306);
    assert.equal(hand.rig.pointerOffsets.length, 6);
    assert.equal(hand.presentation.attachment, "body-hand-node-world-matrix");
    assert.equal(hand.presentation.initialPose, "hm-bind-pose");
    assert.equal(hand.presentation.deformationAssetRetained, true);
    assert.equal(hand.presentation.nativePoseOperation, "0x005e");
    for (const asset of [hand.left.model, hand.right.model, hand.rig]) {
      const bytes = readFileSync(asset.path);
      assert.equal(bytes.length, asset.byteLength);
      assert.equal(sha256(bytes), asset.sha256);
      assert.ok(asset.path.startsWith("play/assets/introduction/op00/hands/"));
    }
  }
});

test("OP00 activity pack contains every exact map-embedded AUTH", () => {
  assert.equal(activityManifest.schema, "new-yokosuka-aseq-activity-pack-v1");
  assert.equal(activityManifest.nativeBinding.resourceName, "A0114");
  assert.equal(activityManifest.frameRate, 30);
  assert.equal(activityManifest.activities.length, 24);
  assert.equal(activityManifest.outputs.length, 25);
  assert.equal(activityManifest.summary.motionCount, 148);
  assert.equal(activityManifest.summary.resolvedMotionCount, 148);
  assert.equal(activityManifest.summary.handPoseTableCount, 11);
  assert.equal(activityManifest.summary.handPoseCueCount, 122);
  assert.equal(activityManifest.summary.bodyHandPoseCueCount, 15);
  assert.equal(activityManifest.summary.faceClipCueCount, 216);
  assert.equal(activityManifest.summary.durationSeconds, 354.7);
  assert.deepEqual(activityManifest.nativeHandPoseSlotOrder, [
    31, 30, 29, 35, 34, 33, 32, 39, 38, 37, 36,
    43, 42, 41, 40, 47, 46, 45, 44,
  ]);
  assert.equal(Object.keys(activityManifest.nativeHandPoseTables).length, 11);
  assert.equal(activityManifest.nativeBodyHandPoseSource.operation, "0x0081");
  assert.deepEqual(activityManifest.nativeFaceClipSource, {
    operation: "0x0113",
    clipBaseRule: "clipGroup * 6",
    upperSelectors: [0, 1],
    selectorRange: [0, 6],
  });
  assert.equal(activityManifest.nativeFaceGazeSource.operation, "0x0099");
  assert.equal(activityManifest.nativeFaceGazeSource.angleLimits,
    "*_FTBL.BIN header +0x0c..+0x23");
  assert.deepEqual(
    activityManifest.activities[5].nativeFaceGazeCues.map(cue => [
      cue.frame,
      cue.actorTag,
      cue.mode,
      cue.durationNativeTicks,
      cue.target?.kind,
    ]),
    [
      [226, "SORY", 2, 18, "world-point"],
      [298, "SORY", 2, 9, "world-point"],
      [350, "SORY", 0, 16, undefined],
    ],
  );
  assert.deepEqual(
    activityManifest.activities[21].nativeFaceGazeCues
      .filter(cue => cue.mode === 2)
      .map(cue => [
        cue.frame,
        cue.actorTag,
        cue.target.actorTag,
        cue.target.selector,
      ]),
    [
      [1348, "AKIR", "IWAO", 2],
      [1400, "AKIR", "IWAO", 27],
      [1410, "AKIR", "IWAO", 5],
      [1415, "AKIR", "IWAO", 20],
      [1422, "AKIR", "IWAO", 5],
      [1442, "AKIR", "IWAO", 20],
      [1462, "AKIR", "IWAO", 5],
    ],
  );
  assert.deepEqual(
    activityManifest.activities[1].nativeBodyHandPoseCues.map(cue => [
      cue.frame,
      cue.actorTag,
      cue.channel,
      cue.targetIndex,
      cue.durationNativeTicks,
    ]),
    [
      [0, "AKIR", 2, 0, 16],
      [400, "AKIR", 2, 8, 16],
      [443, "AKIR", 2, 8, 16],
      [810, "AKIR", 2, 0, 16],
    ],
  );
  assert.deepEqual(
    activityManifest.activities[1].nativeHandPoseCues.map(cue => [
      cue.frame,
      cue.actorTag,
      cue.side,
      cue.poseTableOffset,
    ]),
    [
      [294, "AKIR", "right", "0x217f4"],
      [294, "AKIR", "left", "0x217f4"],
      [737, "AKIR", "right", "0x20c08"],
      [737, "AKIR", "left", "0x20c08"],
    ],
  );
  assert.deepEqual(
    activityManifest.activities[0].nativeFaceClipCues.map(cue => [
      cue.frame,
      cue.actorTag,
      cue.clipGroup,
      cue.selector,
      cue.durationNativeTicks,
    ]),
    [
      [0, "AKIR", 10, 0, 1],
      [360, "AKIR", 0, 0, 1],
      [410, "AKIR", 2, 0, 1],
    ],
  );
  assert.deepEqual(
    activityManifest.activities[3].nativeFaceClipCues
      .filter(cue => cue.frame >= 328 && cue.frame <= 332)
      .map(cue => [cue.frame, cue.actorTag, cue.clipGroup, cue.selector]),
    [
      [328, "FUKU", 4, 1],
      [329, "FUKU", 4, 1],
      [330, "FUKU", 4, 1],
      [331, "FUKU", 4, 1],
      [332, "FUKU", 4, 0],
    ],
  );

  for (const record of activityManifest.activities) {
    assert.equal(record.slot, record.index);
    assert.deepEqual(record.binding, { kind: "map-embedded-slot" });
    assert.equal(record.archiveMember, `SEQDATA${record.slot}.AUTH`);
    const track = readFileSync(record.asset.path);
    assert.equal(sha256(track), record.sha256);
    assert.equal(parseAuthTrack(track).byteLength, record.byteLength);
    assert.equal(parseAuthSequence(track).durationFrames, record.durationFrames);
    assert.equal(parseAuthCamera(track).cameras.length, record.cameraCount);
    assert.equal(parseAuthMovement(track).actors.length, record.movementCount);
  }
  const ownerResources = new Map(ownerProgram.authResourceSelection.ownerCalls.map(
    call => [call.slot, call.resource],
  ));
  for (const activity of activityManifest.activities) {
    assert.deepEqual(ownerResources.get(activity.slot), {
      sourceFileOffset: `0x${activity.sourceOffset.toString(16)}`,
      byteLength: activity.byteLength,
      sha256: activity.sha256,
    });
  }
});

test("OP00 canonical runtime prepares all 24 native activities", async () => {
  const runtime = new NativeAseqActivityRuntime({
    manifest: activityManifest,
    audioManifest: audio,
    loadAsset: async assetPath => arrayBuffer(assetPath),
    presentation: {
      beginActivity() { return {}; },
      advanceActivity() {},
      endActivity() {},
    },
  });
  const prepared = await Promise.all(
    [...runtime.catalog.activities.values()].map(record => runtime.prepare(record)),
  );
  assert.equal(prepared.length, 24);
  assert.equal(prepared.every(value => value.frames.length > 0), true);
});

test("OP00 persistent fixtures use CHRT poses and between-track script state", () => {
  assert.equal(inventory.sceneObjects.KNBS.lifecycle.kind, "auth-scoped");
  assert.equal(inventory.sceneObjects.KNBU.lifecycle.kind, "auth-scoped");
  for (const actorTag of ["MNLF", "RMJN", "ODR1", "ODR2"]) {
    assert.equal(
      inventory.sceneObjects[actorTag].lifecycle.kind,
      "room-script-persistent",
    );
    assert.deepEqual(
      inventory.sceneObjects[actorTag].lifecycle.stateOperations,
      ["0x001f", "0x00a8"],
    );
  }
  assert.deepEqual(inventory.sceneObjects.ODR1.initialPresentation.position, [
    -2.3610000610351562,
    1.059999942779541,
    -21.434900283813477,
  ]);
  assert.deepEqual(inventory.sceneObjects.ODR2.initialPresentation.position, [
    -2.3610000610351562,
    1.0550999641418457,
    -23.454700469970703,
  ]);
  assert.equal(
    inventory.sceneObjects.ODR1.initialPresentation.source.kind,
    "chrt-associated-object",
  );
  assert.equal(
    inventory.sceneObjects.RMJN.initialPresentation.source.kind,
    "first-auth-pose",
  );

  const state = trackIndex => Object.fromEntries(
    activityManifest.activities[trackIndex].nativeSceneObjectStates.map(
      value => [value.actorTag, value.presented],
    ),
  );
  assert.deepEqual(state(1), {
    MNLF: true,
    ODR1: false,
    ODR2: false,
    RMJN: true,
  });
  assert.deepEqual(state(2), {
    MNLF: true,
    ODR1: true,
    ODR2: true,
    RMJN: true,
  });
  assert.deepEqual(
    activityManifest.activities[2].nativeSceneObjectWrites.map(value => ({
      actorTag: value.actorTag,
      runtimeCall: value.runtimeFlag.callFileOffset,
      presentationCall: value.presentationFlag.callFileOffset,
    })),
    [
      { actorTag: "ODR1", runtimeCall: "0x15ec6", presentationCall: "0x15eea" },
      { actorTag: "ODR2", runtimeCall: "0x15f52", presentationCall: "0x15f76" },
    ],
  );
});

test("OP00 keeps numbered native state separate from browser model visibility", () => {
  assert.deepEqual(
    inventory.mapVisibilityModels.map(value => ({
      nativeName: value.nativeName,
      visible: value.visible,
      archiveEntryIndex: value.source.archiveEntryIndex,
      childIndex: value.source.childIndex,
    })),
    [
      {
        nativeName: "OMADO",
        visible: false,
        archiveEntryIndex: 27,
        childIndex: 4,
      },
    ],
  );
  for (const track of activityManifest.activities) {
    assert.deepEqual(
      track.nativeMapLayerStates.map(value => value.layer),
      [0, 1, 2, 3, 4],
    );
    assert.ok(track.nativeMapLayerStates.every(value => !("nativeName" in value)));
    assert.equal(track.nativeMapLayerStateSource.operation, "0x0098");
    assert.deepEqual(track.browserMapVisibility, [
      { nativeName: "OMADO", visible: false },
    ]);
  }
  assert.deepEqual(
    activityManifest.activities[21].nativeMapLayerStates.map(value => value.value),
    [0, 1, 1, 0, 1],
  );
  assert.deepEqual(
    activityManifest.activities[21].nativeMapLayerWrites.map(value => value.callFileOffset),
    ["0xcbb2", "0xcbc6", "0xcbda", "0xcbee"],
  );
  assert.deepEqual(activityManifest.activities[13].nativeMapLayerWrites, []);
  assert.equal(
    activityManifest.activities[13].nativeMapLayerStateSource.inheritedFromTrackIndex,
    12,
  );
  assert.equal(
    activityManifest.activities[16].nativeMapLayerStateSource.inheritedFromTrackIndex,
    15,
  );
});

test("OP00 authored scene accounts for every activity actor tag", () => {
  const configuredTags = new Set([
    ...Object.keys(scene.actors),
    ...scene.nativeSceneObjects,
  ]);
  assert.deepEqual([...configuredTags].sort(), activityManifest.actorTags);
  assert.equal(scene.presentation.placementSource, "AMOV");
  assert.equal(scene.presentation.cameraSource, "ACAM");
  assert.equal(scene.presentation.animationSource, "ASEQ");
  assert.equal(scene.presentation.motionBank, 25);
  assert.equal(
    activityManifest.activities.flatMap(track => track.motions)
      .filter(motion => scene.nativeSceneObjects.includes(motion.actorTag)).length,
    0,
  );
  assert.equal(activityManifest.actorTags.includes("RYUK"), false);
  assert.deepEqual(scene.nativeAttachedObjects, ["RYUK"]);
});

test("OP00 composes its dedicated native stage with authored objects", () => {
  const world = WORLDS.op00;
  const composition = resolveSceneComposition(world.sceneComposition);
  assert.equal(world.nativeArea, "OP00");
  assert.equal(world.prefix, "S1_OP00");
  assert.equal(world.cutsceneOnly, true);
  assert.equal(world.fixedSeason, "winter");
  assert.equal(world.fixedWeather, "snow");
  assert.equal(world.skyExposure, "outdoor");
  assert.equal(world.loadInactiveEnvironmentVariants, false);
  assert.equal(world.sceneComposition, "op00-introduction");
  assert.deepEqual(
    [...composition.filenames].sort(),
    [
      ...scene.environment.renderedFoundation,
      ...scene.environment.renderedOverlays,
    ].sort(),
  );
  assert.ok(
    scene.environment.renderedOverlays.every(filename => world.includeFile(filename)),
  );
  assert.equal(
    [...composition.filenames].some(filename => filename.startsWith("S1_BETD_")),
    false,
  );
});

test("OP00 Dragon Mirror produces one exact production-loader root", async () => {
  const asset = inventory.assets.find(item => item.role === "attached-object");
  assert.equal(asset.nativeName, "DRGS502G");
  const engine = new BABYLON.NullEngine();
  const babylonScene = new BABYLON.Scene(engine);
  try {
    const roots = await new Mt5Loader(babylonScene).load(arrayBuffer(asset.assetPath));
    assert.equal(roots.length, 1);
    assert.equal(roots[0].getChildMeshes(false).length, 3);
  } finally {
    babylonScene.dispose();
    engine.dispose();
  }
});

test("OP00 foundation exposes its native snow surface to shared variants", async () => {
  const asset = inventory.assets.find(item => item.nativeName === "JIMENHAL");
  const engine = new BABYLON.NullEngine();
  const babylonScene = new BABYLON.Scene(engine);
  try {
    const roots = await new Mt5Loader(babylonScene).load(
      arrayBuffer(asset.assetPath),
    );
    const snowSurfaces = roots[0].getDescendants(false).filter(
      node => node.metadata?.mt5TextureId === "736e6f775f620000",
    );
    assert.ok(snowSurfaces.length > 0);
  } finally {
    babylonScene.dispose();
    engine.dispose();
  }
});

test("OP00 audio catalog resolves every authored cue to exact assets", () => {
  const catalog = new NativeAseqAudioCatalog(audio);
  let voiceCount = 0;
  let soundCount = 0;
  for (const record of activityManifest.activities) {
    const track = readFileSync(record.asset.path);
    const sequence = parseAuthSequence(track);
    const strings = parseAuthStrings(track).strings;
    for (const frame of sequence.frames) {
      for (const command of frame.commands) {
        if (command.name !== "voice" && command.name !== "sound") continue;
        const resolved = catalog.resolve(command, strings[command.stringIndex]);
        assert.equal(resolved.kind, command.name);
        if (command.name === "voice") {
          voiceCount += 1;
          assert.equal(
            resolved.silent ? resolved.displayText : typeof resolved.displayText,
            resolved.silent ? null : "string",
          );
        }
        else soundCount += 1;
      }
    }
  }
  assert.equal(voiceCount, 48);
  assert.equal(soundCount, 266);
  assert.equal(audio.summary.uniqueSoundCommandCount, 77);
  assert.deepEqual(
    audio.voices.filter(record => record.unavailable).map(record => record.voiceId),
    ["A0114A015", "A0114A027", "A0114D014"],
  );
  const nativeSubtitle = audio.voices.find(
    record => record.voiceId === "A0114E015",
  );
  assert.deepEqual({
    speakerId: nativeSubtitle?.speakerId,
    sourceText: nativeSubtitle?.sourceText,
    displayText: nativeSubtitle?.displayText,
  }, {
    speakerId: "SORY",
    sourceText: "That's the name of the man＆you killed in Meng Cun.",
    displayText: "That's the name of the man\nyou killed in Meng Cun.",
  });

  const assetRecords = [
    ...audio.voices.filter(record => !record.unavailable),
    ...audio.sounds.flatMap(record => record.assets),
    ...audio.music,
  ];
  for (const record of assetRecords) {
    const filename = record.asset.replace(/^public\//, "public/");
    const bytes = readFileSync(filename);
    assert.equal(bytes.length, record.byteLength);
    assert.equal(sha256(bytes), record.sha256);
  }
  for (const cue of audio.music) {
    assert.equal(music.tracks[cue.trackId].sha256, cue.sha256);
    assert.equal(music.tracks[cue.trackId].source.activitySlot, cue.activitySlot);
  }
});
