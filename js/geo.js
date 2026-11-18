import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { noise3 } from './terrain.js';

export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const col = (r, g, b) => new THREE.Color(r, g, b);
export { mergeGeometries };

// 统一成：非索引 + position/normal/aCol/aTint，方便合并与实例化
export function finalize(geo, color, tint = 0) {
  if (geo.index) geo = geo.toNonIndexed();
  if (geo.attributes.uv) geo.deleteAttribute('uv');
  if (!geo.attributes.normal) geo.computeVertexNormals();
  const p = geo.attributes.position, n = geo.attributes.normal;
  const cols = new Float32Array(p.count * 3);
  const v = new THREE.Vector3(), nn = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    let c = color;
    if (typeof color === 'function') {
      v.fromBufferAttribute(p, i);
      nn.fromBufferAttribute(n, i);
      c = color(v, nn);
    }
    cols[i * 3] = c.r; cols[i * 3 + 1] = c.g; cols[i * 3 + 2] = c.b;
  }
  geo.setAttribute('aCol', new THREE.BufferAttribute(cols, 3));
  geo.setAttribute('aTint', new THREE.BufferAttribute(new Float32Array(p.count).fill(tint), 1));
  return geo;
}

// 圆鼓鼓、带起伏的团块（树冠 / 花团 / 石头）
export function lumpy(r, detail, seed, amp = 0.22, flatBottom = 0.72) {
  let g = new THREE.IcosahedronGeometry(r, detail);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1.4 / r;
    const n = noise3(x * k + seed, y * k, z * k - seed) * 0.75 + noise3(x * k * 2.3 - seed, y * k * 2.3, z * k * 2.3) * 0.25;
    const s = 1 + n * amp;
    p.setXYZ(i, x * s, (y < 0 ? y * flatBottom : y) * s, z * s);
  }
  g.computeVertexNormals();
  return g;
}

// 两点之间的锥形圆柱（树干、树枝、手臂）
export function limb(a, b, r0, r1, seg = 7) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 3, true);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), dir.normalize()));
  g.translate(a.x, a.y, a.z);
  return g;
}

// 把法线往某个中心的放射方向掰一点，让整团树冠像一整块柔软的体积受光
export function fluffNormals(geo, center, k = 0.45) {
  const p = geo.attributes.position, n = geo.attributes.normal;
  const v = new THREE.Vector3(), nn = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).sub(center).normalize();
    nn.fromBufferAttribute(n, i).multiplyScalar(1 - k).addScaledVector(v, k).normalize();
    n.setXYZ(i, nn.x, nn.y, nn.z);
  }
  return geo;
}

export function placeInstances(mesh, items, colorOf) {
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), e = new THREE.Euler();
  items.forEach((it, i) => {
    e.set(it.tx || 0, it.ry || 0, it.tz || 0);
    q.setFromEuler(e);
    s.set(it.s * (it.sx || 1), it.s * (it.sy || 1), it.s * (it.sz || 1));
    m.compose(V3(it.x, it.y, it.z), q, s);
    mesh.setMatrixAt(i, m);
    if (colorOf) mesh.setColorAt(i, colorOf(it, i));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}
