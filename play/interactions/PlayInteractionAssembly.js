import { runtimeAssetGroup } from "../../src/RuntimeAssets.js";
import { AuthMovementRuntime } from "./AuthMovementRuntime.js";
import { CinemaSeatInteractions } from "./CinemaSeatInteractions.js";
import { ClockInteractions } from "./ClockInteractions.js";
import { DobuitaInteractionProps } from "./DobuitaInteractionProps.js";
import { DoorInteractions } from "./DoorInteractions.js";
import { DrawerInteractions } from "./DrawerInteractions.js";
import { InspectableInteractions } from "./InspectableInteractions.js";
import { InteractionManager } from "./InteractionManager.js";
import { ScriptedInteractionRuntime } from "./ScriptedInteractionRuntime.js";
import { VendingDrinkProp } from "./VendingDrinkProp.js";
import { VendingInteractions, vendingInteractionPose } from "./VendingInteractions.js";
import { WorldInteractionDispatcher } from "./WorldInteractionDispatcher.js";
import { applyNativeDoorCollisionStates } from "../world/NativeWorldCollision.js";
import { PlacementRuntime } from "../world/PlacementRuntime.js";

const bundledModels = runtimeAssetGroup("play/assets/dobuita/*.CHRM");
const bundledTextures = runtimeAssetGroup("play/assets/dobuita/*_textures.bin");
const bundledAuth = runtimeAssetGroup("play/assets/dobuita/*.AUTH");

export class PlayInteractionAssembly {
  constructor({
    scene,
    sceneState,
    modelOffset,
    dom,
    fetchArrayBuffer,
    signedRenderKey,
    getActorRoot,
    getCharacterRoot,
    getCharacterPoseAt,
    getController,
    worldSounds,
    getMultiplayerClient,
    publishPresence,
    playEmote,
    runtimeEmotes,
    fallbackEmotes,
    getAnimation,
    getRetargetMatrices,
    getNativeSceneState,
    arcadeCoordinator,
    getPoolRuntime,
    transientNotice,
    localDebug,
  }) {
    this.clock = new ClockInteractions({ signedRenderKey });
    this.drawer = new DrawerInteractions({
      signedRenderKey,
      onAudioCue: cue => worldSounds.handleInteractionCue(cue),
    });
    this.door = new DoorInteractions({
      signedRenderKey,
      getActorPosition: () => getActorRoot().getAbsolutePosition(),
      setMetadata: (...args) => this.setMetadata(...args),
      onAudioCue: cue => worldSounds.handleInteractionCue(cue),
      onCollisionStatesChanged: doors => {
        applyNativeDoorCollisionStates(sceneState.currentMeshes, doors);
      },
    });
    this.inspectable = new InspectableInteractions({
      dom,
      signedRenderKey,
      runtimeEmotes,
      fallbackEmotes,
      playEmote,
      setMetadata: (...args) => this.setMetadata(...args),
      showNotice: (text, duration) => transientNotice.show(text, duration),
      clearNotice: () => transientNotice.hide(),
    });
    this.authMovement = new AuthMovementRuntime({
      assetUrls: bundledAuth,
      fetchArrayBuffer,
      setMetadata: (...args) => this.setMetadata(...args),
      setInteractionHint: text => this.inspectable.showHint(text),
    });
    this.vendingProp = new VendingDrinkProp({
      scene,
      state: sceneState,
      modelOffset,
      fetchArrayBuffer,
      getCharacterRoot,
      getCharacterPoseAt,
    });
    this.vending = new VendingInteractions({
      dom,
      setMetadata: (...args) => this.setMetadata(...args),
      setMovementLocked: locked => getController()?.setMovementLocked(locked),
      showHint: text => this.inspectable.showHint(text),
      purchase: (machineId, drinkKey) => {
        const client = getMultiplayerClient();
        if (!client) return Promise.reject(new Error("The server is not connected."));
        publishPresence(true);
        return client.purchaseVending(machineId, drinkKey);
      },
      playEmote,
      runtimeEmotes,
      drinkProp: this.vendingProp,
      approach: (entry, signal) => {
        getAnimation().clearEmote();
        const {position, yaw} = vendingInteractionPose(entry.root);
        return getController().approachTo(position, yaw, {signal});
      },
    });
    this.manager = new InteractionManager({
      drawers: this.drawer,
      doors: this.door,
      clocks: this.clock,
      inspectables: this.inspectable,
      vending: this.vending,
      authMovement: this.authMovement,
      getActorPosition: () => getActorRoot().getAbsolutePosition(),
      autoCloseDistance: 5,
    });
    this.dobuitaProps = new DobuitaInteractionProps({
      scene,
      state: sceneState,
      modelOffset,
      bundledModels,
      fetchArrayBuffer,
      getActiveEmote: () => getAnimation().activeEmote,
      getAnimationState: () => getAnimation().state,
      getRetargetMatrices,
      getNativeSceneState,
    });
    this.placement = new PlacementRuntime({
      scene,
      state: sceneState,
      bundledModels,
      bundledTextures,
      fetchArrayBuffer,
      setMetadata: (...args) => this.setMetadata(...args),
      drawerInteractions: this.drawer,
      doorInteractions: this.door,
      clockInteractions: this.clock,
      inspectableInteractions: this.inspectable,
      vendingInteractions: this.vending,
      authMovementRuntime: this.authMovement,
      preparePlacedRoots: async placedRoots => {
        this.vending.bindBins(placedRoots);
        await this.dobuitaProps.prepare(placedRoots);
        arcadeCoordinator.bind(placedRoots);
        getPoolRuntime()?.bind(placedRoots);
      },
      localDebug,
    });
    this.cinemaSeat = null;
    this.scripted = null;
    this.dispatcher = null;
  }

  setMetadata(root, property, value) {
    for (const node of [root, ...root.getDescendants(false)]) {
      node.metadata = { ...(node.metadata || {}), [property]: value };
    }
  }

  createCinemaSeat(options) {
    this.cinemaSeat = new CinemaSeatInteractions({
      ...options,
      setMetadata: (...args) => this.setMetadata(...args),
    });
    return this.cinemaSeat;
  }

  createDispatcher({ scripted, dispatcher }) {
    this.scripted = new ScriptedInteractionRuntime(scripted);
    this.dispatcher = new WorldInteractionDispatcher({
      ...dispatcher,
      interactions: {
        authMovement: this.authMovement,
        cinemaSeat: this.cinemaSeat,
        clock: this.clock,
        door: this.door,
        drawer: this.drawer,
        inspectable: this.inspectable,
        vending: this.vending,
      },
      scriptedInteractions: this.scripted,
    });
    this.dispatcher.start();
    return this.dispatcher;
  }
}
