#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import * as BABYLON from "@babylonjs/core";
import {
  DOBUITA_PHONE_BOOK_ATTACHMENTS,
} from "../../src/DobuitaPhoneBookInteraction.js";
import {
  parseAuthSequence,
  resolveAuthMotions,
} from "../lib/AuthSequence.js";
import { MotnLoader } from "../../src/MotnLoader.js";
import { Mt5Loader } from "../../src/Mt5Loader.js";
import {
  parseRuntimeControlRecording,
} from "../../src/RuntimeMatrixRecording.js";

const outputPath = path.resolve(
  process.argv[2] || "tools/evidence/d000-phone-book-interaction.json",
);
const mapinfoPath = path.resolve(".disc-work/exact/d000/MAPINFO.BIN");
const dispatchPath = path.resolve(".disc-work/d000-dispatch-calls.json");
const ramPath = path.resolve(
  "captures/pvr/20260724-010057-frame-4933/ram.bin",
);
const controlPath = path.resolve(
  "captures/skeleton/ryo-controls-1784840938.csv",
);
const closedModelPath = path.resolve(
  ".disc-work/exact/d000/unpacked/OMG/DENS501G.CHRM",
);
const openedModelPath = path.resolve(
  ".disc-work/exact/d000/unpacked/AUTH/DENS502G.CHRM",
);
const bundledOpenedModelPath = path.resolve(
  "play/assets/dobuita/DENS502G.CHRM",
);
const interactionMotionPath = path.resolve(
  ".disc-work/exact/d000/unpacked/AUTH/M_01TE.MOTN",
);
const interactionAuthPath = path.resolve(
  ".disc-work/exact/d000/unpacked/AUTH/SEQDATA0.AUTH",
);

const mapinfo = fs.readFileSync(mapinfoPath);
const ram = fs.readFileSync(ramPath);
const dispatch = JSON.parse(fs.readFileSync(dispatchPath, "utf8"));
const controlRecording = parseRuntimeControlRecording(
  fs.readFileSync(controlPath, "utf8"),
);
const failures = [];

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function hashFile(filename) {
  const bytes = fs.readFileSync(filename);
  return { byteLength: bytes.length, sha256: sha256(bytes) };
}

function callAt(offset, operationHex) {
  const callFileOffset = `0x${offset.toString(16)}`;
  const call = dispatch.calls.find(
    (candidate) => candidate.callFileOffset === callFileOffset,
  );
  if (!call || call.operationHex !== operationHex) {
    failures.push(`missing ${operationHex} call at ${callFileOffset}`);
    return null;
  }
  return {
    callFileOffset,
    operationHex,
    arguments: call.arguments.map(
      (argument) => argument.ascii ?? argument.value ?? argument.kind,
    ),
  };
}

function ramRange(address, length) {
  const offset = address - 0x0c000000;
  return ram.subarray(offset, offset + length);
}

function readFloat(offset) {
  return mapinfo.readFloatLE(offset);
}

function readUInt(offset) {
  return mapinfo.readUInt32LE(offset);
}

const recovered = {
  closed: {
    translation: [readFloat(0x6b470), 0, readFloat(0x6b474)],
    rotationRaw: [readUInt(0x6b478), readUInt(0x6b47c), readUInt(0x6b480)],
  },
  opened: {
    translation: [
      readFloat(0x6b6b0),
      readFloat(0x6b6b4),
      readFloat(0x6b6b8),
    ],
    rotationRaw: [
      readUInt(0x6b6bc),
      readUInt(0x6b6c0),
      readUInt(0x6b6c4),
    ],
  },
};
for (const state of ["closed", "opened"]) {
  const expected = DOBUITA_PHONE_BOOK_ATTACHMENTS[state];
  if (
    JSON.stringify(recovered[state].translation)
      !== JSON.stringify(expected.translation)
    || JSON.stringify(recovered[state].rotationRaw)
      !== JSON.stringify(expected.rotationRaw)
  ) {
    failures.push(`${state} FIXO constants differ from production registry`);
  }
}

const controlTypes = controlRecording.frames[0].controls.map(
  (control) => control.type,
);
for (const state of ["closed", "opened"]) {
  const attachment = DOBUITA_PHONE_BOOK_ATTACHMENTS[state];
  if (
    controlTypes[attachment.runtimeMatrixIndex]
      !== attachment.modelControlId
  ) {
    failures.push(`${state} MOTM control id does not match runtime matrix`);
  }
}

const engine = new BABYLON.NullEngine();
const scene = new BABYLON.Scene(engine);
async function inspectModel(filename) {
  const bytes = fs.readFileSync(filename);
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
  const loader = new Mt5Loader(scene);
  const roots = await loader.load(buffer, null);
  const root = roots[0];
  root.computeWorldMatrix(true);
  root.getDescendants(false).forEach(
    (node) => node.computeWorldMatrix?.(true),
  );
  const bounds = root.getHierarchyBoundingVectors(true);
  const result = {
    source: path.relative(process.cwd(), filename),
    ...hashFile(filename),
    renderKeys: (root._mt5Nodes || []).map((node) => {
      const key = node.flag & 0xffff;
      return key >= 0x8000 ? key - 0x10000 : key;
    }),
    textureIds: [...loader.textureIds.values()].map(
      (id) => Mt5Loader.textureIdHex(id),
    ),
    dimensions: [
      bounds.max.x - bounds.min.x,
      bounds.max.y - bounds.min.y,
      bounds.max.z - bounds.min.z,
    ],
  };
  roots.forEach((candidate) => candidate.dispose(false, true));
  return result;
}

const closedModel = await inspectModel(closedModelPath);
const openedModel = await inspectModel(openedModelPath);
engine.dispose();
if (
  hashFile(openedModelPath).sha256
  !== hashFile(bundledOpenedModelPath).sha256
) {
  failures.push("bundled DENS502G differs from the disc extraction");
}

const motionBytes = fs.readFileSync(interactionMotionPath);
const motion = MotnLoader.parse(motionBytes);
const requiredMotions = [
  "AKI_TORU_TELBOOK_90_F",
  "AKI_OPEN_TELBOOK_F",
  "AKI_OPEN_TELBOOK_LP_F",
  "AKI_LOOK_TELBOOK_LP_F",
  "AKI_MEKURU_TELBOOK_LP_F",
  "AKI_OKU_TELBOOK_90_F",
];
for (const name of requiredMotions) {
  if (!motion.getSequence(name)?.valueData?.complete) {
    failures.push(`M_01TE is missing complete ${name}`);
  }
}
const authBytes = fs.readFileSync(interactionAuthPath);
const authMotions = resolveAuthMotions(
  parseAuthSequence(authBytes),
  motion,
);
const expectedAuthMotion = {
  actorTag: "AKIR",
  motionId: 0x1418,
  motionBank: 0x14,
  sequenceNumber: 24,
  sequenceIndex: 23,
  motionName: "AKI_SIRABERU_DENWATYOU_ETC_TABACOYA_0100",
  startFrame: 18,
  endFrame: 925,
};
const recoveredAuthMotions = authMotions.map((event) => ({
  actorTag: event.actorTag,
  motionId: event.motionId,
  motionBank: event.motionBank,
  sequenceNumber: event.sequenceNumber,
  sequenceIndex: event.sequenceIndex,
  motionName: event.motionName,
  startFrame: event.startFrame,
  endFrame: event.endFrame,
}));
if (
  JSON.stringify(recoveredAuthMotions)
  !== JSON.stringify([expectedAuthMotion])
) {
  failures.push("telephone-book AUTH motion event differs from source proof");
}

const report = {
  schema: "new-yokosuka-d000-phone-book-interaction-v1",
  status: failures.length === 0 ? "verified" : "failed",
  source: {
    mapinfo: path.relative(process.cwd(), mapinfoPath),
    ram: path.relative(process.cwd(), ramPath),
    runtimeControls: path.relative(process.cwd(), controlPath),
  },
  engineSemantics: {
    attachOperation: {
      operationHex: "0x00e6",
      dispatcherHandler: "0x0c1577fe",
      fixoConstructor: "0x0c0beb4a",
      handlerSha256: sha256(ramRange(0x0c1577fe, 0x80)),
      implementationSha256: sha256(ramRange(0x0c0be824, 0x4b2)),
      effect: (
        "create/update the child object's FIXO component from a local "
        + "translation, fixed-turn Euler rotation, parent tag, and MOTM "
        + "model-control id"
      ),
    },
    detachOperation: {
      operationHex: "0x001b",
      dispatcherHandler: "0x0c157830",
      fixoClear: "0x0c0bebda",
      handlerSha256: sha256(ramRange(0x0c157830, 0x16)),
      effect: "clear the child object's FIXO component",
    },
    controlLookup: {
      function: "0x0c1140e6 -> 0x0c10c442 -> 0x0c092ea0",
      effect: (
        "look up a MOTM control record by its type byte, not by array index"
      ),
    },
  },
  scriptCalls: {
    attachClosed: callAt(0x6b3c8, "0x00e6"),
    detachClosed: callAt(0x6b614, "0x001b"),
    attachOpened: callAt(0x6b660, "0x00e6"),
    detachOpened: callAt(0x6ba70, "0x001b"),
  },
  attachments: Object.fromEntries(
    ["closed", "opened"].map((state) => {
      const attachment = DOBUITA_PHONE_BOOK_ATTACHMENTS[state];
      return [state, {
        ...attachment,
        runtimeControlTypeAtMatrixIndex: (
          controlTypes[attachment.runtimeMatrixIndex]
        ),
      }];
    }),
  ),
  models: {
    closed: closedModel,
    opened: {
      ...openedModel,
      bundled: {
        source: path.relative(process.cwd(), bundledOpenedModelPath),
        ...hashFile(bundledOpenedModelPath),
      },
    },
  },
  motion: {
    source: path.relative(process.cwd(), interactionMotionPath),
    ...hashFile(interactionMotionPath),
    sequenceCount: motion.header.sequenceCount,
    requiredCompleteSequences: requiredMotions,
    authoredTimeline: {
      source: path.relative(process.cwd(), interactionAuthPath),
      ...hashFile(interactionAuthPath),
      motions: recoveredAuthMotions,
    },
  },
  conclusion: (
    "The telephone-book routine has two exact FIXO prop states: DENS501G "
    + "on AKIR model-control 18/runtime matrix 36, then DENS502G on model-"
    + "control 12/runtime matrix 30. Both local transforms and detach calls "
    + "are recovered without visual offset fitting. The owning AUTH timeline "
    + "independently selects one-based M_01TE sequence 24 and frames 18..925."
  ),
  failures,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`${report.status}: ${path.relative(process.cwd(), outputPath)}`);
if (failures.length > 0) {
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
}
