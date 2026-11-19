import * as THREE from 'three';
import { finalize, mergeGeometries } from './geo.js';

// 代码捏玩偶 / 家具的小工具：颜色、基本形、骨骼拼装

// 模块加载时色彩管理还没关，十六进制颜色手动换成 0..1，避免被当成 sRGB 转换
export const hex = (h) => { const n = parseInt(h.slice(1), 16); return new THREE.Color(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };
export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

const clean = (g) => { g = g.index ? g.toNonIndexed() : g; if (g.attributes.uv) g.deleteAttribute('uv'); return g; };
export const merge = (list) => mergeGeometries(list.map(clean));

export const ell = (rx, ry, rz, seg = 14) => new THREE.SphereGeometry(1, seg, Math.ceil(seg * 0.7)).scale(rx, ry, rz);
export const dome = (rx, ry, rz, seg = 20) => new THREE.SphereGeometry(1, seg, Math.ceil(seg * 0.5), 0, Math.PI * 2, 0, Math.PI / 2).scale(rx, ry, rz);
export const lathe = (pts, seg = 24) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
export const box = (w, h, d, sx = 1, sy = 1, sz = 1) => new THREE.BoxGeometry(w, h, d, sx, sy, sz);
export const cyl = (r0, r1, h, seg = 16, open = false) => new THREE.CylinderGeometry(r1, r0, h, seg, 1, open);
export const tube = (pts, r, seg = 24, rs = 6) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, r, rs, false);
export const torus = (r, t, rs = 8, ts = 24) => new THREE.TorusGeometry(r, t, rs, ts);

// 从原点往下垂的肢体，两端圆头
export function limb(r0, r1, len, seg = 10) {
  const g = new THREE.CylinderGeometry(r0, r1, len, seg, 2, true).translate(0, -len / 2, 0);
  return merge([g, ell(r0, r0, r0, seg), ell(r1, r1, r1, seg).translate(0, -len, 0)]);
}

// 变换后上色
export function part(geo, color, o = {}) {
  if (o.scale) geo.scale(...o.scale);
  if (o.rot) geo.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...o.rot, o.order || 'XYZ')));
  if (o.q) geo.applyQuaternion(o.q);
  if (o.at) geo.translate(o.at[0], o.at[1], o.at[2]);
  return finalize(geo, color, o.tint || 0);
}

// 骨骼（Group 层级）+ 每根骨头上合并成一个网格
export class Rig {
  constructor() { this.b = {}; this.parts = new Map(); }
  bone(name, parent, x = 0, y = 0, z = 0) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    if (parent) this.b[parent].add(g);
    this.b[name] = g;
    return g;
  }
  add(bone, geo, color, o = {}) {
    if (!this.parts.has(bone)) this.parts.set(bone, []);
    this.parts.get(bone).push(part(geo, color, o));
  }
  build(mat) {
    for (const [b, list] of this.parts) this.b[b].add(new THREE.Mesh(mergeGeometries(list), mat));
  }
}

// 地上的一团软影子
let shadowTex = null;
export function blobShadow(r = 0.42) {
  if (!shadowTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(60,40,30,0.55)');
    g.addColorStop(0.6, 'rgba(60,40,30,0.25)');
    g.addColorStop(1, 'rgba(60,40,30,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
    shadowTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  m.renderOrder = 2;
  return m;
}
