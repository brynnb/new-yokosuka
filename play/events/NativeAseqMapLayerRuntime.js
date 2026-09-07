function requireText(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${label} must be non-empty text`);
  }
  return value.trim();
}

function requireAddress(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative integer`);
  }
  return value;
}

export class NativeAseqMapLayerRuntime {
  constructor({ definitions, geometryMasks = [] } = {}) {
    if (!Array.isArray(definitions) || definitions.length === 0) {
      throw new TypeError("AUTH map visibility requires generated definitions");
    }
    this.definitions = new Map();
    const filenames = new Set();
    for (const value of definitions) {
      const nativeName = requireText(value?.nativeName, "AUTH map visibility name");
      if (this.definitions.has(nativeName)) {
        throw new Error(`AUTH map visibility model ${nativeName} is duplicated`);
      }
      const browserFilename = requireText(
        value.browserFilename,
        `AUTH map visibility ${nativeName} browser filename`,
      );
      const normalizedFilename = browserFilename.toUpperCase();
      if (filenames.has(normalizedFilename)) {
        throw new Error(`AUTH map visibility filename ${browserFilename} is duplicated`);
      }
      filenames.add(normalizedFilename);
      this.definitions.set(nativeName, Object.freeze({
        nativeName,
        browserFilename,
      }));
    }
    if (!Array.isArray(geometryMasks)) {
      throw new TypeError("AUTH map geometry masks must be an array");
    }
    this.geometryMasks = Object.freeze(geometryMasks.map((value, index) => (
      Object.freeze({
        browserFilename: requireText(
          value?.browserFilename,
          `AUTH map geometry mask ${index} browser filename`,
        ),
        nodeAddress: requireAddress(
          value?.nodeAddress,
          `AUTH map geometry mask ${index} node address`,
        ),
      })
    )));
    this.roots = new Map();
    this.maskedGeometry = [];
    this.active = null;
  }

  load(roots) {
    if (!Array.isArray(roots)) {
      throw new TypeError("AUTH map visibility requires loaded world roots");
    }
    this.clear();
    for (const [nativeName, definition] of this.definitions) {
      const matches = roots.filter(root => (
        root?._filename?.toUpperCase() === definition.browserFilename.toUpperCase()
      ));
      if (matches.length !== 1) {
        throw new Error(
          `AUTH map visibility ${nativeName} expected one ${definition.browserFilename}; `
          + `found ${matches.length}`,
        );
      }
      this.roots.set(nativeName, matches[0]);
    }
    for (const mask of this.geometryMasks) {
      const rootsForMask = roots.filter(root => (
        root?._filename?.toUpperCase() === mask.browserFilename.toUpperCase()
      ));
      if (rootsForMask.length !== 1) {
        throw new Error(
          `AUTH map geometry expected one ${mask.browserFilename}; `
          + `found ${rootsForMask.length}`,
        );
      }
      const nodes = (rootsForMask[0]._mt5Nodes || []).filter(
        node => node?.addr === mask.nodeAddress,
      );
      if (nodes.length !== 1) {
        throw new Error(
          `AUTH map geometry ${mask.browserFilename} expected node `
          + `0x${mask.nodeAddress.toString(16)}; found ${nodes.length}`,
        );
      }
      const mesh = nodes[0].mesh;
      if (typeof mesh?.setEnabled !== "function") {
        throw new Error(
          `AUTH map geometry ${mask.browserFilename} node `
          + `0x${mask.nodeAddress.toString(16)} cannot be hidden`,
        );
      }
      this.maskedGeometry.push({
        mesh,
        enabled: mesh.isEnabled?.() !== false,
      });
      mesh.setEnabled(false);
      mesh.computeWorldMatrix?.(true);
    }
    return this.roots.size;
  }

  applyActivity(activity) {
    if (!activity?.activityId || !Array.isArray(activity.browserMapVisibility)) {
      throw new TypeError("AUTH activity has no generated browser map visibility");
    }
    if (this.roots.size !== this.definitions.size) {
      throw new Error("AUTH map visibility models are not loaded");
    }
    const states = new Map();
    for (const state of activity.browserMapVisibility) {
      const nativeName = state?.nativeName;
      const definition = this.definitions.get(nativeName);
      if (
        !definition
        || typeof state.visible !== "boolean"
        || states.has(nativeName)
      ) {
        throw new Error(`AUTH activity ${activity.activityId} has invalid browser map visibility`);
      }
      states.set(nativeName, state.visible);
    }
    if (states.size !== this.definitions.size) {
      throw new Error(`AUTH activity ${activity.activityId} has incomplete browser map visibility`);
    }
    this.active ||= {
      snapshots: new Map([...this.roots].map(([nativeName, root]) => [
        nativeName,
        root.isEnabled?.() !== false,
      ])),
      activityId: null,
    };
    for (const [nativeName, definition] of this.definitions) {
      const root = this.roots.get(nativeName);
      root.setEnabled(states.get(nativeName));
      root.computeWorldMatrix?.(true);
      root.metadata = {
        ...(root.metadata || {}),
        nativeAseqMapVisibilityModel: definition.nativeName,
      };
    }
    this.active.activityId = activity.activityId;
    return true;
  }

  end() {
    if (!this.active) return true;
    for (const [nativeName, enabled] of this.active.snapshots) {
      const root = this.roots.get(nativeName);
      if (!root?.isDisposed?.()) {
        root.setEnabled(enabled);
        root.computeWorldMatrix?.(true);
      }
    }
    this.active = null;
    return true;
  }

  clear() {
    this.end();
    for (const { mesh, enabled } of this.maskedGeometry) {
      if (!mesh?.isDisposed?.()) {
        mesh.setEnabled(enabled);
        mesh.computeWorldMatrix?.(true);
      }
    }
    this.maskedGeometry = [];
    this.roots.clear();
  }
}

export function createNativeAseqMapLayerRuntime(options) {
  return new NativeAseqMapLayerRuntime(options);
}
