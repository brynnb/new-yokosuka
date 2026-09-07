import nativeInteractionManagerPack from "../data/events/nativeInteractionManagers.generated.json" with {
  type: "json",
};
import {
  createNativeInteractionManagerCatalog,
} from "./NativeInteractionManagerCatalog.js";
import {
  nativeFloat32Word,
} from "./NativeEventNumericRuntime.js";

const NATIVE_INTERACTION_MANAGERS = createNativeInteractionManagerCatalog(
  nativeInteractionManagerPack,
);

const D000_IDLE_NATIVE_FIELDS = Object.freeze([
  Object.freeze({ offset: 0x105, width: 1, value: 0 }),
  // The captured D000 idle state overrides the shared neutral initializer.
  Object.freeze({ offset: 0x0c20c3d4, width: 4, value: 1 }),
  Object.freeze({ offset: 0x0c225250, width: 1, value: 1 }),
  Object.freeze({ offset: 0x0c225251, width: 1, value: 1 }),
  Object.freeze({ offset: 0x0c29b130, width: 4, value: 1 }),
  Object.freeze({ offset: 0x0c29b134, width: 4, value: 0xffffffff }),
  Object.freeze({ offset: 0x0c224848, width: 4, value: 0 }),
  Object.freeze({ offset: 0x0c2247cc, width: 4, value: 0 }),
  Object.freeze({ offset: 0x0c2247c8, width: 4, value: 0 }),
]);

const PROFILES = Object.freeze({
  D000: Object.freeze({
    nativeFields: D000_IDLE_NATIVE_FIELDS,
    momtNumericGlobalDword: -1,
    taggedObjectControllerPairs: Object.freeze([
      Object.freeze(["YKUL", "YKUR"]),
    ]),
    operation0166ActorRecords: Object.freeze([
      Object.freeze({ actorTag: "SERA", list: "inactive" }),
      Object.freeze({ actorTag: "HARY", list: "inactive" }),
      Object.freeze({ actorTag: "JONZ", list: "inactive" }),
      Object.freeze({ actorTag: "TONY", list: "inactive" }),
      Object.freeze({ actorTag: "SMTH", list: "inactive" }),
    ]),
    evidence: "tools/evidence/live-d000-script-engine-baseline-emulator-evidence.json",
  }),
});

const CURRENT_EVENT_PROFILES = Object.freeze({
  "disc1-d000-phone-book-0x6a49c": Object.freeze({
    entryFunction: "0x6a49c",
    values: Object.freeze({
      word04: 1,
      word08: 0,
      word0a: 0,
      byte0c: 0,
      byte0d: 0,
      byte0e: 0,
      byte0f: 0,
      word12: 0x8080,
    }),
    evidence: "tools/evidence/live-d000-event-control-emulator-evidence.json",
  }),
});

export function applyNativeRoomScriptProfile(sceneState, area) {
  if (!sceneState || typeof sceneState.writeNativeField !== "function") {
    throw new TypeError("native room script gameplay state is required");
  }
  const key = String(area || "").toUpperCase();
  const profile = PROFILES[key];
  if (!profile) return { area: key, applied: false, evidence: null };
  for (const field of profile.nativeFields) {
    sceneState.writeNativeField(field);
  }
  sceneState.configureMomtNumericGlobalDword(
    profile.momtNumericGlobalDword,
  );
  sceneState.nativeOperation0166State.configureActorLifecycleRecords(
    profile.operation0166ActorRecords ?? [],
  );
  return {
    area: key,
    applied: true,
    evidence: profile.evidence,
    nativeFieldCount: profile.nativeFields.length,
  };
}

export function applyNativeCurrentEventProfile(sceneState, {
  program,
  route,
} = {}) {
  if (
    !sceneState
    || typeof sceneState.configureCurrentEventControlRecord !== "function"
  ) {
    throw new TypeError("native room script gameplay state is required");
  }
  const profile = CURRENT_EVENT_PROFILES[program?.id];
  if (!profile || route?.entryFunction !== profile.entryFunction) {
    return { applied: false, evidence: null };
  }
  sceneState.configureCurrentEventControlRecord(profile.values);
  return {
    applied: true,
    evidence: profile.evidence,
    programId: program.id,
    entryFunction: profile.entryFunction,
  };
}

export function applyNativeDirectEntryState(sceneState, {
  program,
  route,
} = {}) {
  if (!sceneState || typeof sceneState.writeNativeField !== "function") {
    throw new TypeError("native room script gameplay state is required");
  }
  const declaration = program?.directEntryState?.[route?.entryFunction];
  if (!declaration) {
    return { applied: false, evidence: [] };
  }
  for (const field of declaration.sceneFields) {
    sceneState.writeNativeField(field);
  }
  for (const object of declaration.objectBaseVectors || []) {
    sceneState.writeObjectVector(
      object.objectTag,
      object.vector.map(nativeFloat32Word),
    );
  }
  for (const object of declaration.operation001cObjects || []) {
    sceneState.configureNativeOperation001cObject(object);
  }
  return {
    applied: true,
    evidence: [...declaration.evidence],
    fieldCount: declaration.sceneFields.length,
    objectBaseVectorCount: declaration.objectBaseVectors?.length || 0,
    operation001cObjectCount: declaration.operation001cObjects?.length || 0,
    entryFunction: route.entryFunction,
  };
}

export function applyNativeInteractionManagerProfile(sceneState, program) {
  if (
    !sceneState
    || typeof sceneState.configureInteractionManager !== "function"
    || typeof sceneState.clearInteractionManager !== "function"
  ) {
    throw new TypeError("native room script gameplay state is required");
  }
  sceneState.clearInteractionManager();
  if (!program) return { applied: false, managerId: null };
  const manager = NATIVE_INTERACTION_MANAGERS.getBySource(program);
  if (!manager) {
    return { applied: false, managerId: null };
  }
  sceneState.configureInteractionManager(manager);
  return { applied: true, managerId: manager.id };
}

export function initializeNativeRoomTaggedObjectControllerPair(
  area,
  { firstObjectTag, secondObjectTag } = {},
) {
  const key = String(area || "").toUpperCase();
  const pair = PROFILES[key]?.taggedObjectControllerPairs?.find(
    ([first, second]) => (
      first === firstObjectTag && second === secondObjectTag
    ),
  );
  return pair ? 0 : -1;
}
