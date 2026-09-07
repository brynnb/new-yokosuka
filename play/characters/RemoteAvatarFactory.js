import * as BABYLON from "@babylonjs/core";
import { fetchAsset, getTexturePack } from "../../src/assetLoader.js";
import { ForkliftRig, createForkliftState } from "../../src/ForkliftRig.js";
import { Mt5Loader } from "../../src/Mt5Loader.js";
import { interpolationAlpha } from "../../src/multiplayer/interpolation.js";
import {
  GAME_TICKS_PER_SECOND,
  LOCOMOTION_BLEND_SECONDS,
  LOCOMOTION_STATES,
} from "../config/animations.js";
import {
  CHARACTER_BY_ID,
} from "../config/characters.js";
import {
  FORKLIFT_DRIVER_HORIZONTAL_OFFSET,
  FORKLIFT_ID_PATTERN,
} from "../config/forklifts.js";
import {
  configureMt5TexturePack,
} from "../assets/configureMt5TexturePack.js";

export async function createRemoteAvatar({
  scene,
  characterId,
  initialPosition,
  createCharacterModel,
  buildRetargetMatrices,
  modelForwardYawOffset,
  playableModelYawOffset,
  buildForkliftArmRetargetProfile,
  retargetMatrices,
  retargetForkliftArmMatrices,
  clipRoutesAt,
  remoteEmoteRoutes,
  isKnownEmote,
  interpolateRoutes,
  characterMinimumWorldY,
  nativeLocomotionRuntime,
  forkliftModelForId,
  chassisTiltFromOrientation,
  quaternionFromNetworkState,
  forkliftEffects,
}) {
  const character = CHARACTER_BY_ID.get(characterId)
    || CHARACTER_BY_ID.get("ryo");
  const actor = new BABYLON.TransformNode(
    `remote_actor_${crypto.randomUUID?.() || Date.now()}`,
    scene,
  );
  actor.position.copyFrom(initialPosition);
  const offset = new BABYLON.TransformNode(
    `${actor.name}_model_offset`,
    scene,
  );
  offset.parent = actor;
  offset.rotation.y = Math.PI;
  const vehiclePose = new BABYLON.TransformNode(
    `${actor.name}_vehicle_pose`,
    scene,
  );
  vehiclePose.parent = actor;
  vehiclePose.rotationQuaternion = BABYLON.Quaternion.Identity();
  const { loader, root } = await createCharacterModel(character);
  root.parent = offset;
  for (const node of [root, ...root.getDescendants(false)]) {
    node.isPickable = false;
    node.checkCollisions = false;
    node.metadata = {
      ...(node.metadata || {}),
      remotePlayer: true,
    };
  }
  const retargetByRenderKey = buildRetargetMatrices(loader, root);
  const nativeLocomotionModel = nativeLocomotionRuntime?.createModel(
    character,
    loader,
    root,
  );
  offset.rotation.y = (
    Math.PI
    + modelForwardYawOffset(retargetByRenderKey)
    + playableModelYawOffset(character)
  );
  offset.scaling.setAll(character.modelScale ?? 1);
  const forkliftArmRetargetProfile = character.mirrorForkliftArmChannels
    ? buildForkliftArmRetargetProfile(loader, root)
    : null;
  let renderedRoutes = null;
  const applyRoutes = (routes, { forklift = false } = {}) => {
    renderedRoutes = routes;
    loader.applyCharacterRigWorldMatrices(
      root,
      forklift && forkliftArmRetargetProfile
        ? retargetForkliftArmMatrices(
          routes,
          retargetByRenderKey,
          forkliftArmRetargetProfile,
        )
        : retargetMatrices(routes, retargetByRenderKey),
    );
  };
  offset.position.y = character.groundOffset ?? 0;
  const applyNativeLocomotion = (state, tick) => {
    const applied = nativeLocomotionRuntime?.apply(
      nativeLocomotionModel,
      state,
      tick / GAME_TICKS_PER_SECOND,
    ) || false;
    if (applied) {
      renderedRoutes = nativeLocomotionModel.latestRetargetedRoutes;
    }
    return applied;
  };
  if (!applyNativeLocomotion("idle", 0)) {
    applyRoutes(clipRoutesAt("idle", 0, { loop: true }));
  }
  if (character.groundOffset === null) {
    const minimumY = characterMinimumWorldY(root);
    if (Number.isFinite(minimumY)) {
      offset.position.y += actor.position.y - minimumY + 0.003;
      if (!applyNativeLocomotion("idle", 0)) {
        applyRoutes(clipRoutesAt("idle", 0, { loop: true }));
      }
    }
  }
  const standingOffsetY = offset.position.y;

  let movement = "idle";
  let locomotionState = "idle";
  let locomotionTick = 0;
  let locomotionTransition = null;
  let emoteId = null;
  let emoteRevision = 0;
  let emoteElapsed = 0;
  let vehicleId = null;
  let vehicleRoot = null;
  let vehicleRig = null;
  let vehicleExhaustSmoke = null;
  let vehicleNetworkState = createForkliftState();
  let renderedVehicleState = createForkliftState();
  let vehicleTargetTilt = BABYLON.Quaternion.Identity();
  let vehicleLoadGeneration = 0;
  let disposed = false;

  const syncRemoteVehicle = (nextVehicleId) => {
    if (nextVehicleId === vehicleId) return;
    vehicleId = nextVehicleId;
    const generation = ++vehicleLoadGeneration;
    vehicleExhaustSmoke?.dispose();
    vehicleExhaustSmoke = null;
    vehicleRoot?.dispose(false, true);
    vehicleRoot = null;
    vehicleRig = null;
    if (!vehicleId) {
      offset.parent = actor;
      offset.position.set(0, standingOffsetY, 0);
      vehiclePose.position.setAll(0);
      vehiclePose.rotationQuaternion.copyFrom(BABYLON.Quaternion.Identity());
      renderedVehicleState = createForkliftState();
      return;
    }
    renderedVehicleState = createForkliftState(vehicleNetworkState);
    offset.parent = vehiclePose;
    // The native ride pose owns height, while the scheduled NPC path applies
    // this same measured horizontal seat displacement in its rotated frame.
    offset.position.copyFrom(FORKLIFT_DRIVER_HORIZONTAL_OFFSET);
    const forkliftModel = forkliftModelForId(vehicleId);
    Promise.all([
      fetchAsset(forkliftModel),
      getTexturePack(forkliftModel),
    ]).then(async ([response, texturePack]) => {
      const mt5Loader = new Mt5Loader(scene);
      configureMt5TexturePack(mt5Loader, texturePack);
      const [forkliftRoot] = await mt5Loader.load(
        await response.arrayBuffer(),
        texturePack,
      );
      if (
        disposed
        || generation !== vehicleLoadGeneration
        || !vehicleId
      ) {
        forkliftRoot?.dispose(false, true);
        return;
      }
      const loadedVehicleRig = new ForkliftRig(forkliftRoot);
      forkliftRoot.name = `${actor.name}_${vehicleId}`;
      forkliftRoot.parent = vehiclePose;
      forkliftRoot.position.setAll(0);
      forkliftRoot.rotation.y = Math.PI;
      for (const node of [
        forkliftRoot,
        ...forkliftRoot.getDescendants(false),
      ]) {
        node.isPickable = false;
        node.checkCollisions = false;
        node.metadata = {
          ...(node.metadata || {}),
          remotePlayer: true,
          remoteVehicle: true,
        };
      }
      vehicleRoot = forkliftRoot;
      vehicleRig = loadedVehicleRig;
      vehicleRig.apply(vehicleNetworkState);
      vehicleExhaustSmoke = forkliftEffects.createExhaustSmoke(
        forkliftRoot,
        loadedVehicleRig,
        `${actor.name}_${vehicleId}`,
      );
      vehicleExhaustSmoke.start();
    }).catch((error) => {
      console.warn("[Multiplayer] remote forklift failed to load", error);
    });
  };

  return {
    root: actor,
    syncState(networkState) {
      const nextVehicleId = FORKLIFT_ID_PATTERN.test(networkState.vehicleId)
        ? networkState.vehicleId
        : null;
      vehicleNetworkState = createForkliftState({
        lift: Number(networkState.vehicleLift) || 0,
        steeringAngle: Number(networkState.vehicleSteering) || 0,
        wheelRoll: Number(networkState.vehicleWheelRoll) || 0,
      });
      vehicleTargetTilt = chassisTiltFromOrientation(
        quaternionFromNetworkState(
          networkState,
          Number(networkState.yaw) || 0,
          "vehicle",
        ),
      );
      syncRemoteVehicle(nextVehicleId);
      movement = LOCOMOTION_STATES.has(networkState.movement)
        ? networkState.movement
        : "idle";
      if (vehicleId) {
        emoteId = null;
        emoteElapsed = 0;
        return;
      }
      const nextEmoteId = isKnownEmote(networkState.animationId)
        ? networkState.animationId
        : null;
      if (!nextEmoteId) {
        emoteId = null;
        emoteElapsed = 0;
        return;
      }
      const elapsed = Math.max(
        0,
        Number(networkState.animationElapsedMs || 0) / 1000,
      );
      if (
        emoteId !== nextEmoteId
        || emoteRevision !== networkState.animationRevision
      ) {
        emoteId = nextEmoteId;
        emoteRevision = networkState.animationRevision;
        emoteElapsed = elapsed;
      } else {
        emoteElapsed = Math.max(emoteElapsed, elapsed);
      }
    },
    update(deltaSeconds) {
      if (disposed) return;
      if (vehicleId) {
        const vehicleAlpha = interpolationAlpha(deltaSeconds);
        vehiclePose.rotationQuaternion = BABYLON.Quaternion.Slerp(
          vehiclePose.rotationQuaternion,
          vehicleTargetTilt,
          vehicleAlpha,
        ).normalize();
        vehiclePose.position.y = 0;
        renderedVehicleState = createForkliftState({
          lift: (
            renderedVehicleState.lift
            + (vehicleNetworkState.lift - renderedVehicleState.lift)
              * vehicleAlpha
          ),
          steeringAngle: (
            renderedVehicleState.steeringAngle
            + (
              vehicleNetworkState.steeringAngle
              - renderedVehicleState.steeringAngle
            ) * vehicleAlpha
          ),
          wheelRoll: (
            renderedVehicleState.wheelRoll
            + (
              vehicleNetworkState.wheelRoll
              - renderedVehicleState.wheelRoll
            ) * vehicleAlpha
          ),
        });
        vehicleRig?.apply(renderedVehicleState);
      }
      if (emoteId) {
        emoteElapsed += Math.max(0, deltaSeconds);
        const routes = remoteEmoteRoutes(emoteId, emoteElapsed);
        if (routes) {
          applyRoutes(routes);
          return;
        }
        emoteId = null;
      }
      const targetLocomotion = vehicleId ? "forkliftSit" : movement;
      const locomotionChanged = locomotionState !== targetLocomotion;
      if (locomotionChanged) {
        locomotionState = targetLocomotion;
        locomotionTick = 0;
        locomotionTransition = renderedRoutes
          ? { fromRoutes: renderedRoutes, elapsedSeconds: 0 }
          : null;
      } else {
        locomotionTick += (
          Math.max(0, deltaSeconds) * GAME_TICKS_PER_SECOND
        );
      }
      const playbackState = locomotionState === "backpedal"
        ? "walk"
        : locomotionState;
      const playbackTick = locomotionState === "backpedal"
        ? -locomotionTick
        : locomotionTick;
      if (applyNativeLocomotion(locomotionState, locomotionTick)) {
        locomotionTransition = null;
        return;
      }
      let routes = clipRoutesAt(playbackState, playbackTick, { loop: true });
      if (locomotionTransition) {
        if (!locomotionChanged) {
          locomotionTransition.elapsedSeconds += Math.max(0, deltaSeconds);
        }
        routes = interpolateRoutes(
          locomotionTransition.fromRoutes,
          routes,
          Math.min(
            1,
            locomotionTransition.elapsedSeconds / LOCOMOTION_BLEND_SECONDS,
          ),
        );
        if (
          locomotionTransition.elapsedSeconds >= LOCOMOTION_BLEND_SECONDS
        ) {
          locomotionTransition = null;
        }
      }
      applyRoutes(routes, { forklift: playbackState === "forkliftSit" });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      vehicleLoadGeneration += 1;
      vehicleExhaustSmoke?.dispose();
      vehicleRoot?.dispose(false, true);
      root.dispose(false, true);
      offset.dispose();
      vehiclePose.dispose();
      actor.dispose();
    },
  };
}
