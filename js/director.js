import * as THREE from 'three';
import { pathX, streamZ, terrainH, TREE, rng, smoothstep } from './terrain.js';
import { U } from './materials.js';
import { Player, OrbitCam } from './player.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const P = (z) => V(pathX(z), terrainH(pathX(z), z), z);
const STRIDE = 0.46;

// 沿小路的一段行走：梯形速度曲线（起步加速、收步减速）
function walkSeg(z0, z1, speed, ramp = 0.7) {
  const pts = [], len = [0];
  const n = Math.ceil(Math.abs(z1 - z0) / 0.2);
  for (let i = 0; i <= n; i++) pts.push(P(z0 + ((z1 - z0) * i) / n));
  for (let i = 1; i <= n; i++) len.push(len[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
  const D = len[n];
  return {
    type: 'walk', dur: D / speed + ramp,
    at(tau) {
      const T = this.dur;
      let s, v;
      if (tau < ramp) { s = (0.5 * speed * tau * tau) / ramp; v = (speed * tau) / ramp; }
      else if (tau > T - ramp) { const r = Math.max(0, T - tau); s = D - (0.5 * speed * r * r) / ramp; v = (speed * r) / ramp; }
      else { s = (speed * ramp) / 2 + speed * (tau - ramp); v = speed; }
      s = Math.min(D, Math.max(0, s));
      let i = 1;
      while (i < n && len[i] < s) i++;
      const k = (s - len[i - 1]) / Math.max(1e-6, len[i] - len[i - 1]);
      const pos = pts[i - 1].clone().lerp(pts[i], k);
      const dir = pts[i].clone().sub(pts[i - 1]);
      return { pos, dir, dist: s, walkAmt: Math.min(1, v / speed), phase: (s / STRIDE) * Math.PI };
    },
  };
}

export class Director {
  constructor(world, girl, mask, camera, input) {
    Object.assign(this, { world, girl, mask, camera, input });
    this.player = new Player(world);
    this.orbit = new OrbitCam();
    this.mode = 'play';
    const C = world.crossing;
    const segs = [];
    let t = 0;
    const add = (s) => { s.t0 = t; t += s.dur; s.t1 = t; segs.push(s); return s; };
    add({ type: 'wait', dur: 2.6, p: P(22) });
    add(walkSeg(22, C.z + 2.75, 1.5));
    this.tBank = t;
    add({ type: 'wait', dur: 1.0, p: P(C.z + 2.75), flood: true });
    let prev = P(C.z + 2.75);
    const hops = [...world.stones.map((s) => V(s.x, s.top, s.z)), P(C.z - 2.75)];
    for (const to of hops) {
      add({ type: 'hop', dur: 0.5, a: prev, b: to });
      add({ type: 'wait', dur: 0.16, p: to, land: true });
      prev = to;
    }
    this.tCrossEnd = t;
    add(walkSeg(C.z - 2.75, -21.2, 1.3, 1.1));
    add({ type: 'wait', dur: 1e9, p: P(-21.2), end: true });
    this.segs = segs;
    this.treeBase = world.tree.base;
    U.uTree.value.copy(this.treeBase);
    U.uBurstPos.value.copy(this.treeBase);
    U.uGroundMin.value = this.treeBase.y - 0.8;
    this.reset();
  }

  reset() {
    this.R = rng(42);
    this.segIdx = -1;
    this.lastStep = 0;
    this.bloomT = null;
    this.firstStamp = false;
    this.flooded = false;
    this.facing = Math.PI;
    this.phase = 0;
    this.camInit = false;
    this.player.reset(P(22), Math.PI);
    Object.assign(this.orbit, { yaw: Math.PI, pitch: 0.3, dist: 4.4 });
    this.mask.reset();
    U.uBloom.value = 0; U.uBurstR.value = 0; U.uSky.value = 0; U.uPetalT.value = -1;
  }

  state(t) {
    let i = this.segs.findIndex((s) => t < s.t1);
    if (i < 0) i = this.segs.length - 1;
    const s = this.segs[i], tau = t - s.t0;
    const st = { i, seg: s, walkAmt: 0, phase: this.phase, hop: -1, look: 0, wind: 0 };
    if (s.type === 'walk') {
      const w = s.at(tau);
      Object.assign(st, { pos: w.pos, walkAmt: w.walkAmt, phase: w.phase, dir: w.dir });
      this.phase = w.phase;
    } else if (s.type === 'hop') {
      const k = Math.min(1, tau / s.dur);
      const e = k * k * (3 - 2 * k);
      st.pos = s.a.clone().lerp(s.b, e);
      st.pos.y += Math.sin(k * Math.PI) * 0.28;
      st.dir = s.b.clone().sub(s.a);
      st.hop = k;
    } else {
      st.pos = s.p.clone();
      if (s.end) st.look = smoothstep(0.6, 3.0, tau);
    }
    return st;
  }

  stamp(x, z, r, t, o) { this.mask.add(x, z, r, t, o); }

  // 'play'：WASD 自己走；'auto'：按原来的路线自动演示
  setMode(mode) {
    if (mode === 'play' && this.mode === 'auto') {
      this.player.reset(this.girl.root.position, this.facing);
      this.orbit.yaw = this.facing;
    }
    this.mode = mode;
  }

  update(t, dt) {
    const R = this.R;
    const g = this.girl;
    let st;
    if (this.mode === 'play') {
      const nearTree = this.bloomT !== null && Math.hypot(this.player.pos.x - this.treeBase.x, this.player.pos.z - this.treeBase.z) < 8;
      st = this.player.update(dt, this.input, this.orbit.yaw, nearTree);
      this.facing = st.facing;
    } else {
      st = this.state(t);
      if (st.dir && st.dir.lengthSq() > 1e-6) {
        const target = Math.atan2(st.dir.x, st.dir.z);
        let d = target - this.facing;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        this.facing += d * Math.min(1, dt * 8);
      }
      st.run = 0;
    }
    g.root.position.copy(st.pos);
    g.root.rotation.y = this.facing;

    // ——— 颜色从脚下漫开 ———
    if (!this.firstStamp && t > (this.mode === 'play' ? 0.8 : 1.6)) {
      this.firstStamp = true;
      this.stamp(st.pos.x, st.pos.z, 4.2, t, { dur: 2.2 });
    }
    if (st.walkAmt > 0.15 && st.hop < 0) {
      const step = Math.floor(st.phase / Math.PI);
      if (step !== this.lastStep) {
        this.lastStep = step;
        const side = step % 2 ? 1 : -1;
        const fx = st.pos.x + Math.cos(this.facing) * 0.06 * side, fz = st.pos.z - Math.sin(this.facing) * 0.06 * side;
        this.stamp(fx, fz, 2.5 + R() * 0.6, t, { dur: 1.3 });
        const n = 1 + (R() < 0.6 ? 1 : 0);
        for (let k = 0; k < n; k++) {
          const a = R() * Math.PI * 2, d = 1.8 + R() * 2.6;
          this.stamp(fx + Math.cos(a) * d, fz + Math.sin(a) * d, 1.5 + R() * 1.1, t, { delay: 0.3 + R() * 0.9, dur: 1.8 });
        }
      }
    }
    // 走到溪边：颜色顺着溪水往两头流开（在哪儿碰到溪水就从哪儿开始）
    if (!this.flooded && Math.abs(st.pos.z - streamZ(st.pos.x)) < 2.95) {
      this.flooded = true;
      const x0 = st.pos.x;
      for (let k = 0; k < 34; k++) {
        for (const side of [-1, 1]) {
          if (k === 0 && side > 0) continue;
          const x = x0 + side * k * 1.3;
          this.stamp(x, streamZ(x) + (R() - 0.5) * 0.6, 3.6 + R() * 0.9, t, { delay: 0.25 + k * 0.085, dur: 1.2 });
        }
      }
    }
    if (this.mode === 'auto' && st.i !== this.segIdx) {
      this.segIdx = st.i;
      if (st.seg.land) this.stamp(st.seg.p.x, st.seg.p.z, 1.9, t, { dur: 0.9 });
    }
    if (st.landed) this.stamp(st.landed.x, st.landed.z, 1.9, t, { dur: 0.9 });

    // ——— 走近花树：开花、花瓣、颜色铺满整片林子 ———
    const dTree = Math.hypot(st.pos.x - this.treeBase.x, st.pos.z - this.treeBase.z);
    if (this.bloomT === null && dTree < 12.5) this.bloomT = t;
    if (this.bloomT !== null) {
      const b = t - this.bloomT;
      U.uBloom.value = smoothstep(0, 3.8, b);
      let r = 0;
      if (b < 2.6) r = 11.5 * (1 - Math.pow(1 - b / 2.6, 3));
      else if (b < 4.0) r = 11.5;
      else r = 11.5 + 140 * smoothstep(0, 1, (b - 4) / 7.5);
      U.uBurstR.value = r;
      U.uSky.value = smoothstep(5.0, 11.0, b);
      U.uPetalT.value = b - 0.6;
      st.wind = smoothstep(1, 4, b);
    }

    g.pose(st, t, dt);
    const ground = terrainH(st.pos.x, st.pos.z);
    U.uGirl.value.set(st.pos.x, st.pos.z, Math.max(0, st.pos.y - Math.max(ground, -0.05)), 0);

    this.updateCamera(t, dt, st);
  }

  shot(t, G) {
    const T = this.treeBase;
    const add = (x, y, z) => G.clone().add(V(x, y, z));
    if (t < 5.0) return { pos: add(3.8, 3.0, 8.5), look: add(-0.5, 1.2, -10) };
    if (t < this.tBank - 0.8) return { pos: add(2.4, 1.9, 5.2), look: add(0, 0.9, -6) };
    if (t < this.tCrossEnd + 1.2) {
      const C = this.world.crossing;
      return { pos: V(C.x + 6.2, 1.3, G.z + 1.8), look: V(G.x, G.y + 0.45, G.z - 0.6) };
    }
    const b = this.bloomT === null ? -1 : t - this.bloomT;
    if (b < 1.5) return { pos: add(-2.2, 1.35, 4.2), look: add(0.4, 2.4, -9) };
    const head = add(0, 1.1, 0), crown = T.clone().add(V(0, 5.2, 0));
    if (b < 8.5) return { pos: add(-3.6, 1.0, 7.0), look: head.clone().lerp(crown, 0.6), fov: 38 };
    // 收尾：慢慢绕到侧面，女孩在画面下方仰头，花树和蓝天在上方
    const k = smoothstep(8.5, 20, b);
    const off = V(-3.6, 1.0, 7.0).lerp(V(4.6, 0.95, -0.6), k);
    const endLook = G.clone().lerp(T, 0.4).setY(G.y + 1.9);
    return { pos: G.clone().add(off), look: head.clone().lerp(crown, 0.6).lerp(endLook, k), fov: 38 + 14 * k };
  }

  updateCamera(t, dt, st) {
    const play = this.mode === 'play';
    const want = play ? this.orbit.desired(dt, this.input, st.pos, this.facing, (st.walkAmt > 0.1 || st.hop >= 0) && this.input.axis().z > 0, this.world.colliders) : this.shot(t, st.pos);
    const cam = this.camera;
    if (!this.camInit) {
      this.camInit = true;
      this.camPos = want.pos.clone();
      this.camLook = want.look.clone();
      cam.fov = want.fov || 38;
      cam.updateProjectionMatrix();
    }
    this.camPos.lerp(want.pos, 1 - Math.exp(-dt * (play ? 7 : 1.6)));
    this.camLook.lerp(want.look, 1 - Math.exp(-dt * (play ? 12 : 2.2)));
    const minY = terrainH(this.camPos.x, this.camPos.z) + 0.35;
    if (this.camPos.y < minY) this.camPos.y = minY;
    cam.position.copy(this.camPos);
    cam.lookAt(this.camLook);
    const fov = want.fov || 38;
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov += (fov - cam.fov) * (1 - Math.exp(-dt * 1.5));
      cam.updateProjectionMatrix();
    }
    this.world.sky.position.copy(this.camPos);
  }
}
