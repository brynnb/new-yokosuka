import { numberedMapLayer } from "../../src/rendering/NativeMapLayerState.js";

const NATIVE_LAYER_COUNT = 32;

function liveNode(node) {
  return node && (typeof node.isDisposed !== "function" || !node.isDisposed());
}

function nodes(root) {
  return [root, ...(root?.getDescendants?.(false) || [])].filter(liveNode);
}

function requireSelector(selector) {
  if (
    !Number.isSafeInteger(selector)
    || (selector !== -1 && (selector < 0 || selector >= NATIVE_LAYER_COUNT))
  ) {
    throw new RangeError(
      `native MAP preparation selector must be -1 or 0 through ${NATIVE_LAYER_COUNT - 1}`,
    );
  }
  return selector;
}

function requireMode(mode) {
  if (mode !== 0 && mode !== 1) {
    throw new RangeError("native MAP preparation mode must be 0 or 1");
  }
  return mode;
}

export class NativeMapRenderPreparationState {
  constructor({ lightDirtyFlag } = {}) {
    if (!Number.isInteger(lightDirtyFlag)) {
      throw new TypeError("Babylon light dirty flag is required");
    }
    this.lightDirtyFlag = lightDirtyFlag;
    this.nodesByLayer = new Map();
    this.preparedLayers = new Set();
    this.activeTransaction = null;
  }

  clear() {
    if (this.activeTransaction) {
      throw new Error(
        "cannot clear native MAP preparation during a transaction",
      );
    }
    this.nodesByLayer.clear();
    this.preparedLayers.clear();
  }

  load(world, roots) {
    this.clear();
    const modelPrefix = String(world?.prefix || "").toUpperCase();
    if (!modelPrefix) return [];
    for (const root of roots || []) {
      const layer = numberedMapLayer(root?._filename, modelPrefix);
      if (layer === null || layer >= NATIVE_LAYER_COUNT) continue;
      const layerNodes = nodes(root);
      if (layerNodes.length === 0) continue;
      this.nodesByLayer.set(layer, [
        ...(this.nodesByLayer.get(layer) || []),
        ...layerNodes,
      ]);
      this.preparedLayers.add(layer);
    }
    return [...this.preparedLayers].sort((left, right) => left - right);
  }

  selectedLayers(selector) {
    const selected = requireSelector(selector);
    return selected === -1
      ? [...this.nodesByLayer.keys()].sort((left, right) => left - right)
      : (this.nodesByLayer.has(selected) ? [selected] : []);
  }

  refreshLayers(layers) {
    const materials = new Set();
    for (const layer of layers) {
      for (const node of this.nodesByLayer.get(layer) || []) {
        if (!liveNode(node)) continue;
        node._resyncLightSources?.();
        if (node.material) materials.add(node.material);
      }
    }
    for (const material of materials) {
      material.unfreeze?.();
      material.markAsDirty?.(this.lightDirtyFlag);
    }
    return materials.size;
  }

  apply({ selector, mode }) {
    const selectedMode = requireMode(mode);
    const layers = this.selectedLayers(selector);
    const materialCount = this.refreshLayers(layers);
    for (const layer of layers) {
      if (selectedMode === 0) this.preparedLayers.delete(layer);
      else this.preparedLayers.add(layer);
      this.activeTransaction?.touchedLayers.add(layer);
    }
    return {
      selector,
      mode: selectedMode,
      layers,
      materialCount,
    };
  }

  adapter() {
    return {
      applyMapRenderPreparation: detail => (this.apply(detail), true),
    };
  }

  beginTransaction() {
    if (this.activeTransaction) {
      throw new Error("native MAP preparation transaction is already active");
    }
    const token = Symbol("native-map-render-preparation-transaction");
    this.activeTransaction = {
      token,
      preparedLayers: new Set(this.preparedLayers),
      touchedLayers: new Set(),
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
    this.preparedLayers = new Set(transaction.preparedLayers);
    this.refreshLayers(transaction.touchedLayers);
    this.activeTransaction = null;
    return true;
  }

  requireTransaction(token) {
    if (!this.activeTransaction || this.activeTransaction.token !== token) {
      throw new Error("native MAP preparation transaction token is invalid");
    }
    return this.activeTransaction;
  }
}
