import * as BABYLON from "@babylonjs/core";

export const CINEMA_SEAT_NAME_PATTERN = /^Seat(?:\.\d+)?$/;
export const CINEMA_SEAT_REFERENCE_NAME = "Seat.005";
export const CINEMA_SEAT_YAW_OFFSET = -Math.PI / 4;
export const CINEMA_SEAT_VERTICAL_OFFSET = -0.22;
export const CINEMA_SEAT_EXIT_DISTANCE = 0.6;
export const CINEMA_SEAT_EXIT_CLEARANCE = 0.1;
export const CINEMA_SEAT_FACE_IDS = Object.freeze([
  604,
  605,
  606,
  607,
  608,
  609,
  610,
  611,
]);

function seatVertexIndices(mesh, faceIds) {
  const indices = mesh.getIndices?.();
  if (!indices?.length) return [];
  const result = new Set();
  for (const faceId of faceIds) {
    const offset = faceId * 3;
    if (offset + 2 >= indices.length) continue;
    result.add(indices[offset]);
    result.add(indices[offset + 1]);
    result.add(indices[offset + 2]);
  }
  return [...result];
}

export function cinemaSeatSurfaceCenter(
  mesh,
  faceIds = CINEMA_SEAT_FACE_IDS,
) {
  const positions = mesh.getVerticesData?.(
    BABYLON.VertexBuffer.PositionKind,
  );
  const vertexIndices = seatVertexIndices(mesh, faceIds);
  if (!positions?.length || vertexIndices.length === 0) return null;

  mesh.computeWorldMatrix?.(true);
  const worldMatrix = mesh.getWorldMatrix?.();
  if (!worldMatrix) return null;
  const center = BABYLON.Vector3.Zero();
  let count = 0;
  for (const vertexIndex of vertexIndices) {
    const offset = vertexIndex * 3;
    if (offset + 2 >= positions.length) continue;
    center.addInPlace(BABYLON.Vector3.TransformCoordinates(
      BABYLON.Vector3.FromArray(positions, offset),
      worldMatrix,
    ));
    count += 1;
  }
  return count > 0 ? center.scaleInPlace(1 / count) : null;
}

function findNamedMesh(roots, name) {
  for (const root of roots) {
    for (const node of [root, ...root.getDescendants(false)]) {
      if (node.name === name) return node;
    }
  }
  return null;
}

function cinemaSeatMeshes(roots) {
  const result = [];
  const seen = new Set();
  for (const root of roots) {
    for (const node of [root, ...root.getDescendants(false)]) {
      if (
        seen.has(node)
        || !CINEMA_SEAT_NAME_PATTERN.test(node.name || "")
        || typeof node.getTotalVertices !== "function"
        || node.getTotalVertices() <= 0
      ) continue;
      seen.add(node);
      result.push(node);
    }
  }
  return result;
}

export function cinemaSeatEntries(roots) {
  const screen = findNamedMesh(roots, "Screen");
  const screenPosition = screen?.getAbsolutePosition?.() || null;
  const seats = cinemaSeatMeshes(roots).flatMap((mesh) => {
    const surfacePosition = cinemaSeatSurfaceCenter(mesh);
    if (!surfacePosition) return [];
    const minimumWorldY = mesh.getBoundingInfo?.().boundingBox.minimumWorld.y;
    // The animation is authored relative to Ryo's standing origin. Keep that
    // origin on the chair's supporting tier while using the selected cushion
    // faces for the exact horizontal placement; putting the actor origin on
    // top of the cushion would make the seated pose float above it.
    const position = surfacePosition.clone();
    if (Number.isFinite(minimumWorldY)) {
      position.y = minimumWorldY + CINEMA_SEAT_VERTICAL_OFFSET;
    }
    const forward = BABYLON.Vector3.TransformNormal(
      BABYLON.Axis.Z,
      mesh.getWorldMatrix(),
    );
    forward.y = 0;
    if (forward.lengthSquared() > 1e-8) forward.normalize();
    if (
      screenPosition
      && BABYLON.Vector3.Dot(
        forward,
        screenPosition.subtract(surfacePosition),
      ) < 0
    ) {
      forward.scaleInPlace(-1);
    }
    const exitPosition = surfacePosition.add(
      forward.scale(CINEMA_SEAT_EXIT_DISTANCE),
    );
    if (Number.isFinite(minimumWorldY)) {
      exitPosition.y = minimumWorldY + CINEMA_SEAT_EXIT_CLEARANCE;
    }
    const exitYaw = Math.atan2(forward.x, forward.z);
    return [{
      root: mesh,
      position,
      surfacePosition,
      exitPosition,
      exitYaw,
    }];
  });
  // Every chair in the cinema GLB has the same authored rotation. Aiming each
  // actor independently at the center of the screen incorrectly fans their
  // yaws outward across a straight row. Seat.005 is the user-calibrated chair;
  // retain its known-good 45-degree animation correction for every seat.
  const reference = seats.find(
    ({ root }) => root.name === CINEMA_SEAT_REFERENCE_NAME,
  ) || seats[0];
  const screenFacingYaw = screenPosition && reference
    ? Math.atan2(
      screenPosition.x - reference.position.x,
      screenPosition.z - reference.position.z,
    )
    : Math.PI;
  const yaw = screenFacingYaw + CINEMA_SEAT_YAW_OFFSET;
  return seats.map((entry) => ({ ...entry, yaw }));
}

export class CinemaSeatInteractions {
  constructor({
    getController,
    getActorRoot,
    playEmote,
    clearEmote,
    sitEmote,
    setMetadata,
    onPositionChanged = () => {},
    onActiveChanged = () => {},
  }) {
    this.getController = getController;
    this.getActorRoot = getActorRoot;
    this.playEmote = playEmote;
    this.clearEmote = clearEmote;
    this.sitEmote = sitEmote;
    this.setMetadata = setMetadata;
    this.onPositionChanged = onPositionChanged;
    this.onActiveChanged = onActiveChanged;
    this.entries = [];
    this.active = null;
  }

  register(roots, worldId) {
    this.entries.length = 0;
    if (worldId !== "cinema") return this.entries;
    this.entries = cinemaSeatEntries(roots);
    for (const entry of this.entries) {
      // The interaction belongs to the complete Seat mesh. The face range is
      // used only to calculate where the character sits.
      this.setMetadata(entry.root, "interactiveCinemaSeat", entry);
    }
    return this.entries;
  }

  enter(entry) {
    const controller = this.getController();
    const actorRoot = this.getActorRoot();
    if (!entry || this.active || !controller || !actorRoot) return false;
    const previous = {
      position: actorRoot.position.clone(),
      yaw: actorRoot.rotation.y,
      travelState: controller.captureTravelState(),
      movementLocked: controller.movementLocked,
    };
    controller.reset(entry.position, entry.yaw, { snapToTerrain: false });
    controller.setMovementLocked(true);
    if (!this.playEmote(this.sitEmote, null, { cinemaSeat: entry })) {
      controller.reset(previous.position, previous.yaw, {
        snapToTerrain: false,
      });
      controller.restoreTravelState(previous.travelState);
      controller.setMovementLocked(previous.movementLocked);
      return false;
    }
    this.active = { entry, previous };
    this.onActiveChanged(true);
    this.onPositionChanged();
    return true;
  }

  update() {
    if (!this.active) return false;
    const controller = this.getController();
    const actorRoot = this.getActorRoot();
    if (!controller || !actorRoot) return false;
    const { position, yaw } = this.active.entry;
    // A locked controller still performs terrain snapping. Pin both roots so
    // the cushion is not mistaken for terrain and used as a standing height.
    controller.collider?.position.copyFrom(position);
    actorRoot.position.copyFrom(position);
    actorRoot.rotation.y = yaw;
    return true;
  }

  exit({ restorePosition = true } = {}) {
    if (!this.active) return false;
    const { entry, previous } = this.active;
    this.active = null;
    this.onActiveChanged(false);
    this.clearEmote();
    const controller = this.getController();
    if (controller) {
      if (restorePosition) {
        controller.reset(entry.exitPosition, entry.exitYaw);
        controller.restoreTravelState(previous.travelState);
      }
      controller.setMovementLocked(previous.movementLocked);
    }
    this.onPositionChanged();
    return true;
  }

  clear() {
    this.exit({ restorePosition: false });
    this.entries.length = 0;
  }
}
