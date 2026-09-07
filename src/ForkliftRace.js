export const FORKLIFT_RACE_LAPS = 3;

// Browser-space centerline recovered from the native Disc 3 race by sampling
// the four AI forklift TASK positions at 10 Hz for all three laps. These
// ordered gates follow the authored course while allowing normal racing lines.
export const FORKLIFT_RACE_CHECKPOINTS = Object.freeze([
  Object.freeze({ x: 96, z: 107, radius: 14 }),
  Object.freeze({ x: 114, z: 82, radius: 14 }),
  Object.freeze({ x: 95, z: 50, radius: 14 }),
  Object.freeze({ x: 62, z: 50, radius: 14 }),
  Object.freeze({ x: 30, z: 65, radius: 14 }),
  Object.freeze({ x: -8, z: 80, radius: 14 }),
  Object.freeze({ x: -43, z: 96, radius: 14 }),
  Object.freeze({ x: -48, z: 130, radius: 14 }),
  Object.freeze({ x: -18, z: 158, radius: 14 }),
  Object.freeze({ x: 2, z: 140, radius: 13 }),
  Object.freeze({ x: 8, z: 112, radius: 13 }),
  Object.freeze({ x: 35, z: 105, radius: 13 }),
  Object.freeze({ x: 63, z: 106, radius: 12 }),
]);

const STORAGE_KEY = "new-yokosuka.forklift-race.best-ms.v1";

export function formatRaceTime(milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return "--:--.---";
  const minutes = Math.floor(milliseconds / 60_000);
  const seconds = Math.floor(milliseconds / 1000) % 60;
  const millis = Math.floor(milliseconds) % 1000;
  return `${String(minutes).padStart(2, "0")}:${
    String(seconds).padStart(2, "0")
  }.${String(millis).padStart(3, "0")}`;
}

export function readForkliftRaceBest(storage = globalThis.localStorage) {
  try {
    const value = Number(storage?.getItem(STORAGE_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function saveForkliftRaceBest(
  milliseconds,
  storage = globalThis.localStorage,
) {
  const previous = readForkliftRaceBest(storage);
  if (previous !== null && previous <= milliseconds) return previous;
  try {
    storage?.setItem(STORAGE_KEY, String(Math.floor(milliseconds)));
  } catch {
    // A completed race remains valid when browser storage is unavailable.
  }
  return Math.floor(milliseconds);
}

export class ForkliftRaceSession {
  constructor({
    checkpoints = FORKLIFT_RACE_CHECKPOINTS,
    laps = FORKLIFT_RACE_LAPS,
    countdownSeconds = 3,
  } = {}) {
    this.checkpoints = checkpoints;
    this.laps = laps;
    this.countdownSeconds = countdownSeconds;
    this.reset();
  }

  reset() {
    this.status = "inactive";
    this.countdownRemaining = this.countdownSeconds;
    this.elapsedMs = 0;
    this.lap = 1;
    this.checkpoint = 0;
    this.justAdvanced = false;
    this.justFinished = false;
  }

  start() {
    this.reset();
    this.status = "countdown";
  }

  abort() {
    this.reset();
  }

  update(position, deltaSeconds) {
    this.justAdvanced = false;
    this.justFinished = false;
    if (this.status === "countdown") {
      this.countdownRemaining -= Math.max(0, deltaSeconds);
      if (this.countdownRemaining <= 0) {
        this.countdownRemaining = 0;
        this.status = "racing";
      }
      return this;
    }
    if (this.status !== "racing") return this;
    this.elapsedMs += Math.max(0, deltaSeconds) * 1000;
    if (
      !position
      || !Number.isFinite(position.x)
      || !Number.isFinite(position.z)
    ) {
      return this;
    }
    const gate = this.checkpoints[this.checkpoint];
    if (Math.hypot(position.x - gate.x, position.z - gate.z) > gate.radius) {
      return this;
    }
    this.justAdvanced = true;
    this.checkpoint++;
    if (this.checkpoint < this.checkpoints.length) return this;
    this.checkpoint = 0;
    if (this.lap < this.laps) {
      this.lap++;
      return this;
    }
    this.status = "finished";
    this.justFinished = true;
    return this;
  }

  get nextCheckpoint() {
    return this.checkpoints[this.checkpoint] || null;
  }
}
