#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  resolveShenmue2NativeMotionId,
  SHENMUE2_AREA_MOTION_BANK_FILES,
  Shenmue2MotLoader,
  shenmue2Mt7BodyValue,
  shenmue2Mt7MotionFamily,
  shenmue2NpcLocomotionMotionId,
} from "../../src/Shenmue2MotLoader.js";
import { parseMt7 } from "../../src/Mt7Parser.js";
import {
  shenmue2NpcOpcodeWordCount,
  shenmue2NpcProgramIsAligned,
} from "../../src/Shenmue2NpcProgram.js";
import {
  buildShenmue2RouteGraph,
  shenmue2RoutePath,
  shenmue2RouteSplinePoint,
} from "../lib/shenmue2_npc_navigation.js";

const npcRoot = path.resolve(
  process.argv[2]
    || ".disc-work/shenmue2-disc1-native-npc",
);
const dataDirectory = path.resolve(
  process.argv[3] || "play/data/shenmue2-crowd",
);
const assetDirectory = path.resolve(
  process.argv[4] || "play/assets/shenmue2-characters",
);
const motionAssetDirectory = path.resolve(
  process.argv[5] || "play/assets/shenmue2-motion",
);
const sharedMotionDirectory = process.argv[6]
  ? path.resolve(process.argv[6])
  : path.resolve(".disc-work/shenmue2-disc1-native");
const npcPath = path.join(npcRoot, "NPC.BIN");
const firstExisting = (...filenames) => filenames.find(fs.existsSync)
  || filenames[0];
const globalMotionPath = process.argv[7]
  ? path.resolve(process.argv[7])
  : firstExisting(
      path.join(sharedMotionDirectory, "MOTION.MOT"),
      path.resolve(
        ".disc-work/shenmue2-xbox-extracted/Shenmue II/misc/MOTION.MOT",
      ),
    );
const humansPath = firstExisting(
  path.join(npcRoot, "HUMANS.AFS"),
  path.join(npcRoot, "HUMANS.afs"),
);
const humansIndexPath = firstExisting(
  path.join(npcRoot, "HUMANS.IDX"),
  path.join(npcRoot, "HUMANS.idx"),
);
const CROWD_MODELS = 16;
const MAX_ACTORS_PER_WORLD = 12;
const GENERIC_ACTOR_CODE = /^(?:0[0-9]|1[0-8])[A-H]_$/;
// Exact actor identities recovered from retained native pose captures. These
// story actors are not scheduled by the outdoor NPC.BIN, but their models are
// required to compare those captures against the actual rendered CHRM rather
// than a same-sized representative rig.
const NATIVE_CONFORMANCE_ACTOR_CODES = new Set(["HOI_", "SYB_", "XHO_"]);

const NODE_PREFIX_WORLDS = Object.freeze({
  "00": "s2ar02",
  AB: "s2ar03",
  AK: "s2ak00",
  AR: "s2ar02",
  AV: "s2ar02",
  BH: "s2ar03",
  CW: "s2ar02",
  EX: "s2ws00",
  GM: "s2ws00",
  GT: "s2wn00",
  KU: "s2wn00",
  LL: "s2ar02",
  ST: "s2ar02",
  SY: "s2wn00",
  T2: "s2ws00",
  T3: "s2wt00",
  T8: "s2ws00",
  WB: "s2wb00",
  WE: "s2we00",
  WH: "s2wr00",
  WK: "s2wk00",
  WN: "s2wn00",
  WR: "s2wr00",
  WS: "s2ws00",
  WT: "s2wt00",
});
const NATIVE_TIMETABLE_WORLDS = new Set(
  Object.values(NODE_PREFIX_WORLDS),
);

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function ascii(bytes) {
  return bytes.toString("ascii").replace(/[^\x20-\x7e]/g, ".");
}

function cleanAscii(bytes) {
  return ascii(bytes).replace(/\.+$/g, "").trim();
}

function parseAfs(bytes) {
  if (!ascii(bytes.subarray(0, 4)).startsWith("AFS")) {
    throw new Error(`${humansPath} is not an AFS archive.`);
  }
  const count = bytes.readUInt32LE(4);
  return Array.from({ length: count }, (_, index) => ({
    index,
    offset: bytes.readUInt32LE(8 + index * 8),
    length: bytes.readUInt32LE(12 + index * 8),
  }));
}

function parseIpacChildren(entryBytes, base = 16) {
  if (ascii(entryBytes.subarray(base, base + 4)) !== "IPAC") return [];
  const table = base + entryBytes.readUInt32LE(base + 4);
  const count = entryBytes.readUInt32LE(base + 8);
  return Array.from({ length: count }, (_, index) => {
    const record = table + index * 20;
    return {
      filename: cleanAscii(entryBytes.subarray(record, record + 8)),
      extension: cleanAscii(entryBytes.subarray(record + 8, record + 12)),
      offset: base + entryBytes.readUInt32LE(record + 12),
      length: entryBytes.readUInt32LE(record + 16),
    };
  });
}

function texturePack(entryBytes, entryIndex) {
  if (ascii(entryBytes.subarray(0, 4)) !== "PAKF") {
    throw new Error(`HUMANS entry ${entryIndex} is not a PAKF texture pack.`);
  }
  const packageSize = Math.min(entryBytes.readUInt32LE(4), entryBytes.length);
  const expectedTextures = entryBytes.readUInt32LE(12);
  const records = [];
  for (let cursor = 16; cursor + 8 <= packageSize;) {
    const marker = ascii(entryBytes.subarray(cursor, cursor + 4));
    const blockSize = entryBytes.readUInt32LE(cursor + 4);
    const end = cursor + blockSize;
    if (blockSize < 8 || end > packageSize) break;
    if (marker === "TEXN") {
      const pvrOffset = entryBytes.indexOf(Buffer.from("PVRT"), cursor + 16);
      if (pvrOffset >= cursor + 16 && pvrOffset + 8 <= end) {
        const pvrLength = entryBytes.readUInt32LE(pvrOffset + 4) + 8;
        if (pvrOffset + pvrLength <= end) {
          const header = Buffer.alloc(12);
          entryBytes.copy(header, 0, cursor + 8, cursor + 16);
          header.writeUInt32LE(pvrLength, 8);
          records.push(header, entryBytes.subarray(pvrOffset, pvrOffset + pvrLength));
        }
      }
    }
    cursor = end;
  }
  if (records.length / 2 !== expectedTextures) {
    throw new Error(
      `HUMANS entry ${entryIndex} yielded ${records.length / 2}`
      + `/${expectedTextures} textures.`,
    );
  }
  return Buffer.concat(records);
}

function humanLogicalCodes(bytes) {
  const count = bytes.readUInt32LE(0);
  if (4 + count * 8 !== bytes.length) {
    throw new Error("Unexpected Shenmue II HUMANS.IDX layout.");
  }
  return Array.from({ length: count }, (_, index) => (
    bytes.subarray(4 + index * 4, 8 + index * 4).toString("ascii")
  ));
}

function npcSections(bytes) {
  const nodeCount = bytes.readUInt32LE(16);
  const nodeOffset = bytes.readUInt32LE(20);
  const routeCount = bytes.readUInt32LE(24);
  const routeOffset = bytes.readUInt32LE(28);
  if (
    nodeOffset + nodeCount * 68 > bytes.length
    || routeOffset + routeCount * 76 > bytes.length
  ) {
    throw new Error("NPC.BIN navigation sections exceed the source file.");
  }
  return { nodeCount, nodeOffset, routeCount, routeOffset };
}

function parseNodes(bytes, sections) {
  return Array.from({ length: sections.nodeCount }, (_, index) => {
    const offset = sections.nodeOffset + index * 68;
    const id = bytes.subarray(offset, offset + 4).toString("ascii");
    return {
      index,
      id,
      worldId: NODE_PREFIX_WORLDS[id.slice(0, 2)] || null,
      routeIndex: bytes.readInt16LE(offset + 4),
      routeParameter: bytes.readInt16LE(offset + 8),
      x: bytes.readFloatLE(offset + 52),
      y: bytes.readFloatLE(offset + 56),
      z: bytes.readFloatLE(offset + 60),
      sourceOffset: offset,
    };
  });
}

function packedClockSecond(value) {
  const hour = value >>> 8;
  const minute = value & 0xff;
  return hour < 24 && minute < 60 ? hour * 3600 + minute * 60 : null;
}

function uint32Float(value) {
  const bytes = Buffer.allocUnsafe(4);
  bytes.writeUInt32LE(value >>> 0);
  return bytes.readFloatLE(0);
}

function parseNativeActorPrograms(bytes, sections, nodes) {
  const actorCount = bytes.readUInt32LE(8);
  const actorTableOffset = bytes.readUInt32LE(12);
  const offsets = Array.from({ length: actorCount }, (_, index) => (
    actorTableOffset + bytes.readUInt32LE(actorTableOffset + index * 4)
  ));
  const ends = [...offsets.slice(1), sections.nodeOffset];
  return offsets.flatMap((offset, actorIndex) => {
    const actorCode = bytes.subarray(offset, offset + 4).toString("ascii");
    if (!GENERIC_ACTOR_CODE.test(actorCode)) return [];
    const actorProfile = {
      variant: bytes.readUInt8(offset + 4),
      ageCategory: bytes.readUInt8(offset + 5),
      motionSubtype: bytes.readUInt8(offset + 8),
      sourceOffset: offset + 4,
    };
    const end = ends[actorIndex];
    const words = Array.from(
      { length: (end - offset) / 4 },
      (_, index) => bytes.readUInt32LE(offset + index * 4),
    );
    const terminators = words
      .map((word, index) => (word === 0xffffffff ? index : -1))
      .filter((index) => index >= 0);
    // The fixed actor profile is 14 words. The first program commonly starts
    // with opcode 0x0c area/block selectors before its placement command.
    const starts = [14, ...terminators.map((index) => index + 1)];
    return terminators.flatMap((terminator, blockIndex) => {
      const start = starts[blockIndex];
      let placement = -1;
      for (let cursor = start; cursor + 1 < terminator; cursor += 1) {
        if (
          words[cursor] === 3
          && words[cursor + 1] < nodes.length
          && shenmue2NpcProgramIsAligned(words, cursor, terminator)
        ) {
          placement = cursor;
          break;
        }
      }
      if (placement < 0) return [];
      const nodeReferences = [];
      const timeBoundaries = [];
      const operations = [];
      for (let cursor = placement; cursor < terminator;) {
        const opcode = words[cursor];
        const wordCount = shenmue2NpcOpcodeWordCount(opcode);
        if (wordCount === null || cursor + wordCount > terminator) {
          throw new Error(
            `Invalid NPC opcode 0x${opcode.toString(16)} at `
            + `0x${(offset + cursor * 4).toString(16)}.`,
          );
        }
        const operation = {
          opcode,
          arguments: words.slice(cursor + 1, cursor + wordCount),
          sourceOffset: offset + cursor * 4,
        };
        operations.push(operation);
        if (opcode === 1 || opcode === 2) {
          const second = packedClockSecond(words[cursor + 1]);
          if (second !== null) {
            timeBoundaries.push({
              opcode,
              packed: words[cursor + 1],
              second,
              sourceOffset: offset + cursor * 4,
            });
          }
        } else if (opcode === 3) {
          const nodeIndex = words[cursor + 1];
          if (nodeIndex < nodes.length) {
            nodeReferences.push({
              opcode,
              node: nodes[nodeIndex],
              sourceOffset: offset + cursor * 4,
              beforeFirstTime: timeBoundaries.length === 0,
            });
          }
        } else if (opcode === 4 || opcode === 0x12) {
          const nodeIndex = words[cursor + 1];
          if (nodeIndex < nodes.length) {
            nodeReferences.push({
              opcode,
              node: nodes[nodeIndex],
              weight: bytes.readFloatLE(offset + (cursor + 2) * 4),
              sourceOffset: offset + cursor * 4,
              beforeFirstTime: timeBoundaries.length === 0,
            });
          }
        }
        cursor += wordCount;
      }
      const authoredNodes = nodeReferences.filter(
        (reference) => reference.beforeFirstTime,
      );
      if (!authoredNodes.length) return [];
      const placements = authoredNodes.filter(
        (reference) => reference.opcode === 3,
      );
      const crossesWorlds = new Set(
        placements.map((reference) => reference.node.worldId),
      ).size > 1;
      // A handful of residents have one pre-clock opcode-3 placement in
      // Aberdeen and another in Wan Chai. They are persistent story actors
      // moved between loaded maps by the native program. /play deliberately
      // makes every district independently explorable without story state, so
      // retain one world-local segment for each placement rather than drawing
      // a fictitious route between maps or discarding either incarnation.
      const segments = crossesWorlds ? placements : [placements[0]];
      return segments.flatMap((segmentPlacement, worldSegmentIndex) => {
        const segmentStart = segmentPlacement.sourceOffset;
        const nextPlacement = crossesWorlds
          ? placements[worldSegmentIndex + 1]
          : null;
        const segmentEnd = nextPlacement?.sourceOffset
          ?? (offset + terminator * 4);
        const segmentOperations = operations.filter((operation) => (
          operation.sourceOffset >= segmentStart
          && operation.sourceOffset < segmentEnd
        ));
        const segmentNodes = nodeReferences.filter((reference) => (
          reference.sourceOffset >= segmentStart
          && reference.sourceOffset < segmentEnd
        ));
        const segmentTimes = timeBoundaries.filter((boundary) => (
          boundary.sourceOffset >= segmentStart
          && boundary.sourceOffset < segmentEnd
        ));
        const worldId = segmentPlacement.node.worldId;
        if (!NATIVE_TIMETABLE_WORLDS.has(worldId)) return [];
        return [{
          actorCode,
          actorProfile,
          actorIndex,
          blockIndex,
          worldSegmentIndex: crossesWorlds ? worldSegmentIndex : null,
          worldId,
          sourceOffset: segmentStart,
          sourceEnd: segmentEnd + (nextPlacement ? 0 : 4),
          selectorWords: words.slice(start, placement),
          nodes: segmentNodes.filter((reference) => reference.beforeFirstTime),
          allNodes: segmentNodes,
          timeBoundaries: segmentTimes,
          operations: segmentOperations,
          explicitPoseMotionId: segmentOperations.find(
            (operation) => operation.opcode === 0x2d,
          )?.arguments[0] ?? null,
          explicitPoseFlags: segmentOperations.find(
            (operation) => operation.opcode === 0x2d,
          )?.arguments[1] ?? null,
        }];
      });
    });
  });
}

function nearestNode(point, nodes) {
  let nearest = null;
  let nearestSquared = Infinity;
  for (const node of nodes) {
    const squared = (node.x - point[0]) ** 2 + (node.z - point[2]) ** 2;
    if (squared < nearestSquared) {
      nearest = node;
      nearestSquared = squared;
    }
  }
  return nearest;
}

function routeWorld(points, nodes) {
  const votes = new Map();
  for (const point of points) {
    const worldId = nearestNode(point, nodes)?.worldId;
    if (worldId) votes.set(worldId, (votes.get(worldId) || 0) + 1);
  }
  return [...votes].sort((left, right) => (
    right[1] - left[1] || left[0].localeCompare(right[0])
  ))[0]?.[0] || null;
}

function parseRoutes(bytes, sections, nodes) {
  return Array.from({ length: sections.routeCount }, (_, index) => {
    const offset = sections.routeOffset + index * 76;
    const pointsOffset = bytes.readUInt32LE(offset);
    const pointCount = bytes.readUInt32LE(offset + 4);
    const absolutePointsOffset = sections.routeOffset + pointsOffset;
    if (
      pointCount < 2
      || pointCount > 256
      || absolutePointsOffset + pointCount * 12 > bytes.length
    ) {
      throw new Error(`Invalid NPC route ${index} at 0x${offset.toString(16)}.`);
    }
    const points = Array.from({ length: pointCount }, (_, pointIndex) => {
      const pointOffset = absolutePointsOffset + pointIndex * 12;
      return [
        bytes.readFloatLE(pointOffset),
        bytes.readFloatLE(pointOffset + 4),
        bytes.readFloatLE(pointOffset + 8),
      ];
    });
    return {
      id: bytes.subarray(offset + 68, offset + 72).toString("ascii"),
      index,
      points,
      // Default.xbe 0x61df6 decodes these signed references. The sign selects
      // the connected end of the neighboring route; 0x6276b/0x62778 expose
      // the two native lookup variants used by the route builder.
      endRouteReferences: [
        bytes.readInt16LE(offset + 12),
        bytes.readInt16LE(offset + 14),
      ],
      startRouteReferences: [
        bytes.readInt16LE(offset + 20),
        bytes.readInt16LE(offset + 22),
      ],
      sourceOffset: offset,
      sourcePointsOffset: absolutePointsOffset,
      worldId: routeWorld(points, nodes),
    };
  });
}

function selectRoutes(routes) {
  const grounded = routes.filter((route) => (
    route.worldId && route.points.every((point) => point[1] > 50)
  ));
  if (grounded.length <= MAX_ACTORS_PER_WORLD) return grounded;
  return Array.from({ length: MAX_ACTORS_PER_WORLD }, (_, index) => (
    grounded[Math.floor(index * grounded.length / MAX_ACTORS_PER_WORLD)]
  ));
}

function loopPoints(points) {
  const browser = points.map(([x, y, z]) => [-x, y, z]);
  return [
    ...browser,
    ...browser.slice(1, -1).reverse(),
  ];
}

function writeExact(filename, bytes) {
  if (fs.existsSync(filename) && fs.readFileSync(filename).equals(bytes)) return;
  fs.writeFileSync(filename, bytes);
}

const npcBytes = fs.readFileSync(npcPath);
const humansBytes = fs.readFileSync(humansPath);
const indexBytes = fs.readFileSync(humansIndexPath);
const sections = npcSections(npcBytes);
const nodes = parseNodes(npcBytes, sections);
const routes = parseRoutes(npcBytes, sections, nodes);
const routeGraph = buildShenmue2RouteGraph(routes, nodes);
const nativePrograms = parseNativeActorPrograms(npcBytes, sections, nodes);
const logicalCodes = humanLogicalCodes(indexBytes);
const afsEntries = parseAfs(humansBytes);
if (afsEntries.length !== logicalCodes.length * 2) {
  throw new Error("HUMANS.AFS does not contain one PAKF/PAKS pair per IDX row.");
}

const nativeActorCodes = new Set(nativePrograms.map((program) => program.actorCode));
const modelLogicalIndices = new Set(
  Array.from({ length: CROWD_MODELS }, (_, index) => index),
);
for (let index = 0; index < logicalCodes.length; index += 1) {
  if (
    nativeActorCodes.has(logicalCodes[index])
    || NATIVE_CONFORMANCE_ACTOR_CODES.has(logicalCodes[index])
  ) modelLogicalIndices.add(index);
}

fs.mkdirSync(assetDirectory, { recursive: true });
fs.mkdirSync(motionAssetDirectory, { recursive: true });
const globalMotionBytes = fs.readFileSync(globalMotionPath);
const globalMotionBank = Shenmue2MotLoader.parse(globalMotionBytes);
const nativeMotionBankByName = new Map();
function locomotionEvidence(model) {
  const motionFamilyIndex = shenmue2Mt7MotionFamily(model.rootNodeId);
  const motionId = shenmue2NpcLocomotionMotionId(motionFamilyIndex);
  if (motionId === null) {
    throw new Error(
      `Native locomotion family for ${model.logicalCode}/${model.modelCode} is unresolved.`,
    );
  }
  const sequence = globalMotionBank.sequences[motionId - 0xf001];
  if (!sequence?.valid || sequence.durationFrames <= 0) {
    throw new Error(
      `Native locomotion 0x${motionId.toString(16)} for ${model.logicalCode} is invalid.`,
    );
  }
  const start = Shenmue2MotLoader.evaluateSequence(sequence, 0).rootPosition;
  const end = Shenmue2MotLoader.evaluateSequence(
    sequence,
    sequence.durationFrames,
  ).rootPosition;
  return {
    mt7RootNodeId: `0x${model.rootNodeId.toString(16)}`,
    mt7BodyValue: shenmue2Mt7BodyValue(model.rootNodeId),
    motionFamilyIndex,
    locomotionMotionId: motionId,
    locomotionSpeed: Math.hypot(end.x - start.x, end.z - start.z)
      / (sequence.durationFrames / 30),
  };
}
const nativeBankByFilename = new Map([
  ["NPC.MOT", "npc"],
  ["NPC_TBL.MOT", "npcTable"],
  ["MOTION.MOT", "motion"],
  ...Object.entries(SHENMUE2_AREA_MOTION_BANK_FILES).map(
    ([bank, filename]) => [filename, bank],
  ),
]);
const nativeMotionSources = Object.fromEntries(
  [
    "NPC.MOT",
    "NPC_TBL.MOT",
    "MOTION.MOT",
    ...Object.values(SHENMUE2_AREA_MOTION_BANK_FILES),
  ].map((filename) => {
    const areaMotionPath = path.resolve(
      ".disc-work/shenmue2-xbox-extracted/Shenmue II/scene/01/npc",
      filename,
    );
    const source = filename === "MOTION.MOT"
      ? globalMotionPath
      : firstExisting(
          path.join(sharedMotionDirectory, filename),
          areaMotionPath,
        );
    const bytes = fs.readFileSync(source);
    writeExact(path.join(motionAssetDirectory, filename), bytes);
    nativeMotionBankByName.set(
      nativeBankByFilename.get(filename),
      filename === "MOTION.MOT"
        ? globalMotionBank
        : Shenmue2MotLoader.parse(bytes),
    );
    return [filename, {
      source: `MISC/${filename}`,
      sha256: sha256(bytes),
      byteLength: bytes.length,
    }];
  }),
);

function nativeMotionClipEvidence(motionId, actorCode, opcode) {
  const resolved = resolveShenmue2NativeMotionId(motionId);
  const sequence = resolved
    ? nativeMotionBankByName.get(resolved.bank)
      ?.sequences?.[resolved.sequenceIndex]
    : null;
  if (!resolved || !sequence?.valid || sequence.durationFrames <= 0) {
    throw new Error(
      `Native opcode-${opcode.toString(16)} motion `
      + `0x${Number(motionId).toString(16)} for ${actorCode} has no valid `
      + "registered compact MOT sequence.",
    );
  }
  return { ...resolved, durationFrames: sequence.durationFrames };
}
const models = [];
for (const logicalIndex of [...modelLogicalIndices].sort((a, b) => a - b)) {
  const textureEntry = afsEntries[logicalIndex * 2];
  const modelEntry = afsEntries[logicalIndex * 2 + 1];
  const textureBytes = humansBytes.subarray(
    textureEntry.offset,
    textureEntry.offset + textureEntry.length,
  );
  const modelPackage = humansBytes.subarray(
    modelEntry.offset,
    modelEntry.offset + modelEntry.length,
  );
  const child = parseIpacChildren(modelPackage).find(
    (candidate) => candidate.extension === "CHRM",
  );
  if (!child) throw new Error(`HUMANS logical row ${logicalIndex} has no CHRM.`);
  const modelBytes = modelPackage.subarray(child.offset, child.offset + child.length);
  const rootNodeId = parseMt7(modelBytes).root?.id;
  if (!Number.isInteger(rootNodeId)) {
    throw new Error(`HUMANS logical row ${logicalIndex} has no MT7 root node.`);
  }
  const textureBytesPacked = texturePack(textureBytes, textureEntry.index);
  const textureStem = child.filename.replace(/_[LM]$/, "");
  writeExact(path.join(assetDirectory, `${child.filename}.CHRM`), modelBytes);
  writeExact(path.join(assetDirectory, `${textureStem}_textures.bin`), textureBytesPacked);
  models.push({
    logicalCode: logicalCodes[logicalIndex],
    logicalIndex,
    modelCode: child.filename,
    textureFile: `${textureStem}_textures.bin`,
    modelAfsEntry: modelEntry.index,
    textureAfsEntry: textureEntry.index,
    modelSha256: sha256(modelBytes),
    textureSha256: sha256(textureBytesPacked),
    rootNodeId,
  });
}

const modelByLogicalCode = new Map(
  models.map((model) => [model.logicalCode, model]),
);

function nativeNodePoint(node) {
  const route = routeGraph.routeByIndex.get(node.routeIndex);
  if (!route) {
    throw new Error(`NPC node ${node.id} has no route ${node.routeIndex}.`);
  }
  return [
    -node.x,
    shenmue2RouteSplinePoint(route, node.routeParameter)[1],
    node.z,
  ];
}

function browserRoutePoints(points) {
  return points.map(([x, y, z]) => [-x, y, z]);
}

function appendNativeRoute(phase, destination, program) {
  if (destination.worldId !== program.worldId) return false;
  if (!phase.lastNode) {
    phase.points = [nativeNodePoint(destination)];
    phase.lastNode = destination;
    return true;
  }
  const path = shenmue2RoutePath(
    routeGraph,
    phase.lastNode,
    destination,
    program.worldId,
  );
  if (!path) {
    throw new Error(
      `No native ${program.worldId} route from ${phase.lastNode.id}`
      + ` to ${destination.id} for ${program.actorCode}.`,
    );
  }
  const browserPoints = browserRoutePoints(path.points);
  for (const point of browserPoints.slice(1)) {
    if (point.some((value, axis) => (
      Math.abs(value - phase.points.at(-1)[axis]) > 1e-5
    ))) phase.points.push(point);
  }
  phase.routeIndices ??= [];
  phase.routeIndices.push(...path.routeIndices.filter(
    (routeIndex) => !phase.routeIndices.includes(routeIndex),
  ));
  phase.lastNode = destination;
  return true;
}

function closeNativeLoop(phase, program) {
  if (!phase.loopStartNode || phase.lastNode === phase.loopStartNode) return;
  appendNativeRoute(phase, phase.loopStartNode, program);
}

function nativeProgramSchedule(program, speed) {
  const nodeByIndex = new Map(nodes.map((node) => [node.index, node]));
  const placementOperation = program.operations.find(
    (operation) => (
      operation.opcode === 3
      && nodeByIndex.has(operation.arguments[0])
    ),
  );
  if (!placementOperation) return null;
  const placement = nativeNodePoint(
    nodeByIndex.get(placementOperation.arguments[0]),
  );
  const placementNode = nodeByIndex.get(placementOperation.arguments[0]);
  const firstClockOperationIndex = program.operations.findIndex(
    (operation) => operation.opcode === 1 || operation.opcode === 2,
  );
  const placementOperationIndex = program.operations.indexOf(
    placementOperation,
  );
  // A program consisting only of its initial opcode-3 placement before the
  // first clock gate has initialized the logical actor record, but has not
  // started an observable behavior. Native captures independently show that
  // such records can have a live position while their model/controller
  // pointers remain null. Preserve the authored staging position, but make
  // that lifecycle distinction explicit instead of rendering every logical
  // record from midnight.
  const placementIsInitializationOnly = (
    firstClockOperationIndex > placementOperationIndex
    && program.operations
      .slice(placementOperationIndex, firstClockOperationIndex)
      .every((operation) => operation === placementOperation)
  );
  const phases = [{
    startSecond: 0,
    behavior: "stationary",
    active: !placementIsInitializationOnly,
    lifecycle: placementIsInitializationOnly ? "staged" : "resident",
    points: [placement],
    sourceOffset: placementOperation.sourceOffset,
    nodeIds: [placementNode.id],
    lastNode: placementNode,
  }];
  let phase = phases[0];
  let looping = false;
  let previousStartSecond = 0;
  let wrapAfterMidnightSecond = null;

  for (const operation of program.operations) {
    if (operation === placementOperation) continue;
    if (operation.opcode === 3) {
      const node = nodeByIndex.get(operation.arguments[0]);
      if (!node) continue;
      // Native case 3 calls 0x5b0a4 and immediately writes the actor position.
      // Replace the current point rather than inventing a route between two
      // teleports (notably the AB71/AB75 staging records).
      phase.behavior = "stationary";
      phase.points = [nativeNodePoint(node)];
      phase.nodeIds = [node.id];
      phase.lastNode = node;
      phase.loopStartNode = null;
      looping = false;
      continue;
    }
    if (operation.opcode === 1 || operation.opcode === 2) {
      const secondOfDay = packedClockSecond(operation.arguments[0]);
      if (secondOfDay === null) continue;
      let startSecond = secondOfDay;
      while (startSecond < previousStartSecond) startSecond += 24 * 60 * 60;
      if (startSecond >= 24 * 60 * 60) {
        wrapAfterMidnightSecond = Math.max(
          wrapAfterMidnightSecond ?? 0,
          secondOfDay,
        );
      }
      previousStartSecond = startSecond;
      const previousPosition = phase.points.at(-1) || placement;
      phase = {
        startSecond,
        secondOfDay,
        behavior: "stationary",
        active: true,
        lifecycle: "resident",
        points: [[...previousPosition]],
        sourceOffset: operation.sourceOffset,
        nodeIds: [],
        lastNode: phase.lastNode,
      };
      phases.push(phase);
      looping = false;
      continue;
    }
    if (operation.opcode === 5) {
      looping = true;
      phase.behavior = "loop";
      phase.loopStartNode = phase.lastNode;
      continue;
    }
    if (operation.opcode === 6) {
      looping = false;
      if (phase.behavior === "loop") closeNativeLoop(phase, program);
      continue;
    }
    if (operation.opcode === 7) {
      const resolvedMotion = nativeMotionClipEvidence(
        operation.arguments[0],
        program.actorCode,
        7,
      );
      // Opcode 7 installs its first operand as motion slot 0 and blocks on
      // the actor callback. In the observed opcode-5/6 blocks this is the
      // authored stationary action repeated until the following clock gate.
      phase.nativeMotionId = resolvedMotion.motionId;
      phase.nativeMotionBank = resolvedMotion.bank;
      phase.nativeMotionSequenceIndex = resolvedMotion.sequenceIndex;
      phase.nativeMotionRate = uint32Float(operation.arguments[3]);
      const actionNode = nodeByIndex.get(operation.arguments[1]);
      if (actionNode?.worldId === program.worldId) {
        phase.points = [nativeNodePoint(actionNode)];
        phase.nodeIds = [actionNode.id];
        phase.lastNode = actionNode;
      }
      phase.nativeRootYaw = -(
        (operation.arguments[2] & 0xffff) * Math.PI * 2 / 65536
      );
      continue;
    }
    if (operation.opcode === 8) {
      const resolvedMotion = nativeMotionClipEvidence(
        operation.arguments[0],
        program.actorCode,
        8,
      );
      const playbackRate = uint32Float(operation.arguments[4]);
      const actionNode = nodeByIndex.get(operation.arguments[1]);
      const localActionNode = actionNode?.worldId === program.worldId
        ? actionNode
        : null;
      phase.nativePrelude = {
        motionId: resolvedMotion.motionId,
        bank: resolvedMotion.bank,
        sequenceIndex: resolvedMotion.sequenceIndex,
        playbackRate,
        durationSeconds: resolvedMotion.durationFrames
          / (30 * Math.max(0.01, playbackRate)),
        position: localActionNode
          ? nativeNodePoint(localActionNode)
          : [...phase.points.at(-1)],
        nodeId: localActionNode?.id || null,
        rootYaw: -(
          (operation.arguments[3] & 0xffff) * Math.PI * 2 / 65536
        ),
        sourceOffset: operation.sourceOffset,
      };
      continue;
    }
    if (operation.opcode !== 4 && operation.opcode !== 0x12) continue;
    const node = nodeByIndex.get(operation.arguments[0]);
    if (!node) continue;
    if (node.worldId !== program.worldId) continue;
    if (phase.behavior === "stationary") {
      phase.behavior = looping ? "loop" : "once";
    }
    if (appendNativeRoute(phase, node, program)) phase.nodeIds.push(node.id);
  }

  for (const candidate of phases) {
    if (candidate.behavior === "loop") closeNativeLoop(candidate, program);
    delete candidate.lastNode;
    delete candidate.loopStartNode;
  }
  const last = phases.at(-1);
  if (last?.startSecond > 0 && last.behavior === "once") {
    last.exitAfterArrival = true;
  }
  return {
    worldId: program.worldId,
    speed,
    phases,
    wrapAfterMidnightSecond,
    interpretation: (
      "opcode 1/2 gates the following phase at its packed clock; opcode "
      + "5/6 brackets a repeating patrol; unbracketed node lists execute "
      + "once and hold, except the final post-clock exit leg; an initial "
      + "opcode-3-only phase stages the logical record without making its "
      + "render model resident until the first clock gate"
    ),
  };
}

fs.mkdirSync(dataDirectory, { recursive: true });
const worlds = [...new Set(Object.values(NODE_PREFIX_WORLDS))].sort();
const summary = {};
for (const worldId of worlds) {
  const worldRoutes = routes.filter((route) => route.worldId === worldId);
  const selected = selectRoutes(worldRoutes);
  const placeholderActors = selected.map((route, index) => {
    const model = models[(route.index + index) % models.length];
    const points = loopPoints(route.points);
    const locomotion = locomotionEvidence(model);
    return {
      instanceId: `s2crowd:${worldId}:${route.id}`,
      actorCode: model.logicalCode,
      label: `S2 pedestrian ${route.id}`,
      modelCode: model.modelCode,
      textureFile: model.textureFile,
      characterAssetDirectory: "shenmue2-characters",
      characterAssetFormat: "MT7",
      characterScale: 10,
      position: points[0],
      localLoopRoute: {
        id: `s2:${route.id}`,
        worldId,
        points,
        speed: locomotion.locomotionSpeed,
        phase: index / selected.length,
        movementMode: "0x66",
      },
      shenmue2NativeEvidence: {
        source: "SCENE/01/NPC/NPC.BIN",
        routeId: route.id,
        routeIndex: route.index,
        routeRecordOffset: `0x${route.sourceOffset.toString(16)}`,
        pointsOffset: `0x${route.sourcePointsOffset.toString(16)}`,
        logicalCharacterCode: model.logicalCode,
        logicalCharacterIndex: model.logicalIndex,
        ...locomotion,
        modelAfsEntry: model.modelAfsEntry,
        textureAfsEntry: model.textureAfsEntry,
      },
    };
  });
  const nativeWorldPrograms = nativePrograms.filter(
    (program) => program.worldId === worldId,
  );
  const actors = NATIVE_TIMETABLE_WORLDS.has(worldId)
    ? nativeWorldPrograms.map((program, index) => {
      const model = modelByLogicalCode.get(program.actorCode);
      if (!model) {
        throw new Error(`No HUMANS entry resolves ${program.actorCode}.`);
      }
      const locomotion = locomotionEvidence(model);
      const explicitPose = resolveShenmue2NativeMotionId(
        program.explicitPoseMotionId,
      );
      const explicitPoseControllerGroupMask = program.explicitPoseFlags === null
        ? null
        : program.explicitPoseFlags & 0x1e;
      const explicitPoseNativeMotionSlot = (
        explicitPoseControllerGroupMask !== null
        && explicitPoseControllerGroupMask !== 0
        && (explicitPoseControllerGroupMask
          & (explicitPoseControllerGroupMask - 1)) === 0
      )
        ? Math.log2(explicitPoseControllerGroupMask)
        : null;
      if (program.explicitPoseMotionId !== null && !explicitPose) {
        throw new Error(
          `Native pose ID 0x${program.explicitPoseMotionId.toString(16)}`
          + ` for ${program.actorCode} does not resolve to a motion bank.`,
        );
      }
      const activeUntilSecond = program.timeBoundaries.length
        ? Math.max(...program.timeBoundaries.map((boundary) => boundary.second))
        : null;
      const nativeSchedule = nativeProgramSchedule(
        program,
        locomotion.locomotionSpeed,
      );
      if (nativeSchedule) {
        nativeSchedule.phase = index / Math.max(1, nativeWorldPrograms.length);
      }
      const points = nativeSchedule?.phases[0]?.points;
      if (!points?.length) {
        throw new Error(`Native schedule for ${program.actorCode} has no points.`);
      }
      // ScheduledActorRuntime gives nativeSchedule precedence. Retain the old
      // localLoopRoute shape only as a stationary compatibility definition;
      // duplicating a clock phase here would bloat every shard and create a
      // second, potentially divergent movement source.
      const localLoopPoints = [points[0], [...points[0]]];
      return {
        instanceId: (
          `s2native:${worldId}:${program.actorCode}:${program.blockIndex}`
          + (program.worldSegmentIndex === null
            ? ""
            : `:${program.worldSegmentIndex}`)
        ),
        actorCode: program.actorCode,
        label: `S2 native resident ${program.actorCode}`,
        modelCode: model.modelCode,
        textureFile: model.textureFile,
        characterAssetDirectory: "shenmue2-characters",
        characterAssetFormat: "MT7",
        characterScale: 10,
        position: nativeSchedule?.phases?.[0]?.points?.[0] || points[0],
        nativeSchedule,
        localLoopRoute: {
          id: `s2:native:${program.actorCode}:${program.blockIndex}`,
          worldId,
          points: localLoopPoints,
          speed: locomotion.locomotionSpeed,
          phase: index / Math.max(1, nativeWorldPrograms.length),
          movementMode: "0x66",
          clockDriven: true,
          supersededByNativeSchedule: true,
          activeUntilSecond: nativeSchedule ? null : activeUntilSecond,
          stationary: localLoopPoints.every((point) => (
            point.every((value, axis) => value === localLoopPoints[0][axis])
          )),
        },
        shenmue2NativeEvidence: {
          source: "SCENE/01/NPC/NPC.BIN",
          actorProfile: {
            variant: program.actorProfile.variant,
            ageCategory: program.actorProfile.ageCategory,
            motionSubtype: program.actorProfile.motionSubtype,
            sourceOffset: `0x${program.actorProfile.sourceOffset.toString(16)}`,
          },
          actorRecordIndex: program.actorIndex,
          actorProgramBlockIndex: program.blockIndex,
          actorProgramWorldSegmentIndex: program.worldSegmentIndex,
          actorProgramOffset: `0x${program.sourceOffset.toString(16)}`,
          actorProgramEnd: `0x${program.sourceEnd.toString(16)}`,
          unresolvedSelectorWords: program.selectorWords.map(
            (word) => `0x${word.toString(16)}`,
          ),
          packedTimeBoundaries: program.timeBoundaries.map((boundary) => ({
            opcode: boundary.opcode,
            packed: `0x${boundary.packed.toString(16)}`,
            second: boundary.second,
            sourceOffset: `0x${boundary.sourceOffset.toString(16)}`,
          })),
          boundaryInterpretation: nativeSchedule
            ? (
              "packed clock values gate the following native instruction "
              + "phases; backwards values are normalized across midnight"
            )
            : activeUntilSecond === null
              ? "no decoded clock boundary; kept active"
              : (
                "fallback deactivation boundary from final packed clock "
                + "value; exact post-boundary exit semantics remain unresolved"
              ),
          scheduleInterpretation: nativeSchedule?.interpretation || null,
          nodeReferences: program.nodes.map((reference) => ({
            opcode: reference.opcode,
            id: reference.node.id,
            index: reference.node.index,
            sourceOffset: `0x${reference.sourceOffset.toString(16)}`,
            nodeRecordOffset: `0x${reference.node.sourceOffset.toString(16)}`,
          })),
          nativeOperations: program.operations.map((operation) => ({
            opcode: operation.opcode,
            arguments: operation.arguments.map(
              (argument) => `0x${argument.toString(16)}`,
            ),
            sourceOffset: `0x${operation.sourceOffset.toString(16)}`,
          })),
          explicitPoseMotion: explicitPose ? {
            motionId: explicitPose.motionId,
            bank: explicitPose.bank,
            sequenceIndex: explicitPose.sequenceIndex,
            flags: program.explicitPoseFlags,
            controllerGroupMask: explicitPoseControllerGroupMask,
            nativeMotionSlot: explicitPoseNativeMotionSlot,
            actorLayerIndex: 1,
            semanticStatus: (
              "opcode 0x2d is [opcode, motionId, flags]. The native dispatcher "
              + "passes flags | 0x20 to actor layer 1; the layer installer "
              + "uses bits 0x02/0x04/0x08/0x10 as controller-group masks. "
              + "This command's single 0x10 bit routes the pose to native "
              + "motion slot 4 (compact curves 57..68, controllers 18..21) "
              + "while locomotion remains separately evaluated"
            ),
          } : null,
          postBoundaryNodeReferences: program.allNodes
            .filter((reference) => !reference.beforeFirstTime)
            .map((reference) => ({
              opcode: reference.opcode,
              id: reference.node.id,
              index: reference.node.index,
              sourceOffset: `0x${reference.sourceOffset.toString(16)}`,
              nodeRecordOffset: `0x${reference.node.sourceOffset.toString(16)}`,
            })),
          logicalCharacterCode: model.logicalCode,
          logicalCharacterIndex: model.logicalIndex,
          ...locomotion,
          modelAfsEntry: model.modelAfsEntry,
          textureAfsEntry: model.textureAfsEntry,
        },
      };
    })
    : placeholderActors;
  const shard = {
    schema: "new-yokosuka-shenmue2-crowd-v2",
    generatedFrom: "SCENE/01/NPC/NPC.BIN + HUMANS.IDX + HUMANS.AFS",
    worldId,
    areaWorlds: {},
    localObjectModels: [],
    motionRequirements: {
      mbas: [],
      free: [],
      mobj: [],
    },
    source: {
      npcSha256: sha256(npcBytes),
      humansIndexSha256: sha256(indexBytes),
      humansSha256: sha256(humansBytes),
      nativeMotionSources,
      routeSelection: NATIVE_TIMETABLE_WORLDS.has(worldId)
        ? "all proven generic actor programs whose first authored node is in this world"
        : `evenly sampled, maximum ${MAX_ACTORS_PER_WORLD}`,
      characterSelection: NATIVE_TIMETABLE_WORLDS.has(worldId)
        ? "exact actor code lookup in HUMANS.IDX"
        : (
          `deterministic rotation across the first ${CROWD_MODELS} native `
          + "generic HUMANS.IDX entries"
        ),
      unresolvedNativeSemantics: NATIVE_TIMETABLE_WORLDS.has(worldId)
        ? [
          "non-area prefix words preceding alternate actor program blocks",
          "exact activation meaning of actor records with no packed time boundary",
          "exact completion behavior of the final unbracketed route leg",
        ]
        : [],
      nativeRuntimePolicy: NATIVE_TIMETABLE_WORLDS.has(worldId)
        ? (
          "Exact identities and native instruction phases are clock-driven. "
          + "An opcode-3-only initial phase remains logically staged and "
          + "non-resident until its first clock gate. "
          + "Opcode-5/6 routes repeat; unbracketed routes execute once and "
          + "hold. A final unbracketed leg exits after arrival, which remains "
          + "an explicit inference pending complete opcode dispatch recovery."
        )
        : null,
    },
    actors,
  };
  fs.writeFileSync(
    path.join(dataDirectory, `${worldId}.json`),
    `${JSON.stringify(shard, null, 2)}\n`,
  );
  summary[worldId] = {
    nativeRouteCount: worldRoutes.length,
    groundedRouteCount: worldRoutes.filter(
      (route) => route.points.every((point) => point[1] > 50),
    ).length,
    actorCount: actors.length,
    nativeTimetable: NATIVE_TIMETABLE_WORLDS.has(worldId),
  };
}

console.log(JSON.stringify({
  npcPath,
  dataDirectory,
  assetDirectory,
  models: models.length,
  summary,
}, null, 2));
