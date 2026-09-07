#!/usr/bin/env node

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

import { parseAuthCamera } from "../../src/AuthCamera.js";
import { parseAuthMovement } from "../../src/AuthMovement.js";
import {
  parseAuthSequence,
  resolveAuthMotions,
} from "../../src/AuthSequence.js";
import { MotnLoader } from "../../src/MotnLoader.js";
import { parseNativeScrollSprite } from "../../src/NativeScrollSprite.js";
import { parseTmnmMotion } from "../../src/TmnmMotion.js";
import {
  parseIpacActivityArchive,
  sha256,
} from "../lib/NativeAseqActivityPack.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoot = [
  process.env.SHENMUE_DISC1_EXTRACTED_ROOT,
  path.join(root, "extracted_files"),
].filter(Boolean).find(existsSync);
if (!sourceRoot) throw new Error("an exact Shenmue Disc 1 extraction was not found");

const sourceDirectory = path.join(sourceRoot, "data/SCENE/01/OP02");
const outputDirectory = path.join(root, "play/assets/introduction/op02");
const outputPrefix = "play/assets/introduction/op02";
const sourceGraph = JSON.parse(readFileSync(path.join(
  outputDirectory,
  "cutscene-source-graph.generated.json",
), "utf8"));
if (sourceGraph.id !== "S1-OP02-00" || sourceGraph.compile.status !== "compiled") {
  throw new Error("OP02 canonical source graph is unavailable");
}
const compiledProgram = JSON.parse(readFileSync(path.join(
  outputDirectory,
  "cutscene-program.generated.json",
), "utf8"));
if (
  compiledProgram.id !== sourceGraph.id
  || compiledProgram.entryFunction !== sourceGraph.program.entryFunction
) throw new Error("OP02 compiled owner program changed");
const facePosePath = path.join(outputDirectory, "mgr-talk-poses.generated.json");
const clothTrackPath = path.join(outputDirectory, "MGR_CLOTH_TRACK.bin");
const clothTrackEvidence = JSON.parse(readFileSync(path.join(
  root,
  "tools/evidence/op02-mgr-cloth-track.json",
), "utf8"));
const mapinfo = readFileSync(path.join(sourceDirectory, "MAPINFO.BIN"));
const shd2 = readFileSync(path.join(sourceDirectory, "SHD2.PKS"));
const shdrSource = readFileSync(path.join(sourceDirectory, "SHDR.PKS"));
const shd2Textures = readFileSync(path.join(sourceDirectory, "SHD2.PKF"));
const shdrTextures = readFileSync(path.join(sourceDirectory, "SHDR.PKF"));

const expected = Object.freeze({
  mapinfo: Object.freeze({
    byteLength: 28496,
    sha256: "5463ad11cf2ed99764160795be2e1576a874d8c928b8ccc9db437ad32b25d6d0",
  }),
  shd2: Object.freeze({
    byteLength: 980648,
    sha256: "80c97a1a0dbee382111f81cc0ff906c7d48b905e5046d97a682449e63cf631ca",
  }),
  shdr: Object.freeze({
    byteLength: 269831,
    sha256: "465f2af518db6adeae1a200f86b793a2f7494364829df7918c350318b32eceea",
  }),
  shd2Textures: Object.freeze({
    byteLength: 2118360,
    sha256: "e69c055ea15ec30ff3c0f77754b9c59206af54f1575f79f361459f0e60d539e2",
  }),
  shdrTextures: Object.freeze({
    byteLength: 386845,
    sha256: "11c49dcff13c3b4355bd6b06902e996c05b3b91a6380b4dea68821480a0293fc",
  }),
});
for (const [label, bytes, pin] of [
  ["MAPINFO.BIN", mapinfo, expected.mapinfo],
  ["SHD2.PKS", shd2, expected.shd2],
  ["SHDR.PKS", shdrSource, expected.shdr],
  ["SHD2.PKF", shd2Textures, expected.shd2Textures],
  ["SHDR.PKF", shdrTextures, expected.shdrTextures],
]) {
  if (bytes.length !== pin.byteLength || sha256(bytes) !== pin.sha256) {
    throw new Error(`OP02 ${label} changed`);
  }
}

const archive = parseIpacActivityArchive(shd2, "OP02/SHD2");
const members = new Map(archive.members.map(member => [member.name, member]));
const shdr = parseIpacActivityArchive(shdrSource, "OP02/SHDR");
const residentMembers = new Map(shdr.members.map(member => [member.name, member]));
const motionMember = members.get("M_0605.MOTN");
if (
  !motionMember
  || motionMember.bytes.length !== 12240
  || sha256(motionMember.bytes) !== "191697b8ae70bea123ddf990a1c1268d8df6d5ad23a1602ebcd064bf1454b0f9"
) throw new Error("OP02 M_0605.MOTN changed");
const motion = MotnLoader.parse(motionMember.bytes);
const motionNames = [
  "SIN_STAND_C_NWJ",
  "SIN_WALK_STAND_A_NWJ",
  "SIN_OHI_FURIMUKI_0605",
];
if (motionNames.some((name, index) => motion.sequences[index]?.name !== name)) {
  throw new Error("OP02 Shenhua motion inventory changed");
}
const nativeResources = Object.freeze([
  [residentMembers, "M_TORI.MOTN", 132456, "faa2483e6bbdfb5cde0fec4a1a1aeb5530330b9e8cfec6538bbe524370b67558"],
  [members, "SCROLL53.SCR1", 262196, "ebb90b04a8b2ff865dc4bff68996ee9745cd2c64504bc934ccd2e8454f6a719c"],
  [residentMembers, "SCROLL67.SCR0", 327800, "2c734eef6227c75fc84859a0a6e88dbec5391dc17ac868b240b31c575e7880b0"],
]);

const trackDefinitions = Object.freeze([
  [0, 0x2894, 1600, ["HAWK", "AKIR"], 450],
  [1, 0x2ed4, 4968, ["HAWK", "SINF"], 350],
  [2, 0x423c, 1800, ["HAWK", "SINF"], 147],
  [3, 0x4944, 2356, ["HAWK", "SINF"], 580],
  [4, 0x5278, 2764, ["HAWK", "SINF"], 530],
  [5, 0x5d44, 1504, ["SINF"], 57],
  [6, 0x6324, 2528, ["SINF", "HAWK"], 243],
].map(([index, sourceOffset, byteLength, actors, durationFrames]) => Object.freeze({
  index, sourceOffset, byteLength, actors, durationFrames,
})));
// Operation 0x0098 addresses the numbered layers by their one-based MAP
// filenames. The unnumbered MAP and MAP03 resources remain resident.
const numberedMapLayers = Object.freeze([
  Object.freeze({ nativeName: "MAP01", browserFilename: "S1_OP02_MAP01.MT5" }),
  Object.freeze({ nativeName: "MAP02", browserFilename: "S1_OP02_MAP02.MT5" }),
]);
// MAP03 is a long, resident distant-terrain curtain. In the browser stage the
// slot-3/4 cameras look almost exactly down its length, exposing its terminal
// edge as a tall rectangular shard. MAP/MAP01/MAP02 already provide the full
// authored ground and cliff, so suppress this one backdrop node rather than
// deleting or special-casing any camera shot.
const mapGeometryMasks = Object.freeze([
  Object.freeze({
    browserFilename: "S1_OP02_MAP03.MT5",
    nodeAddress: 0x0d10,
  }),
]);
// MAP02 is the authored cliff and MAP01 is its surrounding landscape. Native
// operation 0x0098 changes a layer *state*, not a browser visibility boolean;
// treating native value 0 as false unloaded the cliff beneath Shenhua after
// the first shots. Both resources stay resident for this whole cinematic.
const browserMapVisibilityByTrack = Object.freeze(Object.fromEntries(
  trackDefinitions.map(({ index }) => [index, Object.freeze([true, true])]),
));
const hawkTmnmResourceIds = Object.freeze([
  0xe001, 0xe002, 0xe003, 0xe004, 0xe005, 0xe006, 0xe007, 0xe008,
]);

function ownerProgramPresentationCues() {
  const owner = compiledProgram.functions.find(
    value => value.id === sourceGraph.program.ownerFunction,
  );
  if (!owner) throw new Error("OP02 compiled activity owner is unavailable");
  const blocks = new Map(owner.blocks.map(block => [block.id, block]));
  const actions = owner.blocks.flatMap(block => block.actions).sort(
    (left, right) => parseInt(left.callFileOffset, 16) - parseInt(right.callFileOffset, 16),
  );
  const before = new Map();
  const frames = new Map();
  const after = new Map();
  const starts = actions.filter((action) => {
    const values = (action.arguments || []).map(argument => argument.value);
    return action.semanticId === "native-operation-0050-aseq-activity-control"
      && values.length === 1
      && Number.isInteger(values[0])
      && values[0] >= 0
      && values[0] < 70;
  }).map(action => Object.freeze({
    slot: action.arguments[0].value,
    offset: parseInt(action.callFileOffset, 16),
  }));
  const activeSlotAt = offset => starts.filter(start => start.offset < offset).at(-1)?.slot;
  const resourceCueFrom = (firstBlockId) => {
    let block = blocks.get(firstBlockId);
    const visited = new Set();
    while (block && !visited.has(block.id)) {
      visited.add(block.id);
      for (const action of block.actions) {
        if (action.semanticId !== "resolved-object-tmnm-parameter-write") continue;
        const resourceId = action.arguments?.[1]?.value;
        if (!hawkTmnmResourceIds.includes(resourceId)) continue;
        return Object.freeze({
          kind: "node-motion-resource",
          objectTag: "HAWK",
          resourceId,
          sourceCallFileOffset: action.callFileOffset,
        });
      }
      if (
        block.frameFieldComparisons?.length > 0
        || block.successors?.length !== 1
      ) return null;
      const next = blocks.get(block.successors[0]);
      if (!next || parseInt(next.id, 16) <= parseInt(block.id, 16)) return null;
      block = next;
    }
    return null;
  };
  for (const block of owner.blocks) {
    for (const comparison of block.frameFieldComparisons || []) {
      if (comparison.fieldOffset !== 126) continue;
      const cue = resourceCueFrom(
        comparison.resolvedBranch?.comparisonTrueSuccessor,
      );
      if (!cue) continue;
      const slot = activeSlotAt(parseInt(block.id, 16));
      if (!Number.isInteger(slot)) {
        throw new Error("OP02 timed hawk cue has no active AUTH slot");
      }
      if (comparison.constant === 0) {
        before.set(slot, [cue]);
      } else {
        const records = frames.get(slot) || [];
        records.push(Object.freeze({
          frame: comparison.constant,
          cues: Object.freeze([cue]),
        }));
        frames.set(slot, records);
      }
    }
  }
  for (const action of actions) {
    const values = (action.arguments || []).map(argument => argument.value);
    if (action.semanticId === "scroll-sprite-transition-request") {
      const slot = activeSlotAt(parseInt(action.callFileOffset, 16));
      after.set(slot, [Object.freeze({
        kind: "scroll-transition",
        slotIndex: values[2],
        controlMode: values[1],
        durationFrames: values[3],
        sourceCallFileOffset: action.callFileOffset,
      })]);
    }
  }
  const actual = trackDefinitions.map(({ index }) => [
    index,
    ...(before.get(index) || []).map(cue => [0, cue.resourceId]),
    ...(frames.get(index) || []).map(record => [record.frame, record.cues[0].resourceId]),
  ]);
  const expected = [
    [0, [0, 0xe002]],
    [1, [0, 0xe002], [101, 0xe001], [152, 0xe006], [196, 0xe008], [253, 0xe007], [281, 0xe005]],
    [2],
    [3, [0, 0xe004], [167, 0xe003], [234, 0xe002]],
    [4, [0, 0xe002]],
    [5],
    [6, [0, 0xe002], [75, 0xe001], [153, 0xe003], [220, 0xe002]],
  ];
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error("OP02 compiled hawk presentation timeline changed");
  }
  return Object.freeze({ before, frames, after });
}
const programPresentationCues = ownerProgramPresentationCues();
mkdirSync(outputDirectory, { recursive: true });
const modelDirectory = path.join(outputDirectory, "models");
mkdirSync(modelDirectory, { recursive: true });

const exactModels = Object.freeze([
  [members, "MAP01.MAPM", 127556, "85a8070543471906bfbc90f49b5cf4bfc0429f97d6b410a7c4c6cf495eeb9d61"],
  [members, "MAP02.MAPM", 156672, "3aa3abecf4e57bf8650aada68d5f3d95bdfc65acb4b87457581b5a446a863a27"],
  [members, "MGR_M.CHRM", 238128, "a79af46067bc08d22ec55e7308d6ac9157185bcba5409de3b59fc07830435f55"],
  [members, "MGR_F.CHRM", 108220, "2b5c3c5f8408cd9819f430598fb2bcba649b0278165ce042a78366860b4bd4a6"],
  [residentMembers, "MAP.MAPM", 159980, "07a409ba6bfd8eab73e013c04ff3b6e2e483aa1a9cb6a99f79437cb385ebbc88"],
  [residentMembers, "MAP03.MAPM", 3564, "116a7963cc4d3dcd0c40daa3e97a33af0626082ac0d2124db9456997e4b266ee"],
  [residentMembers, "TAK02M7G.CHRM", 45816, "3bb785a9e35909dfddf4d0914faaf063668e848f0667fb931acbfa8a503f2e05"],
  [residentMembers, "TAK02M8G.CHRM", 39976, "80dd28d41fbac62c2bb52e88a5f0fd16b9a1dba101d6bd87308b5e0d3398035b"],
]);
for (const [source, filename, byteLength, digest] of exactModels) {
  const member = source.get(filename);
  if (!member || member.bytes.length !== byteLength || sha256(member.bytes) !== digest) {
    throw new Error(`OP02 ${filename} changed`);
  }
  writeFileSync(path.join(modelDirectory, filename), member.bytes);
}
for (const [source, filename, byteLength, digest] of nativeResources) {
  const member = source.get(filename);
  if (!member || member.bytes.length !== byteLength || sha256(member.bytes) !== digest) {
    throw new Error(`OP02 ${filename} changed`);
  }
  writeFileSync(path.join(outputDirectory, filename), member.bytes);
}
const hawkMotion = parseTmnmMotion(residentMembers.get("M_TORI.MOTN").bytes);
const scrollSprites = Object.freeze(nativeResources
  .filter(([, filename]) => /\.SCR[0-2]$/i.test(filename))
  .map(([source, filename]) => {
    const parsed = parseNativeScrollSprite(source.get(filename).bytes, {
      sourceName: filename,
    });
    return Object.freeze({
      path: `${outputPrefix}/${filename}`,
      imagePath: `${outputPrefix}/${filename.replace(/\.SCR[0-2]$/i, ".png")}`,
      nativeSlot: parsed.slotIndex,
      width: parsed.width,
      height: parsed.height,
      horizontalWrap: "mirror",
      textureOffsetY: -0.2,
      textureNames: parsed.tiles.map(tile => tile.name),
    });
  }));

function textureEntries(input) {
  const bytes = input[0] === 0x1f && input[1] === 0x8b ? gunzipSync(input) : input;
  const entries = [];
  for (let offset = 0; offset >= 0 && offset < bytes.length;) {
    offset = bytes.indexOf("TEXN", offset, "ascii");
    if (offset < 0) break;
    const size = bytes.readUInt32LE(offset + 4);
    const end = offset + size;
    const pvrOffset = bytes.indexOf("PVRT", offset + 16, "ascii");
    if (size > 16 && end <= bytes.length && pvrOffset >= 0 && pvrOffset < end) {
      entries.push(Buffer.concat([
        bytes.subarray(offset + 8, offset + 16),
        Buffer.from(Uint32Array.of(end - pvrOffset).buffer),
        bytes.subarray(pvrOffset, end),
      ]));
    }
    offset += 4;
  }
  return entries;
}
const texturePack = Buffer.concat([
  ...textureEntries(shd2Textures),
  ...textureEntries(shdrTextures),
]);
if (texturePack.length !== 2605504 || sha256(texturePack) !== "39df4836e2e6006db66925516cc7877898aacb0775270f016345f404fab9189d") {
  throw new Error("OP02 texture inventory changed");
}
writeFileSync(path.join(outputDirectory, "OP02_textures.bin"), texturePack);
const faceTable = members.get("MGR_FTBL.BIN");
if (
  !faceTable
  || faceTable.bytes.length !== 41196
  || sha256(faceTable.bytes) !== "a6b16ea46f2f5669361e4d27210110aef06a55951f17a81c913ea303e9af7e7a"
) throw new Error("OP02 MGR_FTBL.BIN changed");
writeFileSync(path.join(outputDirectory, "MGR_FTBL.BIN"), faceTable.bytes);
const facePoseBytes = readFileSync(facePosePath);
const facePoses = JSON.parse(facePoseBytes);
if (
  facePoses?.schema !== "new-yokosuka-native-talk-control-poses-v2"
  || facePoses.actors?.SINF?.faceCode !== "MGR"
  || facePoses.actors.SINF.tableSha256 !== sha256(faceTable.bytes)
  || facePoses.actors.SINF.upperPoses?.length !== facePoses.poseDuration + 1
  || facePoses.actors.SINF.mouthPoses?.length !== facePoses.poseDuration + 1
) throw new Error("OP02 native MGR TALK pose evaluation changed");
const clothTrackBytes = readFileSync(clothTrackPath);
if (
  clothTrackEvidence?.schema !== "new-yokosuka-native-cloth-track-v2"
  || clothTrackEvidence.track?.path !== `${outputPrefix}/MGR_CLOTH_TRACK.bin`
  || clothTrackEvidence.track?.sha256 !== sha256(clothTrackBytes)
  || clothTrackEvidence.track?.byteLength !== clothTrackBytes.length
  || clothTrackEvidence.track?.modelCode !== "MGR"
  || clothTrackEvidence.track?.controlType !== -70
  || clothTrackEvidence.track?.vertexCount !== 160
  || clothTrackEvidence.track?.formatVersion !== 2
  || clothTrackEvidence.track?.coordinateKind !== "native-auth-slot-frame"
  || clothTrackEvidence.track?.completion !== "terminal-auth-frame"
  || JSON.stringify(clothTrackEvidence.track?.firstCoordinate) !== "[2,2]"
  || JSON.stringify(clothTrackEvidence.track?.lastCoordinate) !== "[5,57]"
  || JSON.stringify(clothTrackEvidence.track?.activityCoverage?.map(
    ({ slot }) => slot,
  )) !== "[2,3,4,5]"
) throw new Error("OP02 native MGR cloth track changed");

writeFileSync(path.join(outputDirectory, "M_0605.MOTN"), motionMember.bytes);
const outputs = exactModels.map(([, filename, byteLength, digest]) => ({
  path: `${outputPrefix}/models/${filename}`,
  byteLength,
  sha256: digest,
}));
outputs.push(...nativeResources.map(([, filename, byteLength, digest]) => ({
  path: `${outputPrefix}/${filename}`,
  byteLength,
  sha256: digest,
})));
outputs.push({
  path: `${outputPrefix}/OP02_textures.bin`,
  byteLength: texturePack.length,
  sha256: sha256(texturePack),
}, {
  path: `${outputPrefix}/MGR_FTBL.BIN`,
  byteLength: faceTable.bytes.length,
  sha256: sha256(faceTable.bytes),
}, {
  path: `${outputPrefix}/mgr-talk-poses.generated.json`,
  byteLength: facePoseBytes.length,
  sha256: sha256(facePoseBytes),
}, {
  path: `${outputPrefix}/M_0605.MOTN`,
  byteLength: motionMember.bytes.length,
  sha256: sha256(motionMember.bytes),
}, {
  path: `${outputPrefix}/MGR_CLOTH_TRACK.bin`,
  byteLength: clothTrackBytes.length,
  sha256: sha256(clothTrackBytes),
});
const motionAsset = outputs.find(output => output.path.endsWith("/M_0605.MOTN"));
if (!motionAsset) throw new Error("OP02 authored motion asset is unavailable");
const tracks = trackDefinitions.map((definition) => {
  const bytes = mapinfo.subarray(
    definition.sourceOffset,
    definition.sourceOffset + definition.byteLength,
  );
  const sequence = parseAuthSequence(bytes);
  const movement = parseAuthMovement(bytes);
  const camera = parseAuthCamera(bytes);
  const motions = resolveAuthMotions(sequence, new Map([[16, motion]]));
  if (
    bytes.subarray(0, 4).toString("ascii") !== "TRCK"
    || sequence.durationFrames !== definition.durationFrames
    || JSON.stringify(sequence.actors) !== JSON.stringify(definition.actors)
    || movement.actors.length !== sequence.actors.length
    || camera.cameras.length !== 1
    || motions.some(value => value.motionValid !== true)
  ) throw new Error(`OP02 embedded AUTH at 0x${definition.sourceOffset.toString(16)} changed`);
  const filename = `SEQDATA${definition.index}.AUTH`;
  writeFileSync(path.join(outputDirectory, filename), bytes);
  const asset = {
    path: `${outputPrefix}/${filename}`,
    byteLength: bytes.length,
    sha256: sha256(bytes),
  };
  outputs.push(asset);
  return Object.freeze({
    ...definition,
    slot: definition.index,
    binding: Object.freeze({ kind: "map-embedded-slot" }),
    activityId: `OP02/${filename}`,
    archiveMember: filename,
    sha256: asset.sha256,
    frameCount: sequence.frames.length,
    durationSeconds: Math.max(movement.duration, camera.duration),
    browserMapVisibility: numberedMapLayers.map((layer, index) => Object.freeze({
      nativeName: layer.nativeName,
      visible: browserMapVisibilityByTrack[definition.index][index],
    })),
    programPresentationCues: Object.freeze({
      before: Object.freeze(programPresentationCues.before.get(definition.index) || []),
      frames: Object.freeze(programPresentationCues.frames.get(definition.index) || []),
      after: Object.freeze(programPresentationCues.after.get(definition.index) || []),
    }),
    motions: motions.map(value => Object.freeze({
      actorTag: value.actorTag,
      frame: value.frame,
      motionBank: value.motionBank,
      sequenceIndex: value.sequenceIndex,
      motionName: value.motionName,
      startFrame: value.startFrame,
      endFrame: value.endFrame,
    })),
    asset,
  });
});

const packageActors = Object.freeze({
  SINF: Object.freeze({
    label: "Shenhua Ling",
    modelCode: "MGR_M",
    browserFilename: "S1_OP02_MGR_M.MT5",
    assetPath: `${outputPrefix}/models/MGR_M.CHRM`,
    textureAssetPath: `${outputPrefix}/OP02_textures.bin`,
    assetFormat: "MT5",
    characterScale: 1,
    // Captured from the unmodified OP02 actor's CLTH owner. This is native
    // actor state selecting the shared mode-4 collision path, not an OP02
    // visual override.
    nativeClothRuntimeMode: 4,
    // The live OP02 type-0x79 handler enables its stochastic secondary-motion
    // field after actor initialization. Keep that native environment state
    // distinct from CLTH's mode-4 collision selection.
    nativeSecondaryMotionRuntimeMode: 1,
  }),
  HAWK: Object.freeze({
    label: "Hawk",
    defaultModelCode: "TAK02M7G",
    variants: Object.freeze([
      Object.freeze({
        modelCode: "TAK02M7G",
        browserFilename: "S1_OP02_TAK02M7G.MT5",
        assetPath: `${outputPrefix}/models/TAK02M7G.CHRM`,
        textureAssetPath: `${outputPrefix}/OP02_textures.bin`,
        assetFormat: "MT5",
      }),
      Object.freeze({
        modelCode: "TAK02M8G",
        browserFilename: "S1_OP02_TAK02M8G.MT5",
        assetPath: `${outputPrefix}/models/TAK02M8G.CHRM`,
        textureAssetPath: `${outputPrefix}/OP02_textures.bin`,
        assetFormat: "MT5",
      }),
    ]),
  }),
});
const facialAssets = Object.freeze({
  SINF: Object.freeze({
    actorTag: "SINF",
    bodyModelCode: "MGR_M",
    faceCode: "MGR",
    attachmentRenderKey: -0x43,
    faceRootRenderKey: 3,
    eyeRenderKeys: Object.freeze([77, 78]),
    model: Object.freeze({
      path: `${outputPrefix}/models/MGR_F.CHRM`,
      sourcePath: "extracted_files/data/SCENE/01/OP02/SHD2.PKS/MGR_F.CHRM",
      byteLength: 108220,
      sha256: "2b5c3c5f8408cd9819f430598fb2bcba649b0278165ce042a78366860b4bd4a6",
    }),
    texturePack: Object.freeze({
      path: `${outputPrefix}/OP02_textures.bin`,
      byteLength: texturePack.length,
      sha256: sha256(texturePack),
    }),
    table: Object.freeze({
      path: `${outputPrefix}/MGR_FTBL.BIN`,
      sourcePath: "extracted_files/data/SCENE/01/OP02/SHD2.PKS/MGR_FTBL.BIN",
      byteLength: faceTable.bytes.length,
      sha256: sha256(faceTable.bytes),
    }),
    poses: Object.freeze({
      path: `${outputPrefix}/mgr-talk-poses.generated.json`,
      byteLength: facePoseBytes.length,
      sha256: sha256(facePoseBytes),
      generatedBy: "tools/animation/extract_native_face_poses.py",
      actorTag: "SINF",
    }),
  }),
});
const activityManifest = {
  schema: "new-yokosuka-aseq-activity-pack-v1",
  generatedBy: "tools/cutscenes/build_op02_opening_assets.mjs",
  source: {
    disc: 1,
    path: "extracted_files/data/SCENE/01/OP02/MAPINFO.BIN",
    ...expected.mapinfo,
    archiveFormat: "MAPINFO embedded TRCK",
  },
  nativeBinding: {
    evidence: "tools/evidence/op02-opening-native-lifecycle.json",
    resourceName: "A0100",
    variant: "OP02 entry 00",
    selectionRule: "seven exact embedded TRCK resources owned by function 0x7c",
  },
  audioManifest: "public/audio/world/op02/manifest.json",
  packageActors,
  mapLayers: numberedMapLayers,
  mapGeometryMasks,
  scrollSprites,
  clothTracks: {
    SINF: {
      path: `${outputPrefix}/MGR_CLOTH_TRACK.bin`,
      modelCode: "MGR_M",
      controlType: -70,
      frameRate: clothTrackEvidence.track.frameRate,
      frameCount: clothTrackEvidence.track.frameCount,
      firstCoordinate: clothTrackEvidence.track.firstCoordinate,
      lastCoordinate: clothTrackEvidence.track.lastCoordinate,
      activityOrder: clothTrackEvidence.track.activityCoverage.map(
        ({ slot }) => slot,
      ),
      byteLength: clothTrackBytes.length,
      sha256: sha256(clothTrackBytes),
      evidence: "tools/evidence/op02-mgr-cloth-track.json",
    },
  },
  nodeMotion: {
    actorTag: "HAWK",
    path: `${outputPrefix}/M_TORI.MOTN`,
    initialSequenceIndex: 1,
    resourceIds: hawkTmnmResourceIds,
    playbackKindsBySequenceIndex: hawkMotion.sequences
      .map(sequence => sequence.playbackKind),
    modelCodesBySequenceIndex: [
      "TAK02M7G", "TAK02M7G", "TAK02M7G", "TAK02M7G",
      "TAK02M7G", "TAK02M8G", "TAK02M8G", "TAK02M8G",
    ],
  },
  ownerAudioCommands: sourceGraph.audio.ownerCommands,
  facialAssets,
  motionBanks: [{
    bank: 16,
    path: motionAsset.path,
    byteLength: motionAsset.byteLength,
    sha256: motionAsset.sha256,
  }],
  outputs,
  activities: tracks,
};
writeFileSync(
  path.join(outputDirectory, "manifest.json"),
  `${JSON.stringify(activityManifest, null, 2)}\n`,
);

console.log(`Wrote exact OP02 opening assets to ${path.relative(root, outputDirectory)}`);
