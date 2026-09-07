export function loopedMediaTimeSeconds(
  clockTimeMs,
  epochMs,
  durationSeconds,
) {
  if (
    !Number.isFinite(clockTimeMs)
    || !Number.isFinite(epochMs)
    || !Number.isFinite(durationSeconds)
    || durationSeconds <= 0
  ) return 0;
  const elapsedSeconds = (clockTimeMs - epochMs) / 1000;
  return (
    (elapsedSeconds % durationSeconds) + durationSeconds
  ) % durationSeconds;
}

export function shortestLoopTimeDifferenceSeconds(
  targetSeconds,
  currentSeconds,
  durationSeconds,
) {
  if (
    !Number.isFinite(targetSeconds)
    || !Number.isFinite(currentSeconds)
    || !Number.isFinite(durationSeconds)
    || durationSeconds <= 0
  ) return 0;
  const halfDuration = durationSeconds / 2;
  return (
    (
      (
        targetSeconds
        - currentSeconds
        + halfDuration
      ) % durationSeconds
      + durationSeconds
    ) % durationSeconds
    - halfDuration
  );
}
