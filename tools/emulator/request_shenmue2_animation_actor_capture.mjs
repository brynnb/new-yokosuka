#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAM_BASE = 0x8c000000;
const RAM_SIZE = 0x01000000;
const RUNTIME_HEAP_START = 0x8c700000;

function usage() {
  console.error([
    "Usage: node tools/emulator/request_shenmue2_animation_actor_capture.mjs",
    "       RAM.BIN ACTOR_CODE [ACTOR_CODE ...] [--captures N]",
    "       RAM.BIN --missing-profiles [--captures N]",
    "       [--spacing FRAMES]",
    "       [--timeout FRAMES] [--acquisition-task ADDRESS]",
    "       [--request PATH]",
    "",
    "Finds capture-local occurrences of an exact four-byte S2 actor code and",
    "asks the running instrumented Flycast bridge to capture only after each",
    "record owns a valid duplicated compact-controller pointer. Multiple actor",
    "codes remain armed until each live target has been captured or timeout.",
  ].join("\n"));
}

const DEFAULT_FAMILY_REPORT = new URL(
  "evidence/shenmue2-animation-family-conformance.json",
  import.meta.url,
);

export function shenmue2ActorRecordCandidates(ram, actorCode) {
  if (!Buffer.isBuffer(ram) || ram.length !== RAM_SIZE) {
    throw new Error(`Expected a ${RAM_SIZE}-byte Dreamcast RAM image`);
  }
  if (!/^[\x20-\x7e]{4}$/.test(actorCode)) {
    throw new Error("Actor code must contain exactly four printable ASCII bytes");
  }
  const needle = Buffer.from(actorCode, "ascii");
  const candidates = [];
  let offset = RUNTIME_HEAP_START - RAM_BASE - 1;
  while ((offset = ram.indexOf(needle, offset + 1)) >= 0) {
    const address = RAM_BASE + offset;
    // Native ordinary-actor codes begin on a 32-bit boundary. Static strings
    // and packed instruction immediates are deliberately excluded; the Lua
    // bridge still requires +0x08 and +0x24 to contain the same valid compact
    // controller before requesting a synchronized frame.
    if ((address & 3) === 0 && offset + 0x28 <= ram.length) {
      candidates.push(address >>> 0);
    }
  }
  return candidates;
}

export function actorCaptureRequest({
  actorCode,
  addresses,
  captures = 12,
  spacing = 6,
  timeout = 216000,
  acquisitionTask = null,
}) {
  if (!addresses.length) {
    throw new Error(`No runtime-heap occurrences found for actor ${actorCode}`);
  }
  return [
    `actor ${actorCode}`,
    ...addresses.map((address) => `address 0x${address.toString(16)}`),
    `captures ${captures}`,
    `spacing ${spacing}`,
    `timeout ${timeout}`,
    ...(acquisitionTask === null
      ? []
      : [`acquisition-task 0x${acquisitionTask.toString(16)}`]),
    "",
  ].join("\n");
}

export function multiActorCaptureRequest({
  targets,
  captures = 12,
  spacing = 6,
  timeout = 216000,
  acquisitionTask = null,
}) {
  const populated = targets.filter((target) => target.addresses.length > 0);
  if (!populated.length) {
    throw new Error("No runtime-heap occurrences found for requested actors");
  }
  return [
    ...populated.flatMap((target) => target.addresses.map(
      (address) => `target ${target.actorCode} 0x${address.toString(16)}`,
    )),
    `captures ${captures}`,
    `spacing ${spacing}`,
    `timeout ${timeout}`,
    ...(acquisitionTask === null
      ? []
      : [`acquisition-task 0x${acquisitionTask.toString(16)}`]),
    "",
  ].join("\n");
}

export function missingProfileActorCodes(report) {
  const targets = report?.missingNativeProfileCaptureTargets;
  if (!Array.isArray(targets)) {
    throw new Error("Family report has no missingNativeProfileCaptureTargets");
  }
  return [...new Set(targets.flatMap((target) => target.actorCodes || []))];
}

function parseArguments(argv) {
  const result = {
    ramPath: argv[0] || null,
    actorCodes: [],
    missingProfiles: false,
    captures: 12,
    spacing: 6,
    timeout: 216000,
    acquisitionTask: null,
    requestPath: process.env.FLYCAST_S2_ACTOR_CAPTURE_REQUEST
      || ".flycast-pvr/control/s2-animation-actor-capture.request",
  };
  for (let index = 1; index < argv.length; index += 1) {
    const option = argv[index];
    if (option === "--missing-profiles") {
      result.missingProfiles = true;
      continue;
    }
    if (!option.startsWith("--")) {
      result.actorCodes.push(option);
      continue;
    }
    const value = argv[++index];
    if (option === "--captures") result.captures = Number(value);
    else if (option === "--spacing") result.spacing = Number(value);
    else if (option === "--timeout") result.timeout = Number(value);
    else if (option === "--acquisition-task") {
      result.acquisitionTask = Number(value);
    }
    else if (option === "--request") result.requestPath = value;
    else throw new Error(`Unknown option: ${option}`);
  }
  for (const key of ["captures", "spacing", "timeout"]) {
    if (!Number.isInteger(result[key]) || result[key] < 1) {
      throw new Error(`${key} must be a positive integer`);
    }
  }
  if (
    result.acquisitionTask !== null
    && (!Number.isInteger(result.acquisitionTask)
      || result.acquisitionTask < RAM_BASE
      || result.acquisitionTask + 0x34 > RAM_BASE + RAM_SIZE)
  ) {
    throw new Error("acquisition-task must be a valid Dreamcast RAM address");
  }
  return result;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (!options.ramPath || (!options.actorCodes.length && !options.missingProfiles)) {
    usage();
    process.exitCode = 2;
    return;
  }
  if (options.missingProfiles) {
    const report = JSON.parse(fs.readFileSync(DEFAULT_FAMILY_REPORT, "utf8"));
    options.actorCodes.push(...missingProfileActorCodes(report));
  }
  options.actorCodes = [...new Set(options.actorCodes)];
  const ram = fs.readFileSync(options.ramPath);
  const targets = options.actorCodes.map((actorCode) => ({
    actorCode,
    addresses: shenmue2ActorRecordCandidates(ram, actorCode),
  }));
  const populated = targets.filter((target) => target.addresses.length > 0);
  const skipped = targets.filter((target) => target.addresses.length === 0);
  const request = targets.length === 1
    ? actorCaptureRequest({
        ...options,
        actorCode: targets[0].actorCode,
        addresses: targets[0].addresses,
      })
    : multiActorCaptureRequest({ ...options, targets });
  const requestPath = path.resolve(options.requestPath);
  fs.mkdirSync(path.dirname(requestPath), { recursive: true });
  fs.writeFileSync(requestPath, request);
  console.log(
    `Watching ${populated.reduce((sum, target) => sum + target.addresses.length, 0)} `
    + `capture-local records for ${populated.map((target) => target.actorCode).join(", ")}; `
    + `request written to ${requestPath}`,
  );
  if (skipped.length) {
    console.log(
      `Not present in this RAM allocation: ${skipped.map((target) => target.actorCode).join(", ")}`,
    );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
