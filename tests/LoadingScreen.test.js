import assert from "node:assert/strict";
import test from "node:test";
import { LoadingScreen } from "../play/ui/LoadingScreen.js";

test("a superseded loading screen never hides the replacement", async () => {
  const addedClasses = [];
  const timers = {
    setTimeout() {
      return 1;
    },
    clearTimeout() {},
    requestAnimationFrame() {
      throw new Error("cancelled load must not request a finished frame");
    },
  };
  const loadingScreen = new LoadingScreen({
    dom: {
      loading: {
        classList: {
          add: (value) => addedClasses.push(value),
        },
      },
    },
    getDate: () => new Date(),
    worldHud: {},
    onFinished() {},
    clock: { now: () => 0 },
    timers,
  });
  const controller = new AbortController();
  const finishing = loadingScreen.finish(controller.signal);
  controller.abort();

  assert.equal(await finishing, false);
  assert.deepEqual(addedClasses, []);
});

test("day rollover fades to black before revealing the new date", async () => {
  const classes = new Set(["hidden"]);
  const loadingDates = [];
  let releaseFade = null;
  const loadingScreen = new LoadingScreen({
    dom: {
      loading: {
        classList: {
          add: (value) => classes.add(value),
          remove: (value) => classes.delete(value),
        },
      },
      loadingWord: { textContent: "" },
      loadingProgress: { hidden: false },
      loadingError: { hidden: true, textContent: "" },
      loadingCount: { textContent: "" },
      loadingPlaceJapanese: { textContent: "" },
      loadingPlaceEnglish: { textContent: "" },
    },
    getDate: () => new Date("1986-06-09T23:29:00Z"),
    worldHud: {
      setLoadingDate: (date) => loadingDates.push(date.toISOString()),
    },
    onFinished() {},
    clock: { now: () => 0 },
    timers: {
      setTimeout(callback) {
        releaseFade = callback;
        return 1;
      },
      clearTimeout() {},
      requestAnimationFrame() {},
    },
  });
  const newDate = new Date("1986-06-10T08:30:00Z");

  const beginning = loadingScreen.beginDayRollover(
    { japaneseLabel: "ドブ板", label: "Dobuita" },
    newDate,
  );
  assert.equal(classes.has("hidden"), false);
  assert.equal(classes.has("day-rollover-fade"), true);
  assert.equal(loadingDates.at(-1), newDate.toISOString());

  releaseFade();
  assert.equal(await beginning, true);
  assert.equal(classes.has("day-rollover-fade"), false);
});

test("world loading waits through a paint before synchronous teardown", async () => {
  const frames = [];
  const loadingScreen = new LoadingScreen({
    dom: {},
    getDate: () => new Date(),
    worldHud: {},
    onFinished() {},
    timers: {
      requestAnimationFrame(callback) {
        frames.push(callback);
      },
    },
  });

  let settled = false;
  const painted = loadingScreen.waitUntilPainted().then((value) => {
    settled = true;
    return value;
  });
  assert.equal(frames.length, 1);
  frames.shift()();
  await Promise.resolve();
  assert.equal(settled, false);
  assert.equal(frames.length, 1);
  frames.shift()();
  assert.equal(await painted, true);
});

test("loading covers the first ready frame and does not reveal a superseded world", async () => {
  for (const cancel of [false, true]) {
    const frames = [];
    const classes = [];
    let now = 0;
    const screen = new LoadingScreen({
      dom: { loading: { classList: { add: value => classes.push(value) } } },
      getDate: () => new Date(),
      worldHud: {},
      onFinished() {},
      clock: { now: () => now },
      timers: { requestAnimationFrame: callback => frames.push(callback) },
    });
    now = 3000;
    const controller = new AbortController();
    const finishing = screen.finish(controller.signal);
    frames.shift()();
    await Promise.resolve();
    assert.deepEqual(classes, [], "keep the cover during the first ready frame");
    if (cancel) controller.abort();
    frames.shift()();
    assert.equal(await finishing, !cancel);
    assert.deepEqual(classes, cancel ? [] : ["hidden"]);
    assert.equal(frames.length, cancel ? 0 : 1);
  }
});
