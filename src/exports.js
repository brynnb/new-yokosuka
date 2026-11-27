import * as BABYLON from "@babylonjs/core";
import { GLTF2Export } from "@babylonjs/serializers/glTF";
import { GLTFExporter } from "@babylonjs/serializers/glTF/2.0/glTFExporter.js";
import { OBJExport } from "@babylonjs/serializers/OBJ";
import { STLExport } from "@babylonjs/serializers/stl";
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

function shouldExportNode(node) {
  const name = node.name.toLowerCase();
  return !name.includes("sky") && !name.includes("light") && !name.includes("camera");
}

const getExportMeshes = () => {
  const meshesToExport = [];
  state.currentMeshes.forEach((node) => {
    if (node instanceof BABYLON.Mesh) {
      meshesToExport.push(node);
    }
    node.getChildMeshes().forEach((child) => {
      if (child instanceof BABYLON.Mesh) meshesToExport.push(child);
    });
  });
  return [...new Set(meshesToExport)].filter(shouldExportNode);
};

const downloadFile = (content, filename) => {
  const b = new Blob([content], { type: "text/plain" });
  const u = URL.createObjectURL(b);
  const l = document.createElement("a");
  l.href = u;
  l.download = filename;
  document.body.appendChild(l);
  l.click();
  document.body.removeChild(l);
  setTimeout(() => URL.revokeObjectURL(u), 100);
};

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
    if (state.currentMeshes.length === 0) {
      showExportError("Select a model before exporting.");
      return;
    }

    const filename = state.currentMeshes[0]._filename || "model";
    const exportName = filename.split("/").pop().replace(/\.mt5$/i, "") + ".glb";
    const scene = state.scene;
    const loadId = state.currentLoadId;
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
      scene.materials.forEach((mat) => {
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
      scene.meshes.forEach((mesh) => {
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

  document.getElementById("export-full-obj-btn").onclick = (e) => {
    e.stopPropagation();
    exportModal.classList.add("hidden");
    if (state.currentMeshes.length === 0) {
      setStatus("Error: No model loaded to export");
      return;
    }

    const filename = state.currentMeshes[0]._filename || "model.obj";
    const exportBase = filename
      .split("/")
      .pop()
      .replace(".MT5", "")
      .replace(".mt5", "");

    setStatus(`Exporting ${exportBase} (Full)...`, true);
    try {
      const uniqueMeshes = getExportMeshes();
      if (uniqueMeshes.length === 0) {
        setStatus("Error: No exportable geometry found");
        return;
      }

      // 1. Export OBJ
      const objContent = OBJExport.OBJ(
        uniqueMeshes,
        true,
        exportBase + ".mtl",
        true,
      );
      downloadFile(objContent, exportBase + ".obj");

      // 2. Export MTL
      let mtlContent = "";
      const processedMaterials = new Set();
      uniqueMeshes.forEach((m) => {
        if (m.material && !processedMaterials.has(m.material)) {
          mtlContent += OBJExport.MTL(m) + "\n";
          processedMaterials.add(m.material);
        }
      });

      if (mtlContent) {
        downloadFile(mtlContent, exportBase + ".mtl");
      }

      setStatus(`Exported ${exportBase} OBJ + MTL`);
    } catch (err) {
      console.error("Full OBJ Export failed", err);
      setStatus("Export Error: " + err.message);
    }
  };

  document.getElementById("export-obj-btn").onclick = (e) => {
    e.stopPropagation();
    exportModal.classList.add("hidden");
    if (state.currentMeshes.length === 0) {
      setStatus("Error: No model loaded to export");
      return;
    }

    const filename = state.currentMeshes[0]._filename || "model.obj";
    const exportBase = filename
      .split("/")
      .pop()
      .replace(".MT5", "")
      .replace(".mt5", "");

    setStatus(`Exporting ${exportBase}.obj...`, true);
    try {
      const uniqueMeshes = getExportMeshes();
      if (uniqueMeshes.length === 0) {
        setStatus("Error: No exportable geometry found");
        return;
      }

      const objContent = OBJExport.OBJ(
        uniqueMeshes,
        true,
        exportBase + ".mtl",
        true,
      );
      downloadFile(objContent, exportBase + ".obj");
      setStatus(`Exported ${exportBase}.obj`);
    } catch (err) {
      console.error("OBJ Export failed", err);
      setStatus("Export Error: " + err.message);
    }
  };

  document.getElementById("export-mtl-btn").onclick = (e) => {
    e.stopPropagation();
    exportModal.classList.add("hidden");
    if (state.currentMeshes.length === 0) {
      setStatus("Error: No model loaded to export");
      return;
    }

    const filename = state.currentMeshes[0]._filename || "model.mtl";
    const exportBase = filename
      .split("/")
      .pop()
      .replace(".MT5", "")
      .replace(".mt5", "");

    setStatus(`Exporting ${exportBase}.mtl...`, true);
    try {
      const uniqueMeshes = getExportMeshes();
      let mtlContent = "";
      const processedMaterials = new Set();
      uniqueMeshes.forEach((m) => {
        if (m.material && !processedMaterials.has(m.material)) {
          mtlContent += OBJExport.MTL(m) + "\n";
          processedMaterials.add(m.material);
        }
      });

      if (!mtlContent) {
        setStatus("Error: No materials found to export");
        return;
      }

      downloadFile(mtlContent, exportBase + ".mtl");
      setStatus(`Exported ${exportBase}.mtl`);
    } catch (err) {
      console.error("MTL Export failed", err);
      setStatus("Export Error: " + err.message);
    }
  };

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
