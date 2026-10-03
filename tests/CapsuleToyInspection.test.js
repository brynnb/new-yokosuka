import assert from 'node:assert/strict';
import test from 'node:test';
import {CapsuleToyInspection, capsuleReaction} from '../play/interactions/CapsuleToyInspection.js';

const purchase = {itemKey: 'capsule_test', itemName: 'Toy', itemModel: 'G_ITEM_TEST.MT5'};
const flush = () => new Promise(resolve => setImmediate(resolve));

function harness(t) {
  const previousWindow = globalThis.window;
  globalThis.window = new EventTarget();
  t.after(() => { globalThis.window = previousWindow; });
  const element = () => Object.assign(new EventTarget(), {setAttribute() {}, replaceChildren() {this.children = [];},
    append(child) {this.children.push(child);}, children: []});
  const options = element();
  options.ownerDocument = {createElement: () => ({addEventListener(type, listener) {this[type] = listener;}})};
  const dom = {dialogueOverlay: element(), dialogueSpeaker: element(), dialogueSource: element(),
    dialogueJapanese: element(), dialogueOptions: options,
    inspectionControls: element(), inspectionItem: element(), inspectionClose: element(), inspectionCloseKey: element()};
  let updates = 0, disposed = 0;
  const controller = {cameraYaw: 1.2, cameraPitch: 0.3, cameraDistance: 4,
    thirdPersonCameraDistance: 4, firstPerson: false, updateCamera() {updates++;}};
  const originalCamera = {};
  const scene = {activeCamera: originalCamera};
  const inspection = new CapsuleToyInspection({scene, dom, getController: () => controller,
    getBinding: () => 'KeyX'});
  inspection.presenter.audioFactory = () => ({play() {}, pause() {}, removeAttribute() {}, load() {}});
  const abort = new AbortController();
  inspection.begin(abort.signal, {objectTag: 'GCH0'});
  // Geometry is verified by the rendered gameplay test; exercise the real
  // loading/close ownership and shared dialogue/audio lifecycle here.
  inspection.stage = session => {
    session.active = true;
    session.inspectionCamera = {dispose() {disposed++;}};
    scene.activeCamera = session.inspectionCamera;
    controller.cameraYaw = 3;
  };
  t.after(() => inspection.close());
  return {inspection, abort, dom, controller, scene, originalCamera,
    updates: () => updates, disposed: () => disposed};
}

test('original reactions distinguish a new toy from a duplicate', () => {
  assert.equal(capsuleReaction(purchase).id, 'E1066A022');
  assert.equal(capsuleReaction({...purchase, inventory: [{key: purchase.itemKey, quantity: 2}]}).id, 'E1066A019');
});

for (const method of ['key', 'button', 'abort']) {
  test(`inspection ${method} close stops voice and restores camera exactly once`, async t => {
    const h = harness(t);
    h.inspection.load = async () => {};
    h.inspection.prepare(purchase);
    const showing = h.inspection.show(purchase);
    await flush();
    assert.equal(h.inspection.session.active, true);
    assert.ok(h.inspection.presenter.audio);
    if (method === 'key') {
      const key = new Event('keydown', {cancelable: true});
      Object.defineProperty(key, 'code', {value: 'KeyX'});
      window.dispatchEvent(key);
      assert.equal(key.defaultPrevented, true);
    } else if (method === 'button') h.dom.inspectionClose.dispatchEvent(new Event('click'));
    else h.abort.abort();
    await showing;
    h.inspection.close();
    assert.equal(h.inspection.session, null);
    assert.equal(h.inspection.presenter.audio, null);
    assert.equal(h.dom.dialogueOverlay.hidden, true);
    assert.equal(h.dom.inspectionControls.hidden, true);
    assert.equal(h.scene.activeCamera, h.originalCamera);
    assert.equal(h.controller.cameraYaw, 1.2);
    assert.equal(h.updates(), 1);
    assert.equal(h.disposed(), 1);
  });
}

test('closing pending loading does not disturb a newer session when its load settles', async t => {
  const h = harness(t);
  let finish;
  h.inspection.load = () => new Promise(resolve => {finish = resolve;});
  h.inspection.prepare(purchase);
  const oldSession = h.inspection.session;
  const rejected = assert.rejects(h.inspection.show(purchase), {name: 'AbortError'});
  h.abort.abort();
  h.inspection.begin(new AbortController().signal, {objectTag: 'GCH3'});
  const current = h.inspection.session;
  finish();
  await rejected;
  assert.equal(h.inspection.session, current);
  assert.equal(current.active, false);
  assert.throws(() => h.inspection.check(oldSession), {name: 'AbortError'});
  assert.equal(h.updates(), 1);
});

test('a missing model fails explicitly, releases its session, and permits a retry', async t => {
  const h = harness(t);
  h.inspection.prepare({...purchase, itemModel: '../bad'});
  await assert.rejects(h.inspection.show(purchase), /valid toy model/);
  assert.equal(h.inspection.session, null);
  h.inspection.begin(new AbortController().signal, {objectTag: 'GCH0'});
  h.inspection.load = async () => {};
  h.inspection.prepare(purchase);
  const retry = h.inspection.show(purchase);
  await flush();
  assert.equal(h.inspection.session.active, true);
  h.inspection.close();
  await retry;
});

test('a stalled load times out without retaining a camera or dialogue', async t => {
  const h = harness(t);
  t.mock.timers.enable({apis: ['setTimeout']});
  h.inspection.load = () => new Promise(() => {});
  h.inspection.prepare(purchase);
  const rejected = assert.rejects(h.inspection.show(purchase), /timed out/);
  t.mock.timers.tick(20000);
  await rejected;
  assert.equal(h.inspection.session, null);
  assert.equal(h.scene.activeCamera, h.originalCamera);
  assert.equal(h.dom.dialogueOverlay.hidden, true);
});
