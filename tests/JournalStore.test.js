import assert from "node:assert/strict";
import test from "node:test";

import {
  closeJournal,
  configureJournalUi,
  openJournal,
  turnJournalPage,
  useJournalStore,
} from "../play/ui/react/journalStore.js";

test("journal opens at its first page and reports page turns", () => {
  const played = [];
  configureJournalUi({
    onOpen: () => played.push("open"),
    onClose: () => played.push("close"),
    onBlocked: () => played.push("blocked"),
    onPageBack: () => played.push("back"),
    onPageForward: () => played.push("forward"),
  });
  useJournalStore.setState({ open: false, pageIndex: 2 });

  openJournal();
  assert.deepEqual(useJournalStore.getState(), {
    open: true,
    pageIndex: 0,
  });
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
