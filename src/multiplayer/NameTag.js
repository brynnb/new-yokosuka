import * as BABYLON from "@babylonjs/core";

const FONT = "600 42px Inter, Arial, sans-serif";
const TEXTURE_HEIGHT = 128;
const MIN_TEXTURE_WIDTH = 256;
const PLANE_HEIGHT = 0.28;

function cleanName(name) {
  return String(name || "Guest")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 20) || "Guest";
}

function textureWidth(name) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return MIN_TEXTURE_WIDTH;
  context.font = FONT;
  return Math.max(
    MIN_TEXTURE_WIDTH,
    Math.ceil(context.measureText(name).width + 80),
  );
}

export function nameTagHeightForNode(node, fallback = 1.9) {
  if (!node) return fallback;
  try {
    node.computeWorldMatrix?.(true);
    for (const descendant of node.getDescendants?.(false) || []) {
      descendant.computeWorldMatrix?.(true);
    }
    const originY = node.getAbsolutePosition?.().y ?? node.position?.y ?? 0;
    const bounds = node.getHierarchyBoundingVectors(true, (mesh) => (
      mesh.isEnabled()
      && mesh.metadata?.isMultiplayerNameTag !== true
    ));
    const offset = bounds.max.y - originY;
    if (Number.isFinite(offset) && offset > 0.5 && offset < 5) {
      return offset + 0.14;
    }
  } catch {
    // A fallback keeps the avatar usable while unusual models finish loading.
  }
  return fallback;
}

export function createNameTag(scene, rawName) {
  const name = cleanName(rawName);
  const width = textureWidth(name);
  const root = new BABYLON.TransformNode(`remote_name_tag_${name}`, scene);
  root.metadata = { isMultiplayerNameTag: true };
  const texture = new BABYLON.DynamicTexture(
    `remote_name_texture_${name}`,
    { width, height: TEXTURE_HEIGHT },
    scene,
    false,
  );
  texture.hasAlpha = true;
  const context = texture.getContext();
  context.clearRect(0, 0, width, TEXTURE_HEIGHT);
  context.font = FONT;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.lineWidth = 8;
  context.strokeStyle = "rgba(0, 0, 0, 0.9)";
  context.strokeText(name, width / 2, TEXTURE_HEIGHT / 2);
  context.fillStyle = "#f4f7f8";
  context.fillText(name, width / 2, TEXTURE_HEIGHT / 2);
  texture.update(true);

  const material = new BABYLON.StandardMaterial(
    `remote_name_material_${name}`,
    scene,
  );
  material.diffuseTexture = texture;
  material.opacityTexture = texture;
  material.emissiveTexture = texture;
  material.disableLighting = true;
  material.backFaceCulling = false;
  material.specularColor = BABYLON.Color3.Black();
  material.useAlphaFromDiffuseTexture = true;

  const plane = BABYLON.MeshBuilder.CreatePlane(
    `remote_name_plane_${name}`,
    {
      width: PLANE_HEIGHT * (width / TEXTURE_HEIGHT),
      height: PLANE_HEIGHT,
    },
    scene,
  );
  plane.parent = root;
  plane.material = material;
  plane.isPickable = false;
  plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_Y;
  // Water is alpha-blended and intentionally does not write depth. Render
  // labels after that pass while retaining the opaque world's depth buffer,
  // so water cannot wash over names and walls can still occlude them.
  scene.setRenderingAutoClearDepthStencil(2, false, false, false);
  plane.renderingGroupId = 2;
  plane.metadata = { isMultiplayerNameTag: true };

  return {
    setPosition(position, height) {
      root.position.set(position.x, position.y + height, position.z);
    },
    dispose() {
      plane.dispose();
      material.dispose();
      texture.dispose();
      root.dispose();
    },
  };
}
