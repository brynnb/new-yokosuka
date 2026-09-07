import { runtimeAssetGroup, runtimeAssetUrl } from "../../src/RuntimeAssets.js";
import { interpolateMatrixRouteMaps } from "../../src/AnimationMatrixInterpolation.js";
import { scheduledActorsForWorld } from "../../src/PlayScheduledActors.js";
import {
  composeScheduledActorDefinitions,
} from "../../src/ScheduledActorDefinitionCollection.js";
import {
  nativeCutscenePackageRegistry,
} from "../cutscenes/PlayNativeCutsceneDirector.js";
import {
  bundledCharacterAsset,
  bundledCharacterModels,
  bundledCharacterTextures,
} from "../config/characters.js";
import { CharacterRuntime } from "./CharacterRuntime.js";
import { PlayerRuntime } from "./PlayerRuntime.js";
import {
  playableLocomotionModelYawOffset,
  PlayableLocomotionRuntime,
} from "./PlayableLocomotionRuntime.js";
import { createRemoteAvatar } from "./RemoteAvatarFactory.js";
import {
  scheduledActorLocalObjectModelRequirements,
  ScheduledActorRuntime,
} from "./ScheduledActorRuntime.js";
import {
  ScheduledActorMotionRuntime,
} from "./ScheduledActorMotionRuntime.js";
import ma00RaceManifest from "../data/ma00-race-scheduled-actors.json";
const scheduledMbasMotionUrl = runtimeAssetUrl("play/assets/scheduled-actors/M_MBAS.BIN");
const scheduledMobjMotionUrl = runtimeAssetUrl("play/assets/scheduled-actors/M_MOBJ.BIN");
const shenmue2NpcMotionUrl = runtimeAssetUrl("play/assets/shenmue2-motion/NPC.MOT");
const shenmue2NpcTableMotionUrl = runtimeAssetUrl("play/assets/shenmue2-motion/NPC_TBL.MOT");
const shenmue2MotionUrl = runtimeAssetUrl("play/assets/shenmue2-motion/MOTION.MOT");

const shenmue2AreaMotionUrls = runtimeAssetGroup("play/assets/shenmue2-motion/NPC_*.MOT");
const shenmue2AreaMotionBankUrls = Object.fromEntries(
  Object.entries(shenmue2AreaMotionUrls)
    .filter(([filename]) => !filename.endsWith("NPC_TBL.MOT"))
    .map(([filename, url]) => {
      const stem = filename.split("/").at(-1).replace(/^NPC_|\.MOT$/g, "");
      return [`npc${stem}`, url];
    }),
);

export class PlayCharacterAssembly {
  constructor({
    scene,
    sceneState,
    renderMatrixByKey,
    fetchArrayBuffer,
    getWorld,
    getGameDate,
    getCameraOcclusionTarget,
    networkState,
    localDebug,
    remoteAvatar,
  }) {
    this.scene = scene;
    this.renderMatrixByKey = renderMatrixByKey;
    this.fetchArrayBuffer = fetchArrayBuffer;
    this.remoteAvatar = remoteAvatar;
    this.characterRuntime = new CharacterRuntime({
      scene,
      renderMatrixByKey,
      fetchArrayBuffer,
    });
    this.motionRuntime = new ScheduledActorMotionRuntime({
      renderMatrixByKey,
      characterRuntime: this.characterRuntime,
      fetchArrayBuffer,
      bankUrls: {
        mbas: scheduledMbasMotionUrl,
        free: "/motion/MOTION.BIN",
        mobj: scheduledMobjMotionUrl,
        s2Npc: shenmue2NpcMotionUrl,
        s2NpcTable: shenmue2NpcTableMotionUrl,
        s2Motion: shenmue2MotionUrl,
        ...shenmue2AreaMotionBankUrls,
      },
    });
    this.locomotionRuntime = new PlayableLocomotionRuntime({
      motionRuntime: new ScheduledActorMotionRuntime({
        renderMatrixByKey,
        characterRuntime: this.characterRuntime,
        fetchArrayBuffer,
        bankUrls: { mobj: scheduledMobjMotionUrl },
      }),
    });
    this.scheduledActors = new ScheduledActorRuntime({
      scene,
      state: sceneState,
      fetchArrayBuffer,
      bundledCharacterAsset,
      bundledCharacterModels,
      bundledCharacterTextures,
      suppressDetachedCharacterVariants: (root, character) => (
        this.characterRuntime.suppressDetachedVariants(root, character)
      ),
      getActiveWorldId: () => getWorld().id,
      getGameDate,
      getCameraOcclusionTarget,
      getCameraFadeEnabled: () => !getWorld().cutsceneOnly,
      networkState,
      motionRuntime: this.motionRuntime,
      debugPickable: localDebug,
      interactionPickable: true,
    });
    this.playerRuntime = null;
  }

  createPlayer(options) {
    if (this.playerRuntime) return this.playerRuntime;
    this.playerRuntime = new PlayerRuntime({
      ...options,
      characterRuntime: this.characterRuntime,
      locomotionRuntime: this.locomotionRuntime,
    });
    return this.playerRuntime;
  }

  async definitionsForWorld(world) {
    const actors = await scheduledActorsForWorld(world.id);
    const activityActors = nativeCutscenePackageRegistry
      .actorDefinitionsForWorld(world.id);
    if (world.id !== "ma00race" && activityActors.length === 0) return actors;
    return composeScheduledActorDefinitions([
      actors,
      world.id === "ma00race" ? ma00RaceManifest.actors : [],
      activityActors,
    ], {
      worldId: world.id,
      localObjectModelRequirements:
        scheduledActorLocalObjectModelRequirements,
    });
  }

  signedRenderKey(node) {
    return this.characterRuntime.signedRenderKey(node);
  }

  retargetMatrices(routedMatrices) {
    return this.characterRuntime.retarget(routedMatrices);
  }

  async createRemoteAvatar(characterId, initialPosition) {
    const playerRuntime = this.playerRuntime;
    if (!playerRuntime) throw new Error("player runtime is not initialized");
    return createRemoteAvatar({
      scene: this.scene,
      characterId,
      initialPosition,
      createCharacterModel: character => (
        this.characterRuntime.createModel(character)
      ),
      buildRetargetMatrices: (loader, root) => (
        this.characterRuntime.buildRetargetMatrices(loader, root)
      ),
      modelForwardYawOffset: retargetByRenderKey => (
        this.characterRuntime.modelForwardYawOffset(retargetByRenderKey)
      ),
      playableModelYawOffset: playableLocomotionModelYawOffset,
      buildForkliftArmRetargetProfile: (loader, root) => (
        this.characterRuntime.buildMirroredForkliftArmRetargetProfile(
          loader,
          root,
        )
      ),
      retargetMatrices: (routes, retargetByRenderKey) => (
        this.characterRuntime.retargetWithMap(routes, retargetByRenderKey)
      ),
      retargetForkliftArmMatrices: (routes, retargetByRenderKey, profile) => (
        this.characterRuntime.retargetMirroredForkliftArms(
          routes,
          retargetByRenderKey,
          profile,
        )
      ),
      clipRoutesAt: (...args) => playerRuntime.animation.clipRoutesAt(...args),
      remoteEmoteRoutes: (...args) => (
        playerRuntime.animation.remoteEmoteRoutes(...args)
      ),
      isKnownEmote: this.remoteAvatar.isKnownEmote,
      interpolateRoutes: interpolateMatrixRouteMaps,
      characterMinimumWorldY: root => this.characterRuntime.minimumWorldY(root),
      nativeLocomotionRuntime: this.locomotionRuntime,
      forkliftModelForId: this.remoteAvatar.forkliftModelForId,
      chassisTiltFromOrientation:
        this.remoteAvatar.chassisTiltFromOrientation,
      quaternionFromNetworkState:
        this.remoteAvatar.quaternionFromNetworkState,
      forkliftEffects: this.remoteAvatar.getForkliftEffects(),
    });
  }
}
