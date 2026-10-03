import assert from "node:assert/strict";
import test from "node:test";

import {
  closeInventory,
  configureInventoryUi,
  openInventory,
  refreshCollection,
  useInventoryStore,
} from "../play/ui/react/inventoryStore.js";

test("inventory opens and closes with lifecycle callbacks", () => {
  const events = [];
  configureInventoryUi({
    onOpen: () => events.push("open"),
    onClose: () => events.push("close"),
  });
  useInventoryStore.setState({ open: false });

  openInventory();
  openInventory();
  assert.equal(useInventoryStore.getState().open, true);
  closeInventory();
  closeInventory();
  assert.equal(useInventoryStore.getState().open, false);
  assert.deepEqual(events, ["open", "close"]);
});

test('collection timeout can be retried and a late response cannot replace the retry', async t => {
  t.mock.timers.enable({apis: ['setTimeout']});
  closeInventory();
  let oldResolve;
  configureInventoryUi({loadCollection: () => new Promise(resolve => { oldResolve = resolve; })});
  openInventory('collection');
  t.mock.timers.tick(10000);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(useInventoryStore.getState().status, 'error');
  assert.match(useInventoryStore.getState().error, /timed out/);
  configureInventoryUi({loadCollection: async () => []});
  await refreshCollection();
  oldResolve([{key:'late', name:'Late toy', category:'capsule_toy', quantity:1}]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(useInventoryStore.getState().status, 'ready');
  assert.deepEqual(useInventoryStore.getState().items, []);
  closeInventory();
});

test('collection reloads server inventory, excludes ordinary items and ignores cancelled or stale loads', async () => {
  closeInventory();
  const pending = [];
  configureInventoryUi({onOpen() {}, onClose() {}, loadCollection: signal => new Promise((resolve, reject) => pending.push({signal, resolve, reject}))});
  openInventory('collection');
  assert.equal(useInventoryStore.getState().status, 'loading');
  const old = pending[0];
  closeInventory();
  assert.equal(old.signal.aborted, true);
  openInventory('collection');
  old.resolve([{key:'old', name:'Old character toy', category:'capsule_toy', quantity:1}]);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(useInventoryStore.getState().items, []);
  pending[1].resolve([
    {key:'b', name:'Z toy', category:'capsule_toy', quantity:3},
    {key:'a', name:'A toy', category:'capsule_toy', quantity:1},
    {key:'can', name:'Winning Can', category:'collectible', quantity:2},
  ]);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(useInventoryStore.getState().items.map(i => [i.key, i.quantity]), [['a',1],['b',3]]);
  const failed = refreshCollection();
  pending[2].reject(Error('offline'));
  await failed;
  assert.equal(useInventoryStore.getState().error, 'offline');
  const retry = refreshCollection();
  pending[3].resolve([]);
  await retry;
  assert.equal(useInventoryStore.getState().status, 'ready');
  assert.deepEqual(useInventoryStore.getState().items, []);
  closeInventory();
});
