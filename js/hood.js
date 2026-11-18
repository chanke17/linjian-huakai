import * as THREE from 'three';
import { uberMat } from './materials.js';
import { HOOD } from './hood-data.js';

// 小红帽（Tripo 生成的静态模型）+ 代码绑骨：
// 模型本身没有骨骼，这里按部件和高度给每个顶点算权重，每帧在 CPU 上变形（约 5400 个顶点）。
//   腿：髋关节摆动 + 膝盖弯曲（两腿在 bake 时已沿缝切开）
//   头：绕脖子点头、转头、歪头（兜帽一起动）
//   篮子：挂在合拢的双手上做单摆，始终大致竖直
//   斗篷/裙摆后侧：走动时向后飘、起伏
// 模型坐标：+z 朝前，脚底 y=0，身高 1.0；整体放大到 HEIGHT 米。

const HEIGHT = 1.12;
const LEG = { x: 0.05, z: -0.035, hip: 0.27, knee: 0.1 };
const NECK = new THREE.Vector3(0, 0.6, -0.01);
const GRIP = new THREE.Vector3(0, 0.41, 0.135);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const bytes = (s) => { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u.buffer; };

// 绕某点旋转的小工具：m 是 3×3 旋转（行主序），c 是转轴点
class Joint {
  constructor(c) { this.c = c.clone(); this.m = new Float32Array(9); this.set(0, 0, 0); }
  set(x, y, z) {
    const e = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(x, y, z, 'YXZ')).elements;
    const m = this.m;
    m[0] = e[0]; m[1] = e[4]; m[2] = e[8]; m[3] = e[1]; m[4] = e[5]; m[5] = e[9]; m[6] = e[2]; m[7] = e[6]; m[8] = e[10];
    return this;
  }
  // 把 (o[i..i+2]) 按权重 w 混合到旋转后的位置；isDir 时只转方向
  apply(o, i, w, isDir) {
    if (w <= 0) return;
    const m = this.m, cx = isDir ? 0 : this.c.x, cy = isDir ? 0 : this.c.y, cz = isDir ? 0 : this.c.z;
    const x = o[i] - cx, y = o[i + 1] - cy, z = o[i + 2] - cz;
    const rx = m[0] * x + m[1] * y + m[2] * z, ry = m[3] * x + m[4] * y + m[5] * z, rz = m[6] * x + m[7] * y + m[8] * z;
    o[i] += (rx - x) * w; o[i + 1] += (ry - y) * w; o[i + 2] += (rz - z) * w;
  }
}

export class HoodGirl {
  constructor() {
    const n = HOOD.n;
    this.rest = new Float32Array(bytes(HOOD.pos));
    const n8 = new Int8Array(bytes(HOOD.nrm));
    this.restN = Float32Array.from(n8, (v) => v / 127);
    const uv16 = new Uint16Array(bytes(HOOD.uv));
    this.part = new Uint8Array(bytes(HOOD.part));

    const g = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(this.rest.slice(), 3).setUsage(THREE.DynamicDrawUsage);
    this.nrm = new THREE.BufferAttribute(this.restN.slice(), 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.pos);
    g.setAttribute('normal', this.nrm);
    g.setAttribute('uv', new THREE.BufferAttribute(Float32Array.from(uv16, (v) => v / 65535), 2));
    g.setAttribute('aCol', new THREE.BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    g.setAttribute('aTint', new THREE.BufferAttribute(new Float32Array(n), 1));
    g.setIndex(new THREE.BufferAttribute(new Uint16Array(bytes(HOOD.idx)), 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.5, 0), 0.8);

    // 贴图：glTF 的 uv 不翻转；按显示色直接用（全局关了色彩管理）
    const img = new Image();
    const tex = new THREE.Texture(img);
    tex.flipY = false;
    tex.colorSpace = THREE.NoColorSpace;
    tex.anisotropy = 4;
    this.mat = uberMat({ always: true, map: tex, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.scale.setScalar(HEIGHT);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    img.onload = () => { tex.needsUpdate = true; this.mesh.visible = true; };
    img.src = HOOD.tex;

    // 每个顶点的权重
    const P = this.rest, part = this.part;
    this.wKnee = new Float32Array(n);
    this.wHead = new Float32Array(n);
    this.wCape = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      if (part[i] === 1 || part[i] === 2) this.wKnee[i] = 1 - smooth(0.075, 0.13, y);
      if (part[i] === 0) {
        this.wHead[i] = smooth(0.585, 0.665, y);
        this.wCape[i] = smooth(0.62, 0.2, y) * smooth(0.09, -0.08, z) * (1 - this.wHead[i]);
      }
    }

    this.joints = {
      hipL: new Joint(new THREE.Vector3(LEG.x, LEG.hip, LEG.z)), kneeL: new Joint(new THREE.Vector3(LEG.x, LEG.knee, LEG.z)),
      hipR: new Joint(new THREE.Vector3(-LEG.x, LEG.hip, LEG.z)), kneeR: new Joint(new THREE.Vector3(-LEG.x, LEG.knee, LEG.z)),
      head: new Joint(NECK), basket: new Joint(GRIP),
    };

    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.body.add(this.mesh);

    this.basketSwing = 0; this.basketVel = 0;
    this.cape = 0; this.prevHop = -1; this.landT = 9;
  }

  // st: { walkAmt 0..1, run 0..1, phase, hop -1|0..1, look 0..1, wind }
  pose(st, t, dt = 1 / 60) {
    const J = this.joints;
    const w = Math.min(1, st.walkAmt), run = st.run || 0;
    const s = Math.sin(st.phase), c = Math.cos(st.phase);
    const amp = (0.4 + 0.22 * run) * w;
    let hl = -s * amp, hr = s * amp;
    let kl = Math.max(0, c) * (0.7 + 0.35 * run) * w, kr = Math.max(0, -c) * (0.7 + 0.35 * run) * w;
    let bob = Math.abs(c) * (0.016 + 0.018 * run) * w;
    let lean = 0.04 * w + 0.1 * run;
    let roll = s * 0.045 * w * (1 - 0.5 * run);
    const hop = st.hop >= 0 ? Math.sin(st.hop * Math.PI) : 0;
    let sy = 1;
    if (st.hop >= 0) {
      hl = -0.55 * hop; hr = -0.2 * hop; kl = 0.95 * hop; kr = 0.55 * hop;
      bob = 0; roll = 0; lean = 0.1 * hop;
      sy = st.hop < 0.15 ? 1 - 0.1 * Math.sin((st.hop / 0.15) * Math.PI) : 1 + 0.06 * hop;
    }
    // 落地：压扁再弹回
    if (this.prevHop >= 0 && st.hop < 0) this.landT = 0;
    this.prevHop = st.hop;
    this.landT += dt;
    sy -= 0.11 * Math.exp(-this.landT * 9) * Math.cos(this.landT * 24);
    const breathe = Math.sin(t * 2.1) * (1 - w);
    sy += 0.008 * breathe;

    const B = this.body;
    B.position.y = bob;
    B.rotation.set(lean, -s * 0.06 * w, roll);
    B.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));

    J.hipL.set(hl, 0, 0); J.kneeL.set(kl, 0, 0);
    J.hipR.set(hr, 0, 0); J.kneeR.set(kr, 0, 0);
    J.head.set(-0.45 * st.look - lean * 0.6 + Math.sin(t * 1.3) * 0.02,
      Math.sin(t * 0.6) * 0.14 * (1 - w) * (1 - st.look),
      Math.sin(t * 0.9) * 0.035 * (1 - w) - roll * 0.5);

    // 篮子：单摆，抵消身体的前倾和左右摇晃，始终大致竖直
    const k = Math.min(1, dt * 60);
    this.basketVel += (-this.basketSwing * 0.08 + s * 0.012 * w - this.basketVel * 0.08) * k;
    this.basketSwing += this.basketVel * k;
    J.basket.set(-lean + this.basketSwing - 0.25 * hop, 0, -roll + this.basketSwing * 0.4);

    // 斗篷：走得越快越往后飘
    this.cape += ((w * 0.6 + run * 0.5 + hop * 0.8 + (st.wind || 0) * 0.35) - this.cape) * Math.min(1, dt * 5);
    const rip = 0.35 + w * 0.9 + run * 0.5, ph = st.phase * 2 + t * 2;

    this.deform(this.cape, rip, ph);
  }

  deform(cape, rip, ph) {
    const J = this.joints, part = this.part, R = this.rest, RN = this.restN;
    const o = this.pos.array, on = this.nrm.array, n = part.length;
    o.set(R); on.set(RN);
    for (let v = 0; v < n; v++) {
      const i = v * 3, p = part[v];
      if (p === 1 || p === 2) {
        const knee = p === 1 ? J.kneeL : J.kneeR, hip = p === 1 ? J.hipL : J.hipR, wk = this.wKnee[v];
        knee.apply(o, i, wk, false); knee.apply(on, i, wk, true);
        hip.apply(o, i, 1, false); hip.apply(on, i, 1, true);
      } else if (p === 4) {
        J.basket.apply(o, i, 1, false); J.basket.apply(on, i, 1, true);
      } else if (p === 0) {
        const wh = this.wHead[v];
        if (wh > 0) { J.head.apply(o, i, wh, false); J.head.apply(on, i, wh, true); }
        const wc = this.wCape[v];
        if (wc > 0) {
          const y = R[i + 1];
          o[i + 2] -= cape * wc * wc * 0.07;
          o[i] += Math.sin(ph + y * 9) * rip * wc * 0.006;
          o[i + 2] += Math.sin(ph * 2 + Math.atan2(R[i], R[i + 2]) * 3) * rip * wc * 0.005;
        }
      }
    }
    this.pos.needsUpdate = true;
    this.nrm.needsUpdate = true;
  }
}
