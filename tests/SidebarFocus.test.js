import assert from "node:assert/strict";
import test from "node:test";

import { bindSidebarFocusReturn } from "../play/ui/SidebarFocus.js";

function sidebarHarness() {
  const listeners = new Map();
  const blurred = [];
  return {
    blurred,
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    dispatch(type, tagName, { role = null } = {}) {
      const target = {
        blur: () => blurred.push(tagName),
        matches: (selector) => (
          selector === tagName
          || (selector === '[role="combobox"]' && role === "combobox")
        ),
      };
      target.closest = (selector) => (
        selector.split(",").includes(tagName) ? target : null
      );
      listeners.get(type)?.({
        type,
        target,
      });
    },
  };
}

test("sidebar controls return focus to the game after interaction", async () => {
  const sidebar = sidebarHarness();
  let focusCount = 0;
  bindSidebarFocusReturn(sidebar, () => {
    focusCount += 1;
  });

  sidebar.dispatch("change", "input");
  await Promise.resolve();
  sidebar.dispatch("click", "button");
  await Promise.resolve();
  sidebar.dispatch("click", "div");
  await Promise.resolve();

  assert.equal(focusCount, 2);
  assert.deepEqual(sidebar.blurred, ["input", "button"]);
});

test("a control click and change in one task queue only one focus return", async () => {
  const sidebar = sidebarHarness();
  let focusCount = 0;
  bindSidebarFocusReturn(sidebar, () => {
    focusCount += 1;
  });

  sidebar.dispatch("change", "input");
  sidebar.dispatch("click", "input");
  await Promise.resolve();

  assert.equal(focusCount, 1);
});

test("select keeps focus while opening and returns it after a choice", async () => {
  const sidebar = sidebarHarness();
  let focusCount = 0;
  bindSidebarFocusReturn(sidebar, () => {
    focusCount += 1;
  });

  sidebar.dispatch("click", "select");
  await Promise.resolve();
  assert.equal(focusCount, 0);
  assert.deepEqual(sidebar.blurred, []);

  sidebar.dispatch("change", "select");
  await Promise.resolve();
  assert.equal(focusCount, 1);
  assert.deepEqual(sidebar.blurred, ["select"]);
});

test("a Radix Select trigger keeps focus while its menu is open", async () => {
  const sidebar = sidebarHarness();
  let focusCount = 0;
  bindSidebarFocusReturn(sidebar, () => {
    focusCount += 1;
  });

  sidebar.dispatch("click", "button", { role: "combobox" });
  await Promise.resolve();

  assert.equal(focusCount, 0);
  assert.deepEqual(sidebar.blurred, []);
});
