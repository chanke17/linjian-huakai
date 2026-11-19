import * as THREE from 'three';
import { uberMat } from './materials.js';
import { hex, V, ell, limb, torus, tube, cyl, Rig } from './toy.js';

// 奶奶（代码捏的占位版）：白发髻、圆眼镜、笑眯眯，紫裙子 + 白围裙 + 玫瑰色披肩
const C = {
  dress: hex('#9d8cc8'), apron: hex('#f8f3e9'), shawl: hex('#d98e8e'), skin: hex('#f6dac6'), skinD: hex('#eec1a8'),
  hair: hex('#f3efe8'), eye: hex('#3a2c27'), gold: hex('#d7ad4e'), blush: hex('#f3a3a3'), sock: hex('#5b4a5e'), shoe: hex('#6b4430'),
};
const lathe = (pts, seg = 26, p0 = 0, pl = Math.PI * 2) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg, p0, pl);

export class Grandma {
  constructor() {
    const r = new Rig(), b = r.b;
    r.bone('root', null);
    r.bone('body', 'root', 0, 0.26, 0);
    r.bone('torso', 'body');
    r.bone('head', 'torso', 0, 0.52, 0);
    r.bone('legL', 'body', 0.09, 0, 0); r.bone('legR', 'body', -0.09, 0, 0);
    r.bone('armL', 'torso', 0.2, 0.42, 0); r.bone('armR', 'torso', -0.2, 0.42, 0);

    r.add('torso', lathe([[0, -0.1], [0.33, -0.11], [0.34, -0.06], [0.3, 0.12], [0.25, 0.3], [0.2, 0.42], [0.14, 0.5], [0, 0.52]]), C.dress);
    r.add('torso', lathe([[0.348, -0.05], [0.312, 0.12], [0.27, 0.27]], 14, -0.75, 1.5), C.apron);
    r.add('torso', torus(0.27, 0.012, 5, 24), C.apron, { rot: [Math.PI / 2, 0, 0], at: [0, 0.27, 0] });
    r.add('torso', lathe([[0.275, 0.27], [0.25, 0.34], [0.2, 0.44], [0.13, 0.52]]), C.shawl);
    r.add('torso', ell(0.04, 0.04, 0.03, 8), C.shawl, { at: [0, 0.44, 0.19] });
    for (const k of ['L', 'R']) {
      r.add('leg' + k, limb(0.05, 0.045, 0.16), C.sock);
      r.add('leg' + k, ell(0.06, 0.045, 0.1, 10), C.shoe, { at: [0, -0.21, 0.03] });
      r.add('arm' + k, limb(0.06, 0.05, 0.22), C.shawl);
      r.add('arm' + k, ell(0.045, 0.045, 0.045, 8), C.skin, { at: [0, -0.25, 0] });
    }
    r.add('head', ell(0.19, 0.18, 0.18, 18), C.skin, { at: [0, 0.17, 0] });
    r.add('head', ell(0.2, 0.15, 0.19, 18), C.hair, { at: [0, 0.255, -0.03] });
    r.add('head', ell(0.09, 0.085, 0.09, 12), C.hair, { at: [0, 0.38, -0.1] });
    r.add('head', torus(0.06, 0.012, 5, 14), C.dress, { rot: [Math.PI / 2 - 0.5, 0, 0], at: [0, 0.35, -0.09] });
    for (const s of [-1, 1]) {
      r.add('head', ell(0.07, 0.08, 0.08, 10), C.hair, { at: [s * 0.16, 0.2, -0.04] });
      r.add('head', tube([V(s * 0.09, 0.19, 0.165), V(s * 0.065, 0.205, 0.172), V(s * 0.04, 0.19, 0.172)], 0.007, 8, 4), C.eye);
      r.add('head', torus(0.045, 0.006, 5, 16), C.gold, { at: [s * 0.065, 0.195, 0.182] });
      r.add('head', ell(0.035, 0.02, 0.01, 8), C.blush, { at: [s * 0.1, 0.13, 0.165] });
    }
    r.add('head', cyl(0.005, 0.005, 0.04, 4), C.gold, { rot: [0, 0, Math.PI / 2], at: [0, 0.2, 0.184] });
    r.add('head', ell(0.025, 0.022, 0.02, 8), C.skinD, { at: [0, 0.15, 0.185] });
    r.add('head', tube([V(-0.04, 0.1, 0.165), V(0, 0.085, 0.176), V(0.04, 0.1, 0.165)], 0.006, 8, 4), C.eye);

    r.build(uberMat({ always: true, side: THREE.DoubleSide }));
    this.b = b;
    this.root = b.root;
    this.root.scale.setScalar(0.95);
    this._v = new THREE.Vector3();
  }

  headPos(out = this._v) { this.b.head.localToWorld(out.set(0, 0.17, 0)); out.y += 0.48; return out; }

  // o: { mode: 'stand'|'sit', walk, phase, cheer, talk }
  pose(o, t) {
    const b = this.b;
    const w = o.walk || 0, s = Math.sin(o.phase || 0), c = Math.cos(o.phase || 0);
    b.body.position.set(0, 0.26, 0);
    b.body.rotation.set(0, 0, 0);
    let legX = [-s * 0.45 * w, s * 0.45 * w], armX = [s * 0.4 * w, -s * 0.4 * w], armZ = [0.25, -0.25];
    if (o.mode === 'sit') {
      b.body.position.y = 0.5;
      legX = [-1.45, -1.45];
      armX = [-0.8, -0.8]; armZ = [0.1, -0.1];
    } else {
      b.body.position.y = 0.26 + Math.abs(c) * 0.02 * w;
      b.body.rotation.set(0.05 * w, 0, s * 0.06 * w);
    }
    if (o.cheer) { armX = [-2.6 + Math.sin(t * 7) * 0.2, -2.6 - Math.sin(t * 7) * 0.2]; armZ = [0.4, -0.4]; }
    b.legL.rotation.x = legX[0]; b.legR.rotation.x = legX[1];
    b.armL.rotation.set(armX[0], 0, armZ[0]); b.armR.rotation.set(armX[1], 0, armZ[1]);
    b.head.rotation.set(Math.sin(t * 1.4) * 0.04 + (o.talk ? Math.sin(t * 9) * 0.05 : 0), Math.sin(t * 0.6) * 0.12 * (1 - w), Math.sin(t * 0.9) * 0.05);
  }
}
