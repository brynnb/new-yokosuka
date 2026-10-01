/** Chromium may cancel an Ogg header range to read its seek table at the tail.
 * Require both a completed replacement range and playback after the abort;
 * a successful HTTP response or a previously playing element alone is not proof.
 */
export function verifiedContinuingMediaRangeAbort(media, requests, playback) {
  if (media.failure !== "net::ERR_ABORTED" || media.status !== 206
    || !media.range || !media.contentRange || !Number.isFinite(media.failureAt)) return false;
  const continued = playback.some(record => record.src === media.url
    && !record.error && record.maxTime > 0.5
    && record.lastAdvancedAt > media.failureAt);
  return continued && requests.some(next => next !== media && next.url === media.url
    && next.status === 206 && !next.failure && next.range && next.range !== media.range
    && next.contentRange && next.finishedAt >= media.failureAt);
}
