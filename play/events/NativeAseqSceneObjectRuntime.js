import * as BABYLON from "@babylonjs/core";
import { setSourceOrderRotation } from "../../src/Mt5InteractionRotation.js";

const ACTOR_TAG = /^[A-Z0-9_]{4}$/;

function requireText(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${label} must be non-empty text`);
  }
  return value.trim();
}

function vectorSnapshot(value, label) {
  const result = [value?.x, value?.y, value?.z];
  if (!result.every(Number.isFinite)) {
    throw new Error(`AUTH scene object ${label} is unavailable`);
  }
  return result;
}

function generatedVector(value, label) {
  if (!Array.isArray(value) || value.length !== 3 || !value.every(Number.isFinite)) {
    throw new Error(`AUTH scene object ${label} must contain three finite values`);
  }
  return Object.freeze([...value]);
}

function generatedPresentation(value, actorTag) {
  if (!value || typeof value !== "object") return null;
  return Object.freeze({
    position: generatedVector(value.position, `${actorTag} presentation position`),
    rotationDegrees: generatedVector(
      value.rotationDegrees,
      `${actorTag} presentation rotation`,
    ),
    scale: generatedVector(value.scale, `${actorTag} presentation scale`),
  });
}

function captureRoot(root) {
  return {
    enabled: root.isEnabled?.() !== false,
    position: vectorSnapshot(root.position, "position"),
    rotation: vectorSnapshot(root.rotation, "rotation"),
    scaling: vectorSnapshot(root.scaling, "scaling"),
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
    root.rotationQuaternion ||= {
      set(x, y, z, w) {
        Object.assign(this, { x, y, z, w });
      },
    };
    root.rotationQuaternion.set(...snapshot.quaternion);
  } else {
    root.rotationQuaternion = null;
  }
  root.setEnabled(snapshot.enabled);
  root.computeWorldMatrix?.(true);
}

function prepareRoot(root, actorTag) {
  for (const node of [root, ...root.getDescendants(false)]) {
    node.unfreezeWorldMatrix?.();
    node.checkCollisions = false;
    node.isPickable = false;
    node.metadata = {
      ...(node.metadata || {}),
      cameraBlocker: false,
      nativeAseqSceneObject: actorTag,
    };
  }
  root.setEnabled(false);
}

function applyGeneratedPresentation(root, presentation) {
  root.position.set(
    -presentation.position[0],
    presentation.position[1],
    presentation.position[2],
  );
  setSourceOrderRotation(root, [
    BABYLON.Tools.ToRadians(presentation.rotationDegrees[0]),
    BABYLON.Tools.ToRadians(-presentation.rotationDegrees[1]),
    BABYLON.Tools.ToRadians(-presentation.rotationDegrees[2]),
  ]);
  root.scaling.set(...presentation.scale);
  root.computeWorldMatrix?.(true);
}

export class NativeAseqSceneObjectRuntime {
  constructor({ definitions, instantiateAsset = null } = {}) {
    if (!definitions || Array.isArray(definitions) || typeof definitions !== "object") {
      throw new TypeError("AUTH scene objects require generated definitions");
    }
    this.definitions = new Map(Object.entries(definitions).map(([actorTag, value]) => {
      const normalized = actorTag.toUpperCase();
      if (!ACTOR_TAG.test(normalized)) {
        throw new TypeError(`AUTH scene object tag ${actorTag} is invalid`);
      }
      const lifecycle = value?.lifecycle?.kind || "auth-scoped";
      if (!["auth-scoped", "room-script-persistent", "native-composite-owner"].includes(
        lifecycle,
      )) {
        throw new Error(`AUTH scene object ${normalized} lifecycle is invalid`);
      }
      const initialPresentation = generatedPresentation(
        value?.initialPresentation,
        normalized,
      );
      if (lifecycle === "room-script-persistent" && !initialPresentation) {
        throw new Error(
          `AUTH persistent scene object ${normalized} has no initial presentation`,
        );
      }
      return [normalized, Object.freeze({
        actorTag: normalized,
        model: requireText(value?.model, `${normalized} model`),
        browserFilename: requireText(
          value?.browserFilename,
          `${normalized} browser filename`,
        ),
        assetPath: value?.assetPath
          ? requireText(value.assetPath, `${normalized} asset path`)
          : null,
        textureAssetPath: value?.textureAssetPath
          ? requireText(value.textureAssetPath, `${normalized} texture asset path`)
          : null,
        lifecycle,
        initialPresentation,
      })];
    }));
    if (this.definitions.size === 0) {
      throw new Error("AUTH scene object definitions are empty");
    }
    this.actorTags = new Set(this.definitions.keys());
    this.persistentActorTags = new Set(
      [...this.definitions].filter(
        ([, value]) => value.lifecycle === "room-script-persistent",
      ).map(([actorTag]) => actorTag),
    );
    this.compositeActorTags = new Set(
      [...this.definitions].filter(
        ([, value]) => value.lifecycle === "native-composite-owner",
      ).map(([actorTag]) => actorTag),
    );
    this.objects = new Map();
    this.instantiateAsset = instantiateAsset;
    this.ownedRoots = new Set();
    this.active = null;
    this.program = null;
  }

  async load(roots) {
    if (!Array.isArray(roots)) {
      throw new TypeError("AUTH scene objects require loaded world roots");
    }
    this.clear();
    for (const [actorTag, definition] of this.definitions) {
      let matches = roots.filter(root => (
        root?._filename?.toUpperCase() === definition.browserFilename.toUpperCase()
      ));
      if (matches.length === 0 && definition.assetPath) {
        if (typeof this.instantiateAsset !== "function") {
          throw new Error(`AUTH scene object ${actorTag} has no package asset loader`);
        }
        const loaded = await this.instantiateAsset(definition);
        if (!Array.isArray(loaded)) {
          throw new Error(`AUTH scene object ${actorTag} loader returned no roots`);
        }
        for (const root of loaded) this.ownedRoots.add(root);
        matches = loaded.filter(root => (
          root?._filename?.toUpperCase() === definition.browserFilename.toUpperCase()
        ));
      }
      if (matches.length !== 1) {
        throw new Error(
          `AUTH scene object ${actorTag} expected one ${definition.browserFilename}; `
          + `found ${matches.length}`,
        );
      }
      const root = matches[0];
      prepareRoot(root, actorTag);
      this.objects.set(actorTag, Object.freeze({
        actorCode: actorTag,
        root,
        model: null,
        sceneObject: true,
      }));
    }
    return this.objects.size;
  }

  prepareActivity(activity) {
    if (this.active) {
      throw new Error("AUTH scene-object state cannot change during ownership");
    }
    if (this.persistentActorTags.size === 0) return true;
    if (!activity?.activityId || !Array.isArray(activity.nativeSceneObjectStates)) {
      throw new TypeError("AUTH activity has no generated scene-object state");
    }
    const states = new Map();
    for (const state of activity.nativeSceneObjectStates) {
      const actorTag = String(state?.actorTag || "").toUpperCase();
      if (
        !this.persistentActorTags.has(actorTag)
        || typeof state.presented !== "boolean"
        || states.has(actorTag)
      ) {
        throw new Error(`AUTH activity ${activity.activityId} has invalid scene-object state`);
      }
      states.set(actorTag, state.presented);
    }
    if (states.size !== this.persistentActorTags.size) {
      throw new Error(`AUTH activity ${activity.activityId} has incomplete scene-object state`);
    }
    for (const actorTag of this.persistentActorTags) {
      const definition = this.definitions.get(actorTag);
      const root = this.objects.get(actorTag)?.root;
      if (!root) throw new Error(`AUTH persistent scene object ${actorTag} is not loaded`);
      applyGeneratedPresentation(root, definition.initialPresentation);
      root.setEnabled(states.get(actorTag));
      root.metadata = {
        ...(root.metadata || {}),
        nativeAseqPersistentSceneObject: actorTag,
      };
      root.computeWorldMatrix?.(true);
    }
    return true;
  }

  begin(owner, actorTags) {
    if (this.active) throw new Error("AUTH scene objects are already owned");
    if (owner === null || owner === undefined) {
      throw new TypeError("AUTH scene objects require an owner");
    }
    if (
      !Array.isArray(actorTags)
      || actorTags.length === 0
      || new Set(actorTags).size !== actorTags.length
    ) {
      throw new TypeError("AUTH scene object ownership must be non-empty and unique");
    }
    const records = actorTags.map((value) => {
      const actorTag = String(value || "").toUpperCase();
      const record = this.objects.get(actorTag);
      if (!record) throw new Error(`AUTH scene object ${actorTag} is unavailable`);
      return record;
    });
    this.active = {
      owner,
      snapshots: new Map(records.map(record => [
        record.actorCode,
        captureRoot(record.root),
      ])),
    };
    return records;
  }

  beginProgram(owner) {
    if (this.program) {
      throw new Error("AUTH scene-object program is already owned");
    }
    if (this.active) {
      throw new Error("AUTH scene-object program cannot begin during activity ownership");
    }
    if (owner === null || owner === undefined) {
      throw new TypeError("AUTH scene-object program requires an owner");
    }
    // A native program may mutate room-script-persistent objects between
    // AUTH activities (for example OP00 presents MNLF before its first
    // activity).  They need the same outer lease as composite-owned objects:
    // the program presentation bridge can then apply those mutations, while
    // endProgram still restores the pre-program world state.
    const programActorTags = new Set([
      ...this.compositeActorTags,
      ...this.persistentActorTags,
    ]);
    const records = [...programActorTags].map((actorTag) => {
      const record = this.objects.get(actorTag);
      if (!record) {
        throw new Error(`AUTH composite scene object ${actorTag} is unavailable`);
      }
      return record;
    });
    this.program = {
      owner,
      snapshots: new Map(records.map(record => [
        record.actorCode,
        captureRoot(record.root),
      ])),
    };
    return records;
  }

  activate(owner, actorTagValue) {
    if (this.active?.owner !== owner) return false;
    const actorTag = String(actorTagValue || "").toUpperCase();
    if (!this.active.snapshots.has(actorTag)) return false;
    const record = this.objects.get(actorTag);
    record.root.setEnabled(true);
    record.root.computeWorldMatrix?.(true);
    return true;
  }

  end(owner, reason = "stopped") {
    if (this.active?.owner !== owner) return false;
    const successful = reason === "complete" || reason === "replaced";
    for (const [actorTag, snapshot] of this.active.snapshots) {
      const programOwnsActor = this.program?.snapshots.has(actorTag) === true;
      if (!successful || !programOwnsActor) {
        restoreRoot(this.objects.get(actorTag).root, snapshot);
      }
    }
    this.active = null;
    return true;
  }

  endProgram(owner) {
    if (this.program?.owner !== owner) return false;
    if (this.active) {
      throw new Error("AUTH scene-object program cannot end during activity ownership");
    }
    for (const [actorTag, snapshot] of this.program.snapshots) {
      restoreRoot(this.objects.get(actorTag).root, snapshot);
    }
    this.program = null;
    return true;
  }

  clear() {
    if (this.active) this.end(this.active.owner);
    if (this.program) this.endProgram(this.program.owner);
    for (const record of this.objects.values()) record.root.setEnabled(false);
    this.objects.clear();
    for (const root of this.ownedRoots) root.dispose?.();
    this.ownedRoots.clear();
  }
}

export function createNativeAseqSceneObjectRuntime(options) {
  return new NativeAseqSceneObjectRuntime(options);
}
