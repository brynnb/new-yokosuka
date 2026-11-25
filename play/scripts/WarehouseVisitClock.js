export function warehouseInvestigationActive(character) {
  const flags = character?.storyFlags;
  return character?.playMode === "story" && character.openingCompleted === true
    && Boolean(flags?.["story.s1.warehouse-eight-window.completed"] || flags?.["story.s1.goro-guard-distraction.completed"])
    && !flags["story.s1.warehouse-eight-overheard.completed"];
}

// 1ST_READ 0x0c1658d0 (op 0x01ae) gates the entire MS8S dispatch pass.
// The browser room director supplies the current-event context itself. The
// native interpreter's transient currentEventPresent bit describes its own VM.
export function warehouseDirectorAvailable(sceneState, activityEnabled) {
  const primary = sceneState.readPrimaryRuntimeState();
  if (!activityEnabled || !primary?.available || primary.stateDword1f8 !== 1
    || (primary.gateByte !== 0 && primary.gateByte !== 1)) return false;
  const read = (offset, width = 4) => sceneState.readNativeField({offset, width});
  // Global controller 0x0c173f44 selectors 6 and 3; the native manager may
  // not have been initialized at all in the browser's current room.
  if (read(0x0c224848) || read(0x0c224c9c, 1) || read(0x0c220810)) return false;
  const secondary = read(0x0c29b134);
  if (secondary !== undefined && ((secondary | 0) >= 0 || read(0x0c29b130) !== undefined)) {
    return sceneState.queryGlobalControllerStatus() < 0;
  }
  return true;
}

// MS8S MAPINFO.BIN, 0x28ff4/0x28ffe. One clock comes from engine slot 0,
// the other is a room coroutine yielding one native frame at 0x25bac.
export class WarehouseVisitClock {
  constructor() {
    this.remainingTicks = 14400;
    this.deadlineTicks = 28800;
    this.fraction = 0;
    this.lightingSeen = false;
    this.completedInspections = new Set();
    this.attempted = null;
    this.previousInput = false;
  }

  update(seconds, input, freeConversation, occupied = false) {
    // Paused frames never accumulate as catch-up time.
    if (Number.isFinite(seconds) && seconds > 0) {
      this.fraction += seconds * 30;
      const ticks = Math.floor(this.fraction + 1e-8);
      this.fraction = Math.max(0, this.fraction - ticks);
      this.deadlineTicks = Math.max(-1, this.deadlineTicks - ticks);
      if ((!occupied && input) || freeConversation) this.remainingTicks = Math.max(-1, this.remainingTicks - ticks);
    }
    // When a Story player cancels a timed presentation, a newly pressed
    // exploration control deliberately retries it. A held key cannot loop it.
    if (!occupied) {
      if (input && !this.previousInput) this.attempted = null;
      this.previousInput = input;
    }
  }

  selector(y) {
    if (this.attempted) return null;
    if (!this.lightingSeen && this.remainingTicks < 0) {
      return Math.fround(y) > 4 ? "MS8S.office-timeout" : "MS8S.light-timeout";
    }
    if (this.deadlineTicks < 0) return "MS8S.office-deadline";
    return null;
  }
}
