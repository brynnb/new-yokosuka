import assert from "node:assert/strict";
import test from "node:test";
import {
  bindCombatMoveWheel,
  combatMoveWheelPixels,
} from "../play/combat/CombatMoveScroll.js";

function scrollList({
  scrollTop = 0,
  scrollHeight = 1000,
  clientHeight = 200,
} = {}) {
  return {
    scrollTop,
    scrollHeight,
    clientHeight,
    listeners: new Map(),
    addEventListener(type, listener, options) {
      this.listeners.set(type, { listener, options });
    },
    removeEventListener(type, listener) {
      if (this.listeners.get(type)?.listener === listener) {
        this.listeners.delete(type);
      }
    },
  };
}

function wheel(deltaY, deltaMode = 0) {
  return {
    deltaY,
    deltaMode,
    prevented: false,
    stopped: false,
    preventDefault() {
      this.prevented = true;
    },
    stopPropagation() {
      this.stopped = true;
    },
  };
}

test("hovered move-list wheel input scrolls locally and cannot zoom camera", () => {
  const list = scrollList({ scrollTop: 100 });
  const dispose = bindCombatMoveWheel(list);
  assert.equal(list.listeners.get("wheel").options.passive, false);

  const down = wheel(75);
  list.listeners.get("wheel").listener(down);
  assert.equal(list.scrollTop, 175);
  assert.equal(down.prevented, true);
  assert.equal(down.stopped, true);

  const pastEnd = wheel(5000);
  list.listeners.get("wheel").listener(pastEnd);
  assert.equal(list.scrollTop, 800);
  assert.equal(pastEnd.stopped, true);

  dispose();
  assert.equal(list.listeners.has("wheel"), false);
});

test("wheel line and page deltas normalize to pixels", () => {
  assert.equal(combatMoveWheelPixels(wheel(2, 1), 300), 32);
  assert.equal(combatMoveWheelPixels(wheel(-1, 2), 300), -300);
});

test("a list without overflow leaves wheel input alone", () => {
  const list = scrollList({ scrollHeight: 200, clientHeight: 200 });
  bindCombatMoveWheel(list);
  const event = wheel(50);
  list.listeners.get("wheel").listener(event);
  assert.equal(list.scrollTop, 0);
  assert.equal(event.prevented, false);
  assert.equal(event.stopped, false);
});
