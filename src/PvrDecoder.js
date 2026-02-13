import * as BABYLON from '@babylonjs/core';
import { BinaryReader } from './BinaryReader.js';

export class PvrDecoder {
    constructor(arrayBuffer, byteOffset, byteLength) {
        if (byteOffset !== undefined && byteLength !== undefined) {
            this.reader = new BinaryReader(arrayBuffer, byteOffset, byteLength);
        } else {
            this.reader = new BinaryReader(arrayBuffer);
        }
    }

    decode(scene) {
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


        let isVQ = (dataFormat === 0x03 || dataFormat === 0x04);
        let hasMipmaps = (dataFormat === 0x02 || dataFormat === 0x04 || dataFormat === 0x06 || dataFormat === 0x08);
        let isTwiddled = (dataFormat === 0x01 || dataFormat === 0x02 || dataFormat === 0x0D);
        let isPalettized = (dataFormat >= 0x05 && dataFormat <= 0x08);
        // RECTANGLE (0x09), STRIDE (0x0B) are explicitly non-twiddled

        let pixelData;
        if (isPalettized) {
            pixelData = this.decodePalettized(width, height, colorFormat, dataFormat);
        } else if (isVQ) {
            pixelData = this.decodeVQ(width, height, colorFormat, hasMipmaps);
        } else {
            pixelData = this.decodeRaw(width, height, colorFormat, isTwiddled, hasMipmaps);
        }

        if (!pixelData) return null;

        const texture = new BABYLON.RawTexture(
            pixelData,
            width,
            height,
            BABYLON.Engine.TEXTUREFORMAT_RGBA,
            scene,
            true,
            false,
            BABYLON.Engine.TEXTURE_TRILINEAR_SAMPLINGMODE
        );
        texture.width = width;
        texture.height = height;
        texture.hasAlpha = hasAlpha;
        texture._hasGradientAlpha = hasGradientAlpha; // Custom property to track gradient alpha
        return texture;
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

    decodeRaw(width, height, colorFormat, isTwiddled, hasMipmaps) {
        const rgba = new Uint8Array(width * height * 4);
        let dataStart = this.reader.tell();

        // Skip past smaller mipmap levels if present (2 bytes per pixel per level)
        if (hasMipmaps) {
            dataStart += this.calcMipmapOffset(width, height, 2);
        }

        // Pre-fetch twiddle LUT if needed
        let twLut = null;
        if (isTwiddled) {
            const maxDim = Math.max(width, height);
            twLut = PvrDecoder.getTwiddleLUT(maxDim);
        }

        for (let y = 0; y < height; y++) {
            const twY = twLut ? (twLut[y] << 1) : 0;
            for (let x = 0; x < width; x++) {
                const srcIdx = twLut ? (twLut[x] | twY) : (y * width + x);
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
