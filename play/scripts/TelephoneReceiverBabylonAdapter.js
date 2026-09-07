import * as BABYLON from "@babylonjs/core";

import { Mt5Loader } from "../../src/Mt5Loader.js";

const FULL_TURN = Math.PI * 2;

function signedRenderKey(node) {
  const low16 = node.flag & 0xffff;
  return low16 >= 0x8000 ? low16 - 0x10000 : low16;
}

function finiteMatrix(value) {
  return (
    (Array.isArray(value) || ArrayBuffer.isView(value))
    && value.length === 16
    && [...value].every(Number.isFinite)
  );
}

function exactReceiverBinding(binding) {
  return (
    binding?.objectTag === "TEL_"
    && binding.actorCode === "AKIR"
    && binding.bindingIndex === 3
    && binding.objectRenderKey === 3
    && binding.actorRenderKey === -0x42
    && binding.actorRuntimeMatrixIndex === 30
    && binding.handCorrection?.rotationAxis === "z"
    && binding.handCorrection?.rotationFixedTurnRaw === 0x4000
    && Array.isArray(binding.handCorrection?.translation)
    && binding.handCorrection.translation.length === 3
    && binding.handCorrection.translation[0] === 0.02499999850988388
    && binding.handCorrection.translation[1] === 0.07499999552965164
    && binding.handCorrection.translation[2] === 0
  );
}

function sourceCorrection(binding) {
  const [x, y, z] = binding.handCorrection.translation;
  return Mt5Loader.sourceTransformMatrix({
    scl: { x: 1, y: 1, z: 1 },
    rot: {
      x: 0,
      y: 0,
      z: binding.handCorrection.rotationFixedTurnRaw / 0x10000 * FULL_TURN,
    },
    pos: { x, y, z },
  });
}

function transformSnapshot(node) {
  return {
    parent: node.parent,
    position: node.position.clone(),
    rotation: node.rotation.clone(),
    rotationQuaternion: node.rotationQuaternion?.clone() || null,
    scaling: node.scaling.clone(),
  };
}

function restoreTransform(node, snapshot) {
  node.parent = snapshot.parent;
  node.position.copyFrom(snapshot.position);
  node.rotation.copyFrom(snapshot.rotation);
  node.rotationQuaternion = snapshot.rotationQuaternion?.clone() || null;
  node.scaling.copyFrom(snapshot.scaling);
}

// Implements only the exact TELM receiver route proven for JOMO's TEL_ model:
// render control 3 is rebound to AKIR selector 3, which resolves to Ryo's
// left-arm endpoint (-0x42 / runtime matrix 30). Unknown descriptors fail
// closed instead of choosing a nearby mesh or bone.
export class TelephoneReceiverBabylonAdapter {
  constructor({
    modelOffset,
    resolveObjectRoot,
    getPlayerControlSourceMatrix,
  } = {}) {
    if (
      !modelOffset
      || typeof resolveObjectRoot !== "function"
      || typeof getPlayerControlSourceMatrix !== "function"
    ) {
      throw new TypeError(
        "telephone receiver adapter requires exact scene and player controls",
      );
    }
    this.modelOffset = modelOffset;
    this.resolveObjectRoot = resolveObjectRoot;
    this.getPlayerControlSourceMatrix = getPlayerControlSourceMatrix;
    this.active = null;
  }

  attach(binding, owner) {
    if (this.active || !owner || !exactReceiverBinding(binding)) return false;
    const root = this.resolveObjectRoot(binding.objectTag);
    if (!root || root.isDisposed?.()) return false;
    const matches = (root._mt5Nodes || []).filter(
      node => signedRenderKey(node) === binding.objectRenderKey,
    );
    if (matches.length !== 1 || !matches[0].mesh) return false;
    const receiver = matches[0].mesh;
    const subtree = [receiver, ...receiver.getDescendants(false)];
    const frozen = subtree.map(node => Boolean(node.isWorldMatrixFrozen));
    const snapshot = transformSnapshot(receiver);
    for (const node of subtree) node.unfreezeWorldMatrix?.();
    receiver.parent = this.modelOffset;
    this.active = {
      owner,
      binding: structuredClone(binding),
      root,
      receiver,
      subtree,
      frozen,
      snapshot,
    };
    if (this.update(binding, owner)) return true;
    this.restoreActive();
    return false;
  }

  update(binding, owner) {
    const active = this.active;
    if (
      !active
      || active.owner !== owner
      || !exactReceiverBinding(binding)
      || active.receiver.isDisposed?.()
      || active.root.isDisposed?.()
    ) return false;
    const parent = this.getPlayerControlSourceMatrix({
      actorCode: binding.actorCode,
      renderKey: binding.actorRenderKey,
      runtimeMatrixIndex: binding.actorRuntimeMatrixIndex,
    });
    if (!finiteMatrix(parent)) return false;
    const sourceMatrix = Mt5Loader.rowMultiply(
      sourceCorrection(binding),
      [...parent],
    );
    const matrix = BABYLON.Matrix.FromArray(sourceMatrix);
    const scaling = BABYLON.Vector3.One();
    const rotation = BABYLON.Quaternion.Identity();
    const translation = BABYLON.Vector3.Zero();
    if (!matrix.decompose(scaling, rotation, translation)) return false;
    active.receiver.parent = this.modelOffset;
    active.receiver.position.copyFrom(translation);
    active.receiver.rotation.setAll(0);
    active.receiver.rotationQuaternion = rotation;
    active.receiver.scaling.copyFrom(scaling);
    active.receiver.computeWorldMatrix(true);
    for (const node of active.subtree.slice(1)) node.computeWorldMatrix?.(true);
    return true;
  }

  detach(binding, owner) {
    if (
      !this.active
      || this.active.owner !== owner
      || !exactReceiverBinding(binding)
    ) return false;
    this.restoreActive();
    return true;
  }

  restoreActive() {
    const active = this.active;
    this.active = null;
    if (!active || active.receiver.isDisposed?.()) return true;
    for (const node of active.subtree) node.unfreezeWorldMatrix?.();
    restoreTransform(active.receiver, active.snapshot);
    active.receiver.computeWorldMatrix(true);
    for (const node of active.subtree.slice(1)) node.computeWorldMatrix?.(true);
    active.subtree.forEach((node, index) => {
      if (active.frozen[index]) node.freezeWorldMatrix?.();
    });
    return true;
  }
}

export function createTelephoneReceiverBabylonAdapter(options) {
  return new TelephoneReceiverBabylonAdapter(options);
}
