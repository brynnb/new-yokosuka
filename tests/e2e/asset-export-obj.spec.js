import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { strFromU8, unzipSync } from "fflate";

async function downloadExport(page, selector) {
  await page.locator("#export-fab").click();
  const downloadEvent = page.waitForEvent("download");
  await page.locator(selector).click();
  const download = await downloadEvent;
  expect(await download.failure()).toBeNull();
  return { name: download.suggestedFilename(), bytes: await readFile(await download.path()) };
}

// Resolve each face vertex into its actual position and UV. An importer counts
// these indices across objects and reads texture V from the bottom of the PNG.
function readFaces(obj) {
  const vertices = [];
  const uvs = [];
  const faces = [];
  let material;
  for (const line of obj.split(/\r?\n/)) {
    const [keyword, ...args] = line.trim().split(/\s+/);
    if (keyword === "v") vertices.push(args.map(Number));
    if (keyword === "vt") uvs.push(args.map(Number));
    if (keyword === "usemtl") material = args.join(" ");
    if (keyword === "f") {
      const corners = args.map(ref => {
        const [vertex, uv] = ref.split("/").map(Number);
        return { position: vertices[vertex - 1], uv: uvs[uv - 1] };
      }).sort((a, b) => a.position[1] - b.position[1]);
      faces.push({ material, corners });
    }
  }
  return faces.sort((a, b) => Math.abs(a.corners[0].position[0]) - Math.abs(b.corners[0].position[0]));
}

async function decodePng(page, bytes) {
  return page.evaluate(async data => {
    const image = await createImageBitmap(new Blob([new Uint8Array(data)], { type: "image/png" }));
    const canvas = new OffscreenCanvas(image.width, image.height);
    const context = canvas.getContext("2d");
    context.drawImage(image, 0, 0);
    image.close();
    return { width: canvas.width, height: canvas.height,
      pixels: [...context.getImageData(0, 0, canvas.width, canvas.height).data] };
  }, [...bytes]);
}

function sample(image, [u, v]) {
  const x = Math.floor(u * image.width);
  const y = Math.floor((1 - v) * image.height);
  const offset = 4 * (y * image.width + x);
  return image.pixels.slice(offset, offset + 4);
}

test("the full OBJ archive resolves its geometry, material names, colors, and opacity", async ({ page }) => {
  test.skip(Boolean(process.env.E2E_PREVIEW_ORIGIN), "The generated scene uses Vite source modules");
  test.setTimeout(120_000);
  await page.route("**/models.json", route => route.fulfill({ json: [] }));
  await page.goto("/asset-viewer/");
  await page.getByRole("button", { name: "Dobuita", exact: true }).click();
  await page.locator("#export-fab").click();
  await page.locator("#export-full-obj-btn").click();
  await expect(page.locator("#export-progress-label")).toContainText(/select a model/i);
  await expect(page.locator("#export-fab")).toBeEnabled();

  await page.evaluate(async () => {
    const { default: state } = await import("/src/state.js");
    await state.sceneLoadTask;
    const core = performance.getEntriesByType("resource").find(entry => entry.name.includes("/deps/@babylonjs_core.js"));
    const { Mesh, StandardMaterial, RawTexture, VertexData } = await import(core.name);
    const pixels = [
      [255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 0, 255],
      [255, 0, 255, 64, 0, 255, 255, 160, 255, 255, 255, 224, 0, 0, 0, 0],
    ];
    const materials = pixels.map((rgba, index) => {
      const material = new StandardMaterial("mt5_mat_0", state.scene);
      const texture = RawTexture.CreateRGBATexture(new Uint8Array(rgba), 2, 2, state.scene, false, false);
      texture.name = "";
      texture.hasAlpha = index === 1;
      material.diffuseTexture = texture;
      material.useAlphaFromDiffuseTexture = texture.hasAlpha;
      material.transparencyMode = texture.hasAlpha ? StandardMaterial.MATERIAL_ALPHABLEND : StandardMaterial.MATERIAL_OPAQUE;
      return material;
    });
    for (const [index, material] of [materials[0], materials[1], materials[0]].entries()) {
      const mesh = new Mesh("part-" + index, state.scene);
      const geometry = new VertexData();
      geometry.positions = [0, 0, 0, 1, 1, 0, 0, 2, 0];
      geometry.normals = [0, 0, 1, 0, 0, 1, 0, 0, 1];
      geometry.uvs = [0.25, 0.25, 0.75, 0.25, 0.25, 0.75];
      geometry.indices = [0, 1, 2];
      geometry.applyToMesh(mesh);
      mesh.position.x = 4 * index;
      mesh.material = material;
      mesh._filename = "S1_D000_MAP.MT5";
      state.currentMeshes.push(mesh);
    }
  });

  const archive = await downloadExport(page, "#export-full-obj-btn");
  expect(archive.name).toBe("Dobuita-OBJ.zip");
  const files = unzipSync(archive.bytes);
  const objFiles = Object.keys(files).filter(name => name.endsWith(".obj"));
  expect(objFiles).toHaveLength(1);
  const objName = objFiles[0];
  expect(objName).toBe("Dobuita.obj");
  const obj = strFromU8(files[objName]);
  const mtlName = objName.replace(/\.obj$/i, ".mtl");
  expect([...obj.matchAll(/^mtllib (.+)$/gm)].map(match => match[1].trim())).toEqual([mtlName]);
  const mtl = strFromU8(files[mtlName]);
  const materials = new Map();
  for (const entry of mtl.split(/^newmtl[ \t]+/m).slice(1)) {
    const [name, ...properties] = entry.trim().split(/\r?\n/);
    expect(materials.has(name)).toBe(false);
    materials.set(name, properties.join("\n"));
  }
  expect(materials.size).toBe(2);
  const faces = readFaces(obj);
  expect(faces).toHaveLength(3);
  expect(new Set(faces.map(face => face.material))).toEqual(new Set(materials.keys()));
  expect(faces[0].material).toBe(faces[2].material);
  expect(faces[0].material).not.toBe(faces[1].material);

  const diffusePaths = new Set();
  for (const [index, face] of faces.slice(0, 2).entries()) {
    const block = materials.get(face.material);
    const colorPath = /^\s*map_Kd\s+(.+?)\s*$/m.exec(block)?.[1];
    expect(colorPath).toMatch(/^textures\/[\w.-]+\.png$/i);
    diffusePaths.add(colorPath);
    const image = await decodePng(page, files[colorPath]);
    expect([image.width, image.height]).toEqual([2, 2]);
    const colors = face.corners.map(({ uv }) => sample(image, uv).slice(0, 3));
    // With invertY=false the first uploaded RGBA row is the lower UV row.
    expect(colors).toEqual(index === 0
      ? [[255, 0, 0], [0, 255, 0], [0, 0, 255]]
      : [[255, 0, 255], [0, 255, 255], [255, 255, 255]]);
    const opacity = /^\s*map_d\s+(.+?)\s*$/m.exec(block);
    if (index === 0) {
      expect(opacity).toBeNull();
    } else {
      expect(opacity).not.toBeNull();
      const opacityPath = opacity[1].trim().split(/\s+/).at(-1);
      expect(opacityPath).toMatch(/^textures\/[\w.-]+\.png$/i);
      const mask = await decodePng(page, files[opacityPath]);
      const channel = /-imfchan\s+[am]\b/.test(opacity[1]) ? 3 : 0;
      expect(face.corners.map(({ uv }) => sample(mask, uv)[channel])).toEqual([64, 160, 224]);
    }
  }
  expect(diffusePaths.size).toBe(2);

  const geometry = await downloadExport(page, "#export-obj-btn");
  expect(geometry.name).toBe(objName);
  const plainObj = geometry.bytes.toString("utf8");
  expect(plainObj).not.toMatch(/^(?:mtllib|usemtl)\s/m);
  expect(readFaces(plainObj).map(face => face.corners)).toEqual(faces.map(face => face.corners));
  const separateMtl = await downloadExport(page, "#export-mtl-btn");
  expect(separateMtl.name).toBe(mtlName);
  expect(separateMtl.bytes.toString("utf8")).toBe(mtl);
});
