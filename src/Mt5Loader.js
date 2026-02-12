import * as BABYLON from '@babylonjs/core';
import { BinaryReader } from './BinaryReader.js';
import { PvrDecoder } from './PvrDecoder.js';

export class Mt5Loader {
    constructor(scene) {
        this.scene = scene;
        this.textureCache = new Map();
        this.globalVertices = [];
        this.vertexOffset = 0;
        this.meshCounter = 0; // Per-file sub-mesh counter (reset each file)
        this.fileIndex = 0;    // Scene-wide file counter (never reset within a scene)
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
        this.globalVertices = [];
        this.vertexOffset = 0;
        this.meshCounter = 0; // Reset per-file counter for each MT5 file
        this.fileIndex++;     // Advance file index so cross-file meshes get different base offsets

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

        // Apply Hierarchy and Transformations
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


        return [modelRoot];
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

        if (node.modelAddr && node.modelAddr > 0 && node.modelAddr < reader.size) {
            const saved = reader.tell();
            reader.seek(node.modelAddr);
            node.model = this.readModel(reader);
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

    readModel(reader) {
        const addr = reader.tell();
        const model = {
            flag: reader.readUInt32(),
            vertexAddr: reader.readUInt32(),
            nbVertex: reader.readUInt32(),
            polygonAddr: reader.readUInt32(),
            center: { x: reader.readFloat32(), y: reader.readFloat32(), z: reader.readFloat32() },
            radius: reader.readFloat32(),
            vertexBase: this.vertexOffset
        };

        if (model.vertexAddr && model.vertexAddr > 0 && model.vertexAddr < reader.size) {
            const saved = reader.tell();
            reader.seek(model.vertexAddr);

            // Vertices are always 24 bytes: Pos(3xfloat32) + Norm(3xfloat32)

            for (let i = 0; i < model.nbVertex; i++) {
                if (!reader.canRead(24)) break;

                const x = -reader.readFloat32();
                const y = reader.readFloat32();
                const z = reader.readFloat32();
                const nx = -reader.readFloat32();
                const ny = reader.readFloat32();
                const nz = reader.readFloat32();

                this.globalVertices.push({
                    pos: [x, y, z],
                    norm: [nx, ny, nz]
                });
            }
            this.vertexOffset += model.nbVertex;
            reader.seek(saved);
        }

        if (model.polygonAddr && model.polygonAddr > 0 && model.polygonAddr < reader.size) {
            const saved = reader.tell();
            reader.seek(model.polygonAddr);
            model.polygons = this.readPolygons(reader, model.vertexBase, model.nbVertex);
            reader.seek(saved);
        }

        return model;
    }

    readPolygons(reader, vertexBase, nbVertex) {
        const polygons = [];
        let currentTexIdx = 0;
        let isUVH = false;
        let uvSize = 1024.0;
        let uMirror = false;
        let vMirror = false;

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

            // Miscellaneous 4-byte and 12-byte blocks
            if (type === 0x0008 || type === 0x000A) {
                reader.skip(2);
                continue;
            }
            if (type === 0x000E || type === 0x000F) {
                reader.skip(10);
                continue;
            }

            // Triangle Strips (0x10 - 0x1F)
            if (type >= 0x10 && type <= 0x1F) {
                const unknown = reader.readUShort();
                const nbStrips = reader.readUShort();
                const poly = { strips: [], head: type, texId: currentTexIdx, hasUV: false, hasColor: false };

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
                    for (let k = 0; k < absStripLen; k++) {
                        const rawIdx = reader.readShort();

                        // Handle relative indexing (wudecon style)
                        // Negative values are offsets from the end of the local vertex pool.
                        let idx = vertexBase + rawIdx;
                        if (rawIdx < 0) {
                            idx = vertexBase + nbVertex + rawIdx;
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
                                // Standard UV scale based on uvSize block or 1024 default.
                                // Note: Some files use specialized scaling for values >= 0xF000
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

                        strip.push({ idx, u, v, color });
                    }
                    poly.strips.push(strip);
                }
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

            const colors = [];

            const tex = this.textureCache.get(texId);
            const isAlpha = tex && (tex.hasAlpha || tex._hasGradientAlpha);

            for (const poly of polys) {
                for (const strip of poly.strips) {
                    const stripIndices = [];
                    for (const p of strip) {
                        const key = `${p.idx}_${p.u.toFixed(5)}_${p.v.toFixed(5)}_${p.color.join(',')}`;
                        let nIdx = vertexMap.get(key);
                        if (nIdx === undefined) {
                            nIdx = positions.length / 3;
                            const v = this.globalVertices[p.idx];
                            if (!v) continue;
                            positions.push(...v.pos);
                            normals.push(...v.norm);
                            uvs.push(p.v, p.u);
                            colors.push(...p.color);

                            vertexMap.set(key, nIdx);
                        }
                        stripIndices.push(nIdx);
                    }

                    for (let i = 0; i < stripIndices.length - 2; i++) {
                        const a = stripIndices[i], b = stripIndices[i + 1], c = stripIndices[i + 2];
                        if (isAlpha) {
                            // Alpha surfaces: original winding (normals already face correct way)
                            if (i % 2 === 0) indices.push(a, b, c);
                            else indices.push(a, c, b);
                        } else {
                            // Opaque surfaces: reversed winding so front face aligns with normals
                            // This fixes lighting AND enables proper backface culling
                            if (i % 2 === 0) indices.push(a, c, b);
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

                // If the texture is missing from the cache, we hide this geometry.
                if (!this.textureCache.has(texId)) {
                    continue;
                }

                const subMesh = new BABYLON.Mesh(`mt5_tex_${texId}`, this.scene);
                const vd = new BABYLON.VertexData();
                vd.positions = positions; vd.normals = normals; vd.uvs = uvs; vd.indices = indices;
                vd.colors = colors;
                vd.applyToMesh(subMesh);
                subMesh.parent = rootMesh;

                const mat = new BABYLON.StandardMaterial(`mt5_mat_${texId}`, this.scene);
                mat.useVertexColors = true;
                mat.backFaceCulling = true;
                mat.twoSidedLighting = true;

                mat.diffuseColor = new BABYLON.Color3(1, 1, 1);
                mat.specularColor = new BABYLON.Color3(0, 0, 0);
                mat.emissiveColor = new BABYLON.Color3(0.08, 0.08, 0.08);

                const tex = this.textureCache.get(texId);
                mat.diffuseTexture = tex;
                mat.diffuseTexture.wrapU = BABYLON.Texture.MIRROR_ADDRESSMODE;
                mat.diffuseTexture.wrapV = BABYLON.Texture.MIRROR_ADDRESSMODE;

                // Check if this texture has gradient alpha (ARGB4444 format = frosted glass)
                const hasGradientAlpha = tex._hasGradientAlpha === true;
                const hasAnyAlpha = tex.hasAlpha === true;


                if (hasGradientAlpha) {
                    // Frosted glass or other semi-transparent surface (ARGB4444)
                    mat.diffuseTexture.hasAlpha = true;
                    mat.useAlphaFromDiffuseTexture = true;
                    mat.transparencyMode = BABYLON.StandardMaterial.MATERIAL_ALPHABLEND;

                    // Sorting Fixes: 
                    // 1. DISABLE depth pre-pass. It's meant for single objects but breaks
                    //    overlapping transparency by writing to depth and blocking things behind.
                    mat.needDepthPrePass = false;

                    // 2. Enable separate culling pass. This renders backfaces then frontfaces.
                    //    This solves the 'internal' sorting of the glass without blocking the 'external' world.
                    mat.separateCullingPass = true;
                    mat.backFaceCulling = false;
                    mat.twoSidedLighting = true;

                    // ADJUST TRANSPARENCY HERE (0.0 = invisible, 1.0 = texture default)
                    mat.alpha = 0.7;
                    subMesh.alphaIndex = 1000; // Render far after opaque world

                } else if (hasAnyAlpha) {
                    // 1-bit alpha (punch-through transparency like fences, graffiti, ARGB1555)
                    mat.diffuseTexture.hasAlpha = true;
                    mat.useAlphaFromDiffuseTexture = true;
                    mat.transparencyMode = BABYLON.StandardMaterial.MATERIAL_ALPHATESTANDBLEND;
                    mat.alphaCutOff = 0.5;
                    mat.backFaceCulling = false;
                    mat.twoSidedLighting = true;

                    // Restore full visibility for detail decals
                    mat.alpha = 1.0;
                    // Prevent z-fighting with the wall behind the graffiti
                    mat.zOffset = -1.0;

                    subMesh.alphaIndex = 500; // Render between opaque and blended
                } else {
                    // Fully opaque solid part (RGB565 - no alpha at all)
                    mat.diffuseTexture.hasAlpha = false;
                    mat.useAlphaFromDiffuseTexture = false;
                    mat.transparencyMode = BABYLON.StandardMaterial.MATERIAL_OPAQUE;

                    // TWO-TIER Z-FIGHTING TIE-BREAKER:
                    // Tier 1 (fileIndex * 0.01): Separates meshes across different MT5 files
                    //   e.g. Dojo exterior (file 0) vs interior (file 1) get different bases.
                    // Tier 2 (meshCounter * 0.0001): Separates sub-meshes within the same file
                    //   e.g. Summer vs Winter ground in MAP.MT5 get fine-grained offsets.
                    mat.zOffset = -((this.fileIndex * 0.01) + (this.meshCounter++ * 0.0001));
                }

                subMesh.material = mat;
                subMesh.parent = rootMesh;

                // Only enable vertex alpha for transparent surfaces
                // Vertex alpha being used for opaque surfaces makes them black
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
                while (reader.tell() < nodeEnd - 4) {
                    if (reader.readString(4) === "PVRT") {
                        const pvrLen = reader.readUInt32();
                        const pvrBuffer = reader.buffer.slice(reader.tell(), reader.tell() + pvrLen);
                        const decoder = new PvrDecoder(pvrBuffer);
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
                        texCounter++;
                        if (texCounter >= nbTex) break;
                        continue;
                    }
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
                const pvrBuffer = reader.buffer.slice(reader.tell(), reader.tell() + pvrLen);
                const decoder = new PvrDecoder(pvrBuffer);
                const tex = decoder.decode(this.scene);
                if (tex) this.textureCache.set(texCounter, tex);
                texCounter++;
            }
            reader.seek(nodeEnd);
        }

        // Final step: Match IDs from the Scene Pack
        if (secondaryReader && nameRequests.length > 0) {
            const secondaryView = new DataView(secondaryReader.buffer);

            let matchCount = 0;
            nameRequests.forEach((req, reqIdx) => {
                const reqView = new DataView(req.id.buffer, req.id.byteOffset, 8);
                const reqHi = reqView.getUint32(0, true);
                const reqLo = reqView.getUint32(4, true);

                // Log the first few requests for debugging

                secondaryReader.seek(0);
                let found = false;
                while (secondaryReader.tell() < secondaryReader.size - 12) {
                    const entryPos = secondaryReader.tell();
                    const entryHi = secondaryView.getUint32(entryPos, true);
                    const entryLo = secondaryView.getUint32(entryPos + 4, true);
                    const entryLen = secondaryView.getUint32(entryPos + 8, true);

                    // Sanity check
                    if (entryLen === 0 || entryLen > 0x1000000) {
                        console.warn(`[MT5] Bad entry length at ${entryPos}: ${entryLen}`);
                        break;
                    }

                    secondaryReader.seek(entryPos + 12);

                    if (entryHi === reqHi && entryLo === reqLo) {
                        const start = secondaryReader.tell();
                        const pvrBuffer = secondaryReader.buffer.slice(start, start + entryLen);
                        const decoder = new PvrDecoder(pvrBuffer);
                        const tex = decoder.decode(this.scene);
                        if (tex) {
                            this.textureCache.set(req.index, tex);
                            matchCount++;
                            found = true;
                        }
                        break;
                    }
                    secondaryReader.skip(entryLen);
                }

            });
        }
    }
}

