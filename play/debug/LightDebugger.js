import * as BABYLON from "@babylonjs/core";

export class LightDebugger {
  constructor({
    scene,
    dom,
    enabled,
    getActorPosition,
    getReferenceTargetMeshes,
    refreshLightTargets,
  }) {
    this.scene = scene;
    this.dom = dom;
    this.enabled = enabled;
    this.getActorPosition = getActorPosition;
    this.getReferenceTargetMeshes = getReferenceTargetMeshes;
    this.refreshLightTargets = refreshLightTargets;
    this.meshes = [];
    this.materials = [];
    this.selected = null;
  }

  clear() {
    for (const mesh of this.meshes.splice(0)) mesh.dispose();
    for (const material of this.materials.splice(0)) material.dispose();
    if (this.dom.showLightsLabel) {
      this.dom.showLightsLabel.textContent = "Show lights";
    }
  }

  clearSelection() {
    this.selected = null;
    this.dom.lightDebugEditor.hidden = true;
  }

  setVectorField(
    axis,
    vector,
    visible,
    kind,
    resetPositionBounds = false,
  ) {
    const upper = axis.toUpperCase();
    const input = this.dom[`lightDebug${kind}${upper}`];
    const output = this.dom[`lightDebug${kind}${upper}Value`];
    const field = this.dom[`lightDebug${kind}${upper}Field`];
    field.hidden = !visible;
    if (!visible) return;
    const value = vector[axis];
    if (kind === "Position" && resetPositionBounds) {
      input.min = String(Math.floor(value - 10));
      input.max = String(Math.ceil(value + 10));
    }
    input.value = String(value);
    output.value = value.toFixed(2);
  }

  updateEditor(resetPositionBounds = false) {
    const light = this.selected;
    if (!light || light.isDisposed?.()) {
      this.clearSelection();
      return;
    }
    const type = light.getClassName?.() || "Light";
    const hasPosition = light.position instanceof BABYLON.Vector3;
    const hasDirection = light.direction instanceof BABYLON.Vector3;
    const isSpot = type === "SpotLight";
    const hasRange = type === "PointLight" || isSpot;
    this.dom.lightDebugEditor.hidden = false;
    this.dom.lightDebugName.textContent = `${light.name} · ${type}`;
    const intensity = (
      light.metadata?.televisionFlicker?.baseIntensity ?? light.intensity
    );
    this.dom.lightDebugIntensity.value = String(intensity);
    this.dom.lightDebugIntensityValue.value = Number(intensity).toFixed(1);
    this.dom.lightDebugRange.closest(".light-debug-field").hidden = !hasRange;
    if (hasRange) {
      this.dom.lightDebugRange.value = String(light.range);
      this.dom.lightDebugRangeValue.value = Number(light.range).toFixed(1);
    }
    this.dom.lightDebugAngleField.hidden = !isSpot;
    this.dom.lightDebugExponentField.hidden = !isSpot;
    if (isSpot) {
      const angleDegrees = BABYLON.Tools.ToDegrees(light.angle);
      this.dom.lightDebugAngle.value = String(angleDegrees);
      this.dom.lightDebugAngleValue.value = `${Math.round(angleDegrees)}°`;
      this.dom.lightDebugExponent.value = String(light.exponent);
      this.dom.lightDebugExponentValue.value = Number(light.exponent)
        .toFixed(1);
    }
    for (const axis of ["x", "y", "z"]) {
      this.setVectorField(
        axis,
        light.position || BABYLON.Vector3.Zero(),
        hasPosition,
        "Position",
        resetPositionBounds,
      );
      this.setVectorField(
        axis,
        light.direction || BABYLON.Vector3.Zero(),
        hasDirection,
        "Direction",
      );
    }
  }

  select(light) {
    if (!light || light.isDisposed?.()) return;
    this.selected = light;
    this.updateEditor(true);
    this.show();
  }

  applySelected() {
    const light = this.selected;
    if (!light || light.isDisposed?.()) return;
    light.intensity = Number(this.dom.lightDebugIntensity.value);
    if (light.metadata?.televisionFlicker) {
      light.metadata.televisionFlicker.baseIntensity = light.intensity;
    }
    const type = light.getClassName?.() || "";
    if (type === "PointLight" || type === "SpotLight") {
      light.range = Number(this.dom.lightDebugRange.value);
    }
    if (light.position instanceof BABYLON.Vector3) {
      light.position.set(
        Number(this.dom.lightDebugPositionX.value),
        Number(this.dom.lightDebugPositionY.value),
        Number(this.dom.lightDebugPositionZ.value),
      );
    }
    if (light.direction instanceof BABYLON.Vector3) {
      const direction = new BABYLON.Vector3(
        Number(this.dom.lightDebugDirectionX.value),
        Number(this.dom.lightDebugDirectionY.value),
        Number(this.dom.lightDebugDirectionZ.value),
      );
      if (direction.lengthSquared() > 1e-6) {
        light.direction.copyFrom(direction.normalize());
      }
    }
    if (type === "SpotLight") {
      light.angle = BABYLON.Tools.ToRadians(
        Number(this.dom.lightDebugAngle.value),
      );
      light.exponent = Number(this.dom.lightDebugExponent.value);
    }
    this.refreshLightTargets(light);
    this.updateEditor();
    this.show();
  }

  json(light) {
    const payload = {
      name: light.name,
      type: light.getClassName?.() || "Light",
      intensity: Number(
        light.metadata?.televisionFlicker?.baseIntensity ?? light.intensity,
      ),
    };
    if (light.position instanceof BABYLON.Vector3) {
      payload.position = light.position.asArray();
    }
    if (light.direction instanceof BABYLON.Vector3) {
      payload.direction = light.direction.asArray();
    }
    if (light.getClassName?.() === "SpotLight") {
      payload.spreadDegrees = BABYLON.Tools.ToDegrees(light.angle);
      payload.exponent = Number(light.exponent);
    }
    if (["PointLight", "SpotLight"].includes(light.getClassName?.())) {
      payload.range = Number(light.range);
    }
    return payload;
  }

  async copySelected() {
    if (!this.selected) return;
    const text = JSON.stringify(this.json(this.selected), null, 2);
    try {
      await navigator.clipboard.writeText(text);
      this.dom.copyLightDebug.textContent = "Copied!";
    } catch {
      this.dom.copyLightDebug.textContent = "Copy failed";
    }
    window.setTimeout(() => {
      this.dom.copyLightDebug.textContent = "Copy JSON";
    }, 1200);
  }

  color(light) {
    const diffuse = light.diffuse;
    if (!diffuse) return new BABYLON.Color3(1, 1, 0.4);
    const brightest = Math.max(diffuse.r, diffuse.g, diffuse.b, 0.001);
    return new BABYLON.Color3(
      Math.max(0.18, diffuse.r / brightest),
      Math.max(0.18, diffuse.g / brightest),
      Math.max(0.18, diffuse.b / brightest),
    );
  }

  range(light) {
    const range = Number(light.range);
    if (!Number.isFinite(range) || range <= 0) return 2.5;
    return Math.min(5, Math.max(0.35, range));
  }

  circle(center, firstAxis, secondAxis, radius, segments = 24) {
    const points = [];
    for (let index = 0; index <= segments; index++) {
      const angle = (index / segments) * Math.PI * 2;
      points.push(
        center
          .add(firstAxis.scale(Math.cos(angle) * radius))
          .add(secondAxis.scale(Math.sin(angle) * radius)),
      );
    }
    return points;
  }

  addLines(name, lines, color, alpha = 0.82) {
    const mesh = BABYLON.MeshBuilder.CreateLineSystem(
      name,
      { lines },
      this.scene,
    );
    mesh.color = color;
    mesh.alpha = alpha;
    mesh.isPickable = false;
    mesh.checkCollisions = false;
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.renderingGroupId = 3;
    mesh.metadata = { lightDebug: true };
    this.meshes.push(mesh);
  }

  show() {
    this.clear();
    if (!this.enabled) return;
    this.scene.setRenderingAutoClearDepthStencil(3, false, false, false);
    const targetMesh = this.getReferenceTargetMeshes()
      .find((mesh) => mesh.material) || null;
    const lightLimit = Math.max(
      0,
      Number(targetMesh?.material?.maxSimultaneousLights) || 8,
    );
    const eligibleLights = targetMesh?.lightSources || this.scene.lights;
    const activeLights = new Set(eligibleLights.slice(0, lightLimit));
    const displayLights = this.scene.lights.flatMap((light) => (
      light.getClassName?.() === "ClusteredLightContainer"
        ? (light.lights || []).map((child) => ({
          light: child,
          container: light,
        }))
        : [{ light, container: null }]
    ));
    const activeDisplayLights = new Set(
      displayLights
        .filter(({ light, container }) => (
          activeLights.has(light) || activeLights.has(container)
        ))
        .map(({ light }) => light),
    );
    if (this.dom.showLightsLabel) {
      this.dom.showLightsLabel.textContent = targetMesh
        ? `Show lights (${activeDisplayLights.size}/${displayLights.length} active)`
        : `Show lights (${
          activeDisplayLights.size
        } active)`;
    }
    let directionOnlyIndex = 0;
    for (const { light, container } of displayLights) {
      if (light.isDisposed?.() || light.isEnabled?.() === false) continue;
      const active = activeDisplayLights.has(light);
      const selected = light === this.selected;
      const color = active
        ? this.color(light)
        : new BABYLON.Color3(0.18, 0.18, 0.18);
      const type = light.getClassName?.() || "";
      const hasPosition = light.position instanceof BABYLON.Vector3;
      const source = hasPosition
        ? light.position.clone()
        : this.getActorPosition().add(new BABYLON.Vector3(
          -0.75 + directionOnlyIndex++ * 0.5,
          2.4,
          0,
        ));
      const material = new BABYLON.StandardMaterial(
        `${light.name}_light_debug_material`,
        this.scene,
      );
      material.disableLighting = true;
      material.emissiveColor = color;
      material.diffuseColor = BABYLON.Color3.Black();
      material.alpha = 0.9;
      material.backFaceCulling = false;
      this.materials.push(material);
      const marker = BABYLON.MeshBuilder.CreateSphere(
        `${light.name}_light_debug_source`,
        {
          diameter: active
            ? (hasPosition ? 0.2 : 0.14) * (selected ? 1.7 : 1)
            : 0.055,
          segments: 8,
        },
        this.scene,
      );
      marker.position.copyFrom(source);
      marker.material = material;
      marker.isPickable = true;
      marker.checkCollisions = false;
      marker.alwaysSelectAsActiveMesh = true;
      marker.renderingGroupId = 3;
      marker.metadata = {
        lightDebug: true,
        sourceLight: light.name,
        lightType: type,
        activeForDebugTarget: active,
        sourceLightRef: light,
      };
      this.meshes.push(marker);
      if (!active) {
        const radius = 0.11;
        this.addLines(`${light.name}_light_debug_inactive`, [
          [
            source.add(BABYLON.Axis.X.scale(-radius)),
            source.add(BABYLON.Axis.X.scale(radius)),
          ],
          [
            source.add(BABYLON.Axis.Y.scale(-radius)),
            source.add(BABYLON.Axis.Y.scale(radius)),
          ],
          [
            source.add(BABYLON.Axis.Z.scale(-radius)),
            source.add(BABYLON.Axis.Z.scale(radius)),
          ],
        ], color, 0.5);
        continue;
      }
      const direction = light.direction instanceof BABYLON.Vector3
        ? light.direction.clone().normalize()
        : null;
      if (type === "PointLight") {
        const radius = this.range(light);
        this.addLines(`${light.name}_light_debug_range`, [
          this.circle(source, BABYLON.Axis.X, BABYLON.Axis.Y, radius),
          this.circle(source, BABYLON.Axis.X, BABYLON.Axis.Z, radius),
          this.circle(source, BABYLON.Axis.Y, BABYLON.Axis.Z, radius),
        ], color);
      } else if (type === "SpotLight" && direction) {
        const length = this.range(light);
        const coneCenter = source.add(direction.scale(length));
        const helperAxis = Math.abs(
          BABYLON.Vector3.Dot(direction, BABYLON.Axis.Y),
        ) > 0.9 ? BABYLON.Axis.X : BABYLON.Axis.Y;
        const right = BABYLON.Vector3.Cross(
          direction,
          helperAxis,
        ).normalize();
        const up = BABYLON.Vector3.Cross(right, direction).normalize();
        const radius = Math.tan((Number(light.angle) || Math.PI / 3) / 2)
          * length;
        const ring = this.circle(coneCenter, right, up, radius);
        this.addLines(
          `${light.name}_light_debug_cone`,
          [ring, ...[0, 6, 12, 18].map((index) => [source, ring[index]])],
          color,
        );
      } else if (direction) {
        this.addLines(
          `${light.name}_light_debug_direction`,
          [[source, source.add(direction.scale(2))]],
          color,
        );
      }
    }
  }

  setVisible(visible) {
    if (!this.enabled || !visible) {
      this.clear();
      this.clearSelection();
    } else {
      this.show();
    }
  }
}
