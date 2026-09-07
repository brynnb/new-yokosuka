import { create } from "zustand";

const callbacks = {
  onOpen: () => {},
  onClose: () => {},
  onReset: () => {},
  onCheckboxChange: () => {},
};

export const useSettingsStore = create(() => ({
  open: false,
  activeTab: "general",
  returnFocus: null,
  syncRevision: 0,
}));

export function configureSettingsUi(nextCallbacks) {
  Object.assign(callbacks, nextCallbacks);
}

export function openSettings(returnFocus = null) {
  if (useSettingsStore.getState().open) return;
  useSettingsStore.setState({ open: true, returnFocus });
  callbacks.onOpen();
}

export function closeSettings() {
  const state = useSettingsStore.getState();
  if (!state.open) return;
  useSettingsStore.setState({ open: false, returnFocus: null });
  callbacks.onClose();
  if (state.returnFocus?.isConnected !== false) {
    state.returnFocus?.focus?.();
  }
}

export function resetSettings(tab = useSettingsStore.getState().activeTab) {
  callbacks.onReset(tab);
  useSettingsStore.setState((state) => ({
    syncRevision: state.syncRevision + 1,
  }));
}

export function settingsCheckboxChanged() {
  callbacks.onCheckboxChange();
}

export function settingsValueChanged() {
  callbacks.onCheckboxChange();
}
