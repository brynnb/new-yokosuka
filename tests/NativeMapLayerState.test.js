import assert from "node:assert/strict";
import { test } from "node:test";
import {
  evaluateNativeMapLayerStates,
  nativeClockMinute,
  numberedMapLayer,
} from "../src/rendering/NativeMapLayerState.js";

function at(hour, minute = 0) {
  return new Date(Date.UTC(1986, 5, 9, hour, minute));
}

test("native clock normalization carries post-midnight hours past 24:00", () => {
  assert.equal(nativeClockMinute(at(23, 30)), 23 * 60 + 30);
  assert.equal(nativeClockMinute(at(1, 15)), 25 * 60 + 15);
  assert.equal(nativeClockMinute(at(6, 0)), 6 * 60);
});

test("native numbered MAP filenames include the unnumbered base as layer zero", () => {
  assert.equal(numberedMapLayer("S1_D000_MAP.MT5", "S1_D000"), 0);
  assert.equal(numberedMapLayer("S1_D000_MAP00.MT5", "S1_D000"), 0);
  assert.equal(numberedMapLayer("S1_D000_MAP05.MT5", "S1_D000"), 5);
  assert.equal(numberedMapLayer("S1_D000_MAP5.MT5", "S1_D000"), null);
  assert.equal(numberedMapLayer("S1_JU00_MAP05.MT5", "S1_D000"), null);
});

test("Dobuita numbered map layers follow exact native half-open windows", () => {
  const morning = evaluateNativeMapLayerStates("D000", at(8, 29));
  assert.equal(morning.get(17), 0);
  assert.equal(morning.get(20), 1);
  assert.equal(morning.get(8), 0);
  assert.equal(morning.get(11), 1);

  const daytime = evaluateNativeMapLayerStates("D000", at(8, 30));
  assert.equal(daytime.get(17), 1);
  assert.equal(daytime.get(20), 0);
  assert.equal(daytime.get(8), 1);
  assert.equal(daytime.get(11), 0);

  const evening = evaluateNativeMapLayerStates("D000", at(19, 15));
  assert.equal(evening.get(18), 0);
  assert.equal(evening.get(21), 1);
  assert.equal(evening.get(19), 1);
  assert.equal(evening.get(22), 0);

  const lateEvening = evaluateNativeMapLayerStates("D000", at(19, 30));
  assert.equal(lateEvening.get(19), 0);
  assert.equal(lateEvening.get(22), 1);

  const closingBoundary = evaluateNativeMapLayerStates("D000", at(23, 0));
  assert.equal(closingBoundary.get(18), 1);
  assert.equal(closingBoundary.get(21), 0);
  assert.equal(closingBoundary.get(19), 1);
  assert.equal(closingBoundary.get(22), 0);
});

test("Dobuita storefront overlays retain their synchronized half-open windows", () => {
  const beforeOpening = evaluateNativeMapLayerStates("D000", at(7, 59));
  assert.equal(beforeOpening.get(13), 1);
  assert.equal(beforeOpening.get(14), 1);

  const atOpening = evaluateNativeMapLayerStates("D000", at(8, 0));
  assert.equal(atOpening.get(13), 0);
  assert.equal(atOpening.get(14), 0);

  const beforeLayer13Close = evaluateNativeMapLayerStates("D000", at(17, 29));
  assert.equal(beforeLayer13Close.get(13), 0);
  assert.equal(beforeLayer13Close.get(14), 0);

  const atLayer13Close = evaluateNativeMapLayerStates("D000", at(17, 30));
  assert.equal(atLayer13Close.get(13), 1);
  assert.equal(atLayer13Close.get(14), 0);

  const beforeLayer14Close = evaluateNativeMapLayerStates("D000", at(19, 29));
  assert.equal(beforeLayer14Close.get(14), 0);

  const atLayer14Close = evaluateNativeMapLayerStates("D000", at(19, 30));
  assert.equal(atLayer14Close.get(14), 1);
});
