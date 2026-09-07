import { create } from "zustand";

export const JOURNAL_PAGES = Object.freeze([
  {
    title: "Notebook",
    copy: "Your discoveries and current objectives will appear here.",
  },
  {
    title: "People",
    copy: "People you meet around Yokosuka will be recorded here.",
  },
  {
    title: "Clues",
    copy: "Important clues and leads will be collected here.",
  },
]);

const callbacks = {
  onOpen: () => {},
  onClose: () => {},
  onBlocked: () => {},
  onPageBack: () => {},
  onPageForward: () => {},
};

export const useJournalStore = create(() => ({
  open: false,
  pageIndex: 0,
}));

export function configureJournalUi(nextCallbacks) {
  Object.assign(callbacks, nextCallbacks);
}

export function openJournal() {
  if (useJournalStore.getState().open) return;
  useJournalStore.setState({ open: true, pageIndex: 0 });
  callbacks.onOpen();
}

export function closeJournal() {
  if (!useJournalStore.getState().open) return;
  useJournalStore.setState({ open: false });
  callbacks.onClose();
}

export function turnJournalPage(direction) {
  const { pageIndex } = useJournalStore.getState();
  const nextIndex = pageIndex + direction;
  if (nextIndex < 0 || nextIndex >= JOURNAL_PAGES.length) {
    callbacks.onBlocked();
    return false;
  }
  useJournalStore.setState({ pageIndex: nextIndex });
  if (direction < 0) callbacks.onPageBack();
  else callbacks.onPageForward();
  return true;
}
