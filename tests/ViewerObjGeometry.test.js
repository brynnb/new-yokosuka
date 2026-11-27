import assert from "node:assert/strict";
import test from "node:test";
import {
  Material, Mesh, MultiMaterial, NullEngine, Scene,
  StandardMaterial, SubMesh, TransformNode, Vector3, VertexData,
} from "@babylonjs/core";
import { collectViewerObjMaterials, createViewerObjGeometry } from "../src/ViewerObjGeometry.js";

function fixture(t, rightHanded = false) {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  scene.useRightHandedSystem = rightHanded;
  t.after(() => { scene.dispose(); engine.dispose(); });
  return scene;
}

function addMesh(scene, name, {uv = true, normals = true, colors = false} = {}) {
  const mesh = new Mesh(name, scene);
  const data = new VertexData();
  data.positions = [0, 0, 0, 1, 0, 0, 0, 1, 0];
  data.indices = [0, 1, 2];
  if (uv) data.uvs = [-1, 2, 1, 0, 0, 1];
  if (normals) data.normals = Array.from({length: 3}, () => [1, 1, 0]).flat();
  if (colors) data.colors = [1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1];
  data.applyToMesh(mesh);
  return mesh;
}

const lines = (obj, prefix) => obj.trimEnd().split("\n").filter(line => line.startsWith(prefix + " "));

test("OBJ matches material uses across files, submeshes and independently indexed attributes", t => {
  const scene = fixture(t);
  const alpha = addMesh(scene, "first");
  alpha._filename = "A.MT5";
  const mat = new StandardMaterial("mt5_mat_0", scene);
  const other = new StandardMaterial("mt5_mat_0", scene);
  const multi = new MultiMaterial("Multi", scene);
  multi.subMaterials = [mat, other];
  alpha.material = multi;
  alpha.setIndices([0, 1, 2, 2, 1, 0]);
  alpha.releaseSubMeshes();
  new SubMesh(0, 0, 3, 0, 3, alpha);
  new SubMesh(1, 0, 3, 3, 3, alpha);
  const beta = addMesh(scene, "second", {uv: false, normals: false});
  beta._filename = "B.MT5";
  const gamma = addMesh(scene, "third", {uv: false});
  gamma._filename = "C.MT5";
  gamma.material = other;

  const {obj, materials} = createViewerObjGeometry([gamma, beta, alpha], "Dobuita");
  assert.equal(lines(obj, "mtllib")[0], "mtllib Dobuita.mtl");
  assert.deepEqual([...materials.keys()], [mat, other, null]);
  assert.deepEqual(lines(obj, "usemtl"), [mat, other, null, other].map(m => "usemtl " + materials.get(m)));
  assert.deepEqual([...collectViewerObjMaterials([alpha, gamma, beta])], [...materials]);
  assert.deepEqual(lines(obj, "f"), ["f 1/1/1 2/2/2 3/3/3", "f 3/3/3 2/2/2 1/1/1", "f 4 5 6", "f 7//4 8//5 9//6"]);
  assert.equal(lines(obj, "vt")[0], "vt -1 2");
  assert.equal(new Set(materials.values()).size, 3);
});

test("world coordinates and inverse-transpose normals survive mirrored instances without changing the source", t => {
  const scene = fixture(t);
  const mesh = addMesh(scene, "source", {colors: true});
  const mat = new StandardMaterial("mat", scene);
  mat.sideOrientation = Material.ClockWiseSideOrientation;
  mesh.material = mat;
  const parent = new TransformNode("transformed", scene);
  parent.scaling.set(-2, 1, 1);
  parent.position.set(5, 0, 0);
  const copy = mesh.createInstance("instance");
  copy.parent = parent;
  const beforePositions = Array.from(mesh.getVerticesData("position"));
  const beforeNormals = Array.from(mesh.getVerticesData("normal"));
  const {obj} = createViewerObjGeometry([copy], "test", {materials: false});
  assert.deepEqual(lines(obj, "mtllib"), []);
  assert.deepEqual(lines(obj, "usemtl"), []);
  assert.deepEqual(lines(obj, "v"), ["v -5 0 0 1 0 0", "v -3 0 0 0 1 0", "v -5 1 0 0 0 1"]);
  assert.deepEqual(lines(obj, "f"), ["f 1/1/1 2/2/2 3/3/3"]);
  const normal = Vector3.FromArray(lines(obj, "vn")[0].split(" ").slice(1).map(Number));
  assert.ok(Vector3.Distance(normal, new Vector3(0.5, 1, 0).normalize()) < 1e-6);
  assert.deepEqual(Array.from(mesh.getVerticesData("position")), beforePositions);
  assert.deepEqual(Array.from(mesh.getVerticesData("normal")), beforeNormals);
  assert.deepEqual(Array.from(mesh.getIndices()), [0, 1, 2]);
});

test("right-handed unindexed meshes reverse clockwise winding and retain X and UV-only faces", t => {
  const scene = fixture(t, true);
  const mesh = addMesh(scene, "mesh", {normals: false});
  mesh.isUnIndexed = true;
  mesh.setIndices([2, 0, 1]);
  const {obj} = createViewerObjGeometry([mesh], "mesh");
  assert.equal(lines(obj, "v")[1], "v 1 0 0");
  assert.deepEqual(lines(obj, "f"), ["f 1/1 3/3 2/2"]);
  assert.deepEqual([...collectViewerObjMaterials([])], []);
  assert.throws(() => createViewerObjGeometry([], "empty"), /No exportable geometry/);
});
