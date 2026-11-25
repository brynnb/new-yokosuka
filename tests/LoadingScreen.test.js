import assert from "node:assert/strict";
import test from "node:test";
import { LoadingScreen, FADE_TO_BLACK_MS, REVEAL_MS } from "../play/ui/LoadingScreen.js";

const world = { japaneseLabel: "ドブ板", label: "Dobuita" };
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

function fixture() {
  const tasks = new Map();
  let nextId = 0;
  const classes = new Set();
  const events = [];
  const enqueue = (callback, ms) => { tasks.set(++nextId, { callback, ms }); return nextId; };
  const dom = {
    loading: { getAnimations: () => [], classList: {
      toggle: (name, on) => on ? classes.add(name) : classes.delete(name),
      remove: name => classes.delete(name),
    }, style: { setProperty() {} } },
    canvas: { width: 1280, height: 720 },
    storyScreenFade: {hidden:true,style:{}},
    transitionFrame: { hidden: true, getContext: () => ({ drawImage: () => events.push("snapshot") }) },
    loadingWord: {}, loadingProgress: {}, loadingError: {}, loadingCount: {},
    loadingPlaceJapanese: {}, loadingPlaceEnglish: {},
  };
  const screen = new LoadingScreen({
    dom, getDate: () => new Date(0), worldHud: { setLoadingDate: date => events.push(date) },
    onFinished: () => events.push("finished"), timers: {
      setTimeout: enqueue, clearTimeout: id => tasks.delete(id),
      requestAnimationFrame: callback => enqueue(callback, "frame"),
      cancelAnimationFrame: id => tasks.delete(id),
    },
  });
  const tick = async ms => {
    const task = [...tasks.values()].find(task => task.ms === ms);
    assert.ok(task, `expected pending ${ms} callback`);
    task.callback();
    await flush();
  };
  return { screen, dom, classes, events, tasks, tick };
}

test("outgoing frame fades for one second before destination/loading content appears", async () => {
  const f = fixture();
  f.screen.setPhase("hidden");
  const beginning = f.screen.begin(world);
  assert.equal(f.screen.phase, "covering");
  assert.equal(f.screen.canRender, false);
  assert.equal(f.dom.transitionFrame.hidden, false);
  assert.equal(f.dom.loadingPlaceEnglish.textContent, undefined);
  await f.tick(FADE_TO_BLACK_MS);
  assert.equal(f.dom.loadingPlaceEnglish.textContent, "Dobuita");
  assert.equal(f.dom.transitionFrame.hidden, true);
  await f.tick("frame"); await f.tick("frame");
  assert.equal(await beginning, true);
  assert.equal(f.screen.phase, "loading");
});

test("a stale Story handoff cannot clear a newer world-transition frame",()=>{
  const f=fixture(),owner={};f.screen.setPhase("hidden");
  assert.equal(f.screen.captureFrame(owner),true);assert.equal(f.dom.transitionFrame.hidden,false);
  f.screen.captureFrame(); // A normal world transition supersedes this frame.
  assert.equal(f.screen.releaseFrame(owner),false);assert.equal(f.dom.transitionFrame.hidden,false);
  assert.equal(f.screen.releaseFrame(),true);assert.equal(f.dom.transitionFrame.hidden,true);
});

test("ready content runs behind the half-second reveal without an artificial minimum load time", async () => {
  const f = fixture();
  const finishing = f.screen.finish();
  assert.equal(f.screen.canRender, true);
  await f.tick("frame");
  assert.equal(f.screen.phase, "preparing-reveal");
  await f.tick("frame");
  assert.equal(f.screen.phase, "revealing");
  assert.equal(f.screen.canRender, true);
  assert.equal(f.classes.has("hidden"), false);
  assert.equal(f.events.includes("finished"), false);
  await f.tick(REVEAL_MS);
  assert.equal(await finishing, true);
  assert.equal(f.screen.phase, "hidden");
  assert.equal(f.events.at(-1), "finished");
});

test("a replacement cancels the old reveal and cannot be hidden or focused by it", async () => {
  const f = fixture();
  const finishing = f.screen.finish();
  await f.tick("frame"); await f.tick("frame");
  const beginning = f.screen.begin(world);
  assert.equal(await finishing, false);
  assert.equal([...f.tasks.values()].some(task => task.ms === REVEAL_MS), false);
  await f.tick(FADE_TO_BLACK_MS);
  await f.tick("frame"); await f.tick("frame");
  assert.equal(await beginning, true);
  assert.equal(f.screen.phase, "loading");
  assert.equal(f.events.includes("finished"), false);
});

for (const phase of ["cover", "paint", "reveal"]) {
  test(`abort during ${phase} settles promptly without hiding a newer screen`, async () => {
    const f = fixture();
    const controller = new AbortController();
    if (phase === "cover") f.screen.setPhase("hidden");
    const pending = phase === "cover" ? f.screen.begin(world, controller.signal) : f.screen.finish(controller.signal);
    if (phase === "reveal") { await f.tick("frame"); await f.tick("frame"); }
    controller.abort();
    assert.equal(await pending, false);
    assert.equal(f.tasks.size, 0);
    assert.equal(f.events.includes("finished"), false);
  });
}

test("day rollover uses the shared cover and reveals its date only after black", async () => {
  const f = fixture();
  f.screen.setPhase("hidden");
  const date = new Date("1986-06-10T08:30:00Z");
  const beginning = f.screen.beginDayRollover(world, date);
  assert.equal(f.events.includes(date), false);
  await f.tick(FADE_TO_BLACK_MS);
  await f.tick("frame"); await f.tick("frame");
  assert.equal(await beginning, true);
  assert.equal(f.events.at(-1), date);
});

test("cinematic captions survive clock refreshes and reset for the next ordinary world load", async () => {
  const f = fixture();
  const presentation = { label: "4 Days Later...", japaneseLabel: "", dateTime: "1986-12-03T08:30:00Z" };
  const beginning = f.screen.begin(world, null, presentation);
  await flush();
  await f.tick("frame"); await f.tick("frame");
  assert.equal(await beginning, true);
  assert.equal(f.dom.loadingPlaceEnglish.textContent, presentation.label);
  assert.equal(f.dom.loadingPlaceJapanese.textContent, "");
  f.screen.refreshDate();
  assert.equal(f.events.at(-1).toISOString(), presentation.dateTime.replace("Z", ".000Z"));
  assert.equal(f.screen.getDate().getTime(), 0, "cinematic display never changes the world clock");
  const gameplay = f.screen.begin(world);
  await flush();
  await f.tick("frame"); await f.tick("frame");
  assert.equal(await gameplay, true);
  assert.equal(f.dom.loadingPlaceEnglish.textContent, world.label);
  assert.equal(f.dom.loadingPlaceJapanese.textContent, world.japaneseLabel);
  assert.equal(f.events.at(-1).getTime(), 0);
});

test("a superseded cinematic load cannot overwrite the new caption or date", async () => {
  const f = fixture();
  f.screen.setPhase("hidden");
  const stale = f.screen.begin(world, null, { label: "Old", dateTime: "1986-11-29T16:00:00Z" });
  const latest = f.screen.begin(world, null, { label: "New", dateTime: "1986-12-03T08:50:00Z" });
  assert.equal(await stale, false);
  await f.tick(FADE_TO_BLACK_MS);
  await f.tick("frame"); await f.tick("frame");
  assert.equal(await latest, true);
  assert.equal(f.dom.loadingPlaceEnglish.textContent, "New");
  assert.equal(f.events.at(-1).toISOString(), "1986-12-03T08:50:00.000Z");
});

test("errors remain covered; disposal cancels callbacks and releases the captured frame", async () => {
  const f = fixture();
  const finishing = f.screen.finish();
  f.screen.setError("asset failed");
  assert.equal(await finishing, false);
  assert.equal(f.screen.phase, "loading");
  assert.equal(f.dom.loadingError.textContent, "asset failed");
  const retry = f.screen.begin(world);
  await flush();
  f.screen.dispose();
  assert.equal(await retry, false);
  assert.equal(f.tasks.size, 0);
  assert.equal(f.dom.transitionFrame.hidden, true);
  assert.equal(f.events.includes("finished"), false);
});

test("native black transfers to world loading without revealing a gameplay frame", async () => {
  const f=fixture(), owner={}, late={};
  f.screen.setPhase("hidden");
  f.screen.presentStoryFade(owner,127);
  assert.equal(f.dom.storyScreenFade.style.opacity,String(127/255));
  assert.equal(f.dom.storyScreenFade.hidden,false);
  assert.throws(()=>f.screen.takeStoryCover(owner),/fully covered/);
  f.screen.cancelStoryFade(late);
  assert.equal(f.dom.storyScreenFade.hidden,false);
  f.screen.presentStoryFade(owner,255);
  f.screen.takeStoryCover(owner);
  assert.equal(f.dom.storyScreenFade.hidden,true);
  assert.equal(f.screen.phase,"covered");
  f.screen.cancelStoryFade(owner);
  assert.equal(f.screen.phase,"hidden");
  f.screen.presentStoryFade(owner,255);
  f.screen.takeStoryCover(owner);
  const load=f.screen.begin(world);
  f.screen.cancelStoryFade(owner); // The destination already owns the screen.
  await flush();
  assert.equal(f.screen.phase,"loading");
  assert.ok(!f.events.includes("snapshot"));
  await f.tick("frame");await f.tick("frame");
  assert.equal(await load,true);
});

test("cancellation releases intermediate Story opacity without disturbing a successor",()=>{
  const f=fixture(), first={},next={};
  f.screen.setPhase("hidden");
  f.screen.presentStoryFade(first,200);
  f.screen.cancelStoryFade(first);
  assert.equal(f.dom.storyScreenFade.hidden,true);
  f.screen.presentStoryFade(next,15);
  f.screen.cancelStoryFade(first);
  assert.equal(f.dom.storyScreenFade.hidden,false);
  f.screen.presentStoryFade(next,0);
  assert.equal(f.dom.storyScreenFade.hidden,true);
  f.screen.dispose();
});
