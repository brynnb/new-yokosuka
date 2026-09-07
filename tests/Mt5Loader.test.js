import assert from "node:assert/strict";
import test from "node:test";

import * as BABYLON from "@babylonjs/core";
import { BinaryReader } from "../src/BinaryReader.js";
import {
    Mt5AlphaToCoverageMaterial,
    Mt5Loader,
} from "../src/Mt5Loader.js";

function assertVectorClose(actual, expected, epsilon = 1e-6) {
    for (let index = 0; index < expected.length; index++) {
        assert.ok(
            Math.abs(actual[index] - expected[index]) <= epsilon,
            `axis ${index}: expected ${expected[index]}, received ${actual[index]}`,
        );
    }
}

test("preserves yaw-only MT5 transforms when reflecting into browser space", () => {
    const yaw = 140.9490966796875 * Math.PI / 180;
    const matrix = BABYLON.Matrix.FromArray(Mt5Loader.browserTransformMatrix({
        rot: { x: 0, y: yaw, z: 0 },
        scl: { x: 1, y: 1, z: 1 },
        pos: { x: -39.0079689, y: 2.504884, z: 61.9965439 },
    }));
    const scaling = new BABYLON.Vector3();
    const rotation = new BABYLON.Quaternion();
    const position = new BABYLON.Vector3();

    matrix.decompose(scaling, rotation, position);

    assertVectorClose(position.asArray(), [39.0079689, 2.504884, 61.9965439]);
    assertVectorClose(scaling.asArray(), [1, 1, 1]);
    const forward = BABYLON.Vector3.TransformNormal(
        BABYLON.Axis.Z,
        BABYLON.Matrix.Compose(scaling, rotation, position),
    ).normalize();
    assertVectorClose(
        forward.asArray(),
        [-Math.sin(yaw), 0, Math.cos(yaw)],
    );
});

test("uses native X-Y-Z order for the multi-axis Yamanose rail transform", () => {
    const toRadians = (degrees) => degrees * Math.PI / 180;
    const matrix = BABYLON.Matrix.FromArray(Mt5Loader.browserTransformMatrix({
        rot: {
            x: toRadians(120.0201416015625),
            y: toRadians(102.293701171875),
            z: toRadians(125.6396484375),
        },
        scl: { x: 1, y: 1, z: 1 },
        pos: { x: -32.9479752, y: 4.1322432, z: 73.1695251 },
    }));
    const scaling = new BABYLON.Vector3();
    const rotation = new BABYLON.Quaternion();
    const position = new BABYLON.Vector3();

    matrix.decompose(scaling, rotation, position);

    const up = BABYLON.Vector3.TransformNormal(
        BABYLON.Axis.Y,
        BABYLON.Matrix.Compose(scaling, rotation, position),
    ).normalize();
    assertVectorClose(up.asArray(), [0.086353, 0.979058, -0.184359], 1e-4);
    const tilt = Math.acos(up.y) * 180 / Math.PI;
    assert.ok(tilt > 11 && tilt < 13);
});

test("builds placed-model quaternions in explicit source rotation order", () => {
    const toRadians = (degrees) => degrees * Math.PI / 180;
    const rotation = Mt5Loader.sourceOrderQuaternion(
        toRadians(120.0201416015625),
        toRadians(-102.293701171875),
        toRadians(-125.6396484375),
    );
    const up = BABYLON.Vector3.TransformNormal(
        BABYLON.Axis.Y,
        BABYLON.Matrix.Compose(
            BABYLON.Vector3.One(),
            rotation,
            BABYLON.Vector3.Zero(),
        ),
    ).normalize();

    assertVectorClose(up.asArray(), [0.086353, 0.979058, -0.184359], 1e-4);
});

test("finds cross-node character seam vertices within source-space tolerance", () => {
    const vertices = [
        { nodeIndex: 0, sourcePosition: [1, 2, 3], id: "a" },
        { nodeIndex: 0, sourcePosition: [1, 2, 3], id: "a-duplicate" },
        { nodeIndex: 1, sourcePosition: [1.000004, 2, 3], id: "b" },
        { nodeIndex: 2, sourcePosition: [4, 5, 6], id: "unrelated" },
        { nodeIndex: 2, sourcePosition: [4, 5, 6], id: "same-node-only" },
    ];

    const groups = Mt5Loader.findCharacterRigSeamGroups(vertices, 1e-5);

    assert.equal(groups.length, 1);
    assert.deepEqual(groups[0].map((vertex) => vertex.id), [
        "a",
        "a-duplicate",
        "b",
    ]);
});

test("does not weld coincident vertices on sibling character limbs", () => {
    const vertices = [
        { nodeIndex: 1, sourcePosition: [0, -1, 0], id: "left-leg" },
        { nodeIndex: 2, sourcePosition: [0, -1, 0], id: "right-leg" },
    ];
    const parentByNode = [null, 0, 0];
    const groups = Mt5Loader.findCharacterRigSeamGroups(
        vertices,
        1e-5,
        (left, right) => (
            parentByNode[left] === right || parentByNode[right] === left
        ),
    );

    assert.deepEqual(groups, []);
});

test("welds duplicated cross-node seam positions to one blended boundary", () => {
    const engine = new BABYLON.NullEngine();
    const scene = new BABYLON.Scene(engine);
    const loader = new Mt5Loader(scene, { characterRigSeamMode: "weld" });
    const left = new BABYLON.Mesh("left", scene);
    const right = new BABYLON.Mesh("right", scene);
    left.setVerticesData(
        BABYLON.VertexBuffer.PositionKind,
        [0, 0, 0, 0, 1, 0, 0, 0, 1],
    );
    right.setVerticesData(
        BABYLON.VertexBuffer.PositionKind,
        [2, 0, 0, 2, 1, 0, 2, 0, 1],
    );
    left.setVerticesData(
        BABYLON.VertexBuffer.NormalKind,
        [0, 0, 1, 0, 0, 1, 0, 0, 1],
    );
    right.setVerticesData(
        BABYLON.VertexBuffer.NormalKind,
        [0, 1, 0, 0, 1, 0, 0, 1, 0],
    );
    left.setIndices([0, 1, 2]);
    right.setIndices([0, 1, 2]);
    const modelRoot = {
        _mt5CharacterRigSeamGroups: [[
            { nodeIndex: 0, child: left, vertexIndex: 0 },
            { nodeIndex: 1, child: right, vertexIndex: 0 },
        ]],
    };

    loader.weldCharacterRigSeams(modelRoot, []);

    assert.deepEqual(
        left.getVerticesData(BABYLON.VertexBuffer.PositionKind).slice(0, 3),
        [1, 0, 0],
    );
    assert.deepEqual(
        right.getVerticesData(BABYLON.VertexBuffer.PositionKind).slice(0, 3),
        [1, 0, 0],
    );
    const blendedNormal = Math.SQRT1_2;
    for (const mesh of [left, right]) {
        const normal = mesh
            .getVerticesData(BABYLON.VertexBuffer.NormalKind)
            .slice(0, 3);
        assert.ok(Math.abs(normal[0]) < 1e-12);
        assert.ok(Math.abs(normal[1] - blendedNormal) < 1e-12);
        assert.ok(Math.abs(normal[2] - blendedNormal) < 1e-12);
    }
    assert.deepEqual(
        left.getVerticesData(BABYLON.VertexBuffer.NormalKind).slice(3, 6),
        [0, 0, 1],
    );
    assert.ok(
        left.getVerticesData(BABYLON.VertexBuffer.NormalKind)
            .every(Number.isFinite),
    );
    engine.dispose();
});

test("GPU character rigs deform bind vertices with controller matrices", () => {
    const engine = new BABYLON.NullEngine();
    const scene = new BABYLON.Scene(engine);
    const loader = new Mt5Loader(scene, {
        characterRigMode: "gpu",
        characterRigSeamMode: "weld",
    });
    const modelRoot = new BABYLON.TransformNode("character", scene);
    const nodeRoot = new BABYLON.TransformNode("node", scene);
    const mesh = new BABYLON.Mesh("piece", scene);
    mesh.parent = nodeRoot;
    mesh.setVerticesData(
        BABYLON.VertexBuffer.PositionKind,
        [0, 0, 0, 1, 0, 0, 0, 1, 0],
    );
    mesh.setVerticesData(
        BABYLON.VertexBuffer.NormalKind,
        [0, 0, 1, 0, 0, 1, 0, 0, 1],
    );
    mesh.setIndices([0, 1, 2]);
    mesh._mt5SourcePositions = [0, 0, 0, 1, 0, 0, 0, 1, 0];
    mesh._mt5SourceNormals = [0, 0, 1, 0, 0, 1, 0, 0, 1];
    const node = {
        addr: 1,
        parentAddr: 0,
        flag: 1,
        rot: { x: 0, y: 0, z: 0 },
        scl: { x: 1, y: 1, z: 1 },
        pos: { x: 2, y: 0, z: 0 },
        mesh: nodeRoot,
    };
    modelRoot._mt5Nodes = [node];

    loader.bakeCharacterRigSourceTransforms(modelRoot, [node]);
    loader.createCharacterGpuRig(modelRoot, [node]);
    loader.applyCharacterRigWorldMatrices(
        modelRoot,
        new Map([[1, Mt5Loader.rowTranslation(5, 0, 0)]]),
    );
    const skeleton = modelRoot._mt5CharacterGpuRig.skeleton;
    skeleton.prepare(true);
    const skinMatrix = BABYLON.Matrix.FromArray(
        skeleton.getTransformMatrices(mesh).slice(0, 16),
    );

    assert.equal(mesh.computeBonesUsingShaders, true);
    assert.equal(mesh.skeleton, skeleton);
    assert.equal(mesh.alwaysSelectAsActiveMesh, false);
    assert.deepEqual(
        BABYLON.Vector3.TransformCoordinates(
            new BABYLON.Vector3(2, 0, 0),
            skinMatrix,
        ).asArray(),
        [5, 0, 0],
    );

    loader.applyCharacterRigWorldMatrices(
        modelRoot,
        new Map([[1, Mt5Loader.rowTranslation(8, 0, 0)]]),
    );
    skeleton.prepare(true);
    const nextSkinMatrix = BABYLON.Matrix.FromArray(
        skeleton.getTransformMatrices(mesh).slice(0, 16),
    );
    assert.deepEqual(
        BABYLON.Vector3.TransformCoordinates(
            new BABYLON.Vector3(2, 0, 0),
            nextSkinMatrix,
        ).asArray(),
        [8, 0, 0],
        "a later GPU pose must invalidate and replace the uploaded matrix",
    );
    assert.deepEqual(
        loader.characterRigBoundsForWorldMatrices(
            modelRoot,
            new Map([[1, Mt5Loader.rowTranslation(8, 0, 0)]]),
        ),
        {
            minimum: [8, 0, 0],
            maximum: [9, 1, 0],
        },
    );
    assert.deepEqual(
        mesh.getBoundingInfo().boundingBox.minimum.asArray(),
        [8, 0, 0],
    );
    assert.deepEqual(
        mesh.getBoundingInfo().boundingBox.maximum.asArray(),
        [9, 1, 0],
    );

    // Applying a pose only changes bone matrices; the uploaded bind vertices
    // remain immutable.
    assert.deepEqual(
        mesh.getVerticesData(BABYLON.VertexBuffer.PositionKind),
        [2, 0, 0, 3, 0, 0, 2, 1, 0],
    );

    scene.dispose();
    engine.dispose();
});

test("GPU character rigs give both sides of a seam identical influences", () => {
    const engine = new BABYLON.NullEngine();
    const scene = new BABYLON.Scene(engine);
    const loader = new Mt5Loader(scene, {
        characterRigMode: "gpu",
        characterRigSeamMode: "weld",
    });
    const modelRoot = new BABYLON.TransformNode("character", scene);
    const nodes = [0, 1].map((index) => {
        const nodeRoot = new BABYLON.TransformNode(`node_${index}`, scene);
        const mesh = new BABYLON.Mesh(`piece_${index}`, scene);
        const sourcePositions = index === 0
            ? [0, 0, 0, 1, 0, 0, 0, 1, 0]
            : [0, 0, 0, 1, 0, 0, 0, 2, 0];
        mesh.parent = nodeRoot;
        mesh.setVerticesData(
            BABYLON.VertexBuffer.PositionKind,
            sourcePositions,
        );
        mesh.setVerticesData(
            BABYLON.VertexBuffer.NormalKind,
            [0, 0, 1, 0, 0, 1, 0, 0, 1],
        );
        mesh.setIndices([0, 1, 2]);
        mesh._mt5SourcePositions = sourcePositions;
        mesh._mt5SourceNormals = [0, 0, 1, 0, 0, 1, 0, 0, 1];
        return {
            addr: index + 1,
            parentAddr: index === 0 ? 0 : 1,
            flag: index + 1,
            rot: { x: 0, y: 0, z: 0 },
            scl: { x: 1, y: 1, z: 1 },
            pos: { x: 0, y: 0, z: 0 },
            mesh: nodeRoot,
        };
    });
    modelRoot._mt5Nodes = nodes;

    loader.bakeCharacterRigSourceTransforms(modelRoot, nodes);
    loader.buildCharacterRigSeamGroups(modelRoot, nodes);
    loader.createCharacterGpuRig(modelRoot, nodes);

    for (const node of nodes) {
        const mesh = node.mesh.getChildren()[0];
        const indices = mesh.getVerticesData(
            BABYLON.VertexBuffer.MatricesIndicesKind,
        );
        const weights = mesh.getVerticesData(
            BABYLON.VertexBuffer.MatricesWeightsKind,
        );
        assert.equal(mesh.numBoneInfluencers, 2);
        assert.deepEqual(
            Array.from(indices.slice(0, 4)),
            [0, 1, 0, 0],
        );
        assert.deepEqual(
            Array.from(weights.slice(0, 4)),
            [0.5, 0.5, 0, 0],
        );
        assert.deepEqual(Array.from(weights.slice(4, 8)), [0.5, 0.5, 0, 0]);
        assert.deepEqual(Array.from(weights.slice(8, 12)), [1, 0, 0, 0]);
    }

    const merged = loader.mergeCharacterGpuRigMeshes(modelRoot);
    assert.equal(merged.length, 1);
    assert.equal(merged[0].getTotalVertices(), 6);
    assert.equal(
        merged[0].skeleton,
        modelRoot._mt5CharacterGpuRig.skeleton,
    );
    assert.equal(merged[0].numBoneInfluencers, 2);
    assert.equal(merged[0].parent, modelRoot);
    assert.deepEqual(
        Array.from(merged[0].getVerticesData(
            BABYLON.VertexBuffer.MatricesWeightsKind,
        ).slice(0, 8)),
        [0.5, 0.5, 0, 0, 0.5, 0.5, 0, 0],
    );

    scene.dispose();
    engine.dispose();
});

test("keeps native UV order for HUMANS TWIDDLED_RECT textures", () => {
    const loader = new Mt5Loader(null, { textureCoordinateMode: "viewer" });
    loader.textureCache.set(3, { _pvrDataFormat: 0x0d });
    loader.textureCache.set(4, { _pvrDataFormat: 0x01 });
    const point = {
        u: 0.25,
        v: 0.75,
        mirrorU: false,
        mirrorV: false,
    };

    assert.deepEqual(loader.mapUV(point, 3, null, null), [0.25, 0.75]);
    assert.deepEqual(loader.mapUV(point, 4, null, null), [0.75, 0.25]);
});

test("preserves authored MT5 coordinates for post-interpolation sampler wrapping", () => {
    const loader = new Mt5Loader(null);
    loader.textureCache.set(0, { _pvrDataFormat: 0x01 });

    assert.deepEqual(
        loader.mapUV(
            { u: 0.25, v: 0.5, mirrorU: true, mirrorV: false },
            0,
            null,
            null,
        ),
        [0.5, 0.25],
    );
    assert.deepEqual(
        loader.mapUV(
            { u: 2, v: 1, mirrorU: true, mirrorV: false },
            0,
            null,
            null,
        ),
        [1, 2],
    );
});

test("maps MT5 mirror flags to independent GPU sampler axes", () => {
    const loader = new Mt5Loader(null, { textureAddressMode: "repeat" });
    loader.textureCache.set(0, { _pvrDataFormat: 0x01 });
    loader.textureCache.set(1, { _pvrDataFormat: 0x0d });

    assert.deepEqual(
        loader.addressModesForTexture(0, true, false),
        { u: "repeat", v: "mirror" },
    );
    assert.deepEqual(
        loader.addressModesForTexture(0, false, true),
        { u: "mirror", v: "repeat" },
    );
    assert.deepEqual(
        loader.addressModesForTexture(1, true, false),
        { u: "mirror", v: "repeat" },
    );
});

test("applies 0x000e BGRA material colour to strips without vertex colours", () => {
    const bytes = new Uint8Array(40);
    const view = new DataView(bytes.buffer);
    let offset = 0;
    const u16 = (value) => {
        view.setUint16(offset, value, true);
        offset += 2;
    };

    u16(0x000e);
    u16(8);
    bytes.set([0x00, 0xa8, 0x00, 0xff, 0, 0, 0, 0xff], offset);
    offset += 8;
    u16(0x0011);
    u16(22);
    u16(1);
    u16(3);
    for (const [index, u, v] of [[0, 0, 0], [1, 256, 0], [2, 0, 256]]) {
        u16(index);
        u16(u);
        u16(v);
    }
    u16(0x8000);

    const polygons = new Mt5Loader(null).readPolygons(
        new BinaryReader(bytes.buffer),
        0,
        3,
    );

    assert.equal(polygons.length, 1);
    assert.deepEqual(polygons[0].materialColor, [0, 168 / 255, 0, 1]);
    assert.deepEqual(polygons[0].strips[0][0].color, [0, 168 / 255, 0, 1]);
});

test("alpha-to-coverage MT5 billboards preserve alpha without blend sorting", () => {
    const engine = new BABYLON.NullEngine();
    const scene = new BABYLON.Scene(engine);
    const loader = new Mt5Loader(scene);
    const mesh = new BABYLON.Mesh("alpha_billboard", scene);
    const material = new Mt5AlphaToCoverageMaterial(
        "alpha_coverage_material",
        scene,
    );
    material.transparencyMode = BABYLON.Material.MATERIAL_ALPHABLEND;
    material._mt5PreservesAlphaForCoverage = true;
    mesh.material = material;

    assert.equal(loader.configureAlphaToCoverage(mesh, "blend"), false);
    assert.equal(loader.configureAlphaToCoverage(mesh, "alphatest"), true);
    assert.equal(material.needAlphaBlending(), false);
    assert.equal(material.needAlphaBlendingForMesh(mesh), false);
    assert.equal(material.needAlphaTestingForMesh(mesh), false);
    assert.equal(engine.getAlphaToCoverage(), false);

    mesh.onBeforeBindObservable.notifyObservers(mesh);
    assert.equal(engine.getAlphaToCoverage(), true);
    mesh.onAfterRenderObservable.notifyObservers(mesh);
    assert.equal(engine.getAlphaToCoverage(), false);

    const fallback = new BABYLON.Mesh("fallback_billboard", scene);
    fallback.material = new BABYLON.StandardMaterial("fallback", scene);
    assert.equal(
        loader.configureAlphaToCoverage(fallback, "alphatest"),
        false,
    );

    engine.dispose();
});

test("alpha-to-coverage texture decoding keeps naturally filtered alpha", () => {
    const engine = new BABYLON.NullEngine();
    Object.defineProperty(engine, "currentSampleCount", { value: 4 });
    const scene = new BABYLON.Scene(engine);
    const loader = new Mt5Loader(scene);
    let decodeOptions = null;

    loader.decodePvrTexture({
        decode(_scene, options) {
            decodeOptions = options;
            return null;
        },
    });

    assert.equal(loader.supportsAlphaToCoverage(), true);
    assert.equal(decodeOptions.preserveAlphaTestCoverage, false);
    engine.dispose();
});

test("ranks later coplanar overlay textures in front of their backing surface", () => {
    const vertices = [
        { pos: [0, 0, 0] },
        { pos: [2, 0, 0] },
        { pos: [0, 2, 0] },
        { pos: [0.25, 0.25, 0] },
        { pos: [1.25, 0.25, 0] },
        { pos: [0.25, 1.25, 0] },
    ];
    const polygons = [
        { texId: 4, strips: [[{ idx: 0 }, { idx: 1 }, { idx: 2 }]] },
        { texId: 9, strips: [[{ idx: 3 }, { idx: 4 }, { idx: 5 }]] },
    ];

    const ranks = Mt5Loader.coplanarOverlayTextureRanks(polygons, vertices);

    assert.equal(ranks.get(4), 0);
    assert.equal(ranks.get(9), 1);
});

test("does not bias coplanar triangles which only share an edge", () => {
    const vertices = [
        { pos: [0, 0, 0] },
        { pos: [1, 0, 0] },
        { pos: [0, 1, 0] },
        { pos: [1, 1, 0] },
    ];
    const polygons = [
        { texId: 2, strips: [[{ idx: 0 }, { idx: 1 }, { idx: 2 }]] },
        { texId: 3, strips: [[{ idx: 1 }, { idx: 3 }, { idx: 2 }]] },
    ];

    const ranks = Mt5Loader.coplanarOverlayTextureRanks(polygons, vertices);

    assert.equal(ranks.size, 0);
});

test("does not collapse intentionally separated facade layers", () => {
    const vertices = [
        { pos: [0, 0, 0] },
        { pos: [2, 0, 0] },
        { pos: [0, 2, 0] },
        { pos: [0.25, 0.25, 0.002] },
        { pos: [1.25, 0.25, 0.002] },
        { pos: [0.25, 1.25, 0.002] },
    ];
    const polygons = [
        { texId: 3, strips: [[{ idx: 0 }, { idx: 1 }, { idx: 2 }]] },
        { texId: 17, strips: [[{ idx: 3 }, { idx: 4 }, { idx: 5 }]] },
    ];

    const ranks = Mt5Loader.coplanarOverlayTextureRanks(
        polygons,
        vertices,
        0.0005,
    );

    assert.equal(ranks.size, 0);
});
