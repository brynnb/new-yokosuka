import { Mt5Loader } from "../../src/Mt5Loader.js";

export function configureMt5TexturePack(loader, texturePack) {
  if (
    texturePack
    && (texturePack.base !== undefined || texturePack.time !== undefined)
  ) {
    loader.setTexturePackIndex(
      Mt5Loader.buildTexturePackIndex(texturePack.base),
      Mt5Loader.buildTexturePackIndex(texturePack.time),
      texturePack.base,
      texturePack.time,
    );
    return;
  }
  loader.setTexturePackIndex(
    Mt5Loader.buildTexturePackIndex(texturePack),
    null,
    texturePack,
    null,
  );
}
