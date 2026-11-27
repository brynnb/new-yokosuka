// Export the assembled model hierarchy, never cameras, lights, sky, or
// hidden world-state alternatives. Standalone inspection uses the same rule.
export function viewerExportNodes(roots) {
  const selected = new Set();
  for (const root of roots) {
    if (!root.isEnabled()) continue;
    for (const node of [root, ...root.getDescendants(false)]) {
      if (!node.isEnabled()) continue;
      if (node.getTotalVertices?.() > 0 && (node.isVisible === false || node.visibility === 0)) continue;
      selected.add(node);
    }
  }
  return selected;
}
