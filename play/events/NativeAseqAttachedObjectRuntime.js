import * as BABYLON from "@babylonjs/core";
import { markWorldMeshDynamic } from "../../src/rendering/SceneSpatialIndex.js";

import { Mt5Loader } from "../../src/Mt5Loader.js";
import {
  scheduledBrowserAttachedObjectMatrix,
  scheduledLocalObjectTurnRadians,
} from "../../src/ScheduledActorLocalObjects.js";
import {
  mt5BrowserRotation,
  setSourceOrderRotation,
} from "../../src/Mt5InteractionRotation.js";

const ACTOR_TAG = /^[A-Z0-9_]{4}$/;

function requireActorTag(value, label) {
  const result = String(value || "").toUpperCase();
  if (!ACTOR_TAG.test(result)) {
    throw new TypeError(`${label} must be a four-character actor tag`);
  }
  return result;
}

function requireVector(value, label) {
  if (
    !Array.isArray(value)
    || value.length !== 3
    || value.some(component => !Number.isFinite(component))
  ) {
    throw new TypeError(`${label} must contain three finite values`);
  }
  return Object.freeze([...value]);
}

function requireFixedTurnVector(value, label) {
  const result = requireVector(value, label);
  if (result.some(component => !Number.isInteger(component) || component < 0 || component > 0xffff)) {
    throw new TypeError(`${label} must contain three unsigned 16-bit values`);
  }
  return result;
}

function requireSignedFixedTurnVector(value, label) {
  const result = requireVector(value, label);
  if (result.some(component => !Number.isInteger(component))) {
    throw new TypeError(`${label} must contain three integer fixed-turn values`);
  }
  return result;
}

function scopeFor(value, label) {
  if (typeof value?.activityId !== "string" || !value.activityId.trim()) {
    throw new TypeError(`${label} requires an exact activity ID`);
  }
  return Object.freeze({
    scopeKey: value.activityId,
    activityId: value.activityId,
  });
}

function signedRenderKey(node) {
  if (Number.isInteger(node?.renderKey)) return node.renderKey;
  const low16 = Number(node?.flag) & 0xffff;
  return low16 >= 0x8000 ? low16 - 0x10000 : low16;
}

function sourceVector(node, channel) {
  const value = node?.[channel] || node?._mt5Node?.[channel];
  if (value && [value.x, value.y, value.z].every(Number.isFinite)) {
    return [value.x, value.y, value.z];
  }
  if (channel === "rot" && node?.mesh) return mt5BrowserRotation(node.mesh);
  if (channel === "pos" && node?.mesh) {
    return [-node.mesh.position.x, node.mesh.position.y, node.mesh.position.z];
  }
  return [0, 0, 0];
}

function operationCount(operation, frame) {
  if (frame < operation.firstFrame) return 0;
  return Math.min(frame, operation.lastFrame) - operation.firstFrame + 1;
}

function evaluateNodeChannel(initial, operations, frame, channel) {
  let value = [...initial];
  for (const operation of operations) {
    const count = operationCount(operation, frame);
    if (count <= 0 || !operation[channel]) continue;
    if (operation.mode === "set") value = [...operation[channel]];
    else {
      value = value.map((component, index) => (
        component + operation[channel][index] * count
      ));
    }
  }
  return value;
}

function snapshotRoot(root) {
  return {
    parent: root.parent,
    position: root.position.clone(),
    rotation: root.rotation.clone(),
    rotationQuaternion: root.rotationQuaternion?.clone() || null,
    scaling: root.scaling.clone(),
  };
}

function restoreRoot(root, snapshot) {
  root.parent = snapshot.parent;
  root.position.copyFrom(snapshot.position);
  root.rotation.copyFrom(snapshot.rotation);
  root.rotationQuaternion = snapshot.rotationQuaternion?.clone() || null;
  root.scaling.copyFrom(snapshot.scaling);
  root.setEnabled(false);
  root.computeWorldMatrix(true);
}

function restoreObjectNodes(record, nodeKeys = null) {
  for (const [node, snapshot] of record.nodeSnapshots || []) {
    if (!node?.mesh || (nodeKeys && !nodeKeys.has(signedRenderKey(node)))) continue;
    node.mesh.position.set(-snapshot.position[0], snapshot.position[1], snapshot.position[2]);
    setSourceOrderRotation(node.mesh, [
      snapshot.rotation[0],
      -snapshot.rotation[1],
      -snapshot.rotation[2],
    ]);
    node.mesh.computeWorldMatrix?.(true);
  }
}

function restoreObject(record) {
  restoreObjectNodes(record);
  restoreRoot(record.root, record.snapshot);
}

function prepareRoot(root, actorTag) {
  for (const node of [root, ...root.getDescendants(false)]) {
    markWorldMeshDynamic(node);
    node.checkCollisions = false;
    node.isPickable = false;
    node.metadata = {
      ...(node.metadata || {}),
      cameraBlocker: false,
      nativeAseqAttachedObject: actorTag,
    };
  }
  root.setEnabled(false);
}

function localAttachmentMatrix(binding) {
  return Mt5Loader.sourceTransformMatrix({
    scl: { x: 1, y: 1, z: 1 },
    rot: {
      x: scheduledLocalObjectTurnRadians(binding.rotationRaw[0]),
      y: scheduledLocalObjectTurnRadians(binding.rotationRaw[1]),
      z: scheduledLocalObjectTurnRadians(binding.rotationRaw[2]),
    },
    pos: {
      x: binding.translation[0],
      y: binding.translation[1],
      z: binding.translation[2],
    },
  });
}

function applyAttachedMatrix(root, parentRoot, sourceMatrix, keepParent = false) {
  const browserMatrix = scheduledBrowserAttachedObjectMatrix(sourceMatrix);
  if (!browserMatrix) return false;
  let matrix = BABYLON.Matrix.FromArray(browserMatrix);
  if (keepParent) {
    // AUTH writes scene-object transforms in their world hierarchy each frame.
    // Override their pose without reparenting them into the actor hierarchy;
    // detach then hands control straight back to the next authored AUTH pose.
    matrix = matrix.multiply(parentRoot.computeWorldMatrix(true));
    if (root.parent) matrix = matrix.multiply(BABYLON.Matrix.Invert(root.parent.computeWorldMatrix(true)));
  }
  const scaling = BABYLON.Vector3.One();
  const rotation = BABYLON.Quaternion.Identity();
  const translation = BABYLON.Vector3.Zero();
  if (!matrix.decompose(scaling, rotation, translation)) return false;
  if (!keepParent) root.parent = parentRoot;
  root.position.copyFrom(translation);
  root.rotation.set(0, 0, 0);
  root.rotationQuaternion = rotation;
  root.scaling.copyFrom(scaling);
  root.setEnabled(true);
  root.computeWorldMatrix(true);
  return true;
}

export class NativeAseqAttachedObjectRuntime {
  constructor({ definitions, resolveActor, resolveSceneObject = null, instantiateAsset = null } = {}) {
    if (!definitions || Array.isArray(definitions) || typeof definitions !== "object") {
      throw new TypeError("AUTH attached objects require generated definitions");
    }
    if (typeof resolveActor !== "function") {
      throw new TypeError("AUTH attached objects require an actor resolver");
    }
    this.resolveActor = resolveActor;
    this.resolveSceneObject = resolveSceneObject;
    if (instantiateAsset !== null && typeof instantiateAsset !== "function") {
      throw new TypeError("AUTH attached object instantiator must be callable");
    }
    this.instantiateAsset = instantiateAsset;
    this.definitions = new Map();
    this.bindingsByScope = new Map();
    this.presentationByScope = new Map();
    this.nodeOperationsByScope = new Map();
    for (const [actorTagValue, value] of Object.entries(definitions)) {
      const actorTag = requireActorTag(actorTagValue, "attached object tag");
      const browserFilename = String(value?.browserFilename || "").trim();
      if (!browserFilename || !Array.isArray(value?.attachments)) {
        throw new TypeError(`AUTH attached object ${actorTag} is incomplete`);
      }
      const attachments = value.attachments.map((attachment) => {
        const scope = scopeFor(attachment, `${actorTag} attachment`);
        if (!Number.isSafeInteger(attachment?.frame) || attachment.frame < 0) {
          throw new TypeError(`${actorTag} attachment frame must be non-negative`);
        }
        const action = attachment.action === "detach" ? "detach" : "attach";
        if (
          action === "attach"
          && (!Number.isSafeInteger(attachment?.controlId) || attachment.controlId < 0)
        ) throw new TypeError(`${actorTag} attachment control must be non-negative`);
        const binding = Object.freeze({
          actorTag,
          action,
          ...scope,
          frame: attachment.frame,
          parentActorTag: action === "attach" ? requireActorTag(
            attachment.parentActorTag,
            `${actorTag} attachment parent`,
          ) : null,
          controlId: action === "attach" ? attachment.controlId : null,
          translation: action === "attach" ? requireVector(
            attachment.translation,
            `${actorTag} attachment translation`,
          ) : null,
          rotationRaw: action === "attach" ? requireFixedTurnVector(
            attachment.rotationRaw,
            `${actorTag} attachment rotation`,
          ) : null,
        });
        const scopeBindings = this.bindingsByScope.get(scope.scopeKey) || [];
        if (scopeBindings.some(item => (
          item.actorTag === actorTag && item.frame === binding.frame
        ))) {
          throw new Error(
            `${actorTag} has duplicate ${scope.scopeKey} frame ${binding.frame} attachments`,
          );
        }
        scopeBindings.push(binding);
        this.bindingsByScope.set(scope.scopeKey, scopeBindings);
        return binding;
      });
      const presentation = (value?.presentation || []).map((event) => {
        const scope = scopeFor(event, `${actorTag} presentation event`);
        if (!Number.isSafeInteger(event?.frame) || event.frame < 0) {
          throw new TypeError(`${actorTag} presentation frame must be non-negative`);
        }
        if (typeof event.visible !== "boolean") {
          throw new TypeError(`${actorTag} presentation visibility must be boolean`);
        }
        const result = Object.freeze({ actorTag, ...scope, frame: event.frame, visible: event.visible });
        const events = this.presentationByScope.get(scope.scopeKey) || [];
        if (events.some(item => item.actorTag === actorTag && item.frame === event.frame)) {
          throw new Error(`${actorTag} has duplicate ${scope.scopeKey} frame ${event.frame} presentation events`);
        }
        events.push(result);
        this.presentationByScope.set(scope.scopeKey, events);
        return result;
      });
      const nodeTransforms = (value?.nodeTransforms || []).map((operation) => {
        const scope = scopeFor(operation, `${actorTag} node transform`);
        const firstFrame = operation?.firstFrame ?? operation?.frame;
        const lastFrame = operation?.lastFrame ?? firstFrame;
        if (
          !Number.isSafeInteger(firstFrame) || firstFrame < 0
          || !Number.isSafeInteger(lastFrame) || lastFrame < firstFrame
        ) throw new TypeError(`${actorTag} node transform has an invalid frame range`);
        if (!Number.isInteger(operation?.nodeKey)) {
          throw new TypeError(`${actorTag} node transform key must be an integer`);
        }
        const mode = operation?.mode === "add" ? "add" : "set";
        if (mode === "set" && lastFrame !== firstFrame) {
          throw new Error(`${actorTag} set transforms may only occur once`);
        }
        const position = operation?.position === undefined
          ? null
          : requireVector(operation.position, `${actorTag} node position`);
        const rotationRaw = operation?.rotationRaw === undefined
          ? null
          : requireSignedFixedTurnVector(operation.rotationRaw, `${actorTag} node rotation`);
        if (!position && !rotationRaw) {
          throw new Error(`${actorTag} node transform has no position or rotation channel`);
        }
        const result = Object.freeze({
          actorTag, ...scope, nodeKey: operation.nodeKey, mode, firstFrame, lastFrame,
          position,
          rotation: rotationRaw?.map(scheduledLocalObjectTurnRadians) || null,
        });
        const operations = this.nodeOperationsByScope.get(scope.scopeKey) || [];
        operations.push(result);
        this.nodeOperationsByScope.set(scope.scopeKey, operations);
        return result;
      });
      this.definitions.set(actorTag, Object.freeze({
        actorTag,
        browserFilename,
        sceneObject: value.sceneObject === true,
        assetPath: String(value?.assetPath || "").trim() || null,
        attachments: Object.freeze(attachments),
        presentation: Object.freeze(presentation),
        nodeTransforms: Object.freeze(nodeTransforms),
      }));
    }
    if (this.definitions.size === 0) {
      throw new Error("AUTH attached object definitions are empty");
    }
    this.objects = new Map();
    this.active = null;
  }

  async load(roots) {
    if (!Array.isArray(roots)) {
      throw new TypeError("AUTH attached objects require loaded world roots");
    }
    this.clear();
    for (const [actorTag, definition] of this.definitions) {
      let packageOwned = false;
      let matches = definition.sceneObject
        ? [this.resolveSceneObject?.(actorTag)?.root].filter(Boolean)
        : roots.filter(root => (
        root?._filename?.toUpperCase() === definition.browserFilename.toUpperCase()
      ));
      if (!definition.sceneObject && matches.length === 0 && definition.assetPath && this.instantiateAsset) {
        matches = await this.instantiateAsset(definition);
        packageOwned = true;
      }
      if (matches.length !== 1) {
        throw new Error(
          `AUTH attached object ${actorTag} expected one ${definition.browserFilename}; `
          + `found ${matches.length}`,
        );
      }
      const root = matches[0];
      const snapshot = snapshotRoot(root);
      prepareRoot(root, actorTag);
      const nodeSnapshots = new Map((root._mt5Nodes || []).map(node => [node, Object.freeze({
        position: sourceVector(node, "pos"),
        rotation: sourceVector(node, "rot"),
      })]));
      this.objects.set(actorTag, { root, snapshot, nodeSnapshots, packageOwned, sceneObject: definition.sceneObject });
    }
    return this.objects.size;
  }

  beginActivity(activity = {}) {
    const { scopeKey } = scopeFor(activity, "AUTH attachment activity");
    const count = this.#beginScope(scopeKey);
    this.active.authoredActors = new Set(activity.actors || []);
    return count;
  }

  update(frame = this.active?.frame ?? 0) {
    if (!this.active) return false;
    if (!Number.isSafeInteger(frame) || frame < 0) {
      throw new TypeError("AUTH attachment frame must be non-negative");
    }
    this.active.frame = frame;
    const selectedByActor = new Map();
    for (const binding of this.active.bindings) {
      if (binding.frame > frame) continue;
      const selected = selectedByActor.get(binding.actorTag);
      if (!selected || selected.frame < binding.frame) {
        selectedByActor.set(binding.actorTag, binding);
      }
    }
    const visibilityByActor = new Map();
    for (const event of this.active.presentation) {
      if (event.frame > frame) continue;
      const selected = visibilityByActor.get(event.actorTag);
      if (!selected || selected.frame < event.frame) visibilityByActor.set(event.actorTag, event);
    }
    for (const binding of this.active.bindings) {
      if (selectedByActor.has(binding.actorTag)) continue;
      const record = this.objects.get(binding.actorTag);
      if (!record?.sceneObject || !this.active.authoredActors.has(binding.actorTag)) record?.root.setEnabled(false);
    }
    let applied = 0;
    for (const binding of selectedByActor.values()) {
      const record = this.objects.get(binding.actorTag);
      const authDriven = record?.sceneObject && this.active.authoredActors.has(binding.actorTag);
      if (binding.action === "detach") {
        if (!authDriven) record?.root.setEnabled(false);
        if (record) applied += 1;
        continue;
      }
      const parent = this.resolveActor(binding.parentActorTag);
      const nodes = parent?.model?.latestControllerFamily?.nodes?.filter(
        node => node.type === binding.controlId,
      ) || [];
      const parentMatrix = nodes.length === 1
        ? parent.model.latestControllerMatrices?.[nodes[0].index]
        : null;
      const parentRenderRoot = parent?.model?.renderRoot;
      if (!record || !parentRenderRoot || !Array.isArray(parentMatrix) || parentMatrix.length !== 16) {
        record?.root.setEnabled(false);
        continue;
      }
      const sourceMatrix = Mt5Loader.rowMultiply(
        localAttachmentMatrix(binding),
        parentMatrix,
      );
      const wasVisible = record.root.isEnabled();
      // Controllers are source-model-local, not actor-local. The shared X
      // conversion puts them in the mirrored character's render-root space;
      // using the outer actor root skips model orientation, scale and grounding.
      if (applyAttachedMatrix(record.root, parentRenderRoot, sourceMatrix, record.sceneObject)) {
        const authoredPresentation = this.active.presentationActors.has(binding.actorTag);
        const visible = visibilityByActor.get(binding.actorTag)?.visible
          ?? (authDriven ? wasVisible : !authoredPresentation);
        record.root.setEnabled(visible);
        applied += 1;
      }
      else record.root.setEnabled(false);
    }
    const nodesApplied = this.#applyNodeTransforms(frame);
    return applied === selectedByActor.size && nodesApplied;
  }

  endTrack() {
    if (!this.active) return false;
    const actorTags = new Set([
      ...this.active.bindings, ...this.active.presentation, ...this.active.nodeOperations,
    ].map(event => event.actorTag));
    for (const actorTag of actorTags) {
      const record = this.objects.get(actorTag);
      if (!record) continue;
      if (record.sceneObject && this.active.authoredActors.has(actorTag)) {
        // AUTH owns this object's root, while we only borrow its moving parts.
        // Restore those parts even for node-only presentation (no attachment),
        // including cancellation before the native closing motion finishes.
        restoreObjectNodes(record, new Set(this.active.nodeOperations
          .filter(operation => operation.actorTag === actorTag)
          .map(operation => operation.nodeKey)));
      } else restoreObject(record);
    }
    this.active = null;
    return true;
  }

  endActivity() {
    return this.endTrack();
  }

  clear() {
    this.endTrack();
    for (const record of this.objects.values()) {
      if (record.packageOwned) record.root.dispose(false, true);
      else if (!record.sceneObject) restoreObject(record);
    }
    this.objects.clear();
  }

  #beginScope(scopeKey) {
    this.endTrack();
    const bindings = this.bindingsByScope.get(scopeKey) || [];
    const presentation = this.presentationByScope.get(scopeKey) || [];
    const nodeOperations = this.nodeOperationsByScope.get(scopeKey) || [];
    this.active = {
      scopeKey,
      frame: 0,
      bindings,
      presentation,
      presentationActors: new Set(presentation.map(event => event.actorTag)),
      nodeOperations,
    };
    return bindings.length;
  }

  #applyNodeTransforms(frame) {
    const byActorAndNode = new Map();
    for (const operation of this.active.nodeOperations) {
      const key = `${operation.actorTag}:${operation.nodeKey}`;
      const operations = byActorAndNode.get(key) || [];
      operations.push(operation);
      byActorAndNode.set(key, operations);
    }
    for (const [key, operations] of byActorAndNode) {
      const separator = key.indexOf(":");
      const actorTag = key.slice(0, separator);
      const nodeKey = Number(key.slice(separator + 1));
      const record = this.objects.get(actorTag);
      const matches = (record?.root?._mt5Nodes || []).filter(
        node => signedRenderKey(node) === nodeKey,
      );
      if (matches.length !== 1) {
        record?.root.setEnabled(false);
        return false;
      }
      const node = matches[0];
      const initial = record.nodeSnapshots.get(node);
      const position = evaluateNodeChannel(initial.position, operations, frame, "position");
      const rotation = evaluateNodeChannel(initial.rotation, operations, frame, "rotation");
      node.mesh.position.set(-position[0], position[1], position[2]);
      setSourceOrderRotation(node.mesh, [rotation[0], -rotation[1], -rotation[2]]);
      node.mesh.computeWorldMatrix?.(true);
    }
    return true;
  }
}

export function createNativeAseqAttachedObjectRuntime(options) {
  return new NativeAseqAttachedObjectRuntime(options);
}
