import * as BABYLON from "@babylonjs/core";
import { setSourceOrderRotation } from "../../src/Mt5InteractionRotation.js";
import { nativeEventCameraBrowserFrame } from "./NativeEventCameraRuntime.js";

function vectorValues(value, label) {
  const values = [value?.x, value?.y, value?.z];
  if (!values.every(Number.isFinite)) {
    throw new Error(`AUTH ${label} is unavailable`);
  }
  return values;
}

function captureRoot(root) {
  return {
    position: vectorValues(root.position, "actor position"),
    rotation: vectorValues(root.rotation, "actor rotation"),
    scaling: vectorValues(root.scaling, "actor scaling"),
    quaternion: root.rotationQuaternion
      ? [
          root.rotationQuaternion.x,
          root.rotationQuaternion.y,
          root.rotationQuaternion.z,
          root.rotationQuaternion.w,
        ]
      : null,
  };
}

function restoreRoot(root, snapshot) {
  root.position.set(...snapshot.position);
  root.rotation.set(...snapshot.rotation);
  root.scaling.set(...snapshot.scaling);
  if (snapshot.quaternion) {
    root.rotationQuaternion ||= BABYLON.Quaternion.Identity();
    root.rotationQuaternion.set(...snapshot.quaternion);
  } else {
    root.rotationQuaternion = null;
  }
  root.computeWorldMatrix?.(true);
}

function captureRenderVisibility(model) {
  const root = model?.renderRoot;
  if (!root || typeof root.isEnabled !== "function" || typeof root.setEnabled !== "function") {
    return null;
  }
  return Object.freeze({ root, enabled: root.isEnabled() });
}

function restoreRenderVisibility(snapshot) {
  if (!snapshot) return;
  snapshot.root.setEnabled(snapshot.enabled);
}

function actorRecordMap(records, expectedTags, label) {
  if (!Array.isArray(records)) {
    throw new Error(`AUTH ${label} ownership returned an invalid actor batch`);
  }
  const result = new Map();
  for (const record of records) {
    const actorCode = String(record?.actorCode || "").toUpperCase();
    if (!actorCode || !record?.root || result.has(actorCode)) {
      throw new Error(`AUTH ${label} ownership returned an invalid actor record`);
    }
    result.set(actorCode, record);
  }
  if (
    expectedTags
    && (
      result.size !== expectedTags.length
      || expectedTags.some(actorTag => !result.has(actorTag))
    )
  ) {
    throw new Error(`AUTH ${label} ownership returned the wrong actors`);
  }
  return result;
}

function actorComponentWorldPosition(actor, selector) {
  if (
    !actor?.root
    || !Number.isInteger(selector)
    || selector < -1
    || selector > 127
  ) {
    return null;
  }
  if (selector === -1) {
    actor.root.computeWorldMatrix?.(true);
    return BABYLON.Vector3.TransformCoordinates(
      BABYLON.Vector3.Zero(),
      actor.root.getWorldMatrix(),
    ).asArray();
  }
  const model = actor.model;
  const control = model?.latestControllerFamily?.nodes?.find(
    node => node.type === selector,
  );
  const matrix = Number.isInteger(control?.index)
    ? model?.latestControllerMatrices?.[control.index]
    : null;
  if (
    matrix?.length !== 16
    || ![matrix?.[12], matrix?.[13], matrix?.[14]].every(Number.isFinite)
    || typeof model?.loader?.characterContentRoot !== "function"
  ) return null;
  const contentRoot = model.loader.characterContentRoot(model.renderRoot);
  if (!contentRoot?.getWorldMatrix) return null;
  contentRoot.computeWorldMatrix?.(true);
  return BABYLON.Vector3.TransformCoordinates(
    new BABYLON.Vector3(matrix[12], matrix[13], matrix[14]),
    contentRoot.getWorldMatrix(),
  ).asArray();
}

function authoredCameraUpVector(position, target, rollRadians) {
  const forward = target.subtract(position);
  if (forward.lengthSquared() <= 1e-12) return null;
  forward.normalize();

  // Start with the horizon-level screen-up direction. LookAt performs this
  // projection internally, but doing it explicitly gives us a stable axis to
  // rotate around the authored view direction.
  let up = BABYLON.Axis.Y.subtract(
    forward.scale(BABYLON.Vector3.Dot(BABYLON.Axis.Y, forward)),
  );
  if (up.lengthSquared() <= 1e-12) {
    up = BABYLON.Axis.Z.subtract(
      forward.scale(BABYLON.Vector3.Dot(BABYLON.Axis.Z, forward)),
    );
  }
  up.normalize();
  if (Math.abs(rollRadians) <= 1e-12) return up;
  return BABYLON.Vector3.TransformNormal(
    up,
    BABYLON.Matrix.RotationAxis(forward, rollRadians),
  ).normalize();
}

export class NativeAseqBabylonActors {
  constructor({
    playerActorCode = "AKIR",
    getPlayerModel,
    syncPlayerTransform,
    scheduledActors,
    motionRuntime,
    ignoredActorTags = [],
    sceneObjects = null,
    packageActors = null,
    playerActorAliases = [],
    requirePlayer = true,
    preservePlayerOnComplete = true,
    playerYawOffsetRadians = 0,
  } = {}) {
    if (
      typeof getPlayerModel !== "function"
      || typeof syncPlayerTransform !== "function"
      || typeof scheduledActors?.beginActivityActors !== "function"
      || typeof scheduledActors?.activityActor !== "function"
      || typeof scheduledActors?.endActivityActors !== "function"
      || typeof motionRuntime?.applyActivitySequence !== "function"
    ) {
      throw new TypeError("AUTH Babylon actors require complete ownership adapters");
    }
    this.playerActorCode = playerActorCode;
    this.playerActorAliases = new Set(
      playerActorAliases.map(value => String(value || "").toUpperCase()),
    );
    if (
      this.playerActorAliases.has(this.playerActorCode)
      || this.playerActorAliases.has("")
    ) throw new Error("AUTH player actor aliases are invalid");
    this.getPlayerModel = getPlayerModel;
    this.syncPlayerTransform = syncPlayerTransform;
    this.scheduledActors = scheduledActors;
    this.motionRuntime = motionRuntime;
    this.ignoredActorTags = new Set(
      ignoredActorTags.map(value => String(value || "").toUpperCase()),
    );
    this.sceneObjects = sceneObjects;
    this.sceneObjectTags = new Set(sceneObjects?.actorTags || []);
    this.packageActors = packageActors;
    this.packageActorTags = new Set(packageActors?.actorTags || []);
    if (this.sceneObjectTags.size > 0 && (
      typeof sceneObjects?.begin !== "function"
      || typeof sceneObjects?.activate !== "function"
      || typeof sceneObjects?.end !== "function"
    )) {
      throw new TypeError("AUTH scene-object ownership adapter is incomplete");
    }
    for (const actorTag of this.sceneObjectTags) {
      if (
        this.ignoredActorTags.has(actorTag)
        || actorTag === this.playerActorCode
        || this.playerActorAliases.has(actorTag)
      ) {
        throw new Error(`AUTH scene object ${actorTag} has conflicting ownership`);
      }
    }
    if (this.packageActorTags.size > 0 && (
      typeof packageActors?.begin !== "function"
      || typeof packageActors?.end !== "function"
    )) throw new TypeError("AUTH package-actor ownership adapter is incomplete");
    for (const actorTag of this.packageActorTags) {
      if (
        this.ignoredActorTags.has(actorTag)
        || actorTag === this.playerActorCode
        || this.playerActorAliases.has(actorTag)
        || this.sceneObjectTags.has(actorTag)
      ) throw new Error(`AUTH package actor ${actorTag} has conflicting ownership`);
    }
    this.requirePlayer = requirePlayer;
    this.preservePlayerOnComplete = preservePlayerOnComplete;
    if (!Number.isFinite(playerYawOffsetRadians)) {
      throw new TypeError("AUTH player yaw offset must be finite");
    }
    this.playerYawOffsetRadians = playerYawOffsetRadians;
    this.active = null;
    this.program = null;
    // AUTH activities are shot-sized ownership scopes. A later shot may still
    // address a character component from the last authored pose even when the
    // character is not owned (and therefore not rendered) in that shot.
    this.retainedActorComponents = new Map();
  }

  begin(owner, actorTags) {
    if (this.active) throw new Error("AUTH actors are already owned");
    const normalized = actorTags.map(value => String(value || "").toUpperCase());
    if (
      normalized.length === 0
      || new Set(normalized).size !== normalized.length
      || normalized.filter(value => this.#isPlayerTag(value)).length > 1
      || (this.requirePlayer
        && normalized.filter(value => this.#isPlayerTag(value)).length !== 1)
    ) {
      throw new Error("AUTH actor list has invalid player ownership");
    }
    const ownsPlayer = normalized.some(value => this.#isPlayerTag(value));
    const activePlayerTag = normalized.find(value => this.#isPlayerTag(value)) || null;
    if (
      ownsPlayer
      && this.program
      && activePlayerTag !== this.program.activePlayerTag
    ) {
      throw new Error(`AUTH player ${activePlayerTag} is outside program ownership`);
    }
    const player = ownsPlayer
      ? (this.program?.player || this.getPlayerModel())
      : null;
    if (ownsPlayer && (!player?.root || !player?.loader || !player?.renderRoot)) {
      throw new Error("AUTH player model is unavailable");
    }
    const playerSnapshot = player ? captureRoot(player.root) : null;
    // The gameplay avatar remains loaded while a cutscene plays. A shot that
    // does not declare AKIR must explicitly borrow its render visibility;
    // otherwise the last player pose is left standing in shots owned only by
    // other actors. Keep the root/collider intact and hide only the render
    // hierarchy, restoring its exact prior state at the shot boundary.
    const hiddenPlayer = ownsPlayer ? null : captureRenderVisibility(
      this.getPlayerModel(),
    );
    const scheduledCodes = normalized.filter(
      value => (
        !this.#isPlayerTag(value)
        && !this.ignoredActorTags.has(value)
        && !this.sceneObjectTags.has(value)
        && !this.packageActorTags.has(value)
      ),
    );
    const sceneObjectCodes = normalized.filter(value => this.sceneObjectTags.has(value));
    const packageActorCodes = normalized.filter(value => this.packageActorTags.has(value));
    let scheduled = [];
    let sceneObjects = [];
    let packageActorRecords = [];
    let scheduledMap = new Map();
    let sceneObjectMap = new Map();
    let packageActorMap = new Map();
    let scheduledBegun = false;
    let sceneObjectsBegun = false;
    let packageActorsBegun = false;
    try {
      if (hiddenPlayer) hiddenPlayer.root.setEnabled(false);
      if (scheduledCodes.length > 0) {
        if (this.program) {
          scheduled = scheduledCodes.map((actorTag) => {
            const actor = this.program.scheduled.get(actorTag);
            if (!actor) {
              throw new Error(
                `AUTH scheduled actor ${actorTag} is outside program ownership`,
              );
            }
            return actor;
          });
        } else {
          scheduled = this.scheduledActors.beginActivityActors(
            owner,
            scheduledCodes,
          );
          scheduledBegun = true;
        }
        scheduledMap = actorRecordMap(
          scheduled,
          scheduledCodes,
          "scheduled actor",
        );
      }
      if (sceneObjectCodes.length > 0) {
        sceneObjects = this.sceneObjects.begin(owner, sceneObjectCodes);
        sceneObjectsBegun = true;
        sceneObjectMap = actorRecordMap(
          sceneObjects,
          sceneObjectCodes,
          "scene object",
        );
      }
      if (packageActorCodes.length > 0) {
        packageActorRecords = this.packageActors.begin(
          owner,
          packageActorCodes,
        );
        packageActorsBegun = true;
        packageActorMap = actorRecordMap(
          packageActorRecords,
          packageActorCodes,
          "package actor",
        );
      }
    } catch (error) {
      const cleanupErrors = [];
      for (const [begun, end, label] of [
        [
          packageActorsBegun,
          () => this.packageActors.end(owner),
          "package actor",
        ],
        [
          sceneObjectsBegun,
          () => this.sceneObjects.end(owner),
          "scene object",
        ],
        [
          scheduledBegun,
          () => this.scheduledActors.endActivityActors(owner),
          "scheduled actor",
        ],
      ]) {
        if (!begun) continue;
        try {
          if (end() !== true) {
            throw new Error(`AUTH ${label} ownership cleanup was rejected`);
          }
        } catch (cleanupError) {
          cleanupErrors.push(cleanupError);
        }
      }
      try {
        restoreRenderVisibility(hiddenPlayer);
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
      if (cleanupErrors.length > 0) {
        throw new AggregateError(
          [error, ...cleanupErrors],
          "AUTH actor ownership acquisition and cleanup failed",
          { cause: error },
        );
      }
      throw error;
    }
    this.active = {
      owner,
      actorTags: normalized,
      activePlayerTag,
      player: player ? { ...player, snapshot: playerSnapshot } : null,
      hiddenPlayer,
      scheduled: new Map([...scheduledMap].map(([actorCode, actor]) => [
        actorCode,
        { ...actor, snapshot: captureRoot(actor.root) },
      ])),
      sceneObjects: sceneObjectMap,
      packageActors: packageActorMap,
    };
    return true;
  }

  beginProgram(owner, actorTags) {
    if (this.program) throw new Error("AUTH actor program is already owned");
    if (this.active) {
      throw new Error("AUTH actor program cannot begin during activity ownership");
    }
    if (owner === null || owner === undefined) {
      throw new TypeError("AUTH actor program requires an owner");
    }
    const normalized = actorTags.map(value => String(value || "").toUpperCase());
    if (
      normalized.length === 0
      || new Set(normalized).size !== normalized.length
      || normalized.filter(value => this.#isPlayerTag(value)).length > 1
      || (this.requirePlayer
        && normalized.filter(value => this.#isPlayerTag(value)).length !== 1)
    ) {
      throw new Error("AUTH actor program list has invalid player ownership");
    }

    const activePlayerTag = normalized.find(value => this.#isPlayerTag(value)) || null;
    const player = activePlayerTag ? this.getPlayerModel() : null;
    if (activePlayerTag && (!player?.root || !player?.loader || !player?.renderRoot)) {
      throw new Error("AUTH program player model is unavailable");
    }
    const scheduledCodes = normalized.filter(value => (
      !this.#isPlayerTag(value)
      && !this.ignoredActorTags.has(value)
      && !this.sceneObjectTags.has(value)
      && !this.packageActorTags.has(value)
    ));
    let scheduled = [];
    let sceneObjects = [];
    let packageActors = [];
    let scheduledMap = new Map();
    let sceneObjectMap = new Map();
    let packageActorMap = new Map();
    let scheduledBegun = false;
    let sceneObjectsBegun = false;
    let packageActorsBegun = false;
    try {
      if (scheduledCodes.length > 0) {
        scheduled = this.scheduledActors.beginActivityActors(
          owner,
          scheduledCodes,
        );
        if (scheduled === false) {
          throw new Error("AUTH scheduled actor program ownership was rejected");
        }
        scheduledBegun = true;
        scheduledMap = actorRecordMap(
          scheduled,
          scheduledCodes,
          "scheduled actor program",
        );
      }
      if (this.sceneObjects) {
        if (
          typeof this.sceneObjects.beginProgram !== "function"
          || typeof this.sceneObjects.endProgram !== "function"
        ) {
          throw new Error("AUTH scene-object program ownership is unavailable");
        }
        sceneObjects = this.sceneObjects.beginProgram(owner);
        if (sceneObjects === false) {
          throw new Error("AUTH scene-object program ownership was rejected");
        }
        sceneObjectsBegun = true;
        sceneObjectMap = actorRecordMap(
          sceneObjects,
          null,
          "scene-object program",
        );
      }
      if (this.packageActors) {
        if (
          typeof this.packageActors.beginProgram !== "function"
          || typeof this.packageActors.endProgram !== "function"
        ) {
          throw new Error("AUTH package-actor program ownership is unavailable");
        }
        packageActors = this.packageActors.beginProgram(owner);
        if (packageActors === false) {
          throw new Error("AUTH package-actor program ownership was rejected");
        }
        packageActorsBegun = true;
        packageActorMap = actorRecordMap(
          packageActors,
          null,
          "package-actor program",
        );
      }
    } catch (error) {
      const cleanupErrors = [];
      for (const [begun, end, label] of [
        [
          packageActorsBegun,
          () => this.packageActors.endProgram(owner),
          "package actor",
        ],
        [
          sceneObjectsBegun,
          () => this.sceneObjects.endProgram(owner),
          "scene object",
        ],
        [
          scheduledBegun,
          () => this.scheduledActors.endActivityActors(owner),
          "scheduled actor",
        ],
      ]) {
        if (!begun) continue;
        try {
          if (end() !== true) {
            throw new Error(`AUTH ${label} program cleanup was rejected`);
          }
        } catch (cleanupError) {
          cleanupErrors.push(cleanupError);
        }
      }
      if (cleanupErrors.length > 0) {
        throw new AggregateError(
          [error, ...cleanupErrors],
          "AUTH actor program acquisition and cleanup failed",
          { cause: error },
        );
      }
      throw error;
    }

    this.program = {
      owner,
      actorTags: normalized,
      activePlayerTag,
      player: player ? { ...player, snapshot: captureRoot(player.root) } : null,
      scheduled: scheduledMap,
      sceneObjects: sceneObjectMap,
      packageActors: packageActorMap,
      scheduledBegun,
      sceneObjectsBegun,
      packageActorsBegun,
    };
    return true;
  }

  applyTransform(owner, actorTag, pose) {
    if (this.#ignored(owner, actorTag)) return true;
    const actor = this.#actor(owner, actorTag);
    if (!actor || ![
      pose?.x,
      pose?.y,
      pose?.z,
      pose?.rotationX,
      pose?.rotationY,
      pose?.rotationZ,
    ].every(Number.isFinite)) return false;
    actor.root.position.set(-pose.x, pose.y, pose.z);
    const playerYawOffset = this.#isPlayerTag(actorTag)
      ? this.playerYawOffsetRadians
      : 0;
    setSourceOrderRotation(actor.root, [
      BABYLON.Tools.ToRadians(pose.rotationX),
      BABYLON.Tools.ToRadians(-pose.rotationY) + playerYawOffset,
      BABYLON.Tools.ToRadians(-pose.rotationZ),
    ]);
    actor.root.computeWorldMatrix?.(true);
    if (
      actor.sceneObject
      && this.sceneObjects.activate(owner, actorTag) !== true
    ) return false;
    if (this.#isPlayerTag(actorTag)) this.syncPlayerTransform();
    return true;
  }

  applyMotion(owner, actorTag, motion) {
    if (this.#ignored(owner, actorTag)) return true;
    const actor = this.#actor(owner, actorTag);
    if (!actor) return false;
    return this.motionRuntime.applyActivitySequence(actor.model, motion);
  }

  activeActor(actorTagValue) {
    const actorTag = String(actorTagValue || "").toUpperCase();
    const scope = this.active;
    if (scope && actorTag === scope.activePlayerTag) {
      return scope.player ? {
        actorCode: actorTag,
        root: scope.player.root,
        model: scope.player,
      } : null;
    }
    const activeActor = scope
      ? scope.sceneObjects.get(actorTag)
        || scope.packageActors.get(actorTag)
        || scope.scheduled.get(actorTag)
      : null;
    return activeActor
      || this.#programActor(actorTag)
      || null;
  }

  programActor(actorTagValue) {
    return this.#programActor(String(actorTagValue || "").toUpperCase());
  }

  programActors(owner) {
    const program = this.program;
    if (program?.owner !== owner) return null;
    const records = new Map();
    if (program.player) {
      records.set(program.activePlayerTag, {
        actorCode: program.activePlayerTag,
        root: program.player.root,
        model: program.player,
      });
    }
    for (const actors of [
      program.scheduled,
      program.sceneObjects,
      program.packageActors,
    ]) {
      for (const [actorTag, actor] of actors) records.set(actorTag, actor);
    }
    return Object.freeze([...records.values()]);
  }

  syncProgramActorTransform(owner, actorTagValue) {
    const program = this.program;
    if (program?.owner !== owner) return false;
    const actorTag = String(actorTagValue || "").toUpperCase();
    if (!this.#programActor(actorTag)) return false;
    if (actorTag === program.activePlayerTag) this.syncPlayerTransform();
    return true;
  }

  selectProgramActorVariant(owner, actorTagValue, modelCode) {
    if (this.program?.owner !== owner || !this.packageActors) {
      return null;
    }
    const actorTag = String(actorTagValue || "").toUpperCase();
    const record = this.packageActors.selectProgramVariant?.(
      owner,
      actorTag,
      modelCode,
    );
    if (!record) return null;
    this.program.packageActors.set(actorTag, record);
    this.active?.packageActors.set(actorTag, record);
    return record;
  }

  get ownsPlayerProgram() {
    return Boolean(this.program?.player);
  }

  componentWorldPosition(actorTagValue, selector) {
    const actorTag = String(actorTagValue || "").toUpperCase();
    const actor = this.activeActor(actorTag);
    if (actor) {
      const live = actorComponentWorldPosition(actor, selector);
      return live ? [...live] : null;
    }
    const retained = this.retainedActorComponents.get(actorTag)?.get(selector);
    return retained ? [...retained] : null;
  }

  resetPresentationState() {
    if (this.active || this.program) return false;
    this.retainedActorComponents.clear();
    return true;
  }

  end(owner, reason) {
    const active = this.active;
    if (active?.owner !== owner) return false;
    const successful = reason === "complete" || reason === "replaced";
    if (successful) {
      for (const actorTag of active.actorTags) {
        const actor = this.activeActor(actorTag);
        if (!actor) continue;
        const components = new Map();
        const root = actorComponentWorldPosition(actor, -1);
        if (root) components.set(-1, root);
        for (const node of actor.model?.latestControllerFamily?.nodes || []) {
          if (!Number.isInteger(node?.type) || components.has(node.type)) continue;
          const position = actorComponentWorldPosition(actor, node.type);
          if (position) components.set(node.type, position);
        }
        if (components.size > 0) {
          this.retainedActorComponents.set(actorTag, components);
        }
      }
    }
    const preserveProgramPose = Boolean(this.program && successful);
    const preservePlayerTransform = successful
      && (this.preservePlayerOnComplete || Boolean(this.program));
    const errors = [];
    if (active.player && !preservePlayerTransform) {
      try {
        restoreRoot(active.player.root, active.player.snapshot);
        this.syncPlayerTransform();
      } catch (error) {
        errors.push(error);
      }
    }
    try {
      restoreRenderVisibility(active.hiddenPlayer);
    } catch (error) {
      errors.push(error);
    }
    if (active.packageActors.size > 0) {
      try {
        if (this.packageActors.end(owner, reason) !== true) {
          throw new Error("AUTH package actor cleanup was rejected");
        }
      } catch (error) {
        errors.push(error);
      }
    }
    if (active.sceneObjects.size > 0) {
      try {
        if (this.sceneObjects.end(owner, reason) !== true) {
          throw new Error("AUTH scene object cleanup was rejected");
        }
      } catch (error) {
        errors.push(error);
      }
    }
    if (active.scheduled.size > 0) {
      try {
        if (this.program) {
          if (!preserveProgramPose) {
            for (const actor of active.scheduled.values()) {
              restoreRoot(actor.root, actor.snapshot);
            }
          }
        } else if (this.scheduledActors.endActivityActors(owner) !== true) {
          throw new Error("AUTH scheduled actor cleanup was rejected");
        }
      } catch (error) {
        errors.push(error);
      }
    }
    this.active = null;
    if (errors.length > 0) {
      throw new AggregateError(errors, "AUTH actor cleanup failed");
    }
    return true;
  }

  endProgram(owner, reason = "stopped") {
    const program = this.program;
    if (program?.owner !== owner) return false;
    if (this.active) {
      throw new Error("AUTH actor program cannot end during activity ownership");
    }
    const errors = [];
    if (program.packageActorsBegun) {
      try {
        if (this.packageActors.endProgram(owner) !== true) {
          throw new Error("AUTH package-actor program cleanup was rejected");
        }
      } catch (error) {
        errors.push(error);
      }
    }
    if (program.sceneObjectsBegun) {
      try {
        if (this.sceneObjects.endProgram(owner) !== true) {
          throw new Error("AUTH scene-object program cleanup was rejected");
        }
      } catch (error) {
        errors.push(error);
      }
    }
    if (program.scheduledBegun) {
      try {
        if (this.scheduledActors.endActivityActors(owner) !== true) {
          throw new Error("AUTH scheduled actor program cleanup was rejected");
        }
      } catch (error) {
        errors.push(error);
      }
    }
    if (program.player) {
      try {
        restoreRoot(program.player.root, program.player.snapshot);
        this.syncPlayerTransform();
      } catch (error) {
        errors.push(error);
      }
    }
    this.program = null;
    this.retainedActorComponents.clear();
    if (errors.length > 0) {
      throw new AggregateError(
        errors,
        `AUTH actor program ${reason} cleanup failed`,
      );
    }
    return true;
  }

  #actor(owner, actorTagValue) {
    if (this.active?.owner !== owner) return null;
    const actorTag = String(actorTagValue || "").toUpperCase();
    if (actorTag === this.active.activePlayerTag) {
      if (!this.active.player) return null;
      return {
        root: this.active.player.root,
        model: this.active.player,
      };
    }
    return this.active.sceneObjects.get(actorTag)
      || this.active.packageActors.get(actorTag)
      || this.active.scheduled.get(actorTag)
      || null;
  }

  #ignored(owner, actorTagValue) {
    return this.active?.owner === owner
      && this.ignoredActorTags.has(String(actorTagValue || "").toUpperCase());
  }

  #programActor(actorTag) {
    const program = this.program;
    if (!program) return null;
    if (actorTag === program.activePlayerTag) {
      return program.player ? {
        actorCode: actorTag,
        root: program.player.root,
        model: program.player,
      } : null;
    }
    return program.sceneObjects.get(actorTag)
      || this.packageActors?.programActor?.(actorTag)
      || program.packageActors.get(actorTag)
      || program.scheduled.get(actorTag)
      || null;
  }

  #isPlayerTag(actorTag) {
    return actorTag === this.playerActorCode || this.playerActorAliases.has(actorTag);
  }
}

export class NativeAseqBabylonCamera {
  constructor(camera, { minZ = 0.02 } = {}) {
    if (!camera?.position || typeof camera.setTarget !== "function") {
      throw new TypeError("AUTH Babylon camera is unavailable");
    }
    if (!Number.isFinite(minZ) || minZ <= 0) {
      throw new TypeError("AUTH Babylon camera minZ must be positive");
    }
    this.camera = camera;
    this.minZ = minZ;
    this.active = null;
    this.program = null;
  }

  #snapshot() {
    return {
      position: vectorValues(this.camera.position, "camera position"),
      rotation: vectorValues(this.camera.rotation, "camera rotation"),
      upVector: vectorValues(this.camera.upVector, "camera up vector"),
      fov: this.camera.fov,
      minZ: this.camera.minZ,
    };
  }

  #restore(snapshot) {
    this.camera.position.set(...snapshot.position);
    this.camera.rotation.set(...snapshot.rotation);
    this.camera.upVector.set(...snapshot.upVector);
    this.camera.fov = snapshot.fov;
    this.camera.minZ = snapshot.minZ;
  }

  beginProgram(owner, { continuousActivities = false } = {}) {
    if (this.program || this.active) return false;
    this.program = {
      owner,
      continuousActivities: Boolean(continuousActivities),
      snapshot: this.#snapshot(),
    };
    if (this.program.continuousActivities) this.camera.minZ = this.minZ;
    return true;
  }

  endProgram(owner) {
    if (this.program?.owner !== owner || this.active) return false;
    this.#restore(this.program.snapshot);
    this.program = null;
    return true;
  }

  begin(owner) {
    if (this.active) throw new Error("AUTH camera is already owned");
    this.active = { owner, snapshot: this.#snapshot() };
    // Gameplay can keep a conservative near clip, but authored close-ups put
    // the lens within a few centimetres of faces and other foreground props.
    this.camera.minZ = this.minZ;
    return true;
  }

  apply(owner, pose) {
    if (this.active?.owner !== owner) return false;
    const frame = nativeEventCameraBrowserFrame({
      position: [pose.positionX, pose.positionY, pose.positionZ],
      target: [pose.targetX, pose.targetY, pose.targetZ],
      roll: pose.roll,
      perspective: pose.perspective,
    });
    if (!frame || frame.perspectiveRadians === null) return false;
    const position = new BABYLON.Vector3(...frame.position);
    const target = new BABYLON.Vector3(...frame.target);
    const upVector = authoredCameraUpVector(
      position,
      target,
      frame.rollRadians,
    );
    if (!upVector) return false;
    this.camera.position.copyFrom(position);
    this.camera.setTarget(target);
    // Babylon mutates upVector when TargetCamera.rotation.z changes and keeps
    // a private cache of that roll. Restoring the public fields alone can then
    // reapply the last cinematic tilt on the first gameplay render. Express
    // authored roll through the LookAt up-vector instead, leaving Euler roll
    // under the ownership of the normal gameplay camera.
    this.camera.rotation.z = 0;
    this.camera.upVector.copyFrom(upVector);
    this.camera.fov = frame.perspectiveRadians;
    return true;
  }

  end(owner) {
    if (this.active?.owner !== owner) return false;
    if (!this.program?.continuousActivities) {
      this.#restore(this.active.snapshot);
    }
    this.active = null;
    return true;
  }
}

export function createNativeAseqBabylonActors(options) {
  return new NativeAseqBabylonActors(options);
}

export function createNativeAseqBabylonCamera(camera, options) {
  return new NativeAseqBabylonCamera(camera, options);
}
