export function createNativeSceneFieldRuntimeContext(
  sceneState,
  { collectionState, operation01c7State } = {},
) {
  if (
    !sceneState
    || typeof sceneState.readNativeField !== "function"
    || typeof sceneState.writeNativeField !== "function"
  ) {
    throw new TypeError("native scene gameplay state is required");
  }
  return {
    ...(operation01c7State
      ? {
          queryNativeOperation01c7Status: () => (
            operation01c7State.queryStatus()
          ),
          writeNativeOperation01c7Boolean: value => (
            operation01c7State.writeBooleanDword(value)
          ),
          readNativeOperation01c7ParameterByte: offset => (
            operation01c7State.readParameterByte(offset)
          ),
          writeNativeOperation01c7ParameterByte: (offset, value) => (
            operation01c7State.writeParameterByte(offset, value)
          ),
          readNativeOperation01c7ParameterFloat: offset => (
            operation01c7State.readParameterFloat(offset)
          ),
          writeNativeOperation01c7ParameterFloat: (offset, value) => (
            operation01c7State.writeParameterFloat(offset, value)
          ),
        }
      : {}),
    ...(collectionState
      ? {
          planPrimaryCollectionIncrement: detail => (
            collectionState.planPrimaryIncrement(detail)
          ),
          commitPrimaryCollectionIncrement: plan => (
            collectionState.commitPrimaryIncrement(plan)
          ),
          planAuxiliaryCollectionIncrement: detail => (
            collectionState.planAuxiliaryIncrement(detail)
          ),
          commitAuxiliaryCollectionIncrement: plan => (
            collectionState.commitAuxiliaryIncrement(plan)
          ),
          queryPrimaryCollectionByte: index => (
            collectionState.queryPrimaryByte(index)
          ),
          queryAuxiliaryCollectionByte: index => (
            collectionState.queryAuxiliaryByte(index)
          ),
          finalizeAuxiliaryCollectionMutation: () => (
            collectionState.compactAuxiliaryRecords()
          ),
        }
      : {}),
    readSceneField: descriptor => sceneState.readNativeField(
      Number.isInteger(descriptor)
        ? { offset: descriptor, width: 4 }
        : descriptor,
    ),
    writeSceneField: descriptor => sceneState.writeNativeField(descriptor),
    planGlobalControllerInitialize: value => (
      sceneState.planGlobalControllerInitialize(value)
    ),
    planGlobalControllerReset: () => (
      sceneState.planGlobalControllerReset()
    ),
    commitGlobalControllerPlan: plan => (
      sceneState.commitGlobalControllerPlan(plan)
    ),
    queryGlobalControllerStatus: () => (
      sceneState.queryGlobalControllerStatus()
    ),
    pollGlobalControllerEvent: () => (
      sceneState.pollGlobalControllerEvent()
    ),
    enqueueGlobalControllerEvent: eventCode => (
      sceneState.enqueueGlobalControllerEvent(eventCode)
    ),
    initializeGlobalControllerRange: detail => (
      sceneState.initializeGlobalControllerRange(detail)
    ),
    writeGlobalControllerByteSelection: detail => (
      sceneState.writeGlobalControllerByteSelection(detail)
    ),
    cleanupGlobalControllerRange: detail => (
      sceneState.writeGlobalControllerByteSelection(detail)
    ),
    updateInteractionRecord: detail => (
      sceneState.writeInteractionRecordFields(detail.index, detail.values)
    ),
    writeInteractionContextWord56: value => (
      sceneState.writeInteractionContextWord56(value)
    ),
    queryInteractionManagerIndirectIndex: (descriptorIndex, key) => (
      sceneState.queryInteractionManagerIndirectIndex(descriptorIndex, key)
    ),
    queryNearestInteractionManagerDescriptor: (targetWords, key) => (
      sceneState.queryNearestInteractionManagerDescriptor(targetWords, key)
    ),
    allocateInteractionManagerRuntimeSlot: (firstWord, secondWord) => (
      sceneState.allocateInteractionManagerRuntimeSlot(firstWord, secondWord)
    ),
    consumeInteractionManagerRuntimeSlotStatus: index => (
      sceneState.consumeInteractionManagerRuntimeSlotStatus(index)
    ),
    readActorXmptSelectorActive: (actorTag, selector) => (
      sceneState.readActorXmptSelectorActive(actorTag, selector)
    ),
    writeNativeOperation0199ControlDword: value => (
      sceneState.writeNativeOperation0199ControlDword(value)
    ),
    readNativeOperation0199StatusByte: () => (
      sceneState.readNativeOperation0199StatusByte()
    ),
    writeNativeOperation0174GlobalDword: value => (
      sceneState.writeNativeOperation0174GlobalDword(value)
    ),
    writeNativeOperation0166Mode28GlobalDword: value => (
      sceneState.writeNativeOperation0166Mode28GlobalDword(value)
    ),
    planNativeOperation0166Mode29Poll: () => (
      sceneState.planNativeOperation0166Mode29Poll()
    ),
    commitNativeOperation0166Mode29Poll: plan => (
      sceneState.commitNativeOperation0166Mode29Poll(plan)
    ),
    consumeNativeOperation01bdGlobalDword: () => (
      sceneState.consumeNativeOperation01bdGlobalDword()
    ),
    writeNativeOperation014fGlobalFloatWord: value => (
      sceneState.writeNativeOperation014fGlobalFloatWord(value)
    ),
    writeNativeObjectVectorComponent: detail => (
      sceneState.writeNativeObjectVectorComponent(detail)
    ),
    writeNativeOperation0052TableEntry: detail => (
      sceneState.writeNativeOperation0052TableEntry(detail)
    ),
    queryCurrentEventControlField: selector => (
      sceneState.queryCurrentEventControlField(selector)
    ),
    planPrimaryRuntimeTransition: mode => (
      sceneState.planPrimaryRuntimeTransition(mode)
    ),
    commitPrimaryRuntimeTransition: plan => (
      sceneState.commitPrimaryRuntimeTransition(plan)
    ),
    installCurrentPresentationOwner: owner => (
      sceneState.installCurrentPresentationOwner(owner)
    ),
    invokePrimaryRuntimeTransition: argument => (
      sceneState.invokePrimaryRuntimeTransition(argument)
    ),
    queryPrimaryRuntimeStateOne: () => (
      sceneState.queryPrimaryRuntimeStateOne()
    ),
    queryPrimaryRuntimeStatusByte: () => (
      sceneState.queryPrimaryRuntimeStatusByte()
    ),
    initializeSceneObjectVector: detail => (
      sceneState.initializeObjectVector(detail)
    ),
    readObjectRuntimeFlag: objectTag => (
      sceneState.readObjectRuntimeFlag(objectTag)
    ),
    writeObjectRuntimeFlag: (objectTag, enabled) => (
      sceneState.writeObjectRuntimeFlag(objectTag, enabled)
    ),
    readObjectPresentationFlag: objectTag => (
      sceneState.readObjectPresentationFlag(objectTag)
    ),
    writeObjectPresentationFlag: (objectTag, enabled) => (
      sceneState.writeObjectPresentationFlag(objectTag, enabled)
    ),
    writeObjectImgmSelection: (objectTag, selection) => (
      sceneState.writeObjectImgmSelection(objectTag, selection)
    ),
    readObjectImgmSelection: objectTag => (
      sceneState.readObjectImgmSelection(objectTag)
    ),
    nativeObjectImgmSelectionState:
      sceneState.nativeObjectImgmSelectionState,
    nativeMomtVectorSlotState: sceneState.nativeMomtVectorSlotState,
    planNativeMomtVectorSlotWrite: detail => (
      sceneState.planNativeMomtVectorSlotWrite(detail)
    ),
    commitNativeMomtVectorSlotWrite: (plan, sourceWords, storedWords) => (
      sceneState.commitNativeMomtVectorSlotWrite(
        plan,
        sourceWords,
        storedWords,
      )
    ),
    nativeTaggedObjectActionState: sceneState.taggedObjectActions,
    nativeTaggedObjectControllerState: sceneState.taggedObjectController,
    applySceneObjectVectorOperation: detail => (
      sceneState.applyObjectVectorOperation(detail)
    ),
    writeSceneObjectScaleVector: (objectTag, vector) => (
      sceneState.writeObjectScaleVector(objectTag, vector)
    ),
    readSceneObjectBaseVector: detail => (
      sceneState.readObjectBaseVector(detail)
    ),
    readSceneObjectMotmComponentVector: detail => (
      sceneState.readObjectMotmComponentVector(detail)
    ),
    transformSceneObjectPointToDirectSpace: detail => (
      sceneState.transformObjectPointToDirectSpace(detail)
    ),
    applyActorLookPointOptimizedUpdate: detail => (
      sceneState.applyActorLookPointOptimizedUpdate(detail)
    ),
    configureActorControllerWordState: detail => (
      sceneState.configureActorControllerWordState(detail)
    ),
    planActorControllerWordWrite: detail => (
      sceneState.planActorControllerWordWrite(detail)
    ),
    commitActorControllerWordWrite: plan => (
      sceneState.commitActorControllerWordWrite(plan)
    ),
    applyActorControllerModeControl: detail => (
      sceneState.applyActorControllerModeControl(detail)
    ),
    applyActorMhndControllerRequest: detail => (
      sceneState.applyActorMhndControllerRequest(detail)
    ),
    configureActorFieldState: detail => (
      sceneState.configureActorFieldState(detail)
    ),
    accessActorDword7c: detail => sceneState.accessActorDword7c(detail),
    accessObjectB8Bc: detail => sceneState.accessObjectB8Bc(detail),
    applyActorOsagNodeAndFlagSet: detail => (
      sceneState.applyActorOsagNodeAndFlagSet(detail)
    ),
    planActorFaceClipControl: detail => (
      sceneState.planActorFaceClipControl(detail)
    ),
    commitActorFaceClipControl: plan => (
      sceneState.commitActorFaceClipControl(plan)
    ),
    applyResolvedObjectMapcControl: detail => (
      sceneState.applyObjectMapcControl(detail)
    ),
    nativeOperation013cState: sceneState.nativeOperation013cState,
    nativeOperation013eState: sceneState.nativeOperation013eState,
    nativeTransientSlotState: sceneState.nativeTransientSlotState,
    nativeNumberedMapLayerState: sceneState.nativeNumberedMapLayerState,
    nativeOperation0050State: sceneState.nativeOperation0050State,
    nativeOperation0166State: sceneState.nativeOperation0166State,
    getNativeProceduralModelControllerState: () => (
      sceneState.nativeProceduralModelControllerState
    ),
    nativeCameraShakeState: sceneState.nativeCameraShakeState,
    clearNativeOperation0166ModeTwoLinkedRecords: () => (
      sceneState.nativeOperation0166State.clearModeTwoLinkedRecords()
    ),
    releaseNativeOperation0166ModeThreeLists: () => (
      sceneState.nativeOperation0166State.releaseModeThreeLists()
    ),
    releaseNativeOperation0166ModeEighteenLists: () => (
      sceneState.nativeOperation0166State.releaseModeEighteenLists()
    ),
    nativeOperation0120State: sceneState.nativeOperation0120State,
    nativeOperation001cState: sceneState.nativeOperation001cState,
    nativeOperation008fState: sceneState.nativeOperation008fState,
    nativeOperation019fState: sceneState.nativeOperation019fState,
    nativeObjectDword5cState: sceneState.nativeObjectDword5cState,
    resolveNativeOperation013cRecord: pointer => (
      sceneState.nativeOperation013cState.resolveRecord(pointer)
    ),
    queryNativeOperation013cActivity: () => (
      sceneState.nativeOperation013cState.queryPlatformActivity()
    ),
    nativeTmnmRecords: sceneState.tmnmRecords,
    nativeScrollSpriteControlState: sceneState.scrollSpriteControlState,
    nativeAreaRequestState: sceneState.nativeAreaRequestState,
    nativeLightPresetState: sceneState.nativeLightPresetState,
    nativeEnvironmentPresetState: sceneState.nativeEnvironmentPresetState,
    nativeSceneOwnerFlagsState: sceneState.nativeSceneOwnerFlagsState,
    nativeControllerInputState: sceneState.nativeControllerInputState,
    nativeSecondaryMotionControlState:
      sceneState.nativeSecondaryMotionControlState,
    nativeOsagParameterState: sceneState.nativeOsagParameterState,
    nativeFaceControllerState: sceneState.faceControllerState,
    readNativeVector: pointer => sceneState.readNativeVector(pointer),
    writeNativeVector: (pointer, vector) => (
      sceneState.writeNativeVector(pointer, vector)
    ),
    writeResolvedObjectFaceRecord: detail => (
      sceneState.writeObjectFaceRecordRequest(detail)
    ),
    applyResolvedObjectFaceParameters: detail => (
      sceneState.applyObjectFaceParameterRequest(detail)
    ),
    planActorMomtFloatPairWrite: detail => (
      sceneState.planActorMomtFloatPairWrite(detail)
    ),
    applyActorMomtFlagBitZero: detail => (
      sceneState.applyActorMomtFlagBitZero(detail)
    ),
    applyActorMomtMask: detail => sceneState.applyActorMomtMask(detail),
    configureActorMomtByte6fState: detail => (
      sceneState.configureActorMomtByte6fState(detail)
    ),
    accessActorMomtByte6f: detail => (
      sceneState.accessActorMomtByte6f(detail)
    ),
    commitActorMomtFloatPairWrite: plan => (
      sceneState.commitActorMomtFloatPairWrite(plan)
    ),
    planActorMomtNumericQuery: detail => (
      sceneState.planActorMomtNumericQuery(detail)
    ),
    planActorMomtScaledOffset: detail => (
      sceneState.planActorMomtScaledOffset(detail)
    ),
    commitActorMomtScaledOffset: detail => (
      sceneState.commitActorMomtScaledOffset(detail)
    ),
    readMomtNumericGlobalDword: () => (
      sceneState.readMomtNumericGlobalDword()
    ),
    applyResolvedObjectCcowMask: detail => (
      sceneState.applyObjectCcowMaskControl(detail)
    ),
    applyResolvedObjectRefbValueWrite: detail => (
      sceneState.applyObjectRefbValueWrite(detail)
    ),
    applyResolvedObjectRefbControlInstall: detail => (
      sceneState.applyObjectRefbControlInstall(detail)
    ),
    planResolvedObjectRefbVectorWrite: detail => (
      sceneState.planObjectRefbVectorWrite(detail)
    ),
    commitResolvedObjectRefbVectorWrite: detail => (
      sceneState.commitObjectRefbVectorWrite(detail)
    ),
    installResolvedObjectFixoAttachment: detail => (
      sceneState.installObjectFixoAttachment(detail)
    ),
    resetResolvedObjectFixoRecord: detail => (
      sceneState.resetObjectFixoRecord(detail)
    ),
    applyActorFigpByte10: detail => (
      sceneState.applyActorFigpByte10(detail)
    ),
    applyResolvedObjectFigpBytePair: detail => (
      sceneState.applyObjectFigpBytePair(detail)
    ),
    applyResolvedObjectTelmControl: detail => (
      sceneState.applyObjectTelmControl(detail)
    ),
    applyIndexedBinaryRecordWrite: detail => (
      sceneState.applyIndexedBinaryRecordWrite(detail)
    ),
    applyIndexedControllerWrite: detail => (
      sceneState.applyIndexedControllerWrite(detail)
    ),
    planIndexedControllerReset: mode => (
      sceneState.planIndexedControllerReset(mode)
    ),
    commitIndexedControllerReset: plan => (
      sceneState.commitIndexedControllerReset(plan)
    ),
    planIndexedControllerFloat4Write: words => (
      sceneState.planIndexedControllerFloat4Write(words)
    ),
    commitIndexedControllerFloat4Write: plan => (
      sceneState.commitIndexedControllerFloat4Write(plan)
    ),
    planIndexedControllerInitialize: detail => (
      sceneState.planIndexedControllerInitialize(detail)
    ),
    commitIndexedControllerInitialize: plan => (
      sceneState.commitIndexedControllerInitialize(plan)
    ),
    applyResolvedObjectHndlHndrVectorInstall: detail => (
      sceneState.applyObjectHndlHndrVectorInstall(detail)
    ),
    planResolvedObjectHndlHndrComponentWrite: detail => (
      sceneState.planObjectHndlHndrComponentWrite(detail)
    ),
    commitResolvedObjectHndlHndrComponentWrite: (plan, vector) => (
      sceneState.commitObjectHndlHndrComponentWrite(plan, vector)
    ),
    applyResolvedObjectHndlHndrControllerRequest: detail => (
      sceneState.applyObjectHndlHndrControllerRequest(detail)
    ),
    applyResolvedObjectHndlHndrMotionRequest: detail => (
      sceneState.applyObjectHndlHndrMotionRequest(detail)
    ),
    applyResolvedObjectHndlHndrMotionControl: detail => (
      sceneState.applyObjectHndlHndrMotionControl(detail)
    ),
    writeNativeWordBit: detail => sceneState.writeNativeWordBit(detail),
    loadNamedResource: resource => sceneState.loadNamedResource(resource),
    releaseNamedResource: resource => (
      sceneState.releaseNamedResource(resource)
    ),
    reconcileNativeSoundBankSlots: requests => (
      sceneState.reconcileNativeSoundBankSlots(requests)
    ),
    writeSceneEightChannelTransition: detail => (
      sceneState.writeSceneEightChannelTransition(detail)
    ),
    isSceneEightChannelTransitionActive: () => (
      sceneState.isSceneEightChannelTransitionActive()
    ),
  };
}
