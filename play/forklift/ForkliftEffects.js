import * as BABYLON from "@babylonjs/core";

const MAX_TIRE_MARK_STRIPS = 24000;
const TIRE_MARK_TRIM_COUNT = 60;
const EXHAUST_REAR_CLEARANCE = 0.14;

export function forkliftExhaustEmitterPosition(rig) {
  const minimum = rig?.chassisBounds?.minimum;
  const maximum = rig?.chassisBounds?.maximum;
  const minimumY = Number(minimum?.y);
  const maximumY = Number(maximum?.y);
  const rearEdge = Number(maximum?.z);
  const modelHeight = maximumY - minimumY;
  const emitterY = (
    Number.isFinite(minimumY)
    && Number.isFinite(modelHeight)
    && modelHeight > 0
  )
    ? minimumY + Math.min(0.72, modelHeight * 0.4)
    : 0.68;
  return new BABYLON.Vector3(
    0,
    emitterY,
    Number.isFinite(rearEdge)
      ? rearEdge + EXHAUST_REAR_CLEARANCE
      : 0.86,
  );
}

export class ForkliftEffects {
  constructor(scene, { pickWithRay = null } = {}) {
    this.scene = scene;
    this.pickWithRay = pickWithRay
      || ((...args) => this.scene.pickWithRay(...args));
    this.smokeTexture = null;
    this.tireMarks = null;
  }

  getSmokeTexture() {
    if (this.smokeTexture) return this.smokeTexture;
    const texture = new BABYLON.DynamicTexture(
      "forklift_exhaust_smoke_texture",
      { width: 64, height: 64 },
      this.scene,
      false,
    );
    const context = texture.getContext();
    const gradient = context.createRadialGradient(32, 32, 2, 32, 32, 30);
    gradient.addColorStop(0, "rgba(255, 255, 255, 0.95)");
    gradient.addColorStop(0.38, "rgba(248, 250, 252, 0.72)");
    gradient.addColorStop(1, "rgba(235, 240, 244, 0)");
    context.clearRect(0, 0, 64, 64);
    context.fillStyle = gradient;
    context.fillRect(0, 0, 64, 64);
    texture.hasAlpha = true;
    texture.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = BABYLON.Texture.CLAMP_ADDRESSMODE;
    texture.update(false);
    this.smokeTexture = texture;
    return texture;
  }

  createExhaustSmoke(root, rig, name) {
    const emitter = new BABYLON.TransformNode(
      `${name}_exhaust_emitter`,
      this.scene,
    );
    emitter.parent = root;
    // Keep the billboard centers clear of the detailed rear shell. The old
    // model tolerated an emitter almost exactly on its rear bound, but the
    // new bodywork depth-occludes most of a smoke sprite at that position.
    emitter.position.copyFrom(forkliftExhaustEmitterPosition(rig));

    const particles = new BABYLON.ParticleSystem(
      `${name}_exhaust_smoke`,
      64,
      this.scene,
    );
    particles.particleTexture = this.getSmokeTexture();
    particles.emitter = emitter;
    particles.minEmitBox.set(-0.24, -0.06, 0);
    particles.maxEmitBox.set(0.24, 0.06, 0);
    particles.direction1.set(-0.08, 0.12, 0.32);
    particles.direction2.set(0.08, 0.3, 0.7);
    particles.color1 = new BABYLON.Color4(1, 1, 1, 0.5);
    particles.color2 = new BABYLON.Color4(0.86, 0.9, 0.93, 0.3);
    particles.colorDead = new BABYLON.Color4(0.82, 0.86, 0.9, 0);
    particles.renderingGroupId = 1;
    particles.minSize = 0.15;
    particles.maxSize = 0.42;
    particles.minLifeTime = 0.55;
    particles.maxLifeTime = 1;
    particles.emitRate = 22;
    particles.minEmitPower = 0.35;
    particles.maxEmitPower = 0.7;
    particles.gravity.set(0, 0.14, 0);
    particles.minAngularSpeed = -0.8;
    particles.maxAngularSpeed = 0.8;
    particles.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
    particles.updateSpeed = 1 / 60;

    return {
      start: () => particles.start(),
      stop: () => particles.stop(),
      dispose: () => {
        particles.dispose(false);
        emitter.dispose();
      },
    };
  }

  createTireMarkTrail() {
    const mesh = new BABYLON.Mesh(
      "local_forklift_tire_marks",
      this.scene,
    );
    const texture = new BABYLON.DynamicTexture(
      "local_forklift_tire_mark_texture",
      { width: 64, height: 256 },
      this.scene,
      false,
    );
    const textureContext = texture.getContext();
    const texturePixels = textureContext.createImageData(64, 256);
    let edgeWander = 0;
    for (let y = 0; y < 256; y++) {
      edgeWander = Math.max(
        -4,
        Math.min(4, edgeWander + (Math.random() - 0.5) * 1.4),
      );
      const halfWidth = 22 + edgeWander;
      const rowStrength = 0.55 + Math.random() * 0.45;
      for (let x = 0; x < 64; x++) {
        const edgeDistance = halfWidth - Math.abs(x - 31.5);
        const edgeAlpha = Math.max(
          0,
          Math.min(1, (edgeDistance + Math.random() * 5 - 2) / 5),
        );
        const fleck = Math.random() < 0.09 ? Math.random() * 0.25 : 1;
        const offset = (y * 64 + x) * 4;
        texturePixels.data[offset] = 255;
        texturePixels.data[offset + 1] = 255;
        texturePixels.data[offset + 2] = 255;
        texturePixels.data[offset + 3] = Math.round(
          255 * edgeAlpha * rowStrength * fleck,
        );
      }
    }
    textureContext.putImageData(texturePixels, 0, 0);
    texture.hasAlpha = true;
    texture.wrapU = BABYLON.Texture.CLAMP_ADDRESSMODE;
    texture.wrapV = BABYLON.Texture.WRAP_ADDRESSMODE;
    texture.update(false);

    const material = new BABYLON.StandardMaterial(
      "local_forklift_tire_mark_material",
      this.scene,
    );
    material.diffuseColor.set(0.025, 0.025, 0.022);
    material.emissiveColor.set(0.008, 0.008, 0.007);
    material.specularColor.setAll(0);
    material.alpha = 0.62;
    material.backFaceCulling = false;
    material.disableLighting = true;
    material.opacityTexture = texture;
    material.useAlphaFromDiffuseTexture = true;
    material.zOffset = -2;
    mesh.material = material;
    mesh.isPickable = false;
    mesh.checkCollisions = false;
    mesh.alwaysSelectAsActiveMesh = true;
    mesh.useVertexColors = true;
    mesh.hasVertexAlpha = true;
    mesh.metadata = {
      localEffect: true,
      forkliftTireMark: true,
    };

    const positions = [];
    const normals = [];
    const uvs = [];
    const colors = [];
    const indices = [];
    const trailDistances = [0, 0];
    const trailStartDistances = [0, 0];
    const stripRecords = [];
    let previousContacts = null;
    let stripCount = 0;

    const rebuild = () => {
      mesh.setVerticesData(
        BABYLON.VertexBuffer.PositionKind,
        positions,
        true,
      );
      mesh.setVerticesData(
        BABYLON.VertexBuffer.NormalKind,
        normals,
        true,
      );
      mesh.setVerticesData(BABYLON.VertexBuffer.UVKind, uvs, true);
      mesh.setVerticesData(
        BABYLON.VertexBuffer.ColorKind,
        colors,
        true,
      );
      mesh.setIndices(indices, null, true);
      mesh.refreshBoundingInfo();
    };

    const trimOldestStrips = (requestedCount) => {
      const removeCount = Math.min(requestedCount, stripCount);
      if (removeCount <= 0) return;
      const removedVertexCount = removeCount * 4;
      positions.splice(0, removeCount * 12);
      normals.splice(0, removeCount * 12);
      uvs.splice(0, removeCount * 8);
      colors.splice(0, removeCount * 16);
      indices.splice(0, removeCount * 6);
      for (let index = 0; index < indices.length; index++) {
        indices[index] -= removedVertexCount;
      }
      stripRecords.splice(0, removeCount);
      for (const record of stripRecords) {
        record.colorOffset -= removeCount * 16;
      }
      stripCount -= removeCount;
    };

    const appendStrip = (from, to, tireIndex) => {
      const dx = to.x - from.x;
      const dz = to.z - from.z;
      const length = Math.hypot(dx, dz);
      if (length < 0.018 || length > 0.75) return false;
      const halfWidth = 0.05 + Math.random() * 0.012;
      const centerOffset = (Math.random() - 0.5) * 0.012;
      const sideX = -dz / length * halfWidth;
      const sideZ = dx / length * halfWidth;
      const centerX = -dz / length * centerOffset;
      const centerZ = dx / length * centerOffset;
      const base = positions.length / 3;
      positions.push(
        from.x + centerX + sideX, from.y, from.z + centerZ + sideZ,
        from.x + centerX - sideX, from.y, from.z + centerZ - sideZ,
        to.x + centerX + sideX, to.y, to.z + centerZ + sideZ,
        to.x + centerX - sideX, to.y, to.z + centerZ - sideZ,
      );
      normals.push(
        0, 1, 0,
        0, 1, 0,
        0, 1, 0,
        0, 1, 0,
      );
      const fromDistance = trailDistances[tireIndex];
      const fromV = fromDistance * 2.5;
      trailDistances[tireIndex] += length;
      const toDistance = trailDistances[tireIndex];
      const toV = toDistance * 2.5;
      uvs.push(0, fromV, 1, fromV, 0, toV, 1, toV);
      const fadeLength = 0.5;
      const fromAlpha = Math.min(
        1,
        Math.max(
          0,
          (fromDistance - trailStartDistances[tireIndex]) / fadeLength,
        ),
      );
      const toAlpha = Math.min(
        1,
        Math.max(
          0,
          (toDistance - trailStartDistances[tireIndex]) / fadeLength,
        ),
      );
      const colorOffset = colors.length;
      colors.push(
        1, 1, 1, fromAlpha,
        1, 1, 1, fromAlpha,
        1, 1, 1, toAlpha,
        1, 1, 1, toAlpha,
      );
      stripRecords.push({
        tireIndex,
        colorOffset,
        fromDistance,
        toDistance,
      });
      indices.push(
        base, base + 2, base + 1,
        base + 1, base + 2, base + 3,
      );
      stripCount += 1;
      return true;
    };

    const fadeTrailEnds = () => {
      const fadeLength = 0.5;
      let changed = false;
      for (const record of stripRecords) {
        const endDistance = trailDistances[record.tireIndex];
        if (record.toDistance < endDistance - fadeLength) continue;
        const fromAlpha = Math.min(
          colors[record.colorOffset + 3],
          Math.max(
            0,
            (endDistance - record.fromDistance) / fadeLength,
          ),
        );
        const toAlpha = Math.min(
          colors[record.colorOffset + 11],
          Math.max(0, (endDistance - record.toDistance) / fadeLength),
        );
        colors[record.colorOffset + 3] = fromAlpha;
        colors[record.colorOffset + 7] = fromAlpha;
        colors[record.colorOffset + 11] = toAlpha;
        colors[record.colorOffset + 15] = toAlpha;
        changed = true;
      }
      trailStartDistances[0] = trailDistances[0];
      trailStartDistances[1] = trailDistances[1];
      if (changed) {
        mesh.updateVerticesData(BABYLON.VertexBuffer.ColorKind, colors);
      }
    };

    return {
      endTrail() {
        if (previousContacts) fadeTrailEnds();
        previousContacts = null;
      },
      addContacts(contacts) {
        if (!Array.isArray(contacts) || contacts.length !== 2) {
          previousContacts = null;
          return;
        }
        if (previousContacts) {
          let changed = false;
          changed = appendStrip(
            previousContacts[0],
            contacts[0],
            0,
          ) || changed;
          changed = appendStrip(
            previousContacts[1],
            contacts[1],
            1,
          ) || changed;
          if (changed) {
            if (stripCount >= MAX_TIRE_MARK_STRIPS) {
              trimOldestStrips(TIRE_MARK_TRIM_COUNT);
            }
            rebuild();
          }
        }
        previousContacts = contacts.map((point) => point.clone());
      },
      dispose() {
        mesh.dispose();
        material.dispose();
        texture.dispose();
      },
    };
  }

  rearTireContacts(pose) {
    if (!pose?.position || !pose?.orientation) return null;
    const rotation = BABYLON.Matrix.FromQuaternionToRef(
      pose.orientation,
      BABYLON.Matrix.Identity(),
    );
    const contacts = [];
    for (const x of [-0.48, 0.48]) {
      const local = new BABYLON.Vector3(x, 0.12, -0.52);
      const wheel = pose.position.add(
        BABYLON.Vector3.TransformNormal(local, rotation),
      );
      const hit = this.pickWithRay(
        new BABYLON.Ray(
          wheel.add(new BABYLON.Vector3(0, 0.8, 0)),
          BABYLON.Vector3.Down(),
          2.5,
        ),
        (candidate) => (
          candidate.isEnabled()
          && (
            candidate.metadata?.terrain === true
            || candidate.checkCollisions === true
          )
          && candidate.metadata?.playerVehicle !== true
          && candidate.metadata?.forkliftCargo !== true
          && candidate.metadata?.controllerCollider !== true
          && candidate.metadata?.localEffect !== true
        ),
      );
      if (!hit?.pickedPoint) return null;
      contacts.push(hit.pickedPoint.add(new BABYLON.Vector3(0, 0.012, 0)));
    }
    return contacts;
  }

  updateTireMarks(movement) {
    const marking = Boolean(
      movement?.pose
      && Math.abs(Number(movement.pose.forwardSpeed) || 0) >= 2.5
      && (Number(movement.pose.tireContact) || 0) >= 0.72
      && (Number(movement.pose.tireSlipSpeed) || 0) >= 0.45
    );
    if (!marking) {
      this.endTireMarks();
      return;
    }
    const contacts = this.rearTireContacts(movement.pose);
    if (!contacts) {
      this.endTireMarks();
      return;
    }
    if (!this.tireMarks) {
      this.tireMarks = this.createTireMarkTrail();
    }
    this.tireMarks.addContacts(contacts);
  }

  endTireMarks() {
    this.tireMarks?.endTrail();
  }

  disposeTireMarks() {
    this.tireMarks?.dispose();
    this.tireMarks = null;
  }

  dispose() {
    this.disposeTireMarks();
    this.smokeTexture?.dispose();
    this.smokeTexture = null;
  }
}
