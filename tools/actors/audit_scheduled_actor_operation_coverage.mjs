#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {
  DESCRIPTOR_CONTINUATION_POINTER_OPERATION,
  DESCRIPTOR_CURRENT_OPERATION_CLEAR_OPERATIONS,
  DESCRIPTOR_PASS_THROUGH_OPERATIONS,
  DESCRIPTOR_TERMINAL_OPERATIONS,
} from "../lib/scheduler_descriptor_layout.js";

const inputPath = path.resolve(
  process.argv[2] || "play/data/scheduled-actors.json",
);
const outputPath = path.resolve(
  process.argv[3]
    || "tools/evidence/scheduled-actor-operation-coverage.json",
);
const manifest = JSON.parse(fs.readFileSync(inputPath, "utf8"));

const exactBrowserBehavior = new Map([
  [0x01, "native route movement"],
  [0x02, "registered motion-state selection"],
  [0x03, "static position and facing"],
  [0x07, "descriptor-clock wait"],
  [0x08, "area selection"],
  [
    0x09,
    "native lifecycle state and exact definition-default motion reset",
  ],
  [0x10, "registered actor-local object transform and attachment"],
  [0x11, "registered actor-local object release transition"],
  [0x0f, "script-queryable actor state register at +0x90"],
  [0x19, "direct motion-controller install/teardown"],
  [0x1a, "registered motion/control selection"],
  [0x24, "secondary-object attachment placement"],
  [0x28, "strict boolean actor controller mode at +0x149"],
  [0x2b, "resident-character selection"],
  [0x2f, "actor model override"],
  [0x30, "registered mode-7 action motion-controller install/teardown"],
  [0x35, "operation-1 route-completion motion override"],
  [0x38, "actor bounds/control-footprint mode at +0x1d1"],
]);

const partialBrowserBehavior = new Map([
  [0x16, "timed subordinate controller; exact gates and proven placements"],
  [0x17, "linked interaction registration and subtype-1 ambient motion"],
  [0x18, "linked interaction gate and numeric control payload"],
  [0x1c, "secondary-object route and attachment movement"],
  [0x22, "variable-motion gate and exact candidate domain"],
  [0x2a, "linked scene-object state request and numeric payload"],
]);

const retainedWithoutVisibleConsumer = new Map();

const exactNoVisibleHandlers = new Map([
  [0x1d, "native handler 0x0c11f934 returns without changing state"],
]);

function operations() {
  return manifest.actors.flatMap(
    (actor) => actor.scheduleVariants.flatMap(
      (variant) => variant.journeys.flatMap(
        (journey) => (journey.operations || []).map(
          (operation) => ({
            actorCode: actor.actorCode,
            sourceProgramByteSha256: variant.sourceProgramByteSha256,
            journeyStartTime: journey.startTime,
            ...operation,
          }),
        ),
      ),
    ),
  );
}

function classification(operation) {
  const code = operation.operation;
  if (DESCRIPTOR_TERMINAL_OPERATIONS.has(code)) {
    return {
      nativeClass: "descriptor terminal",
      browserStatus: "exact",
      browserEffect: "stop traversal while retaining proven actor state",
    };
  }
  if (DESCRIPTOR_PASS_THROUGH_OPERATIONS.has(code)) {
    return {
      nativeClass: "synchronous payload pass-through",
      browserStatus: "exact no-visible-effect",
      browserEffect: "advance synchronously; no scheduler-side state write",
    };
  }
  if (DESCRIPTOR_CURRENT_OPERATION_CLEAR_OPERATIONS.has(code)) {
    return {
      nativeClass: "current-operation clear",
      browserStatus: "exact no-visible-effect",
      browserEffect: "clear native current-operation state; retain transform",
    };
  }
  if (code === DESCRIPTOR_CONTINUATION_POINTER_OPERATION) {
    return {
      nativeClass: "continuation-pointer registration",
      browserStatus: "exact no-visible-effect",
      browserEffect: "advance synchronously; browser has no native pointer",
    };
  }
  if (exactNoVisibleHandlers.has(code)) {
    return {
      nativeClass: "synchronous no-op handler",
      browserStatus: "exact no-visible-effect",
      browserEffect: exactNoVisibleHandlers.get(code),
    };
  }
  if (exactBrowserBehavior.has(code)) {
    return {
      nativeClass: "state/behavior handler",
      browserStatus: "exact",
      browserEffect: exactBrowserBehavior.get(code),
    };
  }
  if (partialBrowserBehavior.has(code)) {
    return {
      nativeClass: "state/behavior handler",
      browserStatus: "partial",
      browserEffect: partialBrowserBehavior.get(code),
    };
  }
  if (retainedWithoutVisibleConsumer.has(code)) {
    return {
      nativeClass: "direct state/object handler",
      browserStatus: "retained; visible consumer missing",
      browserEffect: retainedWithoutVisibleConsumer.get(code),
    };
  }
  return null;
}

const allOperations = operations();
const grouped = Map.groupBy(
  allOperations,
  (operation) => operation.operation,
);
const operationFamilies = [...grouped.entries()]
  .sort(([left], [right]) => left - right)
  .map(([operationCode, members]) => {
    const decoded = classification(members[0]);
    return {
      operation: operationCode,
      operationHex: `0x${operationCode.toString(16).padStart(2, "0")}`,
      occurrenceCount: members.length,
      actorCodeCount: new Set(
        members.map((operation) => operation.actorCode),
      ).size,
      sourceProgramVariantCount: new Set(
        members.map(
          (operation) => operation.sourceProgramByteSha256,
        ),
      ).size,
      ...(decoded || {
        nativeClass: "unclassified",
        browserStatus: "uncovered",
        browserEffect: null,
      }),
    };
  });

const report = {
  schema: "new-yokosuka-scheduled-actor-operation-coverage-v1",
  generatedFrom: path.relative(process.cwd(), inputPath),
  nativeEvidence: {
    dispatcherAddress: "0x0c119444",
    extensionDispatcherAddress: "0x0c0f5b28",
    operation19HandlerAddress: "0x0c11f804",
    operation19ControllerRequestAddress: "0x0c10d77c",
    operation08HandlerAddress: "0x0c1195d8",
    operation08ActorAreaCodeOffset: "0x0c",
    operation08LinkedActorLookupAddress: "0x0c11bf5c",
    operation08LinkedActorPointerOffset: "0x7c",
    operation08Evidence:
      "tools/evidence/scheduled-actor-area-residency-evidence.json",
    operation09HandlerAddress: "0x0c1195fc",
    operation09ActorStateOffset: "0x14",
    operation0fHandlerAddress: "0x0c119622",
    operation0fActorOffset: "0x90",
    operation0fQueryAddress: "0x0c119888",
    operation28HandlerAddress: "0x0c119608",
    operation28ActorOffset: "0x149",
    operation35ActorOffset: "0x1c0",
    operation35RouteCompletionStateOffset: "0xf4",
    operation35RouteCompletionInstallAddress: "0x0c11faba",
    operation35Evidence:
      "tools/evidence/scheduled-actor-route-completion-evidence.json",
    operation38ActorOffset: "0x1d1",
    operation38RefreshAddress: "0x0c11a382",
    operationDirectStateEvidence:
      "tools/evidence/scheduled-actor-direct-state-evidence.json",
  },
  evidenceBoundary: (
    "Coverage distinguishes exact browser behavior, native operations proven "
    + "to have no visible scheduler effect, partially reconstructed behavior, "
    + "and exact operands retained without a visible consumer. A retained "
    + "numeric field is not claimed as a reproduced world behavior."
  ),
  summary: {
    operationOccurrenceCount: allOperations.length,
    operationFamilyCount: operationFamilies.length,
    exactFamilyCount: operationFamilies.filter(
      (family) => family.browserStatus === "exact",
    ).length,
    exactNoVisibleEffectFamilyCount: operationFamilies.filter(
      (family) => family.browserStatus === "exact no-visible-effect",
    ).length,
    partialFamilyCount: operationFamilies.filter(
      (family) => family.browserStatus === "partial",
    ).length,
    retainedWithoutVisibleConsumerFamilyCount: operationFamilies.filter(
      (family) => family.browserStatus
        === "retained; visible consumer missing",
    ).length,
    uncoveredFamilyCount: operationFamilies.filter(
      (family) => family.browserStatus === "uncovered",
    ).length,
  },
  operationFamilies,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(
  `Wrote ${path.relative(process.cwd(), outputPath)}: `
  + `${report.summary.operationOccurrenceCount} operations across `
  + `${report.summary.operationFamilyCount} families; `
  + `${report.summary.uncoveredFamilyCount} uncovered.`,
);
