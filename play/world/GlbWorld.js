export function assetContainerTopLevelNodes(container) {
  const nodes = [
    ...(container.rootNodes || []),
    ...(container.meshes || []),
    ...(container.transformNodes || []),
  ];
  return [...new Set(nodes)].filter((node) => !node.parent);
}
