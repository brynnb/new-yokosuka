import { Color4, DirectionalLight, Engine, FreeCamera, HemisphericLight,
  Quaternion, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { collectionToyModel, loadCapsuleToy, rotateCapsuleToy, untilAborted } from '../interactions/CapsuleToyModel.js';
import { CapsuleInspectionControls } from '../interactions/CapsuleInspectionControls.js';

// An isolated scene: inspecting a collection never moves the gameplay camera,
// changes the avatar, or takes ownership of the enclosing inventory modal.
export class CapsuleToyPreview {
  constructor(canvas) {
    this.canvas = canvas;
    this.engine = new Engine(canvas, true, {alpha: true, stencil: false});
    this.engine.setHardwareScalingLevel(1 / Math.min(window.devicePixelRatio || 1, 2));
    this.resizeObserver = new ResizeObserver(() => {
      if (this.disposed) return;
      this.engine.resize();
      this.frame();
      this.render();
    });
    this.resizeObserver.observe(canvas);
  }

  async show(key, signal) {
    this.clear();
    if (this.disposed) throw new DOMException('Preview closed', 'AbortError');
    const controller = new AbortController();
    this.request = controller;
    const abort = () => controller.abort(signal.reason);
    signal?.addEventListener('abort', abort, {once: true});
    if (signal?.aborted) abort();
    const timer = setTimeout(() => controller.abort(new Error('Toy preview timed out. Please retry.')), 20000);
    const scene = new Scene(this.engine);
    this.scene = scene;
    scene.clearColor = new Color4(0, 0, 0, 0);
    const camera = new FreeCamera('collection-toy-camera', new Vector3(0, 0, -1), scene);
    camera.fov = 0.58;
    this.camera = camera;
    const ambient = new HemisphericLight('collection-toy-ambient', new Vector3(0, 1, 0.4), scene);
    ambient.intensity = 1;
    const keyLight = new DirectionalLight('collection-toy-key', new Vector3(-0.5, -0.8, -0.7), scene);
    keyLight.intensity = 0.7;
    try {
      const root = await loadCapsuleToy(scene, collectionToyModel(key), controller.signal);
      controller.signal.throwIfAborted();
      const bounds = root.getHierarchyBoundingVectors(true);
      const center = bounds.min.add(bounds.max).scale(0.5);
      const radius = bounds.max.subtract(bounds.min).length() / 2;
      if (!Number.isFinite(radius) || radius <= 0) throw new Error(`Empty toy model: ${key}`);
      const pivot = new TransformNode('collection-toy-pivot', scene);
      pivot.position.copyFrom(center);
      pivot.rotationQuaternion = Quaternion.Identity();
      root.setParent(pivot);
      pivot.position.setAll(0);
      this.pivot = pivot;
      this.radius = radius;
      this.engine.resize();
      this.frame();
      await untilAborted(scene.whenReadyAsync(), controller.signal);
      controller.signal.throwIfAborted();
      this.ready = true;
      this.render();
    } catch (error) {
      if (this.request === controller) this.clear();
      throw error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  }

  frame() {
    if (!this.radius || !this.camera) return;
    // A bounding sphere keeps tall, wide, and rotated toys inside the view,
    // including the narrow popup layout on phones.
    const aspect = this.engine.getRenderWidth() / Math.max(1, this.engine.getRenderHeight());
    const halfFov = Math.atan(Math.tan(this.camera.fov / 2) * Math.min(1, aspect));
    const distance = this.radius / Math.sin(halfFov) * 1.08;
    // Collection models face +Z in their authored rest pose.
    this.camera.position.copyFrom(new Vector3(0.3, 0.25, 1).normalize().scale(distance));
    this.camera.setTarget(Vector3.Zero());
    this.camera.minZ = Math.max(0.0001, distance / 1000);
    this.camera.maxZ = distance + this.radius * 4;
  }

  render() {
    if (this.ready && !this.disposed) this.scene.render();
  }

  inspect({getBinding, onClose}) {
    this.controls?.close();
    this.controls = new CapsuleInspectionControls({canvas: this.canvas, getBinding, onClose,
      onRotate: (yaw, pitch) => rotateCapsuleToy(this.pivot, this.camera, yaw, pitch)});
    this.controls.open();
    this.engine.runRenderLoop(() => {
      this.controls?.update(this.engine.getDeltaTime() / 1000);
      this.render();
    });
  }

  snapshot() {
    this.render();
    return this.canvas.toDataURL('image/png');
  }

  clear() {
    this.request?.abort(new DOMException('Preview closed', 'AbortError'));
    this.request = null;
    this.controls?.close();
    this.controls = null;
    this.engine.stopRenderLoop();
    this.ready = false;
    this.radius = 0;
    this.pivot = null;
    this.camera = null;
    this.scene?.dispose();
    this.scene = null;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.clear();
    this.resizeObserver.disconnect();
    this.engine.dispose();
  }
}

// Render visible collection cards once, serially on one offscreen WebGL
// context. Do not create a continuously-rendering engine per collected toy.
// The snapshots/cache live only as long as the collection is open.
export class CapsuleToyThumbnails {
  constructor() {
    this.cache = new Map();
    this.queue = Promise.resolve();
    this.controller = new AbortController();
  }

  get(key, signal) {
    const cached = this.cache.get(key);
    if (cached) return untilAborted(Promise.resolve(cached), signal);
    const pending = this.queue.then(async () => {
      this.controller.signal.throwIfAborted();
      signal.throwIfAborted();
      if (this.cache.has(key)) return this.cache.get(key);
      if (!this.preview) {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 256;
        this.preview = new CapsuleToyPreview(canvas);
      }
      await this.preview.show(key, AbortSignal.any([signal, this.controller.signal]));
      const image = this.preview.snapshot();
      this.preview.clear();
      this.cache.set(key, image);
      return image;
    });
    this.queue = pending.catch(() => {});
    return untilAborted(pending, signal);
  }

  dispose() {
    this.controller.abort(new DOMException('Collection closed', 'AbortError'));
    this.preview?.dispose();
    this.cache.clear();
  }
}
