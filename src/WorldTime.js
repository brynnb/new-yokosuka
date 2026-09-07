export const GAME_DAY_MS = 24 * 60 * 60 * 1000;
export const DEFAULT_DAY_LENGTH_MS = 96 * 60 * 1000;
export const DEFAULT_DAY_START_HOUR = 8.5;
export const DEFAULT_DAY_END_HOUR = 23.5;
export const SUNSET_START_HOUR = 18;

const SUNRISE_TO_DAY_HOURS = 0.75;
const DAY_TO_SUNSET_HOURS = 1;
const SUNSET_TO_EVENING_HOURS = 0.75;
const EVENING_TO_NIGHT_HOURS = 0.75;

function activeClockWindow(worldState) {
  const startHour = Number.isFinite(worldState?.dayStartHour)
    ? worldState.dayStartHour
    : DEFAULT_DAY_START_HOUR;
  const endHour = Number.isFinite(worldState?.dayEndHour)
    ? worldState.dayEndHour
    : DEFAULT_DAY_END_HOUR;
  if (startHour < 0 || endHour > 24 || endHour <= startHour) {
    return {
      startHour: DEFAULT_DAY_START_HOUR,
      endHour: DEFAULT_DAY_END_HOUR,
    };
  }
  return { startHour, endHour };
}

export function gameDateFromWorldState(
  worldState,
  nowMs = Date.now(),
  fallbackGameTimeMs = Date.UTC(1986, 5, 9, 8, 30),
  fallbackServerTimeMs = nowMs,
  fallbackDayLengthMs = DEFAULT_DAY_LENGTH_MS,
) {
  const gameTimeMs = Number.isFinite(worldState?.gameTimeMs)
    ? worldState.gameTimeMs
    : fallbackGameTimeMs;
  const serverTimeMs = Number.isFinite(worldState?.serverTimeMs)
    ? worldState.serverTimeMs
    : fallbackServerTimeMs;
  const dayLengthMs = (
    Number.isFinite(worldState?.dayLengthMs)
    && worldState.dayLengthMs > 0
  )
    ? worldState.dayLengthMs
    : fallbackDayLengthMs;
  const elapsedMs = Math.max(0, nowMs - serverTimeMs);
  const { startHour, endHour } = activeClockWindow(worldState);
  const activeWindowMs = (endHour - startHour) * 60 * 60 * 1000;
  const snapshot = new Date(gameTimeMs);
  const dayStartMs = Date.UTC(
    snapshot.getUTCFullYear(),
    snapshot.getUTCMonth(),
    snapshot.getUTCDate(),
  ) + startHour * 60 * 60 * 1000;
  const snapshotOffsetMs = Math.min(
    activeWindowMs,
    Math.max(0, gameTimeMs - dayStartMs),
  );
  const totalActiveMs = (
    snapshotOffsetMs + elapsedMs * GAME_DAY_MS / dayLengthMs
  );
  const elapsedDays = Math.floor(totalActiveMs / activeWindowMs);
  const withinDayMs = totalActiveMs % activeWindowMs;
  return new Date(
    dayStartMs + elapsedDays * GAME_DAY_MS + withinDayMs,
  );
}

export function timeOfDayIndexForHour(hour) {
  return timeOfDayBlendForHour(hour).presetIndex;
}

export function timeOfDayIndexForDate(date) {
  return timeOfDayBlendForDate(date).presetIndex;
}

function blend(fromIndex, toIndex, progress) {
  let amount = Math.min(1, Math.max(0, progress));
  if (amount < Number.EPSILON * 16) amount = 0;
  if (amount > 1 - Number.EPSILON * 16) amount = 1;
  return {
    fromIndex,
    toIndex,
    progress: amount,
    presetIndex: amount < 0.5 ? fromIndex : toIndex,
  };
}

export function timeOfDayBlendForHour(
  hour,
  sunsetStartHour = SUNSET_START_HOUR,
) {
  const normalized = ((hour % 24) + 24) % 24;
  if (normalized < DEFAULT_DAY_START_HOUR) return blend(3, 3, 0);
  if (normalized < DEFAULT_DAY_START_HOUR + SUNRISE_TO_DAY_HOURS) {
    return blend(
      1,
      0,
      (normalized - DEFAULT_DAY_START_HOUR) / SUNRISE_TO_DAY_HOURS,
    );
  }
  if (normalized < sunsetStartHour) return blend(0, 0, 0);
  if (normalized < sunsetStartHour + DAY_TO_SUNSET_HOURS) {
    return blend(
      0,
      1,
      (normalized - sunsetStartHour) / DAY_TO_SUNSET_HOURS,
    );
  }
  const eveningStart = sunsetStartHour + DAY_TO_SUNSET_HOURS;
  if (normalized < eveningStart + SUNSET_TO_EVENING_HOURS) {
    return blend(
      1,
      2,
      (normalized - eveningStart) / SUNSET_TO_EVENING_HOURS,
    );
  }
  const nightStart = eveningStart + SUNSET_TO_EVENING_HOURS;
  if (normalized < nightStart + EVENING_TO_NIGHT_HOURS) {
    return blend(
      2,
      3,
      (normalized - nightStart) / EVENING_TO_NIGHT_HOURS,
    );
  }
  return blend(3, 3, 0);
}

export function timeOfDayBlendForDate(date) {
  return timeOfDayBlendForHour(
    date.getUTCHours()
    + date.getUTCMinutes() / 60
    + date.getUTCSeconds() / 3600
    + date.getUTCMilliseconds() / 3_600_000,
  );
}
