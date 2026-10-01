import assert from "node:assert/strict";
import test from "node:test";
import { verifiedContinuingMediaRangeAbort } from "./e2e/cutscene-preview-media.js";

test("ambient Ogg range cancellation requires completed replacement and subsequent playback", () => {
  const aborted = { url: "ambient.ogg", range: "bytes=0-", status: 206,
    contentRange: "bytes 0-999/1000", failure: "net::ERR_ABORTED", failureAt: 1000 };
  const tail = { url: aborted.url, range: "bytes=900-", status: 206,
    contentRange: "bytes 900-999/1000", finishedAt: 1100 };
  const audio = { src: aborted.url, error: null, maxTime: 9.8, lastAdvancedAt: 2000 };
  const check = (request = aborted, next = tail, playback = audio) => (
    verifiedContinuingMediaRangeAbort(request, [request, next], [playback])
  );
  assert.equal(check(), true);
  for (const invalid of [
    { error: "decode failed" }, { maxTime: 0 }, { lastAdvancedAt: 999 },
    { lastAdvancedAt: undefined }, { src: "other.ogg" },
  ]) assert.equal(check(aborted, tail, { ...audio, ...invalid }), false);
  for (const invalid of [
    { finishedAt: undefined }, { finishedAt: 999 }, { status: 404 },
    { failure: "net::ERR_ABORTED" }, { range: aborted.range }, { url: "other.ogg" },
  ]) assert.equal(check(aborted, { ...tail, ...invalid }), false);
  for (const invalid of [
    { failure: "net::ERR_CONNECTION_RESET" }, { status: undefined },
    { status: 500 }, { contentRange: undefined }, { range: undefined },
  ]) assert.equal(check({ ...aborted, ...invalid }), false);
});
