const REQUIRED_CHANNELS = Object.freeze([
  "positionX",
  "positionY",
  "positionZ",
  "targetX",
  "targetY",
  "targetZ",
]);

const OPTIONAL_CHANNELS = Object.freeze([
  "roll",
  "perspective",
]);

const f32 = Math.fround;

function fadd(left, right) {
  return f32(f32(left) + f32(right));
}

function fsub(left, right) {
  return f32(f32(left) - f32(right));
}

function fmul(left, right) {
  return f32(f32(left) * f32(right));
}

function fdiv(left, right) {
  return f32(f32(left) / f32(right));
}

function finiteArray(value, count) {
  return (
    Array.isArray(value)
    && value.length === count
    && value.every(Number.isFinite)
  );
}

function validateCurve(curve, { optional = false } = {}) {
  const count = curve?.count;
  if (!Number.isSafeInteger(count) || count < 0 || count > 64) {
    return false;
  }
  if (count === 0) return optional;
  if (
    !finiteArray(curve.times, count)
    || !finiteArray(curve.values, count)
    || !finiteArray(curve.slopes, count)
  ) {
    return false;
  }
  if (
    count > 1
    && curve.times.some((time, index) => (
      index > 0 && !(time > curve.times[index - 1])
    ))
  ) {
    return false;
  }
  return true;
}

function validateRecord(record) {
  if (!Number.isSafeInteger(record?.cameraNumber) || !record?.curves) {
    return false;
  }
  return (
    REQUIRED_CHANNELS.every(name => validateCurve(record.curves[name]))
    && OPTIONAL_CHANNELS.every(name => (
      validateCurve(record.curves[name], { optional: true })
    ))
  );
}

function evaluateCurve(curve, time) {
  if (curve.count === 0) return null;
  const sampleTime = f32(time);
  if (curve.count === 1 || sampleTime <= f32(curve.times[0])) {
    return f32(curve.values[0]);
  }
  const lastIndex = curve.count - 1;
  if (sampleTime >= f32(curve.times[lastIndex])) {
    return f32(curve.values[lastIndex]);
  }

  const endIndex = curve.times.findIndex(
    (value, index) => index > 0 && sampleTime < f32(value),
  );
  const startIndex = endIndex - 1;
  const startTime = f32(curve.times[startIndex]);
  const endTime = f32(curve.times[endIndex]);
  const duration = fsub(endTime, startTime);
  const afterStart = fsub(sampleTime, startTime);
  const beforeEnd = fsub(endTime, sampleTime);
  const afterStartSquared = fmul(afterStart, afterStart);
  const beforeEndSquared = fmul(beforeEnd, beforeEnd);
  const startValue = f32(curve.values[startIndex]);
  const endValue = f32(curve.values[endIndex]);
  const startCoefficient = fadd(
    fmul(3, startValue),
    fmul(duration, f32(curve.slopes[startIndex])),
  );
  const endCoefficient = fsub(
    fmul(3, endValue),
    fmul(duration, f32(curve.slopes[endIndex])),
  );
  let numerator = fadd(
    fmul(startValue, fmul(beforeEndSquared, beforeEnd)),
    fmul(endValue, fmul(afterStartSquared, afterStart)),
  );
  numerator = fadd(
    numerator,
    fmul(startCoefficient, fmul(beforeEndSquared, afterStart)),
  );
  numerator = fadd(
    numerator,
    fmul(endCoefficient, fmul(afterStartSquared, beforeEnd)),
  );
  return fdiv(numerator, fmul(fmul(duration, duration), duration));
}

function durationFor(record) {
  return Math.max(
    0,
    ...Object.values(record.curves).map(curve => (
      curve.count > 0 ? curve.times.at(-1) : 0
    )),
  );
}

function frameFor(record, time) {
  const value = name => evaluateCurve(record.curves[name], time);
  return {
    cameraNumber: record.cameraNumber,
    time,
    duration: durationFor(record),
    position: REQUIRED_CHANNELS.slice(0, 3).map(value),
    target: REQUIRED_CHANNELS.slice(3).map(value),
    roll: value("roll"),
    perspective: value("perspective"),
  };
}

export function nativeEventCameraBrowserFrame(frame) {
  if (
    !frame
    || !finiteArray(frame.position, 3)
    || !finiteArray(frame.target, 3)
    || (frame.roll !== null && !Number.isFinite(frame.roll))
    || (
      frame.perspective !== null
      && (
        !Number.isFinite(frame.perspective)
        || frame.perspective <= 0
      )
    )
  ) {
    return null;
  }
  return {
    position: [-frame.position[0], frame.position[1], frame.position[2]],
    target: [-frame.target[0], frame.target[1], frame.target[2]],
    // Native room/world coordinates are reflected across X in /play.
    // That reflection reverses rotation handedness around the view axis.
    rollRadians: -(frame.roll ?? 0) * Math.PI / 180,
    perspectiveRadians: (
      frame.perspective === null
        ? null
        : frame.perspective * Math.PI / 180
    ),
  };
}

function recordsForArea(programPack, area) {
  const matches = (programPack?.programs || []).filter(program => (
    program.area === area
  ));
  const records = new Map();
  for (const program of matches) {
    const definitions = program.eventCameras?.records;
    if (!Array.isArray(definitions)) continue;
    for (const record of definitions) {
      const existing = records.get(record.cameraNumber);
      if (existing && JSON.stringify(existing) !== JSON.stringify(record)) {
        return null;
      }
      records.set(record.cameraNumber, record);
    }
  }
  return records.size > 0 ? records : null;
}

function indexedRecordsForArea(programIndex, area) {
  const definitions = programIndex?.eventCamerasByArea?.[area];
  if (!Array.isArray(definitions) || definitions.length === 0) return null;
  const records = new Map();
  for (const record of definitions) {
    if (records.has(record.cameraNumber)) return null;
    records.set(record.cameraNumber, record);
  }
  return records;
}

export function nativeProgramUsesEventCamera(program) {
  return (program?.functions || []).some(fn => (
    (fn.blocks || []).some(block => (
      (block.actions || []).some(action => (
        action?.semanticId === "event-camera-request"
        || action?.semanticId === "event-camera-mode-select"
      ))
    ))
  ));
}

export class NativeEventCameraRuntime {
  constructor({
    programIndex = null,
    programPack = null,
    applyNativeFrame,
    releaseNativeFrame,
  } = {}) {
    const hasIndex = (
      programIndex?.schema === "new-yokosuka-native-event-program-index-v1"
    );
    const hasPack = (
      programPack?.schema === "new-yokosuka-native-event-program-pack-v1"
    );
    if (!hasIndex && !hasPack) {
      throw new TypeError("native event camera requires a program index");
    }
    if (
      typeof applyNativeFrame !== "function"
      || typeof releaseNativeFrame !== "function"
    ) {
      throw new TypeError(
        "native event camera requires frame apply and release adapters",
      );
    }
    this.programIndex = hasIndex ? programIndex : null;
    this.programPack = hasPack ? programPack : null;
    this.applyNativeFrame = applyNativeFrame;
    this.releaseNativeFrame = releaseNativeFrame;
    this.activeTransaction = null;
    this.activeRequest = null;
    this.mode = 0;
    this.committedToken = null;
  }

  beginTransaction({ area } = {}) {
    if (this.activeTransaction) {
      throw new Error("native event camera transaction is already active");
    }
    const records = this.programIndex
      ? indexedRecordsForArea(this.programIndex, area)
      : recordsForArea(this.programPack, area);
    if (!records) {
      throw new Error(`native event camera records are unavailable for ${area}`);
    }
    const token = Symbol("native-event-camera");
    this.activeTransaction = { token, area, records };
    this.committedToken = null;
    return token;
  }

  requestCamera({
    cameraNumber,
    actorReferences,
    mode,
    source = null,
  }) {
    const transaction = this.requireTransaction();
    if (
      mode !== 6
      || !Array.isArray(actorReferences)
      || actorReferences.length !== 2
      || actorReferences.some(value => value !== null)
    ) {
      return false;
    }
    const record = transaction.records.get(cameraNumber);
    if (!validateRecord(record)) return false;
    const request = {
      record,
      time: 0,
      duration: durationFor(record),
      source: source ? { ...source } : null,
    };
    const frame = frameFor(record, 0);
    if (this.applyNativeFrame(frame) !== true) return false;
    this.activeRequest = request;
    this.mode = 6;
    return true;
  }

  selectMode({ mode }) {
    this.requireTransaction();
    if (
      !Number.isInteger(mode)
      || mode < -0x80000000
      || mode > 0xffffffff
    ) {
      return false;
    }
    if (this.activeRequest && this.releaseNativeFrame() !== true) return false;
    this.activeRequest = null;
    this.mode = mode | 0;
    return true;
  }

  update(deltaSeconds = 0) {
    this.requireTransaction();
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
      throw new RangeError(
        "native event camera delta must be a finite non-negative number",
      );
    }
    const request = this.activeRequest;
    if (this.mode !== 6 || !request) return false;
    request.time = f32(Math.min(
      request.duration,
      fadd(request.time, deltaSeconds),
    ));
    if (this.applyNativeFrame(frameFor(request.record, request.time)) !== true) {
      throw new Error("native event camera frame adapter rejected playback");
    }
    return true;
  }

  readFrame() {
    const request = this.activeRequest;
    return request ? frameFor(request.record, request.time) : null;
  }

  commitTransaction(token) {
    this.requireTransaction(token);
    if (this.mode !== 0 || this.activeRequest) {
      throw new Error(
        "native event camera transaction ended before authored mode cleanup",
      );
    }
    this.activeTransaction = null;
    this.committedToken = token;
    return true;
  }

  rollbackTransaction(token) {
    if (!this.activeTransaction && this.committedToken === token) {
      this.committedToken = null;
      return true;
    }
    this.requireTransaction(token);
    try {
      if (this.mode === 6 && this.releaseNativeFrame() !== true) {
        throw new Error("native event camera rollback release was rejected");
      }
    } finally {
      this.activeRequest = null;
      this.mode = 0;
      this.activeTransaction = null;
      this.committedToken = null;
    }
    return true;
  }

  requireTransaction(token = this.activeTransaction?.token) {
    const active = this.activeTransaction;
    if (!active || active.token !== token) {
      throw new Error("native event camera transaction is not active");
    }
    return active;
  }
}

export function createNativeEventCameraRuntime(options) {
  return new NativeEventCameraRuntime(options);
}

export const nativeEventCameraCurve = Object.freeze({
  evaluate: evaluateCurve,
  validate: validateCurve,
});
