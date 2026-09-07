const NATIVE_FALLBACK_CODES = new Set([
  "no_script",
  "unavailable",
  "area_unavailable",
]);

export function nativeAutomaticGateInputUnavailable(result) {
  return (
    result?.status === "stopped"
    && result.reason?.kind === "automatic-event-gate-stopped"
    && result.reason.result?.status === "stopped"
    && result.reason.result.reason?.kind === "unresolved-branch-predicate"
  );
}

function requireArea(value) {
  const area = String(value || "").trim().toUpperCase();
  if (!/^[A-Z0-9]{4}$/.test(area)) {
    throw new TypeError("automatic script events require a native area");
  }
  return area;
}

export class ScriptAutomaticEventRuntime {
  constructor({ controller, pollNative, onError = () => {} } = {}) {
    if (
      typeof controller?.start !== "function"
      || typeof pollNative !== "function"
      || typeof onError !== "function"
    ) {
      throw new TypeError(
        "automatic script runtime requires controller and native fallback adapters",
      );
    }
    this.controller = controller;
    this.pollNative = pollNative;
    this.onError = onError;
    this.area = null;
    this.generation = 0;
    this.attempted = false;
    this.pending = null;
  }

  enterArea(area) {
    const next = requireArea(area);
    if (next === this.area) return false;
    this.generation += 1;
    this.area = next;
    this.attempted = false;
    this.pending = null;
    return true;
  }

  leaveArea() {
    if (this.area === null && !this.pending) return false;
    this.generation += 1;
    this.area = null;
    this.attempted = false;
    this.pending = null;
    return true;
  }

  update({ area, context = {}, enabled = true } = {}) {
    if (!enabled) return false;
    this.enterArea(area);
    if (
      this.attempted
      || this.pending
      || this.controller.status !== "idle"
    ) return false;

    this.attempted = true;
    const generation = this.generation;
    const selectedArea = this.area;
    const selectedContext = { ...context, area: selectedArea };
    const pending = this.pollServer({
      generation,
      area: selectedArea,
      context: selectedContext,
    });
    this.pending = pending;
    void pending.finally(() => {
      if (this.pending === pending) this.pending = null;
    });
    return true;
  }

  async pollServer({ generation, area, context }) {
    try {
      const result = await this.controller.start(
        { kind: "automatic" },
        context,
      );
      if (!this.isCurrent(generation, area)) return false;
      if (
        result?.outcome === "rejected"
        && NATIVE_FALLBACK_CODES.has(result.error?.code)
      ) {
        await this.fallbackToNative({ area, context, reason: result.error.code });
      } else if (result?.outcome === "rejected") {
        this.onError(result.error || new Error("automatic script event was rejected"));
      }
      // A declined result still proves that a published server candidate owned
      // this room-entry dispatch and deliberately passed it. Running the native
      // route as well would duplicate its gate effects.
      return true;
    } catch (error) {
      if (!this.isCurrent(generation, area)) return false;
      if (error?.code === "connection_unavailable") {
        await this.fallbackToNative({ area, context, reason: error.code });
        return true;
      }
      if (!["start_cancelled", "start_interrupted"].includes(error?.code)) {
        this.onError(error);
      }
      return false;
    }
  }

  isCurrent(generation, area) {
    return this.generation === generation && this.area === area;
  }

  async fallbackToNative(detail) {
    try {
      await this.pollNative(detail);
      return true;
    } catch (error) {
      this.onError(error);
      return false;
    }
  }
}

export function createScriptAutomaticEventRuntime(options) {
  return new ScriptAutomaticEventRuntime(options);
}
