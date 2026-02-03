import * as BABYLON from '@babylonjs/core';
import { BinaryReader } from './BinaryReader.js';

export class PvrDecoder {
    constructor(arrayBuffer) {
        this.reader = new BinaryReader(arrayBuffer);
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

        console.log(`[PVR] Decoding ${width}x${height} format=${colorFormat} dataFormat=${dataFormat} hasAlpha=${hasAlpha} hasGradientAlpha=${hasGradientAlpha}`);

        let isVQ = (dataFormat === 0x03 || dataFormat === 0x04);
        let isTwiddled = (dataFormat === 0x01 || dataFormat === 0x02 || dataFormat === 0x03 || dataFormat === 0x04 || dataFormat === 0x11);

        let pixelData;
        if (isVQ) {
            pixelData = this.decodeVQ(width, height, colorFormat);
        } else {
            pixelData = this.decodeRaw(width, height, colorFormat, isTwiddled);
        }

        if (!pixelData) return null;

        const texture = new BABYLON.RawTexture(
            pixelData,
            width,
            height,
            BABYLON.Engine.TEXTUREFORMAT_RGBA,
            scene,
            false,
            false,
            BABYLON.Engine.TEXTURE_BILINEAR_SAMPLINGMODE
        );
        texture.width = width;
        texture.height = height;
        texture.hasAlpha = hasAlpha;
        texture._hasGradientAlpha = hasGradientAlpha; // Custom property to track gradient alpha
        return texture;
    }

    decodeVQ(width, height, colorFormat) {
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
        const dataStart = this.reader.tell();

        for (let y = 0; y < mipHeight; y++) {
            for (let x = 0; x < mipWidth; x++) {
                const twiddledIdx = this.untwiddle(x, y);
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

    decodeRaw(width, height, colorFormat, isTwiddled) {
        const rgba = new Uint8Array(width * height * 4);
        const dataStart = 8;
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const srcIdx = isTwiddled ? this.untwiddle(x, y) : (y * width + x);
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

    decodeColor(v, format) {
        let r, g, b, a;
        if (format === 0) { // ARGB1555
            a = (v & 0x8000) ? 255 : 0;
            r = ((v >> 10) & 0x1f) << 3;
            g = ((v >> 5) & 0x1f) << 3;
            b = (v & 0x1f) << 3;
        } else if (format === 1) { // RGB565
            a = 255;
            r = ((v >> 11) & 0x1f) << 3;
            g = ((v >> 5) & 0x3f) << 2;
            b = (v & 0x1f) << 3;
        } else if (format === 2) { // ARGB4444
            a = ((v >> 12) & 0x0f) << 4;
            r = ((v >> 8) & 0x0f) << 4;
            g = ((v >> 4) & 0x0f) << 4;
            b = (v & 0x0f) << 4;
        } else {
            return [255, 255, 255, 255];
        }
        return [r, g, b, a];
    }

    untwiddle(x, y) {
        let res = 0;
        for (let i = 0; i < 10; i++) {
            res |= (x & (1 << i)) ? (1 << (2 * i + 1)) : 0;
            res |= (y & (1 << i)) ? (1 << (2 * i)) : 0;
        }
        return res;
    }
}
