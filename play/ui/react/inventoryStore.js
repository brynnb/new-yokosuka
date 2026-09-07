import { create } from "zustand";

const callbacks = {
  onOpen: () => {},
  onClose: () => {},
};

export const useInventoryStore = create(() => ({
  open: false,
}));

export function configureInventoryUi(nextCallbacks) {
  Object.assign(callbacks, nextCallbacks);
}

export function openInventory() {
  if (useInventoryStore.getState().open) return;
  useInventoryStore.setState({ open: true });
  callbacks.onOpen();
}

export function closeInventory() {
  if (!useInventoryStore.getState().open) return;
  useInventoryStore.setState({ open: false });
  callbacks.onClose();
}
