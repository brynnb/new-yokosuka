#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as BABYLON from "@babylonjs/core";

import { parseAuthCamera } from "../../src/AuthCamera.js";
import { parseAuthMovement } from "../../src/AuthMovement.js";
import { parseAuthSequence } from "../../src/AuthSequence.js";
import { MotnLoader } from "../../src/MotnLoader.js";
import { Mt5Loader } from "../../src/Mt5Loader.js";
import { parseNativeScrollSprite } from "../../src/NativeScrollSprite.js";
import { parseTmnmMotion } from "../../src/TmnmMotion.js";
import { createNativeCutsceneSourceGraph } from "../lib/NativeCutsceneSourceGraph.mjs";
import { parseIpacActivityArchive } from "../lib/NativeAseqActivityPack.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sourceRoot = [
  process.env.SHENMUE_DISC1_EXTRACTED_ROOT,
  path.join(root, "extracted_files"),
].filter(Boolean).find(existsSync);
if (!sourceRoot) throw new Error("an exact Shenmue Disc 1 extraction was not found");

const area = "OP02";
const disc = 1;
const sourceDirectory = path.join(sourceRoot, "data/SCENE/01/OP02");
const outputPath = path.join(
  root,
  "play/assets/introduction/op02/cutscene-source-graph.generated.json",
);
const programPath = path.join(
  root,
  "play/assets/introduction/op02/cutscene-program.generated.json",
);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function offset(value) {
  return Number.parseInt(String(value), 16);
}

function commandCounts(sequence) {
  const counts = {};
  for (const command of sequence.frames.flatMap(frame => frame.commands)) {
    counts[command.name] = (counts[command.name] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => (
    left.localeCompare(right)
  )));
}

function nativeStrings(bytes) {
  const matches = bytes.toString("latin1").match(/[A-Za-z0-9_]+\.snd/giu) || [];
  return [...new Set(matches.map(value => value.toLowerCase()))].sort();
}

function nativeCommandHex(word) {
  return [0, 8, 16, 24]
    .map(shift => ((word >>> shift) & 0xff).toString(16).padStart(2, "0"))
    .join("");
}

function compiledActions(program, semanticId) {
  return program.functions.flatMap(fn => fn.blocks.flatMap(block => (
    block.actions
      .filter(action => action.semanticId === semanticId)
      .map(action => ({ function: fn.id, block: block.id, ...action }))
  )));
}

async function modelRecord(archiveId, member) {
  const engine = new BABYLON.NullEngine();
  const scene = new BABYLON.Scene(engine);
  try {
    const loader = new Mt5Loader(scene, { characterRigMode: "gpu" });
    const bytes = member.bytes.buffer.slice(
      member.bytes.byteOffset,
      member.bytes.byteOffset + member.bytes.byteLength,
    );
    const [model] = await loader.load(bytes, null, { sourceFilename: member.name });
    const nodes = model._mt5Nodes || [];
    const indexByAddress = new Map(nodes.map((node, index) => [node.addr, index]));
    const topology = nodes.map(node => ({
      parent: indexByAddress.get(node.parentAddr) ?? -1,
      flag: node.flag,
      hasModel: node.modelAddr !== 0,
    }));
    return {
      logicalId: `${area}/${archiveId}/${member.name}`,
      resourceId: `${area}/${archiveId}/${member.name}`,
      nativeName: member.name,
      kind: member.name.endsWith(".CHRM") ? "character-model" : "map-model",
      hierarchy: {
        nodeCount: nodes.length,
        topologySha256: sha256(Buffer.from(JSON.stringify(topology))),
      },
    };
  } finally {
    scene.dispose();
    engine.dispose();
  }
}

const catalog = JSON.parse(readFileSync(path.join(
  root,
  "play/data/events/nativeScriptedSceneCatalog.generated.json",
), "utf8"));
const map = catalog.maps.find(candidate => candidate.disc === disc && candidate.area === area);
if (!map) throw new Error("OP02 is absent from the native scripted-scene catalog");

const mapinfo = readFileSync(path.join(sourceDirectory, "MAPINFO.BIN"));
if (sha256(mapinfo) !== map.mapinfoSha256) throw new Error("OP02 MAPINFO changed");

const lifecycle = JSON.parse(readFileSync(path.join(
  root,
  "tools/evidence/op02-opening-native-lifecycle.json",
), "utf8"));
const compiledProgram = JSON.parse(readFileSync(programPath, "utf8"));
const entryFunction = lifecycle.source.entryOwnerFunctionFileOffset;
const entryCandidate = map.entryCandidates.find(value => value.entryFunction === entryFunction);
if (!entryCandidate) throw new Error(`OP02 entry ${entryFunction} is absent from the catalog`);
if (
  compiledProgram.schema !== "new-yokosuka-native-cutscene-program-v1"
  || compiledProgram.area !== area
  || compiledProgram.disc !== disc
  || compiledProgram.entryFunction !== entryFunction
  || compiledProgram.mapinfoSha256 !== map.mapinfoSha256
) throw new Error("OP02 compiled owner program does not match its source graph");

const archiveDefinitions = [
  { id: "SHD2", filename: "SHD2.PKS", lifecycle: "activity-local" },
  { id: "SHDR", filename: "SHDR.PKS", lifecycle: "area-resident" },
];
const archives = archiveDefinitions.map((definition) => {
  const bytes = readFileSync(path.join(sourceDirectory, definition.filename));
  return {
    ...definition,
    bytes,
    sha256: sha256(bytes),
    archive: parseIpacActivityArchive(bytes, `${area}/${definition.id}`),
  };
});

const resources = [{
  logicalId: `${area}/MAPINFO.BIN`,
  contentIdentity: `sha256:${map.mapinfoSha256}`,
  kind: "mapinfo",
  source: { disc, path: "SCENE/01/OP02/MAPINFO.BIN" },
  byteLength: mapinfo.length,
}];
for (const archive of archives) {
  for (const member of archive.archive.members) {
    const scroll = /\.SCR[0-2]$/i.test(member.name)
      ? parseNativeScrollSprite(member.bytes, { sourceName: member.name })
      : null;
    resources.push({
      logicalId: `${area}/${archive.id}/${member.name}`,
      contentIdentity: `sha256:${sha256(member.bytes)}`,
      kind: scroll ? "scroll-sprite" : "archive-member",
      source: {
        disc,
        path: `SCENE/01/OP02/${archive.filename}`,
        archiveMember: member.name,
      },
      byteLength: member.bytes.length,
      lifecycle: archive.lifecycle,
      ...(scroll ? {
        nativeSlot: scroll.slotIndex,
        logicalDimensions: [scroll.width, scroll.height],
        tiles: scroll.tiles.map(tile => ({
          index: tile.tileIndex,
          textureName: tile.name,
          width: tile.width,
          height: tile.height,
          colorFormat: tile.colorFormat,
          dataFormat: tile.dataFormat,
        })),
      } : {}),
    });
  }
}

const authById = new Map(catalog.authResources.map(value => [value.id, value]));
const activities = map.authDependencies.exactMapEmbeddedResourceIds.map((resourceId) => {
  const definition = authById.get(resourceId);
  if (!definition) throw new Error(`OP02 AUTH ${resourceId} is absent from the catalog`);
  const start = offset(definition.sourceOffset);
  const bytes = mapinfo.subarray(start, start + definition.byteLength);
  const sequence = parseAuthSequence(bytes);
  const movement = parseAuthMovement(bytes);
  const camera = parseAuthCamera(bytes);
  const logicalId = `${area}/MAPINFO.BIN/TRCK@${definition.sourceOffset}`;
  resources.push({
    logicalId,
    contentIdentity: `sha256:${definition.payloadSha256}`,
    kind: "auth-activity",
    source: {
      disc,
      path: "SCENE/01/OP02/MAPINFO.BIN",
      byteOffset: definition.sourceOffset,
    },
    byteLength: definition.byteLength,
  });
  return {
    logicalId,
    resourceId: logicalId,
    nativeCatalogId: definition.id,
    actors: sequence.actors,
    durationFrames: sequence.durationFrames,
    movementDurationSeconds: movement.duration,
    cameraDurationSeconds: camera.duration,
    cameraCount: camera.cameras.length,
    commandCounts: commandCounts(sequence),
  };
});

const models = [];
for (const archive of archives) {
  for (const member of archive.archive.members.filter(value => (
    value.name.endsWith(".CHRM") || value.name.endsWith(".MAPM")
  ))) {
    models.push(await modelRecord(archive.id, member));
  }
}

const motions = [];
for (const archive of archives) {
  for (const member of archive.archive.members.filter(value => value.name.endsWith(".MOTN"))) {
    const logicalId = `${area}/${archive.id}/${member.name}`;
    try {
      const motion = parseTmnmMotion(member.bytes);
      motions.push({
        logicalId,
        resourceId: logicalId,
        format: "TMNM",
        sequences: motion.sequences.map(sequence => ({
          index: sequence.index,
          name: sequence.name,
          playbackKind: sequence.playbackKind,
          durationFrames: sequence.durationFrames,
          requiredNodeCount: sequence.nodeCount,
        })),
      });
    } catch {
      const motion = MotnLoader.parse(member.bytes);
      motions.push({
        logicalId,
        resourceId: logicalId,
        format: "MOTN",
        sequences: motion.sequences.map(sequence => ({
          index: sequence.index,
          name: sequence.name,
          durationFrames: sequence.durationFrames,
          controllerFamilyIndex: sequence.controllerFamilyIndex,
        })),
      });
    }
  }
}

const motionCompatibility = motions.flatMap(motion => motion.sequences
  .filter(sequence => Number.isInteger(sequence.requiredNodeCount))
  .map(sequence => ({
    motionId: motion.logicalId,
    sequenceIndex: sequence.index,
    sequenceName: sequence.name,
    requiredNodeCount: sequence.requiredNodeCount,
    compatibleModelIds: models
      .filter(model => model.hierarchy.nodeCount === sequence.requiredNodeCount)
      .map(model => model.logicalId),
  })));

const musicCatalog = JSON.parse(readFileSync(path.join(
  root,
  "public/music/asset-viewer-manifest.json",
), "utf8"));
const audioManifest = JSON.parse(readFileSync(path.join(
  root,
  "public/audio/world/op02/manifest.json",
), "utf8"));
const soundReferences = nativeStrings(mapinfo);
const music = soundReferences.flatMap((nativeName) => Object.entries(musicCatalog.tracks)
  .filter(([, track]) => track.source?.file?.toLowerCase() === nativeName)
  .map(([trackId, track]) => ({
    nativeName,
    trackId,
    sourceSha256: track.source.sha256,
    groupCommand: track.source.groupCommand,
    assetSha256: track.sha256,
    assetUrl: track.url,
  })));
const soundEvidence = JSON.parse(readFileSync(path.join(
  root,
  "tools/evidence/sound-command-operation-evidence.json",
), "utf8"));
const ignoredControls = soundEvidence.aicaDriver.provenIgnoredControls
  .filter(value => value.area === area);
const ownerCommandRows = compiledActions(compiledProgram, "sound-command-dispatch")
  .map((action) => {
    if (action.arguments.some(argument => argument.kind !== "constant")) {
      throw new Error(`OP02 dynamic sound command at ${action.callFileOffset}`);
    }
    const [commandWord, argumentOne, argumentTwo] = action.arguments
      .map(argument => argument.value >>> 0);
    const commandHex = nativeCommandHex(commandWord);
    const musicRoute = music.find(value => (
      value.groupCommand.toLowerCase() === commandHex
    ));
    if (musicRoute) {
      return {
        commandHex,
        exactArguments: [argumentOne, argumentTwo],
        kind: "music",
        trackId: musicRoute.trackId,
        callFileOffset: action.callFileOffset,
      };
    }
    const ignored = ignoredControls.find(value => (
      Number.parseInt(value.nativeCommandWord, 16) === commandWord
      && value.argumentsOneAndTwo[0] === argumentOne
      && value.argumentsOneAndTwo[1] === argumentTwo
    ));
    if (!ignored) {
      throw new Error(`OP02 sound command ${commandHex} is unresolved`);
    }
    return {
      commandHex,
      exactArguments: [argumentOne, argumentTwo],
      kind: "native-control-no-output",
      constructedQueueWord: ignored.constructedQueueWord,
      byteReversedDriverWord: ignored.byteReversedDriverWord,
      callFileOffset: action.callFileOffset,
    };
  });
const ownerCommands = [...new Map(ownerCommandRows.map((value) => {
  const key = `${value.commandHex}:${value.exactArguments.join(":")}`;
  return [key, {
    ...value,
    callFileOffsets: ownerCommandRows
      .filter(candidate => (
        candidate.commandHex === value.commandHex
        && candidate.exactArguments.join(":") === value.exactArguments.join(":")
      ))
      .map(candidate => candidate.callFileOffset),
  }];
})).values()].map(({ callFileOffset: _callFileOffset, ...value }) => value);

const graph = createNativeCutsceneSourceGraph({
  id: "S1-OP02-00",
  disc,
  area,
  source: {
    mapinfo: {
      path: "SCENE/01/OP02/MAPINFO.BIN",
      byteLength: mapinfo.length,
      sha256: map.mapinfoSha256,
    },
    archives: archives.map(value => ({
      path: `SCENE/01/OP02/${value.filename}`,
      lifecycle: value.lifecycle,
      byteLength: value.bytes.length,
      sha256: value.sha256,
    })),
    evidence: [
      "tools/evidence/op02-opening-native-lifecycle.json",
      "play/data/events/nativeScriptedSceneCatalog.generated.json",
    ],
  },
  program: {
    entryFunction,
    ownerFunction: lifecycle.source.ownerFunctionFileOffset,
    nativeActivityResourceName: lifecycle.activity.resourceName,
    structuralEntry: entryCandidate,
    compiledArtifact: {
      path: "play/assets/introduction/op02/cutscene-program.generated.json",
      schema: compiledProgram.schema,
      summary: compiledProgram.summary,
    },
  },
  resources,
  activities,
  models,
  motions,
  motionCompatibility,
  audio: {
    nativeSoundReferences: soundReferences,
    voices: audioManifest.voices.map(value => ({
      voiceId: value.voiceId,
      nativeSha256: value.nativeSha256,
      assetSha256: value.sha256,
    })),
    soundEffects: audioManifest.sounds.map(value => ({
      command: value.commandHex,
      assetSha256: value.sha256,
    })),
    music,
    ownerCommands,
  },
  compile: {
    status: compiledProgram.compile.status,
    blockers: compiledProgram.compile.blockers,
  },
});

mkdirSync(path.dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(graph, null, 2)}\n`);
console.log(`Wrote ${path.relative(root, outputPath)}`);
