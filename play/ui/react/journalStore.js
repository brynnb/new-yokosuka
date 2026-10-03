import { create } from "zustand";
import { notebookPagesForCharacter } from "../../config/notebook.js";

const PAGE_STORAGE_PREFIX = "new-yokosuka.notebook-page.v1:";

function rememberedPageIndex(contextKey, pages) {
  if (!contextKey) return 0;
  try {
    const pageId = globalThis.localStorage?.getItem(PAGE_STORAGE_PREFIX + contextKey);
    // Stable IDs survive additions/reordering; unknown or removed pages start
    // at the beginning. A blocked browser store must not prevent opening it.
    return Math.max(0, pages.findIndex(page => page.id === pageId));
  } catch {
    return 0;
  }
}

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
  pages: notebookPagesForCharacter(null),
  contextKey: null,
}));

export function configureJournalUi(nextCallbacks) {
  Object.assign(callbacks, nextCallbacks);
}

export function setJournalCharacter(character) {
  const contextKey = character?.id != null
    ? `${character.id}:${character.playMode}`
    : null;
  const pages = notebookPagesForCharacter(character);
  const current = useJournalStore.getState();
  if (current.contextKey !== contextKey) {
    closeJournal();
    useJournalStore.setState({ contextKey, pages, pageIndex: rememberedPageIndex(contextKey, pages) });
  } else if (current.pages !== pages) {
    useJournalStore.setState({
      pages,
      pageIndex: rememberedPageIndex(contextKey, pages),
    });
  }
}

export function openJournal() {
  if (useJournalStore.getState().open) return;
  useJournalStore.setState({ open: true });
  callbacks.onOpen();
}

export function closeJournal() {
  if (!useJournalStore.getState().open) return;
  useJournalStore.setState({ open: false });
  callbacks.onClose();
}

export function turnJournalPage(direction) {
  const { pageIndex, pages, contextKey } = useJournalStore.getState();
  const nextIndex = pageIndex + direction;
  if (![1, -1].includes(direction) || nextIndex < 0 || nextIndex >= pages.length) {
    callbacks.onBlocked();
    return false;
  }
  useJournalStore.setState({ pageIndex: nextIndex });
  try {
    if (contextKey) globalThis.localStorage?.setItem(PAGE_STORAGE_PREFIX + contextKey, pages[nextIndex].id);
  } catch {
    // Keep the in-memory page even when storage is disabled or full.
  }
  if (direction < 0) callbacks.onPageBack();
  else callbacks.onPageForward();
  return true;
}
