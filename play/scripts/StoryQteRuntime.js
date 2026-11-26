// Owns reaction timing, not persistence. The server only acknowledges an attempt
// and its final result; network latency must never shorten a visible prompt.
export class StoryQteRuntime {
  constructor({ now = () => performance.now(), schedule = (callback, ms) => setTimeout(callback, ms), cancel = timer => clearTimeout(timer),
    present, sound = () => {}, finish }) {
    Object.assign(this, { now, schedule, cancel, present, sound, finish });
    this.active = null;
  }

  start(definition) {
    this.stop();
    const steps = definition.steps || definition.buttons?.map(button => ({ buttons: [button], windowMs: definition.windowMs }));
    if (!steps?.length || steps.some(s => !s.buttons?.length || new Set(s.buttons).size !== s.buttons.length
      || !s.buttons.every(b => typeof b === "string") || !Number.isFinite(s.windowMs) || s.windowMs <= 0)) {
      throw new Error(`Invalid QTE steps: ${definition.id}`);
    }
    const scoring=definition.scoring;
    if(scoring && (!Number.isSafeInteger(scoring.successAt) || !Number.isSafeInteger(scoring.partialAt)
      || scoring.partialAt < 1 || scoring.successAt <= scoring.partialAt || scoring.successAt > steps.length)) {
      throw new Error(`Invalid QTE scoring: ${definition.id}`);
    }
    this.active = { steps, scoring, ignoreWrongButtons: definition.ignoreWrongButtons === true, hits: 0, index: 0, held: new Set(), outcome: null };
    this.next();
  }

  next() {
    const owner = this.active, step = owner.steps[owner.index];
    this.cancel(this.timer);
    owner.held.clear();
    owner.deadline = this.now() + step.windowMs;
    this.present({ index: owner.index, count: owner.steps.length, buttons: step.buttons, windowMs: step.windowMs });
    this.sound("prompt");
    this.timer = this.schedule(() => {
      if (this.active === owner && !owner.outcome) this.miss();
    }, step.windowMs);
  }

  press(button) {
    const owner = this.active;
    if (!owner || owner.outcome) return false;
    if (this.now() >= owner.deadline) { this.miss(); return false; }
    const step = owner.steps[owner.index];
    if (!step.buttons.includes(button)) {
      if (!owner.ignoreWrongButtons) this.miss();
      return false;
    }
    owner.held.add(button);
    if (!step.buttons.every(b => owner.held.has(b))) return true;
    this.sound("correct");
    owner.hits++;
    this.advance();
    return true;
  }

  miss() {
    const owner=this.active;
    if(!owner || owner.outcome)return;
    this.sound("wrong");
    if(!owner.scoring){this.complete("failure");return;}
    this.advance();
  }

  advance() {
    const owner=this.active;
    if(++owner.index < owner.steps.length){this.next();return;}
    const outcome=!owner.scoring || owner.hits>=owner.scoring.successAt ? "success"
      : owner.hits>=owner.scoring.partialAt ? "partial" : "failure";
    this.complete(outcome);
  }

  release(button) { this.active?.held.delete(button); }

  complete(outcome) {
    if (!this.active || this.active.outcome) return;
    this.active.outcome = outcome;
    this.cancel(this.timer);
    this.finish(outcome);
  }

  stop() { this.cancel(this.timer); this.timer = null; this.active = null; }
}
