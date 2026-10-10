import { MaterialPluginBase } from "@babylonjs/core/Materials/materialPluginBase.js";

/**
 * Experimental opaque scenery only. Texture-array layers retain native repeat,
 * filtering and mip isolation, unlike a naive atlas that bleeds between tiles.
 * Keep Babylon's ordinary lighting/fog/vertex-color pipeline; change only the
 * base-color sample. uv2.x is a compiler-owned, constant-per-triangle layer ID.
 */
export class SceneryTextureArrayMaterial extends MaterialPluginBase {
  constructor(material, texture) {
    super(material, "SceneryTextureArray", 200, {}, true, true);
    this.texture = texture;
  }

  isReadyForSubMesh() { return this.texture.isReady(); }
  getActiveTextures(textures) { textures.push(this.texture); }
  hasTexture(texture) { return texture === this.texture; }
  getSamplers(samplers) { samplers.push("scenerySampler"); }
  getAttributes(attributes) {
    for (const kind of ["uv", "uv2"]) if (!attributes.includes(kind)) attributes.push(kind);
  }
  bindForSubMesh(buffer) { buffer.setTexture("scenerySampler", this.texture); }
  getCustomCode(type) {
    if (type === "vertex") return {
      CUSTOM_VERTEX_DEFINITIONS: `
        #ifndef UV1
        attribute vec2 uv;
        #endif
        #ifndef UV2
        attribute vec2 uv2;
        #endif
        varying vec2 vSceneryUV;
        varying float vSceneryLayer;`,
      CUSTOM_VERTEX_MAIN_END: "vSceneryUV = uv; vSceneryLayer = uv2.x;",
    };
    return {
      CUSTOM_FRAGMENT_DEFINITIONS: `
        uniform highp sampler2DArray scenerySampler;
        varying vec2 vSceneryUV;
        varying float vSceneryLayer;`,
      // This is the StandardMaterial base-color initialization, before vertex
      // colors and lighting. No diffuseTexture means no redundant 2D sample.
      "!vec4 baseColor=vec4\\(1\\.,1\\.,1\\.,1\\.\\);":
        "vec4 baseColor=texture(scenerySampler,vec3(vSceneryUV,vSceneryLayer));",
    };
  }
}
