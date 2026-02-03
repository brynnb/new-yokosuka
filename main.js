import * as BABYLON from '@babylonjs/core';
import '@babylonjs/loaders';
import { Mt5Loader } from './src/Mt5Loader.js';

// Application State
const canvas = document.getElementById("renderCanvas");
const engine = new BABYLON.Engine(canvas, true);
const status = document.getElementById("status");
const statusBar = document.getElementById("status-bar");
const canvasContainer = document.getElementById("canvas-container");
const modelList = document.getElementById("model-list");
const selectModelPrompt = document.getElementById("select-model-prompt");

function setStatus(text, isLoading = false) {
    status.innerText = text;
    if (isLoading) {
        statusBar.classList.add("loading");
        if (canvasContainer) canvasContainer.classList.add("loading-active");
        if (selectModelPrompt) selectModelPrompt.classList.add("hidden");
    } else {
        statusBar.classList.remove("loading");
        if (canvasContainer) canvasContainer.classList.remove("loading-active");
    }
}

let currentMeshes = [];
let currentLoadId = 0;
const loader = new Mt5Loader(null); // Initial loader, scene will be set below
let currentSkybox = null;
let currentTimeOfDay = 0; // 0=Day, 1=Sunset, 2=Evening, 3=Night
let isInteriorScene = false; // Interior scenes don't have exterior sky
let currentZone = null;
let currentScenePrefix = null; // Track loaded scene for time-of-day reloading


// Time-of-day presets with representative sky textures
const timeOfDayPresets = [
    { name: "Day", texture: "/textures/sky/air00.png", clearColor: [0.4, 0.6, 0.9, 1] },
    { name: "Sunset", texture: "/textures/sky/air18.png", clearColor: [0.8, 0.4, 0.2, 1] },
    { name: "Evening", texture: "/textures/sky/air30.png", clearColor: [0.3, 0.2, 0.4, 1] },
    { name: "Night", texture: "/textures/sky/air60.png", clearColor: [0.01, 0.01, 0.05, 1] }
];

// Interior scene codes (no exterior sky visible)
const INTERIOR_SCENES = [
    'JOMO', 'JD00', 'JHD0', 'DCBN', 'DGCT', 'DAZA', 'DMAJ', 'DSLT', 'DPIZ',
    'DBYO', 'DSLI', 'DRME', 'DJAZ', 'DBHB', 'DKPA', 'DRHT', 'DTKY',
    'MS08', 'MO99', 'MS8A', 'MS8S', 'MKYU' // Warehouses, harbor interiors
];

// Asset Resolution Logic
const R2_URL = import.meta.env.VITE_ASSET_URL;
const R2_PREFIX = "shenmue";
const OFFLINE_MODE = import.meta.env.VITE_OFFLINE_ASSETS === "true";

async function fetchAsset(filename) {
    const isModelIndex = filename === 'models.json';
    const localPath = isModelIndex ? `/${filename}` : `/models/${filename}`;
    const r2Path = R2_URL ? `${R2_URL}/${R2_PREFIX}/${filename}` : null;

    // IF OFFLINE_MODE is false, we try R2 FIRST to verify the cloud sync
    if (!OFFLINE_MODE && r2Path) {
        console.log(`[Viewer] Trying R2 source for ${filename}: ${r2Path}`);
        try {
            const r2Res = await fetch(r2Path);
            if (r2Res.ok) return r2Res;
            console.warn(`[Viewer] R2 fetch failed (${r2Res.status}) for: ${r2Path}, falling back to local.`);
        } catch (e) {
            console.warn(`[Viewer] R2 fetch network error for ${r2Path}, falling back to local:`, e);
        }
    }

    // fallback to local
    try {
        const localRes = await fetch(localPath);
        if (localRes.ok) return localRes;
        console.error(`[Viewer] Local fetch also failed (${localRes.status}) for: ${localPath}`);
    } catch (e) {
        console.error(`[Viewer] Local fetch network error for ${localPath}:`, e);
    }

    throw new Error(`Failed to load asset: ${filename}. Checked R2: ${r2Path} and local: ${localPath}`);
}



const createScene = () => {
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.02, 0.02, 0.03, 1);
    scene.ambientColor = new BABYLON.Color3(0.3, 0.3, 0.3);

    // Use UniversalCamera for true FPS controls
    const camera = new BABYLON.UniversalCamera("camera", new BABYLON.Vector3(0, 5, -20), scene);
    camera.setTarget(BABYLON.Vector3.Zero());
    camera.attachControl(canvas, true);

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
    let yaw = 0;   // Horizontal rotation
    let pitch = 0; // Vertical rotation

    // Click to capture mouse
    canvas.addEventListener("click", () => {
        if (!isPointerLocked) {
            canvas.requestPointerLock();
        }
    });

    // Track pointer lock state
    const controlsOverlay = document.getElementById("controls-overlay");
    const speedDisplay = document.getElementById("speed-display");
    const pointerHint = document.getElementById("pointer-hint");

    document.addEventListener("pointerlockchange", () => {
        isPointerLocked = document.pointerLockElement === canvas;
        if (isPointerLocked) {
            // Disable all default camera controls when pointer is locked
            camera.detachControl();
            // Sync our yaw/pitch with current camera rotation
            yaw = camera.rotation.y;
            pitch = camera.rotation.x;
            setStatus("FPS Mode - Press ESC to exit");
            if (controlsOverlay) controlsOverlay.classList.remove("hidden");
            if (pointerHint) pointerHint.classList.add("hidden");
        } else {
            // Re-enable default camera controls
            camera.attachControl(canvas, true);
            setStatus("Click canvas for FPS mode");
            if (controlsOverlay) controlsOverlay.classList.add("hidden");
            if (pointerHint) pointerHint.classList.remove("hidden");
        }
    });

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

    // Key state tracking
    const keys = {};
    let speedMultiplier = 1.0;

    window.addEventListener("keydown", (e) => {
        const key = e.key.toLowerCase();
        keys[key] = true;

        // Speed adjustment
        if (key === "e" && isPointerLocked) {
            speedMultiplier *= 2;
            setStatus(`FPS Mode | Speed: ${speedMultiplier.toFixed(1)}x`);
            if (speedDisplay) speedDisplay.innerText = `${speedMultiplier.toFixed(1)}x`;
        }
        if (key === "q" && isPointerLocked) {
            speedMultiplier *= 0.5;
            setStatus(`FPS Mode | Speed: ${speedMultiplier.toFixed(1)}x`);
            if (speedDisplay) speedDisplay.innerText = `${speedMultiplier.toFixed(1)}x`;
        }

        // Prevent page scrolling with space
        if (e.key === " ") e.preventDefault();
    });
    window.addEventListener("keyup", (e) => keys[e.key.toLowerCase()] = false);

    // FPS-style WASD movement
    scene.onBeforeRenderObservable.add(() => {
        if (!isPointerLocked) return; // Only move in FPS mode

        const baseSpeed = 0.5;
        const speed = baseSpeed * speedMultiplier;

        // Get camera's forward and right vectors (on XZ plane)
        const forward = camera.getDirection(BABYLON.Vector3.Forward());
        const forwardFlat = new BABYLON.Vector3(forward.x, 0, forward.z).normalize();
        const right = new BABYLON.Vector3(forwardFlat.z, 0, -forwardFlat.x); // Perpendicular on XZ

        // Movement vectors
        let moveVector = BABYLON.Vector3.Zero();

        // W/S - Forward/Backward
        if (keys["w"]) moveVector.addInPlace(forwardFlat.scale(speed));
        if (keys["s"]) moveVector.addInPlace(forwardFlat.scale(-speed));

        // A/D - Strafe Left/Right
        if (keys["a"]) moveVector.addInPlace(right.scale(-speed));
        if (keys["d"]) moveVector.addInPlace(right.scale(speed));

        // Space/Shift - Vertical movement
        if (keys[" "]) moveVector.y += speed;
        if (keys["shift"]) moveVector.y -= speed;

        // Apply movement
        if (moveVector.length() > 0) {
            camera.position.addInPlace(moveVector);
        }
    });

    // Lighting
    const light = new BABYLON.HemisphericLight("light", new BABYLON.Vector3(0, 1, 0), scene);
    light.intensity = 1.2;
    light.groundColor = new BABYLON.Color3(0.1, 0.1, 0.15); // Slight bluish bounce

    // Primary Sunlight (Top-down)
    const skyLight = new BABYLON.DirectionalLight("skyLight", new BABYLON.Vector3(0, -1, 0), scene);
    skyLight.intensity = 1.5;

    const directLight = new BABYLON.DirectionalLight("dirLight", new BABYLON.Vector3(-1, -2, -1), scene);
    directLight.position = new BABYLON.Vector3(20, 60, 20);
    directLight.intensity = 1.0;

    // Fill light
    const fillLight = new BABYLON.PointLight("fillLight", new BABYLON.Vector3(-20, 20, -20), scene);
    fillLight.intensity = 0.8;

    return scene;
};

const scene = createScene();
loader.scene = scene; // Attach the actual scene to the loader

console.log("[Viewer] Initialized v1.1.2");

engine.runRenderLoop(() => {
    if (scene) {
        if (currentSkybox && scene.activeCamera) {
            currentSkybox.position.copyFrom(scene.activeCamera.position);
        }
        scene.render();
    }
});

window.addEventListener("resize", () => {
    setTimeout(() => {
        engine.resize();
    }, 0);
});

let allFiles = [];
let mt5Files = [];

let mapNames = {};
let charNames = {};

async function loadMetadata() {
    try {
        const mapsResponse = await fetch('/data/maps.csv');
        const mapsText = await mapsResponse.text();
        mapsText.split('\n').forEach(line => {
            const parts = line.split(';');
            if (parts.length >= 2) {
                const name = parts[0].trim();
                const id = parts[1].trim();
                if (id) mapNames[id] = name;
            }
        });

        const charsResponse = await fetch('/data/chars.csv');
        const charsText = await charsResponse.text();
        charsText.split('\n').forEach(line => {
            const parts = line.split(';');
            if (parts.length >= 3) {
                const name = parts[0].trim();
                const id = parts[1].trim();
                const modelId = parts[2].trim();
                if (id && id !== "-") charNames[id] = name;
                if (modelId && modelId !== "-") {
                    const cleanModelId = modelId.split('_')[0];
                    charNames[cleanModelId] = name;
                }
            }
        });
        console.log("[Metadata] Loaded mappings", { maps: Object.keys(mapNames).length, chars: Object.keys(charNames).length });
    } catch (err) {
        console.warn("[Metadata] Failed to load mappings", err);
    }
}

async function loadCatalog() {
    await loadMetadata();
    try {
        const response = await fetchAsset('models.json');
        if (!response.ok) throw new Error("Catalog not found");
        allFiles = await response.json();
        const files = allFiles.filter(f => f.toLowerCase().endsWith('.mt5')).sort();
        mt5Files = files;

        // Disc-based Organization Logic
        const hierarchy = {
            s1: { title: "💽 Disc 1 (Scenario 01)", groups: {} },
            s2: { title: "💽 Disc 2 (Scenario 02)", groups: {} },
            global: { title: "🌍 Global Library", groups: {} }
        };

        files.forEach(file => {
            let category = "global";
            let folderKey = "Misc";
            let folderLabel = "Misc";

            if (file.startsWith('S1_')) {
                category = "s1";
                const parts = file.split('_');
                folderKey = parts[1]; // e.g. JOMO
                folderLabel = mapNames[folderKey] || folderKey;
            } else if (file.startsWith('S2_')) {
                category = "s2";
                const parts = file.split('_');
                folderKey = parts[1]; // e.g. DNOZ
                folderLabel = mapNames[folderKey] || folderKey;
            } else if (file.startsWith('G_')) {
                category = "global";
                const parts = file.split('_');
                folderKey = parts[1]; // e.g. CHARA
                folderLabel = folderKey.charAt(0) + folderKey.slice(1).toLowerCase();
            }

            const target = hierarchy[category].groups;
            if (!target[folderKey]) {
                target[folderKey] = { label: folderLabel, files: [] };
            }
            target[folderKey].files.push(file);
        });

        modelList.innerHTML = '';

        // Render Hierarchy
        ["s1", "s2", "global"].forEach(catKey => {
            const cat = hierarchy[catKey];
            const groupKeys = Object.keys(cat.groups).sort();
            if (groupKeys.length === 0) return;

            const catContainer = document.createElement('div');
            catContainer.className = 'category-group';

            const catHeader = document.createElement('div');
            catHeader.className = 'category-header';
            catHeader.innerHTML = `<span>${cat.title} (${groupKeys.length})</span>`;

            const catContent = document.createElement('div');
            catContent.className = 'category-content hidden';

            catHeader.onclick = () => {
                catContent.classList.toggle('hidden');
                catHeader.classList.toggle('expanded');
            };

            groupKeys.forEach(gKey => {
                const group = cat.groups[gKey];
                const groupFiles = group.files.sort();

                const groupContainer = document.createElement('div');
                groupContainer.className = 'model-group'; // Consistent class name

                const header = document.createElement('div');
                header.className = 'group-header';

                const labelTxt = group.label === gKey ? gKey : `${group.label} (${gKey})`;
                header.innerHTML = `<span>📁 ${labelTxt} (${groupFiles.length})</span>`;

                const btn = document.createElement('button');
                btn.className = 'scene-btn'; // Consistent class name
                btn.innerText = `Load All`;
                btn.onclick = (e) => {
                    e.stopPropagation();
                    const firstFile = groupFiles[0];
                    const parts = firstFile.split('_');
                    const groupPrefix = `${parts[0]}_${parts[1]}`; // Guaranteed pattern like S1_JOMO or G_CHARA
                    loadScene(groupPrefix);
                };
                header.appendChild(btn);

                const itemsList = document.createElement('ul');
                itemsList.className = 'group-items hidden';

                header.onclick = () => {
                    itemsList.classList.toggle('hidden');
                    header.classList.toggle('expanded');
                };

                groupFiles.forEach(file => {
                    const li = document.createElement('li');
                    li.className = 'model-item';

                    // Show filename without scenario/zone prefix for list
                    const parts = file.split('_');
                    let displayName = parts[parts.length - 1];
                    // If the last part is just a number (like 015.MT5) and there's a prefix like DR01
                    // include that prefix for clarity.
                    if (parts.length >= 2) {
                        const midPart = parts[parts.length - 2];
                        if (midPart.startsWith('DR') || midPart.startsWith('MAP') || midPart.startsWith('G')) {
                            displayName = `${midPart}_${displayName}`;
                        }
                    }
                    li.innerText = displayName;

                    li.onclick = (e) => {
                        e.stopPropagation();
                        loadModelFromUrl(file, li);
                    };
                    itemsList.appendChild(li);
                });

                groupContainer.appendChild(header);
                groupContainer.appendChild(itemsList);
                catContent.appendChild(groupContainer);
            });

            catContainer.appendChild(catHeader);
            catContainer.appendChild(catContent);
            modelList.appendChild(catContainer);
        });

        setStatus(`Ready`);
    } catch (err) {
        setStatus("Error loading catalog");
        console.error(err);
    }
}

async function loadScene(prefix) {
    const loadId = ++currentLoadId;
    setStatus(`Loading scene ${prefix}...`, true);

    // Set current zone and scene prefix from prefix (e.g. S1_JOMO -> JOMO)
    const parts = prefix.split('_');
    currentZone = parts.length > 1 ? parts[1] : prefix;
    currentScenePrefix = prefix; // Track for time-of-day reloading


    // Clear previous
    currentMeshes.forEach(m => m.dispose());
    currentMeshes = [];
    loader.textureCache.forEach(t => t.dispose());
    loader.textureCache.clear();

    const filesToLoad = allFiles.filter(f => {
        if (!f.toLowerCase().endsWith('.mt5')) return false;
        const baseName = f.replace('.MT5', '').replace('.mt5', '');
        return baseName.startsWith(prefix);
    });
    let totalLoaded = 0;

    // Pre-fetch the texture pack for the scene
    const sampleFile = filesToLoad[0];
    const secondaryBuffer = sampleFile ? await getTexturePack(sampleFile) : null;
    if (loadId !== currentLoadId) return;

    for (const filename of filesToLoad) {
        if (loadId !== currentLoadId) return;
        try {
            const response = await fetchAsset(filename);
            if (loadId !== currentLoadId) return;
            if (!response.ok) continue;

            const buffer = await response.arrayBuffer();
            if (loadId !== currentLoadId) return;

            const meshes = await loader.load(buffer, secondaryBuffer);
            if (loadId !== currentLoadId) {
                meshes.forEach(m => m.dispose());
                return;
            }

            meshes.forEach(m => m._filename = filename);
            currentMeshes.push(...meshes);
            totalLoaded++;
            setStatus(`Loaded ${totalLoaded}/${filesToLoad.length} parts...`, true);
        } catch (err) {
            console.error(`Failed to load ${filename}`, err);
        }
    }

    if (loadId === currentLoadId && currentMeshes.length > 0) {
        fitCameraToMeshes(currentMeshes);
        updateModelVisibility();
        setStatus(`[Viewer] Loaded scene ${prefix} (${totalLoaded} models)`);
    }
}

const texturePacks = new Map();

// Map time-of-day preset index to MAP texture pack index
// 0=Day, 1=Sunset (afternoon), 2=Evening, 3=Night
const timeToMapIndex = {
    0: 0, // Day
    1: 1, // Sunset -> Afternoon 
    2: 2, // Evening
    3: 3  // Night
};


async function getTexturePack(filename, timeIndex = null) {
    // Determine scene prefix (e.g., S1_JOMO or G_CHARA)
    const parts = filename.split('_');
    if (parts.length < 2) return null;

    // For global files G_CHARA_..., the pack is G_CHARA_textures.bin
    // For scenario files S1_JOMO_..., the pack is S1_JOMO_textures.bin
    let packPrefix = '';
    if (parts[0] === 'G') {
        packPrefix = `G_${parts[1]}`;
    } else {
        packPrefix = `${parts[0]}_${parts[1]}`;
    }

    // Determine which map texture index to use (0-3)
    const mapIdx = timeToMapIndex[timeIndex ?? currentTimeOfDay] ?? 0;

    // Try to load time-variant textures pack FIRST
    const timePackName = `${packPrefix}_textures_${mapIdx}.bin`;
    let timeBuffer = texturePacks.get(timePackName);
    if (timeBuffer === undefined) {
        try {
            const response = await fetchAsset(timePackName);
            if (response.ok) {
                timeBuffer = await response.arrayBuffer();
                texturePacks.set(timePackName, timeBuffer);
                console.log(`[Viewer] Loaded time-variant texture pack: ${timePackName}`);
            } else {
                texturePacks.set(timePackName, null);
                timeBuffer = null;
            }
        } catch (err) {
            texturePacks.set(timePackName, null);
            timeBuffer = null;
        }
    }

    // Load base textures pack
    const basePackName = `${packPrefix}_textures.bin`;
    let baseBuffer = texturePacks.get(basePackName);
    if (baseBuffer === undefined) {
        try {
            const response = await fetchAsset(basePackName);
            if (response.ok) {
                baseBuffer = await response.arrayBuffer();
                texturePacks.set(basePackName, baseBuffer);
                console.log(`[Viewer] Loaded base texture pack: ${basePackName}`);
            } else {
                texturePacks.set(basePackName, null);
                baseBuffer = null;
            }
        } catch (err) {
            texturePacks.set(basePackName, null);
            baseBuffer = null;
        }
    }

    // Return time pack with base as fallback for missing textures
    if (timeBuffer) {
        return { base: baseBuffer, time: timeBuffer };
    }

    return baseBuffer;
}



async function loadModelFromUrl(filename, element) {
    const loadId = ++currentLoadId;

    // Clear previous
    currentMeshes.forEach(m => m.dispose());
    currentMeshes = [];
    loader.textureCache.forEach(t => t.dispose());
    loader.textureCache.clear();

    document.querySelectorAll('.model-item').forEach(el => el.classList.remove('active'));
    if (element) {
        element.classList.add('active');
    }

    setStatus(`Loading ${filename}...`, true);

    // Set current zone from filename (e.g. S1_JOMO_... -> JOMO)
    const parts = filename.split('_');
    if (parts.length > 1 && (parts[0] === 'S1' || parts[0] === 'S2')) {
        currentZone = parts[1];
    } else if (parts.length > 1 && parts[0] === 'G') {
        currentZone = parts[1]; // e.g. G_CHARA
    }

    try {
        // Fetch model and textures in parallel
        const [modelRes, secondaryBuffer] = await Promise.all([
            fetchAsset(filename),
            getTexturePack(filename)
        ]);

        if (loadId !== currentLoadId) return;

        if (!modelRes.ok) throw new Error("File not found");
        const buffer = await modelRes.arrayBuffer();
        if (loadId !== currentLoadId) return;

        const meshes = await loader.load(buffer, secondaryBuffer);
        if (loadId !== currentLoadId) {
            meshes.forEach(m => m.dispose());
            return;
        }

        meshes.forEach(m => m._filename = filename);
        currentMeshes = meshes;

        if (meshes.length > 0) {
            fitCameraToMeshes(meshes);
            setStatus(`[Viewer] Loaded ${filename}`);

            // Detect if this is an interior scene (affects sky visibility)
            isInteriorScene = detectInteriorScene();
            console.log(`[Viewer] Scene type: ${isInteriorScene ? 'Interior' : 'Exterior'}`);

            // Apply time of day (handles visibility and sky)
            applyTimeOfDay(currentTimeOfDay);
        } else {
            setStatus(`[Viewer] Warning: No meshes found in ${filename}`);
        }
    } catch (err) {
        setStatus(`Error: ${err.message}`);
        console.error(err);
    }
}

function fitCameraToMeshes(meshes) {
    let min = new BABYLON.Vector3(Infinity, Infinity, Infinity);
    let max = new BABYLON.Vector3(-Infinity, -Infinity, -Infinity);
    let foundMesh = false;

    meshes.forEach(m => {
        const boundingInfo = m.getHierarchyBoundingVectors(true);
        // Sanity check for massive/empty bounds
        if (boundingInfo.min.x !== Infinity && !isNaN(boundingInfo.min.x)) {
            if (BABYLON.Vector3.Distance(boundingInfo.min, boundingInfo.max) < 100000) {
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

    console.log(`[Viewer] Model Center: ${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)}`);
    console.log(`[Viewer] Model Size: ${size.toFixed(2)}`);

    // Position camera at a distance from the center, looking at it
    const distance = size * 1.5;
    scene.activeCamera.position = new BABYLON.Vector3(
        center.x - distance,
        center.y + distance * 0.5,
        center.z - distance
    );
    scene.activeCamera.setTarget(center);
}

// Navigation Logic
function expandParents(element) {
    let parent = element.parentElement;
    while (parent && parent !== modelList) {
        if (parent.classList.contains('category-content') || parent.classList.contains('group-items')) {
            if (parent.classList.contains('hidden')) {
                parent.classList.remove('hidden');
                const header = parent.previousElementSibling;
                if (header) header.classList.add('expanded');
            }
        }
        parent = parent.parentElement;
    }
}

function navigateModel(dir) {
    const items = Array.from(document.querySelectorAll('.model-item'));
    if (items.length === 0) return;

    let nextIndex = 0;
    const currentActive = document.querySelector('.model-item.active');

    if (currentActive) {
        const currentIndex = items.indexOf(currentActive);
        nextIndex = currentIndex + dir;
    } else {
        nextIndex = dir > 0 ? 0 : items.length - 1;
    }

    // Wrap around
    if (nextIndex < 0) nextIndex = items.length - 1;
    if (nextIndex >= items.length) nextIndex = 0;

    const target = items[nextIndex];
    if (target) {
        expandParents(target);
        target.click();
        target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
}

document.getElementById('prev-btn').onclick = (e) => {
    e.preventDefault();
    navigateModel(-1);
};
document.getElementById('next-btn').onclick = (e) => {
    e.preventDefault();
    navigateModel(1);
};

// Detect if the current scene is an interior (no exterior sky needed)
function detectInteriorScene() {
    for (const mesh of currentMeshes) {
        const name = (mesh._filename || mesh.name).toUpperCase();
        for (const interior of INTERIOR_SCENES) {
            if (name.includes(interior)) {
                return true;
            }
        }
    }
    return false;
}

// Update visibility based on time of day
// NOTE: Shenmue's time-of-day system uses different TEXTURE packs, not different models.
// The MAP01-MAP26.MT5 files are building sections, not time variants.
// Time variants come from loading different textures from MAP0/1/2/3.PKF archives.
// For now, we just show all meshes regardless of time setting.
function updateModelVisibility() {
    if (!loader.scene) return;

    const preset = timeOfDayPresets[currentTimeOfDay];
    console.log(`[Viewer] Time of day: ${preset.name} - showing all meshes`);

    // Show all meshes - time-of-day is cosmetic (sky/colors only)
    currentMeshes.forEach(mesh => mesh.setEnabled(true));
}

// Apply sky/time-of-day preset
function applyTimeOfDay(presetIndex) {
    const preset = timeOfDayPresets[presetIndex];
    const skyBtn = document.getElementById("sky-btn");

    // Update button text
    if (isInteriorScene) {
        skyBtn.innerText = `Time: ${preset.name} (interior)`;
    } else {
        skyBtn.innerText = `Time: ${preset.name}`;
    }

    // Update visibility based on new time
    updateModelVisibility();

    // Clean up existing skybox
    if (currentSkybox) {
        currentSkybox.dispose();
        currentSkybox = null;
    }

    // Create new skybox if not Off AND not an interior scene
    if (preset.texture && !isInteriorScene) {
        currentSkybox = BABYLON.MeshBuilder.CreateSphere("skyDome", {
            diameter: 50000,
            slice: 0.5,
            sideOrientation: BABYLON.Mesh.BACKSIDE
        }, loader.scene);

        const skyMat = new BABYLON.StandardMaterial("skyMat", loader.scene);
        skyMat.disableLighting = true;

        const tex = new BABYLON.Texture(preset.texture, loader.scene);
        tex.vScale = 1;

        skyMat.emissiveTexture = tex;
        currentSkybox.material = skyMat;

        currentSkybox.renderingGroupId = 0;
        currentSkybox.infiniteDistance = true;
        currentSkybox.rotation.y = Math.PI;
    }

    // Set clear color
    const [r, g, b, a] = preset.clearColor;
    loader.scene.clearColor = new BABYLON.Color4(r, g, b, a);
}

// Sky/Time Toggle Button
const skyBtn = document.getElementById("sky-btn");

// Handle Welcome Modal
const welcomeModal = document.getElementById("welcome-modal");
const closeModalBtn = document.getElementById("close-modal");
const mobileWarningModal = document.getElementById("mobile-warning-modal");
const closeMobileWarningBtn = document.getElementById("close-mobile-warning");

function isMobileOrSmallScreen() {
    return window.innerWidth < 1000 ||
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

if (closeModalBtn && welcomeModal) {
    closeModalBtn.onclick = () => {
        welcomeModal.classList.add("hidden");

        // Show mobile warning if on small screen or mobile device
        if (isMobileOrSmallScreen() && mobileWarningModal) {
            mobileWarningModal.classList.remove("hidden");
        }
    };
}

if (closeMobileWarningBtn && mobileWarningModal) {
    closeMobileWarningBtn.onclick = () => {
        mobileWarningModal.classList.add("hidden");
    };
}
if (skyBtn) {
    skyBtn.onclick = async () => {
        currentTimeOfDay = (currentTimeOfDay + 1) % timeOfDayPresets.length;
        applyTimeOfDay(currentTimeOfDay);

        // Reload scene with new time-of-day textures if a scene is loaded
        if (currentScenePrefix) {
            console.log(`[Viewer] Reloading scene ${currentScenePrefix} with time index ${currentTimeOfDay}`);
            await loadScene(currentScenePrefix);
        }
    };
}


window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp') {
        e.preventDefault();
        navigateModel(-1);
    } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        navigateModel(1);
    }
});



loadCatalog();
