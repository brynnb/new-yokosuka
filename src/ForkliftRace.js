import course from "./data/forklift-race-course.json" with { type: "json" };

// One source for exploration presentation and authoritative Story observations.
export const FORKLIFT_RACE_LAPS = course.laps;
export const FORKLIFT_RACE_CHECKPOINTS = Object.freeze(course.checkpoints.map(gate=>Object.freeze({...gate})));

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
