#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const DEFAULTS = {
  coveragePath: "tools/evidence/shenmue2-animation-coverage.json",
  npcEvidencePath: "tools/evidence/shenmue2-xbox-npc-structure.json",
  xboxRoot: ".disc-work/shenmue2-xbox-extracted/Shenmue II",
  outputPath: "tools/evidence/shenmue2-animation-capture-targets.json",
  check: false,
};

function parseArguments(argv) {
  const options = { ...DEFAULTS };
  const names = new Map([
    ["--coverage", "coveragePath"],
    ["--npc-evidence", "npcEvidencePath"],
    ["--xbox-root", "xboxRoot"],
    ["--out", "outputPath"],
  ]);
  for (let index = 0; index < argv.length;) {
    if (argv[index] === "--check") {
      options.check = true;
      index += 1;
      continue;
    }
    const property = names.get(argv[index]);
    if (!property || argv[index + 1] === undefined) {
      throw new Error(`Unknown or incomplete argument: ${argv[index] || ""}`);
    }
    options[property] = argv[index + 1];
    index += 2;
  }
  for (const property of [
    "coveragePath", "npcEvidencePath", "xboxRoot", "outputPath",
  ]) options[property] = path.resolve(options[property]);
  return options;
}

function readJson(filename) {
  return JSON.parse(fs.readFileSync(filename, "utf8"));
}

function recursiveFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const filename = path.join(directory, entry.name);
      return entry.isDirectory() ? recursiveFiles(filename)
        : entry.isFile() ? [filename] : [];
    });
}

function sourceBytes(filename) {
  const bytes = fs.readFileSync(filename);
  return bytes[0] === 0x1f && bytes[1] === 0x8b
    ? zlib.gunzipSync(bytes)
    : bytes;
}

function occurrences(bytes, token) {
  const positions = [];
  for (let start = 0;;) {
    const offset = bytes.indexOf(token, start);
    if (offset < 0) break;
    positions.push(offset);
    start = offset + 1;
  }
  return positions;
}

function candidateKind(relative) {
  const parts = relative.split("/");
  const extension = path.extname(relative).toUpperCase();
  const directory = parts[2] || null;
  const basename = path.basename(relative).toUpperCase();
  if (/^NPC_[A-Z0-9]{4}\.BIN$/.test(basename) && basename !== "NPC_EXT0.BIN") {
    return "area-npc-container";
  }
  if (/^NPC_[^.]+\.MOT$/.test(basename)) return "character-motion-bank";
  if (directory && !["npc", "pack", "stream", "sound", "movie"].includes(directory)) {
    if ([".EV1", ".EV2", ".EV3"].includes(extension)) return "area-event";
    if ([".PKS", ".PKF", ".MOT", ".BIN"].includes(extension)) {
      return "area-resource";
    }
  }
  return null;
}

const SCORES = {
  "area-event": 100,
  "area-npc-container": 95,
  "area-resource": 85,
  "character-motion-bank": 60,
};

function scanXbox(root, actorCodes) {
  const wantedExtensions = new Set([
    ".EV1", ".EV2", ".EV3", ".PKS", ".PKF", ".MOT", ".BIN",
  ]);
  const result = new Map(actorCodes.map((actorCode) => [actorCode, []]));
  for (const filename of recursiveFiles(path.join(root, "scene"))) {
    if (!wantedExtensions.has(path.extname(filename).toUpperCase())) continue;
    const relative = path.relative(root, filename).split(path.sep).join("/");
    if (relative.includes("/npc/HUMANS.")) continue;
    const kind = candidateKind(relative);
    if (!kind) continue;
    const bytes = sourceBytes(filename);
    for (const actorCode of actorCodes) {
      const positions = occurrences(bytes, Buffer.from(actorCode, "ascii"));
      if (!positions.length) continue;
      const [, disc, area] = relative.split("/");
      const npcArea = kind === "area-npc-container"
        ? path.basename(relative, path.extname(relative)).slice(4)
        : null;
      result.get(actorCode).push({
        source: relative,
        sourceSha256: crypto.createHash("sha256").update(bytes).digest("hex"),
        kind,
        disc: Number(disc),
        area: npcArea || (
          ["npc", "pack", "stream", "sound", "movie"].includes(area)
            ? null : area
        ),
        occurrenceCount: positions.length,
        firstOffsets: positions.slice(0, 5).map((offset) => `0x${offset.toString(16)}`),
        score: SCORES[kind],
      });
    }
  }
  for (const candidates of result.values()) candidates.sort((left, right) => (
    right.score - left.score
    || left.disc - right.disc
    || left.source.localeCompare(right.source)
  ));
  return result;
}

function npcActorRecords(evidence) {
  return new Map((evidence.dreamcastNpc?.actors || []).map((actor) => [
    actor.actorCode,
    {
      source: "Dreamcast Disc 1 SCENE/01/NPC/NPC.BIN",
      actorRecordIndex: actor.index,
      actorRecordOffset: actor.sourceOffset,
      programCount: actor.programCount,
      nodeIds: [...new Set((actor.programs || []).flatMap((program) => (
        program.nodeReferences || []
      )).map(({ id }) => id))].sort(),
      packedTimes: [...new Set((actor.programs || []).flatMap((program) => (
        program.packedTimes || []
      )).map(({ hour, minute }) => (
        `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
      )))].sort(),
    },
  ]));
}

const options = parseArguments(process.argv.slice(2));
const coverage = readJson(options.coveragePath);
const npcEvidence = readJson(options.npcEvidencePath);
const missing = coverage.missingNativeProfileCaptureTargets || [];
const actorCodes = [...new Set(missing.flatMap(({ actorCodes: codes }) => codes))].sort();
const scanned = scanXbox(options.xboxRoot, actorCodes);
const nativeRecords = npcActorRecords(npcEvidence);

const targets = missing.map((target) => {
  const candidates = target.actorCodes.flatMap((actorCode) => (
    scanned.get(actorCode).map((candidate) => ({ actorCode, ...candidate }))
  )).sort((left, right) => (
    right.score - left.score
    || left.disc - right.disc
    || left.source.localeCompare(right.source)
  ));
  const records = target.actorCodes.flatMap((actorCode) => (
    nativeRecords.has(actorCode)
      ? [{ actorCode, ...nativeRecords.get(actorCode) }]
      : []
  ));
  const direct = candidates.filter(({ kind }) => (
    kind === "area-event" || kind === "area-npc-container"
  ));
  return {
    ...target,
    acquisitionStatus: direct.length
      ? "direct-source-target-found"
      : candidates.some(({ kind }) => kind === "area-resource")
        ? "area-resource-target-found"
        : "native-location-unresolved",
    bestDisc: candidates[0]?.disc || null,
    bestArea: candidates.find(({ area }) => area)?.area || null,
    nativeDisc1ScheduleRecords: records,
    sourceCandidates: candidates.slice(0, 16),
  };
});

const report = {
  schema: "new-yokosuka-shenmue2-animation-capture-targets-v1",
  evidenceBoundary: [
    "Candidate files contain the exact four-byte native actor code after Xbox gzip decompression; names, subtitles, and game lore are not used.",
    "An actor-code occurrence proves that a source resource refers to that actor. It does not prove the actor is live merely by loading the containing area; story predicates may still gate creation.",
    "Dreamcast NPC schedule records come from the existing statically decoded NPC.BIN evidence. Missing programs or area references are reported as unresolved and are not guessed.",
    "A strict animation fixture still requires a synchronized Dreamcast RAM capture with exact actor/model binding and all native renderer solver matrices.",
  ],
  source: {
    coverageSchema: coverage.schema,
    npcEvidenceSchema: npcEvidence.schema,
    xboxRoot: path.relative(process.cwd(), options.xboxRoot).split(path.sep).join("/"),
    safety: "Static reads and gzip decompression only; no Xbox executable was run.",
  },
  summary: {
    missingRestProfileCount: targets.length,
    directSourceTargetCount: targets.filter(({ acquisitionStatus }) => (
      acquisitionStatus === "direct-source-target-found"
    )).length,
    areaResourceTargetCount: targets.filter(({ acquisitionStatus }) => (
      acquisitionStatus === "area-resource-target-found"
    )).length,
    unresolvedNativeLocationCount: targets.filter(({ acquisitionStatus }) => (
      acquisitionStatus === "native-location-unresolved"
    )).length,
  },
  targets,
};

const rendered = `${JSON.stringify(report, null, 2)}\n`;
if (options.check) {
  const existing = fs.existsSync(options.outputPath)
    ? fs.readFileSync(options.outputPath, "utf8") : "";
  if (existing !== rendered) {
    process.stderr.write(`${path.relative(process.cwd(), options.outputPath)} is stale\n`);
    process.exitCode = 1;
  }
} else {
  fs.mkdirSync(path.dirname(options.outputPath), { recursive: true });
  fs.writeFileSync(options.outputPath, rendered);
  process.stdout.write(`Wrote ${path.relative(process.cwd(), options.outputPath)}\n`);
}
