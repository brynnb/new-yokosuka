import * as BABYLON from "@babylonjs/core";
import state from "./state.js";
import { INTERIOR_SCENES } from "./constants.js";

export function updateCameraSpeed(size) {
  if (size < 5) {
    state.speedMultiplier = 0.1;
  } else if (size > 50) {
    state.speedMultiplier = 2.0;
  } else {
    state.speedMultiplier = 0.5;
  }

  const speedDisplay = document.getElementById("speed-display");
  if (speedDisplay) {
    speedDisplay.innerText = `${state.speedMultiplier.toFixed(1)}x`;
  }

  // Only enable logarithmic depth for large scenes where z-fighting matters.
  // It adds per-fragment math to every shader, so skip it for small models.
  if (state.scene) {
    state.scene.useLogarithmicDepth = (size >= 50);
  }
}

export function createScene() {
  const scene = new BABYLON.Scene(state.engine);
  // Logarithmic depth is expensive (per-fragment math in every shader).
  // Disabled by default; enabled conditionally for large scenes in updateCameraSpeed().
  scene.useLogarithmicDepth = false;

  scene.clearColor = new BABYLON.Color4(0.02, 0.02, 0.03, 1);
  scene.ambientColor = new BABYLON.Color3(0.3, 0.3, 0.3);

  // Use UniversalCamera for true FPS controls
  const camera = new BABYLON.UniversalCamera(
    "camera",
    new BABYLON.Vector3(0, 5, -20),
    scene,
  );
  camera.setTarget(BABYLON.Vector3.Zero());
  camera.attachControl(state.canvas, true);

  // Fix clipping planes
  camera.minZ = 0.1;
  camera.maxZ = 100000; // Drastically increased for large maps

  // Disable default keyboard controls (we'll handle them ourselves)
  camera.keysUp = [];
  camera.keysDown = [];
  camera.keysLeft = [];
  camera.keysRight = [];

  // Pointer lock state
  let isPointerLocked = false;
  const mouseSensitivity = 0.002;
  let yaw = 0; // Horizontal rotation
  let pitch = 0; // Vertical rotation

  // Click to capture mouse
  state.canvas.addEventListener("click", () => {
    if (!isPointerLocked) {
      state.canvas.requestPointerLock();
    }
  });

  // Track pointer lock state
  const controlsOverlay = document.getElementById("controls-overlay");
  const speedDisplay = document.getElementById("speed-display");
  const pointerHint = document.getElementById("pointer-hint");

  document.addEventListener("pointerlockchange", () => {
    isPointerLocked = document.pointerLockElement === state.canvas;
    if (isPointerLocked) {
      // Disable all default camera controls when pointer is locked
      camera.detachControl();
      // Sync our yaw/pitch with current camera rotation
      yaw = camera.rotation.y;
      pitch = camera.rotation.x;
      setStatusText("FPS Mode - Press ESC to exit");
      if (controlsOverlay) controlsOverlay.classList.remove("hidden");
      if (pointerHint) pointerHint.classList.add("hidden");
    } else {
      // Re-enable default camera controls
      camera.attachControl(state.canvas, true);
      setStatusText("Click canvas for FPS mode");
      if (controlsOverlay) controlsOverlay.classList.add("hidden");
      if (pointerHint) pointerHint.classList.remove("hidden");
    }
  });

  // Key state tracking
  const keys = {};

  // FPS mouse look - true first person rotation
  document.addEventListener("mousemove", (e) => {
    if (!isPointerLocked) return;

    // Update yaw (left/right) and pitch (up/down)
    // Positive movementX = mouse moved right = look right = increase yaw
    yaw += e.movementX * mouseSensitivity;
    // Positive movementY = mouse moved down = look down = increase pitch
    pitch += e.movementY * mouseSensitivity;

    // Clamp pitch to prevent flipping
    pitch = Math.max(-Math.PI / 2 + 0.1, Math.min(Math.PI / 2 - 0.1, pitch));

    // Apply rotation to camera
    camera.rotation.x = pitch;
    camera.rotation.y = yaw;

  });

  const handleKeyDown = (e) => {
    const code = e.code;
    keys[code] = true;
    // Speed adjustment
    if (code === "KeyE" && isPointerLocked) {
      state.speedMultiplier *= 2;
      setStatusText(`FPS Mode | Speed: ${state.speedMultiplier.toFixed(1)}x`);
      if (speedDisplay)
        speedDisplay.innerText = `${state.speedMultiplier.toFixed(1)}x`;
    }
    if (code === "KeyQ" && isPointerLocked) {
      state.speedMultiplier *= 0.5;
      setStatusText(`FPS Mode | Speed: ${state.speedMultiplier.toFixed(1)}x`);
      if (speedDisplay)
        speedDisplay.innerText = `${state.speedMultiplier.toFixed(1)}x`;
    }

    // Prevent default for keys we use
    if (
      isPointerLocked &&
      (code === "Space" ||
        code === "ArrowUp" ||
        code === "ArrowDown" ||
        code === "ArrowLeft" ||
        code === "ArrowRight")
    ) {
      e.preventDefault();
    }
  };

  const handleKeyUp = (e) => {
    keys[e.code] = false;

  };

  // Use capture phase on document to intercept keys before anything can swallow them.
  // Firefox during pointer lock may not bubble Shift to window in some configurations.
  document.addEventListener("keydown", handleKeyDown, true);
  document.addEventListener("keyup", handleKeyUp, true);

  // FPS-style WASD movement
  scene.onBeforeRenderObservable.add(() => {
    if (!isPointerLocked) return; // Only move in FPS mode

    const baseSpeed = 0.5;
    const speed = baseSpeed * state.speedMultiplier;

    // Get camera's forward and right vectors (on XZ plane)
    const forward = camera.getDirection(BABYLON.Vector3.Forward());
    const forwardFlat = new BABYLON.Vector3(
      forward.x,
      0,
      forward.z,
    ).normalize();
    const right = new BABYLON.Vector3(forwardFlat.z, 0, -forwardFlat.x); // Perpendicular on XZ

    // Movement vectors
    let moveVector = BABYLON.Vector3.Zero();

    // W/S - Forward/Backward
    if (keys["KeyW"] || keys["ArrowUp"]) moveVector.addInPlace(forwardFlat.scale(speed));
    if (keys["KeyS"] || keys["ArrowDown"]) moveVector.addInPlace(forwardFlat.scale(-speed));

    // A/D - Strafe Left/Right
    if (keys["KeyA"] || keys["ArrowLeft"]) moveVector.addInPlace(right.scale(-speed));
    if (keys["KeyD"] || keys["ArrowRight"]) moveVector.addInPlace(right.scale(speed));

    // Space/C - Vertical movement
    if (keys["Space"]) moveVector.y += speed;
    if (keys["KeyC"]) moveVector.y -= speed;

    // Apply movement
    if (moveVector.length() > 0) {
      camera.position.addInPlace(moveVector);
    }
  });

  return scene;
}

export function fitCameraToMeshes(meshes) {
  const scene = state.scene;
  let min = new BABYLON.Vector3(Infinity, Infinity, Infinity);
  let max = new BABYLON.Vector3(-Infinity, -Infinity, -Infinity);
  let foundMesh = false;

  meshes.forEach((m) => {
    const boundingInfo = m.getHierarchyBoundingVectors(true);
    // Sanity check for massive/empty bounds
    if (boundingInfo.min.x !== Infinity && !isNaN(boundingInfo.min.x)) {
      if (
        BABYLON.Vector3.Distance(boundingInfo.min, boundingInfo.max) < 100000
      ) {
        min = BABYLON.Vector3.Minimize(min, boundingInfo.min);
        max = BABYLON.Vector3.Maximize(max, boundingInfo.max);
        foundMesh = true;
      }
    }
  });

  if (!foundMesh) {
    console.warn("[Viewer] No valid geometry found for camera target");
    scene.activeCamera.position = new BABYLON.Vector3(0, 5, -20);
    scene.activeCamera.setTarget(BABYLON.Vector3.Zero());
    return;
  }

  const center = BABYLON.Vector3.Center(min, max);
  const diag = BABYLON.Vector3.Distance(min, max);
  const size = Math.max(diag, 0.1);

  // HEURISTIC: For medium-sized models (buildings/chunks), place camera AT specific point
  // This is useful for browsing world map chunks that are pre-positioned.
  if (size >= 5 && size < 50) {
    scene.activeCamera.position = new BABYLON.Vector3(-10, 10, 10);
    scene.activeCamera.setTarget(center);
  } else {
    // Position camera at a distance from the center, looking at it
    // 3x closer for models under 100 (0.5 multiplier instead of 1.5)
    let distance = size * 1.5;
    if (size >= 5 && size < 100) {
      distance = size * 0.5;
    }

    // Cap max distance at 150 for giant maps
    distance = Math.min(distance, 150);

    scene.activeCamera.position = new BABYLON.Vector3(
      center.x - distance,
      center.y + distance * 0.5,
      center.z + distance,
    );
    scene.activeCamera.setTarget(center);
  }

  return size;
}

// Detect if the current scene is an interior (no exterior sky needed)
export function detectInteriorScene(size = null) {
  // HEURISTIC: If the model is small, it's likely an object/prop/character, not a world map.
  // Small models shouldn't have a giant sky dome around them.
  if (size !== null && size < 30) {
    return true;
  }

  for (const mesh of state.currentMeshes) {
    const name = (mesh._filename || mesh.name).toUpperCase();
    for (const interior of INTERIOR_SCENES) {
      if (name.includes(interior)) {
        return true;
      }
    }
  }
  return false;
}

// Private helper — setStatus without importing circular deps
function setStatusText(text) {
  const statusEl = document.getElementById("status");
  if (statusEl) statusEl.innerText = text;
}
