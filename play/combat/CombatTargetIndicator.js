import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector.js";

// The indicator and target ordering use the same camera projection. Never use
// actor yaw for left/right: orbiting the camera must reverse the visual order.
export class CombatTargetIndicator {
  constructor(scene, getEncounter) {
    this.scene = scene;
    this.getEncounter = getEncounter;
    this.element = document.createElement("div");
    this.element.className = "combat-target-indicator";
    this.element.hidden = true;
    this.element.setAttribute("aria-hidden", "true");
    document.body.append(this.element);
    this.observer = scene.onAfterRenderObservable.add(() => this.update());
  }

  projectTargets(entries) {
    const camera = this.scene.activeCamera;
    if (!camera) return [];
    const engine = this.scene.getEngine();
    const viewport = camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight());
    const transform = camera.getViewMatrix().multiply(camera.getProjectionMatrix());
    return entries.map(({ id, name, actor, combatant }) => {
      const position = actor.combatVisualPosition?.() || actor.position();
      const point = new Vector3(position.x, position.y + 1.85, position.z);
      const projected = Vector3.Project(point, Matrix.IdentityReadOnly, transform, viewport);
      return {
        id, name, defeated: combatant.defeated,
        // Babylon projection puts behind-camera points outside [0,1] depth.
        visible: projected.z >= 0 && projected.z <= 1,
        screenX: projected.x / engine.getRenderWidth(),
        screenY: projected.y / engine.getRenderHeight(),
      };
    });
  }

  update() {
    const encounter = this.getEncounter();
    const enabled = encounter?.active && encounter.controlsActive && !encounter.player.defeated;
    const target = enabled && this.projectTargets([encounter.selectedEnemy])[0];
    this.element.hidden = !target || !target.visible || target.defeated
      || target.screenX < 0 || target.screenX > 1 || target.screenY < 0 || target.screenY > 1;
    if (this.element.hidden) return;
    const rect = this.scene.getEngine().getRenderingCanvas().getBoundingClientRect();
    this.element.style.left = `${rect.left + target.screenX * rect.width}px`;
    this.element.style.top = `${rect.top + target.screenY * rect.height}px`;
    this.element.textContent = target.name;
    this.element.dataset.targetId = target.id;
  }

  dispose() {
    this.scene.onAfterRenderObservable.remove(this.observer);
    this.element.remove();
  }
}
