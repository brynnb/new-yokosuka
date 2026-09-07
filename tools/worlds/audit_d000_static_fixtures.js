#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import * as BABYLON from "@babylonjs/core";
import { Mt5Loader } from "../../src/Mt5Loader.js";

const outputPath = path.resolve(
  process.argv[2] || "tools/evidence/d000-static-fixtures.json",
);
const definitions = [
  {
    tag: "HDCA",
    model: "HTL02DBG.CHRM",
    classification: "fixed passive scenery",
  },
  {
    tag: "WAGK",
    model: "WAGS500G.CHRM",
    classification: "state-dependent passive cutscene prop",
  },
];
const captureReports = [0, 1, 2].map((entry) => ({
  entry,
  source: `.disc-work/d000-entry${entry}-tagged-objects.json`,
  report: JSON.parse(fs.readFileSync(
    `.disc-work/d000-entry${entry}-tagged-objects.json`,
    "utf8",
  )),
}));
const dispatch = JSON.parse(
  fs.readFileSync(".disc-work/d000-dispatch-calls.json", "utf8"),
);
const transforms = JSON.parse(
  fs.readFileSync(".disc-work/d000-sh4-transforms.json", "utf8"),
);
const mapinfo = fs.readFileSync(".disc-work/exact/d000/MAPINFO.BIN");
const engine = new BABYLON.NullEngine();
const scene = new BABYLON.Scene(engine);

const fixtures = [];
const failures = [];
function hashRange(start, end) {
  return {
    start: `0x${start.toString(16)}`,
    endExclusive: `0x${end.toString(16)}`,
    byteLength: end - start,
    sha256: crypto
      .createHash("sha256")
      .update(mapinfo.subarray(start, end))
      .digest("hex"),
  };
}

function callAt(offset, operationHex) {
  const callFileOffset = `0x${offset.toString(16)}`;
  const call = dispatch.calls.find(
    (candidate) => candidate.callFileOffset === callFileOffset,
  );
  if (!call || call.operationHex !== operationHex) {
    failures.push(
      `expected ${operationHex} dispatcher call at ${callFileOffset}`,
    );
  }
  return call || null;
}

for (const definition of definitions) {
  const states = captureReports.map(({ entry, source, report }) => ({
    entry,
    source,
    object: report.objects.find(
      (object) => object.objectTag === definition.tag,
    ),
  }));
  const modelPath = path.resolve(
    ".disc-work/exact/d000/unpacked/OMG",
    definition.model,
  );
  const bytes = fs.readFileSync(modelPath);
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
  const loader = new Mt5Loader(scene);
  const roots = await loader.load(buffer, null);
  const root = roots[0];
  root.computeWorldMatrix(true);
  for (const node of root.getDescendants(false)) {
    node.computeWorldMatrix?.(true);
  }
  const bounds = root.getHierarchyBoundingVectors(true);
  const keys = (root._mt5Nodes || []).map((node) => {
    const key = node.flag & 0xffff;
    return key >= 0x8000 ? key - 0x10000 : key;
  });
  const directDispatch = dispatch.calls.filter(
    (call) => call.arguments.some(
      (argument) => argument.ascii === definition.tag,
    ),
  ).map((call) => ({
    callFileOffset: call.callFileOffset,
    operationHex: call.operationHex,
    arguments: call.arguments.map((argument) => (
      argument.ascii ?? argument.value ?? argument.kind
    )),
  }));
  const directTransforms = (transforms.calls || []).filter(
    (call) => call.objectTag === definition.tag,
  );
  const positions = states.map(({ object }) => object?.runtimePosition);
  const rotations = states.map(
    ({ object }) => object?.runtimeRotationDegrees,
  );
  const fixedAcrossCaptures = (
    new Set(positions.map(JSON.stringify)).size === 1
    && new Set(rotations.map(JSON.stringify)).size === 1
  );
  if (states.some(({ object }) => !object)) {
    failures.push(`${definition.tag} is absent from a runtime capture`);
  }
  if (!fixedAcrossCaptures) {
    failures.push(`${definition.tag} transform changes across captures`);
  }
  if (keys.length !== 1 || keys[0] !== -1) {
    failures.push(`${definition.tag} unexpectedly has articulated routes`);
  }
  if (directTransforms.length !== 0) {
    failures.push(`${definition.tag} has direct HMDL transform calls`);
  }
  const fixture = {
    ...definition,
    states: states.map(({ entry, object }) => ({
      entry,
      placementClass: object?.placementClass || null,
      runtimePosition: object?.runtimePosition || null,
      runtimeRotationDegrees: object?.runtimeRotationDegrees || null,
      taskFlags: object?.taskFlags || null,
    })),
    fixedAcrossCaptures,
    modelEvidence: {
      source: path.relative(process.cwd(), modelPath),
      byteLength: bytes.length,
      renderKeys: keys,
      dimensions: [
        bounds.max.x - bounds.min.x,
        bounds.max.y - bounds.min.y,
        bounds.max.z - bounds.min.z,
      ],
    },
    directDispatch,
    directHmdlTransforms: directTransforms,
  };
  if (definition.tag === "WAGK") {
    const participantCalls = [
      [0x7dfcc, "0x0059"],
      [0x7dff0, "0x0019"],
      [0x7e00a, "0x001c"],
      [0x7e024, "0x001c"],
      [0x7e072, "0x0176"],
      [0x7e13a, "0x01ae"],
    ].map(([offset, operationHex]) => callAt(offset, operationHex));
    const hourLoads = [
      mapinfo.readUInt16LE(0x7de8c),
      mapinfo.readUInt16LE(0x7de9c),
    ];
    const hourThresholds = [
      mapinfo.readUInt16LE(0x7de96),
      mapinfo.readUInt16LE(0x7dea6),
    ];
    if (
      hourLoads[0] !== 0xd40b
      || hourLoads[1] !== 0xd507
      || hourThresholds[0] !== 0xe513
      || hourThresholds[1] !== 0xe606
    ) {
      failures.push("WAGK nighttime predicate instructions changed");
    }
    fixture.cutsceneController = {
      routine: hashRange(0x7de84, 0x7e288),
      activationWindow: {
        predicate: "hour >= 19 OR hour <= 6",
        sourceClockHourOffset: "scene-context + 0xcc",
      },
      sceneParticipants: [
        {
          objectTag: "WAGK",
          operations: ["0x001f", "0x00a8"],
          effect: "task visibility and scheduler state only",
        },
        {
          objectTag: "AKIR",
          operations: ["0x0019", "0x001c"],
          effect: "player staging owned by the cutscene controller",
        },
      ],
      controllerOperations: participantCalls.filter(Boolean).map((call) => ({
        callFileOffset: call.callFileOffset,
        operationHex: call.operationHex,
        arguments: call.arguments.map((argument) => (
          argument.ascii ?? argument.value ?? argument.kind
        )),
      })),
      browserClassification: (
        "visible passive prop in the captured state; no fabricated click"
      ),
    };
  }
  fixtures.push(fixture);
  roots.forEach((candidate) => candidate.dispose());
}
engine.dispose();

const report = {
  schema: "new-yokosuka-d000-static-fixtures-v1",
  status: failures.length === 0 ? "verified" : "failed",
  fixtures,
  conclusion: {
    HDCA: (
      "fixed root-only scenery with one direct setup operation and no "
      + "authored HMDL motion"
    ),
    WAGK: (
      "fixed root-only passive prop owned by a nighttime cutscene controller; "
      + "the script changes task visibility/scheduler flags, stages AKIR, and "
      + "contains no WAGK HMDL transform or model animation"
    ),
  },
  failures,
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`Wrote ${outputPath} (${report.status})`);
if (failures.length > 0) process.exitCode = 1;
