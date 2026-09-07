import * as BABYLON from "@babylonjs/core";

const DEFAULT_OPTIONS = Object.freeze({
  maximumPlaneDistance: 0.005,
  minimumNormalAlignment: 0.999,
  minimumCoverage: 0.85,
  maximumDetailAreaRatio: 0.5,
  minimumTriangleArea: 1e-8,
});

function canonicalNormal(normal) {
  const result = normal.clone().normalize();
  // Canonicalize lexicographically instead of using the largest component.
  // On 45-degree facades tiny float differences can otherwise make adjacent
  // triangles choose opposite signs.
  const firstSignificant = result.asArray().find(
    (component) => Math.abs(component) > 1e-7,
  );
  if (firstSignificant < 0) result.scaleInPlace(-1);
  return result;
}

function dominantAxisForNormal(normal) {
  const components = [Math.abs(normal.x), Math.abs(normal.y), Math.abs(normal.z)];
  const maximum = Math.max(...components);
  // Prefer the first effectively-equal component so a diagonal plane always
  // projects onto the same axes despite source float noise.
  return components.findIndex((component) => maximum - component <= 1e-4);
}

function projectionAxes(normal) {
  const dominant = dominantAxisForNormal(normal);
  return [0, 1, 2].filter((axis) => axis !== dominant);
}

function pointComponents(point) {
  return [point.x, point.y, point.z];
}

function projectTriangle(points, axes) {
  return points.map((point) => {
    const components = pointComponents(point);
    return [components[axes[0]], components[axes[1]]];
  });
}

function signedArea(polygon) {
  let sum = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    sum += current[0] * next[1] - next[0] * current[1];
  }
  return sum * 0.5;
}

function polygonArea(polygon) {
  return Math.abs(signedArea(polygon));
}

function lineIntersection(start, end, clipStart, clipEnd) {
  const segment = [end[0] - start[0], end[1] - start[1]];
  const clip = [
    clipEnd[0] - clipStart[0],
    clipEnd[1] - clipStart[1],
  ];
  const denominator = segment[0] * clip[1] - segment[1] * clip[0];
  if (Math.abs(denominator) <= 1e-12) return [...end];
  const offset = [
    clipStart[0] - start[0],
    clipStart[1] - start[1],
  ];
  const amount = (
    offset[0] * clip[1] - offset[1] * clip[0]
  ) / denominator;
  return [
    start[0] + amount * segment[0],
    start[1] + amount * segment[1],
  ];
}

function clipPolygon(subjectPolygon, rawClipPolygon) {
  let output = [...subjectPolygon];
  const clipPolygonPoints = signedArea(rawClipPolygon) < 0
    ? [...rawClipPolygon].reverse()
    : rawClipPolygon;
  for (
    let clipIndex = 0;
    clipIndex < clipPolygonPoints.length;
    clipIndex += 1
  ) {
    const clipStart = clipPolygonPoints[clipIndex];
    const clipEnd = clipPolygonPoints[
      (clipIndex + 1) % clipPolygonPoints.length
    ];
    const input = output;
    output = [];
    if (input.length === 0) break;
    const inside = (point) => (
      (clipEnd[0] - clipStart[0]) * (point[1] - clipStart[1])
      - (clipEnd[1] - clipStart[1]) * (point[0] - clipStart[0])
    ) >= -1e-9;
    for (let index = 0; index < input.length; index += 1) {
      const current = input[index];
      const previous = input[(index + input.length - 1) % input.length];
      const currentInside = inside(current);
      const previousInside = inside(previous);
      if (currentInside) {
        if (!previousInside) {
          output.push(lineIntersection(
            previous,
            current,
            clipStart,
            clipEnd,
          ));
        }
        output.push(current);
      } else if (previousInside) {
        output.push(lineIntersection(
          previous,
          current,
          clipStart,
          clipEnd,
        ));
      }
    }
  }
  return output;
}

function intersectionArea(left, right) {
  return polygonArea(clipPolygon(left, right));
}

function boundsForPolygon(polygon) {
  const x = polygon.map((point) => point[0]);
  const y = polygon.map((point) => point[1]);
  return {
    minX: Math.min(...x),
    maxX: Math.max(...x),
    minY: Math.min(...y),
    maxY: Math.max(...y),
  };
}

function boundsOverlap(left, right) {
  return (
    left.maxX > right.minX
    && right.maxX > left.minX
    && left.maxY > right.minY
    && right.maxY > left.minY
  );
}

function nodeAddressForMesh(mesh) {
  let current = mesh?.parent || null;
  while (current) {
    if (Number.isInteger(current._mt5Node?.addr)) {
      return current._mt5Node.addr;
    }
    current = current.parent || null;
  }
  return null;
}

function textureIdForMesh(mesh) {
  const match = /^mt5_tex_(\d+)$/.exec(mesh?.name || "");
  return match ? Number.parseInt(match[1], 10) : null;
}

function normalBucket(normal) {
  const precision = 200;
  return [normal.x, normal.y, normal.z]
    .map((value) => Math.round(value * precision))
    .join(":");
}

export function collectMt5Triangles(scene, options = {}) {
  const settings = { ...DEFAULT_OPTIONS, ...options };
  const triangles = [];
  let drawOrder = 0;
  for (const mesh of scene.meshes) {
    const nodeAddress = nodeAddressForMesh(mesh);
    const textureId = textureIdForMesh(mesh);
    const positions = mesh.getVerticesData?.(
      BABYLON.VertexBuffer.PositionKind,
    );
    const indices = mesh.getIndices?.();
    if (
      !Number.isInteger(nodeAddress)
      || !Number.isInteger(textureId)
      || !positions
      || !indices
    ) {
      continue;
    }
    mesh.computeWorldMatrix(true);
    const worldMatrix = mesh.getWorldMatrix();
    for (let faceId = 0; faceId < indices.length / 3; faceId += 1) {
      const points = [0, 1, 2].map((corner) => (
        BABYLON.Vector3.TransformCoordinates(
          BABYLON.Vector3.FromArray(
            positions,
            indices[faceId * 3 + corner] * 3,
          ),
          worldMatrix,
        )
      ));
      const cross = BABYLON.Vector3.Cross(
        points[1].subtract(points[0]),
        points[2].subtract(points[0]),
      );
      const worldArea = cross.length() * 0.5;
      if (worldArea <= settings.minimumTriangleArea) continue;
      const normal = canonicalNormal(cross);
      const axes = projectionAxes(normal);
      const projected = projectTriangle(points, axes);
      const area = polygonArea(projected);
      if (area <= settings.minimumTriangleArea) continue;
      const meshKey = `${nodeAddress}:${textureId}`;
      triangles.push({
        id: triangles.length,
        mesh,
        meshKey,
        nodeAddress,
        textureId,
        faceId,
        points,
        normal,
        plane: BABYLON.Vector3.Dot(normal, points[0]),
        projected,
        area,
        bounds: boundsForPolygon(projected),
        normalBucket: normalBucket(normal),
        drawOrder: drawOrder++,
      });
    }
  }
  return triangles;
}

function addCoverage(coverage, detail, base, area, planeDistance) {
  if (!coverage.has(detail.id)) coverage.set(detail.id, new Map());
  const byMesh = coverage.get(detail.id);
  const record = byMesh.get(base.meshKey) || {
    area: 0,
    baseTriangles: new Map(),
    planeDistance: 0,
    baseDrawOrder: base.drawOrder,
  };
  record.area += area;
  record.baseTriangles.set(base.id, base.area);
  record.planeDistance = Math.max(record.planeDistance, planeDistance);
  record.baseDrawOrder = Math.max(record.baseDrawOrder, base.drawOrder);
  byMesh.set(base.meshKey, record);
}

export function overlayRanksForEdges(meshKeys, rawEdges) {
  const nodes = [...new Set(meshKeys)].sort();
  const nodeSet = new Set(nodes);
  const adjacency = new Map(nodes.map((node) => [node, new Set()]));
  const reverseAdjacency = new Map(nodes.map((node) => [node, new Set()]));
  for (const [base, overlay] of rawEdges) {
    if (!nodeSet.has(base) || !nodeSet.has(overlay) || base === overlay) {
      continue;
    }
    adjacency.get(base).add(overlay);
    reverseAdjacency.get(overlay).add(base);
  }

  // Collapse contradictory overlay relationships before finding the longest
  // layer chain. Repeated relaxation on a cyclic graph makes ranks grow once
  // per pass and turns a one-layer decal into an enormous polygon offset.
  const visited = new Set();
  const finishOrder = [];
  for (const start of nodes) {
    if (visited.has(start)) continue;
    visited.add(start);
    const stack = [[start, 0, [...adjacency.get(start)].sort()]];
    while (stack.length > 0) {
      const frame = stack[stack.length - 1];
      const next = frame[2][frame[1]++];
      if (next !== undefined) {
        if (visited.has(next)) continue;
        visited.add(next);
        stack.push([next, 0, [...adjacency.get(next)].sort()]);
        continue;
      }
      finishOrder.push(frame[0]);
      stack.pop();
    }
  }

  const componentForNode = new Map();
  const components = [];
  for (let index = finishOrder.length - 1; index >= 0; index -= 1) {
    const start = finishOrder[index];
    if (componentForNode.has(start)) continue;
    const componentIndex = components.length;
    const component = [];
    const stack = [start];
    componentForNode.set(start, componentIndex);
    while (stack.length > 0) {
      const node = stack.pop();
      component.push(node);
      for (const previous of reverseAdjacency.get(node)) {
        if (componentForNode.has(previous)) continue;
        componentForNode.set(previous, componentIndex);
        stack.push(previous);
      }
    }
    components.push(component.sort());
  }

  const componentEdges = new Map(
    components.map((_, index) => [index, new Set()]),
  );
  const incomingCounts = new Array(components.length).fill(0);
  for (const [base, overlays] of adjacency) {
    const baseComponent = componentForNode.get(base);
    for (const overlay of overlays) {
      const overlayComponent = componentForNode.get(overlay);
      if (
        baseComponent === overlayComponent
        || componentEdges.get(baseComponent).has(overlayComponent)
      ) {
        continue;
      }
      componentEdges.get(baseComponent).add(overlayComponent);
      incomingCounts[overlayComponent] += 1;
    }
  }

  const componentRanks = new Array(components.length).fill(0);
  const ready = incomingCounts
    .map((count, index) => ({ count, index }))
    .filter(({ count }) => count === 0)
    .map(({ index }) => index)
    .sort((left, right) => (
      components[left][0].localeCompare(components[right][0])
    ));
  while (ready.length > 0) {
    const component = ready.shift();
    for (const overlay of componentEdges.get(component)) {
      componentRanks[overlay] = Math.max(
        componentRanks[overlay],
        componentRanks[component] + 1,
      );
      incomingCounts[overlay] -= 1;
      if (incomingCounts[overlay] === 0) {
        ready.push(overlay);
        ready.sort((left, right) => (
          components[left][0].localeCompare(components[right][0])
        ));
      }
    }
  }

  return new Map(nodes.map((node) => [
    node,
    componentRanks[componentForNode.get(node)],
  ]));
}

export function detectMt5OverlayFaces(scene, options = {}) {
  const settings = { ...DEFAULT_OPTIONS, ...options };
  const triangles = collectMt5Triangles(scene, settings);
  const byNormal = new Map();
  for (const triangle of triangles) {
    if (!byNormal.has(triangle.normalBucket)) {
      byNormal.set(triangle.normalBucket, []);
    }
    byNormal.get(triangle.normalBucket).push(triangle);
  }

  const coverage = new Map();
  for (const normalGroup of byNormal.values()) {
    normalGroup.sort((left, right) => left.bounds.minX - right.bounds.minX);
    for (let leftIndex = 0; leftIndex < normalGroup.length; leftIndex += 1) {
      const left = normalGroup[leftIndex];
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < normalGroup.length;
        rightIndex += 1
      ) {
        const right = normalGroup[rightIndex];
        if (right.bounds.minX >= left.bounds.maxX) break;
        if (left.meshKey === right.meshKey) continue;
        if (!boundsOverlap(left.bounds, right.bounds)) continue;
        const alignment = BABYLON.Vector3.Dot(left.normal, right.normal);
        if (alignment < settings.minimumNormalAlignment) continue;
        const planeDistance = Math.abs(left.plane - right.plane);
        if (planeDistance > settings.maximumPlaneDistance) continue;
        const overlapArea = intersectionArea(
          left.projected,
          right.projected,
        );
        if (overlapArea <= settings.minimumTriangleArea) continue;
        addCoverage(coverage, left, right, overlapArea, planeDistance);
        addCoverage(coverage, right, left, overlapArea, planeDistance);
      }
    }
  }

  const selected = [];
  const edgePairs = new Set();
  for (const triangle of triangles) {
    const candidates = coverage.get(triangle.id);
    if (!candidates) continue;
    let best = null;
    for (const [baseMeshKey, candidate] of candidates) {
      const covered = Math.min(1, candidate.area / triangle.area);
      const baseArea = [...candidate.baseTriangles.values()].reduce(
        (sum, area) => sum + area,
        0,
      );
      const areaRatio = triangle.area / Math.max(baseArea, 1e-12);
      const isContainedDetail = (
        covered >= settings.minimumCoverage
        && areaRatio <= settings.maximumDetailAreaRatio
      );
      const isEqualLayerDrawnLater = (
        covered >= 0.98
        && areaRatio >= 0.8
        && areaRatio <= 1.25
        && triangle.drawOrder > candidate.baseDrawOrder
      );
      if (!isContainedDetail && !isEqualLayerDrawnLater) continue;
      const score = covered / Math.max(areaRatio, 1e-6);
      if (!best || score > best.score) {
        best = {
          baseMeshKey,
          covered,
          areaRatio,
          planeDistance: candidate.planeDistance,
          score,
        };
      }
    }
    if (!best) continue;
    selected.push({ triangle, ...best });
    edgePairs.add(`${best.baseMeshKey}>${triangle.meshKey}`);
  }

  const edges = [...edgePairs].map((edge) => edge.split(">"));
  const ranks = overlayRanksForEdges(
    triangles.map((triangle) => triangle.meshKey),
    edges,
  );

  const grouped = new Map();
  for (const item of selected) {
    const { triangle } = item;
    const rank = Math.max(1, ranks.get(triangle.meshKey) || 1);
    const key = `${triangle.nodeAddress}:${triangle.textureId}:${rank}`;
    const group = grouped.get(key) || {
      nodeAddress: triangle.nodeAddress,
      textureId: triangle.textureId,
      rank,
      faceIds: [],
      minimumCoverage: 1,
      maximumPlaneDistance: 0,
    };
    group.faceIds.push(triangle.faceId);
    group.minimumCoverage = Math.min(group.minimumCoverage, item.covered);
    group.maximumPlaneDistance = Math.max(
      group.maximumPlaneDistance,
      item.planeDistance,
    );
    grouped.set(key, group);
  }

  return {
    triangleCount: triangles.length,
    overlays: [...grouped.values()]
      .map((group) => ({
        ...group,
        faceIds: [...new Set(group.faceIds)].sort((left, right) => left - right),
        minimumCoverage: Number(group.minimumCoverage.toFixed(6)),
        maximumPlaneDistance: Number(
          group.maximumPlaneDistance.toFixed(6),
        ),
      }))
      .sort((left, right) => (
        left.nodeAddress - right.nodeAddress
        || left.textureId - right.textureId
        || left.rank - right.rank
      )),
  };
}
