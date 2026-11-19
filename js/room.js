import * as THREE from 'three';
import { mergeGeometries } from './geo.js';
import { uberMat } from './materials.js';
import { hex, V, box, cyl, ell, dome, lathe, torus, tube, part } from './toy.js';

// 奶奶家屋内（单独的场景）。房间 x∈[-4,4]、z∈[-3.5,3.5]，地板 y=0；南墙矮，镜头从南边斜上方往里看。
// 屋里一开始也是铅笔线稿：用自己的显色遮罩（脚印 + 每完成一步染一片），角色和能拿的道具一直是彩色。

export const RU = {
  uMask: { value: null }, uMaskB: { value: new THREE.Vector4() },
  uBurstPos: { value: new THREE.Vector3(1.5, 0.8, 0.8) }, uBurstR: { value: 0 },
  uRevealMin: { value: 0.3 },
};
export function roomMat(opt = {}) {
  const m = uberMat(opt);
  Object.assign(m.uniforms, RU);
  return m;
}

export const ROOM = { x0: -4, x1: 4, z0: -3.5, z1: 3.5, H: 2.6 };
export const SPOT = {
  door: V(-3.25, 0, 1.55),
  bed: { x0: -1.55, x1: -0.05, z0: -3.45, z1: -1.25 },
  bedOut: V(0.4, 0, -2.25),       // 狼下床站的位置
  wolfLie: V(-0.8, 1.0, -1.78),   // 躺着时狼的脚底（root）位置
  keyDrop: V(1.05, 0, -1.3),
  pepper: V(3.62, 0.97, 2.05),
  shelfStand: V(3.0, 0, 2.2),
  knit: V(-2.25, 0, 0.35),
  laundry: V(2.5, 0, 2.85),
  trap: V(-1.75, 0, 1.55),
  wardrobe: V(3.05, 0, -2.2),
  grandmaIn: V(3.05, 0, -3.12),
  grandmaSafe: V(-2.75, 0, -2.75),
  table: V(1.5, 0, 0.8),
  chairW: V(0.5, 0, 0.8),
  chairE: V(2.5, 0, 0.8),
};

const C = {
  plank: [hex('#cf9f6c'), hex('#c4935f'), hex('#d8ad7b')], sub: hex('#6b4a31'),
  wall: hex('#f1e5c8'), wain: hex('#b27f55'), beam: hex('#6e4a33'), wood: hex('#9a6843'), woodL: hex('#b98457'), woodD: hex('#6d462c'),
  rugA: hex('#c85b4b'), rugB: hex('#f0d9aa'), rugC: hex('#e5a74c'),
  stone: hex('#aaa297'), stoneD: hex('#8b847a'), soot: hex('#3b302a'), fire: hex('#f39a3a'), fireY: hex('#ffd35c'),
  glass: hex('#d9ecee'), cloth: hex('#f5ead6'), clothR: hex('#d4564f'), sheet: hex('#f6f1e7'),
  quilt: [hex('#e2847a'), hex('#f2c46b'), hex('#8fb7d8'), hex('#a8c98a'), hex('#f3e4c8')],
  white: hex('#faf6ee'), gold: hex('#e0b74f'), red: hex('#d9473f'), blue: hex('#5a86c9'), yellow: hex('#f0c64a'),
  wicker: hex('#c99a5c'), wickerD: hex('#9c7140'), green: hex('#5f9150'), pink: hex('#f2a3b8'), jar: hex('#e8d2a8'),
};

function bake(list, mat) {
  return new THREE.Mesh(mergeGeometries(list), mat);
}

export function buildRoom() {
  const M = roomMat({ side: THREE.DoubleSide });
  const MA = roomMat({ always: true, side: THREE.DoubleSide });   // 能拿的道具：一直是彩色，好找
  const scene = new THREE.Scene();
  const P = [];
  const add = (g, c, o = {}) => P.push(part(g, c, o));
  const { x0, x1, z0, z1, H } = ROOM;

  // ——— 地板、地毯 ———
  add(box(8.6, 0.1, 7.6), C.sub, { at: [0, -0.12, 0] });
  for (let i = 0; i < 16; i++) {
    const z = z0 + (i + 0.5) * 0.4375;
    add(box(8.2, 0.1, 0.425), C.plank[i % 3], { at: [0, -0.05, z] });
  }
  const rug = [[1.0, C.rugA], [0.86, C.rugB], [0.62, C.rugA], [0.4, C.rugC]];
  rug.forEach(([r, c], i) => add(cyl(r, r, 0.02, 40), c, { scale: [1.75, 1, 1.25], at: [0.25, 0.01 + i * 0.004, 0.5] }));
  add(box(0.9, 0.02, 0.6), C.rugC, { at: [-3.35, 0.01, 1.55] });

  // ——— 墙：北墙开窗、西墙开门、东墙开窗，南墙只有矮矮一截 ———
  const wallSeg = (ax, a0, a1, y0, y1, fixed, axis) => {
    const len = a1 - a0, mid = (a0 + a1) / 2, hh = y1 - y0, ym = (y0 + y1) / 2;
    if (axis === 'x') add(box(len, hh, 0.2), C.wall, { at: [mid, ym, fixed] });
    else add(box(0.2, hh, len), C.wall, { at: [fixed, ym, mid] });
  };
  // 北墙 z=-3.6，窗 x∈[-1.05,-0.15]，y∈[1.3,2.1]
  wallSeg(0, -4.2, -1.05, 0, H, -3.6, 'x'); wallSeg(0, -0.15, 4.2, 0, H, -3.6, 'x');
  wallSeg(0, -1.05, -0.15, 0, 1.3, -3.6, 'x'); wallSeg(0, -1.05, -0.15, 2.1, H, -3.6, 'x');
  // 西墙 x=-4.1，门 z∈[1.0,2.1]
  wallSeg(0, -3.7, 1.0, 0, H, -4.1, 'z'); wallSeg(0, 2.1, 3.7, 0, H, -4.1, 'z'); wallSeg(0, 1.0, 2.1, 2.0, H, -4.1, 'z');
  // 东墙 x=4.1，窗 z∈[-0.5,0.5]，y∈[1.1,2.1]
  wallSeg(0, -3.7, -0.5, 0, H, 4.1, 'z'); wallSeg(0, 0.5, 3.7, 0, H, 4.1, 'z');
  wallSeg(0, -0.5, 0.5, 0, 1.1, 4.1, 'z'); wallSeg(0, -0.5, 0.5, 2.1, H, 4.1, 'z');
  // 南墙矮墙
  add(box(8.4, 0.4, 0.2), C.wall, { at: [0, 0.2, 3.6] });
  // 墙顶压条、墙裙、木筋
  add(box(8.6, 0.08, 0.28), C.beam, { at: [0, H + 0.04, -3.6] });
  for (const sx of [-1, 1]) add(box(0.28, 0.08, 7.4), C.beam, { at: [sx * 4.1, H + 0.04, 0] });
  add(box(8.6, 0.06, 0.28), C.beam, { at: [0, 0.43, 3.6] });
  add(box(8.0, 0.85, 0.03), C.wain, { at: [0, 0.425, -3.49] });
  add(box(0.03, 0.85, 4.45), C.wain, { at: [-3.99, 0.425, -1.27] });
  add(box(0.03, 0.85, 1.35), C.wain, { at: [-3.99, 0.425, 2.82] });
  add(box(0.03, 0.85, 7.0), C.wain, { at: [3.99, 0.425, 0] });
  add(box(8.0, 0.06, 0.05), C.beam, { at: [0, 0.88, -3.48] });
  for (const x of [-4, -2, 1.2, 4]) add(box(0.14, H, 0.06), C.beam, { at: [x, H / 2, -3.47] });
  for (const z of [-3.5, -0.9, 3.5]) { add(box(0.06, H, 0.14), C.beam, { at: [-3.97, H / 2, z] }); add(box(0.06, H, 0.14), C.beam, { at: [3.97, H / 2, z] }); }
  add(box(8.0, 0.12, 0.06), C.beam, { at: [0, H - 0.1, -3.47] });

  // 窗框、玻璃、窗帘
  const winN = (cx, cy, w, h) => {
    add(box(w + 0.14, h + 0.14, 0.12), C.beam, { at: [cx, cy, -3.52] });
    add(box(w, h, 0.03), C.glass, { at: [cx, cy, -3.5] });
    add(box(0.05, h, 0.05), C.beam, { at: [cx, cy, -3.47] });
    add(box(w, 0.05, 0.05), C.beam, { at: [cx, cy, -3.47] });
    add(box(w + 0.3, 0.05, 0.16), C.wood, { at: [cx, cy - h / 2 - 0.06, -3.42] });
  };
  winN(-0.6, 1.7, 0.9, 0.8);
  add(box(0.12, 1.14, 0.14), C.beam, { at: [3.98, 1.6, -0.52] }); add(box(0.12, 1.14, 0.14), C.beam, { at: [3.98, 1.6, 0.52] });
  add(box(0.12, 0.12, 1.18), C.beam, { at: [3.98, 2.12, 0] }); add(box(0.12, 0.12, 1.18), C.beam, { at: [3.98, 1.08, 0] });
  add(box(0.03, 1.0, 1.0), C.glass, { at: [4.0, 1.6, 0] });
  add(box(0.05, 1.0, 0.05), C.beam, { at: [3.96, 1.6, 0] }); add(box(0.05, 0.05, 1.0), C.beam, { at: [3.96, 1.6, 0] });
  for (const s of [-1, 1]) {
    add(box(0.06, 1.25, 0.32), C.cloth, { at: [3.9, 1.55, s * 0.7] });
    add(box(0.07, 0.08, 0.34), C.clothR, { at: [3.9, 0.96, s * 0.7] });
    add(box(0.3, 0.9, 0.05), C.cloth, { at: [-0.6 + s * 0.62, 1.75, -3.45] });
  }
  add(box(0.04, 0.04, 1.8), C.woodD, { at: [3.88, 2.2, 0] });

  // 门（关着）+ 门框
  add(box(0.08, 1.95, 1.05), C.wood, { at: [-4.02, 0.975, 1.55] });
  for (const z of [1.25, 1.55, 1.85]) add(box(0.02, 1.9, 0.03), C.woodD, { at: [-3.97, 0.95, z] });
  add(ell(0.045, 0.045, 0.045), C.gold, { at: [-3.95, 0.95, 1.95] });
  add(box(0.14, 2.1, 0.12), C.beam, { at: [-3.98, 1.05, 0.97] }); add(box(0.14, 2.1, 0.12), C.beam, { at: [-3.98, 1.05, 2.13] });
  add(box(0.14, 0.12, 1.3), C.beam, { at: [-3.98, 2.05, 1.55] });

  // ——— 壁炉（西墙）———
  add(box(0.7, 1.25, 1.45), C.stone, { at: [-3.7, 0.625, -1.6] });
  add(box(0.5, 1.35, 1.0), C.stone, { at: [-3.78, 1.92, -1.6] });
  add(box(0.08, 0.7, 0.85), C.soot, { at: [-3.33, 0.42, -1.6] });
  add(box(0.86, 0.1, 1.65), C.wood, { at: [-3.62, 1.3, -1.6] });
  for (let i = 0; i < 6; i++) add(box(0.04, 0.16, 0.3), C.stoneD, { at: [-3.33, 0.2 + (i % 3) * 0.35, -2.15 + Math.floor(i / 3) * 1.1] });
  add(cyl(0.06, 0.06, 0.6, 8), C.woodD, { rot: [Math.PI / 2, 0, 0.3], at: [-3.55, 0.12, -1.6] });
  add(cyl(0.06, 0.06, 0.6, 8), C.woodD, { rot: [Math.PI / 2, 0, -0.3], at: [-3.5, 0.18, -1.6] });
  add(cyl(0.05, 0.05, 0.14, 8), C.white, { at: [-3.55, 1.42, -2.2] });
  add(ell(0.03, 0.05, 0.03, 6), C.fireY, { at: [-3.55, 1.53, -2.2] });
  add(ell(0.12, 0.12, 0.06, 12), C.woodL, { at: [-3.5, 1.47, -1.1] });
  add(cyl(0.11, 0.11, 0.015, 16), C.white, { rot: [0, 0, Math.PI / 2], at: [-3.43, 1.47, -1.1] });
  const flames = new THREE.Mesh(mergeGeometries([
    part(new THREE.ConeGeometry(0.16, 0.42, 8), C.fire, { at: [-3.5, 0.35, -1.6] }),
    part(new THREE.ConeGeometry(0.1, 0.3, 8), C.fireY, { at: [-3.48, 0.32, -1.48] }),
    part(new THREE.ConeGeometry(0.1, 0.32, 8), C.fireY, { at: [-3.48, 0.33, -1.74] }),
  ]), MA);

  // ——— 床（北墙）———
  const bx = -0.8;
  add(box(1.6, 1.15, 0.12), C.wood, { at: [bx, 0.575, -3.42] });
  add(cyl(0.8, 0.8, 0.12, 24), C.wood, { rot: [Math.PI / 2, 0, 0], scale: [1, 1, 0.45], at: [bx, 1.15, -3.42] });
  add(ell(0.16, 0.16, 0.05, 10), C.pink, { at: [bx, 1.15, -3.34] });
  add(box(1.6, 0.75, 0.1), C.wood, { at: [bx, 0.375, -1.28] });
  for (const sx of [-1, 1]) {
    add(box(0.08, 0.2, 2.1), C.woodD, { at: [bx + sx * 0.76, 0.32, -2.35] });
    add(ell(0.07, 0.07, 0.07, 8), C.woodL, { at: [bx + sx * 0.76, 1.2, -3.42] });
    add(ell(0.06, 0.06, 0.06, 8), C.woodL, { at: [bx + sx * 0.76, 0.78, -1.28] });
  }
  add(box(1.44, 0.24, 2.05), C.sheet, { at: [bx, 0.46, -2.35] });
  const pillow = bake([part(ell(0.44, 0.12, 0.2, 18), C.white, { at: [bx, 0.66, -3.05] })], M);
  // 拼布被子：平铺的一层 + 狼躺着时鼓起的一团
  const Q = [];
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    Q.push(part(box(0.37, 0.07, 0.37), C.quilt[(i * 3 + j * 2) % 5], { at: [bx - 0.555 + i * 0.37, 0.61, -2.72 + j * 0.37] }));
  }
  Q.push(part(box(1.5, 0.05, 1.52), C.quilt[0], { at: [bx, 0.585, -2.17] }));
  add(box(0.06, 0.45, 1.52), C.quilt[0], { at: [bx - 0.77, 0.4, -2.17] }); add(box(0.06, 0.45, 1.52), C.quilt[0], { at: [bx + 0.77, 0.4, -2.17] });
  P.push(...Q);
  const hump = bake([part(dome(0.62, 0.58, 0.82, 22), (v) => C.quilt[(Math.floor(v.x * 4 + 20) + Math.floor(v.z * 4 + 20)) % 4], { at: [bx, 0.6, -2.02] })], M);
  // 床头小凳 + 蜡烛
  add(box(0.42, 0.5, 0.42), C.woodL, { at: [0.3, 0.25, -3.1] });
  add(cyl(0.05, 0.05, 0.14, 8), C.white, { at: [0.3, 0.57, -3.1] });

  // ——— 衣柜（东北角），两扇门单独做，可以打开 ———
  const wx0 = 2.35, wx1 = 3.8, wz = -3.15;
  add(box(wx1 - wx0, 2.2, 0.68), C.wood, { at: [(wx0 + wx1) / 2, 1.15, wz] });
  add(box(wx1 - wx0 + 0.14, 0.14, 0.8), C.woodD, { at: [(wx0 + wx1) / 2, 2.3, wz + 0.02] });
  add(box(wx1 - wx0 + 0.06, 0.12, 0.74), C.woodD, { at: [(wx0 + wx1) / 2, 0.06, wz + 0.02] });
  add(box(wx1 - wx0 - 0.12, 1.95, 0.05), C.soot, { at: [(wx0 + wx1) / 2, 1.16, wz + 0.31] });
  const doorW = (wx1 - wx0) / 2 - 0.04;
  const wdoor = (hx, sgn) => {
    const g = new THREE.Group();
    g.position.set(hx, 0, wz + 0.36);
    const list = [
      part(box(doorW, 1.95, 0.06), C.woodL, { at: [sgn * doorW / 2, 1.16, 0] }),
      part(box(doorW - 0.2, 1.4, 0.02), C.wood, { at: [sgn * doorW / 2, 1.16, 0.035] }),
      part(ell(0.1, 0.09, 0.02, 12), C.pink, { at: [sgn * doorW / 2, 1.62, 0.05] }),
      part(ell(0.035, 0.035, 0.035, 8), C.gold, { at: [sgn * (doorW - 0.09), 1.1, 0.06] }),
    ];
    g.add(bake(list, M));
    return g;
  };
  const doorL = wdoor(wx0 + 0.04, 1), doorR = wdoor(wx1 - 0.04, -1);

  // ——— 摇椅 + 针线篮（壁炉旁）———
  const rc = [-2.85, -0.45];
  for (const s of [-1, 1]) {
    add(torus(0.62, 0.03, 6, 24), C.woodD, { rot: [0, Math.PI / 2, 0], scale: [1, 0.35, 1], at: [rc[0], 0.24, rc[1] + s * 0.24] });
    add(box(0.05, 0.85, 0.05), C.wood, { at: [rc[0] - 0.26, 0.75, rc[1] + s * 0.24], rot: [0, 0, 0.15] });
    add(box(0.05, 0.45, 0.05), C.wood, { at: [rc[0] + 0.2, 0.3, rc[1] + s * 0.24] });
  }
  add(box(0.55, 0.06, 0.55), C.wood, { at: [rc[0], 0.5, rc[1]] });
  add(box(0.5, 0.08, 0.5), C.rugA, { at: [rc[0], 0.56, rc[1]] });
  add(box(0.06, 0.6, 0.55), C.wood, { at: [rc[0] - 0.33, 0.9, rc[1]], rot: [0, 0, 0.15] });
  for (let i = 0; i < 4; i++) add(cyl(0.02, 0.02, 0.5, 6), C.woodL, { at: [rc[0] - 0.31, 0.88, rc[1] - 0.18 + i * 0.12], rot: [0, 0, 0.15] });
  const kn = SPOT.knit;
  add(cyl(0.2, 0.24, 0.24, 18), C.wicker, { at: [kn.x, 0.12, kn.z] });
  add(torus(0.24, 0.025, 6, 20), C.wickerD, { rot: [Math.PI / 2, 0, 0], at: [kn.x, 0.24, kn.z] });
  add(ell(0.09, 0.09, 0.09, 10), C.blue, { at: [kn.x + 0.08, 0.27, kn.z + 0.07] });
  add(ell(0.08, 0.08, 0.08, 10), C.yellow, { at: [kn.x - 0.09, 0.26, kn.z + 0.04] });
  add(cyl(0.008, 0.008, 0.4, 5), C.woodD, { rot: [0.5, 0, 0.4], at: [kn.x, 0.35, kn.z - 0.05] });

  // ——— 圆桌（长桌布垂到地上，可以钻进去躲）+ 两把椅子 ———
  const tb = SPOT.table;
  add(lathe([[0.8, 0.0], [0.77, 0.08], [0.73, 0.4], [0.72, 0.74], [0.74, 0.78], [0.0, 0.8]], 32), C.cloth, { at: [tb.x, 0, tb.z] });
  add(torus(0.765, 0.03, 6, 32), C.clothR, { rot: [Math.PI / 2, 0, 0], at: [tb.x, 0.07, tb.z] });
  add(torus(0.735, 0.025, 6, 32), C.clothR, { rot: [Math.PI / 2, 0, 0], at: [tb.x, 0.76, tb.z] });
  add(cyl(0.08, 0.06, 0.2, 10), C.blue, { at: [tb.x - 0.15, 0.9, tb.z - 0.1] });
  for (let i = 0; i < 5; i++) add(ell(0.05, 0.05, 0.05, 8), [C.red, C.yellow, C.pink][i % 3], { at: [tb.x - 0.15 + Math.cos(i * 1.26) * 0.06, 1.04, tb.z - 0.1 + Math.sin(i * 1.26) * 0.06] });
  for (const [cx, s] of [[SPOT.chairW.x, -1], [SPOT.chairE.x, 1]]) {
    const cz = SPOT.chairW.z;
    add(box(0.46, 0.06, 0.46), C.woodL, { at: [cx, 0.46, cz] });
    for (const lx of [-1, 1]) for (const lz of [-1, 1]) add(box(0.05, 0.46, 0.05), C.wood, { at: [cx + lx * 0.19, 0.23, cz + lz * 0.19] });
    add(box(0.05, 0.6, 0.46), C.wood, { at: [cx + s * 0.21, 0.78, cz] });
    add(box(0.05, 0.1, 0.4), C.woodL, { at: [cx + s * 0.21, 0.98, cz] });
  }

  // ——— 东墙的矮柜 + 搁板 ———
  add(box(0.6, 0.95, 1.2), C.woodL, { at: [3.7, 0.475, 2.3] });
  add(box(0.04, 0.75, 0.5), C.wood, { at: [3.39, 0.45, 2.0] }); add(box(0.04, 0.75, 0.5), C.wood, { at: [3.39, 0.45, 2.6] });
  add(box(0.66, 0.05, 1.26), C.wood, { at: [3.7, 0.97, 2.3] });
  add(cyl(0.12, 0.11, 0.24, 14), C.jar, { at: [3.7, 1.12, 2.55] });
  add(ell(0.12, 0.05, 0.12, 12), C.red, { at: [3.7, 1.25, 2.55] });
  for (let i = 0; i < 3; i++) add(cyl(0.16, 0.16, 0.02, 16), C.white, { rot: [0, 0, Math.PI / 2 - 0.25], at: [3.92, 1.15, 2.18 + i * 0.05] });
  add(box(0.26, 0.04, 1.2), C.wood, { at: [3.87, 1.65, 2.3] });
  for (let i = 0; i < 4; i++) add(cyl(0.07, 0.07, 0.16, 10), [C.jar, C.green, C.yellow, C.jar][i], { at: [3.88, 1.75, 1.85 + i * 0.3] });

  // 门边一盆花、墙上挂画和钟
  add(cyl(0.17, 0.13, 0.3, 12), C.rugA, { at: [-3.55, 0.15, 3.0] });
  for (let i = 0; i < 7; i++) add(ell(0.11, 0.13, 0.11, 8), C.green, { at: [-3.55 + Math.cos(i) * 0.1, 0.42 + (i % 3) * 0.08, 3.0 + Math.sin(i) * 0.1] });
  add(box(0.6, 0.45, 0.04), C.beam, { at: [2.0, 1.75, -3.47] });
  add(box(0.5, 0.35, 0.02), C.glass, { at: [2.0, 1.75, -3.45] });
  add(ell(0.16, 0.08, 0.02, 10), C.green, { at: [2.0, 1.66, -3.44] });
  add(cyl(0.18, 0.18, 0.05, 20), C.woodD, { rot: [Math.PI / 2, 0, 0], at: [-2.6, 1.95, -3.45] });
  add(cyl(0.15, 0.15, 0.02, 20), C.white, { rot: [Math.PI / 2, 0, 0], at: [-2.6, 1.95, -3.42] });

  const room = bake(P, M);
  scene.add(room, pillow, hump, flames, doorL, doorR);

  // ——— 能拿的道具 ———
  const items = {};
  const item = (name, list, home, rot = [0, 0, 0]) => {
    const g = new THREE.Group();
    g.add(bake(list, MA));
    g.position.copy(home);
    g.rotation.set(...rot);
    scene.add(g);
    items[name] = { mesh: g, home: home.clone(), rot: new THREE.Euler(...rot) };
  };
  item('pepper', [
    part(cyl(0.05, 0.045, 0.13, 12), C.white, { at: [0, 0.065, 0] }),
    part(dome(0.05, 0.05, 0.05, 12), C.red, { at: [0, 0.13, 0] }),
    part(ell(0.016, 0.016, 0.016, 6), C.red, { at: [0, 0.185, 0] }),
  ], SPOT.pepper);
  item('key', [
    part(torus(0.05, 0.015, 6, 16), C.gold, { at: [0, 0, 0] }),
    part(box(0.18, 0.025, 0.025), C.gold, { at: [0.13, 0, 0] }),
    part(box(0.025, 0.05, 0.025), C.gold, { at: [0.19, -0.03, 0] }),
    part(box(0.025, 0.035, 0.025), C.gold, { at: [0.15, -0.025, 0] }),
  ], SPOT.keyDrop.clone().setY(0.03), [Math.PI / 2, 0, 0.4]);
  items.key.mesh.visible = false;
  item('yarn', [
    part(ell(0.11, 0.11, 0.11, 14), C.red, {}),
    part(torus(0.105, 0.012, 5, 20), hex('#b8352f'), { rot: [0.4, 0, 0] }),
    part(torus(0.105, 0.012, 5, 20), hex('#b8352f'), { rot: [1.3, 0.6, 0] }),
    part(tube([V(0.1, -0.03, 0), V(0.2, -0.08, 0.05), V(0.28, -0.1, 0)], 0.008, 8, 4), C.red, {}),
  ], V(kn.x - 0.02, 0.29, kn.z - 0.08));
  const lb = [];
  for (let i = 0; i < 4; i++) lb.push(part(torus(0.42 - i * 0.005, 0.03, 6, 26), i % 2 ? C.wickerD : C.wicker, { rot: [Math.PI / 2, 0, 0], at: [0, 0.08 + i * 0.11, 0] }));
  lb.push(part(cyl(0.4, 0.43, 0.42, 26, true), C.wicker, { at: [0, 0.21, 0] }));
  lb.push(part(cyl(0.38, 0.38, 0.02, 24), C.wickerD, { at: [0, 0.02, 0] }));
  for (const s of [-1, 1]) lb.push(part(torus(0.09, 0.02, 5, 12, Math.PI), C.wickerD, { rot: [0, Math.PI / 2, 0], at: [s * 0.43, 0.42, 0] }));
  lb.push(part(ell(0.2, 0.08, 0.16, 10), C.white, { at: [-0.08, 0.42, 0.05] }));
  lb.push(part(ell(0.16, 0.07, 0.14, 10), C.blue, { at: [0.12, 0.44, -0.08] }));
  item('laundry', lb, SPOT.laundry);

  // 陷阱用的东西：地上的虚线圈、两根小桩 + 毛线、支筐的小棍
  const tr = SPOT.trap;
  const ring = [];
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    ring.push(part(box(0.1, 0.012, 0.035), hex('#7c6f62'), { rot: [0, -a, 0], at: [Math.cos(a) * 0.6, 0.016, Math.sin(a) * 0.6] }));
  }
  const trapRing = bake(ring, MA);
  trapRing.position.set(tr.x, 0, tr.z);
  const yarnLine = bake([
    part(cyl(0.025, 0.03, 0.22, 8), C.woodD, { at: [0, 0.11, -0.55] }),
    part(cyl(0.025, 0.03, 0.22, 8), C.woodD, { at: [0, 0.11, 0.55] }),
    part(cyl(0.01, 0.01, 1.1, 5), C.red, { rot: [Math.PI / 2, 0, 0], at: [0, 0.16, 0] }),
    part(ell(0.06, 0.06, 0.06, 8), C.red, { at: [0.06, 0.06, 0.62] }),
  ], MA);
  yarnLine.position.set(tr.x, 0, tr.z);
  const stick = bake([part(cyl(0.015, 0.015, 0.5, 6), C.woodD, { at: [0, 0.25, 0] })], MA);
  stick.position.set(tr.x + 0.42, 0, tr.z);
  stick.rotation.z = 0.12;
  for (const m of [trapRing, yarnLine, stick]) { m.visible = false; scene.add(m); }

  // 窗外的光
  scene.background = new THREE.Color(0.95, 0.935, 0.9);

  return {
    scene, items, flames, hump, pillow, doorL, doorR, trapRing, yarnLine, stick,
    // 碰撞盒 [x0,x1,z0,z1]；table 女孩可以钻进去（躲藏），狼不行
    boxes: [
      { b: [SPOT.bed.x0, SPOT.bed.x1, SPOT.bed.z0, SPOT.bed.z1], name: 'bed' },
      { b: [0.08, 0.52, -3.32, -2.88], name: 'stool' },
      { b: [wx0 - 0.05, wx1 + 0.05, -3.5, -2.76], name: 'wardrobe' },
      { b: [-4, -3.33, -2.35, -0.85], name: 'fire' },
      { b: [rc[0] - 0.45, rc[0] + 0.35, rc[1] - 0.35, rc[1] + 0.35], name: 'rocker' },
      { b: [kn.x - 0.24, kn.x + 0.24, kn.z - 0.24, kn.z + 0.24], name: 'knit' },
      { b: [tb.x - 0.72, tb.x + 0.72, tb.z - 0.72, tb.z + 0.72], name: 'table', girlPass: true },
      { b: [SPOT.chairW.x - 0.25, SPOT.chairW.x + 0.25, SPOT.chairW.z - 0.25, SPOT.chairW.z + 0.25], name: 'chairW' },
      { b: [SPOT.chairE.x - 0.25, SPOT.chairE.x + 0.25, SPOT.chairE.z - 0.25, SPOT.chairE.z + 0.25], name: 'chairE' },
      { b: [3.38, 4, 1.68, 2.92], name: 'cupboard' },
      { b: [-3.75, -3.3, 2.8, 3.2], name: 'plant' },
    ],
  };
}
