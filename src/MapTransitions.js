import nativeMapTransitionData from "../play/data/native-map-transitions.json" with {
  type: "json",
};
import { timedAccessRuleForTransition } from "../play/world/TimedTransitionAccess.js";

function freezeNativeTransition(record) {
  const timedAccessRule = timedAccessRuleForTransition(record.id);
  return Object.freeze({
    ...record,
    source: Object.freeze({
      ...record.source,
      nativeDoorObject: record.source.nativeDoorObject
        ? Object.freeze({
          ...record.source.nativeDoorObject,
          position: Object.freeze([
            ...record.source.nativeDoorObject.position,
          ]),
          scale: Object.freeze([
            ...record.source.nativeDoorObject.scale,
          ]),
          controllerWords: Object.freeze([
            ...record.source.nativeDoorObject.controllerWords,
          ]),
          modelCandidates: Object.freeze([
            ...record.source.nativeDoorObject.modelCandidates,
          ]),
        })
        : undefined,
    }),
    destination: Object.freeze({
      ...record.destination,
      browserSpawn: record.destination.browserSpawn
        ? Object.freeze({
          position: Object.freeze([
            ...record.destination.browserSpawn.position,
          ]),
          yaw: record.destination.browserSpawn.yawRadians,
        })
        : null,
    }),
    evidence: Object.freeze({ ...record.evidence }),
    authorization: timedAccessRule
      ? Object.freeze({
        kind: "server-timed-transition",
        ruleId: timedAccessRule.id,
      })
      : undefined,
  });
}

// Dispatcher arguments and physical door selectors are distinct namespaces.
// Only the return-entry-to-physical-door associations bind storefront clicks.
// Clock presentation and script branch numbers must never override those routes.
const NATIVE_D000_MAP_TRANSITIONS = Object.freeze(
  nativeMapTransitionData.reverseMatchedD000Transitions
    .filter((record) => record.supported)
    .map(freezeNativeTransition),
);

const NATIVE_INTERIOR_RETURN_TRANSITIONS = Object.freeze(
  (nativeMapTransitionData.interiorReturnTransitions || [])
    .filter((record) => record.supported)
    .map(freezeNativeTransition),
);

const nativeInteriorReturnIds = new Set(
  NATIVE_INTERIOR_RETURN_TRANSITIONS.map((record) => record.id),
);
const NATIVE_OTHER_EXACT_DOOR_TRANSITIONS = Object.freeze(
  (nativeMapTransitionData.allExactDoorTransitions || [])
    .filter((record) => (
      record.supported && !nativeInteriorReturnIds.has(record.id)
    ))
    .map(freezeNativeTransition),
);

const SHENMUE1_ADDITIONAL_INTERIOR_ENTRANCES = Object.freeze([
  Object.freeze({
    id: "jd00-static-door-0-to-jabe-entry-0",
    source: Object.freeze({
      worldId: "sakuragaoka",
      scene: 1,
      area: "JD00",
      doorSelector: 0,
      model: "S1_JD00_DR15_024.MT5",
    }),
    destination: Object.freeze({
      worldId: "jabe",
      scene: 1,
      area: "JABE",
      entry: 0,
      browserSpawn: Object.freeze({
        position: Object.freeze([0.699999988079071, 0, 1.309999942779541]),
        yaw: 0,
      }),
    }),
    evidence: Object.freeze({
      sourcePlacement: "JD00 static door 0",
      reverseRouteId: "jabe-door-to-jd00-entry-3",
      association: "nearest exact return-entry doorway",
    }),
  }),
  Object.freeze({
    id: "mfsy-static-door-18-to-mkyu-entry-0",
    source: Object.freeze({
      worldId: "mfsy",
      scene: 2,
      area: "MFSY",
      doorSelector: 18,
      model: "S2_MFSY_DR02_021.MT5",
    }),
    destination: Object.freeze({
      worldId: "mkyu",
      scene: 2,
      area: "MKYU",
      entry: 0,
      browserSpawn: Object.freeze({
        position: Object.freeze([82.80000305175781, 0, 59]),
        yaw: Math.PI / 4,
      }),
    }),
    evidence: Object.freeze({
      sourcePlacement: "MFSY static door 18",
      reverseRouteId: "mkyu-dr02_001-to-mfsy-entry-19",
      association: "nearest exact return-entry doorway",
    }),
  }),
  Object.freeze({
    id: "mfsy-static-door-26-to-ms8s-entry-0",
    source: Object.freeze({
      worldId: "mfsy",
      scene: 2,
      area: "MFSY",
      doorSelector: 26,
      model: "S2_MFSY_DR02_021.MT5",
    }),
    destination: Object.freeze({
      worldId: "ms8s",
      scene: 2,
      area: "MS8S",
      entry: 0,
      browserSpawn: Object.freeze({
        position: Object.freeze([
          -17,
          4.275000095367432,
          152.24000549316406,
        ]),
        yaw: -0.5410520681182421,
      }),
    }),
    evidence: Object.freeze({
      sourcePlacement: "MFSY static door 26",
      reverseRouteId: "ms8s-ms8s_door-to-mfsy-entry-5",
      association: "matching warehouse doorway and exact return entry",
    }),
  }),
]);

const MAP_TRANSITIONS = Object.freeze([
  Object.freeze({
    id: "jomo-front-door-to-jhd0-entry-2",
    source: Object.freeze({
      worldId: "interior",
      scene: 1,
      area: "JOMO",
      objectTag: "dor0",
      model: "S1_JOMO_DR15_016.MT5",
    }),
    destination: Object.freeze({
      worldId: "exterior",
      scene: 1,
      area: "JHD0",
      entry: 2,
      browserSpawn: Object.freeze({
        position: Object.freeze([
          2.9900002479553223,
          0,
          1.090000033378601,
        ]),
        yaw: -0.22568692341767496,
      }),
    }),
    evidence: Object.freeze({
      operationId: 0x0030,
      callFileOffset: "0x4434a",
      runtimeCapture: "jomo-front-door-map-transition.json",
      entrySpawnCapture: "jhd0-entry-2-spawn.json",
    }),
  }),
  Object.freeze({
    id: "jhd0-house-door-to-jomo-entry-0",
    source: Object.freeze({
      worldId: "exterior",
      scene: 1,
      area: "JHD0",
      objectTag: "dor0",
      model: "S1_JHD0_DR15_016.MT5",
    }),
    destination: Object.freeze({
      worldId: "interior",
      scene: 1,
      area: "JOMO",
      entry: 0,
      browserSpawn: Object.freeze({
        position: Object.freeze([
          -14.71808910369873,
          0,
          5.410741806030273,
        ]),
        yaw: Math.PI,
      }),
    }),
    evidence: Object.freeze({
      callFileOffset: "0x397ee",
      destinationSource: "map-transition-catalog.json",
      spawnCapture: "captures/pvr/20260724-084308-frame-2346",
    }),
  }),
  Object.freeze({
    id: "jhd0-gate-to-ju00-entry-1",
    source: Object.freeze({
      worldId: "exterior",
      scene: 1,
      area: "JHD0",
      objectTag: "dor1",
      model: "S1_JHD0_DR29_000.MT5",
    }),
    destination: Object.freeze({
      worldId: "yamanose",
      scene: 1,
      area: "JU00",
      entry: 1,
      browserSpawn: Object.freeze({
        position: Object.freeze([
          51.98007583618164,
          7.74480676651001,
          99.62751007080078,
        ]),
        // The captured task yaw faces the residence gate. Native arrival
        // should face away from it, down into Yamanose.
        yaw: -2 * Math.PI / 3,
      }),
    }),
    evidence: Object.freeze({
      nativeDestinationArea: "JU00",
      nativeDestinationEntry: 1,
      nativeCallFileOffset: "0x39692",
      placementEvidence: "jhd0-exterior-door-placements.json",
      destinationEntryEvidence: "ju00-entry-1-runtime-capture.json",
    }),
  }),
  Object.freeze({
    id: "ju00-gate-to-jhd0-entry-1",
    source: Object.freeze({
      worldId: "yamanose",
      scene: 1,
      area: "JU00",
      objectTag: "dor0",
      model: "S1_JU00_DR29_000.MT5",
    }),
    destination: Object.freeze({
      worldId: "exterior",
      scene: 1,
      area: "JHD0",
      entry: 1,
      browserSpawn: Object.freeze({
        position: Object.freeze([1, 0, 9.9]),
        yaw: Math.PI,
      }),
    }),
    evidence: Object.freeze({
      nativeDispatch: "JU00 dynamic transition at 0x42a86",
      sourcePlacement: "JU00 static door index 18",
      destinationPlacement: "JHD0 gate doorway alignment",
    }),
  }),
  Object.freeze({
    id: "mksg-old-warehouse-8-to-ms08-entry-0",
    source: Object.freeze({
      worldId: "mksg",
      scene: 2,
      area: "MKSG",
      objectTag: "dor3",
      model: "S2_MKSG_DR02_021.MT5",
    }),
    destination: Object.freeze({
      worldId: "ms08",
      scene: 2,
      area: "MS08",
      entry: 0,
      browserSpawn: Object.freeze({
        position: Object.freeze([26.5, 0, -2.299999952316284]),
        yaw: 0.8727391949443528,
      }),
    }),
    evidence: Object.freeze({
      nativeCallFileOffset: "0x24402",
      destinationSource: "map-transition-catalog.json",
      destinationCapture: "captures/pvr/20260724-173621-frame-793",
      sourceDoorAssociation: "Old Warehouse District topology",
    }),
  }),
  Object.freeze({
    id: "mksg-compound-exit-to-mfsy-entry-1",
    source: Object.freeze({
      worldId: "mksg",
      scene: 2,
      area: "MKSG",
      objectTag: "dor8",
      model: "S2_MKSG_DR02_021.MT5",
    }),
    destination: Object.freeze({
      worldId: "mfsy",
      scene: 2,
      area: "MFSY",
      entry: 1,
      browserSpawn: Object.freeze({
        position: Object.freeze([118, 0, -12]),
        yaw: Math.PI / 2,
      }),
    }),
    evidence: Object.freeze({
      nativeCallFileOffset: "0x247d6",
      destinationSource: "map-transition-catalog.json",
      destinationCapture: "captures/pvr/20260724-173916-frame-967",
      sourceDoorAssociation: "Old Warehouse District compound topology",
    }),
  }),
  Object.freeze({
    id: "ms08-door-to-mksg-warehouse-8",
    source: Object.freeze({
      worldId: "ms08",
      scene: 2,
      area: "MS08",
      objectTag: "dor0",
      model: "S2_MS08_DR02_021.MT5",
    }),
    destination: Object.freeze({
      worldId: "mksg",
      scene: 2,
      area: "MKSG",
      entry: null,
      browserSpawn: Object.freeze({
        position: Object.freeze([24.2, 0, -61.69995880126953]),
        yaw: Math.PI / 2,
      }),
    }),
    evidence: Object.freeze({
      sourceDoorRecord: "MS08 MAPINFO offset 0x2b0bc",
      reverseDestination: "MKSG dor3 doorway exterior",
      note: "Browser reverse edge; MS08 exits through story dispatch rather than a literal local operation 0x0030",
    }),
  }),
  ...SHENMUE1_ADDITIONAL_INTERIOR_ENTRANCES,
  ...NATIVE_D000_MAP_TRANSITIONS,
  ...NATIVE_INTERIOR_RETURN_TRANSITIONS,
  ...NATIVE_OTHER_EXACT_DOOR_TRANSITIONS,
]);

const OBJECT_MAP_TRANSITIONS = Object.freeze([
  Object.freeze({
    id: "d000-bus-to-new-yokosuka-harbor",
    source: Object.freeze({
      worldId: "dobuita",
      scene: 1,
      area: "D000",
      objectTag: "BUS_",
      model: "S1_D000_BUSS530G.MT5",
      browserPosition: Object.freeze([-50.346893, 0, 5.975222]),
      interaction: "click",
    }),
    destination: Object.freeze({
      worldId: "mfsy",
      scene: 2,
      area: "MFSY",
      entry: null,
      browserSpawn: Object.freeze({
        position: Object.freeze([130.5, 0, 140.6]),
        yaw: Math.PI,
      }),
    }),
    evidence: Object.freeze({
      sourcePlacement: "play/data/d000-runtime-placements.json",
      destinationSource: "user-specified browser position",
    }),
  }),
]);

function normalized(value) {
  return typeof value === "string" ? value.toUpperCase() : null;
}

function normalizedNativeModel(value) {
  return normalized(value)?.replace(/^S\d+_[A-Z0-9]{4}_/, "") || null;
}

export function mapTransitionForDoor({
  worldId,
  objectTag,
  model,
  doorSelector,
}) {
  const normalizedTag = normalized(objectTag);
  const normalizedModel = normalized(model);
  return MAP_TRANSITIONS.find((transition) => (
    transition.source.worldId === worldId
    && (
      Number.isInteger(transition.source.doorSelector)
        ? transition.source.doorSelector === doorSelector
        : (
          normalized(transition.source.objectTag) === normalizedTag
          && (
            normalized(transition.source.model) === normalizedModel
            || normalizedNativeModel(transition.source.model)
              === normalizedNativeModel(model)
          )
        )
    )
  )) || null;
}

export function mapTransitionForObject({
  worldId,
  objectTag,
  model,
}) {
  const normalizedTag = normalized(objectTag);
  const normalizedModel = normalized(model);
  return OBJECT_MAP_TRANSITIONS.find((transition) => (
    transition.source.worldId === worldId
    && normalized(transition.source.objectTag) === normalizedTag
    && normalized(transition.source.model) === normalizedModel
  )) || null;
}

export function mapTransitionForNativeDestination({
  scene,
  area,
  entry,
}) {
  if (!Number.isInteger(scene) || !Number.isInteger(entry)) return null;
  const normalizedArea = normalized(area);
  if (!normalizedArea) return null;
  return MAP_TRANSITIONS.find((transition) => (
    transition.destination.scene === scene
    && normalized(transition.destination.area) === normalizedArea
    && transition.destination.entry === entry
  )) || null;
}

export { MAP_TRANSITIONS, OBJECT_MAP_TRANSITIONS };
