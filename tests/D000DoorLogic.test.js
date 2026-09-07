import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { jomoObjectBehavior } from "../src/JomoObjectRegistry.js";

const mapinfo = ".disc-work/exact/d000/MAPINFO.BIN";
const staticDoors = "tools/evidence/d000-static-door-placements.json";
const observed = "tools/evidence/d000-active-door-bindings.json";
const selector53Trace = (
  "tools/evidence/d000-selector-53-door-call-trace.json"
);
const nodeRoute = "tools/evidence/d000-door-node-route.json";
const doorModelAudit = "tools/evidence/d000-door-model-audit.json";
const ram = "captures/pvr/20260724-013823-frame-9042/ram.bin";

test("D000 logical doors form a bijection over all 65 visible doors", {
  skip: !fs.existsSync(mapinfo) || !fs.existsSync(staticDoors),
}, () => {
  const args = [
    "-m", "tools.worlds.extract_d000_door_logic",
    mapinfo,
    staticDoors,
  ];
  if (fs.existsSync(ram)) args.push("--ram", ram);
  if (fs.existsSync(observed)) {
    args.push("--observed-bindings", observed);
  }
  const result = spawnSync("python3", args, { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.summary.logicalDoorCount, 65);
  assert.equal(report.summary.visibleDoorCount, 65);
  assert.equal(report.summary.invisibleProxyPairCount, 19);
  assert.equal(report.summary.observedMismatchCount, 0);
  assert.equal(
    new Set(
      report.doors.map((door) => door.visibleStaticDoorIndex),
    ).size,
    65,
  );
});

test("all visible D000 doors use the shared captured door operation", () => {
  assert.deepEqual(jomoObjectBehavior(
    "S1_D000_DR13_010.MT5",
    null,
    {
      staticDoorIndex: 22,
      staticDoorType: 2,
      doorSelector: 25,
    },
  ), {
    kind: "d000-door",
    renderNodeKey: 12,
    alternateRenderNodeKey: 7,
    endpointFixedTurnMagnitude: 16679,
    evidence: "d000-selector-53-door-call-trace.json",
    routeEvidence: "d000-door-node-route.json",
  });
  assert.deepEqual(jomoObjectBehavior(
    "S1_D000_DR02_014.MT5",
    null,
    {
      staticDoorIndex: 47,
      staticDoorType: 2,
      doorSelector: 51,
    },
  ), {
    kind: "d000-door",
    renderNodeKey: 12,
    alternateRenderNodeKey: 7,
    endpointFixedTurnMagnitude: 16679,
    evidence: "d000-selector-53-door-call-trace.json",
    routeEvidence: "d000-door-node-route.json",
  });
});

test("selector 53 trace proves the exact native setter route and endpoint", {
  skip: !fs.existsSync(selector53Trace),
}, () => {
  const trace = JSON.parse(fs.readFileSync(selector53Trace));
  assert.equal(trace.selector, 53);
  assert.equal(trace.staticDoorIndex, 0);
  assert.equal(trace.model, "S1_D000_DR01_011.MT5");
  assert.equal(trace.opening.node, 12);
  assert.equal(trace.opening.axis, "y");
  assert.equal(trace.opening.setterPc, "0c3e70da");
  assert.equal(trace.opening.endpointFixedTurn, -16679);
  assert.equal(trace.opening.fixedTurnSamples.length, 53);
  assert.equal(trace.summary.openingUpdateCount, 52);
  assert.ok(trace.operations.some((operation) => (
    operation.node === 7
    && operation.mode === 2
    && operation.hasRotation
  )));
});

test("native paired-door branch routes player sides to nodes 12 and 7", {
  skip: !fs.existsSync(nodeRoute),
}, () => {
  const route = JSON.parse(fs.readFileSync(nodeRoute));
  assert.deepEqual(route.branch, {
    fileOffset: "0x21940",
    node12SelectorValues: [2, 3],
    node12SetterFileOffset: "0x2199a",
    node7SelectorValues: [0, 1],
    node7SetterFileOffset: "0x219e2",
  });
  assert.equal(
    route.browserSideObservation.mapping.nonnegativeDoorLocalZ,
    12,
  );
  assert.equal(
    route.browserSideObservation.mapping.negativeDoorLocalZ,
    7,
  );
});

test("all D000 door models contain the native primary node-12 route", {
  skip: !fs.existsSync(doorModelAudit),
}, () => {
  const audit = JSON.parse(fs.readFileSync(doorModelAudit));
  assert.deepEqual(audit.summary, {
    logicalDoorCount: 65,
    distinctModelCount: 34,
    primaryNode12VerifiedCount: 34,
    pairedNode7ModelCount: 14,
    failureCount: 0,
  });
});
