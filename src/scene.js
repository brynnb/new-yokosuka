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

  const camera = state.scene?.activeCamera;
  if (camera instanceof BABYLON.ArcRotateCamera) {
    camera.lowerRadiusLimit = Math.max(0.01, size * 0.002);
    camera.upperRadiusLimit = Math.max(10, size * 20);
  }
}

export function setCameraPosition(camera, position) {
  if (typeof camera?.setPosition === "function") {
    camera.setPosition(position);
    return;
  }
  if (typeof camera?.position?.copyFrom === "function") {
    camera.position.copyFrom(position);
    return;
  }
  camera.position = position.clone?.() || position;
}

export function configureAssetViewerPointerInput(camera) {
  const pointerInput = camera?.inputs?.attached?.pointers;
  if (pointerInput) {
    pointerInput.buttons = [0, 2];
    pointerInput.angularSensibilityX = 1200;
    pointerInput.angularSensibilityY = 1200;
    pointerInput.panningSensibility = 0;
    pointerInput.multiTouchPanning = false;
    pointerInput.multiTouchPanAndZoom = false;
    pointerInput.pinchZoom = true;
    pointerInput.pinchDeltaPercentage = 0.01;
  }

  // Babylon 9 maps right-drag to pan by default. Since this viewer disables
  // panning, that new default made right-drag appear completely inert.
  camera?.movement?.input?.setInteraction?.(
    "pointer",
    { button: 2 },
    "rotate",
  );
}

function setFlyingControlsVisible(active) {
  const pointerHint = document.getElementById("pointer-hint");
  const controlsOverlay = document.getElementById("controls-overlay");
  const flyButton = document.getElementById("fly-controls-btn");

  pointerHint?.classList.toggle("hidden", active);
  controlsOverlay?.classList.toggle("hidden", !active);
  if (flyButton) {
    flyButton.classList.toggle("active", active);
    flyButton.textContent = active ? "Flying · Esc to exit" : "Fly camera";
    flyButton.setAttribute("aria-pressed", String(active));
  }
}

export function flyingCameraTarget(camera, distance) {
  const forward = camera.getDirection(BABYLON.Vector3.Forward());
  return camera.position.add(forward.scale(distance));
}

function installAssetViewerFlyingControls(scene, orbitCamera) {
  const flyButton = document.getElementById("fly-controls-btn");
  if (!flyButton) return;

  const flyingCamera = new BABYLON.UniversalCamera(
    "flying-camera",
    orbitCamera.position.clone(),
    scene,
  );
  flyingCamera.minZ = orbitCamera.minZ;
  flyingCamera.maxZ = orbitCamera.maxZ;
  flyingCamera.keysUp = [];
  flyingCamera.keysDown = [];
  flyingCamera.keysLeft = [];
  flyingCamera.keysRight = [];

  const keys = {};
  const mouseSensitivity = 0.002;
  let pointerLockRequested = false;
  let isFlying = false;
  let orbitDistance = orbitCamera.radius;
  let yaw = 0;
  let pitch = 0;

  const updateSpeedDisplay = () => {
    const speedDisplay = document.getElementById("speed-display");
    if (speedDisplay) {
      speedDisplay.innerText = `${state.speedMultiplier.toFixed(1)}x`;
    }
  };

  const beginFlying = () => {
    orbitDistance = Math.max(orbitCamera.radius, 0.01);
    flyingCamera.position.copyFrom(orbitCamera.position);
    flyingCamera.setTarget(orbitCamera.getTarget());
    yaw = flyingCamera.rotation.y;
    pitch = flyingCamera.rotation.x;
    orbitCamera.detachControl();
    scene.activeCamera = flyingCamera;
    isFlying = true;
    setFlyingControlsVisible(true);
    updateSpeedDisplay();
  };

  const endFlying = () => {
    if (!isFlying) return;
    Object.keys(keys).forEach((code) => {
      keys[code] = false;
    });
    orbitCamera.setPosition(flyingCamera.position);
    orbitCamera.setTarget(flyingCameraTarget(flyingCamera, orbitDistance));
    scene.activeCamera = orbitCamera;
    orbitCamera.attachControl(state.canvas, true);
    isFlying = false;
    setFlyingControlsVisible(false);
  };

  flyButton.addEventListener("click", () => {
    if (isFlying) {
      document.exitPointerLock?.();
      return;
    }
    pointerLockRequested = true;
    const request = state.canvas.requestPointerLock?.();
    request?.catch?.(() => {
      pointerLockRequested = false;
    });
  });

  document.addEventListener("pointerlockchange", () => {
    const canvasHasPointerLock = document.pointerLockElement === state.canvas;
    if (canvasHasPointerLock && pointerLockRequested) {
      pointerLockRequested = false;
      beginFlying();
    } else if (!canvasHasPointerLock) {
      pointerLockRequested = false;
      endFlying();
    }
  });

  document.addEventListener("mousemove", (event) => {
    if (!isFlying) return;
    yaw += event.movementX * mouseSensitivity;
    pitch += event.movementY * mouseSensitivity;
    pitch = Math.max(
      -Math.PI / 2 + 0.1,
      Math.min(Math.PI / 2 - 0.1, pitch),
    );
    flyingCamera.rotation.x = pitch;
    flyingCamera.rotation.y = yaw;
  });

  const handleKeyDown = (event) => {
    if (!isFlying) return;
    keys[event.code] = true;
    if (event.code === "KeyE" && !event.repeat) {
      state.speedMultiplier *= 2;
      updateSpeedDisplay();
    } else if (event.code === "KeyQ" && !event.repeat) {
      state.speedMultiplier *= 0.5;
      updateSpeedDisplay();
    }
    if ([
      "Space",
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
    ].includes(event.code)) {
      event.preventDefault();
      event.stopPropagation();
    }
  };
  const handleKeyUp = (event) => {
    keys[event.code] = false;
  };
  document.addEventListener("keydown", handleKeyDown, true);
  document.addEventListener("keyup", handleKeyUp, true);

  scene.onBeforeRenderObservable.add(() => {
    if (!isFlying) return;

    const speed = 0.5 * state.speedMultiplier;
    const forward = flyingCamera.getDirection(BABYLON.Vector3.Forward());
    const forwardFlat = new BABYLON.Vector3(
      forward.x,
      0,
      forward.z,
    ).normalize();
    const right = new BABYLON.Vector3(
      forwardFlat.z,
      0,
      -forwardFlat.x,
    );
    const movement = BABYLON.Vector3.Zero();

    if (keys.KeyW || keys.ArrowUp) {
      movement.addInPlace(forwardFlat.scale(speed));
    }
    if (keys.KeyS || keys.ArrowDown) {
      movement.addInPlace(forwardFlat.scale(-speed));
    }
    if (keys.KeyA || keys.ArrowLeft) {
      movement.addInPlace(right.scale(-speed));
    }
    if (keys.KeyD || keys.ArrowRight) {
      movement.addInPlace(right.scale(speed));
    }
    if (keys.Space) movement.y += speed;
    if (keys.KeyC) movement.y -= speed;

    flyingCamera.position.addInPlace(movement);
  });
}

export function createScene() {
  const scene = new BABYLON.Scene(state.engine);
  // Logarithmic depth is expensive (per-fragment math in every shader).
  // Disabled by default; enabled conditionally for large scenes in updateCameraSpeed().
  scene.useLogarithmicDepth = false;

  scene.clearColor = new BABYLON.Color4(0.02, 0.02, 0.03, 1);
  scene.ambientColor = new BABYLON.Color3(0.3, 0.3, 0.3);

  // Orbit the selected asset. The viewer intentionally has no FPS mode,
  // keyboard movement, or pointer lock.
  const camera = new BABYLON.ArcRotateCamera(
    "camera",
    -Math.PI / 4,
    Math.PI / 3,
    20,
    BABYLON.Vector3.Zero(),
    scene,
  );
  camera.minZ = 0.1;
  camera.maxZ = 100000;
  camera.lowerBetaLimit = 0.05;
  camera.upperBetaLimit = Math.PI - 0.05;
  camera.lowerRadiusLimit = 0.01;
  camera.upperRadiusLimit = 100000;
  camera.panningSensibility = 0;
  camera.wheelDeltaPercentage = 0.01;
  camera.inertia = 0.75;

  // ArcRotate's pointer input is retained for touch gestures, but mouse
  // rotation is restricted to the right button. Capturing left-button
  // pointerdown prevents Babylon from starting an orbit for normal clicks.
  configureAssetViewerPointerInput(camera);
  camera.inputs.removeByType("ArcRotateCameraKeyboardMoveInput");

  state.canvas.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 2) {
      event.stopImmediatePropagation();
    }
  }, true);
  state.canvas.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });
  camera.attachControl(state.canvas, true);
  installAssetViewerFlyingControls(scene, camera);

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
    scene.activeCamera.setTarget(BABYLON.Vector3.Zero());
    setCameraPosition(
      scene.activeCamera,
      new BABYLON.Vector3(0, 5, -20),
    );
    return;
  }

  const center = BABYLON.Vector3.Center(min, max);
  const diag = BABYLON.Vector3.Distance(min, max);
  const size = Math.max(diag, 0.1);

  // HEURISTIC: For medium-sized models (buildings/chunks), place camera AT specific point
  // This is useful for browsing world map chunks that are pre-positioned.
  if (size >= 5 && size < 50) {
    scene.activeCamera.setTarget(center);
    setCameraPosition(
      scene.activeCamera,
      new BABYLON.Vector3(-10, 10, 10),
    );
  } else {
    // Position camera at a distance from the center, looking at it
    // 3x closer for models under 100 (0.5 multiplier instead of 1.5)
    let distance = size * 1.5;
    if (size >= 5 && size < 100) {
      distance = size * 0.5;
    }

    // Cap max distance at 150 for giant maps
    distance = Math.min(distance, 150);

    const position = new BABYLON.Vector3(
      center.x - distance,
      center.y + distance * 0.5,
      center.z + distance,
    );
    scene.activeCamera.setTarget(center);
    setCameraPosition(scene.activeCamera, position);
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
