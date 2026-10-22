// Screen-space order, not world X or spawn order. Behind-camera opponents do
// not masquerade as mirrored targets. At an edge, cycle to the opposite edge.
export function adjacentCombatTarget(candidates, currentId, direction) {
  const ordered = candidates.filter(candidate => (
    !candidate.defeated && candidate.visible && Number.isFinite(candidate.screenX)
  )).sort((a, b) => a.screenX - b.screenX || a.id.localeCompare(b.id));
  if (!ordered.length) return currentId;
  const step = direction === "left" ? -1 : 1;
  const index = ordered.findIndex(candidate => candidate.id === currentId);
  if (index < 0) return ordered[step < 0 ? ordered.length - 1 : 0].id;
  return ordered[(index + step + ordered.length) % ordered.length].id;
}
