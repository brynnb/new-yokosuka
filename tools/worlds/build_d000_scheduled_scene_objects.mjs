#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const options = {
  schedules: "play/data/scheduled-actors.json",
  tagged: ".disc-work/d000-entry0-tagged-objects.json",
  ram: "captures/pvr/20260724-015410-frame-19777/ram.bin",
  evidence: "tools/evidence/d000-scheduled-scene-objects.json",
  play: "play/data/d000-scheduled-scene-objects.json",
};
while (args.length > 0) {
  const name = args.shift();
  if (!Object.hasOwn(options, name.replace(/^--/, ""))) {
    throw new Error(`Unknown argument ${name}`);
  }
  options[name.replace(/^--/, "")] = args.shift();
}

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function findSceneObjectTable(ram) {
  const firstCode = Buffer.from("BS01", "ascii");
  let offset = -1;
  while ((offset = ram.indexOf(firstCode, offset + 1)) !== -1) {
    const exact = Array.from({ length: 16 }, (_, index) => {
      const expected = `BS${String(index + 1).padStart(2, "0")}`;
      return ram.toString(
        "ascii",
        offset + index * 0x58,
        offset + index * 0x58 + 4,
      ) === expected;
    }).every(Boolean);
    if (exact) return offset;
  }
  throw new Error("Could not find the contiguous BS01..BS16 runtime table");
}

function signedFixedDegrees(value) {
  return -value * 360 / 0x10000;
}

const scheduleBytes = fs.readFileSync(path.resolve(options.schedules));
const taggedBytes = fs.readFileSync(path.resolve(options.tagged));
const ram = fs.readFileSync(path.resolve(options.ram));
const schedules = JSON.parse(scheduleBytes);
const tagged = JSON.parse(taggedBytes);
const modelByTag = new Map(tagged.objects.map((object) => [
  object.objectTag,
  object.model,
]));
const tableOffset = findSceneObjectTable(ram);

const events = [];
for (const actor of schedules.actors) {
  for (const variant of actor.scheduleVariants || []) {
    for (const journey of variant.journeys || []) {
      for (const operation of journey.operations || []) {
        if (operation.operation !== 0x2a) continue;
        if (
          ![0, 1].includes(operation.sceneObjectControlValue)
          || operation.sceneObjectTransitionMode
            !== operation.sceneObjectControlValue + 4
        ) {
          throw new Error(
            `Unreviewed scene-object command for ${actor.actorCode}`,
          );
        }
        events.push({
          actorCode: actor.actorCode,
          scheduleVariantId: variant.scheduleVariantId,
          defaultVariant: (
            variant.scheduleVariantId === actor.defaultScheduleVariantId
          ),
          second: journey.startSecond,
          time: journey.startTime,
          sceneObjectCode: operation.sceneObjectCode,
          controlValue: operation.sceneObjectControlValue,
          transitionMode: operation.sceneObjectTransitionMode,
          sourceOperationFileOffset: operation.fileOffset,
        });
      }
    }
  }
}

const sceneObjects = Array.from({ length: 16 }, (_, index) => {
  const offset = tableOffset + index * 0x58;
  const code = ram.toString("ascii", offset, offset + 4);
  const expected = `BS${String(index + 1).padStart(2, "0")}`;
  if (code !== expected) throw new Error(`Expected ${expected}, found ${code}`);
  const sourceModel = modelByTag.get(code);
  const expectedModel = `DBS99${String(index + 1).padStart(2, "0")}G.MT5`;
  if (sourceModel !== expectedModel) {
    throw new Error(`${code} maps to ${sourceModel}, expected ${expectedModel}`);
  }
  const pairedCode = ram.toString("ascii", offset + 4, offset + 8)
    .replaceAll("\0", "");
  const lowerY = ram.readFloatLE(offset + 0x30);
  const upperY = ram.readFloatLE(offset + 0x34);
  if (!(upperY > lowerY)) throw new Error(`${code} has invalid endpoints`);
  const sourceFacingFixed = ram.readInt16LE(offset + 0x20);
  return {
    code,
    model: `S1_D000_${sourceModel}`,
    sourceModel,
    pairedObjectCode: pairedCode || null,
    browserPosition: [
      -ram.readFloatLE(offset + 0x08),
      lowerY,
      ram.readFloatLE(offset + 0x10),
    ],
    browserRotationDegrees: [
      0,
      signedFixedDegrees(sourceFacingFixed),
      0,
    ],
    sourceFacingFixed,
    lowerY,
    upperY,
    nativeUnitsPerFrame: 0.01,
    nativeFramesPerSecond: 30,
    nativeUnitsPerSecond: 0.3,
    animationDurationSeconds: (upperY - lowerY) / 0.3,
    events: events
      .filter((event) => event.sceneObjectCode === code)
      .sort((left, right) => (
        left.second - right.second
        || left.actorCode.localeCompare(right.actorCode)
        || left.scheduleVariantId.localeCompare(right.scheduleVariantId)
      )),
  };
});

const codes = new Set(sceneObjects.map((object) => object.code));
for (const event of events) {
  if (!codes.has(event.sceneObjectCode)) {
    throw new Error(`No reviewed model for ${event.sceneObjectCode}`);
  }
}

const manifest = {
  schema: "new-yokosuka-d000-scheduled-scene-objects-v1",
  generatedFrom: {
    schedules: {
      path: "play/data/scheduled-actors.json",
      sha256: sha256(scheduleBytes),
    },
    taggedObjects: {
      path: ".disc-work/d000-entry0-tagged-objects.json",
      sha256: sha256(taggedBytes),
    },
    runtimeCapture: {
      path: "captures/pvr/20260724-015410-frame-19777/ram.bin",
      sha256: sha256(ram),
      sceneObjectTablePhysicalOffset: `0x${tableOffset.toString(16)}`,
    },
  },
  evidenceBoundary: (
    "Dobuita BS01 through BS16 are exact tagged scene objects backed by "
    + "same-numbered DBS99xxG models. The captured native table supplies "
    + "placement, facing, and lower/upper Y endpoints. Operation 0x2a "
    + "controls zero and one select the upper/open and lower/closed endpoints "
    + "for this reviewed set. No claim is made for other maps or object codes."
  ),
  runtimePolicy: {
    owner: "browser presentation driven by the synchronized public clock",
    liveTransition: "move at the captured native rate of 0.01 units/frame",
    staleTransition: "snap to the latest reviewed endpoint",
    accessAuthorization: "independent server concern",
  },
  summary: {
    sceneObjectCount: sceneObjects.length,
    sourceOperationCount: events.length,
    defaultVariantOperationCount: events.filter(
      (event) => event.defaultVariant,
    ).length,
    distinctActorCount: new Set(events.map((event) => event.actorCode)).size,
  },
  sceneObjects,
};

const encoded = `${JSON.stringify(manifest, null, 2)}\n`;
for (const filename of [options.evidence, options.play]) {
  const output = path.resolve(filename);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, encoded);
  console.log(`Wrote ${path.relative(process.cwd(), output)}`);
}
