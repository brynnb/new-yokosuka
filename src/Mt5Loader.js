import * as BABYLON from '@babylonjs/core';
import { BinaryReader } from './BinaryReader.js';
import { PvrDecoder } from './PvrDecoder.js';

export class Mt5Loader {
    constructor(scene, options = {}) {
        this.scene = scene;
        this.textureCache = new Map();
        this.textureIds = new Map();
        this.materialCache = new Map(); // Shared across load() calls: key → StandardMaterial
        this.globalVertices = [];
        this.vertexOffset = 0;
        this.characterRigMode = options.characterRigMode || "baked";
        this.backFaceCulling = options.backFaceCulling ?? true;
        this.respectStripWindingSign = options.respectStripWindingSign ?? false;
        this.emulateMirrorResize = options.emulateMirrorResize ?? true;
        this.ryoHeadAtlasFix = options.ryoHeadAtlasFix ?? false;
        this.ryoHeadAtlasMode = options.ryoHeadAtlasMode || "project-cw-obj-side";
        this.ryoHeadAtlasDebug = options.ryoHeadAtlasDebug || "";
        this.skipRyoHeadAtlasStrips = options.skipRyoHeadAtlasStrips || null;
        this.onlyRyoHeadAtlasStrips = options.onlyRyoHeadAtlasStrips || null;
        this.remapRyoHeadAtlasStrips = options.remapRyoHeadAtlasStrips || null;
        this.ryoHeadNodeUvTransforms = options.ryoHeadNodeUvTransforms || null;
        this.textureAlphaModeOverrides = options.textureAlphaModeOverrides || null;
        this.textureZOffsetOverrides = options.textureZOffsetOverrides || null;
        this.textureAddressMode = Mt5Loader.normalizeTextureAddressMode(options.textureAddressMode || "mirror");
        this.textureAddressModeOverrides = options.textureAddressModeOverrides || null;
        this.textureCoordinateMode = Mt5Loader.normalizeTextureCoordinateMode(options.textureCoordinateMode || "viewer");
        // Pre-built index for texture pack: Map<string, {offset, length}>
        // Key is "hi_lo" where hi/lo are the two uint32 ID halves
        this.texturePackIndex = null;
    }

    setCharacterRigMode(mode) {
        this.characterRigMode = mode || "baked";
        return this;
    }

    static normalizeTextureAddressMode(mode) {
        const normalized = String(mode || "").trim().toLowerCase();
        if (normalized === "clamp" || normalized === "repeat" || normalized === "mirror") {
            return normalized;
        }
        return "mirror";
    }

    static normalizeTextureCoordinateMode(mode) {
        const normalized = String(mode || "").trim().toLowerCase().replace(/_/g, "-");
        const aliases = new Map([
            ["source", "pc"],
            ["source-raw", "pc"],
            ["raw", "pc"],
            ["u-v", "pc"],
            ["uv", "pc"],
            ["source-flipu", "pc-flipu"],
            ["source-flip-u", "pc-flipu"],
            ["source-flipv", "pc-flipv"],
            ["source-flip-v", "pc-flipv"],
            ["source-flipuv", "pc-flipuv"],
            ["source-flip-u-v", "pc-flipuv"],
            ["flip-u", "pc-flipu"],
            ["flipu", "pc-flipu"],
            ["flip-v", "pc-flipv"],
            ["flipv", "pc-flipv"],
            ["flip-uv", "pc-flipuv"],
            ["flipuv", "pc-flipuv"],
            ["swap", "viewer"],
            ["v-u", "viewer"],
            ["vu", "viewer"],
            ["rotate-cw", "source-rotate-cw"],
            ["cw", "source-rotate-cw"],
            ["rotate-ccw", "source-rotate-ccw"],
            ["ccw", "source-rotate-ccw"],
            ["rotate-180", "source-rotate-180"],
            ["180", "source-rotate-180"],
        ]);
        const value = aliases.get(normalized) || normalized;
        const allowed = new Set([
            "viewer",
            "viewer-flipu",
            "viewer-flipv",
            "viewer-flipuv",
            "pc",
            "pc-flipu",
            "pc-flipv",
            "pc-flipuv",
            "source-rotate-cw",
            "source-rotate-ccw",
            "source-rotate-180",
        ]);
        return allowed.has(value) ? value : "viewer";
    }

    textureCoordinateForSource(sourceU, sourceV) {
        switch (this.textureCoordinateMode) {
            case "pc":
                return [sourceU, sourceV];
            case "pc-flipu":
                return [1.0 - sourceU, sourceV];
            case "pc-flipv":
                return [sourceU, 1.0 - sourceV];
            case "pc-flipuv":
                return [1.0 - sourceU, 1.0 - sourceV];
            case "source-rotate-cw":
                return [1.0 - sourceV, sourceU];
            case "source-rotate-ccw":
                return [sourceV, 1.0 - sourceU];
            case "source-rotate-180":
                return [1.0 - sourceU, 1.0 - sourceV];
            case "viewer-flipu":
                return [1.0 - sourceV, sourceU];
            case "viewer-flipv":
                return [sourceV, 1.0 - sourceU];
            case "viewer-flipuv":
                return [1.0 - sourceV, 1.0 - sourceU];
            case "viewer":
            default:
                return [sourceV, sourceU];
        }
    }

    // Pre-index a texture pack binary for O(1) lookups.
    // Call once per pack, store the result, pass to load() via setTexturePackIndex().
    static buildTexturePackIndex(buffer) {
        if (!buffer) return null;
        const view = new DataView(buffer);
        const index = new Map();
        let pos = 0;
        const size = buffer.byteLength;
        while (pos < size - 12) {
            const hi = view.getUint32(pos, true);
            const lo = view.getUint32(pos + 4, true);
            const len = view.getUint32(pos + 8, true);
            if (len === 0 || len > 0x1000000) break;
            const dataOffset = pos + 12;
            const key = `${hi}_${lo}`;
            if (!index.has(key)) {
                index.set(key, { offset: dataOffset, length: len });
            }
            pos = dataOffset + len;
        }
        return index;
    }

    setTexturePackIndex(baseIndex, timeIndex, baseBuffer, timeBuffer) {
        this._basePackIndex = baseIndex || null;
        this._timePackIndex = timeIndex || null;
        this._basePackBuffer = baseBuffer || null;
        this._timePackBuffer = timeBuffer || null;
    }

    static readFourCC(value) {
        return String.fromCharCode(
            value & 0xff,
            (value >> 8) & 0xff,
            (value >> 16) & 0xff,
            (value >> 24) & 0xff,
        ).replace(/\0/g, "");
    }

    static textureIdHex(id) {
        if (!id) return "";
        const bytes = Array.from(id);
        return bytes.map((value) => value.toString(16).padStart(2, "0")).join("");
    }

    static isPcLengthPrefixedStripType(type) {
        return (type >= 0x10 && type <= 0x14) || (type >= 0x18 && type <= 0x1c);
    }

    alphaModeForTexture(texId, tex) {
        let alphaMode = tex ? "opaque" : "missing";
        if (tex?._hasGradientAlpha === true) alphaMode = "blend";
        else if (tex?.hasAlpha === true) alphaMode = "alphatest";

        const override = this.lookupTextureOverride(this.textureAlphaModeOverrides, texId);
        if (override === "opaque" || override === "alphatest" || override === "blend") {
            return override;
        }

        // Ryo's combined face/side-head atlas is ARGB1555, but its zero-alpha
        // texels are black hair/side-atlas padding in the web viewer. Treating
        // those texels as punch-through creates holes and exposes tan side
        // shell patches that are not useful for texture validation.
        if (alphaMode === "alphatest" && this.isRyoHeadAtlasTexture(texId)) {
            return "opaque";
        }
        return alphaMode;
    }

    lookupTextureOverride(overrides, texId) {
        if (!overrides) return null;
        const textureHex = Mt5Loader.textureIdHex(this.textureIds.get(texId)).toLowerCase();
        const keys = [
            String(texId).toLowerCase(),
            `0x${Number(texId).toString(16)}`,
            textureHex,
        ];
        for (const key of keys) {
            const override = overrides.get?.(key) ?? overrides[key];
            if (override !== undefined && override !== null) {
                return override;
            }
        }
        return null;
    }

    zOffsetForTexture(texId) {
        const override = this.lookupTextureOverride(this.textureZOffsetOverrides, texId);
        const zOffset = Number(override);
        return Number.isFinite(zOffset) ? zOffset : 0;
    }

    addressModeForTexture(texId) {
        return Mt5Loader.normalizeTextureAddressMode(
            this.lookupTextureOverride(this.textureAddressModeOverrides, texId) || this.textureAddressMode,
        );
    }

    babylonAddressMode(mode) {
        switch (Mt5Loader.normalizeTextureAddressMode(mode)) {
            case "clamp":
                return BABYLON.Texture.CLAMP_ADDRESSMODE;
            case "repeat":
                return BABYLON.Texture.WRAP_ADDRESSMODE;
            default:
                return BABYLON.Texture.MIRROR_ADDRESSMODE;
        }
    }

    isRyoHeadAtlasTexture(texId) {
        if (!this.ryoHeadAtlasFix) return false;

        // YKB_KAJ is Ryo's combined face/side-head atlas.
        return Mt5Loader.textureIdHex(this.textureIds.get(texId)) === "a64b425f4b414a5f";
    }

    isRyoHairCardTexture(texId) {
        if (!this.ryoHeadAtlasFix) return false;

        // YKB_KAM is Ryo's alpha hair-card/back-strand texture.
        return Mt5Loader.textureIdHex(this.textureIds.get(texId)) === "a64b425f4b414d5f";
    }

    ryoHeadAtlasStripMetrics(strip, node) {
        if (!strip || !node) return null;

        let x = 0;
        let y = 0;
        let z = 0;
        let nx = 0;
        let ny = 0;
        let nz = 0;
        let count = 0;

        for (const point of strip) {
            const vertex = point.vertexOverride || this.globalVertices[point.idx];
            const sourcePos = vertex?.sourcePos;
            const sourceNorm = vertex?.sourceNorm;
            if (!sourcePos || !sourceNorm) continue;
            x += sourcePos[0];
            y += sourcePos[1];
            z += sourcePos[2];
            nx += sourceNorm[0];
            ny += sourceNorm[1];
            nz += sourceNorm[2];
            count++;
        }

        if (count === 0) return null;

        x /= count;
        y /= count;
        z /= count;
        nx /= count;
        ny /= count;
        nz /= count;
        const world = Mt5Loader.transformRowPoint([x, y, z], this.sourceWorldMatrixForNode(node));
        const renderY = world[1];

        return { x, y, z, nx, ny, nz, renderY };
    }

    isRyoHeadAtlasLegacyFaceMetrics(metrics) {
        if (!metrics) return false;
        const { x, y, z, nx, ny, nz } = metrics;
        return (
            x >= 0.045 &&
            Math.abs(y) <= 0.085 &&
            z >= 0.02 &&
            z <= 0.23 &&
            nx >= 0.18 &&
            Math.abs(ny) <= 0.85 &&
            Math.abs(nz) <= 0.85
        );
    }

    isRyoHeadAtlasFaceMetrics(metrics) {
        return this.isRyoHeadAtlasLegacyFaceMetrics(metrics) && metrics.renderY <= 0.585;
    }

    classifyRyoHeadAtlasStrip(strip, texId, node) {
        if (!this.isRyoHeadAtlasTexture(texId) || !node) return null;
        const metrics = this.ryoHeadAtlasStripMetrics(strip, node);
        if (!metrics) return null;

        // Ryo's YKB head atlas is shared across the main head shell and child
        // face/head nodes. Source X is the character's front/back axis and
        // source Y is lateral. Front-facing strips use the right atlas half;
        // side and back strips reuse the left half, mirrored because the atlas
        // only stores one ear/side-head patch.
        const useLegacyRegion = this.ryoHeadAtlasMode === "project-cw-auto-legacy-region";
        const isFace = useLegacyRegion
            ? this.isRyoHeadAtlasLegacyFaceMetrics(metrics)
            : this.isRyoHeadAtlasFaceMetrics(metrics);
        if (isFace) {
            return "face";
        }

        return "side";
    }

    usesRyoHeadAtlasAutoProjection() {
        return this.ryoHeadAtlasMode.endsWith("-auto") ||
            this.ryoHeadAtlasMode === "project-cw-auto-legacy-region" ||
            this.ryoHeadAtlasMode === "project-cw-auto-legacy-bounds";
    }

    ryoHeadAtlasBaseMode() {
        if (this.ryoHeadAtlasMode === "project-cw-auto-legacy-region" ||
            this.ryoHeadAtlasMode === "project-cw-auto-legacy-bounds") {
            return "project-cw";
        }
        return this.ryoHeadAtlasMode.endsWith("-auto")
            ? this.ryoHeadAtlasMode.slice(0, -"-auto".length)
            : this.ryoHeadAtlasMode;
    }

    mapUV(point, texId, node, atlasRegion, atlasProjectionBounds = null, strip = null) {
        const sourceU = this.emulateMirrorResize && point.mirrorU ? point.u * 2.0 : point.u;
        const sourceV = this.emulateMirrorResize && point.mirrorV ? point.v * 2.0 : point.v;
        let [texU, texV] = this.textureCoordinateForSource(sourceU, sourceV);

        if (atlasRegion && this.isRyoHeadAtlasTexture(texId)) {
            const vertex = point.vertexOverride || this.globalVertices[point.idx];
            const sourceY = vertex?.sourcePos?.[1] || 0;
            const useAutoProjection = this.usesRyoHeadAtlasAutoProjection();
            const atlasMode = this.ryoHeadAtlasBaseMode();
            const effectiveAtlasRegion = this.ryoHeadAtlasMode === "project-cw-raw-region"
                ? (point.u >= 0.5 ? "face" : "side")
                : atlasRegion;

            if (atlasMode === "obj-raw") {
                texU = point.u;
                texV = point.v;
            } else if (effectiveAtlasRegion === "face") {
                const localX = Math.max(0, Math.min(1, point.u));
                const localY = Math.max(0, Math.min(1, point.v));
                const faceProjection = this.projectRyoFaceAtlasUV(
                    vertex,
                    node,
                    useAutoProjection ? atlasProjectionBounds : null,
                );
                const faceMode = (
                    atlasMode === "project-cw-hairline" ||
                    atlasMode === "project-cw-scalp-strip-hair" ||
                    atlasMode === "project-cw-scalp-hair" ||
                    atlasMode === "project-cw-sideproject" ||
                    atlasMode === "project-cw-sideproject-flipu"
                ) ? "project-cw" : atlasMode;
                switch (faceMode) {
                    case "project-upright":
                        if (faceProjection) {
                            texU = 0.5 + faceProjection.x * 0.5;
                            texV = faceProjection.y;
                        }
                        break;
                    case "project-upright-flipv":
                        if (faceProjection) {
                            texU = 0.5 + faceProjection.x * 0.5;
                            texV = 1.0 - faceProjection.y;
                        }
                        break;
                    case "project-cw":
                        if (faceProjection) {
                            texU = 0.5 + faceProjection.y * 0.5;
                            texV = 1.0 - faceProjection.x;
                        }
                        break;
                    case "project-cw-mirrorx":
                        if (faceProjection) {
                            texU = 0.5 + faceProjection.y * 0.5;
                            texV = faceProjection.x;
                        }
                        break;
                    case "project-ccw":
                        if (faceProjection) {
                            texU = 0.5 + (1.0 - faceProjection.y) * 0.5;
                            texV = faceProjection.x;
                        }
                        break;
                    case "project-ccw-mirrorx":
                        if (faceProjection) {
                            texU = 0.5 + (1.0 - faceProjection.y) * 0.5;
                            texV = 1.0 - faceProjection.x;
                        }
                        break;
                    case "raw-face":
                        texU = 0.5 + localX * 0.5;
                        texV = localY;
                        break;
                    case "raw-face-flipv":
                        texU = 0.5 + localX * 0.5;
                        texV = 1.0 - localY;
                        break;
                    case "swap-face":
                        texU = 0.5 + localY * 0.5;
                        texV = localX;
                        break;
                    case "swap-face-mirroru":
                        texU = 1.0 - localY * 0.5;
                        texV = localX;
                        break;
                    case "current-mirroru":
                        texU = 1.0 - localY * 0.5;
                        texV = 1.0 - localX;
                        break;
                    case "current":
                    default:
                        texU = 0.5 + localY * 0.5;
                        texV = 1.0 - localX;
                        break;
                }
            } else {
                if (atlasMode === "project-cw-obj-side") {
                    texU = point.u;
                    texV = point.v;
                } else if (atlasMode === "project-cw-sideproject" || atlasMode === "project-cw-sideproject-flipu") {
                    const sideProjection = this.projectRyoSideHeadAtlasUV(
                        vertex,
                        atlasMode === "project-cw-sideproject-flipu",
                    );
                    if (sideProjection) {
                        texU = sideProjection.x;
                        texV = sideProjection.y;
                    }
                } else if (this.matchesRyoHeadAtlasStripFilter(this.remapRyoHeadAtlasStrips, strip, node)) {
                    const scalpUv = this.mapRyoScalpHairAtlasUV(point, vertex);
                    texU = scalpUv.x;
                    texV = scalpUv.y;
                } else if (atlasMode === "project-cw-scalp-strip-hair" && this.isRyoUpperScalpSideStrip(strip, node)) {
                    const scalpUv = this.mapRyoScalpHairAtlasUV(point, vertex);
                    texU = scalpUv.x;
                    texV = scalpUv.y;
                } else if (atlasMode === "project-cw-scalp-hair" && this.isRyoUpperScalpSidePoint(vertex, node)) {
                    const scalpUv = this.mapRyoScalpHairAtlasUV(point, vertex);
                    texU = scalpUv.x;
                    texV = scalpUv.y;
                } else if (atlasMode === "project-cw-hairline" && this.isRyoFrontScalpSidePoint(vertex, node)) {
                    texU = sourceU * 0.5;
                    texV = 1.0 - sourceV;
                    if (sourceY < 0) texU = 0.5 - texU;
                } else {
                    texU *= 0.5;
                    if (sourceY < 0) texU = 0.5 - texU;
                }
            }
        }

        return this.applyRyoHeadNodeUvTransform([texU, texV], texId, node, atlasRegion);
    }

    applyRyoHeadNodeUvTransform(uv, texId, node, atlasRegion = null) {
        if (!this.ryoHeadNodeUvTransforms || !node) return uv;

        const key = `0x${Number(node.addr).toString(16)}`;
        const regionKey = atlasRegion && this.isRyoHeadAtlasTexture(texId) ? `${key}:${atlasRegion}` : null;
        const transform = (regionKey ? this.ryoHeadNodeUvTransforms[regionKey] : null) ||
            this.ryoHeadNodeUvTransforms[key] ||
            this.ryoHeadNodeUvTransforms[node.addr];
        if (!transform || transform.enabled === false) return uv;

        const scope = transform.scope || "atlas";
        if (scope === "atlas" && !this.isRyoHeadAtlasTexture(texId)) return uv;
        if (scope === "hair" && !this.isRyoHairCardTexture(texId)) return uv;
        if (scope === "head-textures" && !this.isRyoHeadAtlasTexture(texId) && !this.isRyoHairCardTexture(texId)) return uv;

        const pivotU = Number.isFinite(transform.pivotU) ? transform.pivotU : 0.5;
        const pivotV = Number.isFinite(transform.pivotV) ? transform.pivotV : 0.5;
        let u = uv[0] - pivotU;
        let v = uv[1] - pivotV;

        const scaleU = Number.isFinite(transform.scaleU) ? transform.scaleU : 1;
        const scaleV = Number.isFinite(transform.scaleV) ? transform.scaleV : 1;
        u *= scaleU;
        v *= scaleV;

        if (transform.mirrorU) u = -u;
        if (transform.mirrorV) v = -v;

        const rotation = String(transform.rotation || "0");
        switch (rotation) {
            case "90":
            case "cw":
                [u, v] = [v, -u];
                break;
            case "180":
                u = -u;
                v = -v;
                break;
            case "270":
            case "ccw":
                [u, v] = [-v, u];
                break;
            default:
                break;
        }

        const offsetU = Number.isFinite(transform.offsetU) ? transform.offsetU : 0;
        const offsetV = Number.isFinite(transform.offsetV) ? transform.offsetV : 0;
        return [u + pivotU + offsetU, v + pivotV + offsetV];
    }

    ryoHeadAtlasUvKey(strip, texId, node) {
        if (!this.isRyoHeadAtlasTexture(texId)) return "default";
        const remap = this.matchesRyoHeadAtlasStripFilter(this.remapRyoHeadAtlasStrips, strip, node)
            ? "remap"
            : "normal";
        return `${this.ryoHeadAtlasMode}:${remap}`;
    }

    mapRyoScalpHairAtlasUV(point, vertex) {
        const sourceU = this.emulateMirrorResize && point.mirrorU ? point.u * 2.0 : point.u;
        const sourceV = this.emulateMirrorResize && point.mirrorV ? point.v * 2.0 : point.v;
        const sourceY = vertex?.sourcePos?.[1] || 0;

        let texU = Math.max(0.03, Math.min(0.47, sourceU * 0.45));
        if (sourceY < 0) texU = 0.5 - texU;

        return {
            x: texU,
            y: Math.max(0.0, Math.min(0.22, (1.0 - sourceV) * 0.55)),
        };
    }

    projectRyoSideHeadAtlasUV(vertex, flipFrontBack = false) {
        if (!vertex?.sourcePos) return null;

        const sourceX = vertex.sourcePos[0];
        const sourceY = vertex.sourcePos[1];
        const sourceZ = vertex.sourcePos[2];

        // Left half of YKB_KAJ is a single side/back head paint with one ear.
        // Project Ryo's side/back shell onto front/back by height, then mirror
        // the stored side for the opposite half of the head.
        const minFrontBack = -0.102;
        const maxFrontBack = 0.118;
        const minHeight = -0.024;
        const maxHeight = 0.270;
        let frontBack = (sourceX - minFrontBack) / (maxFrontBack - minFrontBack);
        const height = (sourceZ - minHeight) / (maxHeight - minHeight);

        frontBack = Math.max(0, Math.min(1, frontBack));
        if (flipFrontBack) frontBack = 1.0 - frontBack;
        if (sourceY < 0) frontBack = 1.0 - frontBack;

        return {
            x: frontBack * 0.5,
            y: 1.0 - Math.max(0, Math.min(1, height)),
        };
    }

    isRyoFrontScalpSidePoint(vertex, node) {
        if (!vertex?.sourcePos || !node) return false;
        const world = Mt5Loader.transformRowPoint(vertex.sourcePos, this.sourceWorldMatrixForNode(node));
        return (
            vertex.sourcePos[0] >= 0.035 &&
            world[1] >= 0.54 &&
            Math.abs(vertex.sourcePos[1]) <= 0.105
        );
    }

    isRyoUpperScalpSidePoint(vertex, node) {
        if (!vertex?.sourcePos || !node) return false;
        const world = Mt5Loader.transformRowPoint(vertex.sourcePos, this.sourceWorldMatrixForNode(node));
        return (
            world[1] >= 0.54 &&
            vertex.sourcePos[2] >= 0.175 &&
            vertex.sourcePos[0] >= -0.012 &&
            Math.abs(vertex.sourcePos[1]) <= 0.105
        );
    }

    isRyoUpperScalpSideStrip(strip, node) {
        if (!strip || !node) return false;

        let worldY = 0;
        let sourceZ = 0;
        let absSourceY = 0;
        let count = 0;
        const sourceWorld = this.sourceWorldMatrixForNode(node);

        for (const point of strip) {
            const vertex = point.vertexOverride || this.globalVertices[point.idx];
            if (!vertex?.sourcePos) continue;
            const world = Mt5Loader.transformRowPoint(vertex.sourcePos, sourceWorld);
            worldY += world[1];
            sourceZ += vertex.sourcePos[2];
            absSourceY += Math.abs(vertex.sourcePos[1]);
            count++;
        }

        if (count === 0) return false;

        worldY /= count;
        sourceZ /= count;
        absSourceY /= count;

        // Top head shell strips are coarse triangle strips. Treat the whole
        // strip as scalp/hair once its average position is clearly in the
        // upper head; per-vertex tests split triangles across hair/skin texels.
        return worldY >= 0.595 && sourceZ >= 0.215 && absSourceY <= 0.09;
    }

    projectRyoFaceAtlasUV(vertex, node, projectionBounds = null) {
        if (!vertex?.sourcePos || !node) return null;
        const worldPos = Mt5Loader.transformRowPoint(vertex.sourcePos, this.sourceWorldMatrixForNode(node));
        const renderX = -worldPos[0];
        const renderY = worldPos[1];

        // Ryo S2_YDB1_YKC_M face bounds in baked MT5 render space.
        // These are intentionally broad so the whole facial shell maps into
        // the square right half of YKB_KAJ instead of using the side/head half.
        const minX = projectionBounds?.minX ?? -0.108;
        const maxX = projectionBounds?.maxX ?? 0.108;
        const minY = projectionBounds?.minY ?? 0.359;
        const maxY = projectionBounds?.maxY ?? 0.649;

        return {
            x: Math.max(0, Math.min(1, (renderX - minX) / (maxX - minX))),
            y: Math.max(0, Math.min(1, (renderY - minY) / (maxY - minY))),
        };
    }

    computeRyoHeadAtlasProjectionBounds(polys, texId, node) {
        if (!this.isRyoHeadAtlasTexture(texId) || !node) return null;

        const xs = [];
        const ys = [];
        const useLegacyBounds = this.ryoHeadAtlasMode === "project-cw-auto-legacy-region" ||
            this.ryoHeadAtlasMode === "project-cw-auto-legacy-bounds";
        for (const poly of polys) {
            for (const strip of poly.strips) {
                const metrics = this.ryoHeadAtlasStripMetrics(strip, node);
                const isFace = useLegacyBounds
                    ? this.isRyoHeadAtlasLegacyFaceMetrics(metrics)
                    : this.isRyoHeadAtlasFaceMetrics(metrics);
                if (!isFace) continue;
                for (const point of strip) {
                    const vertex = point.vertexOverride || this.globalVertices[point.idx];
                    if (!vertex?.sourcePos) continue;
                    const worldPos = Mt5Loader.transformRowPoint(
                        vertex.sourcePos,
                        this.sourceWorldMatrixForNode(node),
                    );
                    xs.push(-worldPos[0]);
                    ys.push(worldPos[1]);
                }
            }
        }

        if (xs.length < 6 || ys.length < 6) return null;
        xs.sort((a, b) => a - b);
        ys.sort((a, b) => a - b);

        const minX = Mt5Loader.percentile(xs, 0.04);
        const maxX = Mt5Loader.percentile(xs, 0.96);
        const minY = Mt5Loader.percentile(ys, 0.04);
        const maxY = Mt5Loader.percentile(ys, 0.96);
        const spanX = maxX - minX;
        const spanY = maxY - minY;
        if (spanX <= 0.0001 || spanY <= 0.0001) return null;

        return {
            minX: minX - spanX * 0.015,
            maxX: maxX + spanX * 0.015,
            minY: minY - spanY * 0.015,
            maxY: maxY + spanY * 0.015,
        };
    }

    static percentile(sortedValues, ratio) {
        if (sortedValues.length === 0) return 0;
        const index = Math.max(0, Math.min(sortedValues.length - 1, Math.round((sortedValues.length - 1) * ratio)));
        return sortedValues[index];
    }

    sourceWorldMatrixForNode(node) {
        if (node._mt5SourceWorldMatrix) return node._mt5SourceWorldMatrix;
        const local = Mt5Loader.sourceTransformMatrix(node);
        node._mt5SourceWorldMatrix = node._mt5ParentNode
            ? Mt5Loader.rowMultiply(local, this.sourceWorldMatrixForNode(node._mt5ParentNode))
            : local;
        return node._mt5SourceWorldMatrix;
    }

    debugColorForRyoHeadAtlas(atlasRegion, strip = null, node = null) {
        if (!atlasRegion) return null;

        if (this.ryoHeadAtlasDebug === "regions") {
            if (atlasRegion === "face") return [1.0, 0.08, 0.04, 1.0];
            if (atlasRegion === "side") return [0.04, 0.24, 1.0, 1.0];
            return [1.0, 0.9, 0.05, 1.0];
        }

        if (this.ryoHeadAtlasDebug === "strip-index" && strip && node) {
            const stripIndex = strip._mt5StripIndex || 0;
            const entryOffset = strip._mt5EntryOffset || 0;
            const key = (
                Math.imul(node.addr, 1103515245) ^
                Math.imul(entryOffset, 2246822519) ^
                Math.imul(stripIndex, 2654435761)
            ) >>> 0;
            return Mt5Loader.debugRgbFromKey(key);
        }

        return null;
    }

    static debugRgbFromKey(key) {
        return [
            0.25 + ((key & 0xff) / 255) * 0.7,
            0.25 + (((key >> 8) & 0xff) / 255) * 0.7,
            0.25 + (((key >> 16) & 0xff) / 255) * 0.7,
            1,
        ];
    }

    shouldSkipRyoHeadAtlasStrip(strip, texId, node) {
        if (!this.isRyoHeadAtlasTexture(texId) || !node || !strip) return false;
        if (this.onlyRyoHeadAtlasStrips && !this.matchesRyoHeadAtlasStripFilter(this.onlyRyoHeadAtlasStrips, strip, node)) {
            return true;
        }
        return this.matchesRyoHeadAtlasStripFilter(this.skipRyoHeadAtlasStrips, strip, node);
    }

    matchesRyoHeadAtlasStripFilter(filters, strip, node) {
        if (!filters || !strip || !node) return false;

        const stripIndex = strip._mt5StripIndex;
        if (!Number.isFinite(stripIndex)) return false;

        const nodeHex = `0x${node.addr.toString(16)}`;
        const nodeDec = String(node.addr);
        const entryHex = `0x${(strip._mt5EntryOffset || 0).toString(16)}`;
        const entryDec = String(strip._mt5EntryOffset || 0);
        const stripText = String(stripIndex);

        return (
            filters.has(`${nodeHex}:${entryHex}:${stripText}`) ||
            filters.has(`${nodeHex}:${entryDec}:${stripText}`) ||
            filters.has(`${nodeDec}:${entryHex}:${stripText}`) ||
            filters.has(`${nodeDec}:${entryDec}:${stripText}`) ||
            filters.has(`${nodeHex}:${entryHex}:*`) ||
            filters.has(`${nodeHex}:${entryDec}:*`) ||
            filters.has(`${nodeDec}:${entryHex}:*`) ||
            filters.has(`${nodeDec}:${entryDec}:*`) ||
            filters.has(`${nodeHex}:${stripText}`) ||
            filters.has(`${nodeDec}:${stripText}`) ||
            filters.has(`*:${entryHex}:${stripText}`) ||
            filters.has(`*:${entryDec}:${stripText}`) ||
            filters.has(`*:${stripText}`) ||
            filters.has(`${nodeHex}:*`) ||
            filters.has(`${nodeDec}:*`) ||
            filters.has("*:*")
        );
    }

    static isCharacterRig(nodes) {
        if (nodes.length < 20) return false;

        const rootTag = Mt5Loader.readFourCC(nodes[0]?.unk1 || 0);
        if (!/^[A-Z0-9]{3}M$/.test(rootTag)) return false;

        const firstModelNode = nodes.find(node => node.model);
        if (!firstModelNode) return false;

        const firstModelRotX = Math.round(firstModelNode.rot.x / (Math.PI / 2));
        const firstModelRotZ = Math.round(firstModelNode.rot.z / (Math.PI / 2));
        return firstModelRotX === 1 && firstModelRotZ === 1;
    }

    static rowIdentity() {
        return [
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1,
        ];
    }

    static rowMultiply(left, right) {
        const result = new Array(16).fill(0);
        for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 4; col++) {
                for (let i = 0; i < 4; i++) {
                    result[row * 4 + col] += left[row * 4 + i] * right[i * 4 + col];
                }
            }
        }
        return result;
    }

    static rowScale(x, y, z) {
        return [
            x, 0, 0, 0,
            0, y, 0, 0,
            0, 0, z, 0,
            0, 0, 0, 1,
        ];
    }

    static rowRotationX(angle) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        return [
            1, 0, 0, 0,
            0, cos, sin, 0,
            0, -sin, cos, 0,
            0, 0, 0, 1,
        ];
    }

    static rowRotationY(angle) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        return [
            cos, 0, -sin, 0,
            0, 1, 0, 0,
            sin, 0, cos, 0,
            0, 0, 0, 1,
        ];
    }

    static rowRotationZ(angle) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        return [
            cos, sin, 0, 0,
            -sin, cos, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1,
        ];
    }

    static rowTranslation(x, y, z) {
        return [
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            x, y, z, 1,
        ];
    }

    static transformRowPoint(point, matrix) {
        const [x, y, z] = point;
        return [
            x * matrix[0] + y * matrix[4] + z * matrix[8] + matrix[12],
            x * matrix[1] + y * matrix[5] + z * matrix[9] + matrix[13],
            x * matrix[2] + y * matrix[6] + z * matrix[10] + matrix[14],
        ];
    }

    static transformRowVector(vector, matrix) {
        const [x, y, z] = vector;
        return [
            x * matrix[0] + y * matrix[4] + z * matrix[8],
            x * matrix[1] + y * matrix[5] + z * matrix[9],
            x * matrix[2] + y * matrix[6] + z * matrix[10],
        ];
    }

    static sourceTransformMatrix(node, pose = null, poseOptions = {}) {
        let rotX = node.rot.x;
        let rotY = node.rot.y;
        let rotZ = node.rot.z;
        let posX = node.pos.x;
        let posY = node.pos.y;
        let posZ = node.pos.z;

        if (pose) {
            const rotationSigns = poseOptions.rotationSigns || [1, 1, 1];
            const positionSigns = poseOptions.positionSigns || [1, 1, 1];
            const rotationScale = poseOptions.rotationScale ?? 1;
            const poseRotX = (pose.rx || 0) * rotationScale * rotationSigns[0];
            const poseRotY = (pose.ry || 0) * rotationScale * rotationSigns[1];
            const poseRotZ = (pose.rz || 0) * rotationScale * rotationSigns[2];

            if (poseOptions.applyMode === "absolute") {
                rotX = poseRotX;
                rotY = poseRotY;
                rotZ = poseRotZ;
            } else {
                rotX += poseRotX;
                rotY += poseRotY;
                rotZ += poseRotZ;
            }

            if (poseOptions.useTranslations === true) {
                const posePosX = (pose.tx || 0) * positionSigns[0];
                const posePosY = (pose.ty || 0) * positionSigns[1];
                const posePosZ = (pose.tz || 0) * positionSigns[2];
                if (poseOptions.applyMode === "absolute") {
                    posX = posePosX;
                    posY = posePosY;
                    posZ = posePosZ;
                } else {
                    posX += posePosX;
                    posY += posePosY;
                    posZ += posePosZ;
                }
            }
        }

        return Mt5Loader.rowMultiply(
            Mt5Loader.rowMultiply(
                Mt5Loader.rowMultiply(
                    Mt5Loader.rowMultiply(
                        Mt5Loader.rowScale(node.scl.x, node.scl.y, node.scl.z),
                        Mt5Loader.rowRotationX(rotX),
                    ),
                    Mt5Loader.rowRotationY(rotY),
                ),
                Mt5Loader.rowRotationZ(rotZ),
            ),
            Mt5Loader.rowTranslation(posX, posY, posZ),
        );
    }

    static inverseSourceTransformMatrix(node) {
        return Mt5Loader.rowMultiply(
            Mt5Loader.rowMultiply(
                Mt5Loader.rowMultiply(
                    Mt5Loader.rowMultiply(
                        Mt5Loader.rowTranslation(-node.pos.x, -node.pos.y, -node.pos.z),
                        Mt5Loader.rowRotationZ(-node.rot.z),
                    ),
                    Mt5Loader.rowRotationY(-node.rot.y),
                ),
                Mt5Loader.rowRotationX(-node.rot.x),
            ),
            Mt5Loader.rowScale(
                node.scl.x === 0 ? 1 : 1 / node.scl.x,
                node.scl.y === 0 ? 1 : 1 / node.scl.y,
                node.scl.z === 0 ? 1 : 1 / node.scl.z,
            ),
        );
    }

    bakeCharacterRigSourceTransforms(modelRoot, nodes, poseByBoneId = null, poseOptions = {}) {
        const byAddr = new Map(nodes.map((node) => [node.addr, node]));
        const nodeIndexByAddr = new Map(nodes.map((node, index) => [node.addr, index]));
        const worldCache = new Map();
        const poseForNode = (node) => {
            if (!poseByBoneId) return null;
            const targetId = poseOptions.poseTarget === "flag-low-byte"
                ? node.flag & 0xff
                : nodeIndexByAddr.get(node.addr);
            return poseByBoneId.get(targetId) || null;
        };

        const worldMatrixFor = (node) => {
            if (worldCache.has(node.addr)) return worldCache.get(node.addr);

            const local = Mt5Loader.sourceTransformMatrix(node, poseForNode(node), poseOptions);
            const parent = byAddr.get(node.parentAddr);
            const world = parent
                ? Mt5Loader.rowMultiply(local, worldMatrixFor(parent))
                : local;

            worldCache.set(node.addr, world);
            return world;
        };

        modelRoot.rotationQuaternion = null;
        modelRoot.rotation.set(0, 0, 0);
        modelRoot.position.set(0, 0, 0);
        modelRoot.scaling.set(1, 1, 1);

        for (const node of nodes) {
            if (!node.mesh) continue;

            const matrix = worldMatrixFor(node);
            node.mesh.parent = modelRoot;
            node.mesh.rotationQuaternion = null;
            node.mesh.rotation.set(0, 0, 0);
            node.mesh.position.set(0, 0, 0);
            node.mesh.scaling.set(1, 1, 1);

            if (typeof node.mesh.getChildren !== "function") continue;
            for (const child of node.mesh.getChildren()) {
                if (!(child instanceof BABYLON.Mesh) || !child._mt5SourcePositions) continue;

                const positions = [];
                for (let i = 0; i < child._mt5SourcePositions.length; i += 3) {
                    const transformed = Mt5Loader.transformRowPoint([
                        child._mt5SourcePositions[i],
                        child._mt5SourcePositions[i + 1],
                        child._mt5SourcePositions[i + 2],
                    ], matrix);
                    positions.push(...transformed);
                }

                child.setVerticesData(BABYLON.VertexBuffer.PositionKind, positions, false);

                const indices = child.getIndices();
                if (indices && indices.length > 0) {
                    const normals = [];
                    BABYLON.VertexData.ComputeNormals(positions, indices, normals);
                    child.setVerticesData(BABYLON.VertexBuffer.NormalKind, normals, false);
                }

                child.position.set(0, 0, 0);
                child.rotationQuaternion = null;
                child.rotation.set(0, 0, 0);
                child.scaling.set(1, 1, 1);
                child.refreshBoundingInfo();
            }
        }

        modelRoot._mt5CharacterRigBaked = true;
    }

    applyCharacterRigPose(modelRoot, poseByBoneId, poseOptions = {}) {
        const nodes = modelRoot?._mt5Nodes || [];
        if (nodes.length === 0) return;
        this.bakeCharacterRigSourceTransforms(modelRoot, nodes, poseByBoneId, poseOptions);
    }

    applyNodeHierarchyTransforms(modelRoot, nodes, isCharacterRig = false) {
        if (isCharacterRig) {
            modelRoot.rotation.x = -Math.PI / 2;
        }

        for (const node of nodes) {
            if (node.mesh) {
                // Apply local transformations read from the node
                // Coordinate flip to match world space: Flip X, negate Y/Z rotation
                node.mesh.position = new BABYLON.Vector3(-node.pos.x, node.pos.y, node.pos.z);
                node.mesh.rotation = new BABYLON.Vector3(node.rot.x, -node.rot.y, -node.rot.z);
                node.mesh.scaling = new BABYLON.Vector3(node.scl.x, node.scl.y, node.scl.z);

                if (node.parentAddr) {
                    const parentNode = nodes.find(n => n.addr === node.parentAddr);
                    if (parentNode && parentNode.mesh) {
                        node.mesh.parent = parentNode.mesh;
                    } else {
                        node.mesh.parent = modelRoot;
                    }
                } else {
                    node.mesh.parent = modelRoot;
                }
            }
        }
    }

    async load(buffer, secondaryBuffer = null) {
        const reader = new BinaryReader(buffer);
        const signature = reader.readString(4);
        if (signature !== "HRCM") {
            throw new Error("Invalid MT5 file signature");
        }

        const texOffset = reader.readUInt32();
        const modelOffset = reader.readUInt32();


        this.textureCache.clear();
        this.textureIds.clear();
        this.materialCache.clear();
        this.globalVertices = [];
        this.vertexOffset = 0;

        // Handle different secondary buffer formats:
        // - Single ArrayBuffer: legacy format
        // - Object with {base, time}: time-of-day format (time textures override base)
        let baseReader = null;
        let timeReader = null;

        if (secondaryBuffer) {
            if (secondaryBuffer.base !== undefined || secondaryBuffer.time !== undefined) {
                // New format: {base: ArrayBuffer, time: ArrayBuffer}
                if (secondaryBuffer.base) {
                    baseReader = new BinaryReader(secondaryBuffer.base);
                }
                if (secondaryBuffer.time) {
                    timeReader = new BinaryReader(secondaryBuffer.time);
                }
            } else if (secondaryBuffer instanceof ArrayBuffer) {
                // Legacy format: single ArrayBuffer
                baseReader = new BinaryReader(secondaryBuffer);
            }
        }

        if (texOffset > 0 && texOffset < reader.size) {
            const currentPos = reader.tell();
            reader.seek(texOffset);

            // Use time pack if available, otherwise use base pack
            // Don't combine both to avoid texture conflicts
            if (timeReader) {
                this.readTextures(reader, timeReader);
                // Also load base textures for IDs not in time pack
                reader.seek(texOffset); // Reset position for second pass
                this.readTextures(reader, baseReader, true); // skipExisting=true
            } else {
                this.readTextures(reader, baseReader);
            }

            reader.seek(currentPos);
        }



        const nodes = [];
        reader.seek(modelOffset);
        this.readNode(reader, nodes);

        const modelRoot = new BABYLON.TransformNode(`mt5_file_root_${Math.random().toString(36).substr(2, 9)}`, this.scene);
        modelRoot._mt5Nodes = nodes;

        const isCharacterRig = Mt5Loader.isCharacterRig(nodes);
        modelRoot._mt5CharacterRig = isCharacterRig;

        // Apply Hierarchy and Transformations
        if (isCharacterRig && this.characterRigMode === "baked") {
            this.bakeCharacterRigSourceTransforms(modelRoot, nodes);
        } else {
            this.applyNodeHierarchyTransforms(modelRoot, nodes, isCharacterRig);
        }


        const hasRenderableGeometry = modelRoot
            .getDescendants(false)
            .some(node => typeof node.getTotalVertices === "function" && node.getTotalVertices() > 0);

        return hasRenderableGeometry ? [modelRoot] : [];
    }

    readNode(reader, nodes) {
        if (!reader.canRead(64)) return;

        const nodeAddr = reader.offset;
        if (nodes.some(n => n.addr === nodeAddr)) return;

        const node = {
            addr: nodeAddr,
            flag: reader.readUInt32(),
            modelAddr: reader.readUInt32(),
            rot: {
                x: (reader.readInt32() / 65536.0) * Math.PI * 2.0,
                y: (reader.readInt32() / 65536.0) * Math.PI * 2.0,
                z: (reader.readInt32() / 65536.0) * Math.PI * 2.0
            },
            scl: { x: reader.readFloat32(), y: reader.readFloat32(), z: reader.readFloat32() },
            pos: { x: reader.readFloat32(), y: reader.readFloat32(), z: reader.readFloat32() },
            child: reader.readUInt32(),
            sibling: reader.readUInt32(),
            parentAddr: reader.readUInt32(), // Renamed to avoid confusion
            unk1: reader.readUInt32(),
            unk2: reader.readUInt32()
        };
        node._mt5ParentNode = node.parentAddr ? nodes.find(n => n.addr === node.parentAddr) || null : null;

        if (node.modelAddr && node.modelAddr > 0 && node.modelAddr < reader.size) {
            const saved = reader.tell();
            reader.seek(node.modelAddr);
            node.model = this.readModel(reader, node, nodes);
            reader.seek(saved);
        }

        if (node.model) {
            node.mesh = this.createMeshFromModel(node.model, node);
            if (node.mesh) {
                node.mesh.name = `node_${node.addr.toString(16)}`;
                node.mesh.position.set(-node.pos.x, node.pos.y, node.pos.z); // Negate X to match vertex flip
                node.mesh.rotation.set(node.rot.x, node.rot.y, node.rot.z);
                node.mesh.scaling.set(node.scl.x, node.scl.y, node.scl.z);
                node.mesh._mt5Node = node;
            }
        } else {
            const dummy = new BABYLON.TransformNode(`node_${node.addr.toString(16)}`, this.scene);
            dummy.position.set(-node.pos.x, node.pos.y, node.pos.z); // Negate X to match vertex flip
            dummy.rotation.set(node.rot.x, node.rot.y, node.rot.z);
            dummy.scaling.set(node.scl.x, node.scl.y, node.scl.z);
            dummy._mt5Node = node;
            node.mesh = dummy;
        }

        nodes.push(node);

        if (node.child && node.child < reader.size) {
            reader.seek(node.child);
            this.readNode(reader, nodes);
        }
        if (node.sibling && node.sibling < reader.size) {
            reader.seek(node.sibling);
            this.readNode(reader, nodes);
        }
    }

    readModel(reader, node = null, nodes = []) {
        const addr = reader.tell();
        const parentNode = node?.parentAddr ? nodes.find(n => n.addr === node.parentAddr) : null;
        const parentModel = parentNode?.model || null;
        const model = {
            flag: reader.readUInt32(),
            vertexAddr: reader.readUInt32(),
            nbVertex: reader.readUInt32(),
            polygonAddr: reader.readUInt32(),
            center: { x: reader.readFloat32(), y: reader.readFloat32(), z: reader.readFloat32() },
            radius: reader.readFloat32(),
            vertexBase: this.vertexOffset,
            parentModel,
            node,
        };

        if (model.vertexAddr && model.vertexAddr > 0 && model.vertexAddr < reader.size) {
            const saved = reader.tell();
            reader.seek(model.vertexAddr);

            // Vertices are always 24 bytes: Pos(3xfloat32) + Norm(3xfloat32)

            for (let i = 0; i < model.nbVertex; i++) {
                if (!reader.canRead(24)) break;

                const sourceX = reader.readFloat32();
                const sourceY = reader.readFloat32();
                const sourceZ = reader.readFloat32();
                const sourceNX = reader.readFloat32();
                const sourceNY = reader.readFloat32();
                const sourceNZ = reader.readFloat32();

                this.globalVertices.push({
                    pos: [-sourceX, sourceY, sourceZ],
                    norm: [-sourceNX, sourceNY, sourceNZ],
                    sourcePos: [sourceX, sourceY, sourceZ],
                    sourceNorm: [sourceNX, sourceNY, sourceNZ],
                });
            }
            this.vertexOffset += model.nbVertex;
            reader.seek(saved);
        }

        if (model.polygonAddr && model.polygonAddr > 0 && model.polygonAddr < reader.size) {
            const saved = reader.tell();
            reader.seek(model.polygonAddr);
            model.polygons = this.readPolygons(reader, model.vertexBase, model.nbVertex, model, node, parentModel);
            reader.seek(saved);
        }

        return model;
    }

    readPolygons(reader, vertexBase, nbVertex, model = null, node = null, parentModel = null) {
        const polygons = [];
        let currentTexIdx = 0;
        let isUVH = false;
        // PC Shenmue.exe FUN_140065160 initializes the normal UV divisor to 0x100.
        let uvSize = 256.0;
        let uMirror = false;
        let vMirror = false;
        const inverseLocalMatrix = node ? Mt5Loader.inverseSourceTransformMatrix(node) : null;

        let iterations = 0;
        while (reader.offset < reader.size - 2 && iterations < 10000) {
            iterations++;
            const type = reader.readUShort();

            // 0x8000 marks the end of the mesh data block
            if (type === 0x8000) break;

            // Null markers
            if (type === 0x0000 || type === 0xFFFF) {
                continue;
            }

            // Strip Attributes (0x0002 - 0x0007)
            if (type >= 0x0002 && type <= 0x0007) {
                const size = reader.readUShort();
                const data = reader.readBytes(size);
                if (data.length >= 1) {
                    // UVH flag: 0 - normal resolution (0-255), 1 - high resolution (0-1023)
                    isUVH = (data[0] & 1) === 1;
                }
                if (data.length >= 11) {
                    uMirror = (data[10] & 4) === 4;
                    vMirror = (data[10] & 2) === 2;
                }
                continue;
            }

            // Texture Selection
            if (type === 0x0009) {
                currentTexIdx = reader.readUShort();
                continue;
            }

            // UV Size override
            if (type === 0x000B) {
                const sizeVal = reader.readUShort();
                if (sizeVal !== 0) uvSize = sizeVal;
                continue;
            }

            // Miscellaneous fixed-size state records. PC HRCM texture walking
            // skips these as type + one ushort.
            if (type === 0x0008 || type === 0x000A) {
                reader.skip(2);
                continue;
            }

            // PC HRCM texture walking treats 0x0c..0x0f as length-prefixed
            // state records: type + length ushort + payload bytes.
            if (type >= 0x000C && type <= 0x000F) {
                const size = reader.readUShort();
                reader.skip(size);
                continue;
            }

            // The PC texture walker treats 0x15/0x1d as length-prefixed records,
            // but the render switch does not emit geometry for them.
            if (type === 0x0015 || type === 0x001D) {
                const size = reader.readUShort();
                reader.skip(size);
                continue;
            }

            // Triangle Strips. The first ushort is the PC-visible payload byte
            // length; it includes the strip-count ushort and all strip records.
            if (Mt5Loader.isPcLengthPrefixedStripType(type)) {
                const entryOffset = reader.offset - 2;
                const entryLengthBytes = reader.readUShort();
                const expectedEntryEnd = entryOffset + 4 + entryLengthBytes;
                const nbStrips = reader.readUShort();
                const poly = {
                    strips: [],
                    head: type,
                    texId: currentTexIdx,
                    hasUV: false,
                    hasColor: false,
                    entryLengthBytes,
                    entryLengthMatchesPcSkip: null,
                };

                // Precise component detection to prevent reader desync
                // UV: 0x11, 0x14, 0x19, 0x1C
                const hasUV = (type === 0x11 || type === 0x14 || type === 0x19 || type === 0x1C);
                // Color: 0x12, 0x14, 0x1A, 0x1C
                const hasColor = (type === 0x12 || type === 0x14 || type === 0x1A || type === 0x1C);

                poly.hasUV = hasUV;
                poly.hasColor = hasColor;

                for (let i = 0; i < nbStrips; i++) {
                    const stripLenRaw = reader.readShort();
                    const absStripLen = Math.abs(stripLenRaw);
                    const strip = [];
                    strip._mt5StripIndex = i;
                    strip._mt5EntryOffset = entryOffset;
                    strip._mt5StripLenRaw = stripLenRaw;
                    strip._mt5FlipFirstTriangle = stripLenRaw < 0;
                    strip._mt5MirrorU = uMirror;
                    strip._mt5MirrorV = vMirror;
                    for (let k = 0; k < absStripLen; k++) {
                        const rawIdx = reader.readShort();

                        // Negative values reuse parent mesh vertices. ShenmueDKSharp/wudecon
                        // first brings those parent vertices into the child node's local space.
                        let idx = vertexBase + rawIdx;
                        let vertexOverride = null;
                        if (rawIdx < 0) {
                            if (parentModel && inverseLocalMatrix) {
                                const parentIdx = parentModel.vertexBase + parentModel.nbVertex + rawIdx;
                                const parentVertex = this.globalVertices[parentIdx];
                                if (parentVertex) {
                                    const sourcePos = Mt5Loader.transformRowPoint(parentVertex.sourcePos, inverseLocalMatrix);
                                    const sourceNorm = Mt5Loader.transformRowVector(parentVertex.sourceNorm, inverseLocalMatrix);
                                    vertexOverride = {
                                        pos: [-sourcePos[0], sourcePos[1], sourcePos[2]],
                                        norm: [-sourceNorm[0], sourceNorm[1], sourceNorm[2]],
                                        sourcePos,
                                        sourceNorm,
                                    };
                                    idx = parentIdx;
                                } else {
                                    idx = vertexBase;
                                }
                            } else {
                                idx = vertexBase;
                            }
                        }

                        let u = 0.0, v = 0.0;
                        if (hasUV) {
                            const texU = reader.readShort();
                            const texV = reader.readShort();

                            if (isUVH) {
                                // UVH (High resolution) scale factor
                                u = texU * 0.000015258789;
                                v = texV * 0.000015258789;
                            } else {
                                // Standard UV scale from the current 0x0b uvSize state.
                                // PC FUN_140065160 defaults uvSize to 0x100, then lets 0x0b override it.
                                if (Math.abs(texU) < 0xF000) {
                                    u = texU / uvSize;
                                } else {
                                    u = texU * 0.00000000023283064;
                                }

                                if (Math.abs(texV) < 0xF000) {
                                    v = texV / uvSize;
                                } else {
                                    v = texV * 0.00000000023283064;
                                }
                            }

                            if (uMirror && Math.abs(u) > 1.0) u /= 2.0;
                            if (vMirror && Math.abs(v) > 1.0) v /= 2.0;
                        }

                        let color = [1, 1, 1, 1];
                        if (hasColor) {
                            const b = reader.readUInt8() / 255;
                            const g = reader.readUInt8() / 255;
                            const r = reader.readUInt8() / 255;
                            const a = reader.readUInt8() / 255;
                            color = [r, g, b, a];
                        }

                        strip.push({ idx, u, v, color, vertexOverride, mirrorU: uMirror, mirrorV: vMirror });
                    }
                    poly.strips.push(strip);
                }
                const parsedEntryBytes = reader.offset - entryOffset;
                let entryPaddingBytes = 0;
                const entryOverrunBytes = Math.max(0, reader.offset - expectedEntryEnd);
                if (reader.offset < expectedEntryEnd && expectedEntryEnd <= reader.size) {
                    entryPaddingBytes = expectedEntryEnd - reader.offset;
                    reader.seek(expectedEntryEnd);
                }
                poly.entryParsedBytes = parsedEntryBytes;
                poly.entryPaddingBytes = entryPaddingBytes;
                poly.entryOverrunBytes = entryOverrunBytes;
                poly.entryConsumedBytes = reader.offset - entryOffset;
                poly.entryLengthMatchesPcSkip = expectedEntryEnd <= reader.size && entryOverrunBytes === 0 && reader.offset === expectedEntryEnd;
                polygons.push(poly);
            } else {
                // Failsafe for unknown data types to prevent infinite loops
                console.warn(`[MT5] Unknown chunk type 0x${type.toString(16)} at offset ${reader.offset - 2}. Breaking.`);
                break;
            }
        }
        return polygons;
    }

    createMeshFromModel(model, node = null) {
        if (!model.polygons || model.polygons.length === 0) return null;

        const rootMesh = new BABYLON.Mesh("mt5_root", this.scene);
        rootMesh._mt5Node = node;

        const texGroups = new Map();
        for (const poly of model.polygons) {
            const tid = poly.texId ?? 0;
            if (!texGroups.has(tid)) texGroups.set(tid, []);
            texGroups.get(tid).push(poly);
        }

        for (const [texId, polys] of texGroups) {
            const positions = [];
            const normals = [];
            const uvs = [];
            const indices = [];
            const vertexMap = new Map();
            const sourcePositions = [];
            const sourceNormals = [];

            const colors = [];

            const tex = this.textureCache.get(texId);
            const alphaMode = this.alphaModeForTexture(texId, tex);
            const isAlpha = alphaMode === "alphatest" || alphaMode === "blend";
            const atlasProjectionBounds = this.computeRyoHeadAtlasProjectionBounds(polys, texId, node);

            for (const poly of polys) {
                for (const strip of poly.strips) {
                    if (this.shouldSkipRyoHeadAtlasStrip(strip, texId, node)) continue;
                    const atlasRegion = this.classifyRyoHeadAtlasStrip(strip, texId, node);
                    const stripIndices = [];
                    const debugStripKey = this.ryoHeadAtlasDebug === "strip-index"
                        ? `${node?.addr || 0}:${strip._mt5EntryOffset || 0}:${strip._mt5StripIndex || 0}`
                        : "";
                    for (const p of strip) {
                        const uvKey = this.ryoHeadAtlasUvKey(strip, texId, node);
                        const key = `${p.idx}_${p.u.toFixed(5)}_${p.v.toFixed(5)}_${p.mirrorU ? 1 : 0}_${p.mirrorV ? 1 : 0}_${atlasRegion || "default"}_${uvKey}_${debugStripKey}_${p.color.join(',')}`;
                        let nIdx = vertexMap.get(key);
                        if (nIdx === undefined) {
                            nIdx = positions.length / 3;
                            const v = p.vertexOverride || this.globalVertices[p.idx];
                            if (!v) continue;
                            positions.push(...v.pos);
                            normals.push(...v.norm);
                            sourcePositions.push(...(v.sourcePos || v.pos));
                            sourceNormals.push(...(v.sourceNorm || v.norm));
                            uvs.push(...this.mapUV(p, texId, node, atlasRegion, atlasProjectionBounds, strip));
                            colors.push(...(this.debugColorForRyoHeadAtlas(atlasRegion, strip, node) || p.color));

                            vertexMap.set(key, nIdx);
                        }
                        stripIndices.push(nIdx);
                    }

                    for (let i = 0; i < stripIndices.length - 2; i++) {
                        const a = stripIndices[i], b = stripIndices[i + 1], c = stripIndices[i + 2];
                        const parity = this.respectStripWindingSign && strip._mt5FlipFirstTriangle
                            ? i + 1
                            : i;
                        if (isAlpha) {
                            // Alpha surfaces: original winding (normals already face correct way)
                            if (parity % 2 === 0) indices.push(a, b, c);
                            else indices.push(a, c, b);
                        } else {
                            // Opaque surfaces: reversed winding so front face aligns with normals
                            // This fixes lighting AND enables proper backface culling
                            if (parity % 2 === 0) indices.push(a, c, b);
                            else indices.push(a, b, c);
                        }
                    }
                }
            }


            if (indices.length > 0) {
                // HEURISTIC: Skip geometry that lacks UV coordinates.
                // In MT5, practically all visual geometry has UVs. 
                // Absence of UVs almost always indicates collision or trigger markers
                // (like the 'white cylinders' or 'brown cylinders' reported by the user).
                const groupHasUV = polys.some(p => p.hasUV);
                if (!groupHasUV) {
                    continue;
                }

                const subMesh = new BABYLON.Mesh(`mt5_tex_${texId}`, this.scene);
                const vd = new BABYLON.VertexData();
                vd.positions = positions; vd.normals = normals; vd.uvs = uvs; vd.indices = indices;
                vd.colors = colors;
                vd.applyToMesh(subMesh);
                subMesh._mt5SourcePositions = sourcePositions;
                subMesh._mt5SourceNormals = sourceNormals;
                subMesh.parent = rootMesh;

                const tex = this.textureCache.get(texId);
                const alphaMode = this.alphaModeForTexture(texId, tex);
                const debugTextureless = (
                    (this.ryoHeadAtlasDebug === "regions" || this.ryoHeadAtlasDebug === "strip-index") &&
                    this.isRyoHeadAtlasTexture(texId)
                );
                const zOffset = this.zOffsetForTexture(texId);
                const addressMode = this.addressModeForTexture(texId);
                const matCacheKey = `${texId}_${alphaMode}_${zOffset}_${addressMode}_${debugTextureless ? "debug-regions" : "normal"}`;

                let mat = this.materialCache.get(matCacheKey);
                if (!mat) {
                    mat = new BABYLON.StandardMaterial(`mt5_mat_${texId}`, this.scene);
                    mat.useVertexColors = true;
                    mat.backFaceCulling = this.backFaceCulling;
                    mat.twoSidedLighting = true;

                    mat.diffuseColor = new BABYLON.Color3(1, 1, 1);
                    mat.specularColor = new BABYLON.Color3(0, 0, 0);
                    mat.emissiveColor = new BABYLON.Color3(0.08, 0.08, 0.08);
                    mat.zOffset = zOffset;
                    mat.zOffsetUnits = zOffset;

                    if (debugTextureless) {
                        mat.diffuseColor = new BABYLON.Color3(1, 1, 1);
                        mat.emissiveColor = new BABYLON.Color3(0.1, 0.1, 0.1);
                        mat.transparencyMode = BABYLON.StandardMaterial.MATERIAL_OPAQUE;
                    } else if (!tex) {
                        mat.diffuseColor = new BABYLON.Color3(0.65, 0.65, 0.65);
                        mat.emissiveColor = new BABYLON.Color3(0.05, 0.05, 0.05);
                        mat.backFaceCulling = false;
                        mat.transparencyMode = BABYLON.StandardMaterial.MATERIAL_OPAQUE;
                    } else {
                        mat.diffuseTexture = tex;
                        const babylonAddressMode = this.babylonAddressMode(addressMode);
                        mat.diffuseTexture.wrapU = babylonAddressMode;
                        mat.diffuseTexture.wrapV = babylonAddressMode;
                    }

                    if (!debugTextureless && alphaMode === "blend") {
                        mat.diffuseTexture.hasAlpha = true;
                        mat.useAlphaFromDiffuseTexture = true;
                        mat.transparencyMode = BABYLON.StandardMaterial.MATERIAL_ALPHABLEND;
                        mat.needDepthPrePass = false;
                        mat.separateCullingPass = true;
                        mat.backFaceCulling = false;
                        mat.twoSidedLighting = true;
                        mat.alpha = 0.7;
                    } else if (!debugTextureless && alphaMode === "alphatest") {
                        mat.diffuseTexture.hasAlpha = true;
                        mat.useAlphaFromDiffuseTexture = true;
                        mat.transparencyMode = BABYLON.StandardMaterial.MATERIAL_ALPHATEST;
                        mat.alphaCutOff = 0.5;
                        mat.backFaceCulling = false;
                        mat.twoSidedLighting = true;
                        mat.alpha = 1.0;
                    } else if (!debugTextureless && tex) {
                        mat.diffuseTexture.hasAlpha = false;
                        mat.useAlphaFromDiffuseTexture = false;
                        mat.transparencyMode = BABYLON.StandardMaterial.MATERIAL_OPAQUE;
                    }

                    this.materialCache.set(matCacheKey, mat);
                }

                subMesh.material = mat;
                subMesh.parent = rootMesh;

                // Set per-mesh properties (not shared via material)
                if (alphaMode === "blend") {
                    subMesh.alphaIndex = 1000;
                } else if (alphaMode === "alphatest") {
                    subMesh.alphaIndex = 500;
                }
                subMesh.visibility = 1.0;
                if (mat.transparencyMode !== BABYLON.StandardMaterial.MATERIAL_OPAQUE) {
                    subMesh.hasVertexAlpha = true;
                } else {
                    subMesh.hasVertexAlpha = false;
                }
            }
        }
        return rootMesh;
    }

    readTextures(reader, secondaryReader = null, skipExisting = false) {
        const texdStart = reader.tell();
        if (reader.readString(4) !== "TEXD") return;

        const headerSize = reader.readUInt32();
        const nbTex = reader.readUInt32();

        const nameRequests = []; // Array of {id: Uint8Array, index: number}
        let texCounter = 0;

        // Jump to children (starts at texdStart + headerSize)
        reader.seek(texdStart + headerSize);

        while (texCounter < nbTex && reader.canRead(8)) {
            const startPos = reader.tell();
            const marker = reader.readString(4);
            const nodeSize = reader.readUInt32();
            if (nodeSize < 8 || nodeSize > 0x1000000) break;
            const nodeEnd = startPos + nodeSize;

            if (marker === "TEXN") {
                // Embedded Texture (Global models use this)
                // Skip if we already have this texture loaded
                if (skipExisting && this.textureCache.has(texCounter)) {
                    texCounter++;
                    reader.seek(nodeEnd);
                    continue;
                }
                const id = reader.readBytes(8);
                this.textureIds.set(texCounter, Array.from(id));
                while (reader.tell() < nodeEnd - 4) {
                    if (reader.readString(4) === "PVRT") {
                        const pvrLen = reader.readUInt32();
                        const decoder = new PvrDecoder(reader.buffer, reader.tell(), pvrLen);
                        const tex = decoder.decode(this.scene);
                        if (tex) this.textureCache.set(texCounter, tex);
                        break;
                    }
                    reader.skip(-3);
                }
                texCounter++;
            } else if (marker === "NAME") {
                // External References (Scene maps use this)
                const numEntries = (nodeSize - 8) / 8;
                for (let i = 0; i < numEntries; i++) {
                    const id = reader.readBytes(8);
                    // Skip if we already have this texture loaded
                    if (skipExisting && this.textureCache.has(texCounter)) {
                        this.textureIds.set(texCounter, Array.from(id));
                        texCounter++;
                        if (texCounter >= nbTex) break;
                        continue;
                    }
                    this.textureIds.set(texCounter, Array.from(id));
                    nameRequests.push({ id, index: texCounter });
                    texCounter++;
                    if (texCounter >= nbTex) break;
                }
            } else if (marker === "PVRT") {
                // Raw fallback
                if (skipExisting && this.textureCache.has(texCounter)) {
                    texCounter++;
                    reader.seek(nodeEnd);
                    continue;
                }
                const pvrLen = reader.readUInt32();
                const decoder = new PvrDecoder(reader.buffer, reader.tell(), pvrLen);
                const tex = decoder.decode(this.scene);
                if (tex) this.textureCache.set(texCounter, tex);
                texCounter++;
            }
            reader.seek(nodeEnd);
        }

        // Final step: Match IDs from the Scene Pack
        if (secondaryReader && nameRequests.length > 0) {
            // Use pre-built index if available, otherwise fall back to linear scan
            const timeIdx = this._timePackIndex;
            const baseIdx = this._basePackIndex;

            if (timeIdx || baseIdx) {
                // O(1) indexed lookup path
                for (const req of nameRequests) {
                    const reqView = new DataView(req.id.buffer, req.id.byteOffset, 8);
                    const reqHi = reqView.getUint32(0, true);
                    const reqLo = reqView.getUint32(4, true);
                    const key = `${reqHi}_${reqLo}`;

                    // Try time pack first, then base pack — use the correct buffer for each
                    let entry = timeIdx && timeIdx.get(key);
                    let packBuffer = this._timePackBuffer;
                    if (!entry) {
                        entry = baseIdx && baseIdx.get(key);
                        packBuffer = this._basePackBuffer;
                    }
                    if (entry && packBuffer) {
                        const decoder = new PvrDecoder(packBuffer, entry.offset, entry.length);
                        const tex = decoder.decode(this.scene);
                        if (tex) {
                            this.textureCache.set(req.index, tex);
                        }
                    }
                }
            } else {
                // Legacy linear scan fallback
                const secondaryView = new DataView(secondaryReader.buffer);
                nameRequests.forEach((req) => {
                    const reqView = new DataView(req.id.buffer, req.id.byteOffset, 8);
                    const reqHi = reqView.getUint32(0, true);
                    const reqLo = reqView.getUint32(4, true);

                    secondaryReader.seek(0);
                    while (secondaryReader.tell() < secondaryReader.size - 12) {
                        const entryPos = secondaryReader.tell();
                        const entryHi = secondaryView.getUint32(entryPos, true);
                        const entryLo = secondaryView.getUint32(entryPos + 4, true);
                        const entryLen = secondaryView.getUint32(entryPos + 8, true);

                        if (entryLen === 0 || entryLen > 0x1000000) break;

                        secondaryReader.seek(entryPos + 12);

                        if (entryHi === reqHi && entryLo === reqLo) {
                            const start = secondaryReader.tell();
                            const decoder = new PvrDecoder(secondaryReader.buffer, start, entryLen);
                            const tex = decoder.decode(this.scene);
                            if (tex) {
                                this.textureCache.set(req.index, tex);
                            }
                            break;
                        }
                        secondaryReader.skip(entryLen);
                    }
                });
            }
        }
    }
}
