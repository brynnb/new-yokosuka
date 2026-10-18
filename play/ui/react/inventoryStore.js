import { create } from "zustand";

const callbacks = {
  onOpen: () => {},
  onClose: () => {},
  loadInventory: async () => { throw new Error('Inventory is unavailable.'); },
  readScroll: async () => { throw new Error('Scroll learning is unavailable.'); },
};
let request = null;
let generation = 0;

export const useInventoryStore = create(() => ({
  open: false,
  view: 'inventory',
  items: [],
  status: 'idle',
  error: null,
  readingKey: null,
  readError: null,
}));

export function configureInventoryUi(nextCallbacks) {
  Object.assign(callbacks, nextCallbacks);
}

export function openInventory(view = 'inventory') {
  if(!['inventory','collection'].includes(view))throw new Error('Unknown inventory view.');
  const wasOpen = useInventoryStore.getState().open;
  request?.abort();
  generation++;
  useInventoryStore.setState({ open: true, view, items: [], status: 'idle', error: null, readingKey:null, readError:null });
  if (!wasOpen) callbacks.onOpen();
  void refreshInventory();
}

export function readInventoryScroll(key) {
  const state=useInventoryStore.getState();
  if(!state.open||state.readingKey||!state.items.some(item=>item.key===key&&item.scrollReadable))return;
  return refreshInventory({readKey:key});
}

export async function refreshInventory({readKey=null} = {}) {
  const {open,view}=useInventoryStore.getState();
  if (!open) return;
  request?.abort();
  const controller = new AbortController();
  request = controller;
  const current = ++generation;
  useInventoryStore.setState({status: readKey?'ready':'loading', error: null, readingKey:readKey,readError:null});
  const timer = setTimeout(() => controller.abort(new Error(readKey?'Reading timed out. Retry safely or reopen inventory to check whether it saved.':'Inventory request timed out.')), 10000);
  let onAbort;
  try {
    const inventory = await Promise.race([
      readKey?callbacks.readScroll(readKey,controller.signal):callbacks.loadInventory(controller.signal),
      new Promise((_, reject) => {
        onAbort = () => reject(controller.signal.reason);
        controller.signal.addEventListener('abort', onAbort, {once: true});
      }),
    ]);
    if (!Array.isArray(inventory)) throw new Error('Invalid inventory response.');
    if(inventory.some(item=>!item||typeof item.key!=='string'||!item.key||typeof item.name!=='string'||typeof item.category!=='string'||!Number.isSafeInteger(item.quantity)||item.quantity<1))throw new Error('Invalid inventory item.');
    const items = inventory.filter(item => view === 'collection' ? item.category === 'capsule_toy' : item.category !== 'capsule_toy');
    if (current !== generation || controller.signal.aborted) return;
    useInventoryStore.setState({items: [...items].sort((a, b) => a.name.localeCompare(b.name)), status: 'ready'});
  } catch (error) {
    if (current === generation) useInventoryStore.setState(readKey?
      {readError:error.message||'Could not read scroll.'}:{status: 'error', error: error.message || 'Could not load inventory.'});
  } finally {
    clearTimeout(timer);
    controller.signal.removeEventListener('abort', onAbort);
    if (request === controller) request = null;
    if(current===generation)useInventoryStore.setState({readingKey:null});
  }
}

export function closeInventory() {
  if (!useInventoryStore.getState().open) return;
  generation++;
  request?.abort();
  request = null;
  useInventoryStore.setState({ open: false,readingKey:null,readError:null });
  callbacks.onClose();
}
