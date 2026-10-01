export function isCharacterRig(nodes, readFourCC) {
  if (nodes.length < 20) return false;
  const rootTag = readFourCC(nodes[0]?.unk1 || 0);
  if (!/^[A-Z0-9]{3}M$/.test(rootTag)) return false;
  const firstModelNode = nodes.find((node) => node.model);
  if (!firstModelNode) return false;
  const firstModelRotX = Math.round(firstModelNode.rot.x / (Math.PI / 2));
  const firstModelRotZ = Math.round(firstModelNode.rot.z / (Math.PI / 2));
  return firstModelRotX === 1 && firstModelRotZ === 1;
}

// One position per authored node, not per UV duplicate. Both baked body
// posing and CPU-solved cloth use this rule without changing topology or UVs.
// The caller owns buffer uploads and any normal policy (linings oppose skin).
export function weldCharacterRigSeamPositions(groups) {
  const positionsByChild = new Map();
  for (const group of groups) {
    const positionByNode = new Map();
    for (const vertex of group) {
      if (!positionsByChild.has(vertex.child)) {
        positionsByChild.set(vertex.child, vertex.child.getVerticesData("position"));
      }
      const positions = positionsByChild.get(vertex.child);
      const offset = vertex.vertexIndex * 3;
      if (!positions || offset + 2 >= positions.length) continue;
      if (!positionByNode.has(vertex.nodeIndex)) {
        positionByNode.set(vertex.nodeIndex, { sum: [0, 0, 0], count: 0 });
      }
      const node = positionByNode.get(vertex.nodeIndex);
      for (let axis = 0; axis < 3; axis++) node.sum[axis] += positions[offset + axis];
      node.count++;
    }
    const nodePositions = [...positionByNode.values()].map(node =>
      node.sum.map(value => value / node.count));
    if (nodePositions.length < 2) continue;
    const blended = [0, 1, 2].map(axis =>
      nodePositions.reduce((sum, point) => sum + point[axis], 0) / nodePositions.length);
    for (const vertex of group) {
      const positions = positionsByChild.get(vertex.child);
      const offset = vertex.vertexIndex * 3;
      if (!positions || offset + 2 >= positions.length) continue;
      for (let axis = 0; axis < 3; axis++) positions[offset + axis] = blended[axis];
    }
  }
  return positionsByChild;
}

export function findCharacterRigSeamGroups(
  vertices,
  epsilon = 1e-5,
  nodeAdjacent = null,
) {
  if (!Array.isArray(vertices) || vertices.length === 0) return [];
  const threshold = Math.max(0, epsilon);
  const parents = vertices.map((_, index) => index);
  const find = (sourceIndex) => {
    let index = sourceIndex;
    let root = index;
    while (parents[root] !== root) root = parents[root];
    while (parents[index] !== index) {
      const next = parents[index];
      parents[index] = root;
      index = next;
    }
    return root;
  };
  const union = (left, right) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot;
  };
  const buckets = new Map();
  const key = (x, y, z) => `${x}:${y}:${z}`;
  for (let right = 0; right < vertices.length; right += 1) {
    const rightPosition = vertices[right].sourcePosition;
    if (threshold === 0) {
      const exactKey = key(...rightPosition);
      for (const left of buckets.get(exactKey) || []) union(left, right);
      const bucket = buckets.get(exactKey) || [];
      bucket.push(right);
      buckets.set(exactKey, bucket);
      continue;
    }
    const cell = rightPosition.map((value) => Math.floor(value / threshold));
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          for (const left of buckets.get(key(
            cell[0] + dx,
            cell[1] + dy,
            cell[2] + dz,
          )) || []) {
            const leftPosition = vertices[left].sourcePosition;
            if (
              Math.abs(leftPosition[0] - rightPosition[0]) <= threshold
              && Math.abs(leftPosition[1] - rightPosition[1]) <= threshold
              && Math.abs(leftPosition[2] - rightPosition[2]) <= threshold
              && Math.hypot(
                leftPosition[0] - rightPosition[0],
                leftPosition[1] - rightPosition[1],
                leftPosition[2] - rightPosition[2],
              ) <= threshold
            ) {
              union(left, right);
            }
          }
        }
      }
    }
    const cellKey = key(...cell);
    const bucket = buckets.get(cellKey) || [];
    bucket.push(right);
    buckets.set(cellKey, bucket);
  }
  const groups = new Map();
  vertices.forEach((vertex, index) => {
    const root = find(index);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(vertex);
  });
  const positionalGroups = [...groups.values()];
  if (typeof nodeAdjacent !== "function") {
    return positionalGroups.filter((group) => (
      new Set(group.map((vertex) => vertex.nodeIndex)).size > 1
    ));
  }

  // Coincident vertices are not necessarily a seam. Mirrored sibling limbs
  // can meet on the model centerline in the bind pose; blending those vertices
  // gives one pant leg the other leg's bone and stretches a triangle between
  // them as soon as the character walks. Split every positional group by the
  // authored parent/child graph, so only body pieces that actually share a
  // hierarchy boundary exchange influences.
  const connectedGroups = [];
  for (const group of positionalGroups) {
    const nodeIndices = [...new Set(group.map((vertex) => vertex.nodeIndex))];
    const componentByNode = new Map();
    let componentIndex = 0;
    for (const start of nodeIndices) {
      if (componentByNode.has(start)) continue;
      componentByNode.set(start, componentIndex);
      const queue = [start];
      while (queue.length > 0) {
        const current = queue.shift();
        for (const candidate of nodeIndices) {
          if (
            componentByNode.has(candidate)
            || !nodeAdjacent(current, candidate)
          ) {
            continue;
          }
          componentByNode.set(candidate, componentIndex);
          queue.push(candidate);
        }
      }
      componentIndex += 1;
    }
    const components = new Map();
    for (const vertex of group) {
      const component = componentByNode.get(vertex.nodeIndex);
      if (!components.has(component)) components.set(component, []);
      components.get(component).push(vertex);
    }
    for (const component of components.values()) {
      if (new Set(component.map((vertex) => vertex.nodeIndex)).size > 1) {
        connectedGroups.push(component);
      }
    }
  }
  return connectedGroups;
}
