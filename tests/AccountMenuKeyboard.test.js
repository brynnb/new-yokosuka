import assert from "node:assert/strict";
import test from "node:test";

import {
  findDirectionalControl,
  menuDirectionForKey,
} from "../play/account/AccountMenuKeyboard.js";

function control(left, top, width = 40, height = 30) {
  return {
    getBoundingClientRect: () => ({ left, top, width, height }),
  };
}

test("WASD and arrow keys map to menu directions", () => {
  assert.deepEqual(menuDirectionForKey("w"), [0, -1]);
  assert.deepEqual(menuDirectionForKey("A"), [-1, 0]);
  assert.deepEqual(menuDirectionForKey("s"), [0, 1]);
  assert.deepEqual(menuDirectionForKey("D"), [1, 0]);
  assert.deepEqual(menuDirectionForKey("ArrowUp"), [0, -1]);
  assert.equal(menuDirectionForKey("Enter"), null);
});

test("directional navigation selects the closest control in that direction", () => {
  const current = control(100, 100);
  const above = control(100, 20);
  const below = control(100, 180);
  const left = control(20, 100);
  const right = control(180, 100);
  const controls = [current, above, below, left, right];

  assert.equal(findDirectionalControl(current, controls, [0, -1]), above);
  assert.equal(findDirectionalControl(current, controls, [0, 1]), below);
  assert.equal(findDirectionalControl(current, controls, [-1, 0]), left);
  assert.equal(findDirectionalControl(current, controls, [1, 0]), right);
});

test("directional navigation returns null at an outside edge", () => {
  const current = control(100, 20);
  const below = control(100, 100);

  assert.equal(findDirectionalControl(current, [current, below], [0, -1]), null);
});
