const CONTROL_VERTEX_STRIDE = 3;
const MAX_NATIVE_ROWS = 9;
const MAX_NATIVE_COLUMNS = 20;
const NATIVE_ROW_THRESHOLDS = Object.freeze([0.05, 0.03]);

function finitePosition(position, index) {
  if (
    !Array.isArray(position)
    && !(position instanceof Float32Array)
    && !(position instanceof Float64Array)
  ) {
    throw new TypeError(`native cloth position ${index} is not an array`);
  }
  if (
    position.length < CONTROL_VERTEX_STRIDE
    || !Number.isFinite(position[0])
    || !Number.isFinite(position[1])
    || !Number.isFinite(position[2])
  ) {
    throw new TypeError(`native cloth position ${index} is not finite`);
  }
  return Object.freeze([
    Number(position[0]),
    Number(position[1]),
    Number(position[2]),
  ]);
}

function normalizePositions(positions, label) {
  if (!Array.isArray(positions) || positions.length === 0) {
    throw new TypeError(`native cloth ${label} positions are empty`);
  }
  return positions.map(finitePosition);
}

function distanceSquared(left, right) {
  const x = left[0] - right[0];
  const y = left[1] - right[1];
  const z = left[2] - right[2];
  return x * x + y * y + z * z;
}

function sourceIndexTie(left, right) {
  return left - right;
}

function clusterRowsByThreshold(positions, threshold) {
  const sorted = positions.map((_, index) => index).sort((left, right) => (
    positions[right][1] - positions[left][1]
    || sourceIndexTie(left, right)
  ));
  const rows = [[]];
  for (const index of sorted) {
    const row = rows.at(-1);
    const previous = row.at(-1);
    if (
      previous !== undefined
      && positions[previous][1] - positions[index][1] > threshold
    ) {
      rows.push([]);
    }
    rows.at(-1).push(index);
  }
  const columns = rows[0].length;
  if (
    rows.length > MAX_NATIVE_ROWS
    || columns > MAX_NATIVE_COLUMNS
    || rows.some(row => row.length !== columns)
  ) {
    return null;
  }
  return rows;
}

function candidateFactorRows(positions) {
  const count = positions.length;
  const sorted = positions.map((_, index) => index).sort((left, right) => (
    positions[right][1] - positions[left][1]
    || sourceIndexTie(left, right)
  ));
  const candidates = [];
  for (let rows = 1; rows <= MAX_NATIVE_ROWS; rows += 1) {
    if (count % rows !== 0) continue;
    const columns = count / rows;
    if (columns > MAX_NATIVE_COLUMNS) continue;
    let withinSpread = 0;
    let boundaryGap = 0;
    for (let row = 0; row < rows; row += 1) {
      const begin = row * columns;
      const end = begin + columns - 1;
      withinSpread += (
        positions[sorted[begin]][1] - positions[sorted[end]][1]
      );
      if (row + 1 < rows) {
        boundaryGap += (
          positions[sorted[end]][1]
          - positions[sorted[end + 1]][1]
        );
      }
    }
    candidates.push({
      rows,
      columns,
      sorted,
      score: boundaryGap / Math.max(withinSpread, 1e-9),
    });
  }
  candidates.sort((left, right) => (
    right.score - left.score
    || right.rows - left.rows
  ));
  const best = candidates[0];
  if (!best || best.rows < 2 || best.columns < 2) {
    throw new Error(
      `native cloth ${count}-point surface is not a rectangular lattice`,
    );
  }
  return Array.from({ length: best.rows }, (_, row) => (
    best.sorted.slice(row * best.columns, (row + 1) * best.columns)
  ));
}

function orderRow(positions, row, previousRow = null) {
  const remaining = new Set(row);
  let current = row.reduce((best, index) => {
    if (best === null) return index;
    const deltaX = positions[index][0] - positions[best][0];
    if (deltaX > 0) return index;
    if (deltaX < 0) return best;
    const deltaZ = positions[best][2] - positions[index][2];
    if (deltaZ > 0) return index;
    if (deltaZ < 0) return best;
    return Math.min(best, index);
  }, null);
  const ordered = [];
  while (current !== null) {
    ordered.push(current);
    remaining.delete(current);
    let nearest = null;
    let nearestDistance = Infinity;
    for (const candidate of remaining) {
      const candidateDistance = distanceSquared(
        positions[current],
        positions[candidate],
      );
      if (
        candidateDistance < nearestDistance
        || (
          candidateDistance === nearestDistance
          && (nearest === null || candidate < nearest)
        )
      ) {
        nearest = candidate;
        nearestDistance = candidateDistance;
      }
    }
    current = nearest;
  }
  if (previousRow === null || ordered.length < 3) return ordered;
  const reversed = [ordered[0], ...ordered.slice(1).reverse()];
  const alignment = candidate => candidate.reduce((total, index, column) => (
    total + distanceSquared(positions[index], positions[previousRow[column]])
  ), 0);
  return alignment(reversed) < alignment(ordered) ? reversed : ordered;
}

function inferRows(positions) {
  for (const threshold of NATIVE_ROW_THRESHOLDS) {
    const rows = clusterRowsByThreshold(positions, threshold);
    if (rows) return rows;
  }
  return candidateFactorRows(positions);
}

function nearestRenderVertex(controlPosition, renderPositions) {
  let nearest = 0;
  let nearestDistance = distanceSquared(controlPosition, renderPositions[0]);
  for (let index = 1; index < renderPositions.length; index += 1) {
    const candidateDistance = distanceSquared(
      controlPosition,
      renderPositions[index],
    );
    if (candidateDistance < nearestDistance) {
      nearest = index;
      nearestDistance = candidateDistance;
    }
  }
  return nearest;
}

function anchorSelector(value, columns, controlType) {
  switch (value) {
    case 0xfb:
      if (controlType === -0x49) return 1;
      if (controlType === -0x4a) return columns - 1;
      break;
    case 0xfc:
      return controlType === -0x46 ? 6 : Math.floor(columns / 2);
    case 0xfd:
      if (controlType === -0x49) return 0;
      if (controlType === -0x4a) return 3;
      break;
    case 0xfe:
      return Math.floor(columns / 2);
    case 0xff:
      return columns - 1;
    default:
      return value;
  }
  throw new Error(
    `native cloth anchor selector 0x${value.toString(16)} `
    + `does not support control type ${controlType}`,
  );
}

function anchorBindings(layout, rows, columns, controlType) {
  const bindings = new Uint8Array(rows * columns);
  bindings.fill(0);
  bindings.fill(0x10, 0, columns);
  const bind = (row, column, controller) => {
    if (row < 0 || row >= rows || column < 0 || column >= columns) return;
    bindings[row * columns + column] = 0x20 | (controller & 0x1f);
  };

  switch (layout) {
    case 0:
      break;
    case 1:
      for (let row = 1; row < rows; row += 1) bind(row, 0, row - 1);
      break;
    case 2:
      for (let row = 1; row < rows; row += 1) {
        bind(row, columns - 1, row - 1);
      }
      break;
    case 3:
      for (let row = 1, controller = 0; row < 5; row += 2) {
        bind(row, 0, controller);
        bind(row, columns - 1, controller + 1);
        bind(row + 1, 0, controller + 2);
        bind(row + 1, columns - 1, controller + 3);
        controller += 4;
      }
      break;
    case 4:
      for (let row = 1; row < rows - 1; row += 1) {
        bind(row, columns - 1, row - 1);
      }
      break;
    case 5:
      for (let row = 1; row < rows; row += 1) {
        if (controlType === -0x4a) bind(row, 3, row);
        if (controlType === -0x49) bind(row, 0, row);
      }
      break;
    case 6:
      for (let row = 1; row < rows; row += 1) {
        if (controlType === -0x4a) bind(row, columns - 1, row);
        if (controlType === -0x49) bind(row, 0, row);
      }
      break;
    case 7:
      if (controlType !== -0x46) {
        for (let row = 1; row < rows; row += 1) {
          bind(row, columns - 1, row - 1);
        }
      }
      break;
    case 8:
      if (controlType === -0x4a || controlType === -0x49) {
        bind(1, 0, 0);
        bind(1, columns - 1, 1);
        bind(2, 0, 2);
        bind(2, columns - 1, 3);
      } else {
        for (let row = 1; row < rows - 1; row += 1) {
          bind(row, columns - 1, row + 4);
        }
      }
      break;
    default:
      throw new Error(`unsupported native cloth anchor layout ${layout}`);
  }
  return Object.freeze([...bindings]);
}

function nativeCollisionMask(controlType) {
  if (controlType === -0x4e) return 0xc000;
  if (controlType === -0x4d || controlType === -0x4c) return 0x1800;
  if (controlType === -0x4b) return 0x0010;
  return 0xffff;
}

function hasClosedColumns(positions, rows) {
  return rows.every(row => {
    const adjacent = [];
    for (let column = 1; column < row.length; column += 1) {
      adjacent.push(Math.sqrt(distanceSquared(
        positions[row[column - 1]],
        positions[row[column]],
      )));
    }
    const seam = Math.sqrt(distanceSquared(
      positions[row[0]],
      positions[row.at(-1)],
    ));
    return seam <= Math.max(...adjacent) * 1.5;
  });
}

export function buildNativeClothTopology({
  controlPositions,
  renderPositions = null,
  rawControlBytes,
  controlType,
}) {
  const control = normalizePositions(controlPositions, "control");
  const render = renderPositions === null
    ? null
    : normalizePositions(renderPositions, "render");
  if (render && render.length !== control.length) {
    throw new Error("native cloth control/render vertex counts differ");
  }
  if (!Array.isArray(rawControlBytes) || rawControlBytes.length !== 8) {
    throw new TypeError("native cloth profile must contain eight control bytes");
  }

  const rows = [];
  for (const row of inferRows(control)) {
    rows.push(orderRow(control, row, rows.at(-1) || null));
  }
  const rowCount = rows.length;
  const columnCount = rows[0].length;
  const closedColumns = hasClosedColumns(control, rows);
  const sourceVertexOrder = Object.freeze(rows.flat());
  const constraints = sourceVertexOrder.map((sourceVertexIndex, index) => {
    const row = Math.floor(index / columnCount);
    const column = index % columnCount;
    const neighbor = (neighborRow, neighborColumn) => {
      let resolvedColumn = neighborColumn;
      if (closedColumns && neighborColumn < 0) resolvedColumn = columnCount - 1;
      if (closedColumns && neighborColumn >= columnCount) resolvedColumn = 0;
      if (
        neighborRow < 0
        || neighborRow >= rowCount
        || resolvedColumn < 0
        || resolvedColumn >= columnCount
      ) {
        return Object.freeze({ sourceVertexIndex: -1, restLength: 0 });
      }
      const neighborSource = rows[neighborRow][resolvedColumn];
      return Object.freeze({
        sourceVertexIndex: neighborSource,
        restLength: Math.sqrt(distanceSquared(
          control[sourceVertexIndex],
          control[neighborSource],
        )),
      });
    };
    return Object.freeze({
      latticeIndex: index,
      sourceVertexIndex,
      neighbors: Object.freeze({
        rowPrevious: neighbor(row - 1, column),
        rowNext: neighbor(row + 1, column),
        columnPrevious: neighbor(row, column - 1),
        columnNext: neighbor(row, column + 1),
      }),
    });
  });
  const bindings = anchorBindings(
    rawControlBytes[0],
    rowCount,
    columnCount,
    controlType,
  );
  const anchorSelectors = Object.freeze(Array.from(
    { length: rowCount },
    () => anchorSelector(rawControlBytes[1], columnCount, controlType),
  ));
  const latticeToRenderVertexMap = render === null
    ? null
    : Object.freeze(sourceVertexOrder.map(sourceIndex => (
      nearestRenderVertex(control[sourceIndex], render)
    )));

  return Object.freeze({
    controlType,
    rowCount,
    columnCount,
    closedColumns,
    sourceVertexOrder,
    constraints: Object.freeze(constraints.map((constraint, index) => (
      Object.freeze({ ...constraint, anchorBinding: bindings[index] })
    ))),
    anchorBindings: bindings,
    anchorSelectors,
    collisionMask: nativeCollisionMask(controlType),
    latticeToRenderVertexMap,
  });
}

export const NATIVE_CLOTH_TOPOLOGY_LIMITS = Object.freeze({
  maximumRows: MAX_NATIVE_ROWS,
  maximumColumns: MAX_NATIVE_COLUMNS,
  rowThresholds: NATIVE_ROW_THRESHOLDS,
});
