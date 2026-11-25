// MS8S MAPINFO.BIN, 0x28ff4/0x28ffe. One clock comes from engine slot 0,
// the other is a room coroutine yielding one native frame at 0x25bac.
export class WarehouseVisitClock {
  constructor() {
    this.remainingTicks = 14400;
    this.deadlineTicks = 28800;
    this.fraction = 0;
    this.lightingSeen = false;
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
