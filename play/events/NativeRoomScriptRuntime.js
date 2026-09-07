import {
  createNativeActorOsagSemanticHandlers,
} from "./NativeActorOsagRuntime.js";
import {
  createNativeIndexedRecordSemanticHandlers,
} from "./NativeIndexedRecordRuntime.js";
import {
  createNativeClockRecordState,
} from "./NativeClockRecordRuntime.js";
import {
  createNativeActorMhndSemanticHandlers,
} from "./NativeActorMhndRuntime.js";
import {
  createNativeActorLookPointSemanticHandlers,
} from "./NativeActorLookPointRuntime.js";
import { createNativeAseqFrameClock } from "./NativeAseqFrameClock.js";
import {
  createNativeActorFieldSemanticHandlers,
} from "./NativeActorFieldRuntime.js";
import {
  createNativeActorControllerWordSemanticHandlers,
} from "./NativeActorControllerWordRuntime.js";
import {
  createNativeAssociatedRecordSemanticHandlers,
} from "./NativeAssociatedRecordRuntime.js";
import {
  createNativeDebugFormatSemanticHandlers,
} from "./NativeDebugFormatRuntime.js";
import {
  createNativeClockRecordSemanticHandlers,
  createNativeCameraAuxiliarySemanticHandlers,
  createNativeFogTableSemanticHandlers,
  createNativeGlobalWordSemanticHandlers,
  createNativeGameStateSemanticHandlers,
  createNativeInteractionRecordSemanticHandlers,
  createNativeNamedResourceSemanticHandlers,
  createNativeNumericSemanticHandlers,
  createNativeNoOpSemanticHandlers,
  createNativeOperation014fSemanticHandlers,
  createNativeOperation013aSemanticHandlers,
  createNativeOperation0052SemanticHandlers,
  createNativeObjectDword5cSemanticHandlers,
  createNativeObjectImgmSelectionSemanticHandlers,
  createNativeMomtVectorSlotSemanticHandlers,
  createNativeOperation0199SemanticHandlers,
  createNativeOperation0174SemanticHandlers,
  createNativeOperation01bdSemanticHandlers,
  createNativeOperation0071SemanticHandlers,
  createNativeOperation0050SemanticHandlers,
  createNativeOperation013cSemanticHandlers,
  createNativeOperation013eSemanticHandlers,
  createNativeTransientSlotSemanticHandlers,
  createNativeOperation0120SemanticHandlers,
  createNativeOperation0166SemanticHandlers,
  createNativeOperation019eSemanticHandlers,
  createNativeOperation0170SemanticHandlers,
  createNativePrimaryRuntimeSemanticHandlers,
  createNativePresentationControllerFamilyAdapter,
  createNativePresentationControllerFamilySemanticHandlers,
  createNativePresentationOwnerSemanticHandlers,
  createNativeSceneObjectSemanticHandlers,
  createNativeSceneTransitionSemanticHandlers,
  createNativeScrollSpriteSemanticHandlers,
  createNativeSoundBankSemanticHandlers,
  createNativeSpatialBoundsSemanticHandlers,
  createNativeCameraShakeSemanticHandlers,
  createNativeHandMotionResourceSemanticHandlers,
} from "./NativeEventOperationRuntime.js";
import {
  createNativeOperation019eState,
} from "./NativeOperation019eRuntime.js";
import {
  createNativeEventControlRecordSemanticHandlers,
} from "./NativeEventControlRecordRuntime.js";
import {
  createNativeEfptControllerSemanticHandlers,
  createNativeEfptControllerState,
} from "./NativeEfptControllerRuntime.js";
import {
  createNativeEfptPrimaryControllerSemanticHandlers,
  createNativeEfptPrimaryControllerState,
} from "./NativeEfptPrimaryControllerRuntime.js";
import {
  createNativeFixedFloatExchangeSemanticHandlers,
  createNativeFixedFloatExchangeState,
} from "./NativeFixedFloatExchangeRuntime.js";
import {
  createNativeOperation001cSemanticHandlers,
} from "./NativeOperation001cRuntime.js";
import {
  createNativeFaceClipControlSemanticHandlers,
} from "./NativeFaceClipControlRuntime.js";
import {
  createNativeFaceControllerSemanticHandlers,
} from "./NativeFaceControllerRuntime.js";
import {
  createNativeFaceTableSemanticHandlers,
} from "./NativeFaceTableRuntime.js";
import {
  createNativePresentationControlSemanticHandlers,
} from "./NativePresentationControlRuntime.js";
import {
  createNativeFixedRecordPoseSemanticHandlers,
} from "./NativeFixedRecordPoseRuntime.js";
import {
  createNativeTmnmRecordSemanticHandlers,
} from "./NativeTmnmRecordRuntime.js";
import {
  createNativeScrollSpriteControlSemanticHandlers,
} from "./NativeScrollSpriteControlRuntime.js";
import {
  createNativeFixedGlobalByteSemanticHandlers,
} from "./NativeFixedGlobalByteRuntime.js";
import {
  createNativeGlobalControllerSemanticHandlers,
} from "./NativeGlobalControllerRuntime.js";
import {
  createNativeHndlHndrRecordSemanticHandlers,
} from "./NativeHndlHndrRecordRuntime.js";
import {
  createNativeMapcRecordSemanticHandlers,
} from "./NativeMapcRecordRuntime.js";
import {
  createNativeObjectLinkSemanticHandlers,
} from "./NativeObjectLinkRuntime.js";
import {
  createNativeObjectFacingSemanticHandlers,
} from "./NativeObjectFacingRuntime.js";
import {
  createNativeAreaRequestSemanticHandlers,
} from "./NativeAreaRequestRuntime.js";
import {
  createNativeLightPresetSemanticHandlers,
} from "./NativeLightPresetRuntime.js";
import {
  createNativeControllerInputSemanticHandlers,
} from "./NativeControllerInputRuntime.js";
import {
  createNativeSecondaryMotionControlSemanticHandlers,
} from "./NativeSecondaryMotionControlRuntime.js";
import {
  createNativeOsagParameterSemanticHandlers,
} from "./NativeOsagParameterRuntime.js";
import {
  createNativePersistentScriptBitSemanticHandlers,
} from "./NativePersistentScriptBitState.js";
import {
  createNativeNumberedMapLayerSemanticHandlers,
} from "./NativeNumberedMapLayerRuntime.js";
import {
  createNativeSceneFieldRuntimeContext,
  createNativeSceneGameplayState,
} from "./NativeSceneGameplayState.js";
import {
  createNativeScriptedSceneSemanticHandlers,
} from "./NativeScriptedSceneRuntime.js";
import {
  applyNativeCurrentEventProfile,
  applyNativeDirectEntryState,
  applyNativeInteractionManagerProfile,
  applyNativeRoomScriptProfile,
  initializeNativeRoomTaggedObjectControllerPair,
} from "./NativeRoomScriptProfiles.js";
import {
  nativeFloat32Word,
} from "./NativeEventNumericRuntime.js";
import {
  createNativeTaggedObjectActionSemanticHandlers,
  createNativeTaggedObjectControllerSemanticHandlers,
} from "./NativeTaggedObjectActionRuntime.js";
import {
  createNativeProceduralModelControllerSemanticHandlers,
} from "./NativeProceduralModelControllerRuntime.js";
import {
  createNativeMotionResourceRequestSemanticHandlers,
} from "./NativeMotionResourceRequestRuntime.js";
import {
  createNativeOperation011aSemanticHandlers,
  createNativeOperation011aState,
} from "./NativeOperation011aRuntime.js";
import {
  createNativeOperation009bSemanticHandlers,
  createNativeOperation009bState,
} from "./NativeOperation009bRuntime.js";
import {
  createNativeOperation01adSemanticHandlers,
  createNativeOperation01adState,
} from "./NativeOperation01adRuntime.js";
import {
  createNativeOperation01a1SemanticHandlers,
  createNativeOperation01a1State,
} from "./NativeOperation01a1Runtime.js";
import {
  createNativeOperation0026SemanticHandlers,
} from "./NativeOperation0026Runtime.js";
import {
  createNativeEnvironmentPresetSemanticHandlers,
} from "./NativeEnvironmentPresetRuntime.js";
import {
  createNativeSceneOwnerFlagsSemanticHandlers,
} from "./NativeSceneOwnerFlagsRuntime.js";
import {
  createNativeOperation0153SemanticHandlers,
  createNativeOperation0153State,
} from "./NativeOperation0153Runtime.js";
import {
  createNativeOperation0156SemanticHandlers,
  createNativeOperation0156State,
} from "./NativeOperation0156Runtime.js";
import {
  createNativeOperation018aSemanticHandlers,
  createNativeOperation018aState,
} from "./NativeOperation018aRuntime.js";
import {
  createNativeOperation014bSemanticHandlers,
  createNativeOperation014bState,
} from "./NativeOperation014bRuntime.js";
import {
  createNativeOperation015cSemanticHandlers,
  createNativeOperation015cState,
} from "./NativeOperation015cRuntime.js";
import {
  createNativeOperation0193SemanticHandlers,
  createNativeOperation0193State,
} from "./NativeOperation0193Runtime.js";

function stopped(reason) {
  return { status: "stopped", reason };
}

function requireArea(value) {
  const area = String(value || "").toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(area)) {
    throw new TypeError(
      "native room-script area must be a four-character identifier",
    );
  }
  return area;
}

function spatialSelectorSlotOffset(slotIndex) {
  if (!Number.isSafeInteger(slotIndex) || slotIndex < 0) {
    throw new RangeError(
      "native spatial-selector slot index must be non-negative",
    );
  }
  return 0x84 + slotIndex * 4;
}

function requireSpatialRecordIndex(selectedRecordIndex) {
  if (!Number.isSafeInteger(selectedRecordIndex) || selectedRecordIndex < 0) {
    throw new RangeError(
      "native spatial-selector record index must be non-negative",
    );
  }
  return selectedRecordIndex;
}

function spatialInteractionStateOffset(slotIndex) {
  spatialSelectorSlotOffset(slotIndex);
  return 0xb0 + slotIndex;
}

function requireNativePosition(nativePosition) {
  if (
    !Array.isArray(nativePosition)
    || nativePosition.length !== 3
    || nativePosition.some(value => !Number.isFinite(value))
  ) {
    throw new TypeError(
      "native interaction actor position must contain three finite numbers",
    );
  }
  return nativePosition.map(value => Math.fround(value));
}

function requireObjectTag(objectTag) {
  const tag = String(objectTag || "").toUpperCase();
  if (!/^[A-Z0-9_]{4}$/.test(tag)) {
    throw new TypeError("native scene object tag must be four characters");
  }
  return tag;
}

export class NativeRoomScriptRuntime {
  constructor({
    sceneState = createNativeSceneGameplayState(),
    randomFloat,
    scriptedScene = {},
    primaryRuntime = {},
    presentationOwner = {},
    presentationController = {},
    globalController = {},
    indexedController = {},
    operation013c = {},
    efptController = {},
    efptPrimaryController = {},
    fixedFloatExchange = {},
    operation0050 = {},
    operation0120 = {},
    operation0166 = {},
    proceduralModel = {},
    operation0170 = {},
    motionResource = {},
    handMotionResource = motionResource,
    scrollResource = {},
    operation0026 = {},
    operation009b = {},
    operation01a1 = {},
    operation01ad = {},
    operation011a = {},
    operation0153 = {},
    operation014b = {},
    operation0156 = {},
    operation018a = {},
    operation019e = {},
    operation015c = {},
    operation0193 = {},
    momtVectorSlot = {},
    associatedRecord = {},
    actorField = {},
    actorController = {},
    objectLink = {},
    taggedObjectAction = {},
    clockRecord = {},
    transaction = {},
    createHandlers = null,
    context = {},
  } = {}) {
    this.sceneState = sceneState;
    this.transactionAdapters = transaction;
    this.operation013cAdapters = operation013c;
    this.efptControllerState = efptController.state
      || createNativeEfptControllerState();
    this.efptPrimaryControllerState = efptPrimaryController.state
      || createNativeEfptPrimaryControllerState();
    this.fixedFloatExchangeState = fixedFloatExchange.state
      || createNativeFixedFloatExchangeState();
    this.operation0050Adapters = operation0050;
    this.operation011aState = operation011a.state
      || createNativeOperation011aState();
    this.operation009bState = operation009b.state
      || createNativeOperation009bState();
    this.operation01a1State = operation01a1.state
      || createNativeOperation01a1State();
    this.operation01adState = operation01ad.state
      || createNativeOperation01adState();
    this.operation0153State = operation0153.state
      || createNativeOperation0153State();
    this.operation014bState = operation014b.state
      || createNativeOperation014bState();
    this.operation0156State = operation0156.state
      || createNativeOperation0156State();
    this.operation018aState = operation018a.state
      || createNativeOperation018aState();
    this.operation019eState = operation019e.state
      || createNativeOperation019eState();
    this.operation015cState = operation015c.state
      || createNativeOperation015cState();
    this.operation0193State = operation0193.state
      || createNativeOperation0193State();
    this.presentationControllerAdapter =
      createNativePresentationControllerFamilyAdapter(
        presentationController,
      );
    this.createHandlers = createHandlers;
    this.activeTransaction = null;
    this.activeArea = null;
    this.clockRecordState = createNativeClockRecordState({
      readAuthoritativeRecord: clockRecord.readNativeClockRecord,
    });
    const presentationControllerContext = (
      this.presentationControllerAdapter.applyRouteCallback
        ? {
            applyNativePresentationControllerRoute: detail => (
              this.presentationControllerAdapter.apply({
                ...detail,
                area: this.activeArea,
              })
            ),
          }
        : {}
    );
    this.context = {
      ...createNativeSceneFieldRuntimeContext(sceneState),
      ...context,
      ...presentationControllerContext,
    };
    this.handlers = {
      ...createNativeDebugFormatSemanticHandlers(),
      ...createNativeClockRecordSemanticHandlers({
        readNativeClockRecord: () => this.clockRecordState.read(),
        writeNativeClockRecord: record => this.clockRecordState.write(record),
      }),
      ...createNativeCameraAuxiliarySemanticHandlers(),
      ...createNativeFogTableSemanticHandlers(),
      ...createNativeNumericSemanticHandlers({ randomFloat }),
      ...createNativeNoOpSemanticHandlers([
        "native-operation-00cd-no-op",
        "native-operation-012c-no-op",
        "native-operation-0141-no-op",
        "native-operation-0182-no-op",
      ]),
      ...createNativeOperation014fSemanticHandlers(),
      ...createNativeOperation001cSemanticHandlers(),
      ...createNativeObjectFacingSemanticHandlers(),
      ...createNativeAreaRequestSemanticHandlers(),
      ...createNativeLightPresetSemanticHandlers(),
      ...createNativeEnvironmentPresetSemanticHandlers(),
      ...createNativeSceneOwnerFlagsSemanticHandlers(),
      ...createNativeControllerInputSemanticHandlers(),
      ...createNativeSecondaryMotionControlSemanticHandlers(),
      ...createNativeOsagParameterSemanticHandlers(),
      ...createNativeOperation013aSemanticHandlers(),
      ...createNativeOperation0052SemanticHandlers(),
      ...createNativeOperation0071SemanticHandlers(),
      ...createNativeSceneObjectSemanticHandlers(),
      ...createNativeEfptControllerSemanticHandlers({
        ...efptController,
        state: this.efptControllerState,
      }),
      ...createNativeEfptPrimaryControllerSemanticHandlers({
        ...efptPrimaryController,
        state: this.efptPrimaryControllerState,
      }),
      ...createNativeFixedFloatExchangeSemanticHandlers({
        ...fixedFloatExchange,
        state: this.fixedFloatExchangeState,
      }),
      ...createNativeSceneTransitionSemanticHandlers(),
      ...createNativeScrollSpriteSemanticHandlers(),
      ...createNativeSoundBankSemanticHandlers(),
      ...createNativeCameraShakeSemanticHandlers(),
      ...createNativeHandMotionResourceSemanticHandlers(handMotionResource),
      ...createNativeSpatialBoundsSemanticHandlers(),
      ...createNativeTaggedObjectControllerSemanticHandlers({
        ...taggedObjectAction,
        state: sceneState.taggedObjectController,
        initializeTaggedObjectControllerPair:
          taggedObjectAction.initializeTaggedObjectControllerPair
          ?? (detail => initializeNativeRoomTaggedObjectControllerPair(
            this.activeArea,
            detail,
          )),
      }),
      ...createNativeTaggedObjectActionSemanticHandlers({
        ...taggedObjectAction,
        state: sceneState.taggedObjectActions,
      }),
      ...createNativeAssociatedRecordSemanticHandlers(associatedRecord),
      ...createNativeActorControllerWordSemanticHandlers(actorController),
      ...createNativeActorMhndSemanticHandlers(),
      ...createNativeActorLookPointSemanticHandlers(),
      ...createNativeActorFieldSemanticHandlers(actorField),
      ...createNativeActorOsagSemanticHandlers(),
      ...createNativeObjectLinkSemanticHandlers(objectLink),
      ...createNativeEventControlRecordSemanticHandlers(),
      ...createNativeFaceClipControlSemanticHandlers(),
      ...createNativeFaceControllerSemanticHandlers({ randomFloat }),
      ...createNativeFaceTableSemanticHandlers(),
      ...createNativePresentationControlSemanticHandlers(),
      ...createNativeFixedRecordPoseSemanticHandlers(),
      ...createNativeTmnmRecordSemanticHandlers(),
      ...createNativeScrollSpriteControlSemanticHandlers(scrollResource),
      ...createNativeFixedGlobalByteSemanticHandlers(),
      ...createNativeGlobalControllerSemanticHandlers(globalController),
      ...createNativeGlobalWordSemanticHandlers(),
      ...createNativeGameStateSemanticHandlers(),
      ...createNativeHndlHndrRecordSemanticHandlers(),
      ...createNativeInteractionRecordSemanticHandlers(),
      ...createNativeIndexedRecordSemanticHandlers(indexedController),
      ...createNativeMapcRecordSemanticHandlers(),
      ...createNativeNamedResourceSemanticHandlers(),
      ...createNativeObjectDword5cSemanticHandlers(),
      ...createNativeObjectImgmSelectionSemanticHandlers(),
      ...createNativeMomtVectorSlotSemanticHandlers(momtVectorSlot),
      ...createNativeOperation0199SemanticHandlers(),
      ...createNativeOperation0174SemanticHandlers(),
      ...createNativeOperation01bdSemanticHandlers(),
      ...createNativePersistentScriptBitSemanticHandlers(),
      ...createNativeNumberedMapLayerSemanticHandlers(),
      ...createNativePrimaryRuntimeSemanticHandlers(primaryRuntime),
      ...createNativePresentationControllerFamilySemanticHandlers(),
      ...createNativePresentationOwnerSemanticHandlers(presentationOwner),
      ...createNativeOperation013cSemanticHandlers(operation013c),
      ...createNativeOperation0050SemanticHandlers(operation0050),
      ...createNativeOperation013eSemanticHandlers(),
      ...createNativeTransientSlotSemanticHandlers(),
      ...createNativeOperation0120SemanticHandlers(operation0120),
      ...createNativeOperation0166SemanticHandlers(operation0166),
      ...createNativeProceduralModelControllerSemanticHandlers(
        proceduralModel,
      ),
      ...createNativeOperation0170SemanticHandlers(operation0170),
      ...createNativeMotionResourceRequestSemanticHandlers(motionResource),
      ...createNativeOperation0026SemanticHandlers(operation0026),
      ...createNativeOperation009bSemanticHandlers({
        ...operation009b,
        state: this.operation009bState,
      }),
      ...createNativeOperation01a1SemanticHandlers({
        ...operation01a1,
        state: this.operation01a1State,
      }),
      ...createNativeOperation01adSemanticHandlers({
        ...operation01ad,
        state: this.operation01adState,
      }),
      ...createNativeOperation011aSemanticHandlers({
        ...operation011a,
        state: this.operation011aState,
      }),
      ...createNativeOperation0153SemanticHandlers({
        ...operation0153,
        state: this.operation0153State,
      }),
      ...createNativeOperation014bSemanticHandlers({
        ...operation014b,
        state: this.operation014bState,
      }),
      ...createNativeOperation0156SemanticHandlers({
        ...operation0156,
        state: this.operation0156State,
      }),
      ...createNativeOperation018aSemanticHandlers({
        ...operation018a,
        state: this.operation018aState,
      }),
      ...createNativeOperation019eSemanticHandlers({
        state: this.operation019eState,
      }),
      ...createNativeOperation015cSemanticHandlers({
        ...operation015c,
        state: this.operation015cState,
      }),
      ...createNativeOperation0193SemanticHandlers({
        ...operation0193,
        state: this.operation0193State,
      }),
      ...createNativeScriptedSceneSemanticHandlers(scriptedScene),
      "global-byte-state-write": async ({ readArgument }) => {
        const value = readArgument(0);
        if (!Number.isInteger(value)) {
          return stopped("global-byte-state-value-unavailable");
        }
        const previous = sceneState.readGlobalByte();
        sceneState.writeGlobalByte(value & 0xff);
        return {
          status: "continued",
          mutation: {
            previous,
            value: value & 0xff,
          },
        };
      },
    };
  }

  eventContext() {
    // Area activation replaces stateful record containers. Rebuild their
    // context view at each event boundary so a program invoked for a native
    // area different from the rendered host world never writes stale records.
    return {
      ...this.context,
      ...createNativeSceneFieldRuntimeContext(this.sceneState),
    };
  }

  semanticHandlers() {
    return this.handlers;
  }

  writeInteractionActorPosition(nativePosition) {
    const position = requireNativePosition(nativePosition);
    const words = position.map(nativeFloat32Word);
    for (let index = 0; index < words.length; index += 1) {
      this.sceneState.writeNativeField({
        offset: 0xd4 + index * 4,
        width: 4,
        value: words[index],
      });
    }
    return {
      offset: 0xd4,
      width: 4,
      position,
      words,
    };
  }

  writeSceneObjectBasePosition({ objectTag, nativePosition }) {
    if (this.activeArea === null) {
      throw new Error("native room-script area is not active");
    }
    const tag = requireObjectTag(objectTag);
    const position = requireNativePosition(nativePosition);
    const words = position.map(nativeFloat32Word);
    this.sceneState.writeObjectVector(tag, words);
    return { objectTag: tag, position, words };
  }

  writeSpatialSelection({
    slotIndex = 0,
    selectedRecordIndex,
  }) {
    const offset = spatialSelectorSlotOffset(slotIndex);
    const value = requireSpatialRecordIndex(selectedRecordIndex) + 1;
    this.sceneState.writeNativeField({ offset, width: 4, value });
    this.sceneState.writeNativeField({
      offset: spatialInteractionStateOffset(slotIndex),
      width: 1,
      value: 3,
    });
    return { offset, width: 4, value };
  }

  consumeSpatialSelection({
    slotIndex = 0,
    selectedRecordIndex,
  }) {
    const offset = spatialSelectorSlotOffset(slotIndex);
    const expected = requireSpatialRecordIndex(selectedRecordIndex) + 1;
    const current = this.sceneState.readNativeField({ offset, width: 4 });
    if (current !== expected) {
      throw new Error(
        `native spatial-selector slot ${slotIndex} expected `
        + `${expected}, found ${String(current)}`,
      );
    }
    const stateOffset = spatialInteractionStateOffset(slotIndex);
    const interactionState = this.sceneState.readNativeField({
      offset: stateOffset,
      width: 1,
    });
    if (interactionState !== 3) {
      throw new Error(
        `native interaction-state slot ${slotIndex} expected 3, found `
        + String(interactionState),
      );
    }
    this.sceneState.writeNativeField({
      offset: stateOffset,
      width: 1,
      value: 0,
    });
    this.sceneState.writeNativeField({
      offset,
      width: 4,
      value: 0xffffffff,
    });
    if (this.activeTransaction) {
      this.activeTransaction.spatialSelectorSlot = slotIndex;
    }
    return {
      offset,
      width: 4,
      previous: current,
      value: 0xffffffff,
    };
  }

  activateArea(area) {
    const nextArea = requireArea(area);
    if (this.activeTransaction) {
      throw new Error(
        "cannot activate a native room-script area during a transaction",
      );
    }
    if (this.activeArea === nextArea) return false;
    if (this.activeArea !== null) {
      this.sceneState.clear();
      this.clockRecordState.restore(null);
      this.#clearRecoveredOperationState();
    }
    this.sceneState.initializeRoomRuntimeState();
    applyNativeRoomScriptProfile(this.sceneState, nextArea);
    this.activeArea = nextArea;
    return true;
  }

  deactivateArea(area = this.activeArea) {
    if (this.activeTransaction) {
      throw new Error(
        "cannot deactivate a native room-script area during a transaction",
      );
    }
    if (this.activeArea === null) return false;
    const expectedArea = requireArea(area);
    if (expectedArea !== this.activeArea) {
      throw new Error(
        `cannot deactivate inactive native room-script area ${expectedArea}`,
      );
    }
    this.sceneState.clear();
    this.clockRecordState.restore(null);
    this.#clearRecoveredOperationState();
    this.activeArea = null;
    return true;
  }

  #clearRecoveredOperationState() {
    this.efptControllerState.clear();
    this.efptPrimaryControllerState.clear();
    this.fixedFloatExchangeState.clear();
    this.operation009bState.clear();
    this.operation01a1State.clear();
    this.operation01adState.clear();
    this.operation011aState.clear();
    this.operation0153State.clear();
    this.operation014bState.clear();
    this.operation0156State.clear();
    this.operation018aState.clear();
    this.operation019eState.clear();
    this.operation015cState.clear();
    this.operation0193State.clear();
  }

  beginTransaction(detail = {}) {
    if (this.activeTransaction) {
      throw new Error("native room-script transaction is already active");
    }
    const area = requireArea(detail.area);
    if (area !== this.activeArea) {
      throw new Error(
        `native room-script area ${area} is not active`,
      );
    }
    if (this.sceneState.readNativeOperation0050Activity()) {
      throw new Error("cannot begin a room-script transaction with an active AUTH activity");
    }
    const transactionDetail = {
      ...detail,
      area,
      sceneState: this.sceneState,
    };
    const snapshot = this.sceneState.snapshot();
    const clockRecordSnapshot = this.clockRecordState.snapshot();
    const token = Symbol("native-room-script-transaction");
    let transactionHandlers;
    let programOwnership;
    let programOwnershipBegan = false;
    let external;
    try {
      transactionHandlers = this.createHandlers?.({
        ...transactionDetail,
        sceneState: this.sceneState,
      }) ?? {};
      if (transactionHandlers && typeof transactionHandlers.then === "function") {
        throw new TypeError(
          "native room-script transaction handler factories must be synchronous",
        );
      }
      if (
        !transactionHandlers
        || typeof transactionHandlers !== "object"
        || Array.isArray(transactionHandlers)
      ) {
        throw new TypeError(
          "native room-script transaction handlers must be an object",
        );
      }
      const interactionManagerProfile = applyNativeInteractionManagerProfile(
        this.sceneState,
        transactionDetail.program,
      );
      const currentEventProfile = applyNativeCurrentEventProfile(
        this.sceneState,
        transactionDetail,
      );
      const directEntryState = applyNativeDirectEntryState(
        this.sceneState,
        transactionDetail,
      );
      this.operation013cAdapters.prepareProgramRecords?.(
        transactionDetail.program,
      );
      this.sceneState.prepareNativeOperation013eBindings(
        transactionDetail.program,
      );
      this.sceneState.beginPrimaryRuntimeEvent();
      programOwnership = this.operation0050Adapters.beginProgram?.(
        transactionDetail,
      );
      if (programOwnership && typeof programOwnership.then === "function") {
        throw new TypeError(
          "native AUTH program ownership adapters must be synchronous",
        );
      }
      if (programOwnership === false) {
        throw new Error("native AUTH program ownership was rejected");
      }
      programOwnershipBegan = (
        programOwnership !== null && programOwnership !== undefined
      );
      external = this.transactionAdapters.begin?.(transactionDetail);
      if (external && typeof external.then === "function") {
        throw new TypeError(
          "native room-script transaction adapters must be synchronous",
        );
      }
      this.activeTransaction = {
        token,
        snapshot,
        clockRecordSnapshot,
        external,
        programOwnership,
        programOwnershipOpen: programOwnershipBegan,
        currentEventProfile,
        directEntryState,
        interactionManagerProfile,
        aseqFrameClock: createNativeAseqFrameClock(),
      };
    } catch (error) {
      const cleanupErrors = [];
      try {
        this.sceneState.restore(snapshot);
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
      try {
        if (!this.clockRecordState.restore(clockRecordSnapshot)) {
          throw new Error("native clock record snapshot restoration was rejected");
        }
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
      if (programOwnershipBegan) {
        try {
          if (typeof this.operation0050Adapters.rollbackProgram !== "function") {
            throw new Error(
              "native AUTH program ownership has no rollback adapter",
            );
          }
          const result = this.operation0050Adapters.rollbackProgram({
            ...transactionDetail,
            reason: "transaction-begin-failed",
            error,
            ownership: programOwnership,
          });
          if (result && typeof result.then === "function") {
            throw new TypeError(
              "native AUTH program ownership adapters must be synchronous",
            );
          }
          if (result !== true) {
            throw new Error(
              "native AUTH program ownership rollback was rejected",
            );
          }
        } catch (cleanupError) {
          cleanupErrors.push(cleanupError);
        }
      }
      if (cleanupErrors.length > 0) {
        throw new AggregateError(
          [error, ...cleanupErrors],
          "native room-script transaction begin and cleanup failed",
          { cause: error },
        );
      }
      throw error;
    }
    return {
      context: this.eventContext(),
      handlers: {
        ...this.semanticHandlers(),
        ...transactionHandlers,
      },
      commit: () => this.commitTransaction(token, transactionDetail),
      rollback: ({ reason } = {}) => (
        this.rollbackTransaction(token, reason, transactionDetail)
      ),
      update: (updateDetail = {}) => this.updateTransaction(token, {
        ...transactionDetail,
        ...updateDetail,
      }),
    };
  }

  updateTransaction(token, detail = {}) {
    const active = this.requireTransaction(token);
    if (active.programOwnershipOpen) {
      if (typeof this.operation0050Adapters.updateProgram !== "function") {
        throw new Error(
          "native AUTH program ownership has no presentation update adapter",
        );
      }
      const programUpdate = this.operation0050Adapters.updateProgram({
        ...detail,
        ownership: active.programOwnership,
      });
      if (programUpdate && typeof programUpdate.then === "function") {
        throw new TypeError(
          "native AUTH program ownership adapters must be synchronous",
        );
      }
      if (programUpdate !== true) {
        throw new Error(
          "native AUTH program presentation update was rejected",
        );
      }
    }
    const deltaSeconds = detail.deltaSeconds;
    const nativeTicks = Number.isFinite(deltaSeconds)
      ? active.aseqFrameClock.consume(deltaSeconds)
      : 1;
    for (let tick = 0; tick < nativeTicks; tick += 1) {
      this.sceneState.advanceSceneEightChannelTransition();
      const activityUpdate = this.sceneState
        .advanceNativeOperation0050Activity();
      if (activityUpdate) {
        const accepted = this.operation0050Adapters.updateActivity?.(
          activityUpdate,
        );
        if (accepted !== true) {
          throw new Error("operation 0x0050 activity update was rejected");
        }
      }
    }
    const slotIndex = active.spatialSelectorSlot;
    if (Number.isSafeInteger(slotIndex)) {
      const offset = spatialInteractionStateOffset(slotIndex);
      const value = this.sceneState.readNativeField({
        offset,
        width: 1,
      });
      if (Number.isInteger(value) && value !== 0) {
        this.sceneState.writeNativeField({ offset, width: 1, value: 0 });
      }
    }
    const result = this.transactionAdapters.update?.({
      ...detail,
      external: active.external,
    });
    if (result && typeof result.then === "function") {
      throw new TypeError(
        "native room-script transaction adapters must be synchronous",
      );
    }
    return true;
  }

  commitTransaction(token, detail = {}) {
    const active = this.requireTransaction(token);
    if (this.sceneState.readNativeOperation0050Activity()) {
      throw new Error("cannot commit while an AUTH activity is active");
    }
    this.sceneState.endPrimaryRuntimeEvent();
    if (active.currentEventProfile.applied) {
      this.sceneState.clearCurrentEventControlRecord();
    }
    if (active.programOwnershipOpen) {
      if (typeof this.operation0050Adapters.completeProgram !== "function") {
        throw new Error(
          "native AUTH program ownership has no completion adapter",
        );
      }
      const ownershipResult = this.operation0050Adapters.completeProgram({
        ...detail,
        ownership: active.programOwnership,
      });
      if (ownershipResult && typeof ownershipResult.then === "function") {
        throw new TypeError(
          "native AUTH program ownership adapters must be synchronous",
        );
      }
      if (ownershipResult !== true) {
        throw new Error("native AUTH program ownership completion was rejected");
      }
      // The package presentation lease is now terminal. If a later external
      // commit fails, rollback must restore only resources that remain open.
      active.programOwnershipOpen = false;
    }
    const result = this.transactionAdapters.commit?.({
      ...detail,
      external: active.external,
    });
    if (result && typeof result.then === "function") {
      throw new TypeError(
        "native room-script transaction adapters must be synchronous",
      );
    }
    this.activeTransaction = null;
    return true;
  }

  rollbackTransaction(token, reason, detail = {}) {
    const active = this.requireTransaction(token);
    const activity = this.sceneState.readNativeOperation0050Activity();
    const cleanupErrors = [];
    if (activity) {
      try {
        if (
          typeof this.operation0050Adapters.rollbackActivity !== "function"
          || this.operation0050Adapters.rollbackActivity(reason) !== true
        ) {
          throw new Error("operation 0x0050 activity rollback was rejected");
        }
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    try {
      this.sceneState.restore(active.snapshot);
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      if (!this.clockRecordState.restore(active.clockRecordSnapshot)) {
        throw new Error("native clock record snapshot restoration was rejected");
      }
    } catch (error) {
      cleanupErrors.push(error);
    }
    try {
      const result = this.transactionAdapters.rollback?.({
        ...detail,
        reason,
        external: active.external,
      });
      if (result && typeof result.then === "function") {
        throw new TypeError(
          "native room-script transaction adapters must be synchronous",
        );
      }
    } catch (error) {
      cleanupErrors.push(error);
    }
    if (active.programOwnershipOpen) {
      try {
        if (typeof this.operation0050Adapters.rollbackProgram !== "function") {
          throw new Error(
            "native AUTH program ownership has no rollback adapter",
          );
        }
        const ownershipResult = this.operation0050Adapters.rollbackProgram({
          ...detail,
          reason,
          ownership: active.programOwnership,
        });
        if (ownershipResult && typeof ownershipResult.then === "function") {
          throw new TypeError(
            "native AUTH program ownership adapters must be synchronous",
          );
        }
        if (ownershipResult !== true) {
          throw new Error("native AUTH program ownership rollback was rejected");
        }
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    this.activeTransaction = null;
    if (cleanupErrors.length === 1) throw cleanupErrors[0];
    if (cleanupErrors.length > 1) {
      throw new AggregateError(
        cleanupErrors,
        "native room-script transaction rollback failed",
      );
    }
    return true;
  }

  requireTransaction(token) {
    if (!this.activeTransaction || this.activeTransaction.token !== token) {
      throw new Error("native room-script transaction is not active");
    }
    return this.activeTransaction;
  }
}

export function createNativeRoomScriptRuntime(options) {
  return new NativeRoomScriptRuntime(options);
}
