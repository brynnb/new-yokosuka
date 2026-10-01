import { Matrix, Vector3 } from "@babylonjs/core";
import { Mt5Loader } from "../../src/Mt5Loader.js";
import { nativeFaceEyeTargetAngles } from "../../src/NativeFaceGaze.js";

// LKPT's original matrix consumer is controller type 4 (0x0c104d62).
// Its selector-dependent limits are not recovered. These conservative, shared
// presentation limits are an explicit approximation, not Dreamcast constants.
const LIMIT = { minimum: -Math.PI / 4, maximum: Math.PI / 4 };
const BLEND_FRAMES = 6;

export function applyNativeActorLookPresentation(model, targetWorld, state) {
  const family = model?.latestControllerFamily;
  const controller = family?.nodes.find(node => node.type === 4);
  if (!controller || !model.latestRetargetedRoutes?.has(-67)) {
    throw new Error("LKPT presentation requires the native type-4 controller and FACE attachment");
  }
  if (model.latestControllerMatrices !== state.outputMatrices) {
    state.baseMatrices = model.latestControllerMatrices;
    state.baseRoutes = new Map(model.latestRetargetedRoutes);
  }
  const base = state.baseMatrices;
  const head = Matrix.FromArray(state.baseRoutes.get(-67));
  let desired = { vertical: 0, horizontal: 0 };
  if (targetWorld) {
    const content = model.loader.characterContentRoot(model.renderRoot);
    const modelTarget = Vector3.TransformCoordinates(Vector3.FromArray(targetWorld),
      Matrix.Invert(content.computeWorldMatrix(true)));
    const local = Vector3.TransformCoordinates(modelTarget, Matrix.Invert(head));
    desired = nativeFaceEyeTargetAngles({ target: local.asArray(), eyeOrigin: [0, 0, 0],
      verticalLimits: LIMIT, horizontalLimits: LIMIT });
  }
  // Smooth admission/release without accumulating rotations on last frame's
  // output. The authored MOTN matrices remain the base on every frame.
  for (const axis of ["vertical", "horizontal"]) {
    state[axis] = (state[axis] || 0) + (desired[axis] - (state[axis] || 0)) / BLEND_FRAMES;
  }
  const rotation = Mt5Loader.rowMultiply(Mt5Loader.rowRotationY(state.vertical),
    Mt5Loader.rowRotationZ(state.horizontal));
  // Use the established FACE-local axes but pivot about the native neck
  // controller. Descendant routes and attachment-only controls move together.
  const pivot = head.clone();
  pivot.setTranslation(Vector3.FromArray(base[controller.index].slice(12, 15)));
  const delta = Matrix.Invert(pivot).multiply(Matrix.FromArray(rotation)).multiply(pivot);
  const affected = new Set();
  const visit = index => { affected.add(index); for (const child of family.nodes[index].children) visit(child); };
  visit(controller.index);
  const matrices = base.map((matrix, index) => affected.has(index)
    ? Array.from(Matrix.FromArray(matrix).multiply(delta).asArray()) : matrix);
  const routes = new Map(state.baseRoutes);
  for (const [key, index] of model.latestControllerRenderMatrixByKey) {
    if (affected.has(index)) routes.set(key, matrices[index]);
  }
  state.outputMatrices = matrices;
  model.latestControllerMatrices = matrices;
  model.latestRetargetedRoutes = routes;
  model.loader.applyCharacterRigWorldMatrices(model.renderRoot, routes);
}

export function restoreNativeActorLookPresentation(model, state) {
  if (!state.baseMatrices || model.latestControllerMatrices !== state.outputMatrices) return;
  model.latestControllerMatrices = state.baseMatrices;
  model.latestRetargetedRoutes = state.baseRoutes;
  model.loader.applyCharacterRigWorldMatrices(model.renderRoot, state.baseRoutes);
}
