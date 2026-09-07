import * as BABYLON from "@babylonjs/core";

export class TrianglePicker {
  constructor({
    scene,
    dom,
    enabled,
    getSkybox,
    getWorld,
    onActivate,
    controls = null,
    selectionProperty = "triangles",
  }) {
    this.scene = scene;
    this.dom = dom;
    this.enabled = enabled;
    this.getSkybox = getSkybox;
    this.getWorld = getWorld;
    this.onActivate = onActivate;
    this.controls = controls || {
      toggle: dom.trianglePicker,
      copy: dom.copyTriangleSelection,
      idleLabel: "Triangle picker",
      activeLabel: "Exit triangle picker",
    };
    this.selectionProperty = selectionProperty;
    this.active = false;
    this.sources = [];
    this.wireMeshes = [];
    this.pickProxies = [];
    this.pickProxyBySource = new Map();
    this.materials = [];
    this.selectionMaterial = null;
    this.savedClearColor = null;
    this.selections = new Map();
  }

  hierarchy(mesh) {
    const names = [];
    for (let node = mesh; node; node = node.parent) {
      names.unshift(node.name || node.id || "(unnamed)");
    }
    return names;
  }

  sourceMetadata(mesh) {
    let sourceModel = null;
    let sourceFilename = null;
    for (let node = mesh; node; node = node.parent) {
      sourceModel ||= node.metadata?.sourceModel || null;
      sourceFilename ||= node._filename || node.metadata?.filename || null;
    }
    return { sourceModel, sourceFilename };
  }

  isDebugOrCollisionProxy(mesh) {
    const metadata = mesh?.metadata;
    return Boolean(
      metadata?.collisionDebug
      || metadata?.nativeCollision
      || metadata?.controllerCollider
      || metadata?.playerCollider
      || metadata?.scheduledActorDebugSelectionProxy
      || metadata?.scheduledActorOcclusionProxy
      || metadata?.boundaryTransition
    );
  }

  canSelect(mesh) {
    if (mesh?.metadata?.trianglePickerPickProxy) {
      const source = mesh.metadata.trianglePickerSourceMesh;
      return Boolean(
        source
        && !source.isDisposed?.()
        && source.isEnabled()
        && source.isVisible
        && source.visibility >= 0.01
        && source.material
        && source.getTotalVertices() > 0
      );
    }
    if (
      !mesh
      || this.pickProxyBySource.has(mesh)
      || this.isDebugOrCollisionProxy(mesh)
      || mesh.metadata?.trianglePickerDebug
      || mesh.metadata?.interactiveArcade
      || mesh.metadata?.arcadeDigitalDisplay
      || mesh === this.getSkybox()
      || mesh.metadata?.blendedSkyDome
      || mesh.name?.endsWith("_live_crt_screen")
      || !mesh.isEnabled()
      || !mesh.isVisible
      || mesh.visibility < 0.01
      || !mesh.material
      || mesh.getTotalVertices() <= 0
    ) return false;
    return Boolean(
      mesh.getVerticesData?.(BABYLON.VertexBuffer.PositionKind)?.length >= 9,
    );
  }

  updateButtons() {
    if (!this.enabled) return;
    const count = this.selections.size;
    this.controls.toggle.setAttribute("aria-pressed", String(this.active));
    this.controls.toggle.textContent = this.active
      ? this.controls.activeLabel
      : this.controls.idleLabel;
    this.controls.copy.disabled = count === 0;
    this.controls.copy.textContent = count > 0
      ? `Copy selection (${count})`
      : "Copy selection";
  }

  clearSelection() {
    for (const selection of this.selections.values()) {
      selection.overlay.dispose();
    }
    this.selections.clear();
    this.updateButtons();
  }

  restoreScene() {
    this.clearSelection();
    for (const proxy of this.pickProxies.splice(0)) proxy.dispose();
    this.pickProxyBySource.clear();
    for (const mesh of this.wireMeshes.splice(0)) mesh.dispose();
    for (const source of this.sources.splice(0)) {
      if (source.mesh.isDisposed?.()) continue;
      source.mesh.material = source.material;
      source.mesh.isPickable = source.isPickable;
      source.mesh.useVertexColors = source.useVertexColors;
      source.mesh.hasVertexAlpha = source.hasVertexAlpha;
      if (source.hiddenForPicker) {
        source.mesh.setEnabled(source.wasEnabled);
      }
    }
    for (const material of this.materials.splice(0)) material.dispose();
    this.selectionMaterial = null;
    if (this.savedClearColor) {
      this.scene.clearColor.copyFrom(this.savedClearColor);
      this.savedClearColor = null;
    }
  }

  createMaterials() {
    const grayMaterial = (name, backFaceCulling, sideOrientation) => {
      const material = new BABYLON.StandardMaterial(name, this.scene);
      material.disableLighting = false;
      material.diffuseColor = new BABYLON.Color3(0.58, 0.58, 0.58);
      material.ambientColor = new BABYLON.Color3(0.16, 0.16, 0.16);
      material.emissiveColor = new BABYLON.Color3(0.035, 0.035, 0.035);
      material.specularColor = BABYLON.Color3.Black();
      material.backFaceCulling = backFaceCulling;
      material.sideOrientation = sideOrientation;
      return material;
    };
    const wireMaterial = (name, backFaceCulling, sideOrientation) => {
      const material = new BABYLON.StandardMaterial(name, this.scene);
      material.disableLighting = true;
      material.diffuseColor = BABYLON.Color3.Black();
      material.emissiveColor = new BABYLON.Color3(0.08, 0.08, 0.08);
      material.wireframe = true;
      material.backFaceCulling = backFaceCulling;
      material.sideOrientation = sideOrientation;
      material.disableDepthWrite = true;
      material.zOffset = -2;
      return material;
    };
    const variants = new Map();
    const forSource = (sourceMaterial) => {
      const backFaceCulling = sourceMaterial?.backFaceCulling !== false;
      const sideOrientation = sourceMaterial?.sideOrientation
        ?? BABYLON.Material.CounterClockWiseSideOrientation;
      const key = `${backFaceCulling ? "one-sided" : "double-sided"}:${sideOrientation}`;
      if (!variants.has(key)) {
        const suffix = `${backFaceCulling ? "culled" : "double"}_${sideOrientation}`;
        const gray = grayMaterial(
          `triangle_picker_gray_${suffix}`,
          backFaceCulling,
          sideOrientation,
        );
        const wire = wireMaterial(
          `triangle_picker_wire_${suffix}`,
          backFaceCulling,
          sideOrientation,
        );
        this.materials.push(gray, wire);
        variants.set(key, { gray, wire });
      }
      return variants.get(key);
    };
    const selected = new BABYLON.StandardMaterial(
      "triangle_picker_selected",
      this.scene,
    );
    selected.disableLighting = true;
    selected.diffuseColor = BABYLON.Color3.Black();
    selected.emissiveColor = new BABYLON.Color3(1, 0.03, 0.02);
    selected.backFaceCulling = false;
    selected.zOffset = -3;
    this.materials.push(selected);
    this.selectionMaterial = selected;
    return { selected, forSource };
  }

  createSkinnedPickProxy(mesh) {
    if (
      !mesh.skeleton
      || !mesh.isVerticesDataPresent?.(BABYLON.VertexBuffer.MatricesIndicesKind)
      || !mesh.isVerticesDataPresent?.(BABYLON.VertexBuffer.MatricesWeightsKind)
    ) return null;
    const proxy = mesh.clone(
      `${mesh.name}_triangle_picker_pose_proxy`,
      mesh.parent,
      true,
      false,
    );
    if (!proxy) return null;
    try {
      proxy.makeGeometryUnique();
      proxy.metadata = {
        ...(mesh.metadata || {}),
        trianglePickerPickProxy: true,
        trianglePickerSourceMesh: mesh,
        cameraBlocker: false,
      };
      proxy.isPickable = true;
      proxy.checkCollisions = false;
      // Keep the proxy eligible for Babylon's pointer picking predicate while
      // making it completely absent from the rendered debug view.
      proxy.isVisible = true;
      proxy.visibility = 0;
      proxy.skeleton = mesh.skeleton;
      proxy.computeBonesUsingShaders = false;
      this.pickProxies.push(proxy);
      this.pickProxyBySource.set(mesh, proxy);
      this.refreshSkinnedPickProxy(proxy);
      return proxy;
    } catch (error) {
      proxy.dispose();
      throw error;
    }
  }

  refreshSkinnedPickProxy(proxy) {
    const source = proxy.metadata?.trianglePickerSourceMesh;
    if (!source?.skeleton || source.isDisposed?.()) return false;
    const positions = source.getVerticesData(BABYLON.VertexBuffer.PositionKind);
    if (!positions) return false;
    proxy.setPositionsForCPUSkinning();
    const sourcePositions = proxy._internalMeshDataInfo?._sourcePositions;
    if (!sourcePositions || sourcePositions.length !== positions.length) return false;
    sourcePositions.set(positions);
    const normals = source.getVerticesData(BABYLON.VertexBuffer.NormalKind);
    if (normals) {
      proxy.setNormalsForCPUSkinning();
      const sourceNormals = proxy._internalMeshDataInfo?._sourceNormals;
      if (sourceNormals?.length === normals.length) sourceNormals.set(normals);
    }
    // Babylon suppresses repeated software skinning on one geometry during a
    // render frame. This proxy is an explicit debug snapshot and must always
    // use the latest authored pose at click time.
    proxy.geometry._softwareSkinningFrameId = -1;
    proxy.applySkeleton(source.skeleton);
    proxy.refreshBoundingInfo();
    return true;
  }

  refreshPickProxies() {
    if (!this.active) return false;
    for (const proxy of this.pickProxies) {
      this.refreshSkinnedPickProxy(proxy);
    }
    return true;
  }

  pick(x, y, camera) {
    if (!this.active) return null;
    this.refreshPickProxies();
    return this.scene.pick(
      x,
      y,
      mesh => this.canSelect(mesh),
      false,
      camera,
    );
  }

  setActive(active) {
    if (!this.enabled || this.active === active) return;
    if (!active) {
      this.active = false;
      this.restoreScene();
      this.updateButtons();
      return;
    }
    this.onActivate?.();
    const materials = this.createMaterials();
    this.active = true;
    this.savedClearColor = this.scene.clearColor.clone();
    this.scene.clearColor.set(0.32, 0.32, 0.32, 1);
    this.scene.setRenderingAutoClearDepthStencil(3, false, false, false);
    for (const mesh of [...this.scene.meshes]) {
      const hide = (
        mesh.name?.endsWith("_live_crt_screen")
        || mesh === this.getSkybox()
        || mesh.metadata?.blendedSkyDome
        || this.isDebugOrCollisionProxy(mesh)
      );
      if (hide && mesh.isEnabled()) {
        this.sources.push({
          mesh,
          material: mesh.material,
          isPickable: mesh.isPickable,
          useVertexColors: mesh.useVertexColors,
          hasVertexAlpha: mesh.hasVertexAlpha,
          hiddenForPicker: true,
          wasEnabled: true,
        });
        mesh.setEnabled(false);
        continue;
      }
      if (!this.canSelect(mesh)) continue;
      const source = {
        mesh,
        material: mesh.material,
        isPickable: mesh.isPickable,
        useVertexColors: mesh.useVertexColors,
        hasVertexAlpha: mesh.hasVertexAlpha,
        hiddenForPicker: false,
        wasEnabled: mesh.isEnabled(),
      };
      this.sources.push(source);
      const debugMaterials = materials.forSource(source.material);
      mesh.material = debugMaterials.gray;
      mesh.isPickable = true;
      mesh.useVertexColors = false;
      mesh.hasVertexAlpha = false;
      const wireMesh = mesh.clone(
        `${mesh.name}_triangle_picker_wire`,
        mesh.parent,
        true,
        false,
      );
      if (!wireMesh) continue;
      wireMesh.material = debugMaterials.wire;
      wireMesh.isPickable = false;
      wireMesh.checkCollisions = false;
      wireMesh.renderingGroupId = 3;
      wireMesh.metadata = { trianglePickerDebug: true, sourceMesh: mesh };
      this.wireMeshes.push(wireMesh);
      if (mesh.skeleton) {
        mesh.isPickable = false;
        this.createSkinnedPickProxy(mesh);
      }
    }
    this.updateButtons();
  }

  faceData(mesh, faceId) {
    const sourceMesh = (
      mesh.metadata?.trianglePickerSourceMesh || mesh
    );
    const positions = mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind);
    const indices = mesh.getIndices();
    const offset = faceId * 3;
    const vertexIndices = indices
      ? [indices[offset], indices[offset + 1], indices[offset + 2]]
      : [offset, offset + 1, offset + 2];
    if (vertexIndices.some((index) => (
      !Number.isInteger(index)
      || index < 0
      || index * 3 + 2 >= positions.length
    ))) return null;
    const localPositions = vertexIndices.map(
      (index) => BABYLON.Vector3.FromArray(positions, index * 3),
    );
    mesh.computeWorldMatrix(true);
    const worldPositions = localPositions.map((position) => (
      BABYLON.Vector3.TransformCoordinates(position, mesh.getWorldMatrix())
    ));
    const uvs = mesh.getVerticesData(BABYLON.VertexBuffer.UVKind);
    const { sourceModel, sourceFilename } = this.sourceMetadata(sourceMesh);
    const original = this.sources.find(
      source => source.mesh === sourceMesh,
    );
    const originalFaceId = (
      sourceMesh._mt5OriginalFaceIds?.[faceId] ?? faceId
    );
    return {
      meshName: sourceMesh.name,
      meshUniqueId: sourceMesh.uniqueId,
      geometryId: sourceMesh.geometry?.id || null,
      hierarchy: this.hierarchy(sourceMesh),
      sourceModel,
      sourceFilename,
      originalMaterial: original?.material?.name || null,
      originalTextures: original?.material?.getActiveTextures?.().map(
        (texture) => texture.name || texture.url || null,
      ).filter(Boolean) || [],
      faceId: originalFaceId,
      vertexIndices,
      localPositions: localPositions.map((position) => position.asArray()),
      worldPositions: worldPositions.map((position) => position.asArray()),
      uvs: uvs
        ? vertexIndices.map((index) => [uvs[index * 2], uvs[index * 2 + 1]])
        : null,
    };
  }

  toggleFace(pick) {
    const mesh = pick?.pickedMesh;
    const sourceMesh = mesh?.metadata?.trianglePickerSourceMesh || mesh;
    const faceId = pick?.faceId;
    if (!mesh || !Number.isInteger(faceId) || faceId < 0) return;
    const key = `${sourceMesh.uniqueId}:${faceId}`;
    const existing = this.selections.get(key);
    if (existing) {
      existing.overlay.dispose();
      this.selections.delete(key);
      this.updateButtons();
      return;
    }
    const data = this.faceData(mesh, faceId);
    if (!data) return;
    const overlay = new BABYLON.Mesh(
      `${mesh.name}_selected_face_${faceId}`,
      this.scene,
    );
    const vertexData = new BABYLON.VertexData();
    vertexData.positions = data.localPositions.flat();
    vertexData.indices = [0, 1, 2];
    vertexData.normals = [];
    BABYLON.VertexData.ComputeNormals(
      vertexData.positions,
      vertexData.indices,
      vertexData.normals,
    );
    vertexData.applyToMesh(overlay);
    overlay.parent = mesh;
    overlay.material = this.selectionMaterial;
    overlay.isPickable = false;
    overlay.checkCollisions = false;
    overlay.renderingGroupId = 3;
    overlay.metadata = { trianglePickerDebug: true };
    this.selections.set(key, { data, overlay });
    this.updateButtons();
  }

  async copySelection() {
    const world = this.getWorld();
    const text = JSON.stringify({
      worldId: world.id,
      worldLabel: world.label,
      selectedAt: new Date().toISOString(),
      [this.selectionProperty]: [...this.selections.values()].map(
        ({ data }) => data,
      ),
    }, null, 2);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.append(textarea);
        textarea.select();
        document.execCommand("copy");
        textarea.remove();
      }
      this.controls.copy.textContent = "Copied!";
      window.setTimeout(() => this.updateButtons(), 1200);
    } catch {
      this.controls.copy.textContent = "Copy failed";
      window.setTimeout(() => this.updateButtons(), 1600);
    }
  }
}
