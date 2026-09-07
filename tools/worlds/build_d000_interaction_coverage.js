#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { jomoObjectBehavior } from "../../src/JomoObjectRegistry.js";

const args = process.argv.slice(2);
const manifestPath = path.resolve(
  args.shift() || "play/data/d000-runtime-placements.json",
);
let outputPath = path.resolve(
  "tools/evidence/d000-interaction-coverage.json",
);
let doorAuditPath = path.resolve(
  "tools/evidence/d000-door-model-audit.json",
);
let modelAuditPath = path.resolve(
  "tools/evidence/d000-interaction-model-audit.json",
);
let dispatchCallsPath = path.resolve(
  ".disc-work/d000-dispatch-calls.json",
);
let transformCallsPath = path.resolve(
  ".disc-work/d000-sh4-transforms.json",
);
let operationHandlersPath = path.resolve(
  "tools/evidence/d000-operation-handlers.json",
);
let gachaInteractionPath = path.resolve(
  "tools/evidence/d000-gacha-interaction.json",
);
let vendingInteractionPath = path.resolve(
  "tools/evidence/d000-vending-interaction.json",
);
while (args.length > 0) {
  const argument = args.shift();
  if (argument === "--out") outputPath = path.resolve(args.shift());
  else if (argument === "--door-audit") {
    doorAuditPath = path.resolve(args.shift());
  } else if (argument === "--model-audit") {
    modelAuditPath = path.resolve(args.shift());
  } else if (argument === "--dispatch-calls") {
    dispatchCallsPath = path.resolve(args.shift());
  } else if (argument === "--transform-calls") {
    transformCallsPath = path.resolve(args.shift());
  } else if (argument === "--operation-handlers") {
    operationHandlersPath = path.resolve(args.shift());
  } else if (argument === "--gacha-interaction") {
    gachaInteractionPath = path.resolve(args.shift());
  } else if (argument === "--vending-interaction") {
    vendingInteractionPath = path.resolve(args.shift());
  } else {
    console.error(`Unknown argument: ${argument}`);
    process.exit(2);
  }
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const doorAudit = JSON.parse(fs.readFileSync(doorAuditPath, "utf8"));
const modelAudit = JSON.parse(fs.readFileSync(modelAuditPath, "utf8"));
const dispatchCalls = JSON.parse(fs.readFileSync(dispatchCallsPath, "utf8"));
const transformCalls = JSON.parse(fs.readFileSync(transformCallsPath, "utf8"));
const operationHandlers = JSON.parse(
  fs.readFileSync(operationHandlersPath, "utf8"),
);
const gachaInteraction = JSON.parse(
  fs.readFileSync(gachaInteractionPath, "utf8"),
);
const vendingInteraction = JSON.parse(
  fs.readFileSync(vendingInteractionPath, "utf8"),
);
const handlerByOperation = new Map(
  operationHandlers.handlers.map((handler) => [
    handler.operationHex,
    handler.handlerAddress,
  ]),
);

const pairedDoorModels = new Set(
  doorAudit.models
    .filter((model) => model.pairedNode7Present)
    .map((model) => model.model),
);
const modelAuditByModel = new Map(
  modelAudit.models.map((model) => [model.model, model]),
);

const knownTags = new Set(
  manifest.placements
    .map((placement) => placement.runtime?.objectTag)
    .filter(Boolean),
);
const directDispatchByTag = new Map(
  [...knownTags].map((tag) => [tag, []]),
);
for (const call of dispatchCalls.calls) {
  const tags = new Set(
    call.arguments
      .map((argument) => argument.ascii)
      .filter((tag) => knownTags.has(tag)),
  );
  for (const tag of tags) {
    directDispatchByTag.get(tag).push({
      callFileOffset: call.callFileOffset,
      operationId: call.operationHex,
      handlerAddress: handlerByOperation.get(call.operationHex) || null,
      argumentIndex: call.arguments.findIndex(
        (argument) => argument.ascii === tag,
      ),
    });
  }
}

const transformByTag = new Map(
  [...knownTags].map((tag) => [tag, []]),
);
for (const call of transformCalls.calls || []) {
  if (!transformByTag.has(call.objectTag)) continue;
  transformByTag.get(call.objectTag).push({
    callFileOffset: call.callFileOffset,
    node: call.node,
    mode: call.mode,
    modeName: call.modeName,
    position: call.position,
    rotation: call.rotation,
    rotationVector: call.rotationVector,
  });
}

function classify(placement, behavior) {
  const type = placement.runtime?.staticDoorType;
  const tag = placement.runtime?.objectTag || null;
  if (type === 1) {
    return {
      role: "doorway-or-collision-proxy",
      browserInteraction: "none",
      browserImplemented: true,
      exactNativeSemantics: true,
      unresolved: [],
    };
  }
  if (behavior.kind === "d000-door") {
    const paired = pairedDoorModels.has(placement.model);
    return {
      role: "visible-door-leaf",
      browserInteraction: paired
        ? "side-selected node-7/node-12 door transition"
        : "node-12 door transition",
      browserImplemented: true,
      exactNativeSemantics: true,
      unresolved: [],
    };
  }
  if (/^BN\d\d$/.test(tag || "")) {
    return {
      role: "street-banner-scenery",
      browserInteraction: "none",
      browserImplemented: true,
      exactNativeSemantics: directDispatchByTag.get(tag)?.length === 0,
      unresolved: directDispatchByTag.get(tag)?.length
        ? ["native tag operations exist but are not decoded"]
        : [],
    };
  }
  if (tag === "TKOK" || tag === "TKOL") {
    return {
      role: "ambient-animated-fixture",
      browserInteraction: "inspect plus exact node-152 spin",
      browserImplemented: true,
      exactNativeSemantics: true,
      unresolved: [],
    };
  }
  if (tag === "TKOM" || tag === "TKON") {
    return {
      role: "state-dependent-animated-fixture",
      browserInteraction: "inspect; exact slowdown curve retained but not triggered",
      browserImplemented: true,
      exactNativeSemantics: false,
      unresolved: [
        "native selector inputs are exact (story bits 0x02f3/0x0298 and "
          + "clock window [07:00,19:00)), but the browser has no authoritative "
          + "story-variable or Shenmue clock service",
      ],
    };
  }
  if (tag === "BUS_" || tag === "BUSS") {
    return {
      role: "state-dependent-traffic-actor",
      browserInteraction: (
        "click to replay the exact AUTH AMOV route; all 16 mixed-bank "
        + "AUTH motion events are resolved"
      ),
      browserImplemented: true,
      exactNativeSemantics: false,
      unresolved: [
        "native story-state trigger and simultaneous AKIR motion/movement "
          + "cutscene staging are not implemented",
      ],
    };
  }
  if (tag === "CAR7") {
    return {
      role: "state-dependent-traffic-actor",
      browserInteraction: "exact captured inactive pose below the map",
      browserImplemented: true,
      exactNativeSemantics: false,
      unresolved: [
        "active story state or route is absent from available captures and AUTH",
      ],
    };
  }
  if (behavior.kind === "passive-anchor") {
    return {
      role: "state-dependent-scene-anchor",
      browserInteraction: "non-rendered, non-interactive anchor",
      browserImplemented: true,
      exactNativeSemantics: false,
      unresolved: [
        "native gameplay consumer of the DAMY anchor is not decoded",
      ],
    };
  }
  if (behavior.kind === "passive-scenery") {
    return {
      role: "static-scenery-fixture",
      browserInteraction: "fixed, non-interactive scenery",
      browserImplemented: true,
      exactNativeSemantics: false,
      unresolved: [
        "external gameplay consumer, if any, is not decoded",
      ],
    };
  }
  if (tag === "WAGK") {
    return {
      role: "state-dependent-cutscene-prop",
      browserInteraction: "none; retained in the captured visible state",
      browserImplemented: true,
      exactNativeSemantics: false,
      unresolved: [
        "native nighttime cutscene trigger and AKIR/camera staging are not "
          + "implemented; WAGK itself has no model animation",
      ],
    };
  }
  if (behavior.kind === "vending-machine") {
    return {
      role: "gameplay-fixture",
      browserInteraction: (
        "source-native MOTN drinking motion, original can prop, and "
        + "server-authoritative 100-yen purchase/Winning Can result"
      ),
      browserImplemented: vendingInteraction.status === "verified",
      exactNativeSemantics: false,
      unresolved: [
        "full native AUTH camera, Yukawa, dialogue, refund, and branch "
          + "staging are not implemented",
      ],
    };
  }
  if (behavior.kind === "inspect") {
    if (behavior.interactionEmoteId) {
      if (tag === "TBK1") {
        return {
          role: "gameplay-fixture",
          browserInteraction: (
            "source-native MOTN plus exact FIXO closed/opened prop swap"
          ),
          browserImplemented: true,
          exactNativeSemantics: false,
          unresolved: [
            "native AUTH camera/audio, page-selection, and scene-result flow "
              + "are not implemented",
          ],
        };
      }
      if (
        ["GCH0", "GCH3", "GBX0", "GBX3"].includes(tag)
        && behavior.interactionEmoteId === "dobuitaGacha"
      ) {
        return {
          role: "gameplay-fixture",
          browserInteraction: (
            "source-native MOTN plus exact HI_GACH detail-model swap"
          ),
          browserImplemented: gachaInteraction.status === "verified",
          exactNativeSemantics: false,
          unresolved: [
            "exact 100-yen debit, CCOW category flow, model lists, and "
              + "collectible lookup/mutation recovered; random split, "
              + "browser economy/collection, and result presentation remain",
          ],
        };
      }
      return {
        role: "gameplay-fixture",
        browserInteraction: (
          `source-native MOTN interaction (${behavior.interactionEmoteId})`
        ),
        browserImplemented: true,
        exactNativeSemantics: false,
        unresolved: [
          "native inventory, payment, and result-state effects are not decoded",
        ],
      };
    }
    return {
      role: "gameplay-fixture",
      browserInteraction: "local inspect fallback",
      browserImplemented: true,
      exactNativeSemantics: false,
      unresolved: [
        "original gameplay interaction/state effects are not decoded",
      ],
    };
  }
  return {
    role: "unclassified",
    browserInteraction: behavior.kind,
    browserImplemented: behavior.kind !== "none",
    exactNativeSemantics: false,
    unresolved: ["placement has no proven interaction classification"],
  };
}

const placements = manifest.placements.map((placement, index) => {
  const tag = placement.runtime?.objectTag || null;
  const behavior = jomoObjectBehavior(
    placement.model,
    tag,
    placement.runtime,
  );
  const classification = classify(placement, behavior);
  const auditedModel = modelAuditByModel.get(placement.model);
  return {
    index,
    id: placement.id ?? null,
    model: placement.model,
    objectTag: tag,
    position: placement.position,
    staticDoorType: placement.runtime?.staticDoorType ?? null,
    behavior,
    ...classification,
    modelRouteVerified: behavior.kind === "none"
      ? null
      : auditedModel?.status === "verified",
    directNativeDispatchCalls: tag
      ? directDispatchByTag.get(tag) || []
      : [],
    directNativeTransformCalls: tag
      ? transformByTag.get(tag) || []
      : [],
  };
});

const unresolved = placements.filter(
  (placement) => (
    !placement.browserImplemented
    || !placement.exactNativeSemantics
    || placement.modelRouteVerified === false
  ),
);
const summary = {
  placementCount: placements.length,
  browserImplementedCount: placements.filter(
    (placement) => placement.browserImplemented,
  ).length,
  exactNativeSemanticsCount: placements.filter(
    (placement) => placement.exactNativeSemantics,
  ).length,
  unresolvedPlacementCount: unresolved.length,
  visibleDoorCount: placements.filter(
    (placement) => placement.role === "visible-door-leaf",
  ).length,
  pairedNode7UnresolvedDoorCount: placements.filter(
    (placement) => (
      placement.role === "visible-door-leaf"
      && placement.unresolved.some((item) => item.includes("node 7"))
    ),
  ).length,
  pairedNode7ResolvedDoorCount: placements.filter(
    (placement) => (
      placement.role === "visible-door-leaf"
      && pairedDoorModels.has(placement.model)
      && placement.exactNativeSemantics
    ),
  ).length,
  gameplayFixtureFallbackCount: placements.filter(
    (placement) => placement.browserInteraction === "local inspect fallback",
  ).length,
  sourceNativeInteractionCount: placements.filter(
    (placement) => (
      placement.browserInteraction.startsWith("source-native MOTN")
    ),
  ).length,
  dynamicTkoUnresolvedCount: placements.filter(
    (placement) => placement.role === "state-dependent-animated-fixture",
  ).length,
  dynamicTrafficUnresolvedCount: placements.filter(
    (placement) => placement.role === "state-dependent-traffic-actor",
  ).length,
  unclassifiedCount: placements.filter(
    (placement) => placement.role === "unclassified",
  ).length,
};

const report = {
  schema: "new-yokosuka-d000-interaction-coverage-v1",
  source: {
    manifest: path.relative(process.cwd(), manifestPath),
    doorModelAudit: path.relative(process.cwd(), doorAuditPath),
    interactionModelAudit: path.relative(process.cwd(), modelAuditPath),
    dispatchCalls: path.relative(process.cwd(), dispatchCallsPath),
    transformCalls: path.relative(process.cwd(), transformCallsPath),
    operationHandlers: path.relative(
      process.cwd(),
      operationHandlersPath,
    ),
    phoneBookInteraction: (
      "tools/evidence/d000-phone-book-interaction.json"
    ),
    gachaInteraction: path.relative(
      process.cwd(),
      gachaInteractionPath,
    ),
  },
  summary,
  unresolved: unresolved.map((placement) => ({
    index: placement.index,
    id: placement.id,
    model: placement.model,
    objectTag: placement.objectTag,
    role: placement.role,
    browserInteraction: placement.browserInteraction,
    unresolved: placement.unresolved,
  })),
  placements,
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
