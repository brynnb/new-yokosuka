import { create } from "zustand";

export const useArcadeResultsStore = create(() => ({
  open: false, title: "", score: 0, decimalScores: false, characterId: null,
  entries: [], status: "idle", saveWarning: "",
}));

let callbacks = {};
let session = null;
let request = null;

export function configureArcadeResultsUi(options) { callbacks = options; }

export function restoreArcadeResultsFocus(event) {
  // Radix's focus trap is still mounted during onOpenChange. Restore gameplay
  // focus only after it releases the dialog, not while closing the store.
  event.preventDefault();
  if (!useArcadeResultsStore.getState().open) callbacks.onAfterClose?.();
}

export function closeArcadeResults() {
  request?.abort();
  request = null;
  session = null;
  const wasOpen = useArcadeResultsStore.getState().open;
  useArcadeResultsStore.setState({ open: false, entries: [], status: "idle" });
  if (wasOpen) callbacks.onClose?.();
}

export function openArcadeResults({ title, score, decimalScores, characterId, machineId, submission, scoreClient }) {
  closeArcadeResults();
  session = { machineId, submission, scoreClient };
  useArcadeResultsStore.setState({
    open: true, title, score, decimalScores, characterId,
    entries: [], status: "saving", saveWarning: "",
  });
  callbacks.onOpen?.();
  void refreshArcadeResults();
}

export async function refreshArcadeResults() {
  if (!session) return;
  request?.abort();
  const controller = new AbortController();
  request = controller;
  const current = session;
  const isCurrent = () => session === current && !controller.signal.aborted;
  useArcadeResultsStore.setState({ status: "saving" });
  try {
    // Read after the bounded save request settles so the new personal best is
    // included. Closing/replacing the dialog must not reopen it on late replies.
    const result = await current.submission;
    if (!isCurrent()) return;
    useArcadeResultsStore.setState({
      status: "loading",
      saveWarning: result?.saved ? "" : "Your score could not be confirmed saved. These are the server’s recorded scores.",
    });
    const entries = await current.scoreClient.leaderboard(current.machineId, { signal: controller.signal });
    if (isCurrent()) useArcadeResultsStore.setState({ entries, status: "ready" });
  } catch {
    if (isCurrent()) useArcadeResultsStore.setState({ status: "error" });
  }
}
