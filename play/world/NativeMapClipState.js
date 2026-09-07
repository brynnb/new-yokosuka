import { numberedMapLayer } from "../../src/rendering/NativeMapLayerState.js";

const NATIVE_LAYER_COUNT = 32;

function meshNodes(root) {
  return [root, ...(root.getDescendants?.(false) || [])];
}

function liveCollisionNode(node) {
  return node?.checkCollisions === true
    && (typeof node.isDisposed !== "function" || !node.isDisposed());
}

function requireRecords(records) {
  if (!Array.isArray(records) || records.length !== NATIVE_LAYER_COUNT) {
    throw new RangeError("native MAP CLIP state requires exactly 32 records");
  }
  return records;
}

export class NativeMapClipState {
  constructor() {
    this.nodesByLayer = new Map();
    this.activeTransaction = null;
  }

  clear() {
    if (this.activeTransaction) {
      throw new Error("cannot clear native MAP CLIP state during a transaction");
    }
    this.nodesByLayer.clear();
  }

  load(world, roots) {
    this.clear();
    const modelPrefix = String(world?.prefix || "").toUpperCase();
    if (!modelPrefix) return this.nativeRecords();
    for (const root of roots || []) {
      const layer = numberedMapLayer(root?._filename, modelPrefix);
      if (layer === null) continue;
      const nodes = meshNodes(root).filter(liveCollisionNode);
      if (nodes.length > 0) {
        this.nodesByLayer.set(layer, [
          ...(this.nodesByLayer.get(layer) || []),
          ...nodes,
        ]);
      }
    }
    return this.nativeRecords();
  }

  nativeRecords() {
    return Array.from({ length: NATIVE_LAYER_COUNT }, (_, layer) => {
      const nodes = this.nodesByLayer.get(layer) || [];
      return {
        // The native operation tests only zero versus nonzero at +0x00. This
        // is a presence projection, not a fabricated Dreamcast pointer.
        word00: nodes.length > 0 ? 1 : 0,
        word08: nodes.some(node => node.checkCollisions === true) ? 1 : 0,
      };
    });
  }

  applyNativeRecords(records) {
    for (const [layer, record] of requireRecords(records).entries()) {
      const enabled = Number(record.word08) !== 0;
      for (const node of this.nodesByLayer.get(layer) || []) {
        if (!node.isDisposed?.()) node.checkCollisions = enabled;
      }
    }
    return true;
  }

  beginTransaction() {
    if (this.activeTransaction) {
      throw new Error("native MAP CLIP transaction is already active");
    }
    const token = Symbol("native-map-clip-transaction");
    this.activeTransaction = {
      token,
      snapshot: new Map(
        [...this.nodesByLayer.values()].flat().map(node => [
          node,
          node.checkCollisions === true,
        ]),
      ),
    };
    return token;
  }

  commitTransaction(token) {
    this.requireTransaction(token);
    this.activeTransaction = null;
    return true;
  }

  rollbackTransaction(token) {
    const transaction = this.requireTransaction(token);
    for (const [node, enabled] of transaction.snapshot) {
      if (!node.isDisposed?.()) node.checkCollisions = enabled;
    }
    this.activeTransaction = null;
    return true;
  }

  requireTransaction(token) {
    if (!this.activeTransaction || this.activeTransaction.token !== token) {
      throw new Error("native MAP CLIP transaction token is invalid");
    }
    return this.activeTransaction;
  }
}
