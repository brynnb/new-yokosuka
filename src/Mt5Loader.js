import * as BABYLON from '@babylonjs/core';
import { BinaryReader } from './BinaryReader.js';
import * as Mt5CharacterRig from './Mt5CharacterRig.js';
import {
    authoredControllerFamilyIndexFromMt5,
} from './Mt5ControllerFamily.js';
import * as Mt5CoplanarOverlays from './Mt5CoplanarOverlays.js';
import * as Mt5Transform from './Mt5Transform.js';
import * as Mt5TexturePolicy from './Mt5TexturePolicy.js';
import { applyMt5NormalPolicy } from './Mt5NormalPolicy.js';
import {
    applyMt5OverlayDefinition,
    overlayDefinitionForFile,
} from './Mt5OverlayManifest.js';
import { PvrDecoder } from './PvrDecoder.js';
import { enableTransparentTriangleSorting } from './rendering/TransparentTriangleSort.js';

// Alpha-to-coverage needs the fragment's filtered texture alpha. Babylon's
// normal alpha-test path discards the edge first and then forces every
// surviving fragment to alpha 1, leaving SAMPLE_ALPHA_TO_COVERAGE nothing to
// smooth. This material compiles the alpha-preserving shader path while still
// rendering in the opaque/depth-writing queue; multisample coverage, not
// source-alpha blending, controls which samples are written.
export class Mt5AlphaToCoverageMaterial extends BABYLON.StandardMaterial {
    needAlphaBlending() {
        return false;
    }

    needAlphaBlendingForMesh() {
        return false;
    }
}

export class Mt5Loader {
    constructor(scene, options = {}) {
        this.scene = scene;
        this.textureCache = new Map();
        this.textureIds = new Map();
        this.materialCache = new Map(); // Shared across load() calls: key → StandardMaterial
        this.globalVertices = [];
        this.vertexOffset = 0;
        this.characterRigMode = options.characterRigMode || "baked";
        this.characterRigSeamMode = options.characterRigSeamMode === "weld"
            ? "weld"
            : "none";
        this.mirrorCharacterX = options.mirrorCharacterX ?? false;
        this.characterRigSeamEpsilon = options.characterRigSeamEpsilon ?? 1e-5;
        this.backFaceCulling = options.backFaceCulling ?? true;
        this.respectStripWindingSign = options.respectStripWindingSign ?? false;
        this.orientTriangleWindingToNormals = options.orientTriangleWindingToNormals
            ?? false;
        this.materialSideOrientation = options.materialSideOrientation ?? null;
        this.emulateMirrorResize = options.emulateMirrorResize ?? false;
        // Ryo's 256x128 TWIDDLED_RECT head atlas is the one known exception to
        // the viewer's legacy square-texture U/V convention. The texture ID is
        // unique, so applying its native UV/sampler rules by default is safe.
        this.ryoHeadAtlasFix = options.ryoHeadAtlasFix ?? true;
        this.ryoHeadAtlasMode = options.ryoHeadAtlasMode || "obj-raw";
        this.ryoHeadAtlasDebug = options.ryoHeadAtlasDebug || "";
        this.skipRyoHeadAtlasStrips = options.skipRyoHeadAtlasStrips || null;
        this.onlyRyoHeadAtlasStrips = options.onlyRyoHeadAtlasStrips || null;
        this.remapRyoHeadAtlasStrips = options.remapRyoHeadAtlasStrips || null;
        this.ryoHeadNodeUvTransforms = options.ryoHeadNodeUvTransforms || null;
        this.textureAlphaModeOverrides = options.textureAlphaModeOverrides || null;
        this.alphaToCoverage = options.alphaToCoverage ?? true;
        this.generateMipMaps = options.generateMipMaps ?? true;
        this.textureZOffsetOverrides = options.textureZOffsetOverrides || null;
        this.resolveCoplanarOverlays = options.resolveCoplanarOverlays ?? false;
        this.coplanarOverlayPlaneEpsilon = options.coplanarOverlayPlaneEpsilon ?? 0.002;
        this.coplanarOverlaySeparation = options.coplanarOverlaySeparation ?? 0.003;
        this.overlayManifest = options.overlayManifest || null;
        this.overlayDepthBiasFactor = options.overlayDepthBiasFactor ?? 1;
        this.overlayDepthBiasUnits = options.overlayDepthBiasUnits ?? 1;
        // MT5 map UVs commonly extend beyond 1.0 to tile a texture.
        // Mirroring reverses every other tile and smears long facades.
        this.textureAddressMode = Mt5Loader.normalizeTextureAddressMode(options.textureAddressMode || "repeat");
        this.textureAddressModeOverrides = options.textureAddressModeOverrides || null;
        this.textureCoordinateMode = Mt5Loader.normalizeTextureCoordinateMode(options.textureCoordinateMode || "viewer");
        // TWIDDLED_RECT (0x0d) is decoded in the Dreamcast's native axis
        // order, so its authored UVs must stay in native U/V order too.
        this.nativeTwiddledRectUV = options.nativeTwiddledRectUV ?? true;
        // Pre-built index for texture pack: Map<string, {offset, length}>
        // Key is "hi_lo" where hi/lo are the two uint32 ID halves
        this.texturePackIndex = null;
    }

    setCharacterRigMode(mode) {
        this.characterRigMode = mode || "baked";
        return this;
    }

    characterContentRoot(modelRoot) {
        return modelRoot?._mt5CharacterContentRoot || modelRoot;
    }

    static normalizeTextureAddressMode(mode) {
        return Mt5TexturePolicy.normalizeTextureAddressMode(mode);
    }

    static normalizeTextureCoordinateMode(mode) {
        return Mt5TexturePolicy.normalizeTextureCoordinateMode(mode);
    }

    textureCoordinateForSource(sourceU, sourceV) {
        return Mt5TexturePolicy.textureCoordinateForSource(
            this.textureCoordinateMode, sourceU, sourceV,
        );
    }

    // Pre-index a texture pack binary for O(1) lookups.
    // Call once per pack, store the result, pass to load() via setTexturePackIndex().
    static buildTexturePackIndex(buffer) {
        return Mt5TexturePolicy.buildTexturePackIndex(buffer);
    }

    setTexturePackIndex(baseIndex, timeIndex, baseBuffer, timeBuffer) {
        this._basePackIndex = baseIndex || null;
        this._timePackIndex = timeIndex || null;
        this._basePackBuffer = baseBuffer || null;
        this._timePackBuffer = timeBuffer || null;
    }

    static readFourCC(value) {
        return Mt5TexturePolicy.readFourCC(value);
    }

    static orientedTriangleIndices(
        first,
        second,
        third,
        positions,
        normals,
    ) {
        const firstOffset = first * 3;
        const secondOffset = second * 3;
        const thirdOffset = third * 3;
        const firstSecond = [0, 1, 2].map(axis => (
            positions[secondOffset + axis] - positions[firstOffset + axis]
        ));
        const firstThird = [0, 1, 2].map(axis => (
            positions[thirdOffset + axis] - positions[firstOffset + axis]
        ));
        const geometricNormal = [
            firstSecond[1] * firstThird[2]
                - firstSecond[2] * firstThird[1],
            firstSecond[2] * firstThird[0]
                - firstSecond[0] * firstThird[2],
            firstSecond[0] * firstThird[1]
                - firstSecond[1] * firstThird[0],
        ];
        const authoredNormal = [0, 1, 2].map(axis => (
            normals[firstOffset + axis]
            + normals[secondOffset + axis]
            + normals[thirdOffset + axis]
        ));
        const agreement = geometricNormal.reduce(
            (sum, value, axis) => sum + value * authoredNormal[axis],
            0,
        );
        return agreement < 0
            ? [first, third, second]
            : [first, second, third];
    }

    static orientMeshTriangleWindingToNormals(mesh) {
        const positions = mesh?.getVerticesData?.(
            BABYLON.VertexBuffer.PositionKind,
        );
        const normals = mesh?.getVerticesData?.(
            BABYLON.VertexBuffer.NormalKind,
        );
        const sourceIndices = mesh?.getIndices?.();
        if (!positions || !normals || !sourceIndices) return false;
        const indices = Array.from(sourceIndices);
        let changed = false;
        for (let offset = 0; offset + 2 < indices.length; offset += 3) {
            const oriented = Mt5Loader.orientedTriangleIndices(
                indices[offset],
                indices[offset + 1],
                indices[offset + 2],
                positions,
                normals,
            );
            if (
                oriented[1] !== indices[offset + 1]
                || oriented[2] !== indices[offset + 2]
            ) {
                indices[offset + 1] = oriented[1];
                indices[offset + 2] = oriented[2];
                changed = true;
            }
        }
        if (changed) mesh.setIndices(indices);
        return changed;
    }

    static textureIdHex(id) {
        return Mt5TexturePolicy.textureIdHex(id);
    }

    static isPcLengthPrefixedStripType(type) {
        return Mt5TexturePolicy.isPcLengthPrefixedStripType(type);
    }

    alphaModeForTexture(texId, tex) {
        let alphaMode = tex ? "opaque" : "missing";
        if (tex?._hasGradientAlpha === true) alphaMode = "blend";
        else if (tex?.hasAlpha === true) alphaMode = "alphatest";

        const override = this.lookupTextureOverride(this.textureAlphaModeOverrides, texId);
        if (override === "opaque" || override === "alphatest" || override === "blend") {
            return override;
        }

        return alphaMode;
    }

    supportsAlphaToCoverage() {
        const engine = this.scene?.getEngine?.();
        return Boolean(
            this.alphaToCoverage
            && (engine?.currentSampleCount || 1) > 1
            && typeof engine?.setAlphaToCoverage === "function"
        );
    }

    decodePvrTexture(decoder) {
        const generateMipMaps = typeof this.generateMipMaps === "function"
            ? this.generateMipMaps()
            : this.generateMipMaps;
        return decoder.decode(this.scene, {
            // Alpha-test coverage scaling deliberately changes fractional
            // alpha to keep a binary cutoff's visible pixel count stable.
            // Real alpha-to-coverage consumes fractional alpha directly, so
            // give it the naturally filtered values instead.
            preserveAlphaTestCoverage: !this.supportsAlphaToCoverage(),
            generateMipMaps: generateMipMaps !== false,
        });
    }

    configureAlphaToCoverage(mesh, alphaMode) {
        if (
            !this.alphaToCoverage
            || alphaMode !== "alphatest"
            || mesh?.material?._mt5PreservesAlphaForCoverage !== true
            || !mesh?.onBeforeBindObservable
            || !mesh?.onAfterRenderObservable
        ) {
            return false;
        }
        const engine = this.scene?.getEngine?.();
        if (typeof engine?.setAlphaToCoverage !== "function") return false;

        mesh._mt5AlphaToCoverage = true;
        mesh.onBeforeBindObservable.add(() => {
            if (!mesh._mt5DisableAlphaToCoverage) {
                engine.setAlphaToCoverage(true);
            }
        });
        mesh.onAfterRenderObservable.add(() => {
            engine.setAlphaToCoverage(false);
        });
        return true;
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

    zOffsetForTexture(texId, fallback = 0) {
        const override = this.lookupTextureOverride(this.textureZOffsetOverrides, texId);
        if (override === undefined || override === null) return fallback;
        const zOffset = Number(override);
        return Number.isFinite(zOffset) ? zOffset : fallback;
    }

    static triangleNormal(points) {
        return Mt5CoplanarOverlays.triangleNormal(points);
    }

    static trianglesOverlapInProjection(left, right, normal, epsilon) {
        return Mt5CoplanarOverlays.trianglesOverlapInProjection(
            left, right, normal, epsilon,
        );
    }

    static coplanarOverlayTextureRanks(polygons, vertices, planeEpsilon = 0.002) {
        return Mt5CoplanarOverlays.coplanarOverlayTextureRanks(
            polygons, vertices, planeEpsilon,
        );
    }

    addressModeForTexture(texId) {
        const override = this.lookupTextureOverride(this.textureAddressModeOverrides, texId);
        if (override !== undefined && override !== null) {
            return Mt5Loader.normalizeTextureAddressMode(override);
        }

        // An instrumented Dreamcast frame binds YKB_KAJ with ClampU=ClampV=1.
        // Mirroring the slight fixed-point overshoot at atlas edges can pull
        // texels from the neighboring face/side region.
        if (this.isRyoHeadAtlasTexture(texId)) {
            return "clamp";
        }

        return Mt5Loader.normalizeTextureAddressMode(
            this.textureAddressMode,
        );
    }

    addressModesForTexture(texId, mirrorU = false, mirrorV = false) {
        const override = this.lookupTextureOverride(this.textureAddressModeOverrides, texId);
        if (override !== undefined && override !== null) {
            const mode = Mt5Loader.normalizeTextureAddressMode(override);
            return { u: mode, v: mode };
        }

        if (this.isRyoHeadAtlasTexture(texId)) {
            return { u: "clamp", v: "clamp" };
        }

        const fallback = this.addressModeForTexture(texId);
        const sourceU = mirrorU ? "mirror" : fallback;
        const sourceV = mirrorV ? "mirror" : fallback;
        const texture = this.textureCache.get(texId);
        const nativeTwiddledRect = (
            this.nativeTwiddledRectUV
            && texture?._pvrDataFormat === 0x0d
        );
        const swapsAxes = !nativeTwiddledRect && new Set([
            "viewer",
            "viewer-flipu",
            "viewer-flipv",
            "viewer-flipuv",
            "source-rotate-cw",
            "source-rotate-ccw",
        ]).has(this.textureCoordinateMode);
        return swapsAxes
            ? { u: sourceV, v: sourceU }
            : { u: sourceU, v: sourceV };
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
        if (strip?._mt5GeneratedEnvironmentUV) {
            const vertex = point.vertexOverride || this.globalVertices[point.idx];
            const normal = vertex?.norm || [0, 1, 0];
            return [
                Math.max(0, Math.min(1, 0.5 + normal[0] * 0.5)),
                Math.max(0, Math.min(1, 0.5 - normal[1] * 0.5)),
            ];
        }

        // Preserve the authored coordinates through vertex interpolation.
        // Mirror/repeat/clamp is sampler state and must be applied by the GPU
        // after interpolation. Folding each vertex here collapses valid spans
        // such as 0..2 to 0..0 and smears one texel across the whole polygon.
        const sourceU = point.u;
        const sourceV = point.v;
        const texture = this.textureCache.get(texId);
        const useNativeTwiddledRectUV = (
            this.nativeTwiddledRectUV
            && texture?._pvrDataFormat === 0x0d
        );
        let [texU, texV] = useNativeTwiddledRectUV
            ? [sourceU, sourceV]
            : this.textureCoordinateForSource(sourceU, sourceV);

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
        return Mt5CharacterRig.isCharacterRig(nodes, Mt5Loader.readFourCC);
    }

    static rowIdentity() { return Mt5Transform.rowIdentity(); }

    static rowMultiply(left, right) {
        return Mt5Transform.rowMultiply(left, right);
    }

    static inverseRigidRow(matrix) {
        return Mt5Transform.inverseRigidRow(matrix);
    }

    static inverseAffineRow(matrix) {
        return Mt5Transform.inverseAffineRow(matrix);
    }

    static rowScale(x, y, z) { return Mt5Transform.rowScale(x, y, z); }
    static rowRotationX(angle) { return Mt5Transform.rowRotationX(angle); }
    static rowRotationY(angle) { return Mt5Transform.rowRotationY(angle); }
    static rowRotationZ(angle) { return Mt5Transform.rowRotationZ(angle); }
    static rowTranslation(x, y, z) {
        return Mt5Transform.rowTranslation(x, y, z);
    }

    static transformRowPoint(point, matrix) {
        return Mt5Transform.transformRowPoint(point, matrix);
    }

    static transformRowVector(vector, matrix) {
        return Mt5Transform.transformRowVector(vector, matrix);
    }

    static sourceTransformMatrix(node, pose = null, poseOptions = {}) {
        return Mt5Transform.sourceTransformMatrix(node, pose, poseOptions);
    }

    static browserTransformMatrix(node) {
        return Mt5Transform.browserTransformMatrix(node);
    }

    static sourceOrderQuaternion(rotX, rotY, rotZ) {
        return Mt5Transform.sourceOrderQuaternion(rotX, rotY, rotZ);
    }

    static inverseSourceTransformMatrix(node) {
        return Mt5Transform.inverseSourceTransformMatrix(node);
    }

    static findCharacterRigSeamGroups(
        vertices,
        epsilon = 1e-5,
        nodeAdjacent = null,
    ) {
        return Mt5CharacterRig.findCharacterRigSeamGroups(
            vertices,
            epsilon,
            nodeAdjacent,
        );
    }

    buildCharacterRigSeamGroups(modelRoot, nodes) {
        const vertices = [];
        nodes.forEach((node, nodeIndex) => {
            if (!node.mesh || typeof node.mesh.getChildren !== "function") return;
            const sourceWorld = this.sourceWorldMatrixForNode(node);
            for (const child of node.mesh.getChildren()) {
                if (!(child instanceof BABYLON.Mesh) || !child._mt5SourcePositions) continue;
                for (let offset = 0; offset < child._mt5SourcePositions.length; offset += 3) {
                    vertices.push({
                        nodeIndex,
                        child,
                        vertexIndex: offset / 3,
                        sourcePosition: Mt5Loader.transformRowPoint([
                            child._mt5SourcePositions[offset],
                            child._mt5SourcePositions[offset + 1],
                            child._mt5SourcePositions[offset + 2],
                        ], sourceWorld),
                    });
                }
            }
        });
        const groups = Mt5Loader.findCharacterRigSeamGroups(
            vertices,
            this.characterRigSeamEpsilon,
            (leftIndex, rightIndex) => {
                const left = nodes[leftIndex];
                const right = nodes[rightIndex];
                return Boolean(
                    left
                    && right
                    && (
                        left.parentAddr === right.addr
                        || right.parentAddr === left.addr
                    )
                );
            },
        );
        modelRoot._mt5CharacterRigSeamGroups = groups;
        return groups;
    }

    weldCharacterRigSeams(modelRoot, nodes) {
        const groups = modelRoot._mt5CharacterRigSeamGroups
            || this.buildCharacterRigSeamGroups(modelRoot, nodes);
        const positionsByChild = new Map();
        const positionsFor = (child) => {
            if (!positionsByChild.has(child)) {
                positionsByChild.set(
                    child,
                    child.getVerticesData(BABYLON.VertexBuffer.PositionKind),
                );
            }
            return positionsByChild.get(child);
        };

        for (const group of groups) {
            const positionByNode = new Map();
            for (const vertex of group) {
                const positions = positionsFor(vertex.child);
                const offset = vertex.vertexIndex * 3;
                if (!positions || offset + 2 >= positions.length) continue;
                if (!positionByNode.has(vertex.nodeIndex)) {
                    positionByNode.set(vertex.nodeIndex, {
                        sum: [0, 0, 0],
                        count: 0,
                    });
                }
                const node = positionByNode.get(vertex.nodeIndex);
                node.sum[0] += positions[offset];
                node.sum[1] += positions[offset + 1];
                node.sum[2] += positions[offset + 2];
                node.count++;
            }
            const nodePositions = [...positionByNode.values()].map((node) => (
                node.sum.map((value) => value / node.count)
            ));
            if (nodePositions.length < 2) continue;
            const blended = [0, 1, 2].map((axis) => (
                nodePositions.reduce((sum, position) => sum + position[axis], 0)
                / nodePositions.length
            ));
            for (const vertex of group) {
                const positions = positionsFor(vertex.child);
                const offset = vertex.vertexIndex * 3;
                if (!positions || offset + 2 >= positions.length) continue;
                positions[offset] = blended[0];
                positions[offset + 1] = blended[1];
                positions[offset + 2] = blended[2];
            }
        }

        const normalsByChild = new Map();
        for (const [child, positions] of positionsByChild) {
            if (!positions) continue;
            child.setVerticesData(BABYLON.VertexBuffer.PositionKind, positions, false);
            let normals = child.getVerticesData(BABYLON.VertexBuffer.NormalKind);
            if (!normals) {
                const indices = child.getIndices();
                if (!indices || indices.length === 0) continue;
                normals = [];
                BABYLON.VertexData.ComputeNormals(positions, indices, normals);
            }
            normalsByChild.set(child, normals);
        }

        for (const group of groups) {
            const normalByNode = new Map();
            for (const vertex of group) {
                const normals = normalsByChild.get(vertex.child);
                const offset = vertex.vertexIndex * 3;
                if (!normals || offset + 2 >= normals.length) continue;
                if (!normalByNode.has(vertex.nodeIndex)) {
                    normalByNode.set(vertex.nodeIndex, {
                        sum: [0, 0, 0],
                        count: 0,
                    });
                }
                const node = normalByNode.get(vertex.nodeIndex);
                node.sum[0] += normals[offset];
                node.sum[1] += normals[offset + 1];
                node.sum[2] += normals[offset + 2];
                node.count++;
            }
            const nodeNormals = [...normalByNode.values()].map((node) => (
                node.sum.map((value) => value / node.count)
            ));
            if (nodeNormals.length < 2) continue;
            const blended = [0, 1, 2].map((axis) => (
                nodeNormals.reduce((sum, normal) => sum + normal[axis], 0)
                / nodeNormals.length
            ));
            const length = Math.hypot(...blended);
            if (length <= 1e-12) continue;
            for (const vertex of group) {
                const normals = normalsByChild.get(vertex.child);
                const offset = vertex.vertexIndex * 3;
                if (!normals || offset + 2 >= normals.length) continue;
                normals[offset] = blended[0] / length;
                normals[offset + 1] = blended[1] / length;
                normals[offset + 2] = blended[2] / length;
            }
        }
        for (const [child, normals] of normalsByChild) {
            child.setVerticesData(BABYLON.VertexBuffer.NormalKind, normals, false);
            child.refreshBoundingInfo();
        }
        return groups.length;
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

        this.bakeCharacterRigWorldTransforms(modelRoot, nodes, worldMatrixFor);
    }

    characterRigWorldMatrices(
        modelRoot,
        worldMatrixByRenderKey,
        options = {},
        result = null,
    ) {
        if (!modelRoot) {
            result?.clear();
            return result || new Map();
        }
        const nodes = modelRoot?._mt5Nodes || [];
        const byAddr = modelRoot._mt5NodesByAddress ||= new Map(
            nodes.map((node) => [node.addr, node]),
        );
        const worldCache = result || new Map();
        worldCache.clear();
        const postTransform = options.postTransform || null;
        const worldMatrixFor = (node) => {
            if (worldCache.has(node.addr)) return worldCache.get(node.addr);

            const low16 = node.flag & 0xffff;
            const renderKey = low16 >= 0x8000 ? low16 - 0x10000 : low16;
            const routedMatrix = worldMatrixByRenderKey?.get(renderKey);
            let world;
            if (routedMatrix) {
                world = postTransform
                    ? Mt5Loader.rowMultiply(routedMatrix, postTransform)
                    : routedMatrix;
            } else {
                const local = Mt5Loader.sourceTransformMatrix(node);
                const parent = byAddr.get(node.parentAddr);
                world = parent
                    ? Mt5Loader.rowMultiply(local, worldMatrixFor(parent))
                    : local;
            }

            worldCache.set(node.addr, world);
            return world;
        };
        for (const node of nodes) worldMatrixFor(node);
        return worldCache;
    }

    createCharacterGpuRig(modelRoot, nodes) {
        const skeleton = new BABYLON.Skeleton(
            `${modelRoot.name}_skeleton`,
            `${modelRoot.name}_skeleton`,
            this.scene,
        );
        const boneByNodeAddress = new Map();
        const skinByChild = new Map();

        nodes.forEach((node, nodeIndex) => {
            if (!node.mesh || typeof node.mesh.getChildren !== "function") {
                return;
            }
            const children = node.mesh.getChildren().filter((child) => (
                child instanceof BABYLON.Mesh
                && child._mt5SourcePositions
                && child.getTotalVertices() > 0
            ));
            if (children.length === 0) return;

            // MT5 render matrices are already absolute. Root-level Babylon
            // bones preserve that representation exactly: the shader receives
            // inverse(bind world) * animated world for each rigid mesh piece.
            const bindMatrix = BABYLON.Matrix.FromArray(
                this.sourceWorldMatrixForNode(node),
            );
            const boneIndex = skeleton.bones.length;
            const bone = new BABYLON.Bone(
                `mt5_node_${node.addr.toString(16)}`,
                skeleton,
                null,
                bindMatrix,
                bindMatrix.clone(),
                bindMatrix.clone(),
                boneIndex,
            );
            bone._mt5PoseMatrix = bindMatrix.clone();
            boneByNodeAddress.set(node.addr, bone);

            for (const child of children) {
                const vertexCount = child.getTotalVertices();
                const indices = new Float32Array(vertexCount * 4);
                const weights = new Float32Array(vertexCount * 4);
                for (let vertexIndex = 0; vertexIndex < vertexCount; vertexIndex += 1) {
                    indices[vertexIndex * 4] = boneIndex;
                    weights[vertexIndex * 4] = 1;
                }
                skinByChild.set(child, {
                    nodeIndex,
                    indices,
                    weights,
                    maximumInfluencers: 1,
                });
            }
        });

        // The CPU character path rewelds duplicate boundary vertices after
        // every pose. GPU characters cannot rewrite their vertex buffers each
        // frame, so give every copy of an authored cross-node boundary the
        // exact same set of adjacent bone influences. Linear skinning then
        // produces the same averaged boundary position for every copy while
        // all non-boundary vertices remain rigidly owned by their MT5 node.
        for (const group of modelRoot._mt5CharacterRigSeamGroups || []) {
            const boneIndices = [...new Set(group.map((vertex) => {
                const node = nodes[vertex.nodeIndex];
                return boneByNodeAddress.get(node?.addr)?.getIndex();
            }).filter(Number.isInteger))].slice(0, 4);
            if (boneIndices.length < 2) continue;
            const weight = 1 / boneIndices.length;
            for (const vertex of group) {
                const skin = skinByChild.get(vertex.child);
                const offset = vertex.vertexIndex * 4;
                if (!skin || offset + 3 >= skin.indices.length) continue;
                skin.maximumInfluencers = Math.max(
                    skin.maximumInfluencers,
                    boneIndices.length,
                );
                for (let influence = 0; influence < 4; influence += 1) {
                    skin.indices[offset + influence] = (
                        boneIndices[influence] ?? 0
                    );
                    skin.weights[offset + influence] = (
                        influence < boneIndices.length ? weight : 0
                    );
                }
            }
        }

        for (const [
            child,
            { indices, weights, maximumInfluencers },
        ] of skinByChild) {
            child.setVerticesData(
                BABYLON.VertexBuffer.MatricesIndicesKind,
                indices,
                false,
                4,
            );
            child.setVerticesData(
                BABYLON.VertexBuffer.MatricesWeightsKind,
                weights,
                false,
                4,
            );
            child.numBoneInfluencers = maximumInfluencers;
            child.skeleton = skeleton;
            child.computeBonesUsingShaders = true;
            child.alwaysSelectAsActiveMesh = false;
        }

        modelRoot._mt5CharacterGpuRig = {
            skeleton,
            boneByNodeAddress,
            skinnedMeshes: [...skinByChild.keys()],
        };
        this.updateCharacterGpuBoundingInfo(
            modelRoot,
            this.characterRigBoundsForWorldMatrices(modelRoot, null),
        );
        modelRoot.onDisposeObservable?.addOnce(() => skeleton.dispose());
        return modelRoot._mt5CharacterGpuRig;
    }

    mergeCharacterGpuRigMeshes(
        modelRoot,
        { preserveRenderKeySubtrees = [] } = {},
    ) {
        const rig = modelRoot?._mt5CharacterGpuRig;
        if (!rig) return [];
        const contentRoot = this.characterContentRoot(modelRoot);
        const activeMeshes = (rig.skinnedMeshes || []).filter((mesh) => (
            mesh?.isEnabled?.()
            && mesh.getTotalVertices?.() > 0
        ));
        const inactiveMeshes = (rig.skinnedMeshes || []).filter(
            (mesh) => !activeMeshes.includes(mesh),
        );
        const preservedKeys = new Set(preserveRenderKeySubtrees);
        const nodesByAddress = new Map(
            (modelRoot._mt5Nodes || []).map((node) => [node.addr, node]),
        );
        const preservedNodeAddresses = new Set();
        if (preservedKeys.size > 0) {
            for (const node of modelRoot._mt5Nodes || []) {
                let current = node;
                while (current) {
                    const low16 = current.flag & 0xffff;
                    const renderKey = low16 >= 0x8000
                        ? low16 - 0x10000
                        : low16;
                    if (preservedKeys.has(renderKey)) {
                        preservedNodeAddresses.add(node.addr);
                        break;
                    }
                    current = nodesByAddress.get(current.parentAddr);
                }
            }
        }
        const preservedMeshes = activeMeshes.filter((mesh) => (
            preservedNodeAddresses.has(mesh._mt5NodeAddress)
            // Blended MT5 surfaces need their authored nodes to remain
            // independently sortable. Merging them into one skinned mesh
            // makes feathers, hair, and other overlapping translucent pieces
            // erase one another because triangles within one mesh are not
            // depth-sorted. Opaque and alpha-tested surfaces remain batchable.
            || mesh.material?._mt5AlphaMode === "blend"
        ));
        const mergeableMeshes = activeMeshes.filter(
            (mesh) => !preservedMeshes.includes(mesh),
        );
        const meshesByMaterial = new Map();
        for (const mesh of mergeableMeshes) {
            const group = meshesByMaterial.get(mesh.material) || [];
            group.push(mesh);
            meshesByMaterial.set(mesh.material, group);
        }

        const renderMeshes = [...preservedMeshes];
        let groupIndex = 0;
        for (const meshes of meshesByMaterial.values()) {
            if (meshes.length === 1) {
                renderMeshes.push(meshes[0]);
                continue;
            }
            const maximumInfluencers = Math.max(
                ...meshes.map((mesh) => mesh.numBoneInfluencers || 0),
            );
            const alphaToCoverage = meshes.some(
                (mesh) => mesh._mt5AlphaToCoverage,
            );
            const parents = new Map(
                meshes.map((mesh) => [mesh, mesh.parent]),
            );
            // GPU character source meshes have identity local transforms
            // beneath the mirrored character-content node after pose baking.
            // Detach them before MergeMeshes so that mirror is not baked into
            // vertices and then applied a second time by contentRoot.
            for (const mesh of meshes) {
                mesh.parent = null;
                mesh.computeWorldMatrix(true);
            }
            const merged = BABYLON.Mesh.MergeMeshes(
                meshes,
                true,
                true,
            );
            if (!merged) {
                for (const mesh of meshes) {
                    mesh.parent = parents.get(mesh) || contentRoot;
                }
                renderMeshes.push(...meshes);
                continue;
            }
            merged.name = `${modelRoot.name}_material_${groupIndex}`;
            groupIndex += 1;
            merged.parent = contentRoot;
            merged.skeleton = rig.skeleton;
            merged.numBoneInfluencers = maximumInfluencers;
            merged.computeBonesUsingShaders = true;
            merged.alwaysSelectAsActiveMesh = false;
            merged.isPickable = false;
            merged.checkCollisions = false;
            if (alphaToCoverage) {
                this.configureAlphaToCoverage(merged, "alphatest");
            }
            renderMeshes.push(merged);
        }
        rig.skinnedMeshes = [...inactiveMeshes, ...renderMeshes];
        this.updateCharacterGpuBoundingInfo(modelRoot, rig.bounds);
        return renderMeshes;
    }

    applyCharacterGpuResolvedWorldMatrices(modelRoot, worldMatrices) {
        const rig = modelRoot?._mt5CharacterGpuRig;
        if (!rig || !(worldMatrices instanceof Map)) return false;
        modelRoot._mt5CharacterWorldMatrices = worldMatrices;
        for (const [nodeAddress, bone] of rig.boneByNodeAddress) {
            const world = worldMatrices.get(nodeAddress);
            if (!world) continue;
            BABYLON.Matrix.FromArrayToRef(world, 0, bone._mt5PoseMatrix);
            bone._matrix = bone._mt5PoseMatrix;
        }
        // We intentionally keep every MT5 render matrix as an absolute
        // root-level bone matrix. Assigning that matrix directly avoids
        // Babylon interpreting it as a hierarchical local transform, but it
        // also bypasses Bone.markAsDirty(). Explicitly invalidate the shared
        // skeleton once after the complete pose is installed so prepare()
        // uploads every subsequent frame instead of retaining the first one.
        rig.skeleton._markAsDirty();
        this.updateCharacterGpuBoundingInfo(
            modelRoot,
            this.characterRigBoundsForMatrices(
                modelRoot,
                worldMatrices,
                rig.bounds,
            ),
            worldMatrices,
        );
        return true;
    }

    applyCharacterGpuWorldMatrices(modelRoot, worldMatrixByRenderKey, options = {}) {
        const rig = modelRoot?._mt5CharacterGpuRig;
        if (!rig) return false;
        const worldMatrices = this.characterRigWorldMatrices(
            modelRoot,
            worldMatrixByRenderKey,
            options,
            rig.worldMatrices ||= new Map(),
        );
        return this.applyCharacterGpuResolvedWorldMatrices(
            modelRoot,
            worldMatrices,
        );
    }

    characterRigSourceBoundsByNode(modelRoot) {
        if (modelRoot?._mt5CharacterRigSourceBoundsByNode) {
            return modelRoot._mt5CharacterRigSourceBoundsByNode;
        }
        const boundsByNode = new Map();
        for (const node of modelRoot?._mt5Nodes || []) {
            if (
                !node.mesh
                || node.mesh.isEnabled?.() === false
                || typeof node.mesh.getChildren !== "function"
            ) {
                continue;
            }
            const minimum = [Infinity, Infinity, Infinity];
            const maximum = [-Infinity, -Infinity, -Infinity];
            for (const child of node.mesh.getChildren()) {
                const positions = child._mt5SourcePositions;
                if (!(child instanceof BABYLON.Mesh) || !positions) continue;
                for (let offset = 0; offset < positions.length; offset += 3) {
                    for (let axis = 0; axis < 3; axis += 1) {
                        minimum[axis] = Math.min(
                            minimum[axis],
                            positions[offset + axis],
                        );
                        maximum[axis] = Math.max(
                            maximum[axis],
                            positions[offset + axis],
                        );
                    }
                }
            }
            if ([...minimum, ...maximum].every(Number.isFinite)) {
                const xs = minimum[0] === maximum[0]
                    ? [minimum[0]]
                    : [minimum[0], maximum[0]];
                const ys = minimum[1] === maximum[1]
                    ? [minimum[1]]
                    : [minimum[1], maximum[1]];
                const zs = minimum[2] === maximum[2]
                    ? [minimum[2]]
                    : [minimum[2], maximum[2]];
                const corners = [];
                for (const x of xs) {
                    for (const y of ys) {
                        for (const z of zs) corners.push([x, y, z]);
                    }
                }
                boundsByNode.set(node.addr, { corners });
            }
        }
        modelRoot._mt5CharacterRigSourceBoundsByNode = boundsByNode;
        return boundsByNode;
    }

    invalidateCharacterRigSourceBounds(modelRoot) {
        if (!modelRoot) return;
        modelRoot._mt5CharacterRigSourceBoundsByNode = null;
    }

    characterRigBoundsForMatrices(modelRoot, worldMatrices, result = null) {
        const boundsByNode = this.characterRigSourceBoundsByNode(modelRoot);
        const bounds = result || {
            minimum: [Infinity, Infinity, Infinity],
            maximum: [-Infinity, -Infinity, -Infinity],
        };
        const { minimum, maximum } = bounds;
        minimum[0] = Infinity;
        minimum[1] = Infinity;
        minimum[2] = Infinity;
        maximum[0] = -Infinity;
        maximum[1] = -Infinity;
        maximum[2] = -Infinity;
        for (const [nodeAddress, sourceBounds] of boundsByNode) {
            const matrix = worldMatrices.get(nodeAddress);
            if (!matrix) continue;
            for (const [x, y, z] of sourceBounds.corners) {
                const transformedX = (
                    x * matrix[0] + y * matrix[4] + z * matrix[8] + matrix[12]
                );
                const transformedY = (
                    x * matrix[1] + y * matrix[5] + z * matrix[9] + matrix[13]
                );
                const transformedZ = (
                    x * matrix[2] + y * matrix[6] + z * matrix[10] + matrix[14]
                );
                minimum[0] = Math.min(minimum[0], transformedX);
                minimum[1] = Math.min(minimum[1], transformedY);
                minimum[2] = Math.min(minimum[2], transformedZ);
                maximum[0] = Math.max(maximum[0], transformedX);
                maximum[1] = Math.max(maximum[1], transformedY);
                maximum[2] = Math.max(maximum[2], transformedZ);
            }
        }
        return (
            minimum.every(Number.isFinite)
            && maximum.every(Number.isFinite)
        )
            ? bounds
            : null;
    }

    characterRigBoundsForWorldMatrices(
        modelRoot,
        worldMatrixByRenderKey,
        options = {},
    ) {
        const worldMatrices = this.characterRigWorldMatrices(
            modelRoot,
            worldMatrixByRenderKey,
            options,
        );
        return this.characterRigBoundsForMatrices(modelRoot, worldMatrices);
    }

    characterRigSourceBoundsForMesh(mesh) {
        if (mesh?._mt5CharacterRigSourceBounds) {
            return mesh._mt5CharacterRigSourceBounds;
        }
        const positions = mesh?._mt5SourcePositions;
        if (!positions || positions.length < 3) return null;
        const minimum = [Infinity, Infinity, Infinity];
        const maximum = [-Infinity, -Infinity, -Infinity];
        for (let offset = 0; offset < positions.length; offset += 3) {
            for (let axis = 0; axis < 3; axis += 1) {
                minimum[axis] = Math.min(minimum[axis], positions[offset + axis]);
                maximum[axis] = Math.max(maximum[axis], positions[offset + axis]);
            }
        }
        if (![...minimum, ...maximum].every(Number.isFinite)) return null;
        const corners = [];
        for (const x of [minimum[0], maximum[0]]) {
            for (const y of [minimum[1], maximum[1]]) {
                for (const z of [minimum[2], maximum[2]]) {
                    corners.push([x, y, z]);
                }
            }
        }
        mesh._mt5CharacterRigSourceBounds = { corners };
        return mesh._mt5CharacterRigSourceBounds;
    }

    characterRigMeshBoundsForMatrix(mesh, matrix) {
        const sourceBounds = this.characterRigSourceBoundsForMesh(mesh);
        if (!sourceBounds || !matrix) return null;
        const minimum = [Infinity, Infinity, Infinity];
        const maximum = [-Infinity, -Infinity, -Infinity];
        for (const [x, y, z] of sourceBounds.corners) {
            const point = [
                x * matrix[0] + y * matrix[4] + z * matrix[8] + matrix[12],
                x * matrix[1] + y * matrix[5] + z * matrix[9] + matrix[13],
                x * matrix[2] + y * matrix[6] + z * matrix[10] + matrix[14],
            ];
            for (let axis = 0; axis < 3; axis += 1) {
                minimum[axis] = Math.min(minimum[axis], point[axis]);
                maximum[axis] = Math.max(maximum[axis], point[axis]);
            }
        }
        return { minimum, maximum };
    }

    updateCharacterGpuBoundingInfo(modelRoot, bounds, worldMatrices = null) {
        const rig = modelRoot?._mt5CharacterGpuRig;
        if (!rig || !bounds) return false;
        if (![...bounds.minimum, ...bounds.maximum].every(Number.isFinite)) {
            return false;
        }
        rig.boundingMinimum ||= new BABYLON.Vector3();
        rig.boundingMaximum ||= new BABYLON.Vector3();
        const minimum = rig.boundingMinimum;
        const maximum = rig.boundingMaximum;
        minimum.copyFromFloats(...bounds.minimum);
        maximum.copyFromFloats(...bounds.maximum);
        for (const child of rig.skinnedMeshes || []) {
            const nodeMatrix = worldMatrices?.get(child._mt5NodeAddress);
            const childBounds = (
                child.material?._mt5AlphaMode === "blend"
                && child._mt5NativeClothOutput !== true
            )
                ? this.characterRigMeshBoundsForMatrix(child, nodeMatrix)
                : null;
            const boundingInfo = child.getBoundingInfo();
            const childMinimum = childBounds
                ? (child._mt5AnimatedBoundingMinimum ||= new BABYLON.Vector3())
                : minimum;
            const childMaximum = childBounds
                ? (child._mt5AnimatedBoundingMaximum ||= new BABYLON.Vector3())
                : maximum;
            if (childBounds) {
                childMinimum.copyFromFloats(...childBounds.minimum);
                childMaximum.copyFromFloats(...childBounds.maximum);
            }
            boundingInfo.reConstruct(
                childMinimum,
                childMaximum,
                child.getWorldMatrix(),
            );
            child.alwaysSelectAsActiveMesh = false;
        }
        rig.bounds = bounds;
        return true;
    }

    characterRigMinimumYForWorldMatrices(
        modelRoot,
        worldMatrixByRenderKey,
        options = {},
    ) {
        return this.characterRigBoundsForWorldMatrices(
            modelRoot,
            worldMatrixByRenderKey,
            options,
        )?.minimum[1] ?? Infinity;
    }

    bakeCharacterRigWorldTransforms(modelRoot, nodes, worldMatrixFor) {
        modelRoot.rotationQuaternion = null;
        modelRoot.rotation.set(0, 0, 0);
        modelRoot.position.set(0, 0, 0);
        modelRoot.scaling.set(1, 1, 1);

        for (const node of nodes) {
            if (!node.mesh) continue;

            const matrix = worldMatrixFor(node);
            node.mesh.parent = this.characterContentRoot(modelRoot);
            node.mesh.rotationQuaternion = null;
            node.mesh.rotation.set(0, 0, 0);
            node.mesh.position.set(0, 0, 0);
            node.mesh.scaling.set(1, 1, 1);

            if (typeof node.mesh.getChildren !== "function") continue;
            for (const child of node.mesh.getChildren()) {
                if (!(child instanceof BABYLON.Mesh) || !child._mt5SourcePositions) continue;

                const positions = [];
                const normals = [];
                for (let i = 0; i < child._mt5SourcePositions.length; i += 3) {
                    const transformed = Mt5Loader.transformRowPoint([
                        child._mt5SourcePositions[i],
                        child._mt5SourcePositions[i + 1],
                        child._mt5SourcePositions[i + 2],
                    ], matrix);
                    positions.push(...transformed);

                    if (child._mt5SourceNormals?.length >= i + 3) {
                        const transformedNormal = Mt5Loader.transformRowVector([
                            child._mt5SourceNormals[i],
                            child._mt5SourceNormals[i + 1],
                            child._mt5SourceNormals[i + 2],
                        ], matrix);
                        const length = Math.hypot(...transformedNormal);
                        normals.push(...(
                            length > 1e-12
                                ? transformedNormal.map((value) => value / length)
                                : [0, 1, 0]
                        ));
                    }
                }

                const dynamicClothOutput = child._mt5NativeClothOutput === true;
                const positionBuffer = child.getVertexBuffer(
                    BABYLON.VertexBuffer.PositionKind,
                );
                if (
                    dynamicClothOutput
                    && positionBuffer?.isUpdatable?.() === true
                ) {
                    child.updateVerticesData(
                        BABYLON.VertexBuffer.PositionKind,
                        positions,
                        false,
                        false,
                    );
                } else {
                    child.setVerticesData(
                        BABYLON.VertexBuffer.PositionKind,
                        positions,
                        dynamicClothOutput,
                    );
                }

                if (normals.length === positions.length) {
                    const normalBuffer = child.getVertexBuffer(
                        BABYLON.VertexBuffer.NormalKind,
                    );
                    if (
                        dynamicClothOutput
                        && normalBuffer?.isUpdatable?.() === true
                    ) {
                        child.updateVerticesData(
                            BABYLON.VertexBuffer.NormalKind,
                            normals,
                            false,
                            false,
                        );
                    } else {
                        child.setVerticesData(
                            BABYLON.VertexBuffer.NormalKind,
                            normals,
                            dynamicClothOutput,
                        );
                    }
                } else {
                    const indices = child.getIndices();
                    if (indices && indices.length > 0) {
                        const computedNormals = [];
                        BABYLON.VertexData.ComputeNormals(
                            positions,
                            indices,
                            computedNormals,
                        );
                        child.setVerticesData(
                            BABYLON.VertexBuffer.NormalKind,
                            computedNormals,
                            false,
                        );
                    }
                }

                child.position.set(0, 0, 0);
                child.rotationQuaternion = null;
                child.rotation.set(0, 0, 0);
                child.scaling.set(1, 1, 1);
                child.refreshBoundingInfo();
            }
        }

        if (this.characterRigSeamMode === "weld") {
            this.weldCharacterRigSeams(modelRoot, nodes);
        }
        modelRoot._mt5CharacterRigBaked = true;
    }

    applyCharacterRigPose(modelRoot, poseByBoneId, poseOptions = {}) {
        const nodes = modelRoot?._mt5Nodes || [];
        if (nodes.length === 0) return;
        this.bakeCharacterRigSourceTransforms(modelRoot, nodes, poseByBoneId, poseOptions);
    }

    applyCharacterRigWorldMatrices(modelRoot, worldMatrixByRenderKey, options = {}) {
        const nodes = modelRoot?._mt5Nodes || [];
        if (nodes.length === 0) return;
        const worldMatrices = this.characterRigWorldMatrices(
            modelRoot,
            worldMatrixByRenderKey,
            options,
        );
        this.applyCharacterRigResolvedWorldMatrices(modelRoot, worldMatrices);
    }

    applyCharacterRigResolvedWorldMatrices(modelRoot, worldMatrices) {
        const nodes = modelRoot?._mt5Nodes || [];
        if (nodes.length === 0 || !(worldMatrices instanceof Map)) return false;
        if (modelRoot._mt5CharacterGpuRig) {
            return this.applyCharacterGpuResolvedWorldMatrices(
                modelRoot,
                worldMatrices,
            );
        }
        modelRoot._mt5CharacterWorldMatrices = worldMatrices;
        this.bakeCharacterRigWorldTransforms(
            modelRoot,
            nodes,
            (node) => worldMatrices.get(node.addr),
        );
        return true;
    }

    applyNodeHierarchyTransforms(modelRoot, nodes, isCharacterRig = false) {
        if (isCharacterRig) {
            modelRoot.rotation.x = -Math.PI / 2;
        }

        for (const node of nodes) {
            if (node.mesh) {
                // MT5 applies rotations in explicit X -> Y -> Z source order.
                // Assigning the three values to Babylon's Euler `rotation`
                // uses a different order and badly tilts multi-axis objects.
                // Reflect the complete source matrix into browser space and
                // decompose it so Babylon preserves the authored transform.
                const browserMatrix = BABYLON.Matrix.FromArray(
                    Mt5Loader.browserTransformMatrix(node),
                );
                node.mesh.rotationQuaternion = new BABYLON.Quaternion();
                browserMatrix.decompose(
                    node.mesh.scaling,
                    node.mesh.rotationQuaternion,
                    node.mesh.position,
                );

                if (node.parentAddr) {
                    const parentNode = nodes.find(n => n.addr === node.parentAddr);
                    if (parentNode && parentNode.mesh) {
                        node.mesh.parent = parentNode.mesh;
                    } else {
                        node.mesh.parent = this.characterContentRoot(modelRoot);
                    }
                } else {
                    node.mesh.parent = this.characterContentRoot(modelRoot);
                }
            }
        }
    }

    async load(buffer, secondaryBuffer = null, loadOptions = {}) {
        const controllerFamilyIndex =
            authoredControllerFamilyIndexFromMt5(buffer);
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
        modelRoot._mt5ControllerFamilyIndex = controllerFamilyIndex;

        const detectedCharacterRig = Mt5Loader.isCharacterRig(nodes);
        // Processed HUMANS .CHRM files do not all retain the original root-tag
        // signature used by the legacy detector. Callers select `gpu` only for
        // known character assets, so that mode is also an explicit declaration
        // that this hierarchy is a character rig.
        const isCharacterRig = (
            detectedCharacterRig
            || this.characterRigMode === "gpu"
        );
        modelRoot._mt5CharacterRig = isCharacterRig;
        if (isCharacterRig && this.mirrorCharacterX) {
            const contentRoot = new BABYLON.TransformNode(
                `${modelRoot.name}_character_content`,
                this.scene,
            );
            contentRoot.parent = modelRoot;
            contentRoot.scaling.set(-1, 1, 1);
            modelRoot._mt5CharacterContentRoot = contentRoot;
        }

        // Apply Hierarchy and Transformations
        if (
            isCharacterRig
            && (
                this.characterRigMode === "baked"
                || this.characterRigMode === "gpu"
            )
        ) {
            this.bakeCharacterRigSourceTransforms(modelRoot, nodes);
            if (this.characterRigMode === "gpu") {
                this.createCharacterGpuRig(modelRoot, nodes);
            }
        } else {
            this.applyNodeHierarchyTransforms(modelRoot, nodes, isCharacterRig);
        }

        const sourceFilename = loadOptions?.sourceFilename || "";
        if (sourceFilename) {
            modelRoot._filename = sourceFilename;
            modelRoot.metadata = {
                ...(modelRoot.metadata || {}),
                filename: sourceFilename,
            };
        }
        applyMt5NormalPolicy(modelRoot, sourceFilename);
        const overlayDefinition = overlayDefinitionForFile(
            this.overlayManifest,
            sourceFilename,
            buffer?.byteLength,
        );
        if (overlayDefinition) {
            applyMt5OverlayDefinition(modelRoot, overlayDefinition, {
                depthBiasFactor: this.overlayDepthBiasFactor,
                depthBiasUnits: this.overlayDepthBiasUnits,
            });
        }
        if (isCharacterRig) {
            for (const mesh of modelRoot.getChildMeshes()) {
                if (mesh.material?._mt5AlphaMode === "blend") {
                    enableTransparentTriangleSorting(mesh);
                }
            }
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

    // Export tools opt into strict validation; interactive loading retains its
    // existing partial-geometry behavior for unsupported source records.
    readPolygons(reader, vertexBase, nbVertex, model = null, node = null, parentModel = null, { strict = false } = {}) {
        const polygons = [];
        let currentTexIdx = 0;
        let isUVH = false;
        // PC Shenmue.exe FUN_140065160 initializes the normal UV divisor to 0x100.
        let uvSize = 256.0;
        let uMirror = false;
        let vMirror = false;
        // Untextured/neutral MT5 textures are often deliberately white and
        // receive their actual surface colour from a 0x000e draw-state entry.
        // This is especially common for capsule figures (Sonic, Knuckles,
        // Amy, etc.). The colour is stored in Dreamcast BGRA byte order.
        let materialColor = [1, 1, 1, 1];
        const inverseLocalMatrix = node ? Mt5Loader.inverseSourceTransformMatrix(node) : null;

        let iterations = 0;
        let terminated = false;
        while ((strict ? reader.offset <= reader.size - 2 : reader.offset < reader.size - 2) && iterations < 10000) {
            iterations++;
            const type = reader.readUShort();

            // 0x8000 marks the end of the mesh data block
            if (type === 0x8000) { terminated = true; break; }

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
                const data = reader.readBytes(size);
                if (type === 0x000E && data.length >= 4) {
                    materialColor = [
                        data[2] / 255,
                        data[1] / 255,
                        data[0] / 255,
                        data[3] / 255,
                    ];
                }
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
                    materialColor: [...materialColor],
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
                    // 0x13/0x1b carry no explicit UV payload. Their textured
                    // polygons use generated normal-based environment
                    // coordinates; treating every vertex as UV 0,0 made the
                    // geometry sample a single dark texel (B.B. Ultra).
                    strip._mt5GeneratedEnvironmentUV = (
                        type === 0x13 || type === 0x1B
                    );
                    for (let k = 0; k < absStripLen; k++) {
                        const rawIdx = reader.readShort();

                        // Negative values reuse parent mesh vertices. ShenmueDKSharp/wudecon
                        // first brings those parent vertices into the child node's local space.
                        let idx = vertexBase + rawIdx;
                        let vertexOverride = null;
                        let externalParentVertexOffset = null;
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
                                    externalParentVertexOffset = rawIdx;
                                }
                            } else {
                                idx = vertexBase;
                                // A separately loaded native attachment (for
                                // example *_F.MT5) has no in-file parent even
                                // though its signed indices still address the
                                // tail of the replaced body node's source
                                // parent vertex array. Retain that reference
                                // for the presentation layer to bind once the
                                // real body hierarchy is known. Vertex zero is
                                // only a temporary load placeholder, never the
                                // semantic source.
                                externalParentVertexOffset = rawIdx;
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

                            if (this.emulateMirrorResize && uMirror && Math.abs(u) > 1.0) u /= 2.0;
                            if (this.emulateMirrorResize && vMirror && Math.abs(v) > 1.0) v /= 2.0;
                        }

                        let color = [...materialColor];
                        if (hasColor) {
                            const b = reader.readUInt8() / 255;
                            const g = reader.readUInt8() / 255;
                            const r = reader.readUInt8() / 255;
                            const a = reader.readUInt8() / 255;
                            color = [r, g, b, a];
                        }

                        strip.push({
                            idx,
                            u,
                            v,
                            color,
                            vertexOverride,
                            externalParentVertexOffset,
                            mirrorU: uMirror,
                            mirrorV: vMirror,
                        });
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
                if (strict && !poly.entryLengthMatchesPcSkip) {
                    throw new Error(`MT5 strip length mismatch at 0x${entryOffset.toString(16)}`);
                }
                polygons.push(poly);
            } else {
                if (strict) throw new Error(`Unsupported MT5 chunk 0x${type.toString(16)} at 0x${(reader.offset - 2).toString(16)}`);
                // Failsafe for unknown data types to prevent infinite loops
                console.warn(`[MT5] Unknown chunk type 0x${type.toString(16)} at offset ${reader.offset - 2}. Breaking.`);
                break;
            }
        }
        if (strict && !terminated) throw new Error('MT5 polygon stream has no end marker');
        return polygons;
    }

    createMeshFromModel(model, node = null) {
        if (!model.polygons || model.polygons.length === 0) return null;

        const rootMesh = new BABYLON.Mesh("mt5_root", this.scene);
        rootMesh._mt5Node = node;
        const coplanarTextureRanks = this.resolveCoplanarOverlays
            ? Mt5Loader.coplanarOverlayTextureRanks(
                model.polygons,
                this.globalVertices,
                this.coplanarOverlayPlaneEpsilon,
            )
            : new Map();

        const texGroups = new Map();
        for (const poly of model.polygons) {
            const tid = poly.texId ?? 0;
            const firstStrip = poly.strips[0];
            const mirrorU = Boolean(firstStrip?._mt5MirrorU);
            const mirrorV = Boolean(firstStrip?._mt5MirrorV);
            const groupKey = `${tid}:${mirrorU ? 1 : 0}:${mirrorV ? 1 : 0}`;
            if (!texGroups.has(groupKey)) {
                texGroups.set(groupKey, {
                    texId: tid,
                    mirrorU,
                    mirrorV,
                    polys: [],
                });
            }
            texGroups.get(groupKey).polys.push(poly);
        }

        for (const {
            texId,
            mirrorU,
            mirrorV,
            polys,
        } of texGroups.values()) {
            const positions = [];
            const normals = [];
            const uvs = [];
            const indices = [];
            const vertexMap = new Map();
            const sourcePositions = [];
            const sourceNormals = [];
            const sourceVertexIndices = [];
            const externalParentVertexOffsets = [];

            const colors = [];

            const tex = this.textureCache.get(texId);
            const alphaMode = this.alphaModeForTexture(texId, tex);
            const isAlpha = alphaMode === "alphatest" || alphaMode === "blend";
            const atlasProjectionBounds = this.computeRyoHeadAtlasProjectionBounds(polys, texId, node);
            const coplanarOverlayDistance = (
                (coplanarTextureRanks.get(texId) || 0)
                * this.coplanarOverlaySeparation
            );

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
                        const key = `${p.idx}_${p.externalParentVertexOffset ?? "local"}_${p.u.toFixed(5)}_${p.v.toFixed(5)}_${p.mirrorU ? 1 : 0}_${p.mirrorV ? 1 : 0}_${atlasRegion || "default"}_${uvKey}_${debugStripKey}_${p.color.join(',')}`;
                        let nIdx = vertexMap.get(key);
                        if (nIdx === undefined) {
                            nIdx = positions.length / 3;
                            const v = p.vertexOverride || this.globalVertices[p.idx];
                            if (!v) continue;
                            if (coplanarOverlayDistance > 0) {
                                positions.push(
                                    v.pos[0] + v.norm[0] * coplanarOverlayDistance,
                                    v.pos[1] + v.norm[1] * coplanarOverlayDistance,
                                    v.pos[2] + v.norm[2] * coplanarOverlayDistance,
                                );
                            } else {
                                positions.push(...v.pos);
                            }
                            normals.push(...v.norm);
                            sourcePositions.push(...(v.sourcePos || v.pos));
                            sourceNormals.push(...(v.sourceNorm || v.norm));
                            sourceVertexIndices.push(p.idx);
                            externalParentVertexOffsets.push(
                                p.externalParentVertexOffset ?? 0,
                            );
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
                        let first;
                        let second;
                        let third;
                        if (isAlpha) {
                            // Alpha surfaces: original winding (normals already face correct way)
                            [first, second, third] = parity % 2 === 0
                                ? [a, b, c]
                                : [a, c, b];
                        } else {
                            // Opaque surfaces: reversed winding so front face aligns with normals
                            // This fixes lighting AND enables proper backface culling
                            [first, second, third] = parity % 2 === 0
                                ? [a, c, b]
                                : [a, b, c];
                        }
                        if (this.orientTriangleWindingToNormals) {
                            [first, second, third] = (
                                Mt5Loader.orientedTriangleIndices(
                                    first,
                                    second,
                                    third,
                                    sourcePositions,
                                    sourceNormals,
                                )
                            );
                        }
                        indices.push(first, second, third);
                    }
                }
            }


            if (indices.length > 0) {
                // HEURISTIC: Skip geometry that lacks UV coordinates.
                // In MT5, practically all visual geometry has UVs. 
                // Absence of UVs almost always indicates collision or trigger markers
                // (like the 'white cylinders' or 'brown cylinders' reported by the user).
                const groupHasUV = polys.some((poly) => (
                    poly.hasUV
                    || poly.strips.some((strip) => strip._mt5GeneratedEnvironmentUV)
                ));
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
                subMesh._mt5SourceVertexIndices = sourceVertexIndices;
                if (externalParentVertexOffsets.some(offset => offset < 0)) {
                    subMesh._mt5ExternalParentVertexOffsets = Int32Array.from(
                        externalParentVertexOffsets,
                    );
                }
                subMesh._mt5NodeAddress = node?.addr ?? null;
                subMesh.parent = rootMesh;

                const tex = this.textureCache.get(texId);
                const alphaMode = this.alphaModeForTexture(texId, tex);
                const debugTextureless = (
                    (this.ryoHeadAtlasDebug === "regions" || this.ryoHeadAtlasDebug === "strip-index") &&
                    this.isRyoHeadAtlasTexture(texId)
                );
                const zOffset = this.zOffsetForTexture(texId);
                const addressModes = this.addressModesForTexture(
                    texId,
                    mirrorU,
                    mirrorV,
                );
                const matCacheKey = `${texId}_${alphaMode}_${zOffset}_${addressModes.u}_${addressModes.v}_${debugTextureless ? "debug-regions" : "normal"}`;

                let mat = this.materialCache.get(matCacheKey);
                if (!mat) {
                    const useAlphaToCoverage = (
                        alphaMode === "alphatest"
                        && this.supportsAlphaToCoverage()
                    );
                    mat = useAlphaToCoverage
                        ? new Mt5AlphaToCoverageMaterial(
                            `mt5_mat_${texId}`,
                            this.scene,
                        )
                        : new BABYLON.StandardMaterial(
                            `mt5_mat_${texId}`,
                            this.scene,
                        );
                    mat.useVertexColors = true;
                    mat._mt5AlphaMode = alphaMode;
                    mat.backFaceCulling = this.backFaceCulling;
                    if (this.materialSideOrientation !== null) {
                        mat.sideOrientation = this.materialSideOrientation;
                    }
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
                        // A texture can be referenced by strips with different
                        // U/V sampler state. Clone the Babylon wrapper so each
                        // material has independent wrap modes while retaining
                        // the same underlying GPU texture.
                        mat.diffuseTexture = typeof tex.clone === "function"
                            ? tex.clone()
                            : tex;
                        mat.diffuseTexture.wrapU = this.babylonAddressMode(
                            addressModes.u,
                        );
                        mat.diffuseTexture.wrapV = this.babylonAddressMode(
                            addressModes.v,
                        );
                    }

                    if (!debugTextureless && alphaMode === "blend") {
                        mat.diffuseTexture.hasAlpha = true;
                        mat.useAlphaFromDiffuseTexture = true;
                        mat.transparencyMode = BABYLON.StandardMaterial.MATERIAL_ALPHABLEND;
                        mat.needDepthPrePass = false;
                        mat.separateCullingPass = true;
                        mat.backFaceCulling = false;
                        mat.twoSidedLighting = true;
                        // ARGB4444 already contains the authored opacity for
                        // every texel. A second material-wide fade makes fully
                        // opaque regions translucent too (for example,
                        // DOR_L's jacket shares an atlas with his hair edges).
                        mat.alpha = 1.0;
                    } else if (!debugTextureless && alphaMode === "alphatest") {
                        mat.diffuseTexture.hasAlpha = true;
                        mat.useAlphaFromDiffuseTexture = true;
                        // MATERIAL_ALPHABLEND keeps filtered alpha in the
                        // fragment output. Mt5AlphaToCoverageMaterial's queue
                        // overrides prevent conventional blending, retain
                        // depth writes, and let MSAA coverage consume it.
                        mat.transparencyMode = useAlphaToCoverage
                            ? BABYLON.StandardMaterial.MATERIAL_ALPHABLEND
                            : BABYLON.StandardMaterial.MATERIAL_ALPHATEST;
                        mat._mt5PreservesAlphaForCoverage = useAlphaToCoverage;
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
                subMesh.metadata = {
                    ...(subMesh.metadata || {}),
                    mt5TextureId: Mt5Loader.textureIdHex(
                        this.textureIds.get(texId),
                    ).toLowerCase(),
                };
                this.configureAlphaToCoverage(subMesh, alphaMode);

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
                        const tex = this.decodePvrTexture(decoder);
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
                const tex = this.decodePvrTexture(decoder);
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
                        const tex = this.decodePvrTexture(decoder);
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
                            const tex = this.decodePvrTexture(decoder);
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
