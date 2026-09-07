import * as BABYLON from '@babylonjs/core';
import { BinaryReader } from './BinaryReader.js';
import { decodedAssetData, assetBufferId } from './AssetCache.js';

const ALPHA_TEST_CUTOFF = 128;

function alphaCoverage(pixelData, cutoff = ALPHA_TEST_CUTOFF) {
    if (!pixelData?.length) return 0;
    let visible = 0;
    const pixelCount = pixelData.length / 4;
    for (let offset = 3; offset < pixelData.length; offset += 4) {
        if (pixelData[offset] >= cutoff) visible += 1;
    }
    return visible / pixelCount;
}

export function scaleAlphaToCoverage(
    pixelData,
    targetCoverage,
    cutoff = ALPHA_TEST_CUTOFF,
) {
    if (!pixelData?.length || targetCoverage <= 0) return pixelData;
    const coverageAtScale = (scale) => {
        let visible = 0;
        for (let offset = 3; offset < pixelData.length; offset += 4) {
            // Match the byte value written below. Without rounding here, an
            // evaluated value such as 127.5 is treated as transparent, then
            // uploaded as 128 and unexpectedly survives the alpha test.
            if (
                Math.min(255, Math.round(pixelData[offset] * scale))
                >= cutoff
            ) {
                visible += 1;
            }
        }
        return visible / (pixelData.length / 4);
    };
    let low = 0;
    let high = 255;
    let bestScale = 1;
    let bestError = Math.abs(coverageAtScale(1) - targetCoverage);
    for (let iteration = 0; iteration < 16; iteration += 1) {
        const scale = (low + high) / 2;
        const coverage = coverageAtScale(scale);
        const error = Math.abs(coverage - targetCoverage);
        if (error < bestError) {
            bestError = error;
            bestScale = scale;
        }
        if (coverage < targetCoverage) low = scale;
        else high = scale;
    }
    for (const scale of [low, high]) {
        const error = Math.abs(coverageAtScale(scale) - targetCoverage);
        if (error < bestError) {
            bestError = error;
            bestScale = scale;
        }
    }
    if (Math.abs(bestScale - 1) < 0.001) return pixelData;
    for (let offset = 3; offset < pixelData.length; offset += 4) {
        pixelData[offset] = Math.min(
            255,
            Math.round(pixelData[offset] * bestScale),
        );
    }
    return pixelData;
}

function downsampleAlphaAware(source, sourceWidth, sourceHeight) {
    const width = Math.max(1, Math.ceil(sourceWidth / 2));
    const height = Math.max(1, Math.ceil(sourceHeight / 2));
    const pixels = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            let samples = 0;
            let alphaTotal = 0;
            const colorTotal = [0, 0, 0];
            for (
                let sourceY = y * 2;
                sourceY < Math.min(sourceHeight, y * 2 + 2);
                sourceY += 1
            ) {
                for (
                    let sourceX = x * 2;
                    sourceX < Math.min(sourceWidth, x * 2 + 2);
                    sourceX += 1
                ) {
                    const sourceOffset = (sourceY * sourceWidth + sourceX) * 4;
                    const alpha = source[sourceOffset + 3];
                    samples += 1;
                    alphaTotal += alpha;
                    colorTotal[0] += source[sourceOffset] * alpha;
                    colorTotal[1] += source[sourceOffset + 1] * alpha;
                    colorTotal[2] += source[sourceOffset + 2] * alpha;
                }
            }
            const targetOffset = (y * width + x) * 4;
            if (alphaTotal > 0) {
                pixels[targetOffset] = Math.round(colorTotal[0] / alphaTotal);
                pixels[targetOffset + 1] = Math.round(colorTotal[1] / alphaTotal);
                pixels[targetOffset + 2] = Math.round(colorTotal[2] / alphaTotal);
            }
            pixels[targetOffset + 3] = Math.round(alphaTotal / samples);
        }
    }
    return { pixels, width, height };
}

export function buildAlphaAwareMipChain(
    pixelData,
    width,
    height,
    { preserveCoverage = true, cutoff = ALPHA_TEST_CUTOFF } = {},
) {
    const levels = [{ pixels: pixelData, width, height }];
    const targetCoverage = preserveCoverage
        ? alphaCoverage(pixelData, cutoff)
        : 0;
    let source = pixelData;
    let sourceWidth = width;
    let sourceHeight = height;
    while (sourceWidth > 1 || sourceHeight > 1) {
        const filteredLevel = downsampleAlphaAware(
            source,
            sourceWidth,
            sourceHeight,
        );
        const uploadedPixels = preserveCoverage
            ? filteredLevel.pixels.slice()
            : filteredLevel.pixels;
        if (preserveCoverage) {
            scaleAlphaToCoverage(uploadedPixels, targetCoverage, cutoff);
        }
        const level = { ...filteredLevel, pixels: uploadedPixels };
        levels.push(level);
        // Coverage correction is specific to one displayed mip. Feeding those
        // modified alpha values into the next downsample compounds the
        // correction and makes successive levels pulse between too solid and
        // too sparse as the camera crosses LOD boundaries.
        source = filteredLevel.pixels;
        sourceWidth = filteredLevel.width;
        sourceHeight = filteredLevel.height;
    }
    return levels;
}

function isPowerOfTwo(value) {
    return value > 0 && (value & (value - 1)) === 0;
}

function uploadMipChain(texture, mipChain) {
    const engine = texture.getScene()?.getEngine?.();
    const internalTexture = texture.getInternalTexture?.();
    if (
        !engine?._uploadArrayBufferViewToTexture
        || !internalTexture
        || !isPowerOfTwo(mipChain[0].width)
        || !isPowerOfTwo(mipChain[0].height)
    ) {
        return false;
    }
    const upload = (target) => {
        for (let level = 1; level < mipChain.length; level += 1) {
            engine._uploadArrayBufferViewToTexture(
                target,
                mipChain[level].pixels,
                0,
                level,
            );
        }
    };
    upload(internalTexture);
    // Babylon normally rebuilds a RawTexture from only its largest image after
    // WebGL context loss. Retain this small chain so the stable alpha mips are
    // restored too instead of silently reverting to generic GPU mipmaps.
    internalTexture.onRebuildCallback = () => {
        const base = mipChain[0];
        const proxy = engine.createRawTexture(
            base.pixels,
            base.width,
            base.height,
            BABYLON.Engine.TEXTUREFORMAT_RGBA,
            true,
            false,
            BABYLON.Engine.TEXTURE_TRILINEAR_SAMPLINGMODE,
            null,
            BABYLON.Engine.TEXTURETYPE_UNSIGNED_BYTE,
            0,
            false,
            mipChain.length,
        );
        upload(proxy);
        return { isAsync: false, isReady: true, proxy };
    };
    return true;
}

export class PvrDecoder {
    constructor(arrayBuffer, byteOffset, byteLength) {
        if (byteOffset !== undefined && byteLength !== undefined) {
            this.reader = new BinaryReader(arrayBuffer, byteOffset, byteLength);
        } else {
            this.reader = new BinaryReader(arrayBuffer);
        }
    }

    decode(scene, {
        preserveAlphaTestCoverage = true,
        generateMipMaps = true,
    } = {}) {
        const view = this.reader.view;
        const key = `pvr:${assetBufferId(view.buffer)}:${view.byteOffset}:${view.byteLength}`;
        let decoded = decodedAssetData.get(key);
        if (!decoded) {
            decoded = this.decodePixels();
            if (decoded) decodedAssetData.set(key, decoded, decoded.pixelData.byteLength);
        }
        if (!decoded) return null;

        const {
            pixelData: cachedPixels,
            width,
            height,
            dataFormat,
            hasAlpha,
            hasGradientAlpha,
        } = decoded;
        // RawTexture/mipmap policy can mutate pixels. Never lend a caller the
        // retained decode buffer (another scene may use a different policy).
        const pixelData = cachedPixels.slice();

        const mipChain = generateMipMaps && hasAlpha
            ? buildAlphaAwareMipChain(pixelData, width, height, {
                preserveCoverage: (
                    !hasGradientAlpha
                    && preserveAlphaTestCoverage
                ),
            })
            : null;
        const texture = new BABYLON.RawTexture(
            pixelData,
            width,
            height,
            BABYLON.Engine.TEXTUREFORMAT_RGBA,
            scene,
            generateMipMaps,
            false,
            generateMipMaps
                ? BABYLON.Engine.TEXTURE_TRILINEAR_SAMPLINGMODE
                : BABYLON.Engine.TEXTURE_BILINEAR_SAMPLINGMODE,
            BABYLON.Engine.TEXTURETYPE_UNSIGNED_BYTE,
            0,
            false,
            false,
            mipChain?.length,
        );
        texture.width = width;
        texture.height = height;
        texture.hasAlpha = hasAlpha;
        texture._hasGradientAlpha = hasGradientAlpha; // Custom property to track gradient alpha
        texture._pvrDataFormat = dataFormat;
        texture._graphicsMipmapsGenerated = generateMipMaps;
        texture._alphaAwareMipmaps = mipChain
            ? uploadMipChain(texture, mipChain)
            : false;
        // When enabled, the GPU builds a complete mip chain even when the
        // source PVR stores only its largest level. Anisotropy keeps thin,
        // angled billboard textures from collapsing into jagged texel rows.
        const maximumAnisotropy = Math.max(
            1,
            scene?.getEngine?.().getCaps?.().maxAnisotropy || 1,
        );
        texture.anisotropicFilteringLevel = Math.min(
            8,
            maximumAnisotropy,
        );
        return texture;
    }

    // Decode into CPU-readable pixels before creating a Babylon texture. Keeping
    // this separate makes PVR layout rules testable without a WebGL context.
    decodePixels() {
        // Check for PVRT header and skip it
        const sig = this.reader.readString(4);
        if (sig === "PVRT") {
            this.reader.skip(4); // Skip the length field
        } else {
            // Not a PVRT header, rewind
            this.reader.seek(0);
        }

        const colorFormat = this.reader.readUInt8();
        const dataFormat = this.reader.readUInt8();
        this.reader.offset += 2; // padding
        const width = this.reader.readUInt16();
        const height = this.reader.readUInt16();

        // Determine if this texture format supports alpha
        // Format 0 = ARGB1555 (1-bit alpha), Format 2 = ARGB4444 (4-bit alpha gradient)
        const hasAlpha = (colorFormat === 0 || colorFormat === 2);
        const hasGradientAlpha = (colorFormat === 2); // Only ARGB4444 has smooth alpha


        const isVQ = (dataFormat === 0x03 || dataFormat === 0x04);
        const hasMipmaps = (dataFormat === 0x02 || dataFormat === 0x04 || dataFormat === 0x06 || dataFormat === 0x08);
        const isTwiddled = (dataFormat === 0x01 || dataFormat === 0x02 || dataFormat === 0x0D);
        const isTwiddledRect = dataFormat === 0x0D;
        const isPalettized = (dataFormat >= 0x05 && dataFormat <= 0x08);
        // RECTANGLE (0x09), STRIDE (0x0B) are explicitly non-twiddled

        let pixelData;
        if (isPalettized) {
            pixelData = this.decodePalettized(width, height, colorFormat, dataFormat);
        } else if (isVQ) {
            pixelData = this.decodeVQ(width, height, colorFormat, hasMipmaps);
        } else {
            pixelData = this.decodeRaw(width, height, colorFormat, isTwiddled, hasMipmaps, isTwiddledRect);
        }

        if (!pixelData) return null;

        return {
            pixelData,
            width,
            height,
            colorFormat,
            dataFormat,
            hasAlpha,
            hasGradientAlpha,
        };
    }

    calcMipmapOffset(width, height, bpp) {
        // Calculate total byte size of all mipmap levels below the top level
        // Mipmaps go from 1x1 up to (width/2 x height/2)
        let offset = 0;
        let mipW = 1;
        let mipH = 1;
        while (mipW < width || mipH < height) {
            offset += mipW * mipH * bpp;
            mipW = Math.min(mipW * 2, width);
            mipH = Math.min(mipH * 2, height);
        }
        return offset;
    }

    decodeVQ(width, height, colorFormat, hasMipmaps) {
        const codebookSize = 256;
        const codebook = [];
        for (let i = 0; i < codebookSize; i++) {
            codebook.push([
                this.reader.readUInt16(), this.reader.readUInt16(),
                this.reader.readUInt16(), this.reader.readUInt16()
            ]);
        }

        const rgba = new Uint8Array(width * height * 4);
        const mipWidth = width / 2;
        const mipHeight = height / 2;
        let dataStart = this.reader.tell();

        // Skip past smaller mipmap levels if present
        // VQ mipmaps: each mip level has (mipW/2)*(mipH/2) codebook indices (1 byte each)
        if (hasMipmaps) {
            let skip = 0;
            let mW = 1;
            let mH = 1;
            while (mW < mipWidth || mH < mipHeight) {
                skip += mW * mH;
                mW = Math.min(mW * 2, mipWidth);
                mH = Math.min(mH * 2, mipHeight);
            }
            dataStart += skip;
        }

        // Pre-fetch twiddle LUTs for the mip dimensions
        const maxMipDim = Math.max(mipWidth, mipHeight);
        const twLut = PvrDecoder.getTwiddleLUT(maxMipDim);

        for (let y = 0; y < mipHeight; y++) {
            const twY = twLut[y] << 1;
            for (let x = 0; x < mipWidth; x++) {
                const twiddledIdx = twLut[x] | twY;
                this.reader.seek(dataStart + twiddledIdx);
                const codeIdx = this.reader.readUInt8();
                if (codeIdx >= codebook.length) continue;

                const block = codebook[codeIdx];

                for (let i = 0; i < 4; i++) {
                    const bx = i % 2;
                    const by = Math.floor(i / 2);
                    const [r, g, b, a] = this.decodeColor(block[i], colorFormat);
                    const destIdx = ((y * 2 + by) * width + (x * 2 + bx)) * 4;
                    rgba[destIdx] = r;
                    rgba[destIdx + 1] = g;
                    rgba[destIdx + 2] = b;
                    rgba[destIdx + 3] = a;
                }
            }
        }
        return rgba;
    }

    decodeRaw(width, height, colorFormat, isTwiddled, hasMipmaps, isTwiddledRect = false) {
        const rgba = new Uint8Array(width * height * 4);
        let dataStart = this.reader.tell();

        // Skip past smaller mipmap levels if present (2 bytes per pixel per level)
        if (hasMipmaps) {
            dataStart += this.calcMipmapOffset(width, height, 2);
        }

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const srcIdx = isTwiddled
                    ? PvrDecoder.twiddledSourceIndex(x, y, width, height, isTwiddledRect)
                    : (y * width + x);
                const color = this.reader.readUInt16At(dataStart + srcIdx * 2);
                const [r, g, b, a] = this.decodeColor(color, colorFormat);
                const destIdx = (y * width + x) * 4;
                rgba[destIdx] = r;
                rgba[destIdx + 1] = g;
                rgba[destIdx + 2] = b;
                rgba[destIdx + 3] = a;
            }
        }
        return rgba;
    }

    static twiddledSourceIndex(x, y, width, height, isTwiddledRect = false) {
        if (!isTwiddledRect) {
            const twLut = PvrDecoder.getTwiddleLUT(Math.max(width, height));
            return twLut[x] | (twLut[y] << 1);
        }

        // Dreamcast TWIDDLED_RECT (0x0d) uses Y in the low/even Morton bits and
        // X in the high/odd bits. Flycast's twiddle_slow() emits Y before X,
        // and tools/assets/pvr_decoder.py independently uses the same convention.
        //
        // The legacy square-texture path above uses the opposite convention,
        // compensated elsewhere by the viewer's historical global U/V swap.
        // Ryo's rectangular atlas uses native runtime UVs, so it must use the
        // actual PVR convention here rather than inheriting that double error.
        const tileSize = Math.min(width, height);
        const twLut = PvrDecoder.getTwiddleLUT(tileSize);
        const tilePixels = tileSize * tileSize;

        if (width > height) {
            const tile = Math.floor(x / tileSize);
            const localX = x % tileSize;
            return tile * tilePixels + (twLut[localX] << 1) + twLut[y];
        }

        const tile = Math.floor(y / tileSize);
        const localY = y % tileSize;
        return tile * tilePixels + (twLut[x] << 1) + twLut[localY];
    }

    decodePalettized(width, height, colorFormat, dataFormat) {
        const is4bit = (dataFormat === 0x05 || dataFormat === 0x06);
        const hasMipmaps = (dataFormat === 0x06 || dataFormat === 0x08);
        const paletteSize = is4bit ? 16 : 256;

        // Read palette
        const palette = [];
        for (let i = 0; i < paletteSize; i++) {
            const v = this.reader.readUInt16();
            palette.push(this.decodeColor(v, colorFormat));
        }

        let dataStart = this.reader.tell();

        // Skip mipmaps if present
        if (hasMipmaps) {
            const bpp = is4bit ? 0.5 : 1;
            dataStart += this.calcMipmapOffset(width, height, bpp);
        }

        // Pre-fetch twiddle LUT
        const maxDim = Math.max(width, height);
        const twLut = PvrDecoder.getTwiddleLUT(maxDim);

        const rgba = new Uint8Array(width * height * 4);
        for (let y = 0; y < height; y++) {
            const twY = twLut[y] << 1;
            for (let x = 0; x < width; x++) {
                const twIdx = twLut[x] | twY;
                let palIdx;
                if (is4bit) {
                    const byteOffset = dataStart + Math.floor(twIdx / 2);
                    const byteVal = this.reader.view ? this.reader.view.getUint8(byteOffset) : 0;
                    palIdx = (twIdx & 1) ? (byteVal >> 4) & 0x0F : byteVal & 0x0F;
                } else {
                    palIdx = this.reader.view ? this.reader.view.getUint8(dataStart + twIdx) : 0;
                }
                if (palIdx >= palette.length) palIdx = 0;
                const [r, g, b, a] = palette[palIdx];
                const destIdx = (y * width + x) * 4;
                rgba[destIdx] = r;
                rgba[destIdx + 1] = g;
                rgba[destIdx + 2] = b;
                rgba[destIdx + 3] = a;
            }
        }
        return rgba;
    }

    decodeColor(v, format) {
        let r, g, b, a;
        if (format === 0) { // ARGB1555
            a = (v & 0x8000) ? 255 : 0;
            const r5 = (v >> 10) & 0x1f;
            const g5 = (v >> 5) & 0x1f;
            const b5 = v & 0x1f;
            r = (r5 << 3) | (r5 >> 2);
            g = (g5 << 3) | (g5 >> 2);
            b = (b5 << 3) | (b5 >> 2);
        } else if (format === 1) { // RGB565
            a = 255;
            const r5 = (v >> 11) & 0x1f;
            const g6 = (v >> 5) & 0x3f;
            const b5 = v & 0x1f;
            r = (r5 << 3) | (r5 >> 2);
            g = (g6 << 2) | (g6 >> 4);
            b = (b5 << 3) | (b5 >> 2);
        } else if (format === 2) { // ARGB4444
            const a4 = (v >> 12) & 0x0f;
            const r4 = (v >> 8) & 0x0f;
            const g4 = (v >> 4) & 0x0f;
            const b4 = v & 0x0f;
            a = (a4 << 4) | a4;
            r = (r4 << 4) | r4;
            g = (g4 << 4) | g4;
            b = (b4 << 4) | b4;
        } else {
            return [255, 255, 255, 255];
        }
        return [r, g, b, a];
    }

    // Pre-computed twiddle LUT (lazily built per dimension, cached statically)
    static _twiddleLUT = new Map();

    static getTwiddleLUT(size) {
        if (PvrDecoder._twiddleLUT.has(size)) return PvrDecoder._twiddleLUT.get(size);
        const lut = new Uint32Array(size);
        for (let i = 0; i < size; i++) {
            let val = 0;
            for (let bit = 0; bit < 10; bit++) {
                val |= ((i >> bit) & 1) << (2 * bit);
            }
            lut[i] = val;
        }
        PvrDecoder._twiddleLUT.set(size, lut);
        return lut;
    }

    untwiddle(x, y) {
        let res = 0;
        for (let i = 0; i < 10; i++) {
            res |= ((x >> i) & 1) << (2 * i);
            res |= ((y >> i) & 1) << (2 * i + 1);
        }
        return res;
    }
}
