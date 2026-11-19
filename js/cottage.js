import * as THREE from 'three';
import { mergeGeometries } from './geo.js';
import { terrainH, TREE } from './terrain.js';
import { uberMat } from './materials.js';
import { hex, V, box, cyl, ell, torus, part } from './toy.js';

// 花树后面的奶奶家（外观）：木筋墙、瓦片斜顶、拱门、带花箱的小窗。线稿状态下跟着花树的颜色一起染开。
export const COTTAGE = { x: TREE.x + 5.2, z: TREE.z - 5.2, W: 4.2, D: 3.6 };

const C = {
  plaster: hex('#f0e3c4'), timber: hex('#6e4a33'), stone: hex('#a39b90'), stoneD: hex('#8a8379'),
  roofA: hex('#b9573f'), roofB: hex('#a64b37'), door: hex('#8b5735'), doorD: hex('#6d432a'), gold: hex('#d8b25a'),
  glass: hex('#d5e8ea'), shutter: hex('#6f9459'), boxW: hex('#7d5236'), red: hex('#e0545a'), pink: hex('#f2a3b8'), leaf: hex('#5f8f45'),
};

function triPrism(w, h, d) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, 0); s.lineTo(w / 2, 0); s.lineTo(0, h); s.lineTo(-w / 2, 0);
  return new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }).translate(0, 0, -d / 2);
}

export function buildCottage(scene) {
  const { x: cx, z: cz, W, D } = COTTAGE;
  let y0 = -1e9;
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0], [0, 1.3]]) y0 = Math.max(y0, terrainH(cx + dx * W / 2, cz + dz * D / 2));
  y0 += 0.25;
  const Hw = 2.3, Hr = 1.7, ov = 0.38;
  const P = [];
  const add = (g, c, o = {}) => P.push(part(g, c, o));

  // 石头地基、墙、木筋
  add(box(W + 0.3, 1.4, D + 0.3), C.stone, { at: [0, -0.7, 0] });
  for (let i = 0; i < 9; i++) add(box(0.5 + (i % 3) * 0.1, 0.18, 0.06), C.stoneD, { at: [-W / 2 + 0.35 + i * 0.45, -0.25 - (i % 2) * 0.2, D / 2 + 0.16] });
  add(box(W, Hw, D), C.plaster, { at: [0, Hw / 2, 0] });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) add(box(0.17, Hw, 0.17), C.timber, { at: [sx * W / 2, Hw / 2, sz * D / 2] });
  for (const y of [0.06, 1.18, Hw - 0.06]) {
    add(box(W + 0.04, 0.13, 0.06), C.timber, { at: [0, y, D / 2 + 0.03] });
    add(box(W + 0.04, 0.13, 0.06), C.timber, { at: [0, y, -D / 2 - 0.03] });
    for (const sx of [-1, 1]) add(box(0.06, 0.13, D + 0.04), C.timber, { at: [sx * (W / 2 + 0.03), y, 0] });
  }
  for (const sx of [-1, 1]) {
    add(box(0.11, 1.4, 0.05), C.timber, { at: [sx * 1.55, 0.62, D / 2 + 0.04], rot: [0, 0, sx * 0.62] });
    add(box(0.05, 1.3, 0.11), C.timber, { at: [sx * (W / 2 + 0.04), 1.75, -0.6], rot: [sx * 0.7, 0, 0] });
  }

  // 山墙（前后）+ 圆窗
  for (const sz of [-1, 1]) {
    add(triPrism(W, Hr, 0.12), C.plaster, { at: [0, Hw, sz * (D / 2 - 0.04)] });
    add(box(0.11, Hr - 0.15, 0.06), C.timber, { at: [0, Hw + (Hr - 0.15) / 2, sz * (D / 2 + 0.03)] });
  }
  add(torus(0.27, 0.05, 8, 24), C.timber, { at: [0, Hw + 0.72, D / 2 + 0.05] });
  add(cyl(0.25, 0.25, 0.04, 20), C.glass, { rot: [Math.PI / 2, 0, 0], at: [0, Hw + 0.72, D / 2 + 0.03] });

  // 瓦片屋顶：每边 6 排互相压住的瓦
  const a = Math.atan2(Hr, W / 2), run = W / 2 + ov, slope = run / Math.cos(a), rows = 6;
  for (const sx of [-1, 1]) {
    for (let r = 0; r < rows; r++) {
      const s0 = (r / rows) * slope, s1 = ((r + 1.25) / rows) * slope;
      const mid = (s0 + Math.min(slope, s1)) / 2, len = Math.min(slope, s1) - s0;
      const px = sx * Math.cos(a) * mid, py = Hw + Hr - Math.sin(a) * mid + 0.06 + r * 0.012;
      add(box(len, 0.1, D + 0.65), r % 2 ? C.roofB : C.roofA, { rot: [0, 0, -sx * a], at: [px, py, 0] });
    }
  }
  add(box(0.24, 0.24, D + 0.7), C.roofB, { rot: [0, 0, Math.PI / 4], at: [0, Hw + Hr + 0.09, 0] });
  // 烟囱
  add(box(0.55, 2.0, 0.55), C.stone, { at: [W / 2 - 0.75, Hw + 1.3, -0.7] });
  add(box(0.68, 0.14, 0.68), C.stoneD, { at: [W / 2 - 0.75, Hw + 2.3, -0.7] });

  // 拱门 + 台阶
  const dz = D / 2 + 0.05;
  add(box(1.15, 1.75, 0.08), C.timber, { at: [0, 0.875, dz - 0.01] });
  add(box(0.95, 1.55, 0.08), C.door, { at: [0, 0.775, dz + 0.02] });
  add(cyl(0.475, 0.475, 0.08, 20), C.door, { rot: [Math.PI / 2, 0, 0], at: [0, 1.55, dz + 0.02] });
  for (const px of [-0.24, 0, 0.24]) add(box(0.03, 1.6, 0.02), C.doorD, { at: [px, 0.85, dz + 0.07] });
  add(ell(0.05, 0.05, 0.05), C.gold, { at: [0.33, 0.85, dz + 0.1] });
  add(box(1.5, 0.22, 0.7), C.stone, { at: [0, -0.09, D / 2 + 0.38] });

  // 窗：正面两扇、两侧各一扇，带百叶和花箱
  const win = (x, y, z, ry) => {
    const g = [];
    const p = (geo, c, o) => g.push(part(geo, c, o));
    p(box(0.86, 0.86, 0.06), C.timber, { at: [0, 0, 0] });
    p(box(0.7, 0.7, 0.04), C.glass, { at: [0, 0, 0.03] });
    p(box(0.05, 0.7, 0.03), C.timber, { at: [0, 0, 0.06] });
    p(box(0.7, 0.05, 0.03), C.timber, { at: [0, 0, 0.06] });
    for (const s of [-1, 1]) p(box(0.34, 0.84, 0.04), C.shutter, { at: [s * 0.62, 0, 0.04], rot: [0, s * 0.35, 0] });
    p(box(0.92, 0.18, 0.22), C.boxW, { at: [0, -0.52, 0.12] });
    for (let i = 0; i < 7; i++) {
      p(ell(0.07, 0.06, 0.07, 8), C.leaf, { at: [-0.36 + i * 0.12, -0.4, 0.13 + (i % 2) * 0.04] });
      p(ell(0.05, 0.05, 0.05, 8), i % 2 ? C.red : C.pink, { at: [-0.36 + i * 0.12, -0.33 + (i % 3) * 0.03, 0.16] });
    }
    const m = new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z);
    for (const q of g) P.push(q.applyMatrix4(m));
  };
  win(-1.4, 1.35, D / 2 + 0.04, 0);
  win(1.4, 1.35, D / 2 + 0.04, 0);
  win(W / 2 + 0.04, 1.35, 0.4, Math.PI / 2);
  win(-W / 2 - 0.04, 1.35, 0.4, -Math.PI / 2);

  const mesh = new THREE.Mesh(mergeGeometries(P), uberMat({}));
  mesh.position.set(cx, y0, cz);
  scene.add(mesh);

  return {
    mesh,
    door: V(cx, y0, cz + D / 2 + 0.75),
    collider: { box: [cx - W / 2 - 0.25, cx + W / 2 + 0.25, cz - D / 2 - 0.25, cz + D / 2 + 0.25], h: 5 },
  };
}
