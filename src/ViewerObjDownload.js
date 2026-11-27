import { collectViewerObjMaterials, createViewerObjGeometry } from "./ViewerObjGeometry.js";
import { createViewerObjMaterials } from "./ViewerObjMaterials.js";

export async function prepareViewerObjDownload(meshes, base, format, report) {
  const geometry = format === "mtl" ? null : createViewerObjGeometry(meshes, base, {
    materials: format === "zip",
  });
  if (format === "obj") return {blob: new Blob([geometry.obj], {type: "text/plain"}), filename: base + ".obj"};

  const materials = geometry?.materials ?? collectViewerObjMaterials(meshes);
  if (!materials.size) throw new Error("No materials found in this selection.");
  const includeImages = format === "zip";
  const label = includeImages ? "Encoding materials and textures" : "Resolving material paths";
  let lastPercent;
  const {mtl, images} = await createViewerObjMaterials(materials, {
    includeImages,
    onProgress(completed, total) {
      const percent = Math.min(99, Math.floor(100 * completed / total));
      if (percent !== lastPercent) {
        report(label, percent);
        lastPercent = percent;
      }
    },
  });
  if (!includeImages) return {blob: new Blob([mtl], {type: "text/plain"}), filename: base + ".mtl"};

  report("Packing OBJ and textures");
  const { strToU8, zip } = await import("fflate");
  const files = {
    [base + ".obj"]: strToU8(geometry.obj),
    [base + ".mtl"]: strToU8(mtl),
  };
  // PNGs are already compressed. Only compress the Wavefront text.
  for (const [path, bytes] of images) files[path] = [bytes, {level: 0}];
  const archive = await new Promise((resolve, reject) => {
    zip(files, {level: 6}, (error, bytes) => error ? reject(error) : resolve(bytes));
  });
  return {blob: new Blob([archive], {type: "application/zip"}), filename: base + "-OBJ.zip"};
}
