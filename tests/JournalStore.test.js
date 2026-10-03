import assert from "node:assert/strict";
import test from "node:test";

import {
  closeJournal,
  configureJournalUi,
  openJournal,
  setJournalCharacter,
  turnJournalPage,
  useJournalStore,
} from "../play/ui/react/journalStore.js";

const completedStory = { id: 7, playMode: "story", openingCompleted: true };
let previousStorage;
let storedPages;

test.beforeEach(() => {
  previousStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  storedPages = new Map();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: key => storedPages.get(key) ?? null,
      setItem: (key, value) => storedPages.set(key, value),
    },
  });
  configureJournalUi({
    onOpen() {}, onClose() {}, onBlocked() {}, onPageBack() {}, onPageForward() {},
  });
  closeJournal();
  setJournalCharacter(null);
});

test.afterEach(() => {
  if (previousStorage) Object.defineProperty(globalThis, "localStorage", previousStorage);
  else delete globalThis.localStorage;
});

test("journal opens at its first page and reports page turns", () => {
  const played = [];
  configureJournalUi({
    onOpen: () => played.push("open"),
    onClose: () => played.push("close"),
    onBlocked: () => played.push("blocked"),
    onPageBack: () => played.push("back"),
    onPageForward: () => played.push("forward"),
  });
  setJournalCharacter(completedStory);

  openJournal();
  assert.equal(useJournalStore.getState().open, true);
  assert.equal(useJournalStore.getState().pageIndex, 0);
  assert.equal(turnJournalPage(1), true);
  assert.equal(turnJournalPage(-1), true);
  assert.equal(turnJournalPage(-1), false);
  closeJournal();

  assert.deepEqual(played, [
    "open",
    "forward",
    "back",
    "blocked",
    "close",
  ]);
});

test("notebook remembers the page when reopened and when the character returns", () => {
  setJournalCharacter(completedStory);
  openJournal();
  turnJournalPage(1);
  turnJournalPage(1);
  const rememberedId = useJournalStore.getState().pages[2].id;
  closeJournal();
  openJournal();
  assert.equal(useJournalStore.getState().pageIndex, 2);
  assert.equal(storedPages.get("new-yokosuka.notebook-page.v1:7:story"), rememberedId);

  setJournalCharacter({ ...completedStory, id: 8 });
  assert.equal(useJournalStore.getState().pageIndex, 0);
  setJournalCharacter({ ...completedStory, playMode: "free_roam" });
  assert.equal(useJournalStore.getState().pageIndex, 0);
  setJournalCharacter(null);
  setJournalCharacter(completedStory);
  openJournal();
  assert.equal(useJournalStore.getState().pageIndex, 2);
});

test("invalid saved pages and unavailable storage do not break the notebook", () => {
  storedPages.set("new-yokosuka.notebook-page.v1:7:story", "removed-page");
  setJournalCharacter(completedStory);
  assert.equal(useJournalStore.getState().pageIndex, 0);
  setJournalCharacter(null);
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() { throw new Error("storage denied"); },
  });
  setJournalCharacter(completedStory);
  openJournal();
  assert.equal(turnJournalPage(1), true);
  closeJournal();
  openJournal();
  assert.equal(useJournalStore.getState().pageIndex, 1);
});

test("only completed Story openings receive the five initial pages", () => {
  for (const character of [
    null,
    { ...completedStory, openingCompleted: false },
    { id: 7, playMode: "story" },
    { ...completedStory, playMode: "free_roam" },
  ]) {
    setJournalCharacter(character);
    assert.equal(useJournalStore.getState().pages.length, 0);
    assert.equal(turnJournalPage(1), false);
  }

  setJournalCharacter(completedStory);
  const { pages } = useJournalStore.getState();
  assert.equal(pages.length, 5);
  assert.equal(new Set(pages.map(page => page.id)).size, 5);
  assert.match(pages[0].text, /Police.*110/);
  assert.match(pages[1].text, /0468-37-7424/);
  assert.match(pages[2].text, /Naoyuki Ito[\s\S]*Nozomi Harasaki/);
  assert.match(pages[3].text, /Lan Di/);
  assert.match(pages[4].text, /Zhao Sun Ming[\s\S]*Meng Cun/);
  assert.doesNotMatch(pages.map(page => page.text).join("\n"), /Chen|61-5647|allowance|500|Fuku/i);
});

test("repeated hydration keeps the current page without duplicating entries", () => {
  setJournalCharacter(completedStory);
  openJournal();
  for (let i = 0; i < 4; i++) assert.equal(turnJournalPage(1), true);
  const pages = useJournalStore.getState().pages;
  setJournalCharacter({ ...completedStory, yen: 400, modeRevision: 3 });
  assert.equal(useJournalStore.getState().pageIndex, 4);
  assert.equal(useJournalStore.getState().pages, pages);
  for (const direction of [1, 0, NaN, 0.5, "1"]) {
    assert.equal(turnJournalPage(direction), false);
  }
  assert.equal(useJournalStore.getState().pageIndex, 4);
});

test("changing mode or character closes the old notebook and clears its view", () => {
  let closes = 0;
  configureJournalUi({ onClose: () => closes++ });
  setJournalCharacter(completedStory);
  openJournal();
  turnJournalPage(1);
  setJournalCharacter({ ...completedStory, playMode: "free_roam" });
  assert.equal(closes, 1);
  assert.equal(useJournalStore.getState().open, false);
  assert.equal(useJournalStore.getState().pages.length, 0);
  assert.equal(useJournalStore.getState().pageIndex, 0);

  setJournalCharacter(completedStory);
  assert.equal(useJournalStore.getState().pages.length, 5);
  setJournalCharacter({ id: 8, playMode: "story", openingCompleted: false });
  assert.equal(useJournalStore.getState().pages.length, 0);
  setJournalCharacter(null);
  assert.equal(useJournalStore.getState().contextKey, null);
});
