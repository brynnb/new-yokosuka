export function nativeFailureDetail(result) {
  const details = [];
  const visited = new Set();
  let current = result;
  for (let depth = 0; depth < 8 && current && typeof current === "object"; depth += 1) {
    if (visited.has(current)) break;
    visited.add(current);
    const reason = current.reason;
    if (typeof reason === "string") {
      details.push(reason);
      break;
    }
    if (reason && typeof reason === "object") {
      if (typeof reason.kind === "string" && reason.kind) details.push(reason.kind);
      if (typeof reason.semanticId === "string" && reason.semanticId) {
        details.push(`semantic ${reason.semanticId}`);
      }
      if (typeof reason.message === "string" && reason.message) details.push(reason.message);
      if (typeof reason.detail === "string" && reason.detail) details.push(reason.detail);
      current = reason.result || current.result;
      continue;
    }
    current = current.result;
  }
  return details.join(" -> ") || result?.status || "unknown native failure";
}

export class NativeScriptActivityRunner {
  constructor({
    nativeRuntime,
    getArea,
    captureClientState,
    restoreClientState,
    selectedObjectActionController = null,
  } = {}) {
    if (
      typeof nativeRuntime?.startObjectInteraction !== "function"
      || typeof nativeRuntime?.onSettled !== "function"
      || typeof nativeRuntime?.cancel !== "function"
      || typeof getArea !== "function"
      || typeof captureClientState !== "function"
      || typeof restoreClientState !== "function"
    ) {
      throw new TypeError("native script activity runner requires runtime ownership hooks");
    }
    if (
      selectedObjectActionController
      && (
        typeof selectedObjectActionController.claim !== "function"
        || typeof selectedObjectActionController.release !== "function"
      )
    ) {
      throw new TypeError("native script activity runner received an incomplete selected-object controller");
    }
    this.nativeRuntime = nativeRuntime;
    this.getArea = getArea;
    this.captureClientState = captureClientState;
    this.restoreClientState = restoreClientState;
    this.selectedObjectActionController = selectedObjectActionController;
    this.active = null;
  }

  async start(activity, context = {}) {
    if (this.active) throw new Error("a specialized script activity is already active");
    if (
      activity?.kind !== "native-object-interaction"
      || typeof activity.area !== "string"
      || typeof activity.objectTag !== "string"
      || !Number.isSafeInteger(activity.action)
    ) {
      throw new Error("specialized script activity descriptor is invalid");
    }
    if (activity.area !== this.getArea() || context.area !== activity.area) {
      throw new Error(`script activity area ${activity.area} is not active`);
    }
    if (context.objectTag !== activity.objectTag || !context.sceneObject) {
      throw new Error(`script activity requires selected object ${activity.objectTag}`);
    }

    const restoreClientStateRequired = activity.durableEffects === "forbidden";
    const clientState = restoreClientStateRequired
      ? this.captureClientState()
      : null;
    const selectedObjectActionToken = this.selectedObjectActionController?.claim({
      area: activity.area,
      objectTag: activity.objectTag,
      action: activity.action,
      sceneObject: context.sceneObject,
    }) ?? null;
    let settle;
    const settled = new Promise(resolve => { settle = resolve; });
    const owner = {
      activity,
      settle,
      unsubscribe: null,
      restoreClientStateRequired,
      clientState,
      clientStateRestored: false,
      selectedObjectActionToken,
    };
    try {
      owner.unsubscribe = this.nativeRuntime.onSettled(({ kind, result }) => {
        if (this.active !== owner) return;
        this.finish(owner, kind === "completed", result);
      });
    } catch (error) {
      if (selectedObjectActionToken) {
        this.selectedObjectActionController.release(selectedObjectActionToken);
      }
      throw error;
    }
    this.active = owner;

    let started;
    try {
      started = await this.nativeRuntime.startObjectInteraction({
        area: activity.area,
        objectTag: activity.objectTag,
        sceneObject: context.sceneObject,
        context: {
          selectedObjectTag: activity.objectTag,
          selectedObjectAction: activity.action,
          ...(context.nativeContext || {}),
        },
      });
    } catch (error) {
      this.finish(owner, false, { status: "stopped", reason: error.message });
      throw error;
    }
    if (this.active === owner && ["stopped", "not-matched", "cancelled"].includes(started?.status)) {
      this.finish(owner, false, started);
    } else if (this.active === owner && started?.status === "completed") {
      this.finish(owner, true, started);
    }
    const result = await settled;
    if (!result.accepted && result.result?.status !== "cancelled") {
      throw new Error(
        `specialized activity ${activity.objectTag} stopped: ${
          nativeFailureDetail(result.result)
        }`,
      );
    }
    return result.accepted;
  }

  cancel(reason = "script-activity-cancelled") {
    const owner = this.active;
    if (!owner) return false;
    if (this.nativeRuntime.cancel(reason) !== true && this.active === owner) {
      this.finish(owner, false, { status: "cancelled", reason });
    }
    return true;
  }

  finish(owner, accepted, result) {
    if (this.active !== owner) return false;
    if (owner.restoreClientStateRequired && !owner.clientStateRestored) {
      try {
        this.restoreClientState(owner.clientState);
        owner.clientStateRestored = true;
      } catch (error) {
        accepted = false;
        result = {
          status: "stopped",
          reason: "client-state-restore-failed",
          message: error instanceof Error ? error.message : String(error),
        };
      }
    }
    if (owner.selectedObjectActionToken) {
      try {
        if (!this.selectedObjectActionController.release(
          owner.selectedObjectActionToken,
        )) {
          throw new Error("selected native object action ownership was lost");
        }
      } catch (error) {
        accepted = false;
        result = {
          status: "stopped",
          reason: "selected-object-action-release-failed",
          message: error instanceof Error ? error.message : String(error),
        };
      }
    }
    this.active = null;
    owner.unsubscribe?.();
    owner.settle({ accepted, result });
    return true;
  }
}

export function createNativeScriptActivityRunner(options) {
  return new NativeScriptActivityRunner(options);
}
