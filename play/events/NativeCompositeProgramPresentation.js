import { setSourceOrderRotation } from "../../src/Mt5InteractionRotation.js";
import { nativeFloat32FromWord } from "./NativeEventNumericRuntime.js";

const FULL_TURN_RADIANS = Math.PI * 2;
const ASSOCIATED_SECONDARY_VECTOR_KINDS = new Set([
  "fixed-turn-rotation",
  "float32-position",
]);

function actorTag(value) {
  const tag = String(value || "");
  if (
    tag.length !== 4
    || [...tag].some(character => character.codePointAt(0) > 0xff)
  ) {
    throw new TypeError(
      "native composite presentation actor tag must be four characters",
    );
  }
  return tag;
}

function rootNodes(root) {
  return [root, ...(root.getDescendants?.(false) || [])];
}

function vector(value, label) {
  const values = [value?.x, value?.y, value?.z];
  if (!values.every(Number.isFinite)) {
    throw new Error(`native composite presentation ${label} is unavailable`);
  }
  return values;
}

function captureRoot(root) {
  const nodes = rootNodes(root).map(node => ({
    node,
    ...(typeof node.isVisible === "boolean"
      ? { isVisible: node.isVisible }
      : {}),
    ...(Number.isFinite(node.visibility)
      ? { visibility: node.visibility }
      : {}),
  }));
  return {
    enabled: root.isEnabled?.() !== false,
    position: vector(root.position, "actor position"),
    rotation: vector(root.rotation, "actor rotation"),
    scaling: vector(root.scaling, "actor scaling"),
    quaternion: root.rotationQuaternion
      ? [
          root.rotationQuaternion.x,
          root.rotationQuaternion.y,
          root.rotationQuaternion.z,
          root.rotationQuaternion.w,
        ]
      : null,
    quaternionObject: root.rotationQuaternion || null,
    nodes,
  };
}

function restoreRoot(root, snapshot) {
  root.position.set(...snapshot.position);
  root.rotation.set(...snapshot.rotation);
  root.scaling.set(...snapshot.scaling);
  if (snapshot.quaternion) {
    root.rotationQuaternion = snapshot.quaternionObject;
    root.rotationQuaternion.set(...snapshot.quaternion);
  } else {
    root.rotationQuaternion = null;
  }
  for (const state of snapshot.nodes) {
    if ("isVisible" in state) state.node.isVisible = state.isVisible;
    if ("visibility" in state) state.node.visibility = state.visibility;
  }
  root.setEnabled(snapshot.enabled);
  root.computeWorldMatrix?.(true);
}

function fixedTurnRadians(word) {
  return ((word >>> 0) << 0) / 65536 * FULL_TURN_RADIANS;
}

function positionFromWords(words) {
  const source = words.map(nativeFloat32FromWord);
  if (!source.every(Number.isFinite)) {
    throw new Error("native composite position contains a non-finite float");
  }
  return [-source[0], source[1], source[2]];
}

function rotationFromWords(words) {
  const source = words.map(fixedTurnRadians);
  return [source[0], -source[1], -source[2]];
}

function associatedSecondaryVectorKind(actor, actorTagValue) {
  const kind = actor.associatedSecondaryVectorKind;
  if (!ASSOCIATED_SECONDARY_VECTOR_KINDS.has(kind)) {
    throw new Error(
      `native composite actor ${actorTagValue} has no exact associated `
      + "secondary-vector presentation",
    );
  }
  return kind;
}

function hidePresentation(entry) {
  if (!entry.hiddenNodes) {
    entry.hiddenNodes = rootNodes(entry.root).map(node => ({
      node,
      ...(typeof node.isVisible === "boolean"
        ? { isVisible: node.isVisible }
        : {}),
    }));
  }
  for (const state of entry.hiddenNodes) {
    if ("isVisible" in state) state.node.isVisible = false;
  }
}

function showPresentation(entry) {
  if (!entry.hiddenNodes) return;
  for (const state of entry.hiddenNodes) {
    if ("isVisible" in state) state.node.isVisible = state.isVisible;
  }
  entry.hiddenNodes = null;
}

/**
 * Projects presentation-facing room-script mutations onto actors held by one
 * composite cutscene program. AUTH playback remains owned by its activity
 * runtime; this bridge only applies native state written between activities.
 * The associated operation-0x001d path is polymorphic, so its presentation
 * kind must be declared by the resolved actor instead of inferred from flags.
 */
export class NativeCompositeProgramPresentation {
  constructor({
    sceneState,
    resolveProgramActor,
    syncActorTransform = () => {},
  } = {}) {
    if (
      typeof sceneState?.readPresentationMutations !== "function"
      || typeof resolveProgramActor !== "function"
      || typeof syncActorTransform !== "function"
    ) {
      throw new TypeError(
        "native composite presentation requires state and actor adapters",
      );
    }
    this.sceneState = sceneState;
    this.resolveProgramActor = resolveProgramActor;
    this.syncActorTransform = syncActorTransform;
    this.active = null;
  }

  begin(owner, actorTags) {
    if (this.active) {
      throw new Error("native composite presentation is already active");
    }
    if (owner === null || owner === undefined) {
      throw new TypeError("native composite presentation requires an owner");
    }
    if (
      !Array.isArray(actorTags)
      || actorTags.length === 0
      || new Set(actorTags.map(actorTag)).size !== actorTags.length
    ) {
      throw new TypeError(
        "native composite presentation actor tags must be non-empty and unique",
      );
    }
    const entries = new Map();
    for (const value of actorTags) {
      const tag = actorTag(value);
      const actor = this.resolveProgramActor(owner, tag);
      if (!actor) {
        throw new Error(`native composite actor ${tag} is unavailable`);
      }
      if (actor.stateOnly === true) {
        entries.set(tag, { actor, root: null, snapshot: null });
        continue;
      }
      if (!actor.root) {
        throw new Error(`native composite actor ${tag} has no presentation root`);
      }
      const snapshot = captureRoot(actor.root);
      entries.set(tag, {
        actor,
        root: actor.root,
        snapshot,
        snapshots: new Map([[actor.root, snapshot]]),
        hiddenNodes: null,
        presentationEnabled: null,
      });
    }
    this.active = { owner, entries, revision: 0 };
    try {
      // Room composition and exact direct-entry state are written before the
      // program lease begins. Replay only mutations for declared program
      // actors, then establish the live cursor. Unrelated room history is not
      // part of this presentation owner.
      const batch = this.sceneState.readPresentationMutations(0);
      for (const mutation of batch.mutations) {
        if (entries.has(mutation.objectTag)) this.#apply(mutation);
      }
      this.active.revision = batch.revision;
    } catch (error) {
      const cleanupErrors = this.#restoreActive();
      this.active = null;
      if (cleanupErrors.length > 0) {
        throw new AggregateError(
          [error, ...cleanupErrors],
          "native composite presentation begin and cleanup failed",
          { cause: error },
        );
      }
      throw error;
    }
    return true;
  }

  update(owner) {
    const active = this.#requireOwner(owner);
    this.#refreshEntries(active);
    const batch = this.sceneState.readPresentationMutations(active.revision);
    const unowned = batch.mutations.find(
      mutation => !active.entries.has(mutation.objectTag),
    );
    if (unowned) {
      throw new Error(
        `native composite mutation targets unowned actor ${unowned.objectTag}`,
      );
    }
    const rollback = new Map();
    for (const mutation of batch.mutations) {
      const entry = active.entries.get(mutation.objectTag);
      if (!entry.root || rollback.has(mutation.objectTag)) continue;
      rollback.set(mutation.objectTag, {
        entry,
        snapshot: captureRoot(entry.root),
        hiddenNodes: entry.hiddenNodes,
      });
    }
    try {
      for (const mutation of batch.mutations) this.#apply(mutation);
    } catch (error) {
      const cleanupErrors = this.#restoreSnapshots(rollback);
      if (cleanupErrors.length > 0) {
        throw new AggregateError(
          [error, ...cleanupErrors],
          "native composite presentation update and rollback failed",
          { cause: error },
        );
      }
      throw error;
    }
    active.revision = batch.revision;
    return batch.mutations.length;
  }

  end(owner) {
    this.#requireOwner(owner);
    const cleanupErrors = this.#restoreActive();
    this.active = null;
    if (cleanupErrors.length === 1) throw cleanupErrors[0];
    if (cleanupErrors.length > 1) {
      throw new AggregateError(
        cleanupErrors,
        "native composite presentation cleanup failed",
      );
    }
    return true;
  }

  #apply(mutation) {
    const entry = this.active.entries.get(mutation.objectTag);
    if (!entry || !entry.root) return;
    switch (mutation.kind) {
      case "object-runtime-flag":
        entry.root.setEnabled(mutation.enabled);
        break;
      case "object-presentation-flag":
        entry.presentationEnabled = mutation.enabled;
        if (mutation.enabled) showPresentation(entry);
        else hidePresentation(entry);
        break;
      case "object-position-vector":
        entry.root.position.set(...positionFromWords(mutation.words));
        this.syncActorTransform(mutation.objectTag, entry.actor);
        break;
      case "object-secondary-vector":
        if (!mutation.associated) {
          setSourceOrderRotation(
            entry.root,
            rotationFromWords(mutation.words),
          );
        } else if (
          associatedSecondaryVectorKind(
            entry.actor,
            mutation.objectTag,
          ) === "float32-position"
        ) {
          entry.root.position.set(...positionFromWords(mutation.words));
        } else {
          setSourceOrderRotation(
            entry.root,
            rotationFromWords(mutation.words),
          );
        }
        this.syncActorTransform(mutation.objectTag, entry.actor);
        break;
      case "object-scale-vector": {
        const scaling = mutation.words.map(nativeFloat32FromWord);
        if (!scaling.every(Number.isFinite)) {
          throw new Error("native composite scale contains a non-finite float");
        }
        entry.root.scaling.set(...scaling);
        this.syncActorTransform(mutation.objectTag, entry.actor);
        break;
      }
      case "object-imgm-selection":
        // The retail byte selects an IMGM-owned table entry. A rooted actor
        // must expose its exact model adapter; silently accepting this write
        // would conceal a consequential presentation operation.
        if (typeof entry.actor.applyNativeImgmSelection !== "function") {
          throw new Error(
            `native composite actor ${mutation.objectTag} has no exact `
            + "IMGM selection adapter",
          );
        }
        if (
          entry.actor.applyNativeImgmSelection(mutation.selection) !== true
        ) {
          throw new Error(
            `native composite actor ${mutation.objectTag} rejected IMGM `
            + `selection ${mutation.selection}`,
          );
        }
        break;
      default:
        throw new Error(
          `native composite presentation mutation ${mutation.kind} is unsupported`,
        );
    }
    entry.root.computeWorldMatrix?.(true);
  }

  #requireOwner(owner) {
    if (!this.active || this.active.owner !== owner) {
      throw new Error("native composite presentation owner is not active");
    }
    return this.active;
  }

  #refreshEntries(active) {
    for (const [actorTagValue, entry] of active.entries) {
      if (!entry.root) continue;
      const actor = this.resolveProgramActor(active.owner, actorTagValue);
      if (!actor?.root) {
        throw new Error(
          `native composite actor ${actorTagValue} presentation root was lost`,
        );
      }
      if (actor.root === entry.root) {
        entry.actor = actor;
        continue;
      }
      if (!entry.snapshots.has(actor.root)) {
        entry.snapshots.set(actor.root, captureRoot(actor.root));
      }
      entry.actor = actor;
      entry.root = actor.root;
      entry.snapshot = entry.snapshots.get(actor.root);
      entry.hiddenNodes = null;
      if (entry.presentationEnabled === false) hidePresentation(entry);
    }
  }

  #restoreActive() {
    const errors = [];
    for (const [actorTagValue, entry] of [...this.active.entries].reverse()) {
      if (!entry.root) continue;
      for (const [root, snapshot] of [...entry.snapshots].reverse()) {
        try {
          restoreRoot(root, snapshot);
        } catch (error) {
          errors.push(error);
        }
      }
      try {
        this.syncActorTransform(actorTagValue, entry.actor);
      } catch (error) {
        errors.push(error);
      }
    }
    return errors;
  }

  #restoreSnapshots(snapshots) {
    const errors = [];
    for (const [actorTagValue, state] of [...snapshots].reverse()) {
      if (!state.entry.root) continue;
      try {
        restoreRoot(state.entry.root, state.snapshot);
        state.entry.hiddenNodes = state.hiddenNodes;
        this.syncActorTransform(actorTagValue, state.entry.actor);
      } catch (error) {
        errors.push(error);
      }
    }
    return errors;
  }
}

export function createNativeCompositeProgramPresentation(options) {
  return new NativeCompositeProgramPresentation(options);
}
