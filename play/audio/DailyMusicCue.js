function utcDayKey(date) {
  return [
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  ].join("-");
}

function utcSecondOfDay(date) {
  return (
    date.getUTCHours() * 60 * 60
    + date.getUTCMinutes() * 60
    + date.getUTCSeconds()
    + date.getUTCMilliseconds() / 1000
  );
}

export class DailyMusicCue {
  constructor({
    hour,
    excludedWorldIds = [],
    includedWorldIds = null,
    triggerWindowSeconds = 2,
    onTrigger,
  }) {
    this.triggerSecond = hour * 60 * 60;
    this.triggerWindowSeconds = Math.max(0, triggerWindowSeconds);
    this.excludedWorldIds = new Set(excludedWorldIds);
    this.includedWorldIds = includedWorldIds
      ? new Set(includedWorldIds)
      : null;
    this.onTrigger = onTrigger;
    this.previous = null;
    this.triggeredDay = null;
  }

  update(date, worldId) {
    if (!(date instanceof Date) || !Number.isFinite(date.getTime())) {
      return false;
    }
    const sample = {
      day: utcDayKey(date),
      second: utcSecondOfDay(date),
    };
    const previous = this.previous;
    this.previous = sample;
    if (
      !previous
      || previous.day !== sample.day
      || this.triggeredDay === sample.day
      || !this.isEligible(worldId)
      || previous.second >= this.triggerSecond
      || sample.second < this.triggerSecond
      || sample.second > this.triggerSecond + this.triggerWindowSeconds
    ) {
      return false;
    }
    this.triggeredDay = sample.day;
    this.onTrigger();
    return true;
  }

  isEligible(worldId) {
    return (
      !this.excludedWorldIds.has(worldId)
      && (!this.includedWorldIds || this.includedWorldIds.has(worldId))
    );
  }
}
