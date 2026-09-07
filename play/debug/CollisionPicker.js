import * as BABYLON from "@babylonjs/core";
import { TrianglePicker } from "./TrianglePicker.js";

export class CollisionPicker extends TrianglePicker {
  constructor(options) {
    super({
      ...options,
      controls: {
        toggle: options.dom.collisionPicker,
        copy: options.dom.copyCollisionSelection,
        idleLabel: "Collision picker",
        activeLabel: "Exit collision picker",
      },
      selectionProperty: "collisionTriangles",
    });
  }

  canSelect(mesh) {
    return Boolean(
      mesh
      && mesh.metadata?.collisionDebug
      && mesh.metadata?.collisionDebugLayer !== "fill"
      && !mesh.metadata?.playerCollider
      && !mesh.metadata?.trianglePickerDebug
      && mesh.isEnabled()
      && mesh.isVisible
      && mesh.visibility >= 0.01
      && mesh.material
      && mesh.getTotalVertices?.() > 0
      && mesh.getVerticesData?.(
        BABYLON.VertexBuffer.PositionKind,
      )?.length >= 9,
    );
  }

  faceData(mesh, faceId) {
    const data = super.faceData(mesh, faceId);
    if (!data) return null;
    const source = mesh.metadata?.sourceCollisionMesh || mesh;
    const metadata = source.metadata || mesh.metadata || {};
    const nativeFaceListIndex = metadata.nativeCollisionFaceIndices
      ? Math.floor(faceId / 4)
      : null;
    const nativeFaceIndex = nativeFaceListIndex === null
      ? null
      : metadata.nativeCollisionFaceIndices[nativeFaceListIndex] ?? null;
    const candidateSegmentIndex = nativeFaceIndex === null
      ? metadata.nativeCollision
        ? Math.floor(faceId / 4)
        : null
      : metadata.nativeCollisionSegmentFaceIndices?.indexOf(nativeFaceIndex)
        ?? null;
    const segmentIndex = candidateSegmentIndex !== null
      && candidateSegmentIndex >= 0
      ? candidateSegmentIndex
      : null;
    const nativeFaceRecordOffset = (
      nativeFaceIndex !== null
      && Number.isInteger(metadata.nativeCollisionFacesOffset)
    ) ? metadata.nativeCollisionFacesOffset + nativeFaceIndex * 16 : null;
    return {
      ...data,
      collision: {
        sourceMesh: source.name || mesh.metadata?.sourceMesh || null,
        sourceModel: metadata.sourceModel
          || mesh.metadata?.sourceModel
          || null,
        native: Boolean(metadata.nativeCollision),
        area: metadata.nativeCollisionArea ?? null,
        disc: metadata.nativeCollisionDisc ?? null,
        field: metadata.nativeCollisionField ?? null,
        sectionIndex: metadata.nativeCollisionSectionIndex ?? null,
        code: nativeFaceListIndex === null
          ? metadata.nativeCollisionCode ?? null
          : metadata.nativeCollisionFaceNativeCodes?.[nativeFaceListIndex]
            ?? null,
        recordOffset: nativeFaceRecordOffset ?? (
          segmentIndex === null
            ? null
            : metadata.nativeCollisionSegmentRecordOffsets?.[segmentIndex]
              ?? null
        ),
        faceIndex: nativeFaceIndex,
        segmentIndex,
        segment: segmentIndex === null
          ? null
          : metadata.nativeCollisionSegments?.[segmentIndex] ?? null,
        boundaryTransition: metadata.boundaryTransition
          || mesh.metadata?.boundaryTransition
          || null,
      },
    };
  }
}
