import {
  createNativeAssociatedRecordState,
} from "./NativeAssociatedRecordState.js";
import {
  createNativeActorLookPointState,
} from "./NativeActorLookPointRuntime.js";
import {
  createNativeActorXmptState,
} from "./NativeActorXmptRuntime.js";
import {
  createNativeActorControllerWordState,
} from "./NativeActorControllerWordRuntime.js";
import {
  createNativeActorFieldState,
} from "./NativeActorFieldRuntime.js";
import {
  createNativeActorMhndState,
} from "./NativeActorMhndRuntime.js";
import {
  createNativeActorOsagState,
} from "./NativeActorOsagRuntime.js";
import {
  createNativeIndexedRecordState,
} from "./NativeIndexedRecordRuntime.js";
import {
  createNativeHndlHndrRecordState,
} from "./NativeHndlHndrRecordRuntime.js";
import {
  createNativeGlobalControllerState,
} from "./NativeGlobalControllerRuntime.js";
import {
  createNativeEventControlRecordState,
} from "./NativeEventControlRecordRuntime.js";
import {
  createNativePrimaryRuntimeState,
} from "./NativePrimaryRuntimeState.js";
import {
  createNativeSceneObjectVectorState,
} from "./NativeSceneObjectRuntime.js";
import {
  createNativeScenePresentationMutationState,
} from "./NativeScenePresentationMutationState.js";
import {
  createNativeNumberedMapLayerState,
} from "./NativeNumberedMapLayerRuntime.js";
import {
  createNativeMapcRecordState,
} from "./NativeMapcRecordRuntime.js";
import {
  createNativeOperation013cState,
} from "./NativeOperation013cRuntime.js";
import {
  createNativeOperation0050State,
} from "./NativeOperation0050Runtime.js";
import {
  createNativeOperation013eState,
} from "./NativeOperation013eRuntime.js";
import {
  createNativeTransientSlotState,
} from "./NativeTransientSlotRuntime.js";
import {
  createNativeTmnmRecordState,
} from "./NativeTmnmRecordRuntime.js";
import {
  createNativeScrollSpriteControlState,
} from "./NativeScrollSpriteControlRuntime.js";
import {
  createNativeAreaRequestState,
} from "./NativeAreaRequestRuntime.js";
import {
  createNativeLightPresetState,
} from "./NativeLightPresetRuntime.js";
import {
  createNativeEnvironmentPresetState,
} from "./NativeEnvironmentPresetRuntime.js";
import {
  createNativeSceneOwnerFlagsState,
} from "./NativeSceneOwnerFlagsRuntime.js";
import {
  createNativeControllerInputState,
} from "./NativeControllerInputRuntime.js";
import {
  createNativeSecondaryMotionControlState,
} from "./NativeSecondaryMotionControlRuntime.js";
import {
  createNativeOsagParameterState,
} from "./NativeOsagParameterRuntime.js";
import {
  createNativeFaceControllerState,
} from "./NativeFaceControllerRuntime.js";
import {
  createNativeFaceClipControlState,
} from "./NativeFaceClipControlRuntime.js";
import {
  createNativeOperation0166State,
} from "./NativeOperation0166Runtime.js";
import {
  createNativeOperation0120State,
} from "./NativeOperation0120Runtime.js";
import {
  createNativeOperation001cState,
} from "./NativeOperation001cRuntime.js";
import {
  createNativeOperation008fState,
} from "./NativeOperation008fRuntime.js";
import {
  createNativeObjectImgmSelectionState,
} from "./NativeObjectImgmSelectionRuntime.js";
import {
  createNativeMomtVectorSlotState,
} from "./NativeMomtVectorSlotRuntime.js";
import {
  createNativeOperation019fState,
} from "./NativeOperation019fRuntime.js";
import {
  createNativeObjectDword5cState,
} from "./NativeObjectDword5cRuntime.js";
import {
  createNativeTaggedObjectActionState,
  createNativeTaggedObjectControllerState,
} from "./NativeTaggedObjectActionRuntime.js";
import {
  reconcileNativeSoundBankSlots,
} from "./NativeSoundBankRuntime.js";
import {
  createNativeInteractionManagerState,
} from "./NativeInteractionManagerState.js";
import {
  createNativeProceduralModelControllerState,
} from "./NativeProceduralModelControllerRuntime.js";
import {
  createNativeCameraShakeState,
} from "./NativeCameraShakeRuntime.js";

function requireFourcc(value) {
  const fourcc = String(value || "");
  if (fourcc.length !== 4) {
    throw new TypeError("native scene object requires a four-character ID");
  }
  for (const character of fourcc) {
    if (character.codePointAt(0) > 0xff) {
      throw new TypeError("native scene object ID must be byte-oriented");
    }
  }
  return fourcc;
}

function requireByte(value) {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) {
    throw new RangeError("native global state must be a byte");
  }
  return value;
}

function requireFieldDescriptor({ offset, width }) {
  if (!Number.isSafeInteger(offset) || offset < 0) {
    throw new RangeError("native scene field offset must be non-negative");
  }
  if (![1, 2, 4].includes(width)) {
    throw new RangeError("native scene field width must be 1, 2, or 4");
  }
  return { offset, width };
}

function signed32(value) {
  return value >> 0;
}

function cloneStateValue(value, seen = new Map()) {
  if (
    value === null
    || typeof value !== "object"
  ) {
    return value;
  }
  if (seen.has(value)) return seen.get(value);
  if (Array.isArray(value)) {
    const copy = [];
    seen.set(value, copy);
    for (const item of value) copy.push(cloneStateValue(item, seen));
    return copy;
  }
  if (value instanceof Map) {
    const copy = new Map();
    seen.set(value, copy);
    for (const [key, item] of value) {
      copy.set(cloneStateValue(key, seen), cloneStateValue(item, seen));
    }
    return copy;
  }
  if (value instanceof Set) {
    const copy = new Set();
    seen.set(value, copy);
    for (const item of value) copy.add(cloneStateValue(item, seen));
    return copy;
  }
  if (ArrayBuffer.isView(value)) {
    const copy = value.slice();
    seen.set(value, copy);
    return copy;
  }
  const copy = Object.create(Object.getPrototypeOf(value));
  seen.set(value, copy);
  for (const key of Reflect.ownKeys(value)) {
    copy[key] = cloneStateValue(value[key], seen);
  }
  return copy;
}

export class NativeSceneGameplayState {
  constructor() {
    this.clear();
  }

  clear() {
    this.globalByte = 0;
    this.currentPresentationOwner = null;
    this.objectRuntimeFlags = new Map();
    this.objectPresentationFlags = new Map();
    this.taggedObjectActions = createNativeTaggedObjectActionState();
    this.taggedObjectController = createNativeTaggedObjectControllerState();
    this.objectActivationWords = new Map();
    this.objectVectorState = createNativeSceneObjectVectorState();
    this.presentationMutationState =
      createNativeScenePresentationMutationState();
    this.nativeNumberedMapLayerState = createNativeNumberedMapLayerState();
    this.mapcRecords = createNativeMapcRecordState();
    this.nativeOperation013cState = createNativeOperation013cState();
    this.nativeOperation013eState = createNativeOperation013eState();
    this.nativeTransientSlotState = createNativeTransientSlotState();
    this.nativeOperation0050State = createNativeOperation0050State();
    this.tmnmRecords = createNativeTmnmRecordState();
    this.scrollSpriteControlState = createNativeScrollSpriteControlState();
    this.nativeAreaRequestState = createNativeAreaRequestState();
    this.nativeLightPresetState = createNativeLightPresetState();
    this.nativeEnvironmentPresetState = createNativeEnvironmentPresetState();
    this.nativeSceneOwnerFlagsState = createNativeSceneOwnerFlagsState();
    this.nativeControllerInputState = createNativeControllerInputState();
    this.nativeSecondaryMotionControlState =
      createNativeSecondaryMotionControlState();
    this.nativeOsagParameterState = createNativeOsagParameterState();
    this.faceControllerState = createNativeFaceControllerState();
    this.faceClipControl = createNativeFaceClipControlState();
    this.nativeOperation0166State = createNativeOperation0166State();
    this.nativeProceduralModelControllerState =
      createNativeProceduralModelControllerState();
    this.nativeCameraShakeState = createNativeCameraShakeState();
    this.nativeOperation0166Mode28GlobalDword = undefined;
    this.nativeOperation0120State = createNativeOperation0120State();
    this.nativeOperation001cState = createNativeOperation001cState();
    this.nativeOperation008fState = createNativeOperation008fState();
    this.nativeObjectImgmSelectionState =
      createNativeObjectImgmSelectionState();
    this.nativeMomtVectorSlotState = createNativeMomtVectorSlotState();
    this.nativeOperation019fState = createNativeOperation019fState();
    this.nativeOperation0199ControlDword = undefined;
    this.nativeOperation0199StatusByte = undefined;
    this.nativeOperation0174GlobalDword = undefined;
    this.nativeOperation01bdGlobalDword = undefined;
    this.nativeOperation014fGlobalFloatWord = undefined;
    this.nativeOperation0052Table = new Map();
    this.nativeObjectDword5cState = createNativeObjectDword5cState();
    this.actorLookPoints = createNativeActorLookPointState();
    this.actorXmpt = createNativeActorXmptState();
    this.actorControllerWords = createNativeActorControllerWordState();
    this.actorFields = createNativeActorFieldState();
    this.actorMhndControllers = createNativeActorMhndState();
    this.actorOsagState = createNativeActorOsagState();
    this.associatedRecords = createNativeAssociatedRecordState();
    this.momtNumericGlobalDword = undefined;
    this.indexedRecords = createNativeIndexedRecordState();
    this.hndlHndrRecords = createNativeHndlHndrRecordState();
    this.interactionContextWord56 = undefined;
    this.interactionRecords = new Map();
    this.interactionManager = createNativeInteractionManagerState();
    this.namedResources = new Set();
    this.soundBankSlots = Array(8).fill(null);
    this.sceneEightChannelTransition = undefined;
    this.nativeFields = new Map();
    this.globalController = createNativeGlobalControllerState({
      readField: descriptor => this.readNativeField(descriptor),
      writeField: descriptor => this.writeNativeField(descriptor),
    });
    this.eventControlRecord = createNativeEventControlRecordState();
    this.primaryRuntime = createNativePrimaryRuntimeState();
  }

  snapshot() {
    return cloneStateValue(this);
  }

  restore(snapshot) {
    if (!(snapshot instanceof NativeSceneGameplayState)) {
      throw new TypeError("native scene gameplay snapshot is required");
    }
    for (const key of Reflect.ownKeys(this)) delete this[key];
    for (const key of Reflect.ownKeys(snapshot)) {
      this[key] = cloneStateValue(snapshot[key]);
    }
    return this;
  }

  readGlobalByte() {
    return this.globalByte;
  }

  writeGlobalByte(value) {
    this.globalByte = requireByte(value);
  }

  installCurrentPresentationOwner(owner) {
    if (
      owner !== null
      && typeof owner !== "string"
      && !Number.isInteger(owner)
    ) {
      throw new TypeError(
        "native current presentation owner must be a stable string, integer, or null",
      );
    }
    const previous = this.currentPresentationOwner;
    this.currentPresentationOwner = owner;
    return previous;
  }

  readCurrentPresentationOwner() {
    return this.currentPresentationOwner;
  }

  readObjectRuntimeFlag(objectTag) {
    return this.objectRuntimeFlags.get(requireFourcc(objectTag)) ?? false;
  }

  writeObjectRuntimeFlag(objectTag, enabled) {
    const key = requireFourcc(objectTag);
    if (typeof enabled !== "boolean") {
      throw new TypeError("native object runtime flag must be boolean");
    }
    if (enabled) this.objectRuntimeFlags.set(key, true);
    else this.objectRuntimeFlags.delete(key);
    this.presentationMutationState.record({
      kind: "object-runtime-flag",
      objectTag: key,
      enabled,
    });
  }

  readObjectPresentationFlag(objectTag) {
    return this.objectPresentationFlags.get(requireFourcc(objectTag)) ?? false;
  }

  writeObjectPresentationFlag(objectTag, enabled) {
    const key = requireFourcc(objectTag);
    if (typeof enabled !== "boolean") {
      throw new TypeError("native object presentation flag must be boolean");
    }
    if (enabled) this.objectPresentationFlags.set(key, true);
    else this.objectPresentationFlags.delete(key);
    this.presentationMutationState.record({
      kind: "object-presentation-flag",
      objectTag: key,
      enabled,
    });
  }

  readObjectActivationWord(objectTag) {
    return this.objectActivationWords.get(requireFourcc(objectTag));
  }

  writeObjectVector(objectTag, vector, { associated = false } = {}) {
    const words = this.objectVectorState.writeObjectVector(
      objectTag,
      vector,
      { associated },
    );
    this.presentationMutationState.record({
      kind: "object-position-vector",
      objectTag,
      associated,
      words,
    });
    return words;
  }

  readObjectVector(objectTag, { associated = false } = {}) {
    return this.objectVectorState.readObjectVector(
      objectTag,
      { associated },
    );
  }

  writeObjectSecondaryVector(objectTag, vector, { associated = false } = {}) {
    const words = this.objectVectorState.writeObjectSecondaryVector(
      objectTag,
      vector,
      { associated },
    );
    this.presentationMutationState.record({
      kind: "object-secondary-vector",
      objectTag,
      associated,
      words,
    });
    return words;
  }

  readObjectSecondaryVector(objectTag, { associated = false } = {}) {
    return this.objectVectorState.readObjectSecondaryVector(
      objectTag,
      { associated },
    );
  }

  writeObjectScaleVector(objectTag, vector) {
    const words = this.objectVectorState.writeObjectScaleVector(
      objectTag,
      vector,
    );
    this.presentationMutationState.record({
      kind: "object-scale-vector",
      objectTag,
      words,
    });
    return words;
  }

  readObjectScaleVector(objectTag) {
    return this.objectVectorState.readObjectScaleVector(objectTag);
  }

  writeObjectImgmSelection(objectTag, selection) {
    const mutation = this.nativeObjectImgmSelectionState.write(
      objectTag,
      selection,
    );
    this.presentationMutationState.record({
      kind: "object-imgm-selection",
      objectTag,
      selection: mutation.selection,
    });
    return mutation;
  }

  readObjectImgmSelection(objectTag) {
    return this.nativeObjectImgmSelectionState.read(objectTag);
  }

  configureNativeMomtVectorSlotObject(detail) {
    return this.nativeMomtVectorSlotState.configureObject(detail);
  }

  readNativeMomtVectorSlot(objectTag, slot) {
    return this.nativeMomtVectorSlotState.readSlot(objectTag, slot);
  }

  planNativeMomtVectorSlotWrite(detail) {
    return this.nativeMomtVectorSlotState.planWrite(detail);
  }

  commitNativeMomtVectorSlotWrite(plan, sourceWords, storedWords) {
    return this.nativeMomtVectorSlotState.commit(
      plan,
      sourceWords,
      storedWords,
    );
  }

  writeNativeObjectVectorComponent(detail) {
    const mutation = this.objectVectorState.writeObjectVectorComponent(detail);
    if (mutation) {
      this.presentationMutationState.record({
        kind: "object-position-vector",
        objectTag: detail.objectTag,
        associated: Boolean(detail.associated),
        words: mutation.vector,
      });
    }
    return mutation;
  }

  initializeObjectVector({ objectTag, flags, vector }) {
    const key = requireFourcc(objectTag);
    const next = this.objectVectorState.initializeObjectVector({
      objectTag: key,
      flags,
      vector,
    });
    this.objectActivationWords.set(key, 1);
    this.presentationMutationState.record({
      kind: "object-position-vector",
      objectTag: key,
      associated: Boolean((flags >>> 0) & 0x40000000),
      words: next,
    });
    return [...next];
  }

  applyObjectVectorOperation(detail) {
    const next = this.objectVectorState.applyObjectVectorOperation(detail);
    this.presentationMutationState.record({
      kind: "object-secondary-vector",
      objectTag: detail.objectTag,
      associated: Boolean((detail.flags >>> 0) & 0x40000000),
      words: next,
    });
    return next;
  }

  presentationRevision() {
    return this.presentationMutationState.currentRevision();
  }

  readPresentationMutations(afterRevision = 0) {
    return this.presentationMutationState.readAfter(afterRevision);
  }

  readNativeNumberedMapLayerState(layer) {
    return this.nativeNumberedMapLayerState.read(layer);
  }

  readObjectBaseVector({ objectTag, associated = false }) {
    return this.objectVectorState.readObjectBaseVector({
      objectTag,
      associated,
    });
  }

  configureActorLookPointState(detail) {
    return this.actorLookPoints.configureActor(detail);
  }

  configureActorControllerWordState(detail) {
    return this.actorControllerWords.configureActor(detail);
  }

  planActorControllerWordWrite(detail) {
    return this.actorControllerWords.planWordWrite(detail);
  }

  commitActorControllerWordWrite(plan) {
    return this.actorControllerWords.commitWordWrite(plan);
  }

  applyActorControllerModeControl(detail) {
    return this.actorControllerWords.applyModeControl(detail);
  }

  readActorControllerWordState(actorTag) {
    return this.actorControllerWords.readActor(actorTag);
  }

  applyActorLookPointOptimizedUpdate(detail) {
    return this.actorLookPoints.applyOptimizedUpdate(detail);
  }

  applyActorLookPointControl(detail) {
    return this.actorLookPoints.applyControl(detail);
  }

  readActorLookPointState(actorTag) {
    return this.actorLookPoints.readActor(actorTag);
  }

  requestActorXmpt(detail) {
    return this.actorXmpt.request(detail);
  }

  readActorXmptState(actorTag) {
    return this.actorXmpt.read(actorTag);
  }

  readActorXmptStateZero(actorTag) {
    return this.actorXmpt.stateZeroQuery(actorTag);
  }

  readActorXmptSelectorActive(actorTag, selector) {
    return this.actorXmpt.selectorActiveQuery(actorTag, selector);
  }

  updateActorXmpt(actorTag, controller) {
    return this.actorXmpt.updateActor(actorTag, controller);
  }

  configureActorMhndState(detail) {
    return this.actorMhndControllers.configureActor(detail);
  }

  configureActorFieldState(detail) {
    return this.actorFields.configureActor(detail);
  }

  accessActorDword7c(detail) {
    return this.actorFields.accessDword7c(detail);
  }

  configureObjectFieldGlobalFallback(detail) {
    return this.actorFields.configureGlobalFallback(detail);
  }

  accessObjectB8Bc(detail) {
    return this.actorFields.accessB8Bc(detail);
  }

  readActorFieldState(actorTag) {
    return this.actorFields.readActor(actorTag);
  }

  readObjectFieldGlobalFallback() {
    return this.actorFields.readGlobalFallback();
  }

  applyActorMhndControllerRequest(detail) {
    return this.actorMhndControllers.applyRequest(detail);
  }

  readActorMhndState(actorTag) {
    return this.actorMhndControllers.readActor(actorTag);
  }

  configureActorOsagState(detail) {
    return this.actorOsagState.configureActor(detail);
  }

  applyActorOsagNodeAndFlagSet(detail) {
    return this.actorOsagState.applyNodeAndFlagSet(detail);
  }

  writeActorControllerFlagBit3(detail) {
    return this.actorOsagState.writeControllerFlagBit3(detail);
  }

  readActorOsagState(actorTag) {
    return this.actorOsagState.readActor(actorTag);
  }

  configureActorFaceClipControl(detail) {
    return this.faceClipControl.configureActor(detail);
  }

  planActorFaceClipControl(detail) {
    return this.faceClipControl.planControl(detail);
  }

  commitActorFaceClipControl(plan) {
    return this.faceClipControl.commitControl(plan);
  }

  readActorFaceClipControl(actorTag) {
    return this.faceClipControl.readActor(actorTag);
  }

  configurePrimaryRuntimeState(detail) {
    return this.primaryRuntime.configure(detail);
  }

  initializeRoomRuntimeState() {
    // Process-wide event-runtime word owned by native operation 0x0195. Zero
    // is the neutral pre-event value; the operation preserves unrelated bits.
    if (this.readNativeField({ offset: 0x0c20c3d4, width: 4 }) === undefined) {
      this.writeNativeField({ offset: 0x0c20c3d4, width: 4, value: 0 });
    }
    if (this.readNativeField({ offset: 0x0c201c40, width: 1 }) === undefined) {
      this.writeNativeField({ offset: 0x0c201c40, width: 1, value: 0 });
    }
    if (this.readNativeField({ offset: 0x0c22476b, width: 1 }) === undefined) {
      this.writeNativeField({ offset: 0x0c22476b, width: 1, value: 0 });
    }
    if (this.primaryRuntime.read() === undefined) {
      this.primaryRuntime.configure({
        available: true,
        currentEventPresent: false,
        gateByte: 0,
        stateDword1f8: 1,
        stateDword20: 0,
        statusByte1d9: 0,
        globalByteB02: 0,
      });
    }
    if (this.nativeOperation0120State.readRecords() === undefined) {
      this.nativeOperation0120State.configureRecords(
        Array.from({ length: 32 }, () => ({ word00: 0, word08: 0 })),
      );
    }
    if (this.nativeOperation0120State.readModeTwoRecords() === undefined) {
      this.nativeOperation0120State.configureModeTwoRecords(
        Array.from({ length: 32 }, () => ({ word34: 0 })),
      );
    }
    const control = this.nativeOperation0166State.readControl();
    if (
      control.modeTwoControlDword === undefined
      && control.modeEightControlDword === undefined
      && control.modeTwoCleanupRequired === undefined
    ) {
      this.nativeOperation0166State.configureControl({
        modeTwoControlDword: 1,
        modeEightControlDword: 1,
        modeTwoCleanupRequired: false,
      });
    }
    if (
      this.nativeOperation0166State.readCleanupLists() === undefined
    ) {
      this.nativeOperation0166State.configureCleanupLists();
    }
    this.nativeOperation013cState.configurePlatformActivity(false);
    return {
      primaryRuntime: this.readPrimaryRuntimeState(),
      operation0166: this.nativeOperation0166State.readControl(),
      operation013cPlatformActivity:
        this.nativeOperation013cState.queryPlatformActivity(),
    };
  }

  beginPrimaryRuntimeEvent() {
    return this.primaryRuntime.setCurrentEventPresent(true);
  }

  endPrimaryRuntimeEvent() {
    return this.primaryRuntime.setCurrentEventPresent(false);
  }

  planPrimaryRuntimeTransition(mode) {
    return this.primaryRuntime.planTransition(mode);
  }

  commitPrimaryRuntimeTransition(plan) {
    return this.primaryRuntime.commitTransition(plan);
  }

  invokePrimaryRuntimeTransition(argument) {
    return this.primaryRuntime.invokeTransitionCallback(argument);
  }

  readPrimaryRuntimeTransitionCallback() {
    return this.primaryRuntime.readTransitionCallback();
  }

  queryPrimaryRuntimeStateOne() {
    return this.primaryRuntime.queryStateOne();
  }

  queryPrimaryRuntimeStatusByte() {
    return this.primaryRuntime.queryStatusByte();
  }

  readPrimaryRuntimeState() {
    return this.primaryRuntime.read();
  }

  configureObjectMotmRecord(detail) {
    return this.objectVectorState.configureObjectMotmRecord(detail);
  }

  readObjectMotmComponentVector(detail) {
    return this.objectVectorState.readObjectMotmComponentVector(detail);
  }

  configureObjectDirectPointTransform(detail) {
    return this.objectVectorState.configureObjectDirectPointTransform(detail);
  }

  transformObjectPointToDirectSpace(detail) {
    return this.objectVectorState.transformObjectPointToDirectSpace(detail);
  }

  writeObjectFaceRecordRequest(detail) {
    return this.associatedRecords.writeFaceRequest(detail);
  }

  readObjectFaceRecordRequest(objectTag) {
    return this.associatedRecords.readFaceRequest(objectTag);
  }

  configureObjectFaceParameterGuards(detail) {
    return this.associatedRecords.configureFaceParameterGuards(detail);
  }

  applyObjectFaceParameterRequest(detail) {
    return this.associatedRecords.applyFaceParameterRequest(detail);
  }

  readObjectFaceParameterState(objectTag) {
    return this.associatedRecords.readFaceParameterState(objectTag);
  }

  configureActorMomtFloatPairState(detail) {
    return this.associatedRecords.configureMomtFloatPair(detail);
  }

  configureActorMomtFlagState(detail) {
    return this.associatedRecords.configureMomtFlags(detail);
  }

  applyActorMomtFlagBitZero(detail) {
    return this.associatedRecords.applyMomtFlagBitZero(detail);
  }

  readActorMomtFlagState(objectTag) {
    return this.associatedRecords.readMomtFlags(objectTag);
  }

  planActorMomtFloatPairWrite(detail) {
    return this.associatedRecords.planMomtFloatPairWrite(detail);
  }

  commitActorMomtFloatPairWrite(plan) {
    return this.associatedRecords.commitMomtFloatPairWrite(plan);
  }

  readActorMomtFloatPairState(objectTag) {
    return this.associatedRecords.readMomtFloatPair(objectTag);
  }

  configureActorMomtByte6fState(detail) {
    return this.associatedRecords.configureMomtByte6f(detail);
  }

  applyActorMomtMask(detail) {
    return this.associatedRecords.applyMomtMask(detail);
  }

  accessActorMomtByte6f(detail) {
    return this.associatedRecords.accessMomtByte6f(detail);
  }

  readActorMomtByte6fState(objectTag) {
    return this.associatedRecords.readMomtByte6f(objectTag);
  }

  configureActorMomtNumericQueryState(detail) {
    return this.associatedRecords.configureMomtNumericQuery(detail);
  }

  planActorMomtNumericQuery(detail) {
    return this.associatedRecords.planMomtNumericQuery(detail);
  }

  readActorMomtNumericQueryState(objectTag) {
    return this.associatedRecords.readMomtNumericQuery(objectTag);
  }

  configureActorMomtScaledOffsetState(detail) {
    return this.associatedRecords.configureMomtScaledOffset(detail);
  }

  planActorMomtScaledOffset(detail) {
    return this.associatedRecords.planMomtScaledOffset(detail);
  }

  commitActorMomtScaledOffset(detail) {
    return this.associatedRecords.commitMomtScaledOffset(detail);
  }

  readActorMomtScaledOffsetState(objectTag) {
    return this.associatedRecords.readMomtScaledOffset(objectTag);
  }

  configureMomtNumericGlobalDword(value) {
    if (!Number.isInteger(value)) {
      throw new TypeError("native MOMT numeric global dword must be an integer");
    }
    this.momtNumericGlobalDword = value | 0;
  }

  readMomtNumericGlobalDword() {
    return this.momtNumericGlobalDword;
  }

  configureObjectCcowRecord(detail) {
    return this.associatedRecords.configureCcowRecord(detail);
  }

  applyObjectCcowMaskControl(detail) {
    return this.associatedRecords.applyCcowMaskControl(detail);
  }

  readObjectCcowRecord(objectTag) {
    return this.associatedRecords.readCcowRecord(objectTag);
  }

  configureObjectRefbRecord(detail) {
    return this.associatedRecords.configureRefbRecord(detail);
  }

  applyObjectRefbValueWrite(detail) {
    return this.associatedRecords.applyRefbValueWrite(detail);
  }

  applyObjectRefbControlInstall(detail) {
    return this.associatedRecords.applyRefbControlInstall(detail);
  }

  planObjectRefbVectorWrite(detail) {
    return this.associatedRecords.planRefbVectorWrite(detail);
  }

  commitObjectRefbVectorWrite(detail) {
    return this.associatedRecords.commitRefbVectorWrite(detail);
  }

  readObjectRefbRecord(objectTag) {
    return this.associatedRecords.readRefbRecord(objectTag);
  }

  configureObjectFixoRecord(detail) {
    return this.associatedRecords.configureFixoRecord(detail);
  }

  configureFixoAttachmentTarget(detail) {
    return this.associatedRecords.configureFixoAttachmentTarget(detail);
  }

  installObjectFixoAttachment(detail) {
    return this.associatedRecords.installFixoAttachment(detail);
  }

  resetObjectFixoRecord(detail) {
    return this.associatedRecords.resetFixoRecord(detail);
  }

  readObjectFixoRecord(objectTag) {
    return this.associatedRecords.readFixoRecord(objectTag);
  }

  configureObjectFigpRecord(detail) {
    return this.associatedRecords.configureFigpRecord(detail);
  }

  applyActorFigpByte10(detail) {
    return this.associatedRecords.applyFigpByte10(detail);
  }

  applyObjectFigpBytePair(detail) {
    return this.associatedRecords.applyFigpBytePair(detail);
  }

  readObjectFigpRecord(objectTag) {
    return this.associatedRecords.readFigpRecord(objectTag);
  }

  configureObjectTelmRecord(detail) {
    return this.associatedRecords.configureTelmRecord(detail);
  }

  applyObjectTelmControl(detail) {
    return this.associatedRecords.applyTelmControl(detail);
  }

  readObjectTelmRecord(objectTag) {
    return this.associatedRecords.readTelmRecord(objectTag);
  }

  configureObjectMapcRecord(detail) {
    return this.mapcRecords.configure(detail);
  }

  applyObjectMapcControl(detail) {
    return this.mapcRecords.apply(detail);
  }

  readObjectMapcRecord(objectTag) {
    return this.mapcRecords.read(objectTag);
  }

  configureNativeOperation013cRecord(detail) {
    return this.nativeOperation013cState.configureRecord(detail);
  }

  configureNativeOperation013cContainer(detail) {
    return this.nativeOperation013cState.configureContainerRecords(detail);
  }

  readNativeOperation013cContainer() {
    return this.nativeOperation013cState.readContainer();
  }

  configureNativeSecondaryMotionActor(detail) {
    return this.nativeSecondaryMotionControlState.configureActor(detail);
  }

  readNativeSecondaryMotionActor(actorTag) {
    return this.nativeSecondaryMotionControlState.readActor(actorTag);
  }

  readNativeSecondaryMotionGlobalFloat(mode) {
    return this.nativeSecondaryMotionControlState.readGlobalFloat(mode);
  }

  configureObjectOsagParameterRecord(detail) {
    return this.nativeOsagParameterState.configureRecord(detail);
  }

  readObjectOsagParameterRecord(objectTag) {
    return this.nativeOsagParameterState.read(objectTag);
  }

  prepareNativeOperation013eBindings(program) {
    return this.nativeOperation013eState.prepareProgramBindings(program);
  }

  installNativeEmbeddedAuthBinding(detail) {
    return this.nativeOperation013eState.installEmbedded(detail);
  }

  uninstallNativeEmbeddedAuthBinding(detail) {
    return this.nativeOperation013eState.uninstallEmbedded(detail);
  }

  readNativeOperation013eSlot(slot) {
    return this.nativeOperation013eState.read(slot);
  }

  advanceNativeOperation0050Activity() {
    return this.nativeOperation0050State.advance();
  }

  readNativeOperation0050Activity() {
    return this.nativeOperation0050State.read();
  }

  configureNativeOperation0120Records(records) {
    return this.nativeOperation0120State.configureRecords(records);
  }

  readNativeOperation0120Records() {
    return this.nativeOperation0120State.readRecords();
  }

  configureNativeOperation0120ModeTwoRecords(records) {
    return this.nativeOperation0120State.configureModeTwoRecords(records);
  }

  readNativeOperation0120ModeTwoRecords() {
    return this.nativeOperation0120State.readModeTwoRecords();
  }

  configureNativeOperation001cObject(detail) {
    return this.nativeOperation001cState.configureObject(detail);
  }

  configureNativeOperation001cOutput(pointer, words) {
    return this.nativeOperation001cState.configureOutput(pointer, words);
  }

  readNativeOperation001cOutput(pointer) {
    return this.nativeOperation001cState.readOutput(pointer);
  }

  configureNativeOperation008fObject(detail) {
    return this.nativeOperation008fState.configureObject(detail);
  }

  configureNativeOperation019fActor(detail) {
    return this.nativeOperation019fState.configureActor(detail);
  }

  readNativeOperation019fActor(actorTag) {
    return this.nativeOperation019fState.readActor(actorTag);
  }

  configureNativeObjectDword5c(detail) {
    return this.nativeObjectDword5cState.configureObject(detail);
  }

  readNativeObjectDword5c(objectTag) {
    return this.nativeObjectDword5cState.readObject(objectTag);
  }

  configureObjectTmnmRecord(detail) {
    return this.tmnmRecords.configure(detail);
  }

  readObjectTmnmRecord(objectTag) {
    return this.tmnmRecords.read(objectTag);
  }

  configureActorFaceController(detail) {
    return this.faceControllerState.configureActor(detail);
  }

  readActorFaceController(actorTag) {
    return this.faceControllerState.readActor(actorTag);
  }

  configureIndexedCallbackRecord(detail) {
    return this.indexedRecords.configureCallbackRecord(detail);
  }

  applyIndexedBinaryRecordWrite(detail) {
    return this.indexedRecords.applyBinaryWrite(detail);
  }

  configureIndexedControllerRecord(detail) {
    return this.indexedRecords.configureControllerRecord(detail);
  }

  applyIndexedControllerWrite(detail) {
    return this.indexedRecords.applyControllerWrite(detail);
  }

  planIndexedControllerReset(mode) {
    return this.indexedRecords.planControllerReset(mode);
  }

  commitIndexedControllerReset(plan) {
    return this.indexedRecords.commitControllerReset(plan);
  }

  planIndexedControllerFloat4Write(words) {
    return this.indexedRecords.planControllerFloat4Write(words);
  }

  commitIndexedControllerFloat4Write(plan) {
    return this.indexedRecords.commitControllerFloat4Write(plan);
  }

  planIndexedControllerInitialize(detail) {
    return this.indexedRecords.planControllerInitialize(detail);
  }

  commitIndexedControllerInitialize(plan) {
    return this.indexedRecords.commitControllerInitialize(plan);
  }

  readIndexedControllerRecord(index) {
    return this.indexedRecords.readControllerRecord(index);
  }

  readIndexedControllerSubsystem() {
    return this.indexedRecords.readControllerSubsystem();
  }

  readIndexedRecord(index) {
    return this.indexedRecords.readRecord(index);
  }

  readIndexedRecordBitfields() {
    return this.indexedRecords.readBitfields();
  }

  configureObjectHndlHndrRecord(detail) {
    return this.hndlHndrRecords.configureRecord(detail);
  }

  planObjectHndlHndrComponentWrite(detail) {
    return this.hndlHndrRecords.planPointer10VectorWrite(detail);
  }

  commitObjectHndlHndrComponentWrite(plan, vector) {
    return this.hndlHndrRecords.commitPointer10VectorWrite(plan, vector);
  }

  configureHndlHndrVectorTable(detail) {
    return this.hndlHndrRecords.configureVectorTable(detail);
  }

  configureObjectHndlHndrControllerRecord(detail) {
    return this.hndlHndrRecords.configureControllerRecord(detail);
  }

  applyObjectHndlHndrVectorInstall(detail) {
    return this.hndlHndrRecords.applyVectorInstall(detail);
  }

  applyObjectHndlHndrControllerRequest(detail) {
    return this.hndlHndrRecords.applyControllerRequest(detail);
  }

  applyObjectHndlHndrMotionRequest(detail) {
    return this.hndlHndrRecords.applyMotionRequest(detail);
  }

  applyObjectHndlHndrMotionControl(detail) {
    return this.hndlHndrRecords.applyMotionControl(detail);
  }

  readObjectHndlHndrRecord(detail) {
    return this.hndlHndrRecords.readRecord(detail);
  }

  writeNativeVector(pointer, vector) {
    return this.objectVectorState.writeNativeVector(pointer, vector);
  }

  readNativeVector(pointer) {
    return this.objectVectorState.readNativeVector(pointer);
  }

  loadNamedResource(resource) {
    if (resource === undefined || resource === null) {
      throw new TypeError("native named resource is required");
    }
    this.namedResources.add(resource);
  }

  releaseNamedResource(resource) {
    if (resource === undefined || resource === null) {
      throw new TypeError("native named resource is required");
    }
    this.namedResources.delete(resource);
  }

  hasNamedResource(resource) {
    return this.namedResources.has(resource);
  }

  reconcileNativeSoundBankSlots(requests) {
    const mutation = reconcileNativeSoundBankSlots(
      this.soundBankSlots,
      requests,
    );
    this.soundBankSlots = mutation.slots;
    return mutation;
  }

  readNativeSoundBankSlots() {
    return [...this.soundBankSlots];
  }

  writeSceneEightChannelTransition({ duration, endpoints }) {
    if (!Number.isInteger(duration)) {
      throw new TypeError("native scene transition duration must be an integer");
    }
    if (
      !Array.isArray(endpoints)
      || endpoints.length !== 2
      || endpoints.some(group => (
        !Array.isArray(group)
        || group.length !== 4
        || group.some(value => (
          !Number.isInteger(value) || value < 0 || value > 0xff
        ))
      ))
    ) {
      throw new TypeError(
        "native scene transition requires two four-byte endpoints",
      );
    }
    const endpointWords = endpoints.map(group => (
      group.map(value => (value << 16) >>> 0)
    ));
    const signedDuration = signed32(duration);
    const deltaWords = endpointWords[0].map((word, index) => {
      if (signedDuration === 0) return 0;
      const difference = signed32(
        (endpointWords[1][index] - word) >>> 0,
      );
      return Math.trunc(difference / signedDuration);
    });
    this.sceneEightChannelTransition = {
      duration: duration >>> 0,
      endpoints: endpoints.map(group => [...group]),
      endpointWords,
      deltaWords,
      currentWords: [...endpointWords[0]],
      packedWord: undefined,
    };
    return this.readSceneEightChannelTransition();
  }

  advanceSceneEightChannelTransition() {
    const transition = this.sceneEightChannelTransition;
    if (!transition || transition.duration === 0) return false;
    transition.duration = (transition.duration - 1) >>> 0;
    if (transition.duration === 0) {
      transition.currentWords = [...transition.endpointWords[1]];
    } else {
      transition.currentWords = transition.currentWords.map((word, index) => (
        (word + transition.deltaWords[index]) >>> 0
      ));
    }
    if (transition.currentWords[0] !== 0) {
      transition.packedWord = transition.currentWords.reduce(
        (packed, word, index) => (
          packed | (((word >>> 16) & 0xff) << ((3 - index) * 8))
        ),
        0,
      ) >>> 0;
    }
    return true;
  }

  readSceneEightChannelTransition() {
    const transition = this.sceneEightChannelTransition;
    if (!transition) return undefined;
    return {
      duration: transition.duration,
      endpoints: transition.endpoints.map(group => [...group]),
      endpointWords: transition.endpointWords.map(group => [...group]),
      deltaWords: [...transition.deltaWords],
      currentWords: [...transition.currentWords],
      packedWord: transition.packedWord,
    };
  }

  isSceneEightChannelTransitionActive() {
    return Boolean(this.sceneEightChannelTransition?.duration);
  }

  writeInteractionRecordFields(index, values) {
    if (!Number.isSafeInteger(index) || index < 0) {
      throw new RangeError(
        "native interaction record index must be non-negative",
      );
    }
    if (!Array.isArray(values) || values.length !== 7) {
      throw new RangeError(
        "native interaction record update requires seven words",
      );
    }
    this.interactionRecords.set(index, [...values]);
  }

  writeInteractionContextWord56(value) {
    if (!Number.isSafeInteger(value)) {
      throw new TypeError("native interaction context word must be an integer");
    }
    this.interactionContextWord56 = value;
  }

  readInteractionContextWord56() {
    return this.interactionContextWord56;
  }

  configureInteractionManager(configuration) {
    return this.interactionManager.configure(configuration);
  }

  clearInteractionManager() {
    this.interactionManager.clear();
  }

  queryInteractionManagerIndirectIndex(descriptorIndex, key) {
    return this.interactionManager.queryIndirectIndex(descriptorIndex, key);
  }

  queryNearestInteractionManagerDescriptor(targetWords, key = 2) {
    return this.interactionManager.queryNearestDescriptorIndex(targetWords, key);
  }

  allocateInteractionManagerRuntimeSlot(firstWord, secondWord) {
    return this.interactionManager.allocateRuntimeSlot(firstWord, secondWord);
  }

  consumeInteractionManagerRuntimeSlotStatus(index) {
    return this.interactionManager.consumeRuntimeSlotStatus(index);
  }

  configureCurrentEventControlRecord(values) {
    return this.eventControlRecord.configure(values);
  }

  queryCurrentEventControlField(selector) {
    return this.eventControlRecord.query(selector);
  }

  readCurrentEventControlRecord() {
    return this.eventControlRecord.read();
  }

  writeCurrentEventControllerInput(mask) {
    return this.eventControlRecord.writeControllerInput(mask);
  }

  clearCurrentEventControlRecord() {
    return this.eventControlRecord.clear();
  }

  readInteractionRecordFields(index) {
    if (!Number.isSafeInteger(index) || index < 0) {
      throw new RangeError(
        "native interaction record index must be non-negative",
      );
    }
    const values = this.interactionRecords.get(index);
    return values ? [...values] : undefined;
  }

  writeNativeOperation0199ControlDword(value) {
    if (!Number.isInteger(value)) {
      throw new TypeError("native operation 0x0199 control must be an integer");
    }
    const previous = this.nativeOperation0199ControlDword;
    this.nativeOperation0199ControlDword = value >>> 0;
    return previous;
  }

  configureNativeOperation0199StatusByte(value) {
    if (!Number.isInteger(value) || value < 0 || value > 0xff) {
      throw new RangeError("native operation 0x0199 status must be a byte");
    }
    this.nativeOperation0199StatusByte = value;
  }

  readNativeOperation0199StatusByte() {
    return this.nativeOperation0199StatusByte;
  }

  writeNativeOperation0174GlobalDword(value) {
    if (value !== 0 && value !== 1) {
      throw new RangeError("native operation 0x0174 value must be zero or one");
    }
    const previous = this.nativeOperation0174GlobalDword;
    this.nativeOperation0174GlobalDword = value;
    return previous;
  }

  writeNativeOperation0166Mode28GlobalDword(value) {
    if (value !== 0) {
      throw new RangeError("native operation 0x0166 mode 28 only writes zero");
    }
    const previous = this.nativeOperation0166Mode28GlobalDword;
    this.nativeOperation0166Mode28GlobalDword = 0;
    return previous;
  }

  planNativeOperation0166Mode29Poll() {
    const previous = this.nativeOperation0166Mode28GlobalDword;
    if (!Number.isInteger(previous)) {
      return {
        applied: false,
        reason: "native-operation-0166-mode-29-counter-unavailable",
      };
    }
    const counter = (previous + 1) | 0;
    return {
      applied: true,
      previous,
      counter,
      requiresActiveDword: counter >= 5 && counter < 60,
    };
  }

  commitNativeOperation0166Mode29Poll(plan) {
    if (!plan?.applied || this.nativeOperation0166Mode28GlobalDword !== plan.previous) {
      throw new Error("native operation 0x0166 mode 29 counter changed before commit");
    }
    const { counter } = plan;
    const result = (
      counter < 5
      || (counter < 60 && plan.activeDword !== 0)
    ) ? 1 : 0;
    this.nativeOperation0166Mode28GlobalDword = counter;
    return {
      mode: 29,
      previous: plan.previous,
      counter,
      activeDword: plan.activeDword,
      result,
    };
  }

  configureNativeOperation01bdGlobalDword(value) {
    if (!Number.isInteger(value)) {
      throw new TypeError("native operation 0x01bd value must be an integer");
    }
    this.nativeOperation01bdGlobalDword = value | 0;
  }

  consumeNativeOperation01bdGlobalDword() {
    const value = this.nativeOperation01bdGlobalDword;
    if (value === undefined) return undefined;
    this.nativeOperation01bdGlobalDword = -1;
    return value;
  }

  writeNativeOperation014fGlobalFloatWord(value) {
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
      throw new RangeError("native operation 0x014f value must be a uint32 word");
    }
    const previous = this.nativeOperation014fGlobalFloatWord;
    this.nativeOperation014fGlobalFloatWord = value >>> 0;
    return previous;
  }

  writeNativeOperation0052TableEntry({ index, value }) {
    if (!Number.isSafeInteger(index) || index < 0) {
      throw new RangeError("native operation 0x0052 index must be non-negative");
    }
    if (!Number.isInteger(value)) {
      throw new TypeError("native operation 0x0052 value must be an integer");
    }
    const previous = this.nativeOperation0052Table.get(index);
    this.nativeOperation0052Table.set(index, value >>> 0);
    return previous;
  }

  readNativeField(descriptor) {
    const { offset, width } = requireFieldDescriptor(descriptor);
    const field = this.nativeFields.get(offset);
    if (!field) return undefined;
    if (field.width !== width) {
      throw new Error(
        `native scene field 0x${offset.toString(16)} width changed`,
      );
    }
    return field.value;
  }

  planGlobalControllerInitialize(configurationWord) {
    return this.globalController.planInitialize(configurationWord);
  }

  planGlobalControllerReset() {
    return this.globalController.planReset();
  }

  commitGlobalControllerPlan(plan) {
    return this.globalController.commit(plan);
  }

  queryGlobalControllerStatus() {
    return this.globalController.queryStatus();
  }

  enqueueGlobalControllerEvent(eventCode) {
    return this.globalController.enqueueEvent(eventCode);
  }

  pollGlobalControllerEvent() {
    return this.globalController.pollEvent();
  }

  initializeGlobalControllerRange(detail) {
    return this.globalController.initializeRange(detail);
  }

  writeGlobalControllerByteSelection({
    argument0,
    argument1,
  }) {
    const plan = this.globalController.planByteSelection(
      argument0,
      argument1,
    );
    this.globalController.commit(plan);
    return plan;
  }

  writeNativeField({ offset, width, value }) {
    requireFieldDescriptor({ offset, width });
    const previous = this.nativeFields.get(offset);
    if (previous && previous.width !== width) {
      throw new Error(
        `native scene field 0x${offset.toString(16)} width changed`,
      );
    }
    this.nativeFields.set(offset, { width, value });
  }

  writeNativeWordBit({ address, mask, enabled }) {
    if (!Number.isSafeInteger(address) || address < 0) {
      throw new RangeError("native word address must be non-negative");
    }
    if (!Number.isInteger(mask) || (mask >>> 0) === 0) {
      throw new RangeError("native word mask must be nonzero");
    }
    if (typeof enabled !== "boolean") {
      throw new TypeError("native word bit state must be boolean");
    }
    const current = this.readNativeField({
      offset: address,
      width: 4,
    });
    if (!Number.isInteger(current)) {
      throw new Error(
        `native word 0x${address.toString(16)} is unavailable`,
      );
    }
    const unsignedMask = mask >>> 0;
    const value = enabled
      ? ((current >>> 0) | unsignedMask) >>> 0
      : ((current >>> 0) & ~unsignedMask) >>> 0;
    this.writeNativeField({ offset: address, width: 4, value });
    return value;
  }
}

export function createNativeSceneGameplayState() {
  return new NativeSceneGameplayState();
}

export {
  createNativeSceneFieldRuntimeContext,
} from "./NativeSceneRuntimeContext.js";
