import { hasNativeDialogueSelector } from "../dialogue/NativeDialogueSelector.js";
import { isWithinDialogueRange } from "../dialogue/DialogueProximity.js";
import { playerWorldInteractionAllowed } from "./PlayerWorldInteractionPolicy.js";

const FALLBACK_SCRIPT_CODES = new Set([
  "no_script",
  "unavailable",
  "area_unavailable",
]);

export class ScriptedInteractionRuntime {
  constructor({
    accountSession,
    getActorRoot,
    getCurrentGameDate,
    getMultiplayerClient,
    getPresentationOwned,
    getWorld,
    nativeDialogueOverlay,
    nativeDialoguePersistence,
    nativeRoomScriptRuntime,
    nativeScriptedEventRuntime,
    readNativeDialogueActorRuntimeValue,
    scheduledActorNetworkState,
    scriptEventController,
    transientNotice,
  }) {
    Object.assign(this, {
      accountSession,
      getActorRoot,
      getCurrentGameDate,
      getMultiplayerClient,
      getPresentationOwned,
      getWorld,
      nativeDialogueOverlay,
      nativeDialoguePersistence,
      nativeRoomScriptRuntime,
      nativeScriptedEventRuntime,
      readNativeDialogueActorRuntimeValue,
      scheduledActorNetworkState,
      scriptEventController,
      transientNotice,
    });
  }

  canStart() {
    return playerWorldInteractionAllowed({
      world: this.getWorld(),
      presentationOwned: Boolean(this.getPresentationOwned()),
    });
  }

  startNativeNpc(npcSelection) {
    if (!this.canStart()) return false;
    const world = this.getWorld();
    const actorRoot = this.getActorRoot();
    const npcPosition = npcSelection.root.getAbsolutePosition?.()
      || npcSelection.root.position;
    const withinDialogueRange = isWithinDialogueRange(
      actorRoot.position,
      npcPosition,
    );
    const hasNativeDialogue = hasNativeDialogueSelector(
      npcSelection.actorCode,
    );
    const hasScriptedInteraction = this.nativeScriptedEventRuntime
      .hasInteraction(world.nativeArea, npcSelection.actorCode);
    if (!hasNativeDialogue && !hasScriptedInteraction) {
      this.transientNotice.show("This NPC has no dialogue.");
      return false;
    }
    const sessionOptions = this.nativeDialoguePersistence.sessionOptions();
    if (!sessionOptions) {
      this.transientNotice.show("Dialogue is unavailable right now.");
      return false;
    }
    if (hasScriptedInteraction) {
      const gameplayState = this.nativeDialoguePersistence.gameplayState();
      const context = {
        dialogueState: gameplayState?.dialogueState,
        nativePersistentScriptBitState:
          gameplayState?.persistentScriptBitState,
        gameDate: this.getCurrentGameDate(),
        playerPosition: actorRoot.position,
        playerYaw: actorRoot.rotation.y,
      };
      const selectedActorState = this.scheduledActorNetworkState.stateFor(
        npcSelection.id,
      );
      if (
        selectedActorState
        && [selectedActorState.x, selectedActorState.y, selectedActorState.z]
          .every(Number.isFinite)
      ) {
        context.selectedActorNativePosition = [
          Math.fround(selectedActorState.x),
          Math.fround(selectedActorState.y),
          Math.fround(selectedActorState.z),
        ];
      }
      const gate = this.nativeScriptedEventRuntime.evaluateInteraction({
        area: world.nativeArea,
        actorCode: npcSelection.actorCode,
        context,
      });
      if (!gate.resolved) {
        console.warn("Native scripted interaction gate unresolved:", gate);
        this.transientNotice.show("Dialogue is unavailable right now.");
        return false;
      }
      if (gate.matched) {
        void this.nativeScriptedEventRuntime.startActorInteraction({
          area: world.nativeArea,
          actorCode: npcSelection.actorCode,
          sceneActor: {
            id: npcSelection.id,
            actorCode: npcSelection.actorCode,
          },
          context,
        });
        return true;
      }
    }
    if (!hasNativeDialogue) {
      this.transientNotice.show("This NPC has no dialogue right now.");
      return false;
    }
    if (!withinDialogueRange) {
      this.transientNotice.show("NPC is too far to talk to.");
      return false;
    }
    this.nativeDialogueOverlay.start({
      actorCode: npcSelection.actorCode,
      sceneActor: {
        id: npcSelection.id,
        actorCode: npcSelection.actorCode,
      },
      context: {
        currentMapIdentity: world.nativeArea,
        playerPosition: actorRoot.position,
        gameDate: this.getCurrentGameDate(),
        yen: this.accountSession.character?.yen,
        readActorRuntimeValue: this.readNativeDialogueActorRuntimeValue,
      },
      ...sessionOptions,
    });
    return true;
  }

  async startNpc(npcSelection) {
    if (!this.canStart()) return;
    if (this.scriptEventController.status !== "idle") {
      this.transientNotice.show("Finish the current conversation first.");
      return;
    }
    this.getMultiplayerClient()?.forcePresence();
    try {
      const result = await this.scriptEventController.start({
        kind: "talk",
        actor: npcSelection.actorCode,
      }, {
        area: this.getWorld().nativeArea,
        actorCode: npcSelection.actorCode,
        actorInstanceId: npcSelection.id,
      });
      if (!this.canStart()) return;
      if (
        result.outcome === "declined"
        || (result.outcome === "rejected"
          && FALLBACK_SCRIPT_CODES.has(result.error.code))
      ) this.startNativeNpc(npcSelection);
      else if (result.outcome === "rejected") {
        this.transientNotice.show(result.error.message);
      }
    } catch (error) {
      if (!this.canStart()) return;
      if (error?.code === "connection_unavailable") {
        this.startNativeNpc(npcSelection);
      } else if (![
        "start_cancelled",
        "start_interrupted",
      ].includes(error?.code)) {
        console.error("Database NPC script start failed:", error);
        this.transientNotice.show("Dialogue is unavailable right now.");
      }
    }
  }

  startNativeObject(inspectable, objectTag) {
    if (!this.canStart()) return false;
    const world = this.getWorld();
    const context = {
      selectedObjectTag: objectTag,
      selectedObjectAction: 1,
      nativePersistentScriptBitState: this.nativeDialoguePersistence
        .gameplayState()?.persistentScriptBitState,
      ...this.nativeRoomScriptRuntime.eventContext(),
    };
    const gate = this.nativeScriptedEventRuntime.evaluateObjectInteraction({
      area: world.nativeArea,
      objectTag,
      context,
    });
    if (!gate.resolved) {
      console.warn("Native object interaction gate unresolved:", gate);
      this.transientNotice.show("This interaction is unavailable right now.");
      return false;
    }
    if (!gate.matched) return false;
    void this.nativeScriptedEventRuntime.startObjectInteraction({
      area: world.nativeArea,
      objectTag,
      sceneObject: { objectTag, root: inspectable.root },
      context,
    });
    return true;
  }

  async startObject({ objectSelector, objectTag, root, fallback }) {
    if (!this.canStart()) return;
    if (this.scriptEventController.status !== "idle") {
      this.transientNotice.show("Finish the current interaction first.");
      return;
    }
    this.getMultiplayerClient()?.forcePresence();
    const context = {
      area: this.getWorld().nativeArea,
      objectTag,
      sceneObject: { objectTag, root },
      nativeContext: this.nativeRoomScriptRuntime.eventContext(),
    };
    try {
      const result = await this.scriptEventController.start({
        kind: "use",
        object: objectSelector,
      }, context);
      if (!this.canStart()) return;
      if (
        result.outcome === "declined"
        || (result.outcome === "rejected"
          && FALLBACK_SCRIPT_CODES.has(result.error.code))
      ) fallback();
      else if (result.outcome === "rejected") {
        this.transientNotice.show(result.error.message);
      }
    } catch (error) {
      if (!this.canStart()) return;
      if (error?.code === "connection_unavailable") fallback();
      else if (![
        "start_cancelled",
        "start_interrupted",
      ].includes(error?.code)) {
        console.error("Database object script start failed:", error);
        this.transientNotice.show("This interaction is unavailable right now.");
      }
    }
  }
}
