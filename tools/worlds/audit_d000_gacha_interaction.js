#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import * as BABYLON from "@babylonjs/core";
import {
  DOBUITA_GACHA_MACHINES,
} from "../../src/DobuitaGachaInteraction.js";
import { MotnLoader } from "../../src/MotnLoader.js";
import { Mt5Loader } from "../../src/Mt5Loader.js";

const outputPath = path.resolve(
  process.argv[2] || "tools/evidence/d000-gacha-interaction.json",
);
const mapinfoPath = path.resolve(".disc-work/exact/d000/MAPINFO.BIN");
const dispatchPath = path.resolve(".disc-work/d000-dispatch-calls.json");
const handlersPath = path.resolve(
  "tools/evidence/d000-operation-handlers.json",
);
const ramPath = path.resolve(
  "captures/pvr/20260724-010057-frame-4933/ram.bin",
);
const motionPath = path.resolve(
  ".disc-work/exact/d000/unpacked/OMG/M_GACH.MOTN",
);
const modelDirectory = path.resolve(
  ".disc-work/exact/d000/unpacked/HI_GACH",
);

const mapinfo = fs.readFileSync(mapinfoPath);
const dispatch = JSON.parse(fs.readFileSync(dispatchPath, "utf8"));
const handlers = JSON.parse(fs.readFileSync(handlersPath, "utf8"));
const ram = fs.readFileSync(ramPath);
const failures = [];

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function hashFile(filename) {
  const bytes = fs.readFileSync(filename);
  return { byteLength: bytes.length, sha256: sha256(bytes) };
}

function ramRange(address, length) {
  const offset = address - 0x0c000000;
  return ram.subarray(offset, offset + length);
}

function handler(operationHex, expectedAddress) {
  const record = handlers.handlers.find(
    (candidate) => candidate.operationHex === operationHex,
  );
  if (record?.handlerAddress !== expectedAddress) {
    failures.push(
      `${operationHex} handler is ${record?.handlerAddress || "missing"}, `
      + `expected ${expectedAddress}`,
    );
  }
  return record || null;
}

function callAt(offset, operationHex) {
  const callFileOffset = `0x${offset.toString(16)}`;
  const call = dispatch.calls.find(
    (candidate) => candidate.callFileOffset === callFileOffset,
  );
  if (!call || call.operationHex !== operationHex) {
    failures.push(`missing ${operationHex} call at ${callFileOffset}`);
  }
  return call ? {
    callFileOffset,
    operationHex,
    arguments: call.arguments.map(
      (argument) => argument.ascii ?? argument.value ?? argument.kind,
    ),
  } : null;
}

function hex(value) {
  return `0x${value.toString(16)}`;
}

function readNullTerminatedTokens(start, end) {
  const tokens = [];
  let cursor = start;
  while (cursor < end) {
    const terminator = mapinfo.indexOf(0, cursor);
    if (terminator < cursor || terminator >= end || terminator === cursor) {
      break;
    }
    tokens.push(mapinfo.toString("ascii", cursor, terminator));
    cursor = terminator + 1;
  }
  return tokens;
}

const staticBase = 0xa2480;
const expectedTagTables = {
  machine: Array.from({ length: 6 }, (_, index) => `GCH${index}`),
  highDetail: Array.from({ length: 6 }, (_, index) => `HGC${index}`),
  capsuleBox: Array.from({ length: 6 }, (_, index) => `GBX${index}`),
};
const recoveredTagTables = {
  machine: [],
  highDetail: [],
  capsuleBox: [],
};
for (const [name, offset] of [
  ["machine", 0xaca18],
  ["highDetail", 0xaca30],
  ["capsuleBox", 0xaca48],
]) {
  for (let index = 0; index < 6; index += 1) {
    recoveredTagTables[name].push(
      mapinfo.toString("ascii", offset + index * 4, offset + index * 4 + 4),
    );
  }
  if (
    JSON.stringify(recoveredTagTables[name])
      !== JSON.stringify(expectedTagTables[name])
  ) {
    failures.push(`${name} generated tag table changed`);
  }
}

const recoveredRecords = [];
for (let index = 0; index < 6; index += 1) {
  const offset = 0xaca60 + index * 20;
  recoveredRecords.push({
    index,
    sourcePosition: [
      mapinfo.readFloatLE(offset),
      mapinfo.readFloatLE(offset + 4),
      mapinfo.readFloatLE(offset + 8),
    ],
    sourceYawRaw: mapinfo.readUInt32LE(offset + 12),
    recordFlags: mapinfo.readUInt32LE(offset + 16),
    componentSelector: mapinfo.readUInt8(offset + 16),
  });
}
const populatedRecords = recoveredRecords.filter(
  (record) => (
    record.sourcePosition.some((value) => value !== 0)
    || record.sourceYawRaw !== 0
    || record.recordFlags !== 0
  ),
);
for (const definition of DOBUITA_GACHA_MACHINES) {
  const recovered = populatedRecords.find(
    (record) => record.index === definition.index,
  );
  for (const key of [
    "sourcePosition",
    "sourceYawRaw",
    "recordFlags",
    "componentSelector",
  ]) {
    if (
      JSON.stringify(recovered?.[key])
        !== JSON.stringify(definition[key])
    ) {
      failures.push(
        `gacha record ${definition.index} ${key} differs from registry`,
      );
    }
  }
}
if (populatedRecords.length !== DOBUITA_GACHA_MACHINES.length) {
  failures.push("unexpected populated D000 gacha machine record count");
}

const engine = new BABYLON.NullEngine();
const scene = new BABYLON.Scene(engine);
async function inspectModel(definition) {
  const basename = definition.highDetailModel
    .replace(/^S1_D000_/, "")
    .replace(/\.MT5$/, ".CHRM");
  const filename = path.join(modelDirectory, basename);
  const bytes = fs.readFileSync(filename);
  const loader = new Mt5Loader(scene);
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
  const [root] = await loader.load(buffer, null);
  const renderKeys = (root._mt5Nodes || []).map((node) => {
    const key = node.flag & 0xffff;
    return key >= 0x8000 ? key - 0x10000 : key;
  });
  if (JSON.stringify(renderKeys) !== JSON.stringify([-1, 152, 153])) {
    failures.push(`${basename} is missing native interaction nodes 152/153`);
  }
  root.dispose(false, true);
  return {
    source: path.relative(process.cwd(), filename),
    browserAsset: definition.highDetailModel,
    ...hashFile(filename),
    renderKeys,
    textureIds: [...loader.textureIds.values()].map(
      (id) => Mt5Loader.textureIdHex(id),
    ),
  };
}
const models = await Promise.all(
  DOBUITA_GACHA_MACHINES.map(inspectModel),
);
engine.dispose();

const expectedHashes = new Map([
  [
    "S1_D000_GAT0G00G.MT5",
    "ed59b26d7757f35667c38abc9d8de903c2210e318a51ceeef5ab9976b4dc2841",
  ],
  [
    "S1_D000_GAT0G03G.MT5",
    "92a550940b91a966844118f60d6e7ff8df1b3188df69fac03c6ccbd15b80891a",
  ],
]);
for (const model of models) {
  if (model.sha256 !== expectedHashes.get(model.browserAsset)) {
    failures.push(`${model.browserAsset} hash differs from disc extraction`);
  }
}

const motionBytes = fs.readFileSync(motionPath);
const motion = MotnLoader.parse(motionBytes);
const interactionSequence = motion.getSequence("AKI_ASOBU_GATYA");
if (!interactionSequence?.valueData?.complete) {
  failures.push("M_GACH is missing complete AKI_ASOBU_GATYA");
}

const operationHandlers = {
  floatMathAndRandom: handler("0x0009", "0x0c17320c"),
  instantiate: handler("0x0018", "0x0c157530"),
  place: handler("0x001d", "0x0c15787a"),
  objectState: handler("0x001f", "0x0c157e12"),
  componentSelector: handler("0x0024", "0x0c15870c"),
  collectionMutation: handler("0x003d", "0x0c163060"),
  collectionQuery: handler("0x003f", "0x0c1630de"),
  associate: handler("0x0043", "0x0c157c88"),
  integerCompareAndRandom: handler("0x004f", "0x0c1733a0"),
};
if (ram.readUInt32LE(0x0a3a44) !== 0x574f4343) {
  failures.push("gacha selector no longer targets the CCOW component");
}
if (
  sha256(ramRange(0x0c0a3aca, 0x3e))
    !== "943b72cce27b237b79e8228a65b9f533796c5408bd9baef87db17eae73975f3e"
) {
  failures.push("CCOW selector byte implementation changed");
}

/*
 * The prize-selection code has two distinct, deterministic lookup layers:
 *
 * 1. 0x4f978 selects one of sixteen model-token lists for a category.
 * 2. 0x4fe10 selects a uint16 collectible lookup value from the matching
 *    category pool, using a zero-based item index. Category 10 deliberately
 *    includes one zero entry, so pool size must come from the adjacent byte
 *    table rather than a zero terminator.
 *
 * Keep the two adjacent byte tables neutrally named here. Their first table
 * is independently identified as the pool length because every value equals
 * the number of uint16 lookup entries in the corresponding branch. The second
 * table
 * participates in the random-selection split at 0x57330, but its semantic
 * label is not yet proved.
 */
const prizeModelListCalls = [
  0x4f9e2, 0x4fa26, 0x4fa6a, 0x4faae,
  0x4faf2, 0x4fb36, 0x4fb7a, 0x4fbbe,
  0x4fc02, 0x4fc46, 0x4fc8a, 0x4fcce,
  0x4fd12, 0x4fd56, 0x4fd9a, 0x4fdde,
];
const prizeModelListStarts = [
  0xabec8, 0xabf71, 0xac0ac, 0xac1e1,
  0xac288, 0xac3f5, 0xac5ee, 0xac6c1,
  0xac732, 0xac77f, 0xac7b8, 0xac8a7,
  0xac90a, 0xac95f, 0xac9a6, 0xac9df,
];
const prizeIdPoolStarts = [
  0xabd6c, 0xabd84, 0xabda8, 0xabdd4,
  0xabde8, 0xabe10, 0xabe34, 0xabe4c,
  0xabe5c, 0xabe64, 0xabe6c, 0xabe90,
  0xabea0, 0xabeac, 0xabeb8, 0xabec0,
];
const prizePoolLengths = [...mapinfo.subarray(0xabd4c, 0xabd5c)];
const prizeSelectionSplitTable = [
  ...mapinfo.subarray(0xabd5c, 0xabd6c),
];
const prizeCategories = prizeModelListStarts.map((modelListStart, category) => {
  const nextModelListStart = (
    prizeModelListStarts[category + 1] || 0xaca18
  );
  const modelTokens = readNullTerminatedTokens(
    modelListStart,
    nextModelListStart,
  );
  const idPoolStart = prizeIdPoolStarts[category];
  const lookupValues = Array.from(
    { length: prizePoolLengths[category] },
    (_, index) => mapinfo.readUInt16LE(idPoolStart + index * 2),
  );
  const listCall = callAt(prizeModelListCalls[category], "0x019d");
  const recoveredListPointer = dispatch.calls.find(
    (candidate) => (
      candidate.callFileOffset === hex(prizeModelListCalls[category])
    ),
  )?.arguments?.[1]?.value;
  if (recoveredListPointer !== modelListStart) {
    failures.push(`category ${category} model-list pointer changed`);
  }
  return {
    category,
    modelListStart: hex(modelListStart),
    modelListLoadCall: listCall,
    modelTokens,
    mt5Tokens: modelTokens.filter((token) => /\.MT5$/i.test(token)),
    controlTokens: modelTokens.filter((token) => !/\.MT5$/i.test(token)),
    collectibleIdPoolStart: hex(idPoolStart),
    lookupValues: lookupValues.map((value) => hex(value)),
    nonzeroCollectibleIds: lookupValues
      .filter((value) => value !== 0)
      .map((value) => hex(value)),
    poolLength: prizePoolLengths[category],
    selectionSplitValue: prizeSelectionSplitTable[category],
  };
});
if (
  JSON.stringify(prizePoolLengths)
    !== JSON.stringify(prizeCategories.map(({ lookupValues }) => (
      lookupValues.length
    )))
) {
  failures.push("prize pool-length table no longer matches all ID pools");
}

const report = {
  schema: "new-yokosuka-d000-gacha-interaction-v1",
  status: failures.length === 0 ? "verified" : "failed",
  source: {
    mapinfo: path.relative(process.cwd(), mapinfoPath),
    dispatchCalls: path.relative(process.cwd(), dispatchPath),
    ram: path.relative(process.cwd(), ramPath),
  },
  staticDataFileOffset: `0x${staticBase.toString(16)}`,
  generatedTagTables: recoveredTagTables,
  machineRecords: recoveredRecords,
  populatedMachineRecords: populatedRecords,
  productionRegistry: DOBUITA_GACHA_MACHINES,
  nativeSetupCalls: {
    machineInstantiate: callAt(0x50a64, "0x0018"),
    machinePlace: callAt(0x50a82, "0x001d"),
    machineEnable: callAt(0x50a96, "0x001f"),
    machineSelector: callAt(0x50abe, "0x0024"),
    associateCapsuleBox: callAt(0x50aee, "0x0043"),
    capsuleBoxInstantiate: callAt(0x50b18, "0x0018"),
    capsuleBoxPlace: callAt(0x50b46, "0x001d"),
    capsuleBoxEnable: callAt(0x50b68, "0x001f"),
  },
  highDetailResourceFlow: {
    resourceName: mapinfo.toString("ascii", 0xacb13, 0xacb1a),
    interactionModels: models,
    loadCalls: [
      callAt(0x515da, "0x016d"),
      callAt(0x51686, "0x013c"),
      callAt(0x51776, "0x00ca"),
      callAt(0x51792, "0x013c"),
      callAt(0x517d6, "0x013c"),
    ],
  },
  operationHandlers,
  componentSelector: {
    componentFourCc: "CCOW",
    componentFieldOffset: 4,
    implementationAddress: "0x0c0a3aca",
    implementationSha256: sha256(ramRange(0x0c0a3aca, 0x3e)),
  },
  motion: {
    source: path.relative(process.cwd(), motionPath),
    ...hashFile(motionPath),
    sequence: "AKI_ASOBU_GATYA",
    frameCount: interactionSequence?.frameCount || null,
  },
  prizeLookup: {
    categoryCount: prizeCategories.length,
    categoryStateByteOffset: "global state +0x37c",
    modelListSelectorFunction: "0x4f978",
    collectibleIdLookupFunction: "0x4fe10",
    collectibleIdLookupArguments: [
      "category byte",
      "zero-based item-index byte",
    ],
    poolLengthTable: {
      fileOffset: "0xabd4c",
      values: prizePoolLengths,
      proof: (
        "each byte equals the exact count of uint16 lookup entries in "
        + "the corresponding 0x4fe10 branch"
      ),
    },
    selectionSplitTable: {
      fileOffset: "0xabd5c",
      values: prizeSelectionSplitTable,
      nativeConsumer: "0x57330",
      semanticLabel: null,
    },
    categories: prizeCategories,
    modelSelectionCalls: [
      callAt(0x508ae, "0x019d"),
      callAt(0x508e6, "0x019d"),
    ],
    physicalMachineToCategoryFlow: {
      activeObjectStateOffset: "global state +0x380",
      selectorRead: callAt(0x56ef2, "0x0024"),
      selectorReadSentinel: "0xffffffff",
      categoryStateLocalOffset: "r14 + 0x1c",
      resultPresentationCall: {
        callFileOffset: "0x57b3c",
        targetFunction: "0x50414",
        categoryArgumentSource: "r14 + 0x1c",
        itemIndexArgumentSource: "r14 + 0x20",
        orientationArgumentSource: "r14 + 0x24",
      },
      proof: (
        "operation 0x0024 reads the active machine's CCOW selector into "
        + "the category-state local; the result presenter later receives "
        + "that same local as its category argument"
      ),
    },
    paymentFlow: {
      currencySelector: 2,
      priceYen: 100,
      balanceRead: callAt(0x552a0, "0x005f"),
      subtractInstructionFileOffset: "0x552d8",
      balanceWrite: callAt(0x552e6, "0x0060"),
      proof: (
        "the native routine reads selector 2, subtracts immediate 100, "
        + "and writes the result to selector 2; selector 2 is independently "
        + "identified as currency by the vending affordability and "
        + "MONEY_LOCK paths"
      ),
    },
    collectionStateFlow: {
      selectedIdLookup: {
        callFileOffset: "0x56e46",
        targetFunction: "0x4fe10",
        categorySource: "global category state +0x37c",
        itemIndexSource: "r14 + 0x44",
      },
      mutationCall: callAt(0x56e82, "0x003d"),
      mutationOperationHex: "0x003d",
      mutationHandlerAddress: "0x0c163060",
      mutationEngineTargetMode0: "0x0c0e38b6",
      awardedQuantity: 1,
      ownershipQueryOperationHex: "0x003f",
      ownershipQueryHandlerAddress: "0x0c1630de",
      ownershipQueryEngineTargetMode0: "0x0c0e38be",
      ownershipQueryCalls: [
        callAt(0x55042, "0x003f"),
        callAt(0x573b2, "0x003f"),
        callAt(0x57556, "0x003f"),
      ],
      proof: (
        "the selected lookup value is passed to operation 0x003d with "
        + "quantity 1; its mode-0 handler target and the mode-0 0x003f "
        + "query target are paired collection-state routines eight bytes "
        + "apart"
      ),
    },
    randomSelectionPrimitives: {
      sharedRngAddress: "0x0c1ce210",
      uniformFloatMode16: {
        operationHex: "0x0009",
        handlerAddress: "0x0c17320c",
        implementationLength: 0x194,
        implementationSha256: sha256(ramRange(0x0c17320c, 0x194)),
        semantics: "shared RNG result multiplied by the supplied float",
        calls: [
          callAt(0x56f14, "0x0009"),
          callAt(0x573e2, "0x0009"),
          callAt(0x57586, "0x0009"),
        ],
      },
      boundedIntegerMode6: {
        operationHex: "0x004f",
        handlerAddress: "0x0c1733a0",
        implementationLength: 0xa6,
        implementationSha256: sha256(ramRange(0x0c1733a0, 0xa6)),
        semantics: (
          "truncate(shared RNG result multiplied by the supplied "
          + "exclusive upper bound)"
        ),
        calls: [
          0x56f70, 0x57240, 0x5729c, 0x572fc, 0x574a6,
          0x57632, 0x576aa, 0x57752, 0x578c2,
        ].map((offset) => callAt(offset, "0x004f")),
      },
      branchThresholds: [
        {
          comparisonFileOffset: "0x56f38",
          value: mapinfo.readFloatLE(0x56f50),
        },
        {
          comparisonFileOffset: "0x573f4",
          value: mapinfo.readFloatLE(0x57408),
        },
        {
          comparisonFileOffset: "0x57598",
          value: mapinfo.readFloatLE(0x575ac),
        },
      ],
    },
  },
  browserSemantics: (
    "the selected low-detail GCH body is replaced by its exact HI_GACH "
    + "model while the source-native M_GACH interaction plays; its owned "
    + "GBX component remains in place"
  ),
  unresolved: [
    "the exact category model lists and persistent collectible-ID pools are "
      + "recovered and the physical CCOW selector is traced into category "
      + "state; the native 100-yen debit is recovered, but random split "
      + "semantics, browser economy/collection state, and result presentation "
      + "are not yet implemented",
  ],
  failures,
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`${report.status}: ${path.relative(process.cwd(), outputPath)}`);
if (failures.length > 0) {
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
}
