import assert from "node:assert/strict";
import test from "node:test";

import {
  closeInventory,
  configureInventoryUi,
  openInventory,
  refreshInventory,
  useInventoryStore,
} from "../play/ui/react/inventoryStore.js";

test("inventory opens and closes with lifecycle callbacks", () => {
  const events = [];
  configureInventoryUi({
    onOpen: () => events.push("open"),
    onClose: () => events.push("close"),
    loadInventory: async()=>[],
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
  configureInventoryUi({loadInventory: () => new Promise(resolve => { oldResolve = resolve; })});
  openInventory('collection');
  t.mock.timers.tick(10000);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(useInventoryStore.getState().status, 'error');
  assert.match(useInventoryStore.getState().error, /timed out/);
  configureInventoryUi({loadInventory: async () => []});
  await refreshInventory();
  oldResolve([{key:'late', name:'Late toy', category:'capsule_toy', quantity:1}]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(useInventoryStore.getState().status, 'ready');
  assert.deepEqual(useInventoryStore.getState().items, []);
  closeInventory();
});

test('collection reloads server inventory, excludes ordinary items and ignores cancelled or stale loads', async () => {
  closeInventory();
  const pending = [];
  configureInventoryUi({onOpen() {}, onClose() {}, loadInventory: signal => new Promise((resolve, reject) => pending.push({signal, resolve, reject}))});
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
  const failed = refreshInventory();
  pending[2].reject(Error('offline'));
  await failed;
  assert.equal(useInventoryStore.getState().error, 'offline');
  const retry = refreshInventory();
  pending[3].resolve([]);
  await retry;
  assert.equal(useInventoryStore.getState().status, 'ready');
  assert.deepEqual(useInventoryStore.getState().items, []);
  closeInventory();
});

test('inventory shows actual ordinary/story possessions, not the artwork catalog',async()=>{
  closeInventory();
  configureInventoryUi({loadInventory:async()=>[
    {key:'sword_handguard',name:'Sword Handguard',category:'key_item',quantity:1},
    {key:'winning_can',name:'Winning Can',category:'collectible',quantity:2},
    {key:'toy',name:'Toy',category:'capsule_toy',quantity:1},
  ]});
  openInventory();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(useInventoryStore.getState().status,'ready');
  assert.deepEqual(useInventoryStore.getState().items.map(x=>[x.key,x.quantity]),[['sword_handguard',1],['winning_can',2]]);
  closeInventory();
});

test('changing inventory views aborts the old request and ignores its late possessions',async()=>{
  closeInventory();
  const pending=[];
  configureInventoryUi({loadInventory:signal=>new Promise(resolve=>pending.push({signal,resolve}))});
  openInventory();openInventory('collection');
  assert.equal(pending[0].signal.aborted,true);
  pending[0].resolve([{key:'sword_handguard',name:'Sword Handguard',category:'key_item',quantity:1}]);
  pending[1].resolve([{key:'toy',name:'Toy',category:'capsule_toy',quantity:2}]);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(useInventoryStore.getState().view,'collection');
  assert.deepEqual(useInventoryStore.getState().items.map(x=>x.key),['toy']);
  closeInventory();
});
