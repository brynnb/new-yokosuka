import * as BABYLON from "@babylonjs/core";
import { GLTF2Export } from "@babylonjs/serializers/glTF";
import { GLTFExporter } from "@babylonjs/serializers/glTF/2.0/glTFExporter.js";
import { ASSET_VIEWER_MAIN_VIEWS } from "./AssetViewerMainViews.js";
import { STLExport } from "@babylonjs/serializers/stl";
import { viewerExportNodes } from "./ViewerExportSelection.js";
import { prepareViewerObjDownload } from "./ViewerObjDownload.js";
import state from "./state.js";
import { setStatus } from "./ui.js";

// Babylon calls this hook after the mesh's geometry and materials are serialized.
GLTFExporter.RegisterExtension("ViewerExportProgress", (exporter) => ({
  name: "ViewerExportProgress",
  enabled: true,
  required: false,
  wasUsed: false,
  dispose() {},
  postExportNodeAsync(_context, node, source) {
    if (source.subMeshes?.length) exporter.options.onViewerMeshExported?.();
    return Promise.resolve(node);
  },
}));

function getExportMeshes(includeInstances = false) {
  return [...viewerExportNodes(state.currentMeshes)].filter(mesh =>
    mesh.getTotalVertices?.() > 0 &&
    (mesh instanceof BABYLON.Mesh || (includeInstances && mesh instanceof BABYLON.InstancedMesh)));
}

function objExportName() {
  const prefix = state.currentScenePrefix;
  const view = prefix && ASSET_VIEWER_MAIN_VIEWS.find(view => view.prefix === prefix);
  const sceneName = view?.label || (prefix && (state.mapNames[prefix.split("_")[1]] || prefix));
  const file = state.currentMeshes[0]?._filename?.split("/").pop()?.replace(/\.(?:mt[57]|mapm|chrm)$/i, "");
  const name = sceneName || (!state.singleModelMode && state.currentZone) || file || "model";
  // OBJ importers disagree on quoting filenames. Use a portable single token for mtllib.
  const base = name.normalize("NFC").replace(/[^\p{L}\p{N}_.-]+/gu, "_").replace(/^[._-]+|[._-]+$/g, "") || "model";
  return /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/i.test(base) ? "_" + base : base;
}

function downloadFile(content, filename) {
  const blob = content instanceof Blob ? content : new Blob([content], {type: "text/plain"});
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export function initExportHandlers() {
  const exportModal = document.getElementById("export-options-modal");
  const exportFab = document.getElementById("export-fab");

  const progressPanel = document.getElementById("export-progress");
  const progressBar = document.getElementById("export-progress-bar");
  const progressLabel = document.getElementById("export-progress-label");
  const progressPercent = document.getElementById("export-progress-percent");

  function showProgress(label, percent) {
    progressPanel.hidden = false;
    progressLabel.textContent = label;
    progressBar.hidden = false;
    if (percent === undefined) {
      progressBar.removeAttribute("value");
      progressPercent.textContent = "";
    } else {
      progressBar.value = percent;
      progressPercent.textContent = percent + "%";
    }
  }

  function showExportError(message) {
    progressPanel.hidden = false;
    progressBar.hidden = true;
    progressPercent.textContent = "";
    progressLabel.textContent = message;
  }

  exportFab.onclick = (e) => {
    e.stopPropagation();
    progressPanel.hidden = true;
    exportModal.classList.toggle("hidden");
  };

  // Close modal when clicking anywhere else
  document.addEventListener("click", (e) => {
    if (!exportModal.contains(e.target) && e.target !== exportFab) {
      exportModal.classList.add("hidden");
    }
  });

  document.getElementById("export-glb-btn").onclick = async (e) => {
    e.stopPropagation();
    if (exportFab.disabled) return;
    exportModal.classList.add("hidden");
    const loadId = state.currentLoadId;
    exportFab.disabled = true;
    showProgress("Preparing export");
    await state.sceneLoadTask;
    if (loadId !== state.currentLoadId || !state.currentMeshes.length) {
      showExportError("Select a model before exporting.");
      exportFab.disabled = false;
      return;
    }

    const exportName = objExportName() + ".glb";
    const scene = state.scene;
    const exportNodes = viewerExportNodes(state.currentMeshes);
    const shouldExportNode = node => exportNodes.has(node);
    const originalMaterials = new Map();
    const swappedMeshes = new Map();
    const meshCount = scene.meshes.filter(mesh => mesh.subMeshes?.length && shouldExportNode(mesh)).length;
    let lastPercent = -1;

    async function exportPass(pass, label) {
      let completed = 0;
      showProgress(label, meshCount ? (pass - 1) * 50 : undefined);
      return GLTF2Export.GLBAsync(scene, exportName, {
        shouldExportNode,
        onViewerMeshExported() {
          if (!meshCount) return;
          completed++;
          const percent = Math.min(pass * 50 - 1, (pass - 1) * 50 + Math.floor(50 * completed / meshCount));
          if (percent !== lastPercent) {
            progressBar.value = percent;
            progressPercent.textContent = percent + "%";
            lastPercent = percent;
          }
        },
      });
    }

    exportFab.disabled = true;
    try {
      await exportPass(1, "Preparing geometry and textures");
      if (state.currentLoadId !== loadId) throw new Error("The selected model changed. Start the export again.");
      // Temporarily use unlit PBR materials for the downloadable pass.
      const exportMaterials = new Set([...exportNodes].map(node => node.material).filter(Boolean));
      exportMaterials.forEach((mat) => {
        if (mat instanceof BABYLON.StandardMaterial) {
          const pbr = new BABYLON.PBRMaterial(mat.name + "_export", scene);
          pbr.albedoTexture = mat.diffuseTexture;
          pbr.albedoColor = mat.diffuseColor;

          // Use UNLIT mode: no PBR lighting, just show the texture as-is
          pbr.unlit = true;

          // Fallback for viewers that don't support KHR_materials_unlit
          pbr.metallic = 0;
          pbr.roughness = 1;

          // Double-sided rendering
          pbr.backFaceCulling = false;
          pbr.twoSidedLighting = true;

          // Copy emissive for any glowing parts
          pbr.emissiveColor = mat.emissiveColor;

          // Copy transparency
          pbr.alpha = mat.alpha;
          pbr.transparencyMode = mat.transparencyMode;
          if (mat.diffuseTexture && mat.diffuseTexture.hasAlpha) {
            pbr.albedoTexture.hasAlpha = true;
            pbr.useAlphaFromAlbedoTexture = true;
          }

          originalMaterials.set(mat, pbr);
        }
      });

      // Temporarily apply PBR materials to meshes
      scene.meshes.filter(shouldExportNode).forEach((mesh) => {
        if (mesh.material && originalMaterials.has(mesh.material)) {
          swappedMeshes.set(mesh, mesh.material);
          mesh.material = originalMaterials.get(mesh.material);
        }
      });

      const result = await exportPass(2, "Writing geometry and textures");
      if (state.currentLoadId !== loadId) throw new Error("The selected model changed. Start the export again.");
      result.downloadFiles();
      showProgress("GLB download started", 100);
    } catch (err) {
      console.error("GLB Export failed", err);
      showExportError("GLB export failed. " + (err?.message || String(err)));
    } finally {
      try {
        for (const [mesh, original] of swappedMeshes) {
          if (!mesh.isDisposed() && mesh.material === originalMaterials.get(original)) {
            mesh.material = original;
          }
        }
        for (const pbr of originalMaterials.values()) pbr.dispose();
      } finally {
        exportFab.disabled = false;
      }
    }
  };

  async function exportObj(event, format) {
    event.stopPropagation();
    if (exportFab.disabled) return;
    exportModal.classList.add("hidden");
    exportFab.disabled = true;
    const loadId = state.currentLoadId;
    const assertSelection = () => {
      if (state.currentLoadId !== loadId) throw new Error("The selected model changed. Start the export again.");
    };
    try {
      showProgress("Preparing export");
      await state.sceneLoadTask;
      assertSelection();
      if (!state.currentMeshes.length) throw new Error("Select a model before exporting.");
      const download = await prepareViewerObjDownload(getExportMeshes(true), objExportName(), format, (label, percent) => {
        assertSelection();
        showProgress(label, percent);
      });
      assertSelection();
      downloadFile(download.blob, download.filename);
      showProgress(download.filename + " download started", 100);
    } catch (err) {
      console.error("Wavefront export failed", err);
      showExportError("Export failed. " + (err?.message || String(err)));
    } finally {
      exportFab.disabled = false;
    }
  }

  document.getElementById("export-full-obj-btn").onclick = event => exportObj(event, "zip");
  document.getElementById("export-obj-btn").onclick = event => exportObj(event, "obj");
  document.getElementById("export-mtl-btn").onclick = event => exportObj(event, "mtl");

  document.getElementById("export-stl-btn").onclick = (e) => {
    e.stopPropagation();
    exportModal.classList.add("hidden");
    if (state.currentMeshes.length === 0) {
      setStatus("Error: No model loaded to export");
      return;
    }

    const filename = state.currentMeshes[0]._filename || "model.stl";
    const exportBase = filename
      .split("/")
      .pop()
      .replace(".MT5", "")
      .replace(".mt5", "");

    setStatus(`Exporting ${exportBase}.stl...`, true);
    try {
      const uniqueMeshes = getExportMeshes();
      if (uniqueMeshes.length === 0) {
        setStatus("Error: No exportable geometry found");
        return;
      }

      const stlContent = STLExport.CreateSTL(
        uniqueMeshes,
        false,
        exportBase,
        false,
      );
      downloadFile(stlContent, exportBase + ".stl");
      setStatus(`Exported ${exportBase}.stl`);
    } catch (err) {
      console.error("STL Export failed", err);
      setStatus("Export Error: " + err.message);
    }
  };
}
