import { Ray, Vector3, Matrix } from '@babylonjs/core';

// These are viewer safety distances in the same world units as the playable
// character, not reconstructed Dreamcast camera settings.
export function findInteriorViewpoint(roots, entries = [], onReject = () => {}) {
  const mainRoots = roots.filter(root => root.metadata?.assetViewerKind === 'MAPM');
  if (!mainRoots.length) { onReject('no-main-environment'); return null; }
  // A roof over one corner of a whole outdoor map is not enough to call the
  // map an interior. Keep uncertain large environments in overview mode.
  const roomBounds = mainRoots.map(root => root.getHierarchyBoundingVectors(true))
    .filter(({ min, max }) => Vector3.Distance(min, max) <= 60);
  if (!roomBounds.length) { onReject('main-environment-too-large'); return null; }
  const meshes = [...new Set(roots.flatMap(root => [root, ...root.getChildMeshes()]))]
    .filter(mesh => mesh.getTotalVertices?.() > 0 && mesh.isEnabled() && mesh.isVisible);
  for (const mesh of meshes) mesh.computeWorldMatrix(true);
  const hit = (origin, direction, length) => {
    const ray = new Ray(origin, direction, length);
    let distance = Infinity;
    for (const mesh of meshes) {
      const localRay = Ray.Transform(ray, Matrix.Invert(mesh.getWorldMatrix()));
      const result = mesh.intersects(localRay, false);
      if (result.hit) distance = Math.min(distance, result.distance);
    }
    return distance <= length ? distance : Infinity;
  };
  for (const entry of entries) {
    if (!Array.isArray(entry.position) || entry.position.length !== 3
      || !entry.position.every(Number.isFinite) || !Number.isFinite(entry.yaw)) continue;
    const feet = Vector3.FromArray(entry.position);
    if (!roomBounds.some(({ min, max }) => feet.x >= min.x && feet.x <= max.x
      && feet.z >= min.z && feet.z <= max.z && feet.y >= min.y - 1 && feet.y <= max.y)) {
      onReject('outside-main-environment'); continue;
    }
    const above = feet.add(new Vector3(0, 2, 0));
    const floor = hit(above, Vector3.Down(), 4);
    if (!Number.isFinite(floor)) { onReject('no-nearby-floor'); continue; }
    const position = above.add(new Vector3(0, -floor + 1.6, 0));
    if (!Number.isFinite(hit(position, Vector3.Up(), 12))) { onReject('no-nearby-ceiling'); continue; }
    const forward = new Vector3(Math.sin(entry.yaw), 0, Math.cos(entry.yaw));
    // Reject entrances inside a wall or facing straight into one. Do not move
    // the source spawn to arbitrary nearby coordinates to force a match.
    const directions = [forward, forward.scale(-1), new Vector3(forward.z, 0, -forward.x),
      new Vector3(-forward.z, 0, forward.x)];
    if (directions.some(direction => hit(position, direction, 0.3) < 0.3)) {
      onReject('insufficient-eye-clearance'); continue;
    }
    if (hit(position, forward, 2) < 2) { onReject('obstructed-heading'); continue; }
    return { position, target: position.add(forward.scale(2)), source: entry.source };
  }
  return null;
}
