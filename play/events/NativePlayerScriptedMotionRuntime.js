function requireActorCode(value) {
  const actorCode = String(value || "").toUpperCase();
  if (!/^[A-Z0-9_]{4}$/.test(actorCode)) {
    throw new TypeError(
      "native scripted motion actor must be a four-character identifier",
    );
  }
  return actorCode;
}

function cloneStatuses(statuses) {
  return new Map(statuses);
}

function cloneControllerStates(states) {
  return new Map(
    [...states].map(([actorCode, state]) => [actorCode, { ...state }]),
  );
}

function float32Word(value) {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, Math.fround(value), true);
  return view.getUint32(0, true);
}

export class NativePlayerScriptedMotionRuntime {
  constructor({
    getAnimation,
    actorCode = "AKIR",
  } = {}) {
    if (typeof getAnimation !== "function") {
      throw new TypeError(
        "native player scripted motion requires an animation provider",
      );
    }
    this.getAnimation = getAnimation;
    this.actorCode = requireActorCode(actorCode);
    this.statuses = new Map();
    this.controllerStates = new Map();
    this.activeTransaction = null;
  }

  beginTransaction() {
    if (this.activeTransaction) {
      throw new Error(
        "native player scripted motion transaction is already active",
      );
    }
    const transaction = {
      token: Symbol("native-player-scripted-motion"),
      statusSnapshot: cloneStatuses(this.statuses),
      controllerSnapshot: cloneControllerStates(this.controllerStates),
      playbackRevision: null,
    };
    this.activeTransaction = transaction;
    return transaction.token;
  }

  requestMotion({ actorCode, request, parameters = [], source = null }) {
    const transaction = this.requireTransaction();
    if (requireActorCode(actorCode) !== this.actorCode) return false;
    if (
      !Number.isInteger(request)
      || !Array.isArray(parameters)
      || parameters.length !== 4
      || !parameters.every(Number.isFinite)
    ) {
      return false;
    }
    const animation = this.getAnimation();
    if (!animation) return false;
    const activeRevision = animation.activeOneShot?.playbackRevision ?? null;
    if (
      animation.activeEmote
      || (
        activeRevision !== null
        && activeRevision !== transaction.playbackRevision
      )
    ) {
      return false;
    }
    const requestToken = Symbol("native-player-motion-request");
    const accepted = animation.playNativeMotionRequest(request, {
      holdLastFrame: true,
      context: {
        kind: "native-scripted-motion",
        actorCode: this.actorCode,
        request,
        parameters: [...parameters],
        source: source ? { ...source } : null,
      },
      onComplete: () => {
        const active = this.activeTransaction;
        if (active?.requestToken !== requestToken) return;
        this.statuses.set(
          this.actorCode,
          (this.statuses.get(this.actorCode) ?? 0) | 2,
        );
      },
    });
    if (accepted !== true) return false;
    transaction.requestToken = requestToken;
    transaction.playbackRevision = (
      animation.activeOneShot?.playbackRevision ?? null
    );
    if (transaction.playbackRevision === null) {
      throw new Error(
        "native scripted motion started without a playback revision",
      );
    }
    const [parameter12c, parameter130, parameter134, parameterDc] =
      parameters;
    const previousStatus = this.statuses.get(this.actorCode) ?? 0;
    const previousController = this.controllerStates.get(this.actorCode) || {};
    this.statuses.set(this.actorCode, previousStatus & ~2);
    this.controllerStates.set(this.actorCode, {
      ...previousController,
      requestWord66: request & 0xffff,
      parameter12c: (
        parameter130 === 0
          ? 0
          : parameter12c > 0
            ? parameter12c
            : 0
      ),
      parameter130: (
        parameter130 > 0 ? parameter130 : 0
      ),
      parameter134: parameter134 > 0 ? parameter134 : -1,
      parameterDc,
    });
    return true;
  }

  readMotionStatus({ actorCode }) {
    if (requireActorCode(actorCode) !== this.actorCode) return undefined;
    return this.statuses.get(this.actorCode);
  }

  readControllerState(actorCode = this.actorCode) {
    const state = this.controllerStates.get(requireActorCode(actorCode));
    return state ? { ...state } : undefined;
  }

  readMomtNumericWords({ actorCode = this.actorCode } = {}) {
    if (requireActorCode(actorCode) !== this.actorCode) return undefined;
    const transaction = this.activeTransaction;
    const controller = this.controllerStates.get(this.actorCode);
    if (
      !transaction
      || transaction.playbackRevision === null
      || !Number.isFinite(controller?.parameterDc)
    ) {
      return undefined;
    }
    const phase = this.getAnimation()?.nativeMotionPhase?.(
      transaction.playbackRevision,
    );
    if (
      !phase
      || !Number.isFinite(phase.phase)
      || !Number.isInteger(phase.request)
      || (phase.request & 0xffff) !== controller.requestWord66
    ) {
      return undefined;
    }
    return {
      floatWordF0: float32Word(phase.phase),
      floatWordDc: float32Word(controller.parameterDc),
    };
  }

  readMomtScaledOffsetWords({ actorCode = this.actorCode } = {}) {
    if (requireActorCode(actorCode) !== this.actorCode) return undefined;
    const transaction = this.activeTransaction;
    if (!transaction || transaction.playbackRevision === null) {
      return undefined;
    }
    const vector = this.getAnimation()?.nativeMotionControllerVector?.(
      transaction.playbackRevision,
    );
    if (
      !Array.isArray(vector)
      || vector.length !== 3
      || vector.some(value => !Number.isFinite(value))
    ) {
      return undefined;
    }
    return {
      scaleVectorWords: vector.map(float32Word),
    };
  }

  readControllerStatus({ actorCode, selector }) {
    if (requireActorCode(actorCode) !== this.actorCode) return undefined;
    if (!this.activeTransaction) return undefined;
    // The browser player owns one live actor task while a scripted-motion
    // transaction is active. This is the exact selector-one availability
    // represented by the native adapter; selector zero remains unavailable
    // until its signed controller byte has an authoritative browser owner.
    return selector === 1 ? 1 : undefined;
  }

  writeControllerFlagBit3({ actorCode, enabled }) {
    this.requireTransaction();
    if (requireActorCode(actorCode) !== this.actorCode) return false;
    if (typeof enabled !== "boolean") return false;
    const previous = this.controllerStates.get(this.actorCode) || {};
    const flags = previous.controllerFlagsDword5c ?? 0;
    this.controllerStates.set(this.actorCode, {
      ...previous,
      controllerFlagsDword5c: enabled
        ? (flags | 0x00000008) >>> 0
        : (flags & ~0x00000008) >>> 0,
    });
    return true;
  }

  releaseForControllerTransfer() {
    const transaction = this.requireTransaction();
    if (transaction.playbackRevision === null) return true;
    this.releaseOwnedMotion(transaction);
    transaction.playbackRevision = null;
    transaction.requestToken = null;
    return true;
  }

  commitTransaction(token) {
    const transaction = this.requireTransaction(token);
    this.releaseOwnedMotion(transaction);
    this.activeTransaction = null;
    return true;
  }

  rollbackTransaction(token) {
    const transaction = this.requireTransaction(token);
    this.releaseOwnedMotion(transaction);
    this.statuses = cloneStatuses(transaction.statusSnapshot);
    this.controllerStates = cloneControllerStates(
      transaction.controllerSnapshot,
    );
    this.activeTransaction = null;
    return true;
  }

  releaseOwnedMotion(transaction) {
    if (transaction.playbackRevision === null) return false;
    const animation = this.getAnimation();
    if (
      animation?.activeOneShot?.playbackRevision
      !== transaction.playbackRevision
    ) {
      throw new Error(
        "native scripted motion ownership changed before transaction end",
      );
    }
    if (animation.releaseOneShot("idle") !== true) {
      throw new Error("native scripted motion could not return to idle");
    }
    return true;
  }

  requireTransaction(token = this.activeTransaction?.token) {
    const active = this.activeTransaction;
    if (!active || active.token !== token) {
      throw new Error(
        "native player scripted motion transaction is not active",
      );
    }
    return active;
  }
}

export function createNativePlayerScriptedMotionRuntime(options) {
  return new NativePlayerScriptedMotionRuntime(options);
}
