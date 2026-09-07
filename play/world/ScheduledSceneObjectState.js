const DAY_SECONDS = 24 * 60 * 60;
const DAY_MS = DAY_SECONDS * 1000;
const POSITION_EPSILON = 1e-5;

export const DEFAULT_SCENE_OBJECT_LIVE_LAG_SECONDS = 120;

function gameSecond(date) {
  return (
    date.getUTCHours() * 60 * 60
    + date.getUTCMinutes() * 60
    + date.getUTCSeconds()
    + date.getUTCMilliseconds() / 1000
  );
}

function absoluteGameSecond(date) {
  const day = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  ) / DAY_MS;
  return day * DAY_SECONDS + gameSecond(date);
}

function selectedEvents(definition, variantsByActor) {
  return (definition.events || []).filter((event) => {
    const selected = variantsByActor.get(event.actorCode);
    return selected
      ? event.scheduleVariantId === selected
      : event.defaultVariant === true;
  });
}

function latestCommand(definition, now, variantsByActor) {
  const events = selectedEvents(definition, variantsByActor);
  if (events.length === 0) return null;
  const second = ((now % DAY_SECONDS) + DAY_SECONDS) % DAY_SECONDS;
  let latest = null;
  for (const event of events) {
    const occurrence = now - second + event.second;
    const at = occurrence <= now ? occurrence : occurrence - DAY_SECONDS;
    if (
      !latest
      || at > latest.at
      || (at === latest.at && event.controlValue > latest.event.controlValue)
    ) {
      latest = { at, event };
    }
  }
  return latest;
}

function crossedCommands(definition, from, to, variantsByActor) {
  if (!(to >= from)) return [];
  const events = selectedEvents(definition, variantsByActor);
  const firstDay = Math.floor(from / DAY_SECONDS);
  const lastDay = Math.floor(to / DAY_SECONDS);
  const commands = [];
  for (let day = firstDay; day <= lastDay; day++) {
    for (const event of events) {
      const at = day * DAY_SECONDS + event.second;
      if (at > from && at <= to) commands.push({ at, event });
    }
  }
  return commands.sort((left, right) => (
    left.at - right.at
    || left.event.controlValue - right.event.controlValue
    || left.event.actorCode.localeCompare(right.event.actorCode)
  ));
}

function motionFor(definition) {
  const motion = definition.motion;
  if (
    !motion
    || !["x", "y", "z"].includes(motion.axis)
    || !Number.isFinite(motion.controlTargets?.[0])
    || !Number.isFinite(motion.controlTargets?.[1])
    || !(motion.unitsPerSecond > 0)
  ) {
    throw new TypeError(`Invalid scene-object motion for ${definition.id}`);
  }
  return motion;
}

function targetValue(definition, controlValue) {
  return motionFor(definition).controlTargets[controlValue];
}

function statusFor(entry) {
  const motion = motionFor(entry.definition);
  const atTarget = Math.abs(entry.currentValue - entry.targetValue)
    <= POSITION_EPSILON;
  const states = atTarget ? motion.controlStates : motion.transitionStates;
  return states?.[entry.controlValue]
    || (atTarget ? `control-${entry.controlValue}` : "moving");
}

export class ScheduledSceneObjectState {
  constructor(definitions, {
    maxLiveLagGameSeconds = DEFAULT_SCENE_OBJECT_LIVE_LAG_SECONDS,
  } = {}) {
    this.maxLiveLagGameSeconds = maxLiveLagGameSeconds;
    this.variantsByActor = new Map();
    this.entries = new Map((definitions || []).map((definition) => {
      const motion = motionFor(definition);
      const id = definition.id || definition.code;
      return [id, {
        definition,
        currentValue: motion.controlTargets[1],
        targetValue: motion.controlTargets[1],
        controlValue: 1,
      }];
    }));
    this.previousGameSecond = null;
  }

  setScheduleVariants(variantsByActor, gameDate = null) {
    this.variantsByActor = new Map(variantsByActor || []);
    if (gameDate instanceof Date) this.synchronize(gameDate, { snap: true });
  }

  synchronize(gameDate, { snap = false } = {}) {
    if (!(gameDate instanceof Date) || !Number.isFinite(gameDate.getTime())) {
      return false;
    }
    const now = absoluteGameSecond(gameDate);
    for (const entry of this.entries.values()) {
      const latest = latestCommand(
        entry.definition,
        now,
        this.variantsByActor,
      );
      if (!latest) continue;
      entry.controlValue = latest.event.controlValue;
      entry.targetValue = targetValue(entry.definition, entry.controlValue);
      if (snap) entry.currentValue = entry.targetValue;
    }
    this.previousGameSecond = now;
    return true;
  }

  update(gameDate, deltaRealSeconds) {
    if (!(gameDate instanceof Date) || !Number.isFinite(gameDate.getTime())) {
      return false;
    }
    const elapsed = Math.max(0, Number(deltaRealSeconds) || 0);
    for (const entry of this.entries.values()) {
      const difference = entry.targetValue - entry.currentValue;
      const maximum = motionFor(entry.definition).unitsPerSecond * elapsed;
      if (Math.abs(difference) <= maximum) {
        entry.currentValue = entry.targetValue;
      } else if (maximum > 0) {
        entry.currentValue += Math.sign(difference) * maximum;
      }
    }

    const now = absoluteGameSecond(gameDate);
    if (this.previousGameSecond === null) {
      return this.synchronize(gameDate, { snap: true });
    }
    const gameDelta = now - this.previousGameSecond;
    if (
      gameDelta < 0
      || gameDelta > this.maxLiveLagGameSeconds
    ) {
      return this.synchronize(gameDate, { snap: true });
    }
    for (const entry of this.entries.values()) {
      const commands = crossedCommands(
        entry.definition,
        this.previousGameSecond,
        now,
        this.variantsByActor,
      );
      for (const command of commands) {
        entry.controlValue = command.event.controlValue;
        entry.targetValue = targetValue(entry.definition, entry.controlValue);
      }
    }
    this.previousGameSecond = now;
    return true;
  }

  stateFor(id) {
    const entry = this.entries.get(id);
    if (!entry) return null;
    return {
      id,
      code: entry.definition.code,
      axis: motionFor(entry.definition).axis,
      currentValue: entry.currentValue,
      targetValue: entry.targetValue,
      controlValue: entry.controlValue,
      status: statusFor(entry),
    };
  }

  states() {
    return [...this.entries.keys()].map((id) => this.stateFor(id));
  }
}
