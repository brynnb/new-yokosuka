import * as BABYLON from "@babylonjs/core";
import { GLTF2Export } from "@babylonjs/serializers/glTF";
import { OBJExport } from "@babylonjs/serializers/OBJ";
import { STLExport } from "@babylonjs/serializers/stl";
import state from "./state.js";
import { setStatus } from "./ui.js";

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
  return [...new Set(meshesToExport)].filter((m) => {
    const name = m.name.toLowerCase();
    return (
      !name.includes("sky") &&
      !name.includes("light") &&
      !name.includes("camera")
    );
  });
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

  exportFab.onclick = (e) => {
    e.stopPropagation();
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
    exportModal.classList.add("hidden");
    if (state.currentMeshes.length === 0) {
      setStatus("Error: No model loaded to export");
      return;
    }

    const filename = state.currentMeshes[0]._filename || "model.glb";
    const exportName =
      filename.split("/").pop().replace(".MT5", "").replace(".mt5", "") + ".glb";

    setStatus(`Exporting ${exportName}...`, true);
    try {
      const scene = state.scene;
      // Filter out sky and other non-model meshes
      const result = await GLTF2Export.GLBAsync(scene, exportName, {
        shouldExportNode: (node) => {
          return (
            !node.name.toLowerCase().includes("sky") &&
            !node.name.toLowerCase().includes("light") &&
            !node.name.toLowerCase().includes("camera")
          );
        },
      });

      // The glTF exporter converts StandardMaterial to PBR internally.
      const originalMaterials = new Map();
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
          mesh.material = originalMaterials.get(mesh.material);
        }
      });

      // Re-run export with PBR materials
      const pbrResult = await GLTF2Export.GLBAsync(scene, exportName, {
        shouldExportNode: (node) => {
          return (
            !node.name.toLowerCase().includes("sky") &&
            !node.name.toLowerCase().includes("light") &&
            !node.name.toLowerCase().includes("camera")
          );
        },
      });

      pbrResult.downloadFiles();

      // Restore original materials
      const reverseMap = new Map();
      originalMaterials.forEach((pbr, std) => reverseMap.set(pbr, std));

      scene.meshes.forEach((mesh) => {
        if (mesh.material && reverseMap.has(mesh.material)) {
          const std = reverseMap.get(mesh.material);
          mesh.material = std;
          mesh.material.onDisposeObservable.addOnce(() => { });
        }
      });
      originalMaterials.forEach((pbr) => pbr.dispose());
      setStatus(`Exported ${exportName}`);
    } catch (err) {
      console.error("GLB Export failed", err);
      setStatus("Export Error: " + err.message);
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
