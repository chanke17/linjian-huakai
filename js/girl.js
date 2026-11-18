import * as THREE from 'three';
import { finalize, mergeGeometries } from './geo.js';
import { uberMat } from './materials.js';

// 小红帽：骨骼层级 + 车削轮廓/椭球/锥形肢体拼装，五官贴着头部椭球表面放置。
// 思路参考 makerjackie/yarn-planet（MIT）的程序化角色做法，代码为本项目重写。
// 本地坐标：+z 朝前，脚底在原点，未缩放时身高约 1.03m。

const hex = (h) => { const n = parseInt(h.slice(1), 16); return new THREE.Color(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };
const PAL = {
  skin: hex('#fbe1cd'), skinShade: hex('#f0bfa8'), blush: hex('#f59b9b'),
  hair: hex('#5a3323'), hairLight: hex('#7d4b31'),
  cloak: hex('#c92f3b'), cloakDark: hex('#9e2230'),
  blouse: hex('#f8f2e7'), bodice: hex('#2f3654'), skirt: hex('#40639f'), apron: hex('#f5eedf'),
  sock: hex('#f4eee4'), shoe: hex('#4e2b20'), sole: hex('#2e1a14'), eye: hex('#2a1913'), mouth: hex('#a24646'),
  ribbon: hex('#f6efe1'), wicker: hex('#c48d50'), wickerDark: hex('#94633a'), cloth: hex('#f8f4ec'), check: hex('#d8414a'),
  bread: hex('#d9a35f'), flower: hex('#4a74e0'), flowerC: hex('#f6d35a'),
};
const HEAD = { rx: 0.145, ry: 0.138, rz: 0.14, cy: 0.15 };
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const Z = V(0, 0, 1);

const ell = (rx, ry, rz, seg = 14) => new THREE.SphereGeometry(1, seg, Math.ceil(seg * 0.7)).scale(rx, ry, rz);
const lathe = (pts, seg = 24, p0 = 0, pl = Math.PI * 2) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg, p0, pl);
function limb(r0, r1, len, seg = 10) {
  const g = new THREE.CylinderGeometry(r0, r1, len, seg, 2, true).translate(0, -len / 2, 0);
  return mergeGeometries([g.toNonIndexed(), ell(r0, r0, r0, seg).toNonIndexed()].map((x) => { x.deleteAttribute('uv'); return x; }));
}
const tube = (pts, r, seg = 40) => new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, r, 6, false);

// 头部椭球表面上的点与朝外法线
function headPoint(x, y, lift = 0) {
  const { rx, ry, rz, cy } = HEAD, dy = y - cy;
  const z = rz * Math.sqrt(Math.max(0.02, 1 - (x / rx) ** 2 - (dy / ry) ** 2));
  const n = V(x / rx ** 2, dy / ry ** 2, z / rz ** 2).normalize();
  return { at: V(x, y, z).addScaledVector(n, lift), q: new THREE.Quaternion().setFromUnitVectors(Z, n) };
}

class Rig {
  constructor() { this.b = {}; this.parts = new Map(); }
  bone(name, parent, x = 0, y = 0, z = 0) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    if (parent) this.b[parent].add(g);
    this.b[name] = g;
    return g;
  }
  add(bone, geo, color, o = {}) {
    if (o.scale) geo.scale(...o.scale);
    if (o.rot) geo.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...o.rot, o.order || 'XYZ')));
    if (o.q) geo.applyQuaternion(o.q);
    if (o.at) geo.translate(o.at.x ?? o.at[0], o.at.y ?? o.at[1], o.at.z ?? o.at[2]);
    const key = bone + '|' + (o.mat || 'body');
    if (!this.parts.has(key)) this.parts.set(key, []);
    this.parts.get(key).push(finalize(geo, color));
  }
  build(mats) {
    for (const [key, list] of this.parts) {
      const [b, m] = key.split('|');
      this.b[b].add(new THREE.Mesh(mergeGeometries(list), mats[m]));
    }
  }
}

export class Girl {
  constructor() {
    const mats = {
      body: uberMat({ always: true, side: THREE.DoubleSide }),
      cloak: uberMat({ always: true, cloak: true, side: THREE.DoubleSide }),
      skirt: uberMat({ always: true, cloak: true, side: THREE.DoubleSide }),
    };
    mats.cloak.uniforms.uCloakY.value.set(0.25, -0.18);
    mats.skirt.uniforms.uCloakY.value.set(0.05, -0.15);
    this.mats = mats;
    const r = (this.rig = new Rig());
    const b = r.b;

    // ——— 骨骼 ———
    r.bone('root', null);
    b.root.scale.setScalar(1.12);
    r.bone('body', 'root');
    r.bone('hips', 'body', 0, 0.40, 0);
    r.bone('torso', 'body', 0, 0.43, 0);
    r.bone('head', 'torso', 0, 0.27, 0);
    for (const [s, k] of [[1, 'L'], [-1, 'R']]) {
      r.bone('thigh' + k, 'hips', s * 0.052, 0, 0);
      r.bone('shin' + k, 'thigh' + k, 0, -0.185, 0);
      r.bone('foot' + k, 'shin' + k, 0, -0.175, 0);
      r.bone('arm' + k, 'torso', s * 0.098, 0.222, 0);
      r.bone('fore' + k, 'arm' + k, 0, -0.125, 0);
      r.bone('hand' + k, 'fore' + k, 0, -0.115, 0);
    }
    this.root = b.root;

    // ——— 腿：膝盖露一点，白色及膝袜，玛丽珍鞋 ———
    for (const k of ['L', 'R']) {
      r.add('thigh' + k, limb(0.046, 0.038, 0.185), PAL.skin);
      r.add('shin' + k, limb(0.037, 0.03, 0.175), (v) => (v.y < -0.035 ? PAL.sock : PAL.skin));
      r.add('shin' + k, new THREE.TorusGeometry(0.036, 0.007, 6, 14).rotateX(Math.PI / 2), PAL.sock, { at: [0, -0.038, 0] });
      r.add('foot' + k, ell(0.043, 0.034, 0.074), PAL.shoe, { at: [0, -0.012, 0.024] });
      r.add('foot' + k, ell(0.046, 0.011, 0.078), PAL.sole, { at: [0, -0.038, 0.024] });
      r.add('foot' + k, new THREE.TorusGeometry(0.036, 0.005, 5, 12, Math.PI).rotateY(Math.PI / 2), PAL.shoe, { at: [0, -0.008, 0.03] });
    }

    // ——— 裙子、衬裙花边、围裙（挂在胯骨上） ———
    const skirt = lathe([[0.19, -0.14], [0.176, -0.08], [0.142, 0], [0.104, 0.05], [0.088, 0.075]], 40);
    const sp = skirt.attributes.position;
    for (let i = 0; i < sp.count; i++) {
      const x = sp.getX(i), y = sp.getY(i), z = sp.getZ(i);
      const w = 1 + 0.055 * Math.sin(Math.atan2(x, z) * 10) * Math.max(0, (-0.02 - y) / 0.12);
      sp.setXYZ(i, x * w, y, z * w);
    }
    skirt.computeVertexNormals();
    r.add('hips', skirt, PAL.skirt, { mat: 'skirt' });
    const lace = lathe([[0.184, -0.158], [0.188, -0.146], [0.186, -0.134]], 40);
    const lp = lace.attributes.position;
    for (let i = 0; i < lp.count; i++) if (lp.getY(i) < -0.15) lp.setY(i, lp.getY(i) + 0.008 * Math.abs(Math.sin(Math.atan2(lp.getX(i), lp.getZ(i)) * 14)));
    r.add('hips', lace, PAL.ribbon, { mat: 'skirt' });
    r.add('hips', lathe([[0.183, -0.112], [0.168, -0.07], [0.138, 0], [0.104, 0.045]], 16, -0.9, 1.8), PAL.apron, { mat: 'skirt', scale: [1.035, 1, 1.035] });
    r.add('hips', lathe([[0.1, 0.045], [0.093, 0.068]], 24), PAL.apron, { scale: [1.04, 1, 1.04] });
    for (const s of [1, -1]) r.add('hips', ell(0.03, 0.018, 0.012), PAL.apron, { at: [s * 0.03, 0.06, -0.1], rot: [0, 0, s * 0.5] });

    // ——— 上身：深色束腰 + 交叉系带 + 白衬衫 + 圆领 ———
    r.add('torso', lathe([[0.088, -0.035], [0.084, 0.02], [0.092, 0.1], [0.098, 0.16], [0.09, 0.21], [0.07, 0.245], [0.034, 0.27], [0.03, 0.3]], 24),
      (v) => (v.y < 0.15 ? PAL.bodice : v.y < 0.27 ? PAL.blouse : PAL.skin), { scale: [1, 1, 0.86] });
    for (const y of [0.02, 0.06, 0.1]) for (const s of [1, -1])
      r.add('torso', new THREE.BoxGeometry(0.05, 0.005, 0.004), PAL.ribbon, { at: [0, y + 0.018, 0.081], rot: [0, 0, s * 0.62] });
    for (const s of [1, -1]) r.add('torso', ell(0.04, 0.026, 0.008), PAL.ribbon, { at: [s * 0.032, 0.252, 0.05], rot: [-0.9, 0, -s * 0.35] });

    // ——— 斗篷：前襟敞开，边缘包边，领口蝴蝶结 ———
    const gap = 0.62;
    const prof = [[0.262, -0.18], [0.255, -0.1], [0.238, 0], [0.212, 0.1], [0.178, 0.185], [0.128, 0.238], [0.076, 0.272]];
    // 往下摆越来越明显的布褶；包边也沿着同样的褶走
    const fold = (a, y) => { const t = Math.min(1, Math.max(0, (0.16 - y) / 0.34)); return 1 + 0.045 * Math.sin(a * 9 + 0.6) * t * t; };
    const onCloak = (rr, a, y) => V(rr * fold(a, y) * Math.sin(a), y, rr * fold(a, y) * Math.cos(a) * 0.92);
    const cloak = lathe(prof, 48, gap, Math.PI * 2 - gap * 2);
    const cp = cloak.attributes.position;
    for (let i = 0; i < cp.count; i++) {
      const x = cp.getX(i), y = cp.getY(i), z = cp.getZ(i), f = fold(Math.atan2(x, z), y);
      cp.setXYZ(i, x * f, y, z * f);
    }
    cloak.computeVertexNormals();
    r.add('torso', cloak, (v) => PAL.cloak.clone().multiplyScalar(0.84 + 0.16 * Math.min(1, (v.y + 0.18) / 0.4)), { mat: 'cloak', scale: [1, 1, 0.92] });
    for (const s of [1, -1]) r.add('torso', tube(prof.map(([rr, y]) => onCloak(rr, s * gap, y)), 0.008, 24), PAL.cloakDark, { mat: 'cloak' });
    const hem = Array.from({ length: 65 }, (_, i) => onCloak(0.263, gap + (i / 64) * (Math.PI * 2 - gap * 2), -0.18));
    r.add('torso', tube(hem, 0.008, 64), PAL.cloakDark, { mat: 'cloak' });
    r.add('torso', ell(0.017, 0.015, 0.012), PAL.ribbon, { at: [0, 0.262, 0.074] });
    for (const s of [1, -1]) {
      r.add('torso', ell(0.03, 0.017, 0.01), PAL.ribbon, { at: [s * 0.03, 0.266, 0.07], rot: [0, -s * 0.3, s * 0.4] });
      r.add('torso', new THREE.BoxGeometry(0.014, 0.065, 0.004), PAL.ribbon, { at: [s * 0.014, 0.222, 0.08], rot: [0.12, 0, s * 0.18] });
    }

    // ——— 手臂：泡泡袖 + 小手；右手提篮子 ———
    for (const k of ['L', 'R']) {
      r.add('arm' + k, ell(0.042, 0.046, 0.042), PAL.blouse, { at: [0, -0.025, 0] });
      r.add('arm' + k, limb(0.03, 0.027, 0.125), PAL.skin);
      r.add('fore' + k, limb(0.027, 0.024, 0.115), PAL.skin);
      r.add('hand' + k, ell(0.03, 0.036, 0.026), PAL.skin, { at: [0, -0.024, 0.004] });
      r.add('hand' + k, ell(0.011, 0.018, 0.011), PAL.skin, { at: [k === 'L' ? -0.022 : 0.022, -0.012, 0.016], rot: [0.3, 0, k === 'L' ? 0.5 : -0.5] });
    }
    this.buildBasket(r);
    this.buildHead(r);
    r.build(mats);
    this.b = b;
    this.blinkT = 2;
    this.basketSwing = 0; this.basketVel = 0;
    this.braidSwing = 0; this.braidVel = 0;
    this.prevYaw = null;
  }

  buildBasket(r) {
    r.bone('basket', 'handR', 0, -0.03, 0.012);
    r.add('basket', new THREE.TorusGeometry(0.075, 0.008, 6, 20, Math.PI), PAL.wickerDark, { at: [0, -0.075, 0] });
    const body = lathe([[0.001, -0.17], [0.07, -0.168], [0.088, -0.14], [0.095, -0.1], [0.1, -0.078]], 28);
    r.add('basket', body, (v) => {
      const band = Math.floor((v.y + 0.2) / 0.011) % 2;
      const weave = Math.floor((Math.atan2(v.x, v.z) + Math.PI) / (Math.PI / 14) + band) % 2;
      return (weave ? PAL.wicker : PAL.wickerDark).clone().multiplyScalar(band ? 1 : 0.92);
    });
    r.add('basket', new THREE.TorusGeometry(0.1, 0.009, 6, 28).rotateX(Math.PI / 2), PAL.wickerDark, { at: [0, -0.078, 0] });
    r.add('basket', ell(0.09, 0.03, 0.09, 18), (v) => ((Math.floor(v.x / 0.022 + 50) + Math.floor(v.z / 0.022 + 50)) % 2 ? PAL.check : PAL.cloth), { at: [0, -0.078, 0] });
    r.add('basket', ell(0.05, 0.035, 0.012), (v) => ((Math.floor(v.x / 0.02 + 50) + Math.floor(v.y / 0.02 + 50)) % 2 ? PAL.check : PAL.cloth), { at: [0.02, -0.1, 0.098], rot: [0.2, 0, 0.3] });
    r.add('basket', ell(0.045, 0.028, 0.03), PAL.bread, { at: [-0.035, -0.055, -0.02], rot: [0, 0.4, 0.3] });
    for (const [x, z, c] of [[0.04, 0.03, PAL.flower], [0.055, -0.01, hex('#6d8ff0')], [0.025, 0.05, PAL.flowerC]]) {
      r.add('basket', ell(0.016, 0.01, 0.016, 8), c, { at: [x, -0.045, z] });
      r.add('basket', ell(0.005, 0.005, 0.005, 6), PAL.flowerC, { at: [x, -0.037, z] });
    }
  }

  buildHead(r) {
    const { cy } = HEAD;
    r.add('head', limb(0.032, 0.03, 0.06), PAL.skin, { at: [0, 0.035, 0] });
    r.add('head', ell(HEAD.rx, HEAD.ry, HEAD.rz, 24), PAL.skin, { at: [0, cy, 0] });
    for (const s of [1, -1]) r.add('head', ell(0.06, 0.055, 0.06), PAL.skin, { at: [s * 0.058, cy - 0.055, 0.062] });

    // 眼睛（单独骨骼，方便眨眼）
    for (const [s, k] of [[1, 'L'], [-1, 'R']]) {
      const p = headPoint(s * 0.054, cy - 0.006, -0.004);
      const eye = r.bone('eye' + k, 'head', p.at.x, p.at.y, p.at.z);
      eye.quaternion.copy(p.q);
      r.add('eye' + k, ell(0.021, 0.029, 0.009), PAL.eye);
      r.add('eye' + k, ell(0.0068, 0.0078, 0.003), PAL.ribbon, { at: [s * 0.006, 0.01, 0.008] });
      r.add('eye' + k, ell(0.0035, 0.0035, 0.002), PAL.ribbon, { at: [-s * 0.007, -0.012, 0.008] });
      r.add('eye' + k, new THREE.TorusGeometry(0.024, 0.0032, 4, 12, Math.PI * 0.82), PAL.eye, { rot: [0, 0, Math.PI * 0.09], at: [0, 0.003, 0.004] });
      r.add('eye' + k, new THREE.BoxGeometry(0.012, 0.0035, 0.003), PAL.eye, { at: [s * 0.024, 0.017, 0.004], rot: [0, 0, s * 0.6] });
      const br = headPoint(s * 0.056, cy + 0.044, 0.002);
      r.add('head', new THREE.BoxGeometry(0.032, 0.0055, 0.004), PAL.hair, { q: br.q, at: br.at, rot: [0, 0, s * 0.14] });
      const ch = headPoint(s * 0.09, cy - 0.04, 0.003);
      r.add('head', ell(0.026, 0.015, 0.004), PAL.blush, { q: ch.q, at: ch.at });
    }
    const nose = headPoint(0, cy - 0.028, 0.002);
    r.add('head', ell(0.011, 0.009, 0.008), PAL.skinShade, { at: nose.at });
    const m = headPoint(0, cy - 0.062, 0.001);
    r.add('head', new THREE.TorusGeometry(0.013, 0.0028, 4, 10, Math.PI * 0.7), PAL.mouth, { rot: [0, 0, Math.PI * 1.15], q: m.q, at: m.at });

    // 头发：头顶 + 后脑 + 刘海发绺 + 鬓角 + 两条麻花辫
    const g = 0.012;
    r.add('head', new THREE.SphereGeometry(1, 28, 10, 0, Math.PI * 2, 0, 0.85), (v) => (v.y > 0.95 ? PAL.hairLight : PAL.hair), { scale: [HEAD.rx + g, HEAD.ry + g, HEAD.rz + g], at: [0, cy + 0.004, -0.004] });
    r.add('head', new THREE.SphereGeometry(1, 28, 14, Math.PI / 2 + 1.05, Math.PI * 2 - 2.1, 0.7, 1.55), PAL.hair, { scale: [HEAD.rx + g, HEAD.ry + g, HEAD.rz + g], at: [0, cy + 0.004, -0.004] });
    // 发绺：下端收尖的扁椭球，彼此重叠成一整片刘海
    const lock = (rx, ry, rz) => {
      const geo = ell(rx, ry, rz, 12), p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < 0) p.setX(i, p.getX(i) * (1 + 0.6 * y / ry)); }
      geo.computeVertexNormals();
      return geo;
    };
    for (let i = -4; i <= 4; i++) {
      const x = i * 0.021;
      const p = headPoint(x, cy + 0.088 - x * x * 2.2 + (i % 2 ? 0.006 : 0), 0.009);
      r.add('head', lock(0.019, 0.04, 0.008), (v) => (v.y > 0.012 ? PAL.hairLight : PAL.hair), { rot: [0, 0, -x * 2.2], q: p.q, at: p.at });
    }
    for (const s of [1, -1]) {
      const p = headPoint(s * 0.124, cy - 0.012, 0.006);
      r.add('head', lock(0.013, 0.062, 0.009), PAL.hair, { rot: [0, 0, s * 0.08], q: p.q, at: p.at });
    }
    this.braids = [];
    for (const [s, k] of [[1, 'L'], [-1, 'R']]) {
      let parent = 'head';
      const chain = [];
      for (let i = 0; i < 5; i++) {
        const name = `braid${k}${i}`;
        if (i === 0) r.bone(name, parent, s * 0.105, cy - 0.085, 0.045);
        else r.bone(name, parent, 0, -0.04, 0);
        r.add(name, ell(0.024 - i * 0.002, 0.027, 0.022 - i * 0.0015), i % 2 ? PAL.hairLight : PAL.hair, { at: [s * (i % 2 ? 0.004 : -0.004), -0.02, 0], rot: [0, 0, (i % 2 ? 1 : -1) * 0.35] });
        chain.push(r.b[name]);
        parent = name;
      }
      for (const t of [1, -1]) r.add(parent, ell(0.018, 0.01, 0.008), PAL.cloak, { at: [t * 0.016, -0.045, 0.006], rot: [0, 0, t * 0.5] });
      r.add(parent, ell(0.008, 0.008, 0.008), PAL.cloakDark, { at: [0, -0.045, 0.008] });
      r.add(parent, new THREE.ConeGeometry(0.016, 0.04, 8).rotateX(Math.PI), PAL.hair, { at: [0, -0.07, 0] });
      this.braids.push({ s, chain });
    }

    // 兜帽：开口框住脸，卷边，后面一个小尖
    const hs = [0.176, 0.17, 0.176], ho = V(0, cy + 0.012, -0.014), open = 0.98;
    r.add('head', new THREE.SphereGeometry(1, 32, 20, Math.PI / 2 + open, Math.PI * 2 - open * 2, 0, 2.3), PAL.cloak, { scale: hs, at: ho });
    const rim = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24, side = t < 0.5 ? -1 : 1, th = 2.25 * Math.abs(1 - 2 * t) + 0.04;
      const phi = Math.PI / 2 + side * open;
      rim.push(V(-Math.cos(phi) * Math.sin(th) * hs[0], Math.cos(th) * hs[1], Math.sin(phi) * Math.sin(th) * hs[2]).add(ho));
    }
    r.add('head', tube(rim, 0.013, 48), PAL.cloakDark);
    r.add('head', new THREE.ConeGeometry(0.05, 0.11, 12), PAL.cloak, { rot: [-2.2, 0, 0], at: [0, cy + 0.1, -0.17] });
  }

  // st: { walkAmt 0..1, run 0..1, phase, hop -1|0..1, look 0..1, wind }
  pose(st, t, dt = 1 / 60) {
    const b = this.b;
    const w = Math.min(1, st.walkAmt), run = st.run || 0;
    const s = Math.sin(st.phase), c = Math.cos(st.phase);
    const amp = (0.42 + 0.25 * run) * w;
    let tl = -s * amp, tr = s * amp;
    let kl = Math.max(0, c) * (0.75 + 0.4 * run) * w + 0.04, kr = Math.max(0, -c) * (0.75 + 0.4 * run) * w + 0.04;
    let bob = Math.abs(c) * (0.022 + 0.02 * run) * w;
    let lean = 0.05 * w + 0.12 * run;
    let al = s * (0.3 + 0.2 * run) * w, alz = 0.05, arx = -0.38 - s * 0.1 * w, arz = -0.1;
    const hop = st.hop >= 0 ? Math.sin(st.hop * Math.PI) : 0;
    if (st.hop >= 0) {
      tl = -0.75 * hop; tr = -0.25 * hop; kl = 1.0 * hop; kr = 0.7 * hop;
      bob = 0; lean = 0.15 * hop; al = -0.5 * hop; alz = 0.1 + 0.6 * hop; arz = -0.1 - 0.3 * hop;
    }
    const breathe = Math.sin(t * 2.1) * (1 - w);
    b.thighL.rotation.x = tl; b.thighR.rotation.x = tr;
    b.shinL.rotation.x = kl; b.shinR.rotation.x = kr;
    b.footL.rotation.x = -(tl + kl) * 0.7; b.footR.rotation.x = -(tr + kr) * 0.7;
    b.body.position.y = bob + 0.004 * breathe;
    b.hips.rotation.y = s * 0.1 * w;
    b.torso.rotation.set(lean, -s * 0.08 * w, 0);
    b.torso.scale.set(1, 1 + 0.008 * breathe, 1);
    b.armL.rotation.set(al, 0, alz); b.foreL.rotation.x = -0.22 - 0.25 * w - 0.4 * hop;
    b.armR.rotation.set(arx, 0, arz); b.foreR.rotation.x = -1.0 - 0.1 * hop;
    b.handR.rotation.x = 0.2;

    // 篮子：单摆，始终大致竖直
    const k = Math.min(1, dt * 60);
    this.basketVel += (-this.basketSwing * 0.08 + s * 0.012 * w - this.basketVel * 0.08) * k;
    this.basketSwing += this.basketVel * k;
    b.basket.rotation.x = -(lean + arx + b.foreR.rotation.x + 0.2) + this.basketSwing;
    b.basket.rotation.z = -arz + this.basketSwing * 0.4;

    // 头：仰望、东张西望、眨眼
    b.head.rotation.set(-0.5 * st.look - lean * 0.6 + Math.sin(t * 1.3) * 0.02, Math.sin(t * 0.6) * 0.12 * (1 - w) * (1 - st.look), Math.sin(t * 0.9) * 0.03 * (1 - w));
    this.blinkT -= dt;
    if (this.blinkT < -0.13) this.blinkT = 2 + ((t * 7.31) % 3);
    const eyeY = this.blinkT < 0 ? 0.12 : 1;
    b.eyeL.scale.y = b.eyeR.scale.y = eyeY;

    // 辫子：跟着步伐和转身甩动
    const yaw = this.root.rotation.y;
    const dyaw = this.prevYaw === null ? 0 : Math.atan2(Math.sin(yaw - this.prevYaw), Math.cos(yaw - this.prevYaw));
    this.prevYaw = yaw;
    this.braidVel += (-this.braidSwing * 0.1 - dyaw * 0.6 - this.braidVel * 0.12) * k;
    this.braidSwing += this.braidVel * k;
    for (const { s: side, chain } of this.braids) {
      chain.forEach((bone, i) => {
        const f = (i + 1) / chain.length;
        bone.rotation.x = (i === 0 ? -0.55 + st.look * 0.5 + lean : 0.16) + Math.sin(st.phase * 2 + i * 0.7) * 0.06 * w + hop * 0.25 * f;
        bone.rotation.z = side * (i === 0 ? 0.12 : 0.02) + this.braidSwing * 0.5 * f + Math.sin(t * 1.7 + i) * 0.02;
      });
    }

    // 斗篷与裙摆的飘动（顶点着色器）
    for (const [m, a] of [[this.mats.cloak, 1], [this.mats.skirt, 0.45]]) {
      const u = m.uniforms.uCloak.value;
      u.x += ((w * 0.6 + run * 0.5 + hop * 0.8 + st.wind * 0.35) * a - u.x) * Math.min(1, dt * 5);
      u.y = (0.35 + w * 0.9 + run * 0.5) * a;
      u.w = st.phase * 2.0 + t * 2.0;
    }
  }
}
