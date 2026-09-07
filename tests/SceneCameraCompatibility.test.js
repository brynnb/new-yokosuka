import assert from "node:assert/strict";
import test from "node:test";

import {
  configureAssetViewerPointerInput,
  flyingCameraTarget,
  setCameraPosition,
} from "../src/scene.js";

test("sets ArcRotate-style cameras through setPosition", () => {
  let received = null;
  const position = { x: 1, y: 2, z: 3 };
  setCameraPosition({
    setPosition(value) {
      received = value;
    },
  }, position);
  assert.equal(received, position);
});

test("sets standard Babylon cameras through their position vector", () => {
  const target = {
    x: 0,
    y: 0,
    z: 0,
    copyFrom(value) {
      this.x = value.x;
      this.y = value.y;
      this.z = value.z;
    },
  };
  setCameraPosition(
    { position: target },
    { x: 4, y: 5, z: 6 },
  );
  assert.deepEqual(
    { x: target.x, y: target.y, z: target.z },
    { x: 4, y: 5, z: 6 },
  );
});

test("maps Babylon 9 right-drag to asset orbit rotation", () => {
  const mappings = [];
  const pointerInput = {};
  configureAssetViewerPointerInput({
    inputs: { attached: { pointers: pointerInput } },
    movement: {
      input: {
        setInteraction(source, conditions, interaction) {
          mappings.push({ source, conditions, interaction });
        },
      },
    },
  });

  assert.deepEqual(pointerInput.buttons, [0, 2]);
  assert.equal(pointerInput.panningSensibility, 0);
  assert.deepEqual(mappings, [{
    source: "pointer",
    conditions: { button: 2 },
    interaction: "rotate",
  }]);
});

test("preserves the flying camera view when returning to orbit controls", () => {
  const target = flyingCameraTarget({
    position: {
      x: 1,
      y: 2,
      z: 3,
      add(value) {
        return {
          x: this.x + value.x,
          y: this.y + value.y,
          z: this.z + value.z,
        };
      },
    },
    getDirection() {
      return {
        x: 0,
        y: 0,
        z: 1,
        scale(distance) {
          return {
            x: this.x * distance,
            y: this.y * distance,
            z: this.z * distance,
          };
        },
      };
    },
  }, 8);

  assert.deepEqual(target, { x: 1, y: 2, z: 11 });
});
