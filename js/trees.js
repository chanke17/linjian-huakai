import * as THREE from 'three';
import { rng, pathX, streamZ, terrainH, TREE, smoothstep, crossing } from './terrain.js';
import { V3, col, finalize, lumpy, limb, fluffNormals, mergeGeometries, placeInstances } from './geo.js';
import { uberMat } from './materials.js';

const mixC = (a, b, t) => a.clone().lerp(b, t);

// 林中的树：圆冠阔叶树 / 高树 / 灌木，每种两个变体，实例化摆放
function treeGeo(kind, seed) {
  const R = rng(seed);
  const trunk = [], blobs = [];
  let center;
  if (kind === 'bush') {
    center = V3(0, 0.55, 0);
    const n = 3 + Math.floor(R() * 3);
    for (let k = 0; k < n; k++) {
      const a = R() * 6.28, d = R() * 0.6, r = 0.5 + R() * 0.45;
      const g = lumpy(r, 2, seed * 7 + k * 3.1, 0.25);
      g.translate(Math.cos(a) * d, r * 0.75 + R() * 0.2, Math.sin(a) * d);
      blobs.push(g);
    }
  } else {
    const tall = kind === 'tall';
    const th = tall ? 5.2 + R() * 1.2 : 2.8 + R() * 0.8;
    const lx = (R() - 0.5) * 0.5, lz = (R() - 0.5) * 0.5;
    const mid = V3(lx * 0.5, th * 0.5, lz * 0.5), top = V3(lx, th, lz);
    trunk.push(limb(V3(0, -0.4, 0), mid, tall ? 0.34 : 0.3, tall ? 0.26 : 0.22), limb(mid, top, tall ? 0.26 : 0.22, 0.15));
    const cr = tall ? 2.0 : 2.3;
    center = V3(top.x, th + cr * 0.55, top.z);
    for (let k = 0; k < 3; k++) {
      const a = R() * 6.28 + k * 2.1;
      const end = V3(top.x + Math.cos(a) * cr * 0.6, th + 0.7 + R() * 0.8, top.z + Math.sin(a) * cr * 0.6);
      trunk.push(limb(top.clone().add(V3(0, -0.3, 0)), end, 0.12, 0.05, 5));
    }
    const n = tall ? 9 : 8;
    for (let k = 0; k < n; k++) {
      const a = R() * 6.28, d = Math.sqrt(R()) * cr * 0.75;
      const y = center.y + (R() - 0.35) * cr * (tall ? 1.1 : 0.8);
      const g = lumpy(cr * (0.42 + R() * 0.25), 2, seed * 5 + k * 1.7, 0.24);
      g.translate(center.x + Math.cos(a) * d, y, center.z + Math.sin(a) * d);
      blobs.push(g);
    }
    const g = lumpy(cr * 0.6, 2, seed + 99, 0.2);
    g.translate(center.x, center.y + cr * 0.45, center.z);
    blobs.push(g);
  }
  const cg = fluffNormals(mergeGeometries(blobs), center, 0.45);
  cg.computeBoundingBox();
  const y0 = cg.boundingBox.min.y, y1 = cg.boundingBox.max.y;
  const dark = kind === 'bush' ? col(0.22, 0.40, 0.17) : col(0.15, 0.31, 0.16);
  const light = kind === 'bush' ? col(0.56, 0.70, 0.30) : col(0.45, 0.64, 0.27);
  const canopy = finalize(cg, (v) => mixC(dark, light, Math.pow(smoothstep(y0, y1, v.y), 0.8)), 1);
  if (!trunk.length) return canopy;
  const tg = finalize(mergeGeometries(trunk), (v) => mixC(col(0.26, 0.19, 0.15), col(0.46, 0.35, 0.25), smoothstep(-0.4, 3, v.y)), 0);
  return mergeGeometries([tg, canopy]);
}

export function buildForest(scene) {
  const R = rng(11);
  const pts = [];
  const far = (x, z, d) => pts.every((p) => (p.x - x) ** 2 + (p.z - z) ** 2 >= d * d);
  for (let i = 0; i < 9000 && pts.length < 230; i++) {
    const z = -72 + R() * 114;
    const off = (R() < 0.5 ? -1 : 1) * (4.4 + Math.pow(R(), 1.3) * 40);
    const x = pathX(z) + off;
    if (x < -50 || x > 50) continue;
    if (Math.abs(off) < (z > 18 ? 7.5 : 4.4)) continue;
    if (Math.abs(z - streamZ(x)) < 3.7) continue;
    if (Math.hypot(x - TREE.x, z - TREE.z) < 11) continue;
    if (!far(x, z, 3.3)) continue;
    pts.push({ x, z, kind: R() < 0.3 ? 'tall' : 'round', v: R() < 0.5 ? 0 : 1, s: 0.85 + R() * 0.55, ry: R() * 6.28 });
  }
  const C = crossing();
  for (let i = 0; i < 5000; i++) {
    const z = -45 + R() * 80;
    const off = (R() < 0.5 ? -1 : 1) * (5.0 + Math.pow(R(), 1.6) * 16);
    const x = pathX(z) + off;
    if (Math.abs(z - streamZ(x)) < 3.0 || Math.hypot(x - TREE.x, z - TREE.z) < 10.5) continue;
    if (z > 19 && Math.abs(off) < 7) continue;
    if (x > C.x && x < C.x + 10 && z > C.z - 5 && z < C.z + 8) continue;   // 过河镜头的机位
    if (!far(x, z, 1.6)) continue;
    pts.push({ x, z, kind: 'bush', v: R() < 0.5 ? 0 : 1, s: 0.7 + R() * 0.7, ry: R() * 6.28 });
    if (pts.filter((p) => p.kind === 'bush').length >= 150) break;
  }
  const treeMat = uberMat({ wind: 0.004, foliage: true });
  const bushMat = uberMat({ wind: 0.02, foliage: true });
  for (const kind of ['round', 'tall', 'bush']) {
    for (const v of [0, 1]) {
      const items = pts.filter((p) => p.kind === kind && p.v === v);
      if (!items.length) continue;
      items.forEach((p) => { p.y = terrainH(p.x, p.z) - 0.05; p.sy = 0.92 + R() * 0.2; });
      const geo = treeGeo(kind, 100 + v * 17 + kind.length * 5);
      const mesh = new THREE.InstancedMesh(geo, kind === 'bush' ? bushMat : treeMat, items.length);
      placeInstances(mesh, items, () => {
        if (R() < 0.12) return col(1.22, 1.1, 0.72);
        return col(1 + (R() - 0.5) * 0.25, 1 + (R() - 0.5) * 0.18, 1 + (R() - 0.5) * 0.3);
      });
      mesh.frustumCulled = false;
      scene.add(mesh);
    }
  }
  // 碰撞圈：树只挡树干，灌木挡整丛
  return pts.map((p) => ({ x: p.x, z: p.z, r: p.kind === 'bush' ? 0.8 * p.s : (p.kind === 'tall' ? 0.36 : 0.32) * p.s, h: p.kind === 'bush' ? 1.6 * p.s : 9 }));
}

// 花树：递归长枝，枝头挂花团。花团用 BLOSSOM 着色器随 uBloom 从花苞胀开
export function buildBlossomTree(scene) {
  const R = rng(5);
  const base = V3(TREE.x, terrainH(TREE.x, TREE.z) - 0.1, TREE.z);
  const segs = [], clumps = [];
  function grow(a, dir, len, rad, depth) {
    const b = a.clone().addScaledVector(dir, len);
    const mid = a.clone().lerp(b, 0.5).add(V3((R() - 0.5) * len * 0.15, (R() - 0.3) * len * 0.1, (R() - 0.5) * len * 0.15));
    segs.push(limb(a, mid, rad, rad * 0.86, 8), limb(mid, b, rad * 0.86, rad * 0.72, 8));
    if (depth === 0) {
      clumps.push({ p: b, r: 0.95 + R() * 0.45 });
      clumps.push({ p: b.clone().add(V3((R() - 0.5) * 1.4, (R() - 0.2) * 0.8, (R() - 0.5) * 1.4)), r: 0.7 + R() * 0.4 });
      return;
    }
    if (depth <= 1) clumps.push({ p: mid.clone().add(V3(0, 0.25, 0)), r: 0.7 + R() * 0.35 });
    const n = depth >= 3 ? 3 : 2 + (R() < 0.4 ? 1 : 0);
    const ph = R() * 6.28;
    for (let k = 0; k < n; k++) {
      const a2 = ph + (k * 6.28) / n + (R() - 0.5) * 0.6;
      const nd = dir.clone().multiplyScalar(0.6)
        .addScaledVector(V3(Math.cos(a2), 0, Math.sin(a2)), depth >= 3 ? 0.85 : 0.6)
        .add(V3(0, depth >= 3 ? 0.25 : 0.35, 0)).normalize();
      grow(b, nd, len * (0.72 + R() * 0.12), rad * 0.66, depth - 1);
    }
  }
  grow(base, V3(0.05, 1, 0.02).normalize(), 3.0, 0.5, 4);

  const trunkGeo = finalize(mergeGeometries(segs), (v) => mixC(col(0.30, 0.21, 0.19), col(0.50, 0.38, 0.32), smoothstep(base.y, base.y + 7, v.y)), 0);
  const trunk = new THREE.Mesh(trunkGeo, uberMat());
  scene.add(trunk);

  const cg = finalize(lumpy(1, 3, 3.3, 0.28), (v) => mixC(col(0.80, 0.70, 0.78), col(1, 1, 1), smoothstep(-1, 0.8, v.y)), 1);
  const mesh = new THREE.InstancedMesh(cg, uberMat({ blossom: true }), clumps.length);
  const pinks = [col(1.0, 0.76, 0.83), col(0.98, 0.69, 0.79), col(1.0, 0.84, 0.88), col(0.99, 0.79, 0.85), col(1.0, 0.91, 0.93)];
  placeInstances(mesh, clumps.map((c) => ({ x: c.p.x, y: c.p.y, z: c.p.z, s: c.r, sy: 0.8, ry: R() * 6.28 })), () => pinks[Math.floor(R() * pinks.length)]);
  mesh.frustumCulled = false;
  scene.add(mesh);
  return { base };
}
