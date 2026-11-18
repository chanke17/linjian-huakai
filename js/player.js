import * as THREE from 'three';
import { pathX, streamZ, terrainH, WATER_Y, smoothstep } from './terrain.js';

const STRIDE = 0.46;
const WALK = 1.55, RUN = 3.1;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// 键盘 + 鼠标拖拽/滚轮 + 触控多指/虚拟摇杆
export class Input {
  constructor(el) {
    this.keys = new Set();
    this.stick = { x: 0, z: 0 };
    this.dYaw = 0; this.dPitch = 0; this.dZoom = 0;
    this.lastDrag = -1e9; this.jump = false; this.touched = false;
    const watch = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight'];
    addEventListener('keydown', (e) => {
      if (!watch.includes(e.code)) return;
      e.preventDefault();
      if (e.code === 'Space' && !e.repeat) this.jump = true;
      this.keys.add(e.code);
      this.touched = true;
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.stick.x = 0; this.stick.z = 0; });

    const pts = new Map();
    let pinchDist = 0;
    const getPinch = () => {
      const [a, b] = [...pts.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    el.addEventListener('pointerdown', (e) => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      el.setPointerCapture(e.pointerId);
      if (pts.size === 2) pinchDist = getPinch();
    });
    el.addEventListener('pointermove', (e) => {
      const prev = pts.get(e.pointerId);
      if (!prev) return;
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      prev.x = e.clientX; prev.y = e.clientY;
      if (pts.size === 1) {
        this.dYaw -= dx * 0.006;
        this.dPitch += dy * 0.005;
        this.lastDrag = performance.now();
      } else if (pts.size === 2) {
        const d = getPinch();
        if (pinchDist > 0) this.dZoom += (pinchDist - d) * 0.0045;
        pinchDist = d;
      }
    });
    const endPtr = (e) => {
      pts.delete(e.pointerId);
      if (pts.size === 2) pinchDist = getPinch();
    };
    el.addEventListener('pointerup', endPtr);
    el.addEventListener('pointercancel', endPtr);
    el.addEventListener('wheel', (e) => { this.dZoom += e.deltaY * 0.0015; e.preventDefault(); }, { passive: false });
  }
  setStick(x, z) {
    this.stick.x = x;
    this.stick.z = z;
    if (x !== 0 || z !== 0) this.touched = true;
  }
  axis() {
    const k = this.keys, on = (...c) => c.some((x) => k.has(x));
    const kx = (on('KeyD', 'ArrowRight') ? 1 : 0) - (on('KeyA', 'ArrowLeft') ? 1 : 0);
    const kz = (on('KeyW', 'ArrowUp') ? 1 : 0) - (on('KeyS', 'ArrowDown') ? 1 : 0);
    const mag = Math.hypot(this.stick.x, this.stick.z);
    if (mag > 0.08) {
      return { x: this.stick.x, z: this.stick.z, run: mag > 0.78 || on('ShiftLeft', 'ShiftRight') };
    }
    return { x: kx, z: kz, run: on('ShiftLeft', 'ShiftRight') };
  }
}

// 第三人称控制：相对镜头方向移动，撞树滑开，不能下水，踩石头自动跳
export class Player {
  constructor(world) {
    this.stones = world.stones;
    this.colliders = world.colliders;
  }

  reset(pos, facing = Math.PI) {
    this.pos = pos.clone();
    this.facing = facing;
    this.vel = new THREE.Vector2();
    this.phase = 0; this.run = 0; this.look = 0;
    this.hop = null;
    this.support = this.supportAt(pos.x, pos.z);
    this.pos.y = this.support.y;
  }

  supportAt(x, z) {
    for (let i = 0; i < this.stones.length; i++) {
      const s = this.stones[i];
      if (Math.hypot(x - s.x, z - s.z) < s.r * 1.02) return { id: i, y: s.top };
    }
    const h = terrainH(x, z);
    const inStream = Math.abs(z - streamZ(x)) < 3.1;
    return inStream && h < WATER_Y + 0.04 ? { id: 'water', y: WATER_Y } : { id: -1, y: Math.max(h, WATER_Y) };
  }

  blocked(x, z) {
    if (z > 38 || z < -62 || Math.abs(x - pathX(z)) > 26) return true;
    for (const c of this.colliders) {
      const dx = x - c.x, dz = z - c.z, rr = c.r + 0.2;
      if (dx * dx + dz * dz < rr * rr) return true;
    }
    return false;
  }

  startHop(x, z, sup, dur = 0.42, h = 0.24) {
    this.hop = { a: this.pos.clone(), b: new THREE.Vector3(x, sup.y, z), t: 0, dur, h, sup };
    const dx = x - this.pos.x, dz = z - this.pos.z;
    if (dx * dx + dz * dz > 1e-4) this.facing = Math.atan2(dx, dz);
  }

  // 从当前位置沿方向找下一块可落脚的地方（石头或岸）
  findLanding(dx, dz) {
    let best = null, bd = 1e9;
    this.stones.forEach((s, i) => {
      if (i === this.support.id) return;
      const ox = s.x - this.pos.x, oz = s.z - this.pos.z, d = Math.hypot(ox, oz);
      if ((ox * dx + oz * dz) / (d || 1) > 0.55 && d < 1.3 && d < bd) { bd = d; best = { x: s.x, z: s.z, sup: { id: i, y: s.top } }; }
    });
    if (best) return best;
    for (let d = 0.45; d <= 1.3; d += 0.1) {
      const gx = this.pos.x + dx * d, gz = this.pos.z + dz * d, s = this.supportAt(gx, gz);
      if (s.id === -1 && !this.blocked(gx, gz)) return { x: gx + dx * 0.15, z: gz + dz * 0.15, sup: this.supportAt(gx + dx * 0.15, gz + dz * 0.15) };
    }
    return null;
  }

  update(dt, input, camYaw, nearTree) {
    const a = input.axis();
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
    let mx = fx * a.z - fz * a.x, mz = fz * a.z + fx * a.x;
    const ml = Math.hypot(mx, mz);
    if (ml > 0) { mx /= ml; mz /= ml; }
    const speed = ml > 0 ? (a.run ? RUN : WALK) : 0;
    const k = 1 - Math.exp(-dt * 9);
    this.vel.x += (mx * speed - this.vel.x) * k;
    this.vel.y += (mz * speed - this.vel.y) * k;
    this.run += ((a.run && ml > 0 ? 1 : 0) - this.run) * k;
    let sp = this.vel.length();
    let landed = null;

    if (this.hop) {
      const h = this.hop;
      h.t = Math.min(1, h.t + dt / h.dur);
      const e = h.t * h.t * (3 - 2 * h.t);
      this.pos.lerpVectors(h.a, h.b, e);
      this.pos.y += Math.sin(h.t * Math.PI) * h.h;
      if (h.t >= 1) {
        this.pos.copy(h.b);
        this.support = h.sup;
        landed = this.pos.clone();
        this.hop = null;
      }
      input.jump = false;
    } else if (input.jump) {
      input.jump = false;
      const dx = Math.sin(this.facing), dz = Math.cos(this.facing), reach = sp > 0.3 ? 0.4 + sp * 0.3 : 0;
      let tx = this.pos.x + dx * reach, tz = this.pos.z + dz * reach;
      let sup = this.supportAt(tx, tz);
      if (sup.id === 'water' || this.blocked(tx, tz)) {
        const l = sup.id === 'water' ? this.findLanding(dx, dz) : null;
        if (l) { tx = l.x; tz = l.z; sup = l.sup; } else { tx = this.pos.x; tz = this.pos.z; sup = this.support; }
      }
      this.startHop(tx, tz, sup, 0.55, 0.38);
    } else if (sp > 0.02) {
      const dx = this.vel.x / sp, dz = this.vel.y / sp;
      const nx = this.pos.x + this.vel.x * dt, nz = this.pos.z + this.vel.y * dt;
      let tx = nx, tz = nz;
      if (this.blocked(tx, tz)) {
        if (!this.blocked(nx, this.pos.z)) tz = this.pos.z;
        else if (!this.blocked(this.pos.x, nz)) tx = this.pos.x;
        else { tx = this.pos.x; tz = this.pos.z; }
      }
      const sup = this.supportAt(tx, tz);
      if (sup.id === 'water') {
        const l = this.findLanding(dx, dz);
        if (l) this.startHop(l.x, l.z, l.sup);
        else { this.vel.multiplyScalar(0.3); sp = 0; }
      } else if (sup.id !== this.support.id && (sup.id !== -1 || this.support.id !== -1)) {
        if (sup.id === -1) this.startHop(tx + dx * 0.3, tz + dz * 0.3, this.supportAt(tx + dx * 0.3, tz + dz * 0.3));
        else this.startHop(this.stones[sup.id].x, this.stones[sup.id].z, sup);
      } else {
        this.pos.set(tx, sup.y, tz);
        this.support = sup;
      }
    }
    if (!this.hop) this.phase += (sp * dt / STRIDE) * Math.PI;
    if (sp > 0.05 && !this.hop) this.facing += wrap(Math.atan2(this.vel.x, this.vel.y) - this.facing) * Math.min(1, dt * 10);
    this.look += ((nearTree && sp < 0.1 && !this.hop ? 1 : 0) - this.look) * Math.min(1, dt * 1.5);

    return {
      pos: this.pos.clone(), facing: this.facing,
      walkAmt: this.hop ? 0 : Math.min(1, sp / WALK), run: this.run * smoothstep(WALK, RUN, sp),
      phase: this.phase, hop: this.hop ? this.hop.t : -1, look: this.look, wind: 0, landed,
    };
  }
}

// 跟随镜头：鼠标拖拽转视角、滚轮远近；走动时慢慢回到身后
export class OrbitCam {
  constructor() { this.yaw = Math.PI; this.pitch = 0.3; this.dist = 4.4; }
  desired(dt, input, girlPos, facing, moving, colliders = []) {
    this.yaw += input.dYaw;
    this.pitch = clamp(this.pitch + input.dPitch, 0.02, 1.15);
    this.dist = clamp(this.dist * (1 + input.dZoom), 2.0, 11);
    input.dYaw = input.dPitch = input.dZoom = 0;
    if (moving && performance.now() - input.lastDrag > 1500) this.yaw += wrap(facing - this.yaw) * (1 - Math.exp(-dt * 1.1));
    const look = girlPos.clone().add(new THREE.Vector3(0, 0.8, 0));
    const f = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    // 镜头被灌木/树干挡住就往前收，避免钻进树丛
    const at = (d) => look.clone().addScaledVector(f, -d * Math.cos(this.pitch)).add(new THREE.Vector3(0, d * Math.sin(this.pitch), 0));
    const hit = (p) => colliders.some((c) => {
      const dx = p.x - c.x, dz = p.z - c.z, rr = c.r + 0.35;
      return dx * dx + dz * dz < rr * rr && p.y < terrainH(c.x, c.z) + c.h;
    });
    let d = this.dist, pos = at(d);
    for (let i = 0; i < 14 && hit(pos) && d > 1.2; i++) pos = at((d *= 0.86));
    return { pos, look };
  }
}
