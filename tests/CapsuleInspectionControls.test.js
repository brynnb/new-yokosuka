import assert from 'node:assert/strict';
import test from 'node:test';
import {CapsuleInspectionControls} from '../play/interactions/CapsuleInspectionControls.js';

const event = (type, data = {}) => Object.assign(new Event(type, {cancelable: true}), data);

test('inspection input rotates without forwarding gameplay input and cleans up on close', () => {
  const input = new EventTarget(), canvas = new EventTarget();
  const dom = {inspectionControls: {}, inspectionItem: {}, inspectionCloseKey: {}, inspectionClose: new EventTarget()};
  let captured = null, closes = 0;
  Object.assign(canvas, {setPointerCapture(id) {captured = id;}, hasPointerCapture(id) {return captured === id;},
    releasePointerCapture() {captured = null;}});
  const rotations = [];
  const controls = new CapsuleInspectionControls({dom, canvas, input, getBinding: () => 'KeyX',
    onRotate: (...args) => rotations.push(args), onClose: () => {closes++; controls.close();}});
  controls.open('NiGHTS 1');
  assert.equal(dom.inspectionControls.hidden, false);
  assert.equal(dom.inspectionCloseKey.textContent, 'X');
  const down = event('keydown', {code: 'KeyD'});
  input.dispatchEvent(down);
  controls.update(0.05);
  assert.equal(down.defaultPrevented, true);
  assert.deepEqual(rotations.pop(), [0.1, 0]);
  input.dispatchEvent(event('keydown', {code: 'KeyA'}));
  controls.update(0.05);
  assert.equal(rotations.length, 0);
  input.dispatchEvent(event('keyup', {code: 'KeyD'}));
  controls.update(0.05);
  assert.deepEqual(rotations.pop(), [-0.1, 0]);
  input.dispatchEvent(new Event('blur'));
  controls.update(0.05);
  assert.equal(rotations.length, 0);
  for (const button of [0, 2]) {
    canvas.dispatchEvent(event('pointerdown', {pointerId: 4, button, clientX: 10, clientY: 20}));
    assert.equal(captured, 4);
    canvas.dispatchEvent(event('pointermove', {pointerId: 4, clientX: 50, clientY: 40}));
    assert.deepEqual(rotations.pop(), [0.4, 0.2]);
    canvas.dispatchEvent(event('pointercancel', {pointerId: 4}));
    assert.equal(captured, null);
  }
  canvas.dispatchEvent(event('pointerdown', {pointerId: 5, button: 0, clientX: 10, clientY: 20}));
  input.dispatchEvent(event('keydown', {code: 'KeyX'}));
  assert.equal(closes, 1);
  assert.equal(captured, null);
  assert.equal(dom.inspectionControls.hidden, true);
  const afterClose = event('keydown', {code: 'KeyA'});
  input.dispatchEvent(afterClose);
  controls.update(0.05);
  assert.equal(afterClose.defaultPrevented, false);
  assert.equal(rotations.length, 0);
  controls.open('Retry');
  dom.inspectionClose.dispatchEvent(new Event('click'));
  assert.equal(closes, 2);
});

test('collection input uses the same turns, both drag buttons, remapped close, and releases capture', () => {
  const input = new EventTarget(), canvas = new EventTarget();
  let captured = null;
  Object.assign(canvas, {setPointerCapture(id) {captured = id;}, hasPointerCapture(id) {return captured === id;},
    releasePointerCapture() {captured = null;}});
  const rotations = [];
  const controls = new CapsuleInspectionControls({canvas, input, getBinding: () => 'KeyQ',
    onRotate: (...args) => rotations.push(args), onClose: () => controls.close()});
  controls.open();
  for (const button of [0, 2]) {
    canvas.dispatchEvent(event('pointerdown', {button, pointerId: 7, clientX: 10, clientY: 20}));
    canvas.dispatchEvent(event('pointermove', {pointerId: 7, clientX: 40, clientY: 10}));
    assert.deepEqual(rotations.pop(), [0.3, -0.1]);
    canvas.dispatchEvent(event('pointerup', {pointerId: 7}));
    assert.equal(captured, null);
  }
  input.dispatchEvent(event('keydown', {code: 'KeyA'}));
  controls.update(0.1);
  assert.deepEqual(rotations.pop(), [-0.2, 0]);
  input.dispatchEvent(event('keydown', {code: 'KeyQ'}));
  controls.update(0.1);
  assert.equal(rotations.length, 0);
  assert.equal(controls.listeners.length, 0);
});
