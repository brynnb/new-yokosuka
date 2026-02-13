import * as BABYLON from "@babylonjs/core";
import state from "./state.js";

// Helper: Babylon Color3 → hex string
function color3ToHex(c) {
  const r = Math.round(c.r * 255).toString(16).padStart(2, "0");
  const g = Math.round(c.g * 255).toString(16).padStart(2, "0");
  const b = Math.round(c.b * 255).toString(16).padStart(2, "0");
  return `#${r}${g}${b}`;
}

// Helper: hex string → Babylon Color3
function hexToColor3(hex) {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return new BABYLON.Color3(r, g, b);
}

// Bind a range slider to a property
function bindSlider(sliderId, valId, getter, setter) {
  const slider = document.getElementById(sliderId);
  const valEl = document.getElementById(valId);
  if (!slider) return;
  slider.oninput = () => {
    const v = parseFloat(slider.value);
    setter(v);
    if (valEl) valEl.textContent = v.toFixed(2);
  };
  return { slider, valEl };
}

// Bind a color picker to a Color3 property
function bindColor(pickerId, getter, setter) {
  const picker = document.getElementById(pickerId);
  if (!picker) return;
  picker.oninput = () => setter(hexToColor3(picker.value));
  return picker;
}

// Track ambient base color separately from intensity multiplier
let ambientBaseColor = new BABYLON.Color3(0.3, 0.3, 0.3);
let ambientIntensity = 1.0;

function updateAmbientFromBaseAndIntensity() {
  state.scene.ambientColor = new BABYLON.Color3(
    Math.min(ambientBaseColor.r * ambientIntensity, 1),
    Math.min(ambientBaseColor.g * ambientIntensity, 1),
    Math.min(ambientBaseColor.b * ambientIntensity, 1),
  );
}

// Sync panel UI from current scene state
export function syncLightingPanel() {
  const { hemiLight, skyLight, directLight, fillLight, scene } = state;
  if (!hemiLight) return;

  const s = (id, v) => {
    const el = document.getElementById(id);
    if (el) { el.value = v; }
  };
  const sv = (id, v) => {
    const el = document.getElementById(id);
    if (el) { el.textContent = parseFloat(v).toFixed(2); }
  };

  // Scene ambient — reverse-engineer base color from scene.ambientColor / intensity
  ambientBaseColor = scene.ambientColor.clone();
  if (ambientIntensity > 0) {
    ambientBaseColor = new BABYLON.Color3(
      Math.min(scene.ambientColor.r / ambientIntensity, 1),
      Math.min(scene.ambientColor.g / ambientIntensity, 1),
      Math.min(scene.ambientColor.b / ambientIntensity, 1),
    );
  }
  s("lp-ambient-color", color3ToHex(ambientBaseColor));
  s("lp-ambient-intensity", ambientIntensity);
  sv("lp-ambient-intensity-val", ambientIntensity);

  // Hemispheric
  s("lp-hemi-intensity", hemiLight.intensity);
  sv("lp-hemi-intensity-val", hemiLight.intensity);
  s("lp-hemi-diffuse", color3ToHex(hemiLight.diffuse));
  s("lp-hemi-ground", color3ToHex(hemiLight.groundColor));
  s("lp-hemi-dir-y", hemiLight.direction.y);
  sv("lp-hemi-dir-y-val", hemiLight.direction.y);

  // Sky light
  s("lp-sky-intensity", skyLight.intensity);
  sv("lp-sky-intensity-val", skyLight.intensity);
  s("lp-sky-color", color3ToHex(skyLight.diffuse));

  // Directional
  s("lp-dir-intensity", directLight.intensity);
  sv("lp-dir-intensity-val", directLight.intensity);
  s("lp-dir-color", color3ToHex(directLight.diffuse));
  s("lp-dir-x", directLight.direction.x);
  sv("lp-dir-x-val", directLight.direction.x);
  s("lp-dir-y", directLight.direction.y);
  sv("lp-dir-y-val", directLight.direction.y);
  s("lp-dir-z", directLight.direction.z);
  sv("lp-dir-z-val", directLight.direction.z);

  // Fill light
  s("lp-fill-intensity", fillLight.intensity);
  sv("lp-fill-intensity-val", fillLight.intensity);
  s("lp-fill-color", color3ToHex(fillLight.diffuse));

  // Material emissive (read from first material in scene)
  const firstMat = scene.materials.find(m => m.emissiveColor);
  if (firstMat) {
    s("lp-emissive-color", color3ToHex(firstMat.emissiveColor));
  }
}

export function initLightingPanel() {
  const lightingPanel = document.getElementById("lighting-panel");
  const lightingToggleBtn = document.getElementById("lighting-toggle-btn");
  const lpClose = document.getElementById("lp-close");

  if (lightingToggleBtn && lightingPanel) {
    lightingToggleBtn.onclick = () => {
      lightingPanel.classList.toggle("hidden");
      if (!lightingPanel.classList.contains("hidden")) {
        syncLightingPanel();
      }
    };
  }
  if (lpClose && lightingPanel) {
    lpClose.onclick = () => lightingPanel.classList.add("hidden");
  }

  // Wire up all controls
  bindColor("lp-ambient-color",
    () => ambientBaseColor,
    (c) => {
      ambientBaseColor = c;
      updateAmbientFromBaseAndIntensity();
    }
  );
  bindSlider("lp-ambient-intensity", "lp-ambient-intensity-val",
    () => ambientIntensity,
    (v) => {
      ambientIntensity = v;
      updateAmbientFromBaseAndIntensity();
    }
  );

  bindSlider("lp-hemi-intensity", "lp-hemi-intensity-val",
    () => state.hemiLight.intensity,
    (v) => { state.hemiLight.intensity = v; }
  );
  bindColor("lp-hemi-diffuse",
    () => state.hemiLight.diffuse,
    (c) => { state.hemiLight.diffuse = c; }
  );
  bindColor("lp-hemi-ground",
    () => state.hemiLight.groundColor,
    (c) => { state.hemiLight.groundColor = c; }
  );
  bindSlider("lp-hemi-dir-y", "lp-hemi-dir-y-val",
    () => state.hemiLight.direction.y,
    (v) => { state.hemiLight.direction.y = v; }
  );

  bindSlider("lp-sky-intensity", "lp-sky-intensity-val",
    () => state.skyLight.intensity,
    (v) => { state.skyLight.intensity = v; }
  );
  bindColor("lp-sky-color",
    () => state.skyLight.diffuse,
    (c) => { state.skyLight.diffuse = c; }
  );

  bindSlider("lp-dir-intensity", "lp-dir-intensity-val",
    () => state.directLight.intensity,
    (v) => { state.directLight.intensity = v; }
  );
  bindColor("lp-dir-color",
    () => state.directLight.diffuse,
    (c) => { state.directLight.diffuse = c; }
  );
  bindSlider("lp-dir-x", "lp-dir-x-val",
    () => state.directLight.direction.x,
    (v) => { state.directLight.direction.x = v; }
  );
  bindSlider("lp-dir-y", "lp-dir-y-val",
    () => state.directLight.direction.y,
    (v) => { state.directLight.direction.y = v; }
  );
  bindSlider("lp-dir-z", "lp-dir-z-val",
    () => state.directLight.direction.z,
    (v) => { state.directLight.direction.z = v; }
  );

  bindSlider("lp-fill-intensity", "lp-fill-intensity-val",
    () => state.fillLight.intensity,
    (v) => { state.fillLight.intensity = v; }
  );
  bindColor("lp-fill-color",
    () => state.fillLight.diffuse,
    (c) => { state.fillLight.diffuse = c; }
  );

  // Material emissive: applies to ALL materials in the scene
  bindColor("lp-emissive-color",
    () => {
      const m = state.scene.materials.find(m => m.emissiveColor);
      return m ? m.emissiveColor : new BABYLON.Color3(0.08, 0.08, 0.08);
    },
    (c) => {
      state.scene.materials.forEach((m) => {
        if (m.emissiveColor) m.emissiveColor = c;
      });
    }
  );

  // Copy all current values to clipboard as JSON
  const lpCopyBtn = document.getElementById("lp-copy-values");
  if (lpCopyBtn) {
    lpCopyBtn.onclick = () => {
      const { hemiLight, skyLight, directLight, fillLight, scene } = state;
      const values = {
        scene: {
          ambientColor: [+scene.ambientColor.r.toFixed(3), +scene.ambientColor.g.toFixed(3), +scene.ambientColor.b.toFixed(3)],
        },
        hemiLight: {
          intensity: +hemiLight.intensity.toFixed(2),
          diffuse: [+hemiLight.diffuse.r.toFixed(3), +hemiLight.diffuse.g.toFixed(3), +hemiLight.diffuse.b.toFixed(3)],
          groundColor: [+hemiLight.groundColor.r.toFixed(3), +hemiLight.groundColor.g.toFixed(3), +hemiLight.groundColor.b.toFixed(3)],
          directionY: +hemiLight.direction.y.toFixed(1),
        },
        skyLight: {
          intensity: +skyLight.intensity.toFixed(2),
          diffuse: [+skyLight.diffuse.r.toFixed(3), +skyLight.diffuse.g.toFixed(3), +skyLight.diffuse.b.toFixed(3)],
        },
        directLight: {
          intensity: +directLight.intensity.toFixed(2),
          diffuse: [+directLight.diffuse.r.toFixed(3), +directLight.diffuse.g.toFixed(3), +directLight.diffuse.b.toFixed(3)],
          direction: [+directLight.direction.x.toFixed(1), +directLight.direction.y.toFixed(1), +directLight.direction.z.toFixed(1)],
        },
        fillLight: {
          intensity: +fillLight.intensity.toFixed(2),
          diffuse: [+fillLight.diffuse.r.toFixed(3), +fillLight.diffuse.g.toFixed(3), +fillLight.diffuse.b.toFixed(3)],
        },
        materialEmissive: (() => {
          const m = scene.materials.find(m => m.emissiveColor);
          return m ? [+m.emissiveColor.r.toFixed(3), +m.emissiveColor.g.toFixed(3), +m.emissiveColor.b.toFixed(3)] : [0.08, 0.08, 0.08];
        })(),
      };
      navigator.clipboard.writeText(JSON.stringify(values, null, 2)).then(() => {
        lpCopyBtn.textContent = "Copied!";
        setTimeout(() => { lpCopyBtn.textContent = "Copy Values to Clipboard"; }, 1500);
      });
    };
  }
}
