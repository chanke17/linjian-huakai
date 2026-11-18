import * as THREE from 'three';
import { rng, noise2, pathX, streamZ, terrainH, crossing, WATER_Y, TREE } from './terrain.js';
import { V3, col, finalize, lumpy, limb, mergeGeometries, placeInstances } from './geo.js';
import { uberMat, groundMat, waterMat, skyMat } from './materials.js';
import { buildForest, buildBlossomTree } from './trees.js';

function bladeGeo() {
  const segs = 4, pos = [], cols = [];
  const base = col(0.20, 0.36, 0.15), tip = col(0.62, 0.76, 0.33);
  const row = (i) => { const t = i / segs; const w = 0.05 * (1 - t * 0.92); return [[-w, t, t * t * 0.22], [w, t, t * t * 0.22], t]; };
  for (let i = 0; i < segs; i++) {
    const [a0, b0, t0] = row(i), [a1, b1, t1] = row(i + 1);
    for (const [v, t] of [[a0, t0], [b0, t0], [a1, t1], [b0, t0], [b1, t1], [a1, t1]]) {
      pos.push(...v);
      const c = base.clone().lerp(tip, t);
      cols.push(c.r, c.g, c.b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const n = new THREE.Vector3(0, 1, 0.35).normalize();
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length / 3).fill(0).flatMap(() => [n.x, n.y, n.z]), 3));
  g.setAttribute('aCol', new THREE.Float32BufferAttribute(cols, 3));
  g.setAttribute('aTint', new THREE.Float32BufferAttribute(new Array(pos.length / 3).fill(1), 1));
  return g;
}

function flowerGeo() {
  const green = col(0.28, 0.48, 0.2);
  const parts = [finalize(limb(V3(0, 0, 0), V3(0.01, 0.27, 0), 0.007, 0.005, 4), green, 0)];
  const leaf = new THREE.SphereGeometry(0.045, 6, 4);
  leaf.scale(1, 0.18, 0.4); leaf.rotateZ(0.5); leaf.translate(0.035, 0.07, 0);
  parts.push(finalize(leaf, green, 0));
  for (let k = 0; k < 5; k++) {
    const pg = new THREE.CircleGeometry(0.034, 7);
    pg.scale(0.62, 1, 1);
    pg.translate(0, 0.03, 0);
    pg.rotateX(-Math.PI / 2 + 0.35);
    pg.rotateY((k * Math.PI * 2) / 5);
    pg.translate(0.01, 0.275, 0);
    parts.push(finalize(pg, col(1, 1, 1), 1));
  }
  const c = new THREE.SphereGeometry(0.014, 6, 4);
  c.translate(0.01, 0.285, 0);
  parts.push(finalize(c, col(0.98, 0.84, 0.32), 0));
  return mergeGeometries(parts);
}

export function buildWorld(scene) {
  const R = rng(3);
  const C = crossing();

  // 天空
  const sky = new THREE.Mesh(new THREE.SphereGeometry(320, 32, 16), skyMat());
  sky.renderOrder = -10;
  sky.frustumCulled = false;
  scene.add(sky);

  // 地面
  const gg = new THREE.PlaneGeometry(120, 125, 240, 250);
  gg.rotateX(-Math.PI / 2);
  gg.translate(0, 0, -15);
  const gp = gg.attributes.position;
  for (let i = 0; i < gp.count; i++) gp.setY(i, terrainH(gp.getX(i), gp.getZ(i)));
  gg.computeVertexNormals();
  scene.add(new THREE.Mesh(gg, groundMat()));

  // 过河的石头
  const stones = [];
  for (let k = 0; k < 6; k++) {
    const z = C.z + 1.95 - k * 0.78;
    const r = 0.34 + R() * 0.08;
    stones.push({ x: pathX(z) + (R() - 0.5) * 0.25, z, r, y: -0.5, sy: 0.5, top: -0.5 + 0.5 * 0.98 });
  }
  const rocks = stones.map((s) => ({ x: s.x, y: s.y, z: s.z, s: s.r / 0.92, sy: s.sy / (s.r / 0.92), sz: 0.9, ry: R() * 6 }));
  for (let i = 0; i < 300 && rocks.length < 40; i++) {
    const x = C.x + (R() - 0.5) * 50;
    const z = streamZ(x) + (R() < 0.5 ? -1 : 1) * (1.9 + R() * 1.0);
    if (Math.abs(x - pathX(z)) < 1.6) continue;
    const s = 0.15 + R() * 0.3;
    rocks.push({ x, y: terrainH(x, z) - s * 0.2, z, s, sy: 0.6, ry: R() * 6 });
  }
  const rockGeo = finalize(lumpy(1, 2, 7.7, 0.15, 0.9), (v, n) => col(0.56, 0.57, 0.53).lerp(col(0.44, 0.56, 0.30), Math.max(0, n.y - 0.55) * 1.2), 1);
  const rockMesh = new THREE.InstancedMesh(rockGeo, uberMat(), rocks.length);
  placeInstances(rockMesh, rocks, () => col(0.92 + R() * 0.16, 0.92 + R() * 0.14, 0.92 + R() * 0.12));
  rockMesh.frustumCulled = false;
  scene.add(rockMesh);

  // 溪水：一条沿溪线弯曲的水面
  const wg = new THREE.PlaneGeometry(130, 6.4, 260, 4);
  wg.rotateX(-Math.PI / 2);
  const wp = wg.attributes.position;
  for (let i = 0; i < wp.count; i++) { wp.setZ(i, wp.getZ(i) + streamZ(wp.getX(i))); wp.setY(i, WATER_Y); }
  scene.add(new THREE.Mesh(wg, waterMat(stones.map((s) => ({ x: s.x, z: s.z, r: s.r * 0.95 })))));

  // 草
  const blades = [];
  for (let i = 0; i < 250000 && blades.length < 16000; i++) {
    const z = -36 + R() * 72;
    const off = (R() - 0.5) * 2 * (1.2 + Math.pow(R(), 0.8) * 13);
    const x = pathX(z) + off;
    if (Math.abs(off) < 1.05 || Math.abs(z - streamZ(x)) < 2.0) continue;
    if (noise2(x * 0.35, z * 0.35) < -0.2 && R() < 0.65) continue;
    blades.push({ x, y: terrainH(x, z) - 0.03, z, s: 0.3 + R() * 0.38, sx: 0.8 + R() * 0.8, ry: R() * 6.28, tx: (R() - 0.5) * 0.3 });
  }
  const grass = new THREE.InstancedMesh(bladeGeo(), uberMat({ wind: 0.12, noflip: true, grass: true, side: THREE.DoubleSide }), blades.length);
  placeInstances(grass, blades, () => col(0.85 + R() * 0.3, 0.88 + R() * 0.24, 0.8 + R() * 0.3));
  grass.frustumCulled = false;
  scene.add(grass);

  // 蓝花（以及远处零星的白花、黄花）
  const blues = [col(0.24, 0.42, 0.86), col(0.34, 0.54, 0.95), col(0.47, 0.65, 0.98), col(0.30, 0.35, 0.82), col(0.52, 0.48, 0.90), col(0.62, 0.74, 0.98)];
  const others = [col(0.98, 0.97, 0.94), col(0.98, 0.86, 0.36), col(0.97, 0.78, 0.86)];
  const fl = [];
  const g = () => (R() + R() + R() - 1.5) / 1.5;
  function cluster(cx, cz, n, spread, palette) {
    for (let k = 0; k < n; k++) {
      const x = cx + g() * spread, z = cz + g() * spread;
      if (Math.abs(x - pathX(z)) < 1.15 || Math.abs(z - streamZ(x)) < 2.05) continue;
      fl.push({ x, y: terrainH(x, z) - 0.02, z, s: 1.3 + R() * 0.9, ry: R() * 6.28, tx: (R() - 0.5) * 0.25, tz: (R() - 0.5) * 0.25, c: palette[Math.floor(R() * palette.length)] });
    }
  }
  for (let z = 17; z > C.z + 2.4; z -= 0.9)
    for (const side of [-1, 1]) if (R() < 0.75) cluster(pathX(z) + side * (1.5 + R() * 3.2), z + (R() - 0.5), 6 + Math.floor(R() * 10), 0.6, blues);
  for (let x = C.x - 22; x < C.x + 22; x += 1.1)
    for (const side of [-1, 1]) if (R() < 0.7) cluster(x, streamZ(x) + side * (2.4 + R() * 0.9), 5 + Math.floor(R() * 8), 0.45, blues);
  for (let i = 0; i < 46; i++) {
    const z = -25 + R() * 23;
    cluster(pathX(z) + (R() < 0.5 ? -1 : 1) * (1.6 + R() * 7), z, 5 + Math.floor(R() * 8), 0.7, R() < 0.55 ? blues : others);
  }
  const flowers = new THREE.InstancedMesh(flowerGeo(), uberMat({ flower: true, wind: 0.35, side: THREE.DoubleSide }), fl.length);
  placeInstances(flowers, fl, (it) => it.c);
  flowers.frustumCulled = false;
  scene.add(flowers);

  const colliders = buildForest(scene);
  const tree = buildBlossomTree(scene);
  colliders.push({ x: tree.base.x, z: tree.base.z, r: 0.6, h: 4 });
  for (const rk of rocks.slice(stones.length)) colliders.push({ x: rk.x, z: rk.z, r: rk.s * 0.8, h: rk.s });

  return { sky, stones, crossing: C, tree, colliders };
}
