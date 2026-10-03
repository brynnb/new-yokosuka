import { create } from "zustand";

const callbacks = {
  onOpen: () => {},
  onClose: () => {},
  loadCollection: async () => { throw new Error('Collection is unavailable.'); },
};
let request = null;
let generation = 0;

export const useInventoryStore = create(() => ({
  open: false,
  view: 'inventory',
  items: [],
  status: 'idle',
  error: null,
}));

export function configureInventoryUi(nextCallbacks) {
  Object.assign(callbacks, nextCallbacks);
}

export function openInventory(view = 'inventory') {
  const wasOpen = useInventoryStore.getState().open;
  request?.abort();
  generation++;
  useInventoryStore.setState({ open: true, view, items: [], status: 'idle', error: null });
  if (!wasOpen) callbacks.onOpen();
  if (view === 'collection') void refreshCollection();
}

export async function refreshCollection() {
  if (!useInventoryStore.getState().open || useInventoryStore.getState().view !== 'collection') return;
  request?.abort();
  const controller = new AbortController();
  request = controller;
  const current = ++generation;
  useInventoryStore.setState({status: 'loading', error: null});
  const timer = setTimeout(() => controller.abort(new Error('Collection request timed out.')), 10000);
  let onAbort;
  try {
    const inventory = await Promise.race([
      callbacks.loadCollection(controller.signal),
      new Promise((_, reject) => {
        onAbort = () => reject(controller.signal.reason);
        controller.signal.addEventListener('abort', onAbort, {once: true});
      }),
    ]);
    if (!Array.isArray(inventory)) throw new Error('Invalid collection response.');
    const items = inventory.filter(item => item.category === 'capsule_toy');
    if (items.some(item => !item.key || typeof item.name !== 'string'
      || !Number.isSafeInteger(item.quantity) || item.quantity < 1)) throw new Error('Invalid collection item.');
    if (current !== generation || controller.signal.aborted) return;
    useInventoryStore.setState({items: [...items].sort((a, b) => a.name.localeCompare(b.name)), status: 'ready'});
  } catch (error) {
    if (current === generation) useInventoryStore.setState({status: 'error', error: error.message || 'Could not load collection.'});
  } finally {
    clearTimeout(timer);
    controller.signal.removeEventListener('abort', onAbort);
    if (request === controller) request = null;
  }
}

export function closeInventory() {
  if (!useInventoryStore.getState().open) return;
  generation++;
  request?.abort();
  request = null;
  useInventoryStore.setState({ open: false });
  callbacks.onClose();
}
