#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  describeAuthPayload,
  parseIpacArchive,
} from "../scripting/build_shenmue1_scripted_scene_inventory.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const ROUTES = path.join(ROOT, "tools/data/player-cutscene-owner-discovery.json");
const CANDIDATES = path.join(ROOT, "tools/evidence/native-activity-owner-candidates.json");
const OUTPUT = path.join(ROOT, "tools/evidence/player-cutscene-owner-discovery.json");

function readJson(filename) {
  return JSON.parse(fs.readFileSync(filename, "utf8"));
}

function hash(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function memberBytes(source) {
  const filename = path.join(ROOT, source.path);
  const bytes = fs.readFileSync(filename);
  if (source.kind === "loose-auth") return bytes;
  if (source.kind !== "archive-auth") throw new Error(`unknown source kind ${source.kind}`);
  const archive = parseIpacArchive(bytes);
  const [name, extension] = source.member.split(".");
  const matches = archive.members.filter(item => (
    item.name.toUpperCase() === name.toUpperCase()
    && item.extension.toUpperCase() === extension.toUpperCase()
  ));
  if (matches.length !== 1) {
    throw new Error(`${source.path} expected one ${source.member}; found ${matches.length}`);
  }
  return matches[0].bytes;
}

function summarizeMember(source) {
  const detail = describeAuthPayload(memberBytes(source));
  if (detail.parseStatus !== "complete" || detail.cameraCount !== 1) {
    throw new Error(`${source.path} is not one complete authored camera activity`);
  }
  return {
    ...source,
    sha256: detail.sha256,
    byteLength: detail.byteLength,
    durationFrames: detail.durationFrames,
    actorTags: detail.actorTags,
    cameraCount: detail.cameraCount,
    commandCounts: detail.commandCounts,
    motionBanks: detail.motionBanks,
  };
}

const routes = readJson(ROUTES);
const candidatesEvidence = readJson(CANDIDATES);
const candidates = new Map(candidatesEvidence.candidates.map(item => [item.id, item]));
const reviewedCandidateIds = new Set();
const outputCandidates = [];

for (const declaration of routes.candidates) {
  const ids = [declaration.candidateId, ...(declaration.relatedCandidateIds || [])];
  const sourceCandidates = ids.map(id => {
    const candidate = candidates.get(id);
    if (!candidate) throw new Error(`unknown owner candidate ${id}`);
    if (candidate.promotionState !== "owner-review-required") {
      throw new Error(`${id} is no longer owner-review-required`);
    }
    reviewedCandidateIds.add(id);
    return candidate;
  });
  const scenes = declaration.scenes.map(scene => {
    const members = scene.members.map(summarizeMember);
    return {
      ...scene,
      content: {
        authMemberCount: members.length,
        durationFrames: members.reduce((sum, item) => sum + item.durationFrames, 0),
        voiceCommandCount: members.reduce(
          (sum, item) => sum + (item.commandCounts.voice || 0), 0,
        ),
        soundCommandCount: members.reduce(
          (sum, item) => sum + (item.commandCounts.sound || 0), 0,
        ),
        actorTags: [...new Set(members.flatMap(item => item.actorTags))].sort(),
        members,
      },
    };
  });
  const declaredCalls = scenes.flatMap(scene => scene.installCallOffsets);
  const evidenceCalls = sourceCandidates.flatMap(candidate => (
    candidate.installs.map(install => install.callFileOffset)
  ));
  if (
    declaredCalls.length !== evidenceCalls.length
    || [...declaredCalls].sort().join() !== [...evidenceCalls].sort().join()
  ) {
    throw new Error(`${declaration.candidateId} install calls do not partition candidate evidence`);
  }
  outputCandidates.push({
    ...declaration,
    sourceCandidateIds: ids,
    sourceInstallCount: evidenceCalls.length,
    distinctSceneCount: scenes.length,
    scenes,
  });
}

const expected = new Set(
  candidatesEvidence.candidates
    .filter(item => item.promotionState === "owner-review-required")
    .filter(item => !["d1:JHD0:installer:0x3e7ec", "d1:JHD0:installer:0x537d4"].includes(item.id))
    .map(item => item.id),
);
if ([...expected].some(id => !reviewedCandidateIds.has(id)) || reviewedCandidateIds.size !== expected.size) {
  throw new Error("discovery routes do not exactly cover the five unresolved owner candidates");
}

const allScenes = outputCandidates.flatMap(item => item.scenes);
const report = {
  schema: "new-yokosuka-player-cutscene-owner-discovery-v1",
  generatedBy: "tools/cutscenes/audit_player_cutscene_owner_discovery.mjs",
  generatedFrom: [ROUTES, CANDIDATES].map(filename => ({
    path: path.relative(ROOT, filename),
    sha256: hash(fs.readFileSync(filename)),
  })),
  evidenceBoundary: routes.evidenceBoundary,
  summary: {
    reviewedCandidateCount: reviewedCandidateIds.size,
    sourceInstallCount: outputCandidates.reduce((sum, item) => sum + item.sourceInstallCount, 0),
    distinctPlayerFacingSceneCount: allScenes.length,
    uniqueAuthPayloadCount: new Set(allScenes.flatMap(
      scene => scene.content.members.map(member => member.sha256),
    )).size,
    durationFrames: allScenes.reduce((sum, item) => sum + item.content.durationFrames, 0),
    voiceCommandCount: allScenes.reduce((sum, item) => sum + item.content.voiceCommandCount, 0),
  },
  candidates: outputCandidates,
};

fs.writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report.summary, null, 2));
