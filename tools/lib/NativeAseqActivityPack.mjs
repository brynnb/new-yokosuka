import { createHash } from "node:crypto";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { gunzipSync } from "node:zlib";

import { parseAuthCamera } from "../../src/AuthCamera.js";
import { parseAuthMovement } from "../../src/AuthMovement.js";
import {
  parseAuthSequence,
  resolveAuthMotions,
} from "../../src/AuthSequence.js";
import { MotnLoader } from "../../src/MotnLoader.js";

const MANIFEST_SCHEMA = "new-yokosuka-aseq-activity-pack-v1";

export function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sourceBytes(input) {
  const bytes = Buffer.from(input);
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b
    ? gunzipSync(bytes)
    : bytes;
}

function ascii(bytes, offset, length) {
  return bytes.subarray(offset, offset + length).toString("ascii");
}

function cleanAscii(bytes, offset, length) {
  return ascii(bytes, offset, length).replace(/[\0 ]+$/g, "");
}

export function parseIpacActivityArchive(input, label = "activity archive") {
  const bytes = sourceBytes(input);
  const magic = ascii(bytes, 0, 4);
  const ipacOffset = magic === "IPAC"
    ? 0
    : ["PAKS", "PAKF"].includes(magic)
      ? bytes.readUInt32LE(4)
      : -1;
  if (
    ipacOffset < 0
    || ipacOffset + 16 > bytes.length
    || ascii(bytes, ipacOffset, 4) !== "IPAC"
  ) {
    throw new Error(`${label} has no valid PAKS/PAKF/IPAC dictionary`);
  }
  const dictionaryOffset = ipacOffset + bytes.readUInt32LE(ipacOffset + 4);
  const count = bytes.readUInt32LE(ipacOffset + 8);
  if (count > 100_000 || dictionaryOffset + count * 20 > bytes.length) {
    throw new Error(`${label} has an invalid IPAC dictionary`);
  }
  const members = Array.from({ length: count }, (_, index) => {
    const entry = dictionaryOffset + index * 20;
    const name = cleanAscii(bytes, entry, 8);
    const extension = cleanAscii(bytes, entry + 8, 4).toUpperCase();
    const memberOffset = ipacOffset + bytes.readUInt32LE(entry + 12);
    const byteLength = bytes.readUInt32LE(entry + 16);
    if (memberOffset > bytes.length || byteLength > bytes.length - memberOffset) {
      throw new Error(`${label} member ${index} exceeds its archive`);
    }
    return Object.freeze({
      index,
      name: `${name}.${extension}`,
      extension,
      bytes: bytes.subarray(memberOffset, memberOffset + byteLength),
    });
  });
  return Object.freeze({
    containerMagic: magic,
    compressed: bytes.length !== input.length,
    members: Object.freeze(members),
  });
}

function assertExactMember(member, expected, family) {
  if (
    !member
    || member.name !== expected.name
    || member.bytes.length !== expected.byteLength
    || sha256(member.bytes) !== expected.sha256
  ) {
    throw new Error(`${family} member ${expected.name} changed`);
  }
}

function commandCounts(sequence) {
  const counts = {};
  for (const frame of sequence.frames) {
    for (const command of frame.commands) {
      counts[command.name] = (counts[command.name] || 0) + 1;
    }
  }
  return counts;
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function motionSource(config, definition, memberByName) {
  if (definition.member) {
    const member = memberByName.get(definition.member);
    if (!member) {
      throw new Error(`${config.resourceName} motion ${definition.member} is unavailable`);
    }
    return Object.freeze({
      bytes: member.bytes,
      path: `${config.outputAssetPrefix}/${definition.member}`,
      outputFilename: definition.member,
    });
  }
  if (!definition.sourcePath || !definition.assetPath) {
    throw new Error(
      `${config.resourceName} motion bank ${definition.bank} has no exact source`,
    );
  }
  const bytes = readFileSync(definition.sourcePath);
  if (
    bytes.length !== definition.byteLength
    || sha256(bytes) !== definition.sha256
  ) {
    throw new Error(
      `${config.resourceName} shared motion bank ${definition.bank} changed`,
    );
  }
  return Object.freeze({ bytes, path: definition.assetPath, outputFilename: null });
}

function motionPackages(config, memberByName) {
  const packages = new Map();
  const sources = new Map();
  for (const definition of config.motionBanks) {
    const source = motionSource(config, definition, memberByName);
    const parsed = MotnLoader.parse(source.bytes, definition.parseOptions || {});
    for (const expectation of definition.expectedSequences || []) {
      const sequence = parsed.sequences.find(item => item.index === expectation.index);
      if (
        sequence?.name !== expectation.name
        || sequence.valid !== true
        || sequence.valueData?.complete !== true
      ) {
        throw new Error(
          `${config.resourceName} motion bank ${definition.bank} sequence ${expectation.index} changed`,
        );
      }
    }
    if (packages.has(definition.bank)) {
      throw new Error(`${config.resourceName} duplicates motion bank ${definition.bank}`);
    }
    packages.set(definition.bank, parsed);
    sources.set(definition.bank, source);
  }
  return Object.freeze({ packages, sources });
}

function compileActivity(config, expectation, memberByName, packages) {
  const member = memberByName.get(expectation.file);
  if (!member) {
    throw new Error(`${config.resourceName} ${expectation.file} is unavailable`);
  }
  const sequence = parseAuthSequence(member.bytes);
  const movement = parseAuthMovement(member.bytes);
  const camera = parseAuthCamera(member.bytes);
  const counts = commandCounts(sequence);
  const motions = resolveAuthMotions(sequence, packages);
  const unresolved = motions.filter(event => event.motionValid !== true);
  if (
    (expectation.actors && !same(sequence.actors, expectation.actors))
    || (expectation.durationFrames !== undefined
      && sequence.durationFrames !== expectation.durationFrames)
    || (expectation.frameCount !== undefined
      && sequence.frames.length !== expectation.frameCount)
    || (expectation.commandCounts && !same(counts, expectation.commandCounts))
    || movement.actors.length !== sequence.actors.length
    || camera.cameras.length !== 1
    || unresolved.length > 0
  ) {
    const suffix = unresolved.length > 0
      ? `; ${unresolved.length} motions are unresolved`
      : "";
    throw new Error(`${config.resourceName} ${expectation.file} structure changed${suffix}`);
  }
  return Object.freeze({
    slot: expectation.slot,
    primaryPointer: expectation.primaryPointer,
    secondaryPointer: expectation.secondaryPointer,
    activityId: `${config.resourceName}/${expectation.file}`,
    archiveMember: expectation.file,
    byteLength: member.bytes.length,
    sha256: sha256(member.bytes),
    durationFrames: sequence.durationFrames,
    durationSeconds: Math.max(movement.duration, camera.duration),
    frameCount: sequence.frames.length,
    commandCounts: counts,
    actors: sequence.actors,
    ...(expectation.nativeHandPoseCues
      ? { nativeHandPoseCues: expectation.nativeHandPoseCues }
      : {}),
    ...(expectation.nativeBodyHandPoseCues
      ? { nativeBodyHandPoseCues: expectation.nativeBodyHandPoseCues }
      : {}),
    ...(expectation.nativeFaceClipCues
      ? { nativeFaceClipCues: expectation.nativeFaceClipCues }
      : {}),
    ...(expectation.nativeFaceControllerCues
      ? { nativeFaceControllerCues: expectation.nativeFaceControllerCues }
      : {}),
    ...(expectation.nativeFaceGazeCues
      ? { nativeFaceGazeCues: expectation.nativeFaceGazeCues }
      : {}),
    ...(expectation.nativeSceneObjectStates
      ? { nativeSceneObjectStates: expectation.nativeSceneObjectStates }
      : {}),
    ...(expectation.nativeDetailedHandDefaults
      ? { nativeDetailedHandDefaults: expectation.nativeDetailedHandDefaults }
      : {}),
    motions: motions.map(event => Object.freeze({
      actorTag: event.actorTag,
      frame: event.frame,
      motionBank: event.motionBank,
      sequenceIndex: event.sequenceIndex,
      motionName: event.motionName,
      startFrame: event.startFrame,
      endFrame: event.endFrame,
    })),
  });
}

export function buildNativeAseqActivityPack(config) {
  const looseSources = config.sourceMembers || null;
  let archive = null;
  let memberByName;
  if (looseSources) {
    const members = looseSources.map((definition, index) => {
      const bytes = readFileSync(definition.sourcePath);
      if (
        bytes.length !== definition.byteLength
        || sha256(bytes) !== definition.sha256
      ) throw new Error(`${config.resourceName} loose member ${definition.name} changed`);
      return Object.freeze({ index, name: definition.name, extension: path.extname(definition.name).slice(1), bytes });
    });
    memberByName = new Map(members.map(member => [member.name, member]));
  } else {
    const archiveBytes = readFileSync(config.sourcePath);
    if (sha256(archiveBytes) !== config.archiveSha256) {
      throw new Error(`${config.resourceName} archive SHA-256 changed`);
    }
    archive = parseIpacActivityArchive(archiveBytes, config.resourceName);
    memberByName = new Map(archive.members.map(member => [member.name, member]));
  }
  for (const expected of config.expectedMembers) {
    assertExactMember(memberByName.get(expected.name), expected, config.resourceName);
  }
  if (memberByName.size !== config.expectedMembers.length) {
    throw new Error(`${config.resourceName} archive member count changed`);
  }

  const motion = motionPackages(config, memberByName);
  const activities = config.activities.map(expectation => (
    compileActivity(config, expectation, memberByName, motion.packages)
  ));
  const outputNames = [...new Set([
    ...config.activities.map(value => value.file),
    ...(config.outputMembers || []),
  ])];
  for (const filename of outputNames) {
    if (!memberByName.has(filename)) {
      throw new Error(`${config.resourceName} output member ${filename} is unavailable`);
    }
  }

  mkdirSync(config.outputDirectory, { recursive: true });
  for (const filename of outputNames) {
    writeFileSync(path.join(config.outputDirectory, filename), memberByName.get(filename).bytes);
  }
  for (const source of motion.sources.values()) {
    if (source.outputFilename) {
      writeFileSync(path.join(config.outputDirectory, source.outputFilename), source.bytes);
    }
  }
  const externalOutputs = (config.externalAssets || []).map((definition) => {
    const source = readFileSync(definition.sourcePath);
    if (definition.sourceSha256 && sha256(source) !== definition.sourceSha256) {
      throw new Error(`${config.resourceName} external archive changed`);
    }
    const bytes = definition.archiveMember
      ? parseIpacActivityArchive(source, definition.sourcePath).members.find(
        member => member.name === definition.archiveMember,
      )?.bytes
      : source;
    if (
      !bytes
      || bytes.length !== definition.byteLength
      || sha256(bytes) !== definition.sha256
    ) throw new Error(`${config.resourceName} external asset ${definition.assetPath} changed`);
    const filename = path.basename(definition.assetPath);
    writeFileSync(path.join(config.outputDirectory, filename), bytes);
    return {
      path: definition.assetPath,
      byteLength: bytes.length,
      sha256: sha256(bytes),
    };
  });
  const generatedOutputs = (config.generatedAssets || []).map((definition) => {
    const bytes = Buffer.from(definition.bytes);
    if (
      !definition.assetPath
      || (definition.byteLength !== undefined && bytes.length !== definition.byteLength)
      || (definition.sha256 && sha256(bytes) !== definition.sha256)
    ) throw new Error(`${config.resourceName} generated asset ${definition.assetPath} changed`);
    writeFileSync(path.join(config.outputDirectory, path.basename(definition.assetPath)), bytes);
    return {
      path: definition.assetPath,
      byteLength: bytes.length,
      sha256: sha256(bytes),
      ...(definition.source ? { source: definition.source } : {}),
    };
  });
  const outputPath = filename => `${config.outputAssetPrefix}/${filename}`;
  const motionOutputs = [...motion.sources.values()].map(source => ({
    path: source.path,
    byteLength: source.bytes.length,
    sha256: sha256(source.bytes),
  }));
  const activityOutputs = outputNames.map(filename => {
    const member = memberByName.get(filename);
    return {
      path: outputPath(filename),
      byteLength: member.bytes.length,
      sha256: sha256(member.bytes),
    };
  });
  const manifest = {
    schema: MANIFEST_SCHEMA,
    generatedBy: config.generatedBy,
    source: looseSources ? {
      disc: config.disc,
      format: "loose-files",
      members: looseSources.map(({ name, sourceManifestPath: sourcePath, byteLength, sha256: digest }) => ({
        name,
        path: sourcePath,
        byteLength,
        sha256: digest,
      })),
    } : {
      disc: config.disc,
      path: config.sourceManifestPath,
      sha256: config.archiveSha256,
      archiveFormat: `${archive.containerMagic}/IPAC`,
      members: config.expectedMembers,
    },
    nativeBinding: {
      evidence: config.bindingEvidence,
      resourceName: config.resourceName,
      variant: config.variant || "",
      selectionRule: config.selectionRule,
    },
    ...(config.audioManifest ? { audioManifest: config.audioManifest } : {}),
    ...(config.playerActorAliases
      ? { playerActorAliases: config.playerActorAliases }
      : {}),
    ...(config.sceneObjects ? { sceneObjects: config.sceneObjects } : {}),
    ...(config.packageActors ? { packageActors: config.packageActors } : {}),
    ...(config.attachedObjects ? { attachedObjects: config.attachedObjects } : {}),
    ...(config.handAssets ? { handAssets: config.handAssets } : {}),
    ...(config.facialAssets ? { facialAssets: config.facialAssets } : {}),
    ...(config.nativeHandPoseTables
      ? { nativeHandPoseTables: config.nativeHandPoseTables }
      : {}),
    ...(config.ownerAudioCommands
      ? { ownerAudioCommands: config.ownerAudioCommands }
      : {}),
    ...(config.scrollSprites ? { scrollSprites: config.scrollSprites } : {}),
    actorTags: [...new Set(activities.flatMap(activity => activity.actors))],
    motionBanks: config.motionBanks.map(definition => {
      const source = motion.sources.get(definition.bank);
      return {
        bank: definition.bank,
        path: source.path,
        byteLength: source.bytes.length,
        sha256: sha256(source.bytes),
      };
    }),
    outputs: [...new Map(
      [...motionOutputs, ...activityOutputs, ...externalOutputs, ...generatedOutputs]
        .map(output => [output.path, output]),
    ).values()],
    activities,
  };
  writeFileSync(config.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return Object.freeze(manifest);
}
