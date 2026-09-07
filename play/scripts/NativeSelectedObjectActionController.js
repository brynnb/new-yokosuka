function requireObjectTag(value) {
  const objectTag = String(value || "");
  if (objectTag.length !== 4) {
    throw new TypeError("selected native object requires a four-character tag");
  }
  return objectTag;
}

export class NativeSelectedObjectActionController {
  constructor() {
    this.active = null;
    this.revision = 0;
  }

  claim({ area, objectTag, action, sceneObject } = {}) {
    if (this.active) {
      throw new Error("a selected native object action is already owned");
    }
    if (typeof area !== "string" || !area) {
      throw new TypeError("selected native object action requires an area");
    }
    if (!Number.isSafeInteger(action)) {
      throw new TypeError("selected native object action requires an integer action");
    }
    if (!sceneObject) {
      throw new TypeError("selected native object action requires its scene object");
    }
    const token = Object.freeze({ revision: ++this.revision });
    this.active = {
      token,
      area,
      objectTag: requireObjectTag(objectTag),
      action,
      sceneObject,
    };
    return token;
  }

  execute({ mode, objectTag, state } = {}) {
    const active = this.active;
    if (!active) {
      throw new Error("selected native object action has no activity owner");
    }
    if (mode === 1) {
      if (active.action !== 1 || requireObjectTag(objectTag) !== active.objectTag) {
        throw new Error("native tagged-object action does not match the selected object");
      }
      return 0;
    }
    if (mode === 4) {
      if (
        state?.objectTag !== active.objectTag
        || ![1, 2].includes(state.nativeState)
        || state.completed !== false
      ) {
        throw new Error("selected native object action state cannot be polled");
      }
      return 1;
    }
    if (mode === 5) {
      if (
        state?.objectTag !== active.objectTag
        || state.nativeState !== 1
        || state.completed !== true
      ) {
        throw new Error("selected native object action cannot be finalized");
      }
      return 0;
    }
    if (mode === 2) {
      if (
        state?.objectTag !== active.objectTag
        || state.nativeState !== 1
        || state.completed !== true
      ) {
        throw new Error("selected native object action cannot begin its return phase");
      }
      return 0;
    }
    throw new Error(`selected native object action mode ${mode} is not owned`);
  }

  release(token) {
    if (!this.active || this.active.token !== token) return false;
    this.active = null;
    return true;
  }
}

export function createNativeSelectedObjectActionController() {
  return new NativeSelectedObjectActionController();
}
