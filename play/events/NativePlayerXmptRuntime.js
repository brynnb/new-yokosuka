const FULL_TURN_RAW = 0x10000;
const FULL_TURN_RADIANS = Math.PI * 2;

function requireTransform(value) {
  if (
    !value
    || !Array.isArray(value.position)
    || value.position.length !== 3
    || value.position.some(component => !Number.isFinite(component))
    || !Number.isInteger(value.facingRaw)
  ) {
    throw new TypeError("native player XMPT transform is unavailable");
  }
  return {
    position: value.position.map(component => Math.fround(component)),
    facingRaw: value.facingRaw & 0xffff,
  };
}

function requireTarget(value) {
  return requireTransform({
    position: value,
    facingRaw: 0,
  }).position;
}

function nativeBearingRaw(source, target) {
  const deltaX = target[0] - source[0];
  const deltaZ = target[2] - source[2];
  if (deltaX === 0 && deltaZ === 0) return null;
  const turns = Math.atan2(deltaX, deltaZ) / FULL_TURN_RADIANS;
  const raw = Math.trunc(turns * FULL_TURN_RAW);
  return ((raw % FULL_TURN_RAW) + FULL_TURN_RAW) % FULL_TURN_RAW;
}

function signedRawAngleDifference(target, source) {
  const difference = ((target - source) & 0xffff);
  return difference >= 0x8000 ? difference - 0x10000 : difference;
}

function interpolateRoute(start, target, amount) {
  return start.map((value, index) => (
    Math.fround(value + (target[index] - value) * amount)
  ));
}

function selectorZeroApproachTarget(start, target) {
  const deltaX = target[0] - start[0];
  const deltaZ = target[2] - start[2];
  const distance = Math.hypot(deltaX, deltaZ);
  // The recovered state-three far path is selected at 0.7 native units and
  // constructs an endpoint exactly 0.2 units before the supplied target.
  // The shorter selector-zero branches remain fail-closed.
  if (!(distance >= 0.7)) return null;
  const scale = (distance - 0.2) / distance;
  return [
    Math.fround(start[0] + deltaX * scale),
    Math.fround(target[1]),
    Math.fround(start[2] + deltaZ * scale),
  ];
}

export class NativePlayerXmptRuntime {
  constructor({
    getAnimation,
    readNativeTransform,
    writeNativeTransform,
    transferMotionOwnership = () => true,
    actorCode = "AKIR",
  } = {}) {
    if (
      typeof getAnimation !== "function"
      || typeof readNativeTransform !== "function"
      || typeof writeNativeTransform !== "function"
      || typeof transferMotionOwnership !== "function"
    ) {
      throw new TypeError("native player XMPT adapters are incomplete");
    }
    this.getAnimation = getAnimation;
    this.readNativeTransform = readNativeTransform;
    this.writeNativeTransform = writeNativeTransform;
    this.transferMotionOwnership = transferMotionOwnership;
    this.actorCode = String(actorCode || "").toUpperCase();
    this.activeTransaction = null;
    this.motion = null;
  }

  beginTransaction() {
    if (this.activeTransaction) {
      throw new Error("native player XMPT transaction is already active");
    }
    const transaction = {
      token: Symbol("native-player-xmpt"),
      transform: requireTransform(this.readNativeTransform()),
    };
    this.activeTransaction = transaction;
    return transaction.token;
  }

  currentTransform() {
    return requireTransform(this.readNativeTransform());
  }

  controller() {
    return {
      startMotion: detail => this.startMotion(detail),
      readMotionRequestWord: detail => this.readMotionRequestWord(detail),
      commitTarget: detail => this.commitTarget(detail),
      convergeFacing: detail => this.convergeFacing(detail),
      release: () => this.release(),
    };
  }

  startMotion({
    actorTag,
    phase,
    target,
    facing,
    request,
  }) {
    this.requireTransaction();
    if (actorTag !== this.actorCode || this.motion) return false;
    const animation = this.getAnimation();
    const descriptor = animation?.nativeMotionDescriptor?.(request);
    if (!descriptor) {
      return false;
    }
    const routeMode = descriptor.rootMotionKind === "travel"
      ? "authored-travel"
      : "controller-placement";
    if (
      routeMode === "authored-travel"
      && (!Number.isFinite(descriptor.speed) || descriptor.speed <= 0)
    ) return false;
    if (
      routeMode === "controller-placement"
      && (
        !Number.isInteger(descriptor.gameTicksPerCycle)
        || descriptor.gameTicksPerCycle <= 0
      )
    ) return false;
    if (this.transferMotionOwnership() !== true) return false;
    if (animation.activeOneShot) return false;

    const start = requireTransform(this.readNativeTransform());
    const requestedTarget = requireTarget(target);
    const destination = phase === "approach"
      ? selectorZeroApproachTarget(start.position, requestedTarget)
      : requestedTarget;
    if (!destination) return false;
    const facingRaw = facing?.kind === "native-raw"
      ? facing.value & 0xffff
      : nativeBearingRaw(start.position, destination);
    const initialPosition = routeMode === "controller-placement"
      ? destination
      : start.position;
    if (facingRaw !== null || routeMode === "controller-placement") {
      if (this.writeNativeTransform({
        position: initialPosition,
        facingRaw: facingRaw ?? start.facingRaw,
      }) !== true) {
        return false;
      }
    }
    const completionToken = Symbol("native-player-xmpt-motion");
    const accepted = animation.playNativeMotionRequest(request, {
      loop: routeMode === "authored-travel",
      // State three writes its prepared endpoint through the native actor
      // transform setter before installing actor +0x66. A travel clip owns
      // the visible route into that endpoint; a pose clip uses the controller
      // placement directly and completes on its authored motion boundary.
      applyRootMotion: false,
      context: {
        kind: "native-xmpt-motion",
        actorCode: this.actorCode,
        phase,
        request,
      },
      onComplete: routeMode === "controller-placement"
        ? () => this.completeControllerPlacement(completionToken)
        : null,
    });
    if (accepted !== true) return false;
    const playbackRevision =
      animation.activeOneShot?.playbackRevision ?? null;
    if (playbackRevision === null) {
      throw new Error("native XMPT motion has no playback revision");
    }
    const distance = Math.hypot(
      destination[0] - start.position[0],
      destination[2] - start.position[2],
    );
    this.motion = {
      phase,
      request,
      completionToken,
      routeMode,
      playbackRevision,
      start: start.position,
      target: destination,
      facingRaw: facingRaw ?? start.facingRaw,
      speed: routeMode === "authored-travel" ? descriptor.speed : 0,
      distance,
      progress: 0,
      complete: false,
    };
    return true;
  }

  update(deltaSeconds) {
    this.requireTransaction();
    if (!this.motion || this.motion.complete) return false;
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
      throw new RangeError("native XMPT delta must be non-negative");
    }
    const motion = this.motion;
    if (motion.routeMode === "controller-placement") return false;
    motion.progress = Math.min(
      motion.distance,
      motion.progress + motion.speed * deltaSeconds,
    );
    const amount = motion.distance === 0
      ? 1
      : motion.progress / motion.distance;
    const position = interpolateRoute(
      motion.start,
      motion.target,
      amount,
    );
    if (this.writeNativeTransform({
      position,
      facingRaw: motion.facingRaw,
    }) !== true) {
      throw new Error("native XMPT transform update was rejected");
    }
    if (amount < 1) return true;
    this.finishMotion();
    return true;
  }

  completeControllerPlacement(completionToken) {
    const motion = this.motion;
    if (
      !motion
      || motion.routeMode !== "controller-placement"
      || motion.completionToken !== completionToken
    ) return false;
    motion.complete = true;
    return true;
  }

  readMotionRequestWord({ actorTag, phase }) {
    if (actorTag !== this.actorCode) return undefined;
    if (!this.motion || this.motion.phase !== phase) return 0;
    return this.motion.complete ? 0 : this.motion.request;
  }

  commitTarget({ actorTag, phase, target, facingRaw }) {
    if (
      actorTag !== this.actorCode
      || !this.motion
      || this.motion.phase !== phase
      || !this.motion.complete
    ) {
      return false;
    }
    const current = requireTransform(this.readNativeTransform());
    const position = target === undefined
      ? this.motion.target
      : requireTarget(target);
    const nextFacing = Number.isInteger(facingRaw)
      ? facingRaw & 0xffff
      : current.facingRaw;
    const committed = this.writeNativeTransform({
      position,
      facingRaw: nextFacing,
    }) === true;
    if (committed) this.motion = null;
    return committed;
  }

  convergeFacing({ actorTag, target, maximumStepRaw }) {
    if (actorTag !== this.actorCode) return false;
    const current = requireTransform(this.readNativeTransform());
    const destination = requireTarget(target);
    const deltaX = destination[0] - current.position[0];
    const deltaZ = destination[2] - current.position[2];
    const distance = Math.hypot(deltaX, deltaZ);
    if (distance > 0.3) return false;
    const facingRaw = nativeBearingRaw(current.position, destination);
    if (facingRaw === null || facingRaw === current.facingRaw) return true;
    if (!Number.isInteger(maximumStepRaw) || maximumStepRaw <= 0) {
      return false;
    }
    const difference = signedRawAngleDifference(
      facingRaw,
      current.facingRaw,
    );
    const complete = Math.abs(difference) <= maximumStepRaw;
    const nextFacing = complete
      ? facingRaw
      : (current.facingRaw + Math.sign(difference) * maximumStepRaw) & 0xffff;
    return this.writeNativeTransform({
      position: current.position,
      facingRaw: nextFacing,
    }) === true && complete;
  }

  finishMotion() {
    const motion = this.motion;
    if (!motion || motion.complete) return false;
    const animation = this.getAnimation();
    if (
      animation?.activeOneShot?.playbackRevision
      !== motion.playbackRevision
    ) {
      throw new Error("native XMPT motion ownership changed");
    }
    if (animation.releaseOneShot("idle") !== true) {
      throw new Error("native XMPT motion could not return to idle");
    }
    motion.complete = true;
    return true;
  }

  release() {
    if (!this.motion) return false;
    if (!this.motion.complete) this.finishMotion();
    this.motion = null;
    return true;
  }

  commitTransaction(token) {
    this.requireTransaction(token);
    this.release();
    this.activeTransaction = null;
    return true;
  }

  rollbackTransaction(token) {
    const transaction = this.requireTransaction(token);
    this.release();
    if (this.writeNativeTransform(transaction.transform) !== true) {
      throw new Error("native XMPT rollback transform was rejected");
    }
    this.activeTransaction = null;
    return true;
  }

  requireTransaction(token = this.activeTransaction?.token) {
    if (
      !this.activeTransaction
      || this.activeTransaction.token !== token
    ) {
      throw new Error("native player XMPT transaction is not active");
    }
    return this.activeTransaction;
  }
}

export function createNativePlayerXmptRuntime(options) {
  return new NativePlayerXmptRuntime(options);
}
