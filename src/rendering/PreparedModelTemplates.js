import * as B from "@babylonjs/core";

const SOURCE_FIELDS = ["addr", "flag", "modelAddr", "rot", "scl", "pos", "child",
  "sibling", "parentAddr", "unk1", "unk2"];
const copy = value => JSON.parse(JSON.stringify(value));

// Preserve native pivots/render keys, not just the final visible mesh transforms.
// Doors keep using DoorInteractions and its source-order rotation conventions.
export function encodeModelTemplate(model, roots, encodeMesh) {
  if (!roots.length) throw new Error(`Empty rigid model: ${model}`);
  return {model, roots: roots.map(root => {
    if (root._mt5CharacterRig) throw new Error(`Character rig is not a rigid template: ${model}`);
    const nodes = [root, ...root.getDescendants(false)];
    const indices = new Map(nodes.map((node, index) => [node, index]));
    return {
      nodes: nodes.map((node, index) => {
        if (node.animations?.length || node.actionManager || node.skeleton || node.morphTargetManager
          || !node.getPivotMatrix().isIdentity()) throw new Error(`Unsupported template node: ${model}:${node.name}`);
        return {name: index === 0 ? model : node.name,
          parent: index === 0 ? null : indices.get(node.parent),
          position: node.position.asArray(), rotation: node.rotation.asArray(),
          quaternion: node.rotationQuaternion?.asArray() || null, scaling: node.scaling.asArray(),
          enabled: node.isEnabled(false), metadata: node.metadata ? copy(node.metadata) : null,
          mesh: node.getTotalVertices?.() > 0 ? encodeMesh(node) : null};
      }),
      sourceNodes: (root._mt5Nodes || []).map(node => ({
        ...copy(Object.fromEntries(SOURCE_FIELDS.filter(key => node[key] !== undefined).map(key => [key, node[key]]))),
        mesh: indices.get(node.mesh),
      })),
    };
  })};
}

export function instantiateModelTemplate(scene, template, createMesh, signal) {
  const roots = [];
  try {
    for (const record of template.roots) {
      const nodes = [];
      for (const [index, part] of record.nodes.entries()) {
        signal?.throwIfAborted();
        if (index === 0 ? part.parent !== null : !Number.isInteger(part.parent) || part.parent < 0 || part.parent >= index) {
          throw new Error(`Invalid template hierarchy: ${template.model}`);
        }
        const node = part.mesh ? createMesh(part.mesh) : new B.TransformNode(part.name, scene);
        nodes.push(node);
        if (index === 0) roots.push(node);
        else node.parent = nodes[part.parent];
        node.name = part.name;
        if (!part.mesh) node.metadata = part.metadata ? copy(part.metadata) : null;
        node.position.copyFromFloats(...part.position);
        node.rotation.copyFromFloats(...part.rotation);
        node.scaling.copyFromFloats(...part.scaling);
        node.rotationQuaternion = part.quaternion ? B.Quaternion.FromArray(part.quaternion) : null;
        node.setEnabled(part.enabled);
      }
      const root = nodes[0];
      if (!root) throw new Error(`Empty template: ${template.model}`);
      root._filename = template.model;
      root._preparedModelTemplate = true;
      root._mt5Nodes = record.sourceNodes.map(source => {
        const mesh = nodes[source.mesh];
        if (!mesh) throw new Error(`Missing template render node: ${template.model}:${source.addr}`);
        const node = {...copy(source), mesh};
        mesh._mt5Node = node;
        return node;
      });
      root._mt5NodesByAddress = new Map(root._mt5Nodes.map(node => [node.addr, node]));
      for (const node of root._mt5Nodes) node._mt5ParentNode = root._mt5NodesByAddress.get(node.parentAddr) || null;
    }
    signal?.throwIfAborted();
    return roots;
  } catch (error) {
    for (const root of roots) root.dispose(false, false);
    throw error;
  }
}
