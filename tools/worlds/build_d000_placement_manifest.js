#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
if (args.length < 3 || args.length > 4) {
  console.error(
    "Usage: node tools/worlds/build_d000_placement_manifest.js "
    + "<tagged-runtime.json> <static-doors.json> <output.json> "
    + "[door-logic.json]",
  );
  process.exit(2);
}

const [runtimePath, staticDoorPath, outputPath, doorLogicPath] = args.map(
  (argument) => path.resolve(argument),
);
const runtime = JSON.parse(fs.readFileSync(runtimePath, "utf8"));
const staticDoors = JSON.parse(fs.readFileSync(staticDoorPath, "utf8"));
const doorLogic = doorLogicPath
  ? JSON.parse(fs.readFileSync(doorLogicPath, "utf8"))
  : null;

const OMITTED_DYNAMIC_TAGS = new Set();
const LOCAL_MODEL_NAMES = new Set([
  "DENS501G.MT5",
  "GACM400G.MT5",
  "GAT02L0G.MT5",
  "GAT02L3G.MT5",
  "HTL02DBG.MT5",
  "JIHS5GTG.MT5",
  "SEGM4SPG.MT5",
  "TELM402G.MT5",
  "TKO0101G.MT5",
  "TKO0102G.MT5",
  "WAGS500G.MT5",
]);

function rounded(value, places = 6) {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function browserPlacement(object, overrides = {}) {
  const localAsset = LOCAL_MODEL_NAMES.has(object.model);
  return {
    model: localAsset
      ? `S1_D000_OMG_${object.model}`
      : `S1_D000_${object.model}`,
    ...(localAsset ? {
      assetFile: object.model.replace(/\.MT5$/i, ".CHRM"),
      texturePackModel: "S1_D000_MAP.MT5",
    } : {}),
    position: object.browserPosition.map((value) => rounded(value)),
    rotationDegrees: object.browserRotationDegrees.map(
      (value) => rounded(value),
    ),
    scale: object.scale.map((value) => rounded(value)),
    runtime: {
      objectTag: object.objectTag,
      callbackAddress: object.callbackAddress,
      taskAddress: object.taskAddress,
      modelAddress: object.modelAddress,
      placementSource: "d000-tagged-runtime-task",
    },
    ...overrides,
  };
}

const fixedObjects = runtime.objects.filter((object) => (
  object.model
  && object.placementClass === "world"
  && !OMITTED_DYNAMIC_TAGS.has(object.objectTag)
  && object.objectTag !== "BUSS"
  && object.objectTag !== "CAR7"
  && !/^VM_[01]$/.test(object.objectTag)
));

// D000 reuses VM_0 and moves it to the active neighborhood. All five authored
// positions and raw SH-4 yaw values occur in the native room code; three VM_0
// positions and VM_1 were independently observed in the three map-entry RAM
// captures.
const vendingTemplate = runtime.objects.find(
  (object) => object.objectTag === "VM_0",
);
if (!vendingTemplate) throw new Error("VM_0 runtime template was not found.");
const vendingMachines = [
  { tag: "VM_0", position: [17.95, 0.0724, 25.969], yaw: -26.5045166015625 },
  { tag: "VM_0", position: [-15.99, 0.0724, 72.260063], yaw: 0 },
  { tag: "VM_0", position: [-97.89, 0.0724, 96.826], yaw: -126.4801025390625 },
  { tag: "VM_0", position: [-108.8248, 0.0724, 74.6069], yaw: -132.506103515625 },
  { tag: "VM_1", position: [-70.8, 0.0724, 56.6], yaw: 56.964111328125 },
].map((record, index) => browserPlacement({
  ...vendingTemplate,
  objectTag: record.tag,
  browserPosition: [-record.position[0], record.position[1], record.position[2]],
  browserRotationDegrees: [0, -record.yaw, 0],
}, {
  runtime: {
    objectTag: record.tag,
    callbackAddress: vendingTemplate.callbackAddress,
    taskAddress: null,
    modelAddress: vendingTemplate.modelAddress,
    placementSource: "d000-static-vending-branch-table",
    staticVariantIndex: index,
  },
}));

function composedChildPlacement(childTag, parentTag) {
  const child = runtime.objects.find((object) => object.objectTag === childTag);
  const parent = runtime.objects.find((object) => object.objectTag === parentTag);
  if (!child?.model || !parent) {
    throw new Error(`Cannot compose ${childTag} under ${parentTag}.`);
  }
  const yaw = parent.runtimeRotationDegrees[1] * Math.PI / 180;
  const [localX, localY, localZ] = child.runtimePosition;
  const runtimePosition = [
    parent.runtimePosition[0] + localX * Math.cos(yaw) + localZ * Math.sin(yaw),
    parent.runtimePosition[1] + localY,
    parent.runtimePosition[2] - localX * Math.sin(yaw) + localZ * Math.cos(yaw),
  ];
  return browserPlacement({
    ...child,
    browserPosition: [-runtimePosition[0], runtimePosition[1], runtimePosition[2]],
    browserRotationDegrees: [
      child.browserRotationDegrees[0],
      -(parent.runtimeRotationDegrees[1] + child.runtimeRotationDegrees[1]),
      child.browserRotationDegrees[2],
    ],
  }, {
    runtime: {
      objectTag: childTag,
      callbackAddress: child.callbackAddress,
      taskAddress: child.taskAddress,
      modelAddress: child.modelAddress,
      placementSource: "d000-runtime-parent-local-composition",
      parentObjectTag: parentTag,
    },
  });
}

const parentOwnedObjects = [
  composedChildPlacement("GBX0", "GCH0"),
  composedChildPlacement("GBX3", "GCH3"),
];

// BUS_ is a meshless TASK because its visible HMDL is assembled separately.
// The hierarchy's relocated HRCM at 0x8ca2c9a0 agrees 99.0% with the complete
// HUMANS model BUSS530G.CHRM. Its captured transform is independently present
// as actor zero's initial pose in SEQDATA2.AUTH and SEQDATA5.AUTH.
const busVehicle = {
  model: "S1_D000_BUSS530G.MT5",
  assetFile: "BUSS530G.CHRM",
  texturePackFile: "BUSS530G_textures.bin",
  position: [-50.346893, 0, 5.975222],
  rotationDegrees: [0, -62.677002, 0],
  scale: [1, 1, 1],
  runtime: {
    objectTag: "BUS_",
    callbackAddress: "0x0c2de638",
    taskAddress: "0x8ca23860",
    modelAddress: "0x8ca2c9a0",
    placementSource: "d000-bus-runtime-plus-auth-initial-pose",
    sourceModel: "HUMANS.AFS entry 33 / BUSS530G.CHRM",
    modelByteAgreement: 0.990175368672778,
    authoredMovement: [
      "BUSS/SEQDATA2.AUTH",
      "BUSS/SEQDATA5.AUTH",
    ],
    authoredMovementFile: "SEQDATA2.AUTH",
    authoredMovementActorIndex: 0,
    stateDependent: true,
  },
};
const busDriver = {
  model: "S1_D000_OGM_L.MT5",
  position: [-48.01432, 0.726606, 3.987722],
  rotationDegrees: [0, -65.039063, 0],
  scale: [1, 1, 1],
  runtime: {
    objectTag: "BUSS",
    callbackAddress: "0x0c2de638",
    taskAddress: "0x8ca209c0",
    modelAddress: "0x8ca14ae0",
    placementSource: "d000-bus-runtime-plus-auth-initial-pose",
    authoredMovement: [
      "BUSS/SEQDATA2.AUTH",
      "BUSS/SEQDATA5.AUTH",
    ],
    authoredMovementFile: "SEQDATA2.AUTH",
    authoredMovementActorIndex: 1,
    stateDependent: true,
  },
};
// CAR7 is deliberately parked below the map in every available runtime state.
// Keep that exact authored inactive state in the manifest instead of silently
// omitting the model. Its four texture identifiers are all present in the
// D000 texture pack; no active route occurs in the recovered BUSS AUTH files.
const inactiveCar = {
  model: "S1_D000_C85M201G.MT5",
  assetFile: "C85M201G.CHRM",
  texturePackModel: "S1_D000_MAP.MT5",
  position: [-100, -20, 0],
  rotationDegrees: [0, 0, 0],
  scale: [1, 1, 1],
  runtime: {
    objectTag: "CAR7",
    callbackAddress: "0x0c2de638",
    taskAddress: "0x8ca23180",
    modelAddress: "0x8c9fe400",
    placementSource: "d000-captured-inactive-traffic-state",
    sourceModel: "BUSS.PKS / C85M201G.CHRM",
    modelByteAgreement: 0.9871167645140247,
    stateDependent: true,
    inactiveBelowMap: true,
  },
};
const runtimePlacements = [
  ...fixedObjects.map((object) => browserPlacement(object)),
  ...vendingMachines,
  ...parentOwnedObjects,
  busVehicle,
  busDriver,
  inactiveCar,
];
const doorLogicByVisibleIndex = new Map(
  (doorLogic?.doors || []).map((door) => [
    door.visibleStaticDoorIndex,
    door,
  ]),
);
const staticDoorPlacements = staticDoors.placements.map((placement) => {
  const logic = doorLogicByVisibleIndex.get(
    placement.runtime.staticDoorIndex,
  );
  if (!logic) return placement;
  return {
    ...placement,
    runtime: {
      ...placement.runtime,
      doorSelector: logic.selector,
      mappedStaticDoorIndex: logic.mappedStaticDoorIndex,
      usesInvisibleDoorwayProxy: logic.usesInvisibleProxy,
      logicalRecordFlags: logic.runtime?.recordWords?.[1] || null,
      logicalRecordWords: logic.runtime?.recordWords || null,
      doorLogicSource: "d000-logical-door-table",
    },
  };
});
const placements = [
  ...runtimePlacements,
  ...staticDoorPlacements,
].sort((left, right) => (
  left.model.localeCompare(right.model)
  || (left.runtime?.objectTag || "").localeCompare(
    right.runtime?.objectTag || "",
  )
  || (left.runtime?.staticDoorIndex ?? -1)
    - (right.runtime?.staticDoorIndex ?? -1)
));

const result = {
  schema: "new-yokosuka-d000-placement-manifest-v1",
  source: {
    taggedRuntime: path.relative(process.cwd(), runtimePath),
    staticDoors: path.relative(process.cwd(), staticDoorPath),
    ...(doorLogicPath ? {
      doorLogic: path.relative(process.cwd(), doorLogicPath),
    } : {}),
  },
  summary: {
    runtimePlacementCount: runtimePlacements.length,
    staticDoorPlacementCount: staticDoorPlacements.length,
    logicalDoorBindingCount: doorLogicByVisibleIndex.size,
    placementCount: placements.length,
    omittedDynamicTags: [...OMITTED_DYNAMIC_TAGS],
  },
  placements,
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(`Wrote ${outputPath} (${placements.length} placements)`);
