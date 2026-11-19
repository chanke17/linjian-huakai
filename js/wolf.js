import * as THREE from 'three';
import { uberMat } from './materials.js';
import { hex, V, ell, lathe, limb, torus, tube, cyl, Rig } from './toy.js';

// 大灰狼（代码捏的占位版）：圆滚滚、戴着奶奶的粉睡帽和圆眼镜、穿波点睡裙、毛尾巴。
// 本地坐标 +z 朝前、脚底在原点；body 骨在髋部，躺着/坐起都绕这里转。
const C = {
  fur: hex('#8e939d'), furL: hex('#d6d9de'), furD: hex('#6d717a'), nose: hex('#2e2828'), mouth: hex('#4a3b38'),
  gown: hex('#f4b9c7'), lace: hex('#fbf6f0'), dot: hex('#ffffff'), cap: hex('#f7cdd8'), gold: hex('#d7ad4e'),
  pink: hex('#f2a0ae'), eye: hex('#231c1b'), tongue: hex('#ef7f8d'), star: hex('#ffd34d'),
};
const GOWN = [[0, -0.12], [0.37, -0.13], [0.385, -0.08], [0.36, 0.08], [0.31, 0.28], [0.28, 0.42], [0.23, 0.54], [0.14, 0.63], [0, 0.66]];
const gownR = (y) => {
  for (let i = 1; i < GOWN.length; i++) {
    const [r0, y0] = GOWN[i - 1], [r1, y1] = GOWN[i];
    if (y >= y0 && y <= y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
  }
  return 0.2;
};
const facing = (n) => new THREE.Quaternion().setFromUnitVectors(V(0, 0, 1), n.clone().normalize());

export class Wolf {
  constructor() {
    const r = new Rig(), b = r.b;
    r.bone('root', null);
    r.bone('body', 'root', 0, 0.34, 0);
    r.bone('torso', 'body');
    r.bone('head', 'torso', 0, 0.66, 0);
    r.bone('eyeL', 'head', 0.1, 0.27, 0.225); r.bone('eyeR', 'head', -0.1, 0.27, 0.225);
    r.bone('cap', 'head', 0, 0.38, -0.04);
    r.bone('glasses', 'head', 0, 0.27, 0.262);
    r.bone('legL', 'body', 0.12, 0, 0); r.bone('legR', 'body', -0.12, 0, 0);
    r.bone('armL', 'torso', 0.25, 0.5, 0); r.bone('armR', 'torso', -0.25, 0.5, 0);
    r.bone('tail', 'body', 0, 0.06, -0.28);
    r.bone('stars', 'head', 0, 0.66, 0);

    // 睡裙 + 蕾丝边 + 白波点
    r.add('torso', lathe(GOWN, 28), C.gown);
    r.add('torso', torus(0.385, 0.035, 6, 32), C.lace, { rot: [Math.PI / 2, 0, 0], at: [0, -0.115, 0] });
    r.add('torso', torus(0.16, 0.03, 6, 20), C.lace, { rot: [Math.PI / 2, 0, 0], at: [0, 0.6, 0] });
    for (let i = 0; i < 16; i++) {
      const a = i * 2.4, y = -0.02 + (i % 5) * 0.11, rr = gownR(y) + 0.004;
      const n = V(Math.sin(a), 0.25, Math.cos(a));
      r.add('torso', ell(0.035, 0.035, 0.008, 8), C.dot, { q: facing(n), at: [Math.sin(a) * rr, y, Math.cos(a) * rr] });
    }
    // 腿、脚
    for (const k of ['L', 'R']) {
      r.add('leg' + k, limb(0.075, 0.068, 0.22), C.fur);
      r.add('leg' + k, ell(0.095, 0.06, 0.15, 12), C.furL, { at: [0, -0.28, 0.05] });
      r.add('arm' + k, ell(0.11, 0.1, 0.11, 12), C.gown);
      r.add('arm' + k, limb(0.058, 0.052, 0.27), C.fur);
      r.add('arm' + k, ell(0.07, 0.065, 0.075, 10), C.furL, { at: [0, -0.31, 0.01] });
    }
    // 头
    r.add('head', ell(0.27, 0.245, 0.255, 20), C.fur, { at: [0, 0.2, 0] });
    for (const s of [-1, 1]) {
      r.add('head', ell(0.1, 0.08, 0.08, 10), C.furL, { at: [s * 0.22, 0.1, 0.07] });
      r.add('head', new THREE.ConeGeometry(0.085, 0.24, 12), C.fur, { rot: [0, 0, -s * 0.35], at: [s * 0.16, 0.44, -0.02] });
      r.add('head', new THREE.ConeGeometry(0.05, 0.16, 10), C.pink, { rot: [0, 0, -s * 0.35], at: [s * 0.158, 0.425, 0.014] });
      r.add('head', ell(0.045, 0.025, 0.012, 8), C.pink, { q: facing(V(s * 0.6, 0, 1)), at: [s * 0.165, 0.16, 0.21] });
      r.add('head', ell(0.045, 0.012, 0.01, 8), C.furD, { rot: [0, 0, -s * 0.2], at: [s * 0.1, 0.355, 0.218] });
    }
    r.add('head', ell(0.15, 0.115, 0.17, 16), C.furL, { at: [0, 0.11, 0.19] });
    r.add('head', ell(0.055, 0.04, 0.04, 10), C.nose, { at: [0, 0.16, 0.355] });
    r.add('head', ell(0.014, 0.01, 0.008, 6), C.lace, { at: [0.016, 0.178, 0.388] });
    r.add('head', tube([V(-0.06, 0.07, 0.325), V(-0.03, 0.05, 0.34), V(0, 0.06, 0.345), V(0.03, 0.05, 0.34), V(0.06, 0.07, 0.325)], 0.008, 16, 5), C.mouth);
    r.add('head', ell(0.026, 0.02, 0.012, 8), C.tongue, { at: [0.025, 0.04, 0.338] });
    for (const k of ['L', 'R']) {
      r.add('eye' + k, ell(0.038, 0.052, 0.022, 10), C.eye);
      r.add('eye' + k, ell(0.013, 0.013, 0.008, 6), C.lace, { at: [0.012, 0.018, 0.018] });
    }
    // 睡帽
    r.add('cap', torus(0.215, 0.04, 6, 24), C.lace, { rot: [Math.PI / 2, 0, 0] });
    r.add('cap', new THREE.ConeGeometry(0.21, 0.42, 18, 1, true), C.cap, { at: [0, 0.21, 0] });
    r.add('cap', torus(0.15, 0.012, 5, 20), C.lace, { rot: [Math.PI / 2, 0, 0], at: [0, 0.13, 0] });
    r.add('cap', torus(0.085, 0.011, 5, 16), C.lace, { rot: [Math.PI / 2, 0, 0], at: [0, 0.26, 0] });
    r.add('cap', ell(0.065, 0.065, 0.065, 10), C.lace, { at: [0, 0.43, 0] });
    // 眼镜
    for (const s of [-1, 1]) r.add('glasses', torus(0.062, 0.009, 6, 20), C.gold, { at: [s * 0.1, 0, 0] });
    r.add('glasses', cyl(0.007, 0.007, 0.08, 5), C.gold, { rot: [0, 0, Math.PI / 2], at: [0, 0.01, 0] });
    // 尾巴
    r.add('tail', ell(0.09, 0.09, 0.11, 10), C.fur, { at: [0, 0, -0.05] });
    r.add('tail', ell(0.1, 0.1, 0.11, 10), C.fur, { at: [0, 0.05, -0.16] });
    r.add('tail', ell(0.09, 0.09, 0.09, 10), C.fur, { at: [0, 0.12, -0.25] });
    r.add('tail', ell(0.075, 0.075, 0.075, 10), C.lace, { at: [0, 0.2, -0.3] });
    // 晕乎乎的小星星
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      r.add('stars', new THREE.OctahedronGeometry(0.06, 0), C.star, { scale: [1, 1, 0.35], at: [Math.cos(a) * 0.26, 0, Math.sin(a) * 0.26] });
    }

    r.build(uberMat({ always: true, side: THREE.DoubleSide }));
    this.b = b;
    this.root = b.root;
    this.root.scale.setScalar(0.95);
    b.stars.visible = false;
    this.capBase = b.cap.position.clone();
    this.glassesBase = b.glasses.position.clone();
    this.blinkT = 3;
    this._v = new THREE.Vector3();
  }

  headPos(out = this._v) { this.b.head.localToWorld(out.set(0, 0.2, 0)); out.y += 0.62; return out; }   // 头顶上方（躺着也朝上）

  // o: { mode: 'stand'|'lie'|'sit'|'floor', walk, run, phase, sleep, sitUp, sneeze, dizzy, wave, kick, look }
  pose(o, t, dt) {
    const b = this.b;
    const w = o.walk || 0, s = Math.sin(o.phase || 0), c = Math.cos(o.phase || 0);
    // 默认值
    b.body.position.set(0, 0.34, 0);
    b.body.rotation.set(0, 0, 0);
    b.torso.scale.set(1, 1, 1);
    b.head.rotation.set(0, 0, 0);
    b.tail.rotation.set(0.3, 0, 0);
    b.cap.position.copy(this.capBase);
    b.cap.rotation.set(-0.35, 0, 0.45);
    b.glasses.position.copy(this.glassesBase);
    let legX = [0, 0], armX = [0.1, 0.1], armZ = [0.3, -0.3];

    if (o.mode === 'stand') {
      const amp = (0.55 + 0.25 * (o.run || 0)) * w;
      legX = [-s * amp, s * amp];
      const reach = o.reach || 0;   // 追的时候两手往前伸（想要派）
      armX = [s * amp * 0.8 - reach * 1.1, -s * amp * 0.8 - reach * 1.1];
      armZ = [0.3 - reach * 0.15, -0.3 + reach * 0.15];
      b.body.position.y = 0.34 + Math.abs(c) * 0.035 * w;
      b.body.rotation.set(0.08 * w, -s * 0.08 * w, s * 0.07 * w);
      b.head.rotation.set(-0.06 * w + Math.sin(t * 1.7) * 0.03, (o.look || 0) + Math.sin(t * 0.7) * 0.1 * (1 - w), Math.sin(t * 1.1) * 0.04);
      b.tail.rotation.set(0.3, Math.sin(t * (w > 0.1 ? 9 : 3)) * 0.45, 0);
      b.cap.rotation.z = 0.45 + s * 0.15 * w;
    } else if (o.mode === 'lie') {
      // 躺在床上（root 已经转成平躺）。sitUp 0..1 坐起来
      const up = o.sitUp || 0;
      b.body.rotation.x = up * 1.32;
      b.torso.scale.set(1, 1 + Math.sin(t * 1.6) * 0.02 * (1 - up), 1 + Math.sin(t * 1.6) * 0.03 * (1 - up));
      b.head.rotation.set(-0.15 * (1 - up), (o.look || 0) * up, Math.sin(t * 0.5) * 0.12 * (1 - up));
      armX = [0.05 - up * 0.3, 0.05 - up * 0.3];
      armZ = [0.12 + up * 0.1, -0.12 - up * 0.1];
      b.tail.rotation.set(0, -1.6, Math.sin(t * 1.3) * 0.25);   // 尾巴从被子边上露出来
      b.cap.rotation.set(-0.9 * (1 - up) - 0.35 * up, 0, 0.45);
    } else if (o.mode === 'floor' || o.mode === 'sit') {
      // 坐在地上（晕乎乎 / 被扣住）或坐在椅子上
      const chair = o.mode === 'sit';
      b.body.position.y = chair ? 0.5 : 0.13;
      b.body.rotation.x = chair ? -0.05 : -0.18;
      legX = [-1.45 + (o.kick ? Math.sin(t * 9) * 0.3 : 0), -1.45 - (o.kick ? Math.sin(t * 9) * 0.3 : 0)];
      armX = chair ? [-0.9, -0.9] : [-0.3, -0.3];
      armZ = chair ? [0.15, -0.15] : [0.5, -0.5];
      if (o.wave) armX = [-2.4 + Math.sin(t * 8) * 0.3, armX[1]];
      b.head.rotation.set(0, 0, o.dizzy ? Math.sin(t * 5) * 0.22 : Math.sin(t * 1.3) * 0.05);
      b.tail.rotation.set(1.2, Math.sin(t * 6) * 0.4, 0);
    }
    // 打喷嚏：先仰头憋气，再猛地往前，帽子弹起来
    if (o.sneeze >= 0 && o.sneeze !== undefined) {
      const k = o.sneeze;
      const back = k < 0.7 ? Math.sin((k / 0.7) * Math.PI * 0.5) : 1 - (k - 0.7) / 0.3;
      const snap = k > 0.7 ? Math.sin(((k - 0.7) / 0.3) * Math.PI) : 0;
      b.head.rotation.x += -0.35 * back + 0.6 * snap;
      b.cap.position.y += snap * 0.18;
      b.cap.rotation.x += snap * 0.8;
    }
    b.legL.rotation.x = legX[0]; b.legR.rotation.x = legX[1];
    b.armL.rotation.set(armX[0], 0, armZ[0]); b.armR.rotation.set(armX[1], 0, armZ[1]);
    b.glasses.position.y += -0.025 + Math.sin(t * 0.9) * 0.008;   // 眼镜老往下滑

    // 眼睛：睡着闭眼；醒着偶尔眨眼；晕的时候眯成一条缝
    this.blinkT -= dt;
    if (this.blinkT < -0.12) this.blinkT = 2.2 + ((t * 5.37) % 2.5);
    const closed = o.sleep || o.dizzy ? 0.12 : this.blinkT < 0 ? 0.15 : 1;
    b.eyeL.scale.y = b.eyeR.scale.y = closed;
    b.stars.visible = !!o.dizzy;
    if (o.dizzy) b.stars.rotation.y = t * 4;
  }
}
