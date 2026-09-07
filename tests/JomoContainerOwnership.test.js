import assert from "node:assert/strict";
import test from "node:test";
import {
  containingJomoContainer,
} from "../src/JomoContainerOwnership.js";

const containers = [
  {
    id: "AKD2",
    bounds: {
      min: [-16.874, 0.558, 3.621],
      max: [-16.455, 0.708, 3.921],
    },
  },
  {
    id: "AKD4",
    bounds: {
      min: [-16.874, 0.103, 3.621],
      max: [-16.435, 0.403, 3.921],
    },
  },
];

test("assigns small objects whose centers are inside recovered drawer bounds", () => {
  assert.equal(
    containingJomoContainer(containers, {
      min: [-16.707, 0.568, 3.703],
      max: [-16.630, 0.600, 3.853],
    })?.id,
    "AKD2",
  );
  assert.equal(
    containingJomoContainer(containers, {
      min: [-16.678, 0.275, 3.720],
      max: [-16.663, 0.340, 3.820],
    })?.id,
    "AKD4",
  );
});

test("does not attach furniture-sized or surface objects", () => {
  assert.equal(
    containingJomoContainer(containers, {
      min: [-16.874, 0.558, 3.621],
      max: [-16.455, 0.708, 3.921],
    }),
    null,
  );
  assert.equal(
    containingJomoContainer(containers, {
      min: [-16.548, 0.758, 3.897],
      max: [-16.533, 0.823, 3.997],
    }),
    null,
  );
});
