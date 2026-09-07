import * as BABYLON from "@babylonjs/core";

const COLORS = [
  [0.95, 0.25, 0.2], [0.2, 0.78, 0.95], [0.95, 0.72, 0.18],
  [0.42, 0.88, 0.36], [0.78, 0.35, 0.96], [1, 0.42, 0.68],
  [0.24, 0.92, 0.75], [1, 0.54, 0.22], [0.46, 0.58, 1],
  [0.72, 0.9, 0.2], [0.92, 0.3, 0.48], [0.3, 0.82, 0.52],
  [0.68, 0.45, 0.98], [0.96, 0.6, 0.54], [0.28, 0.7, 0.88],
  [0.84, 0.82, 0.3],
].map(([r, g, b]) => new BABYLON.Color3(r, g, b));
const NATIVE_COLLISION_COLOR = new BABYLON.Color3(1, 0.12, 0.82);
const NATIVE_STAIR_BOUNDARY_COLOR = new BABYLON.Color3(0.15, 1, 0.92);
const DEBUG_COLORS = [
  ...COLORS,
  NATIVE_COLLISION_COLOR,
  NATIVE_STAIR_BOUNDARY_COLOR,
];

export class CollisionDebugger {
  constructor({
    scene,
    dom,
    enabled,
    getWorldId,
    getPlayerCollider,
    boundaryTransitions,
  }) {
    this.scene = scene;
    this.dom = dom;
    this.enabled = enabled;
    this.getWorldId = getWorldId;
    this.getPlayerCollider = getPlayerCollider;
    this.boundaryTransitions = boundaryTransitions;
    this.meshes = [];
    this.materials = [];
    this.fillMaterials = [];
    this.tintSources = [];
  }

  colorIndex(source) {
    if (
      ["stair-boundary", "step-riser"].includes(
        source.metadata?.nativeCollisionBehavior,
      )
    ) {
      return COLORS.length + 1;
    }
    if (source.metadata?.nativeCollision) return COLORS.length;
    const identity = [
      source.metadata?.sourceModel || "",
      source.name,
      source.uniqueId,
    ].join(":");
    let hash = 2166136261;
    for (let index = 0; index < identity.length; index++) {
      hash ^= identity.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) % COLORS.length;
  }

  clearTint() {
    for (const previous of this.tintSources.splice(0)) {
      previous.mesh.renderOverlay = previous.renderOverlay;
      previous.mesh.overlayAlpha = previous.overlayAlpha;
      if (previous.overlayColor) {
        previous.mesh.overlayColor = previous.overlayColor;
      }
    }
  }

  applyTint(enabled) {
    this.clearTint();
    if (!enabled || this.meshes.length === 0) return;
    for (const debugMesh of this.meshes) {
      const source = debugMesh.metadata?.sourceCollisionMesh;
      const color = debugMesh.metadata?.collisionColor;
      if (!source || !color) continue;
      this.tintSources.push({
        mesh: source,
        renderOverlay: source.renderOverlay,
        overlayAlpha: source.overlayAlpha,
        overlayColor: source.overlayColor?.clone?.() || null,
      });
      source.renderOverlay = true;
      source.overlayColor = color.clone();
      source.overlayAlpha = 0.1;
    }
  }

  clear() {
    this.clearTint();
    for (const mesh of this.meshes.splice(0)) mesh.dispose();
    for (const material of this.materials.splice(0)) material.dispose();
    for (const material of this.fillMaterials.splice(0)) material.dispose();
  }

  alignWithSource(debugMesh, source) {
    const scaling = BABYLON.Vector3.One();
    const rotation = BABYLON.Quaternion.Identity();
    const translation = BABYLON.Vector3.Zero();
    if (source.metadata?.scheduledActorDebugSelectionProxy) {
      // NPC selection volumes move with their scheduled actor. Keep debug
      // layers beneath the source so animated-bound updates remain visible.
      debugMesh.parent = source;
      debugMesh.position.set(0, 0, 0);
      debugMesh.scaling.set(1, 1, 1);
      debugMesh.rotation.set(0, 0, 0);
      debugMesh.rotationQuaternion = null;
      return;
    }
    source.getWorldMatrix().decompose(scaling, rotation, translation);
    debugMesh.parent = null;
    debugMesh.position.copyFrom(translation);
    debugMesh.scaling.copyFrom(scaling);
    debugMesh.rotation.set(0, 0, 0);
    debugMesh.rotationQuaternion = rotation;
  }

  addBoundaryTransitions() {
    const transitions = this.boundaryTransitions.filter(
      (transition) => transition.source.worldId === this.getWorldId(),
    );
    for (const [index, transition] of transitions.entries()) {
      const colorIndex = this.colorIndex({
        metadata: { sourceModel: "boundary-transition" },
        name: transition.id,
        uniqueId: index,
      });
      const trigger = new BABYLON.Mesh(
        `${transition.id}_collision_debug`,
        this.scene,
      );
      const shape = transition.source.shape;
      let { vertices } = shape;
      let lowerY = -5;
      let upperY = 5;
      if (shape.kind === "directional-portal") {
        const dx = shape.right[0] - shape.left[0];
        const dz = shape.right[2] - shape.left[2];
        const length = Math.hypot(dx, dz);
        const alongX = dx / length;
        const alongZ = dz / length;
        const normalX = -alongZ * 0.08;
        const normalZ = alongX * 0.08;
        const leftX = shape.left[0] - alongX * shape.edgePadding;
        const leftZ = shape.left[2] - alongZ * shape.edgePadding;
        const rightX = shape.right[0] + alongX * shape.edgePadding;
        const rightZ = shape.right[2] + alongZ * shape.edgePadding;
        vertices = [
          [leftX + normalX, leftZ + normalZ],
          [rightX + normalX, rightZ + normalZ],
          [rightX - normalX, rightZ - normalZ],
          [leftX - normalX, leftZ - normalZ],
        ];
        const averageY = (shape.left[1] + shape.right[1]) / 2;
        lowerY = averageY - shape.verticalTolerance;
        upperY = averageY + shape.verticalTolerance;
      }
      const positions = [];
      for (const y of [lowerY, upperY]) {
        for (const [x, z] of vertices) positions.push(x, y, z);
      }
      const vertexData = new BABYLON.VertexData();
      vertexData.positions = positions;
      vertexData.indices = [
        0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7,
        0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5,
        2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7,
      ];
      vertexData.applyToMesh(trigger);
      trigger.material = this.materials[colorIndex];
      trigger.isPickable = false;
      trigger.checkCollisions = false;
      trigger.alwaysSelectAsActiveMesh = true;
      trigger.renderingGroupId = 3;
      trigger.metadata = {
        collisionDebug: true,
        boundaryTransition: transition.id,
        destinationWorldId: transition.destination.worldId,
        destinationEntry: transition.destination.entry,
        collisionColor: COLORS[colorIndex],
      };
      this.meshes.push(trigger);
    }
  }

  show() {
    this.clear();
    this.materials = DEBUG_COLORS.map((color, index) => {
      const material = new BABYLON.StandardMaterial(
        `collision_debug_material_${index}`,
        this.scene,
      );
      material.disableLighting = true;
      material.emissiveColor = color;
      material.diffuseColor = BABYLON.Color3.Black();
      material.wireframe = true;
      material.backFaceCulling = false;
      material.alpha = 0.92;
      material.disableDepthWrite = true;
      material.zOffset = -2;
      return material;
    });
    this.fillMaterials = DEBUG_COLORS.map((color, index) => {
      const material = new BABYLON.StandardMaterial(
        `collision_debug_fill_material_${index}`,
        this.scene,
      );
      material.disableLighting = true;
      material.emissiveColor = color.scale(0.72);
      material.diffuseColor = BABYLON.Color3.Black();
      material.backFaceCulling = false;
      material.alpha = 0.28;
      material.disableDepthWrite = true;
      // Pull the translucent surface slightly toward the camera in depth
      // space. This exposes floor-level and nearly coplanar collision faces
      // without moving or changing the actual collision geometry.
      material.zOffset = -1;
      return material;
    });
    this.scene.setRenderingAutoClearDepthStencil(3, false, false, false);
    const sources = this.scene.meshes.filter((mesh) => (
      (
        mesh.checkCollisions
        || mesh.metadata?.nativeCollisionBehavior === "stair-boundary"
        || mesh.metadata?.nativeCollisionBehavior === "step-riser"
        || mesh.metadata?.scheduledActorDebugSelectionProxy
      )
      && mesh.getTotalVertices() > 0
      && !mesh.metadata?.collisionDebug
      && !mesh.metadata?.controllerCollider
    ));
    for (const source of sources) {
      source.computeWorldMatrix(true);
      const debugMesh = source.clone(
        `${source.name}_collision_debug`,
        null,
        true,
        false,
      );
      if (!debugMesh) continue;
      const colorIndex = this.colorIndex(source);
      const color = DEBUG_COLORS[colorIndex];
      this.alignWithSource(debugMesh, source);
      debugMesh.material = this.materials[colorIndex];
      debugMesh.isVisible = true;
      debugMesh.visibility = 1;
      debugMesh.isPickable = false;
      debugMesh.checkCollisions = false;
      debugMesh.alwaysSelectAsActiveMesh = true;
      debugMesh.renderingGroupId = 3;
      debugMesh.metadata = {
        collisionDebug: true,
        sourceMesh: source.name,
        sourceModel: source.metadata?.sourceModel || null,
        nativeCollision: Boolean(source.metadata?.nativeCollision),
        nativeCollisionBehavior: (
          source.metadata?.nativeCollisionBehavior ?? null
        ),
        nativeCollisionCode: source.metadata?.nativeCollisionCode ?? null,
        nativeCollisionField: source.metadata?.nativeCollisionField ?? null,
        nativeCollisionArea: source.metadata?.nativeCollisionArea ?? null,
        nativeCollisionDisc: source.metadata?.nativeCollisionDisc ?? null,
        nativeCollisionSectionIndex: (
          source.metadata?.nativeCollisionSectionIndex ?? null
        ),
        nativeCollisionSegments: (
          source.metadata?.nativeCollisionSegments || null
        ),
        nativeCollisionSegmentRecordOffsets: (
          source.metadata?.nativeCollisionSegmentRecordOffsets || null
        ),
        nativeCollisionFaceIndices: (
          source.metadata?.nativeCollisionFaceIndices || null
        ),
        nativeCollisionFaceNativeCodes: (
          source.metadata?.nativeCollisionFaceNativeCodes || null
        ),
        nativeCollisionFacesOffset: (
          source.metadata?.nativeCollisionFacesOffset ?? null
        ),
        nativeCollisionSegmentFaceIndices: (
          source.metadata?.nativeCollisionSegmentFaceIndices || null
        ),
        nativeCollisionSegmentYRanges: (
          source.metadata?.nativeCollisionSegmentYRanges || null
        ),
        sourceCollisionMesh: source,
        scheduledActorDebugSelectionProxy: Boolean(
          source.metadata?.scheduledActorDebugSelectionProxy
        ),
        collisionColor: color,
      };
      debugMesh.setEnabled(true);
      this.meshes.push(debugMesh);

      // Wireframe alone makes short, finely tessellated blockers easy to miss
      // against textured floors. Render a second translucent copy beneath the
      // wireframe so the complete collision surface reads as a volume.
      const fillMesh = source.clone(
        `${source.name}_collision_debug_fill`,
        null,
        true,
        false,
      );
      if (fillMesh) {
        this.alignWithSource(fillMesh, source);
        fillMesh.material = this.fillMaterials[colorIndex];
        fillMesh.isVisible = true;
        fillMesh.visibility = 1;
        fillMesh.isPickable = false;
        fillMesh.checkCollisions = false;
        fillMesh.alwaysSelectAsActiveMesh = true;
        fillMesh.renderingGroupId = 3;
        fillMesh.metadata = {
          collisionDebug: true,
          collisionDebugLayer: "fill",
          sourceMesh: source.name,
          sourceModel: source.metadata?.sourceModel || null,
          scheduledActorDebugSelectionProxy: Boolean(
            source.metadata?.scheduledActorDebugSelectionProxy
          ),
          collisionColor: color,
        };
        fillMesh.setEnabled(true);
        this.meshes.push(fillMesh);
      }
    }
    const playerCollider = this.getPlayerCollider();
    if (playerCollider) {
      const colorIndex = this.colorIndex(playerCollider);
      const debugCollider = BABYLON.MeshBuilder.CreateCylinder(
        "ryo_collision_volume_debug",
        { diameter: 2, height: 2, tessellation: 24 },
        this.scene,
      );
      debugCollider.parent = playerCollider;
      debugCollider.position.copyFrom(playerCollider.ellipsoidOffset);
      debugCollider.scaling.copyFrom(playerCollider.ellipsoid);
      debugCollider.material = this.materials[colorIndex];
      debugCollider.isPickable = false;
      debugCollider.checkCollisions = false;
      debugCollider.alwaysSelectAsActiveMesh = true;
      debugCollider.renderingGroupId = 3;
      debugCollider.metadata = {
        collisionDebug: true,
        playerCollider: true,
        sourceMesh: playerCollider.name,
        collisionColor: DEBUG_COLORS[colorIndex],
      };
      this.meshes.push(debugCollider);
    }
    this.addBoundaryTransitions();
    this.applyTint(this.dom.tintCollisions.checked);
  }

  setVisible(visible) {
    if (!this.enabled || !visible) this.clear();
    else this.show();
  }
}
