import { Effect } from "@babylonjs/core";
import "@babylonjs/core/Shaders/ShadersInclude/lightsFragmentFunctions.js";

const { IncludesShadersStore, ShadersStore } = Effect;

export let luckyBreakMaterialShadersRegistered =
  typeof window === "undefined";

let materialShadersPromise: Promise<void> | null = null;
export function ensureLuckyBreakMaterialShaders(): Promise<void> {
  return materialShadersPromise ??= (typeof window === "undefined"
  ? Promise.resolve()
  : Promise.all([
    import("./shaders/includes/lucky-break-dynamic-ibl-fragment-declaration.glsl?raw"),
    import("./shaders/includes/lucky-break-dynamic-ibl-ubo-declaration.glsl?raw"),
    import("./shaders/includes/lucky-break-dynamic-ibl-vertex-declaration.glsl?raw"),
    import("./shaders/lucky-break-dynamic-ibl.fragment.glsl?raw"),
    import("./shaders/lucky-break-dynamic-ibl.vertex.glsl?raw"),
  ]).then(([
    { default: dynamicIblFragmentDeclaration },
    { default: dynamicIblUboDeclaration },
    { default: dynamicIblVertexDeclaration },
    { default: dynamicIblFragmentShader },
    { default: dynamicIblVertexShader },
  ]) => {
    ShadersStore.luckyBreakDynamicIblVertexShader = dynamicIblVertexShader;
    ShadersStore.luckyBreakDynamicIblPixelShader = dynamicIblFragmentShader;
    IncludesShadersStore.luckyBreakDynamicIblFragmentDeclaration =
      dynamicIblFragmentDeclaration;
    IncludesShadersStore.luckyBreakDynamicIblUboDeclaration =
      dynamicIblUboDeclaration;
    IncludesShadersStore.luckyBreakDynamicIblVertexDeclaration =
      dynamicIblVertexDeclaration;
    luckyBreakMaterialShadersRegistered = true;
  })).catch(error => {
    materialShadersPromise = null;
    throw error;
  });
}
