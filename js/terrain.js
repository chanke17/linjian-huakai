// 地形、小路、溪流的共用函数（JS 侧，与着色器里的同名函数保持一致）

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const fr = (v) => v - Math.floor(v);
const h2 = (x, y) => fr(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
const h3 = (x, y, z) => fr(Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453);
const sm = (t) => t * t * (3 - 2 * t);

export function noise2(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const ux = sm(x - ix), uy = sm(y - iy);
  const a = h2(ix, iy), b = h2(ix + 1, iy), c = h2(ix, iy + 1), d = h2(ix + 1, iy + 1);
  return (a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy) * 2 - 1;
}

export function noise3(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const ux = sm(x - ix), uy = sm(y - iy), uz = sm(z - iz);
  const l = (a, b, t) => a + (b - a) * t;
  const z0 = l(l(h3(ix, iy, iz), h3(ix + 1, iy, iz), ux), l(h3(ix, iy + 1, iz), h3(ix + 1, iy + 1, iz), ux), uy);
  const z1 = l(l(h3(ix, iy, iz + 1), h3(ix + 1, iy, iz + 1), ux), l(h3(ix, iy + 1, iz + 1), h3(ix + 1, iy + 1, iz + 1), ux), uy);
  return l(z0, z1, uz) * 2 - 1;
}

export const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export const pathX = (z) => Math.sin(z * 0.08) * 2.6 + Math.sin(z * 0.21 + 1.3) * 0.7;
export const streamZ = (x) => Math.sin(x * 0.12) * 1.8 + Math.sin(x * 0.31 + 2.0) * 0.5;
export const WATER_Y = -0.35;
export const TREE = { x: pathX(-27.5), z: -27.5 };

export function terrainH(x, z) {
  let h = noise2(x * 0.045, z * 0.045) * 1.4 + noise2(x * 0.12 + 5.2, z * 0.12 - 3.1) * 0.35;
  const dp = Math.abs(x - pathX(z));
  h *= 0.35 + 0.65 * smoothstep(1.5, 7, dp);
  h += smoothstep(14, 42, dp) * 4.5;                 // 两侧缓坡，围出林间谷地
  const ds = Math.abs(z - streamZ(x));
  h += (Math.max(h, -0.1) - h) * (1 - smoothstep(4, 7.5, ds));   // 溪岸抬高到水面以上
  const c = 1 - smoothstep(1.4, 3.2, ds);            // 溪床
  h = h * (1 - c * 0.8) - c * 0.75;
  const dx = x - TREE.x, dz = z - TREE.z;
  h += 0.8 * Math.exp(-(dx * dx + dz * dz) / 45);    // 花树下的小土坡
  return h;
}

// 小路与溪流的交点
export function crossing() {
  let z = 0;
  for (let i = 0; i < 10; i++) z = streamZ(pathX(z));
  return { x: pathX(z), z };
}
