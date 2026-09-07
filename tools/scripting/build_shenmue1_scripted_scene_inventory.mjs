#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";

import { parseAuthCamera } from "../../src/AuthCamera.js";
import { parseAuthMovement } from "../../src/AuthMovement.js";
import { parseAuthSequence } from "../../src/AuthSequence.js";
import { parseAuthStrings } from "../../src/AuthStrings.js";
import { parseAuthTrack } from "../../src/AuthTrack.js";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const PROJECT_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");

export const INVENTORY_SCHEMA = "new-yokosuka-shenmue1-scripted-scene-inventory-v1";

const DEFAULT_ROOTS = Object.freeze([
  Object.freeze({
    disc: 1,
    scene: "01",
    root: path.join(PROJECT_ROOT, "extracted_files/data/SCENE/01"),
  }),
  Object.freeze({
    disc: 2,
    scene: "02",
    root: path.join(PROJECT_ROOT, "extracted_disc2_v2/data/SCENE/02"),
  }),
  Object.freeze({
    disc: 3,
    scene: "03",
    root: path.join(PROJECT_ROOT, "extracted_disc3_v2/data/SCENE/03"),
  }),
]);

const DEFAULT_JSON_OUTPUT = path.join(
  PROJECT_ROOT,
  "tools/evidence/shenmue1-scripted-scene-inventory.json",
);
const DEFAULT_MARKDOWN_OUTPUT = path.join(
  PROJECT_ROOT,
  "docs/reference/shenmue1-scripted-scene-inventory.generated.md",
);

function uint32(bytes, offset, label) {
  if (offset < 0 || offset + 4 > bytes.length) {
    throw new Error(`${label} extends beyond its container`);
  }
  return bytes.readUInt32LE(offset);
}

function ascii(bytes, offset, length) {
  if (offset < 0 || offset + length > bytes.length) return "";
  return bytes.toString("ascii", offset, offset + length);
}

function cleanAscii(bytes, offset, length) {
  return ascii(bytes, offset, length).replace(/\0.*$/s, "").trim();
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function posix(value) {
  return value.split(path.sep).join("/");
}

function hex(value) {
  return `0x${value.toString(16)}`;
}

function naturalCompare(left, right) {
  return left.localeCompare(right, "en", { numeric: true });
}

function sortedFiles(root) {
  const result = [];
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.pop();
    const entries = fs.readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => naturalCompare(left.name, right.name));
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index];
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) pending.push(entryPath);
      else if (entry.isFile()) result.push(entryPath);
    }
  }
  return result.sort(naturalCompare);
}

function sourceBytes(bytes) {
  return bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b
    ? gunzipSync(bytes)
    : bytes;
}

/** Parse a PAKS/PAKF/IPAC container without extracting its members. */
export function parseIpacArchive(input) {
  const bytes = sourceBytes(Buffer.from(input));
  const containerMagic = ascii(bytes, 0, 4);
  let ipacOffset = 0;
  if (containerMagic === "PAKS" || containerMagic === "PAKF") {
    ipacOffset = uint32(bytes, 4, `${containerMagic} IPAC offset`);
  } else if (containerMagic !== "IPAC") {
    throw new Error(`unsupported archive signature ${JSON.stringify(containerMagic)}`);
  }
  if (ipacOffset < 0 || ipacOffset + 16 > bytes.length) {
    throw new Error(`${containerMagic} IPAC offset is outside the archive`);
  }
  if (ascii(bytes, ipacOffset, 4) !== "IPAC") {
    throw new Error(`${containerMagic} does not point to an IPAC dictionary`);
  }

  const dictionaryOffset = uint32(bytes, ipacOffset + 4, "IPAC dictionary offset");
  const memberCount = uint32(bytes, ipacOffset + 8, "IPAC member count");
  const contentSize = uint32(bytes, ipacOffset + 12, "IPAC content size");
  if (
    dictionaryOffset < 16
    || memberCount > 100_000
    || dictionaryOffset + memberCount * 20 > bytes.length - ipacOffset
  ) {
    throw new Error("IPAC dictionary is outside the archive");
  }

  const members = [];
  for (let index = 0; index < memberCount; index += 1) {
    const entryOffset = ipacOffset + dictionaryOffset + index * 20;
    const name = cleanAscii(bytes, entryOffset, 8);
    const extension = cleanAscii(bytes, entryOffset + 8, 4).toUpperCase();
    const relativeOffset = uint32(bytes, entryOffset + 12, "IPAC member offset");
    const byteLength = uint32(bytes, entryOffset + 16, "IPAC member size");
    const offset = ipacOffset + relativeOffset;
    if (offset < ipacOffset || offset + byteLength > bytes.length) {
      throw new Error(`IPAC member ${index} extends beyond the archive`);
    }
    members.push(Object.freeze({
      index,
      name,
      extension,
      offset,
      relativeOffset,
      byteLength,
      bytes: bytes.subarray(offset, offset + byteLength),
    }));
  }

  return Object.freeze({
    containerMagic,
    compressed: bytes.length !== input.length,
    byteLength: bytes.length,
    ipacOffset,
    dictionaryOffset,
    memberCount,
    contentSize,
    members: Object.freeze(members),
  });
}

function safeDetail(label, run) {
  try {
    return { value: run(), issue: null };
  } catch (error) {
    return {
      value: null,
      issue: `${label}: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/** Describe an exact TRCK payload while preserving parser failures. */
export function describeAuthPayload(input) {
  const bytes = Buffer.from(input);
  const track = parseAuthTrack(bytes);
  const chunks = track.chunks.map(chunk => ({
    tag: chunk.tag,
    offset: hex(chunk.offset),
    byteLength: chunk.byteLength,
  }));
  const chunkTags = new Set(chunks.map(chunk => chunk.tag));
  const issues = [];

  const sequence = chunkTags.has("ASEQ")
    ? safeDetail("ASEQ", () => parseAuthSequence(bytes))
    : { value: null, issue: null };
  const movement = chunkTags.has("AMOV")
    ? safeDetail("AMOV", () => parseAuthMovement(bytes))
    : { value: null, issue: null };
  const camera = chunkTags.has("ACAM")
    ? safeDetail("ACAM", () => parseAuthCamera(bytes))
    : { value: null, issue: null };
  const strings = chunkTags.has("ASTR")
    ? safeDetail("ASTR", () => parseAuthStrings(bytes))
    : { value: null, issue: null };
  for (const result of [sequence, movement, camera, strings]) {
    if (result.issue) issues.push(result.issue);
  }

  const commandCounts = {};
  for (const frame of sequence.value?.frames || []) {
    for (const command of frame.commands) {
      commandCounts[command.name] = (commandCounts[command.name] || 0) + 1;
    }
  }

  return {
    sha256: sha256(bytes),
    byteLength: bytes.length,
    parseStatus: issues.length === 0 ? "complete" : "track-only",
    chunks,
    durationFrames: sequence.value?.durationFrames ?? null,
    timelineFrameCount: sequence.value?.frames?.length ?? null,
    actorTags: Array.from(new Set([
      ...(sequence.value?.actors || []).filter(Boolean),
      ...(movement.value?.actors || []).map(actor => actor.tag).filter(Boolean),
    ])).sort(naturalCompare),
    movementActorCount: movement.value?.actors?.length ?? null,
    cameraCount: camera.value?.cameras?.length ?? null,
    stringCount: strings.value?.strings?.length ?? null,
    commandCounts,
    motionBanks: Array.from(new Set(
      (sequence.value?.motions || []).map(motion => motion.motionBank),
    )).sort((left, right) => left - right),
    issues,
  };
}

/** Find only size-valid, chunk-valid embedded TRCK resources. */
export function discoverEmbeddedAuthTracks(input) {
  const bytes = Buffer.from(input);
  const tracks = [];
  for (let offset = 0; offset + 8 <= bytes.length; offset += 4) {
    if (ascii(bytes, offset, 4) !== "TRCK") continue;
    const byteLength = bytes.readUInt32LE(offset + 4);
    if (byteLength < 16 || byteLength % 4 !== 0 || offset + byteLength > bytes.length) {
      continue;
    }
    const candidate = bytes.subarray(offset, offset + byteLength);
    try {
      const detail = describeAuthPayload(candidate);
      tracks.push({ offset, byteLength, detail });
      offset += byteLength - 4;
    } catch {
      // A coincidental marker is not an AUTH resource.
    }
  }
  return tracks;
}

function logicalSourcePath(rootRecord, filename) {
  const relative = posix(path.relative(rootRecord.root, filename));
  return `disc${rootRecord.disc}/SCENE/${rootRecord.scene}/${relative}`;
}

function pairedPrefixAlias(rootRecord, filename, bytes) {
  if (path.extname(filename).toUpperCase() !== ".PKS") return null;
  const pairedFilename = `${filename.slice(0, -4)}.PKF`;
  const pairedStat = fs.statSync(pairedFilename, { throwIfNoEntry: false });
  if (!pairedStat?.isFile() || pairedStat.size <= bytes.length) return null;
  const pairedBytes = fs.readFileSync(pairedFilename);
  if (!pairedBytes.subarray(0, bytes.length).equals(bytes)) return null;
  try {
    parseIpacArchive(pairedBytes);
  } catch {
    return null;
  }
  return {
    disc: rootRecord.disc,
    area: areaFor(rootRecord, filename),
    sourcePath: logicalSourcePath(rootRecord, filename),
    byteLength: bytes.length,
    sha256: sha256(bytes),
    kind: "exact-prefix-of-complete-paired-pkf",
    completeSourcePath: logicalSourcePath(rootRecord, pairedFilename),
    completeByteLength: pairedBytes.length,
    completeSha256: sha256(pairedBytes),
  };
}

function areaFor(rootRecord, filename) {
  return posix(path.relative(rootRecord.root, filename)).split("/")[0].toUpperCase();
}

function createPayloadRegistry() {
  const byHash = new Map();
  return {
    register(detail, logicalId) {
      const existing = byHash.get(detail.sha256);
      if (existing) {
        if (existing.byteLength !== detail.byteLength) {
          throw new Error(`AUTH hash ${detail.sha256} has conflicting sizes`);
        }
        existing.logicalResourceIds.push(logicalId);
        return;
      }
      byHash.set(detail.sha256, {
        ...detail,
        logicalResourceIds: [logicalId],
      });
    },
    records() {
      return Array.from(byHash.values())
        .map(record => ({
          ...record,
          logicalResourceIds: record.logicalResourceIds.sort(naturalCompare),
        }))
        .sort((left, right) => left.sha256.localeCompare(right.sha256));
    },
  };
}

function countBy(records, keyFor) {
  const counts = new Map();
  for (const record of records) {
    const key = keyFor(record);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return Object.fromEntries(Array.from(counts.entries()).sort(
    ([left], [right]) => naturalCompare(String(left), String(right)),
  ));
}

function normalizedRoots(roots) {
  const records = roots.map(record => ({
    disc: Number(record.disc),
    scene: String(record.scene || record.disc).padStart(2, "0"),
    root: path.resolve(record.root),
  })).sort((left, right) => left.disc - right.disc);
  if (
    records.length !== 3
    || records.some((record, index) => record.disc !== index + 1)
  ) {
    throw new Error("scripted-scene inventory requires exactly disc roots 1, 2, and 3");
  }
  for (const record of records) {
    if (!fs.statSync(record.root, { throwIfNoEntry: false })?.isDirectory()) {
      throw new Error(`Shenmue disc ${record.disc} scene root is missing: ${record.root}`);
    }
  }
  return records;
}

export function buildShenmue1ScriptedSceneInventory({ roots = DEFAULT_ROOTS } = {}) {
  const sourceRoots = normalizedRoots(roots);
  const payloads = createPayloadRegistry();
  const mapinfoPrograms = [];
  const archiveSources = [];
  const archiveAliases = [];
  const authResources = [];
  const sourceIssues = [];
  let scannedArchiveCount = 0;

  for (const rootRecord of sourceRoots) {
    for (const filename of sortedFiles(rootRecord.root)) {
      const basename = path.basename(filename).toUpperCase();
      const extension = path.extname(filename).toUpperCase();
      if (basename !== "MAPINFO.BIN" && extension !== ".PKS" && extension !== ".PKF") {
        continue;
      }
      const sourcePath = logicalSourcePath(rootRecord, filename);
      const area = areaFor(rootRecord, filename);
      const bytes = fs.readFileSync(filename);

      if (basename === "MAPINFO.BIN") {
        const mapinfoSha256 = sha256(bytes);
        const embeddedTracks = discoverEmbeddedAuthTracks(bytes);
        const resourceIds = [];
        for (const track of embeddedTracks) {
          const id = `d${rootRecord.disc}:${area}:mapinfo:${mapinfoSha256.slice(0, 12)}:trck:${hex(track.offset)}`;
          const resource = {
            id,
            disc: rootRecord.disc,
            area,
            kind: "mapinfo-embedded",
            sourcePath,
            sourceOffset: hex(track.offset),
            byteLength: track.byteLength,
            payloadSha256: track.detail.sha256,
          };
          authResources.push(resource);
          resourceIds.push(id);
          payloads.register(track.detail, id);
        }
        mapinfoPrograms.push({
          disc: rootRecord.disc,
          area,
          sourcePath,
          byteLength: bytes.length,
          sha256: mapinfoSha256,
          embeddedAuthResourceIds: resourceIds,
        });
        continue;
      }

      scannedArchiveCount += 1;
      try {
        const archive = parseIpacArchive(bytes);
        const members = archive.members.filter(member => member.extension === "AUTH");
        if (members.length === 0) continue;
        const resourceIds = [];
        for (const member of members) {
          const id = `d${rootRecord.disc}:${area}:archive:${posix(path.relative(rootRecord.root, filename))}:${member.index}:${member.name}.${member.extension}`;
          try {
            const detail = describeAuthPayload(member.bytes);
            authResources.push({
              id,
              disc: rootRecord.disc,
              area,
              kind: "archive-member",
              sourcePath,
              archiveSha256: sha256(bytes),
              archiveMemberIndex: member.index,
              archiveMember: `${member.name}.${member.extension}`,
              sourceOffset: hex(member.offset),
              byteLength: member.byteLength,
              payloadSha256: detail.sha256,
            });
            resourceIds.push(id);
            payloads.register(detail, id);
          } catch (error) {
            sourceIssues.push({
              disc: rootRecord.disc,
              area,
              sourcePath,
              archiveMemberIndex: member.index,
              archiveMember: `${member.name}.${member.extension}`,
              reason: error instanceof Error ? error.message : String(error),
            });
          }
        }
        archiveSources.push({
          disc: rootRecord.disc,
          area,
          sourcePath,
          byteLength: bytes.length,
          sha256: sha256(bytes),
          containerMagic: archive.containerMagic,
          memberCount: archive.memberCount,
          authResourceIds: resourceIds,
        });
      } catch (error) {
        const alias = pairedPrefixAlias(rootRecord, filename, bytes);
        if (alias) {
          archiveAliases.push(alias);
          continue;
        }
        sourceIssues.push({
          disc: rootRecord.disc,
          area,
          sourcePath,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  mapinfoPrograms.sort((left, right) => naturalCompare(left.sourcePath, right.sourcePath));
  archiveSources.sort((left, right) => naturalCompare(left.sourcePath, right.sourcePath));
  archiveAliases.sort((left, right) => naturalCompare(left.sourcePath, right.sourcePath));
  authResources.sort((left, right) => naturalCompare(left.id, right.id));
  sourceIssues.sort((left, right) => naturalCompare(
    `${left.sourcePath}:${left.archiveMemberIndex ?? -1}`,
    `${right.sourcePath}:${right.archiveMemberIndex ?? -1}`,
  ));
  const authPayloads = payloads.records();
  const uniqueMapinfoHashes = new Set(mapinfoPrograms.map(record => record.sha256));
  const embeddedResources = authResources.filter(record => record.kind === "mapinfo-embedded");
  const archiveResources = authResources.filter(record => record.kind === "archive-member");
  const trackOnlyPayloads = authPayloads.filter(record => record.parseStatus !== "complete");

  return {
    schema: INVENTORY_SCHEMA,
    evidenceBoundary: {
      proves: [
        "physical and logical MAPINFO identities across all three Shenmue I discs",
        "structurally valid AUTH/TRCK resources embedded in MAPINFO or stored as direct PKS/PKF IPAC members",
        "AUTH payload identity, chunk layout, duration, actors, commands, and parse issues where supported by the shared parsers",
      ],
      doesNotProve: [
        "which room-script route owns or launches each AUTH resource",
        "that every AUTH resource is a distinct player-facing scene",
        "complete AFS voice/model dependency resolution",
        "runtime or gameplay completion",
      ],
    },
    generatedFrom: sourceRoots.map(record => ({
      disc: record.disc,
      scene: record.scene,
      logicalRoot: `disc${record.disc}/SCENE/${record.scene}`,
    })),
    summary: {
      mapinfoProgramCount: mapinfoPrograms.length,
      uniqueMapinfoPayloadCount: uniqueMapinfoHashes.size,
      scannedArchiveCount,
      archiveWithAuthCount: archiveSources.length,
      pairedArchivePrefixCount: archiveAliases.length,
      authResourceCount: authResources.length,
      embeddedAuthResourceCount: embeddedResources.length,
      archiveAuthResourceCount: archiveResources.length,
      uniqueAuthPayloadCount: authPayloads.length,
      completeAuthPayloadCount: authPayloads.length - trackOnlyPayloads.length,
      trackOnlyAuthPayloadCount: trackOnlyPayloads.length,
      sourceIssueCount: sourceIssues.length,
      mapinfoByDisc: countBy(mapinfoPrograms, record => String(record.disc)),
      authResourcesByDisc: countBy(authResources, record => String(record.disc)),
      authResourcesByDiscArea: countBy(
        authResources,
        record => `${record.disc}:${record.area}`,
      ),
    },
    mapinfoPrograms,
    archiveSources,
    archiveAliases,
    authResources,
    authPayloads,
    sourceIssues,
  };
}

export function renderInventoryMarkdown(inventory) {
  const summary = inventory.summary;
  const areaRows = Object.entries(summary.authResourcesByDiscArea)
    .map(([key, count]) => {
      const [disc, area] = key.split(":");
      const records = inventory.authResources.filter(
        record => String(record.disc) === disc && record.area === area,
      );
      const embedded = records.filter(record => record.kind === "mapinfo-embedded").length;
      const archives = count - embedded;
      return `| ${disc} | ${area} | ${count} | ${embedded} | ${archives} |`;
    });
  const issueRows = inventory.sourceIssues.length === 0
    ? ["No structural source failures were recorded."]
    : inventory.sourceIssues.map(issue => (
      `- \`${issue.sourcePath}${issue.archiveMember ? `#${issue.archiveMember}` : ""}\`: ${issue.reason}`
    ));

  return [
    "# Shenmue I scripted-scene source inventory",
    "",
    "Status: generated evidence; do not edit by hand",
    "",
    "Generated by `tools/scripting/build_shenmue1_scripted_scene_inventory.mjs`.",
    "",
    "This report inventories structurally valid MAPINFO and AUTH resources. It",
    "does **not** call each AUTH track a scene. Route ownership and player-facing",
    "scene identities are established by the next control-flow join.",
    "",
    "## Summary",
    "",
    "| Measurement | Count |",
    "| --- | ---: |",
    `| Physical MAPINFO programs | ${summary.mapinfoProgramCount} |`,
    `| Unique MAPINFO payloads | ${summary.uniqueMapinfoPayloadCount} |`,
    `| PKS/PKF archives scanned | ${summary.scannedArchiveCount} |`,
    `| Archives containing AUTH | ${summary.archiveWithAuthCount} |`,
    `| Exact PKS prefixes represented by complete paired PKF files | ${summary.pairedArchivePrefixCount} |`,
    `| Logical AUTH resources | ${summary.authResourceCount} |`,
    `| MAPINFO-embedded AUTH resources | ${summary.embeddedAuthResourceCount} |`,
    `| Archive-member AUTH resources | ${summary.archiveAuthResourceCount} |`,
    `| Unique AUTH payloads | ${summary.uniqueAuthPayloadCount} |`,
    `| Fully parsed AUTH payloads | ${summary.completeAuthPayloadCount} |`,
    `| Structurally valid but partially parsed AUTH payloads | ${summary.trackOnlyAuthPayloadCount} |`,
    `| Structural source issues | ${summary.sourceIssueCount} |`,
    "",
    "## Logical AUTH resources by disc and area",
    "",
    "| Disc | Area | Total | Embedded | Archive member |",
    "| ---: | --- | ---: | ---: | ---: |",
    ...areaRows,
    "",
    "## Structural issues",
    "",
    ...issueRows,
    "",
    "## Evidence boundary",
    "",
    ...inventory.evidenceBoundary.proves.map(value => `- Proves: ${value}.`),
    ...inventory.evidenceBoundary.doesNotProve.map(value => `- Does not prove: ${value}.`),
    "",
  ].join("\n");
}

function parseArguments(argv) {
  const options = {
    roots: DEFAULT_ROOTS.map(record => ({ ...record })),
    jsonOutput: DEFAULT_JSON_OUTPUT,
    markdownOutput: DEFAULT_MARKDOWN_OUTPUT,
    check: false,
  };
  const customRoots = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--check") {
      options.check = true;
      continue;
    }
    const next = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`${argument} requires a value`);
      return argv[index];
    };
    if (argument === "--disc-root") {
      const value = next();
      const separator = value.indexOf(":");
      const disc = Number(value.slice(0, separator));
      const root = value.slice(separator + 1);
      if (![1, 2, 3].includes(disc) || separator < 1 || !root) {
        throw new Error("--disc-root must use DISC:PATH with disc 1, 2, or 3");
      }
      customRoots.set(disc, root);
      continue;
    }
    if (argument === "--json-out") {
      options.jsonOutput = path.resolve(next());
      continue;
    }
    if (argument === "--markdown-out") {
      options.markdownOutput = path.resolve(next());
      continue;
    }
    throw new Error(`unknown argument ${argument}`);
  }
  if (customRoots.size > 0) {
    options.roots = DEFAULT_ROOTS.map(record => ({
      ...record,
      root: customRoots.get(record.disc) || record.root,
    }));
  }
  return options;
}

function writeOrCheck(filename, content, check) {
  if (check) {
    const existing = fs.readFileSync(filename, "utf8");
    if (existing !== content) {
      throw new Error(`${posix(path.relative(PROJECT_ROOT, filename))} is stale`);
    }
    return false;
  }
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  if (fs.statSync(filename, { throwIfNoEntry: false })?.isFile()) {
    if (fs.readFileSync(filename, "utf8") === content) return false;
  }
  fs.writeFileSync(filename, content);
  return true;
}

export function runCli(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const inventory = buildShenmue1ScriptedSceneInventory({ roots: options.roots });
  const json = `${JSON.stringify(inventory, null, 2)}\n`;
  const markdown = renderInventoryMarkdown(inventory);
  const jsonChanged = writeOrCheck(options.jsonOutput, json, options.check);
  const markdownChanged = writeOrCheck(
    options.markdownOutput,
    markdown,
    options.check,
  );
  const action = options.check ? "Validated" : (jsonChanged || markdownChanged ? "Wrote" : "Unchanged");
  console.log(
    `${action} ${inventory.summary.authResourceCount} logical AUTH resources / `
    + `${inventory.summary.uniqueAuthPayloadCount} unique payloads from `
    + `${inventory.summary.mapinfoProgramCount} MAPINFO programs`,
  );
  return inventory;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    runCli();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
