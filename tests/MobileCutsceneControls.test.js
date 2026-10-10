import assert from "node:assert/strict";
import test, {after} from "node:test";

// nipplejs installs resize/scroll listeners when imported. Supply an event
// target for that browser boundary; these tests never create a DOM joystick.
const previousWindow = globalThis.window;
globalThis.window = Object.assign(new EventTarget(), {scrollX: 0, scrollY: 0});
const { MobileControls } = await import("../play/ui/MobileControls.js");
after(() => {
  if (previousWindow === undefined) delete globalThis.window;
  else globalThis.window = previousWindow;
});

function harness() {
  const calls = [];
  const controls = new MobileControls({
    dom: {mobileCutsceneForward: new EventTarget(), mobileCutsceneSkip: new EventTarget()},
    mediaQuery: {matches: true, removeEventListener: () => {}},
    getController: () => ({clearTouchMovement: () => calls.push('clear movement')}),
    getArcadeGames: () => ({sendEmulatorInput: (code, pressed) => calls.push([code, pressed])}),
    advanceCutscene: () => calls.push('forward'),
    skipCutscene: () => calls.push('skip'),
  });
  controls.setChatOpen = open => calls.push(['chat', open]);
  return {controls, calls};
}

test('cutscene ownership releases touch inputs and prevents reacquisition until return', () => {
  const {controls, calls} = harness();
  controls.joystick = {destroy: () => calls.push('destroy movement joystick')};
  controls.arcadeJoystick = {destroy: () => calls.push('destroy arcade joystick')};
  controls.arcadeDirectionCodes.add('KeyW');
  controls.forkLiftInput = 1;
  controls.setCutsceneActive(true);
  assert.equal(controls.joystick, null);
  assert.equal(controls.arcadeJoystick, null);
  assert.equal(controls.forkLiftInput, 0);
  assert.deepEqual(calls, ['clear movement', 'destroy movement joystick', ['KeyW', false],
    'destroy arcade joystick', ['chat', false]]);
  controls.setCutsceneActive(true);
  assert.equal(calls.length, 5, 'ownership changes are idempotent');
  // A viewport change may try to recreate controls during loading/playback.
  controls.syncJoystick();
  controls.syncArcadeJoystick(true);
  assert.equal(controls.joystick, null);
  assert.equal(controls.arcadeJoystick, null);
  controls.syncJoystick = () => calls.push('restore movement joystick');
  controls.setCutsceneActive(false);
  controls.setCutsceneActive(false);
  assert.equal(calls.filter(call => call === 'restore movement joystick').length, 1);
});

test('touch skip buttons invoke the shared actions only while the cutscene owns controls', () => {
  const {controls, calls} = harness();
  const click = () => new Event('click', {cancelable: true});
  controls.handleCutsceneForward(click());
  controls.handleCutsceneSkip(click());
  assert.deepEqual(calls, []);
  controls.cutsceneActive = true;
  const forward = click(), skip = click();
  controls.handleCutsceneForward(forward);
  controls.handleCutsceneSkip(skip);
  assert.deepEqual(calls, ['forward', 'skip']);
  assert.equal(forward.defaultPrevented, true);
  assert.equal(skip.defaultPrevented, true);
});

test('cutscene teardown after application disposal cannot recreate touch controls or invoke transport', () => {
  const {controls, calls} = harness();
  controls.cutsceneActive = true;
  controls.dispose();
  calls.length = 0;
  controls.syncJoystick = () => calls.push('restore movement joystick');
  controls.setCutsceneActive(false);
  controls.handleCutsceneForward(new Event('click'));
  controls.handleCutsceneSkip(new Event('click'));
  assert.deepEqual(calls, []);
});
