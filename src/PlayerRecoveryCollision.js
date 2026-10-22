import * as BABYLON from "@babylonjs/core";
import {
    defaultCameraBlockerPredicate,
    defaultStepSurfacePredicate,
    nativeCollisionPositionClear,
} from "./ThirdPersonControllerRules.js";

export const RECOVERY_MINIMUM_DISTANCE = 3;
export const RECOVERY_REPEAT_WINDOW_MS = 30_000;
const MARGIN = 0.035;

function clipHeight(vertices, height, keepAbove) {
    const result = [];
    for (let index = 0; index < vertices.length; index += 1) {
        const a = vertices[index];
        const b = vertices[(index + 1) % vertices.length];
        const aInside = keepAbove ? a.y >= height : a.y <= height;
        const bInside = keepAbove ? b.y >= height : b.y <= height;
        if (aInside) result.push(a);
        if (aInside !== bInside) {
            result.push(BABYLON.Vector3.Lerp(a, b, (height - a.y) / (b.y - a.y)));
        }
    }
    return result;
}

// After clipping to the player's height, intersect the projected polygon with
// the entire circular footprint. Unlike a few rays, this catches thin corners
// and side/shoulder obstructions even when the center line is completely clear.
function overlapsFootprint(vertices, position, radius) {
    let inside = false;
    for (let index = 0; index < vertices.length; index += 1) {
        const a = vertices[index];
        const b = vertices[(index + 1) % vertices.length];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const lengthSquared = dx * dx + dz * dz;
        const t = lengthSquared > 0 ? Math.max(0, Math.min(1,
            ((position.x - a.x) * dx + (position.z - a.z) * dz) / lengthSquared,
        )) : 0;
        if ((position.x - a.x - t * dx) ** 2
            + (position.z - a.z - t * dz) ** 2 <= radius ** 2) return true;
        if ((a.z > position.z) !== (b.z > position.z)
            && position.x < a.x + dx * (position.z - a.z) / dz) inside = !inside;
    }
    return inside;
}

function isClosedSurface(vertices, indices) {
    const count = indices?.length || vertices.length / 3;
    const faces = new Set();
    const edges = new Map();
    for (let index = 0; index + 2 < count; index += 3) {
        const keys = [0, 1, 2].map(offset => {
            const vertex = (indices?.length ? indices[index + offset] : index + offset) * 3;
            return `${vertices[vertex]},${vertices[vertex + 1]},${vertices[vertex + 2]}`;
        });
        if (new Set(keys).size !== 3) continue;
        const face = [...keys].sort().join("|");
        // Imported meshes may duplicate faces with opposite winding or split
        // vertices at texture seams. Neither changes geometric containment.
        if (faces.has(face)) continue;
        faces.add(face);
        for (let edge = 0; edge < 3; edge += 1) {
            const key = [keys[edge], keys[(edge + 1) % 3]].sort().join("|");
            edges.set(key, (edges.get(key) || 0) + 1);
        }
    }
    return edges.size > 0 && [...edges.values()].every(count => count === 2);
}

/** Destination-only validation; ordinary movement keeps its authored rules. */
export function recoveryVolumeClear(meshes, position, options, collider) {
    const radius = options.playerRadius + MARGIN;
    const bottom = position.y + options.stepClearance * 2;
    const top = position.y + options.playerHeight + MARGIN;
    if (![position.x, position.y, position.z].every(Number.isFinite)) return false;
    if (!nativeCollisionPositionClear(meshes, position, options.playerRadius, MARGIN)) {
        return false;
    }
    const a = BABYLON.Vector3.Zero();
    const b = BABYLON.Vector3.Zero();
    const c = BABYLON.Vector3.Zero();
    const normal = BABYLON.Vector3.Zero();
    const edge1 = BABYLON.Vector3.Zero();
    const edge2 = BABYLON.Vector3.Zero();
    const localPoint = BABYLON.Vector3.Zero();
    const center = new BABYLON.Vector3(position.x, (bottom + top) / 2, position.z);
    // A non-axis-aligned ray avoids common box seams when testing whether a
    // closed prop contains the player without intersecting the body's surface.
    const containmentRay = new BABYLON.Ray(center, new BABYLON.Vector3(1, 0.137, 0.219).normalize());
    const slopeCosine = Math.cos(options.maxSlopeDegrees * Math.PI / 180);
    for (const mesh of meshes) {
        if (mesh === collider || !mesh.isEnabled?.()
            || mesh.metadata?.controllerCollider || mesh.metadata?.collisionDebug
            || mesh.metadata?.nativeCollision) continue;
        if (!mesh.checkCollisions && !defaultCameraBlockerPredicate(mesh)
            && !defaultStepSurfacePredicate(mesh)) continue;
        const world = mesh.computeWorldMatrix(!mesh.isWorldMatrixFrozen);
        const box = mesh.getBoundingInfo().boundingBox;
        if (box.maximumWorld.x < position.x - radius || box.minimumWorld.x > position.x + radius
            || box.maximumWorld.z < position.z - radius || box.minimumWorld.z > position.z + radius
            || box.maximumWorld.y < bottom || box.minimumWorld.y > top) continue;
        const vertices = mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
        const indices = mesh.getIndices();
        if (!vertices?.length) continue;
        // World/room meshes can intentionally enclose playable space. Only
        // solid props use containment parity; never interpret every native
        // closed wall chain or an entire interior as a filled obstacle.
        const testContainment = mesh.metadata?.terrain !== true
            && center.x > box.minimumWorld.x && center.x < box.maximumWorld.x
            && center.y > box.minimumWorld.y && center.y < box.maximumWorld.y
            && center.z > box.minimumWorld.z && center.z < box.maximumWorld.z;
        const crossings = [];
        const count = indices?.length || vertices.length / 3;
        for (let index = 0; index + 2 < count; index += 3) {
            for (const [offset, target] of [[0, a], [1, b], [2, c]]) {
                const vertex = (indices?.length ? indices[index + offset] : index + offset) * 3;
                localPoint.copyFromFloats(vertices[vertex], vertices[vertex + 1], vertices[vertex + 2]);
                BABYLON.Vector3.TransformCoordinatesToRef(localPoint, world, target);
            }
            if (testContainment) {
                const hit = containmentRay.intersectsTriangle(a, b, c);
                if (hit && hit.distance > 1e-5) crossings.push(hit.distance);
            }
            if (Math.max(a.x, b.x, c.x) < position.x - radius
                || Math.min(a.x, b.x, c.x) > position.x + radius
                || Math.max(a.z, b.z, c.z) < position.z - radius
                || Math.min(a.z, b.z, c.z) > position.z + radius
                || Math.max(a.y, b.y, c.y) < bottom
                || Math.min(a.y, b.y, c.y) > top) continue;
            b.subtractToRef(a, edge1);
            c.subtractToRef(a, edge2);
            BABYLON.Vector3.CrossToRef(edge1, edge2, normal);
            // The support surface may rise under the feet on a walkable slope.
            // Preserve the controller's step allowance, not an arbitrary box
            // exclusion that would also hide a low ceiling or a vertical wall.
            const supportSlope = Math.min(a.y, b.y, c.y) <= bottom
                && Math.abs(normal.y) >= normal.length() * slopeCosine;
            const lower = supportSlope ? position.y + options.maxStepUp : bottom;
            const clipped = clipHeight(clipHeight([a, b, c], lower, true), top, false);
            if (clipped.length && overlapsFootprint(clipped, position, radius)) return false;
        }
        crossings.sort((left, right) => left - right);
        const distinct = crossings.filter((distance, index) => (
            index === 0 || distance - crossings[index - 1] > 1e-4
        ));
        if (distinct.length % 2 === 1 && isClosedSurface(vertices, indices)) return false;
    }
    return true;
}
