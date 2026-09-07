export function isPersistentPlayerWorld(world) {
  return Boolean(world && world.cutsceneOnly !== true);
}

export class PlayerPersistence {
  constructor({
    storage = globalThis.localStorage,
    legacyLocationKey = "new-yokosuka.play.location.v1",
    runToggleKey = "new-yokosuka.play.run-toggle.v1",
    debugRunSpeedKey = "new-yokosuka.play.debug-run-speed.v1",
    debugNpcWalkSpeedKey = "new-yokosuka.play.debug-npc-walk-speed.v1",
    forkliftTuningKey = "new-yokosuka.play.debug-forklift-physics.v1",
  } = {}) {
    this.storage = storage;
    this.runToggleKey = runToggleKey;
    this.debugRunSpeedKey = debugRunSpeedKey;
    this.debugNpcWalkSpeedKey = debugNpcWalkSpeedKey;
    this.forkliftTuningKey = forkliftTuningKey;
    this.lastRunToggle = null;
    try {
      this.storage.removeItem?.(legacyLocationKey);
    } catch {
      // Storage can be unavailable in restricted browser contexts.
    }
  }

  readRunToggle() {
    try {
      return this.storage.getItem(this.runToggleKey) === "1";
    } catch {
      return false;
    }
  }

  saveRunToggle(runToggled) {
    const enabled = runToggled === true;
    if (enabled === this.lastRunToggle) return false;
    try {
      this.storage.setItem(this.runToggleKey, enabled ? "1" : "0");
      this.lastRunToggle = enabled;
      return true;
    } catch {
      return false;
    }
  }

  readDebugRunSpeed() {
    try {
      const value = Number(this.storage.getItem(this.debugRunSpeedKey));
      return Number.isFinite(value) && value >= 1 && value <= 10
        ? value
        : 1;
    } catch {
      return 1;
    }
  }

  saveDebugRunSpeed(multiplier) {
    if (
      !Number.isFinite(multiplier)
      || multiplier < 1
      || multiplier > 10
    ) {
      return false;
    }
    try {
      this.storage.setItem(this.debugRunSpeedKey, String(multiplier));
      return true;
    } catch {
      return false;
    }
  }

  readDebugNpcWalkSpeed() {
    try {
      const value = Number(this.storage.getItem(this.debugNpcWalkSpeedKey));
      if (!Number.isFinite(value) || value < 0.5 || value > 2) return 1;
      if (Math.abs(value - 1) <= 0.011) {
        this.storage.setItem(this.debugNpcWalkSpeedKey, "1");
        return 1;
      }
      return value;
    } catch {
      return 1;
    }
  }

  saveDebugNpcWalkSpeed(multiplier) {
    if (
      !Number.isFinite(multiplier)
      || multiplier < 0.5
      || multiplier > 2
    ) {
      return false;
    }
    try {
      this.storage.setItem(this.debugNpcWalkSpeedKey, String(multiplier));
      return true;
    } catch {
      return false;
    }
  }

  readForkliftTuning(defaults) {
    const fallback = { ...defaults };
    try {
      const saved = JSON.parse(this.storage.getItem(this.forkliftTuningKey));
      const bounded = (value, minimum, maximum, defaultValue) => (
        Number.isFinite(value) && value >= minimum && value <= maximum
          ? value
          : defaultValue
      );
      return {
        centerOfMassHeight: bounded(
          saved?.centerOfMassHeight, 0.05, 1.15, fallback.centerOfMassHeight,
        ),
        springRate: bounded(
          saved?.springRate, 50, 250, fallback.springRate,
        ),
        shockDamping: bounded(
          saved?.shockDamping, 25, 250, fallback.shockDamping,
        ),
        loadInfluence: bounded(
          saved?.loadInfluence, 0, 200, fallback.loadInfluence,
        ),
        tireGrip: bounded(saved?.tireGrip, 0, 200, fallback.tireGrip),
        brakeForce: bounded(
          saved?.brakeForce, 25, 200, fallback.brakeForce,
        ),
        driveForce: bounded(
          saved?.driveForce, 25, 200, fallback.driveForce,
        ),
        steeringResponse: bounded(
          saved?.steeringResponse, 25, 200, fallback.steeringResponse,
        ),
        highSpeedSteering: bounded(
          saved?.highSpeedSteering, 0, 100, fallback.highSpeedSteering,
        ),
        rollStiffness: bounded(
          saved?.rollStiffness, 0, 200, fallback.rollStiffness,
        ),
      };
    } catch {
      return fallback;
    }
  }

  saveForkliftTuning(values) {
    try {
      this.storage.setItem(this.forkliftTuningKey, JSON.stringify(values));
      return true;
    } catch {
      return false;
    }
  }

}
