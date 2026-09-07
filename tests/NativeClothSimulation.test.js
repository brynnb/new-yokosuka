import assert from "node:assert/strict";
import test from "node:test";

import { NativeClothSimulation } from "../play/characters/NativeClothSimulation.js";

function lineTopology({ collisionMask = 0xffff } = {}) {
  return {
    rowCount: 3,
    columnCount: 1,
    controlType: -0x47,
    anchorSelectors: [0, 0, 0],
    collisionMask,
    constraints: [
      {
        sourceVertexIndex: 0,
        anchorBinding: 0x10,
        neighbors: {
          rowPrevious: { sourceVertexIndex: -1, restLength: 0 },
          rowNext: { sourceVertexIndex: 1, restLength: 1 },
          columnPrevious: { sourceVertexIndex: -1, restLength: 0 },
          columnNext: { sourceVertexIndex: -1, restLength: 0 },
        },
      },
      {
        sourceVertexIndex: 1,
        anchorBinding: 0,
        neighbors: {
          rowPrevious: { sourceVertexIndex: 0, restLength: 1 },
          rowNext: { sourceVertexIndex: 2, restLength: 1 },
          columnPrevious: { sourceVertexIndex: -1, restLength: 0 },
          columnNext: { sourceVertexIndex: -1, restLength: 0 },
        },
      },
      {
        sourceVertexIndex: 2,
        anchorBinding: 0,
        neighbors: {
          rowPrevious: { sourceVertexIndex: 1, restLength: 1 },
          rowNext: { sourceVertexIndex: -1, restLength: 0 },
          columnPrevious: { sourceVertexIndex: -1, restLength: 0 },
          columnNext: { sourceVertexIndex: -1, restLength: 0 },
        },
      },
    ],
  };
}

function panelTopology() {
  const rows = 2;
  const columns = 3;
  const position = index => [
    (index % columns) - 1,
    index < columns ? 1 : 0,
    0,
  ];
  const length = (left, right) => Math.hypot(
    ...position(left).map((value, axis) => value - position(right)[axis]),
  );
  return {
    rowCount: rows,
    columnCount: columns,
    controlType: -0x47,
    anchorSelectors: [1, 1],
    constraints: Array.from({ length: rows * columns }, (_, index) => {
      const row = Math.floor(index / columns);
      const column = index % columns;
      const neighbor = candidate => candidate < 0 || candidate >= rows * columns
        ? { sourceVertexIndex: -1, restLength: 0 }
        : { sourceVertexIndex: candidate, restLength: length(index, candidate) };
      return {
        sourceVertexIndex: index,
        anchorBinding: row === 0 ? 0x10 : 0,
        neighbors: {
          rowPrevious: neighbor(row === 0 ? -1 : index - columns),
          rowNext: neighbor(row + 1 === rows ? -1 : index + columns),
          columnPrevious: neighbor(column === 0 ? -1 : index - 1),
          columnNext: neighbor(column + 1 === columns ? -1 : index + 1),
        },
      };
    }),
  };
}

function ringTopology() {
  const positions = [
    [1, 1, 0], [0, 1, 1], [-1, 1, 0], [0, 1, -1],
    [1, 0, 0], [0, 0, 1], [-1, 0, 0], [0, 0, -1],
  ];
  const columns = 4;
  const neighbor = (index, candidate) => ({
    sourceVertexIndex: candidate,
    restLength: Math.hypot(
      ...positions[index].map((value, axis) => (
        value - positions[candidate][axis]
      )),
    ),
  });
  return {
    positions,
    topology: {
      rowCount: 2,
      columnCount: columns,
      controlType: -0x46,
      anchorSelectors: [-1, -1],
      collisionMask: 0xffff,
      constraints: positions.map((_, index) => {
        const row = Math.floor(index / columns);
        const column = index % columns;
        return {
          sourceVertexIndex: index,
          anchorBinding: row === 0 ? 0x10 : 0,
          neighbors: {
            rowPrevious: row === 0
              ? { sourceVertexIndex: -1, restLength: 0 }
              : neighbor(index, index - columns),
            rowNext: row === 0
              ? neighbor(index, index + columns)
              : { sourceVertexIndex: -1, restLength: 0 },
            columnPrevious: neighbor(
              index,
              row * columns + (column + columns - 1) % columns,
            ),
            columnNext: neighbor(
              index,
              row * columns + (column + 1) % columns,
            ),
          },
        };
      }),
    },
  };
}

const REST = [[0, 2, 0], [0, 1, 0], [0, 0, 0]];
const REST_AUXILIARY = REST.map(([x, y, z]) => [x + 1, y, z]);
const DOWNWARD = [[0, 0, 0], [0, -0.05, 0], [0, -0.05, 0]];

function rounded(points) {
  return points.map(point => point.map(value => Number(value.toFixed(10))));
}

test("native cloth advances only at the native fixed step", () => {
  const whole = new NativeClothSimulation({
    restPositions: REST,
    restAuxiliaryEndpoints: REST_AUXILIARY,
    topology: lineTopology(),
  });
  const split = new NativeClothSimulation({
    restPositions: REST,
    restAuxiliaryEndpoints: REST_AUXILIARY,
    topology: lineTopology(),
  });
  whole.advance(0, {
    basePositions: REST,
    baseAuxiliaryEndpoints: REST_AUXILIARY,
  });
  split.advance(0, {
    basePositions: REST,
    baseAuxiliaryEndpoints: REST_AUXILIARY,
  });
  const wholeResult = whole.advance(1 / 15, {
    basePositions: REST,
    baseAuxiliaryEndpoints: REST_AUXILIARY,
    rowForces: DOWNWARD,
  });
  split.advance(1 / 60, {
    basePositions: REST,
    baseAuxiliaryEndpoints: REST_AUXILIARY,
    rowForces: DOWNWARD,
  });
  split.advance(1 / 60, {
    basePositions: REST,
    baseAuxiliaryEndpoints: REST_AUXILIARY,
    rowForces: DOWNWARD,
  });
  split.advance(1 / 60, {
    basePositions: REST,
    baseAuxiliaryEndpoints: REST_AUXILIARY,
    rowForces: DOWNWARD,
  });
  const splitResult = split.advance(1 / 60, {
    basePositions: REST,
    baseAuxiliaryEndpoints: REST_AUXILIARY,
    rowForces: DOWNWARD,
  });
  assert.equal(wholeResult.steps, 2);
  assert.deepEqual(rounded(wholeResult.positions), rounded(splitResult.positions));
});

test("native cloth preserves authored anchors and structural lengths", () => {
  const simulation = new NativeClothSimulation({
    restPositions: REST,
    restAuxiliaryEndpoints: REST_AUXILIARY,
    topology: lineTopology(),
  });
  simulation.advance(0, {
    basePositions: REST,
    baseAuxiliaryEndpoints: REST_AUXILIARY,
  });
  const moved = [[1, 2, 0], [1, 1, 0], [1, 0, 0]];
  const movedAuxiliary = REST_AUXILIARY.map(([x, y, z]) => [x + 1, y, z]);
  let result;
  for (let frame = 0; frame < 30; frame += 1) {
    result = simulation.advance(1 / 30, {
      basePositions: moved,
      baseAuxiliaryEndpoints: movedAuxiliary,
      rowForces: DOWNWARD,
    });
  }
  assert.deepEqual(result.positions[0], moved[0]);
  for (let index = 1; index < result.positions.length; index += 1) {
    const previous = result.positions[index - 1];
    const point = result.positions[index];
    assert.ok(Math.abs(Math.hypot(
      point[0] - previous[0],
      point[1] - previous[1],
      point[2] - previous[2],
    ) - 1) < 1e-5);
  }
});

test("native cloth filters and resolves authored body collision masks", () => {
  const run = colliders => {
    const simulation = new NativeClothSimulation({
      restPositions: REST,
      restAuxiliaryEndpoints: REST_AUXILIARY,
      topology: lineTopology({ collisionMask: 0x20 }),
    });
    simulation.advance(0, {
      basePositions: REST,
      baseAuxiliaryEndpoints: REST_AUXILIARY,
    });
    return simulation.advance(1 / 30, {
      basePositions: REST,
      baseAuxiliaryEndpoints: REST_AUXILIARY,
      colliders,
    }).positions[2];
  };
  const filtered = run([
    { center: [0.1, 0, 0], radius: 0.75, collisionMaskBit: 0x10 },
  ]);
  const matched = run([
    { center: [0.1, 0, 0], radius: 0.5, collisionMaskBit: 0x20 },
  ]);
  assert.deepEqual(filtered, [0, 0, 0]);
  const projectedLength = Math.hypot(0.6, -1);
  assert.ok(Math.abs(matched[0] - 0.6 / projectedLength) < 1e-8);
  assert.ok(Math.abs(matched[1] - (1 - 1 / projectedLength)) < 1e-8);
});

test("native cloth treats 0x20 bindings as dynamic native constraints", () => {
  const topology = lineTopology();
  topology.constraints[1].anchorBinding = 0x20;
  const simulation = new NativeClothSimulation({
    restPositions: REST,
    restAuxiliaryEndpoints: REST_AUXILIARY,
    topology,
  });
  const result = simulation.advance(1 / 30, {
    basePositions: REST,
    baseAuxiliaryEndpoints: REST_AUXILIARY,
    rowForces: [[0, 0, 0], [0.1, 0, 0], [0, 0, 0]],
  });
  assert.notDeepEqual(result.positions[1], REST[1]);
});

test("native cloth applies runtime advection per lattice point", () => {
  const simulation = new NativeClothSimulation({
    restPositions: REST,
    restAuxiliaryEndpoints: REST_AUXILIARY,
    topology: lineTopology(),
    damping: [1, 1, 1],
  });
  const result = simulation.advance(1 / 30, {
    basePositions: REST,
    baseAuxiliaryEndpoints: REST_AUXILIARY,
    pointAdvections: [[0, 0, 0], [0.2, 0, 0], [0.4, 0, 0]],
  });
  assert.ok(result.positions[1][0] > 0);
  assert.ok(result.positions[2][0] > result.positions[1][0]);
});

test("native open panels project their selector only in the descending pass", () => {
  const positions = [
    [-1, 1, 0], [0, 1, 0], [1, 1, 0],
    [-1, 0, 0], [0, 0, 0], [1, 0, 0],
  ];
  const auxiliary = positions.map(([x, y, z]) => [x, y, z + 1]);
  const topology = panelTopology();
  topology.anchorSelectors = [2, 2];
  // Like HPJ, the selector is the outer dynamic boundary. Its descending
  // projection has no next-column neighbor, so native preserves the result of
  // the vertical solve and then walks inward. Restarting the ascending pass at
  // the selector incorrectly projects that boundary back from column 1.
  const posed = positions.map(point => [...point]);
  posed[5][0] = 1.6;
  const simulation = new NativeClothSimulation({
    restPositions: positions,
    restAuxiliaryEndpoints: auxiliary,
    topology,
  });
  const result = simulation.advance(1 / 30, {
    basePositions: posed,
    baseAuxiliaryEndpoints: auxiliary,
  });
  assert.ok(Math.abs(result.positions[5][0] - 1.5144957554275265) < 1e-12);
});

test("native measured rings use the executable's distinct two-radius cap", () => {
  const { positions, topology } = ringTopology();
  const auxiliary = positions.map(([x, y, z]) => [x, y + 1, z]);
  const simulation = new NativeClothSimulation({
    restPositions: positions,
    restAuxiliaryEndpoints: auxiliary,
    topology,
    closedRingConstraintProfile: {
      spacingSource: "measured",
      spacingScale: 1,
      measuredMaximumBodyRadiusScale: 2,
    },
  });
  const result = simulation.advance(1 / 30, {
    basePositions: positions,
    baseAuxiliaryEndpoints: auxiliary,
    minimumBodyCollisionRadius: 0.1,
  });
  assert.ok(Math.abs(result.positions[4][0] - Math.SQRT1_2 * 0.2) < 1e-12);
});

test("native cloth transports coherent state across an authored teleport", () => {
  const simulation = new NativeClothSimulation({
    restPositions: REST,
    restAuxiliaryEndpoints: REST_AUXILIARY,
    topology: lineTopology(),
    resetDistance: 0.5,
  });
  simulation.advance(1 / 30, {
    basePositions: REST,
    baseAuxiliaryEndpoints: REST_AUXILIARY,
  });
  const translated = REST.map(([x, y, z]) => [x + 10, y, z]);
  const translatedAuxiliary = REST_AUXILIARY.map(
    ([x, y, z]) => [x + 10, y, z],
  );
  const waiting = simulation.advance(0, {
    basePositions: translated,
    baseAuxiliaryEndpoints: translatedAuxiliary,
  });
  assert.deepEqual(waiting.positions, REST);
  assert.equal(waiting.steps, 0);
  const result = simulation.advance(1 / 30, {
    basePositions: translated,
    baseAuxiliaryEndpoints: translatedAuxiliary,
  });
  assert.deepEqual(result.positions, translated);
  assert.equal(result.reset, false);
});

test("native cloth advances the previous point with its row parent's velocity", () => {
  const simulation = new NativeClothSimulation({
    restPositions: REST,
    restAuxiliaryEndpoints: REST_AUXILIARY,
    topology: lineTopology(),
    damping: 0.5,
    resetDistance: 10,
  });
  simulation.advance(0, {
    basePositions: REST,
    baseAuxiliaryEndpoints: REST_AUXILIARY,
  });
  const moved = REST.map(([x, y, z]) => [x + 1, y, z]);
  const movedAuxiliary = REST_AUXILIARY.map(([x, y, z]) => [x + 1, y, z]);
  const result = simulation.advance(1 / 30, {
    basePositions: moved,
    baseAuxiliaryEndpoints: movedAuxiliary,
  });
  assert.deepEqual(result.positions[0], moved[0]);
  assert.ok(Math.abs(result.positions[1][0] - 0.5527864045000421) < 1e-12);
  assert.ok(Math.abs(result.positions[1][1] - 1.1055728090000843) < 1e-12);
  assert.equal(result.positions[1][2], 0);
});

test("native cloth rebuilds captured surface auxiliary directions", () => {
  const positions = [
    [-1, 1, 0], [0, 1, 0], [1, 1, 0],
    [-1, 0, 0], [0, 0, 0], [1, 0, 0],
  ];
  const auxiliary = positions.map(([x, y, z]) => [x, y, z + 1]);
  const simulation = new NativeClothSimulation({
    restPositions: positions,
    restAuxiliaryEndpoints: auxiliary,
    topology: panelTopology(),
  });
  const result = simulation.advance(1 / 30, {
    basePositions: positions,
    baseAuxiliaryEndpoints: auxiliary,
  });
  assert.deepEqual(
    rounded(simulation.currentAuxiliaryEndpoints().slice(3)),
    auxiliary.slice(3),
  );
  assert.deepEqual(
    result.auxiliaryEndpoints,
    simulation.currentAuxiliaryEndpoints(),
  );
});
