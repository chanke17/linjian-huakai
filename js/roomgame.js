import * as THREE from 'three';
import { Player } from './player.js';
import { ColorMask } from './mask.js';
import { buildRoom, RU, ROOM, SPOT } from './room.js';
import { Wolf } from './wolf.js';
import { Grandma } from './grandma.js';
import { blobShadow, V } from './toy.js';
import { smoothstep } from './terrain.js';

// 第一章 · 奶奶家：趁大灰狼睡觉找钥匙、救奶奶、做陷阱，叫醒他引进陷阱，最后一起吃苹果派。
// 不会失败：被抓到只是被闻一闻篮子，回到门口重来，做好的陷阱都还在。

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const ITEM_NAME = { pepper: '胡椒瓶', key: '衣柜钥匙', yarn: '毛线团', laundry: '洗衣筐' };
const CHASE_LINES = ['派！派！我的派～', '别跑嘛～就尝一小口！', '好香的苹果派～', '等等我呀～'];

class RoomPlayer extends Player {
  constructor(boxes) { super({ stones: [], colliders: [] }); this.boxes = boxes; }
  supportAt() { return { id: -1, y: 0 }; }
  blocked(x, z) {
    if (x < ROOM.x0 + 0.3 || x > ROOM.x1 - 0.3 || z < ROOM.z0 + 0.3 || z > ROOM.z1 - 0.32) return true;
    for (const o of this.boxes) {
      if (o.girlPass) continue;
      const b = o.b;
      if (x > b[0] - 0.2 && x < b[1] + 0.2 && z > b[2] - 0.2 && z < b[3] + 0.2) return true;
    }
    return false;
  }
}

// 0.2m 一格的寻路网格（狼和奶奶用）
class Nav {
  constructor(boxes, pad) {
    this.cs = 0.2; this.nx = 40; this.nz = 35;
    this.free = new Uint8Array(this.nx * this.nz);
    for (let j = 0; j < this.nz; j++) for (let i = 0; i < this.nx; i++) {
      const x = ROOM.x0 + (i + 0.5) * this.cs, z = ROOM.z0 + (j + 0.5) * this.cs;
      let ok = x > ROOM.x0 + pad && x < ROOM.x1 - pad && z > ROOM.z0 + pad && z < ROOM.z1 - pad;
      for (const o of boxes) { const b = o.b; if (x > b[0] - pad && x < b[1] + pad && z > b[2] - pad && z < b[3] + pad) ok = false; }
      this.free[j * this.nx + i] = ok ? 1 : 0;
    }
  }
  cell(p) { return [Math.max(0, Math.min(this.nx - 1, Math.floor((p.x - ROOM.x0) / this.cs))), Math.max(0, Math.min(this.nz - 1, Math.floor((p.z - ROOM.z0) / this.cs)))]; }
  ok(i, j) { return i >= 0 && j >= 0 && i < this.nx && j < this.nz && this.free[j * this.nx + i] === 1; }
  center(i, j) { return V(ROOM.x0 + (i + 0.5) * this.cs, 0, ROOM.z0 + (j + 0.5) * this.cs); }
  nearest([i, j]) {
    for (let r = 0; r < 20; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      if (this.ok(i + di, j + dj)) return [i + di, j + dj];
    }
    return [i, j];
  }
  path(a, b) {
    const s = this.nearest(this.cell(a)), g = this.nearest(this.cell(b));
    const N = this.nx * this.nz, prev = new Int32Array(N).fill(-1), q = [s[1] * this.nx + s[0]];
    prev[q[0]] = q[0];
    const goal = g[1] * this.nx + g[0];
    for (let h = 0; h < q.length; h++) {
      const c = q[h];
      if (c === goal) break;
      const ci = c % this.nx, cj = (c / this.nx) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const ni = ci + di, nj = cj + dj;
        if (!this.ok(ni, nj) || (di && dj && (!this.ok(ci + di, cj) || !this.ok(ci, cj + dj)))) continue;
        const n = nj * this.nx + ni;
        if (prev[n] !== -1) continue;
        prev[n] = c; q.push(n);
      }
    }
    if (prev[goal] === -1) return [b.clone()];
    const out = [];
    for (let c = goal; c !== prev[c]; c = prev[c]) out.push(this.center(c % this.nx, (c / this.nx) | 0));
    out.reverse();
    return out;
  }
  los(a, b) {
    const d = dist2(a, b), n = Math.ceil(d / 0.1);
    for (let k = 1; k <= n; k++) { const p = a.clone().lerp(b, k / n); const [i, j] = this.cell(p); if (!this.ok(i, j)) return false; }
    return true;
  }
}

// 沿路径走的角色（狼 / 奶奶）
class Walker {
  constructor(nav, speed) { this.nav = nav; this.speed = speed; this.pos = V(); this.yaw = 0; this.path = []; this.repath = 0; this.phase = 0; this.moving = 0; }
  goTo(target, dt, speed = this.speed, every = 0.25) {
    this.repath -= dt;
    if (this.repath <= 0 || !this.path.length) { this.path = this.nav.path(this.pos, target); this.repath = every; }
    let wp = this.path[0];
    for (let k = Math.min(this.path.length - 1, 10); k > 0; k--) if (this.nav.los(this.pos, this.path[k])) { wp = this.path[k]; this.path.splice(0, k); break; }
    if (!wp) return true;
    const d = dist2(this.pos, wp);
    if (d < 0.12 && this.path.length > 1) this.path.shift();
    const left = dist2(this.pos, target);
    if (left < 0.15) { this.moving += (0 - this.moving) * Math.min(1, dt * 8); return true; }
    const dx = wp.x - this.pos.x, dz = wp.z - this.pos.z, l = Math.hypot(dx, dz) || 1;
    const sp = speed * Math.min(1, left / 0.4 + 0.3);
    this.pos.x += (dx / l) * sp * dt; this.pos.z += (dz / l) * sp * dt;
    this.yaw += wrap(Math.atan2(dx, dz) - this.yaw) * Math.min(1, dt * 8);
    this.phase += (sp * dt / 0.4) * Math.PI;
    this.moving += (Math.min(1, sp / speed) - this.moving) * Math.min(1, dt * 8);
    return false;
  }
  idle(dt) { this.moving += (0 - this.moving) * Math.min(1, dt * 8); }
}

export class RoomGame {
  constructor(camera, input, girl, hud) {
    Object.assign(this, { camera, input, girl, hud });
    const R = buildRoom();
    Object.assign(this, R);
    this.mask = new ColorMask({ minX: -4.6, minZ: -4.1, sizeX: 9.2, sizeZ: 8.2 }, 512);
    RU.uMask.value = this.mask.tex;
    RU.uMaskB.value.copy(this.mask.bounds);
    this.player = new RoomPlayer(this.boxes);
    this.wolf = new Wolf();
    this.grandma = new Grandma();
    this.scene.add(this.wolf.root, this.grandma.root);
    this.navWolf = new Nav(this.boxes, 0.34);
    this.navGran = new Nav(this.boxes, 0.3);
    this.ww = new Walker(this.navWolf, 2.0);
    this.gw = new Walker(this.navGran, 1.15);
    this.shadows = { girl: blobShadow(0.4), wolf: blobShadow(0.55), gran: blobShadow(0.4) };
    for (const s of Object.values(this.shadows)) this.scene.add(s);
    this.camPos = V(); this.camLook = V();
    this.laundryScale = 1.25;
    this.items.laundry.mesh.scale.setScalar(this.laundryScale);
    this.qLie = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    this._v = V();
  }

  // ——— 进屋 / 重来 ———
  enter(t) {
    this.scene.add(this.girl.root);
    this.reset(t);
  }

  reset(t) {
    this.t0 = t;
    this.phase = 'play';
    this.mask.reset();
    RU.uBurstR.value = 0;
    this.noise = 0;
    this.carry = null;
    this.st = { key: 'pillow', yarn: 'home', laundry: 'home', pepper: 'home', gran: 'inside', trapped: false, everHid: false, asked: false, sneezed: false, talkedTrap: false };
    for (const [k, it] of Object.entries(this.items)) { it.mesh.position.copy(it.home); it.mesh.rotation.copy(it.rot); it.mesh.visible = k !== 'key'; }
    this.items.laundry.mesh.scale.setScalar(this.laundryScale);
    this.trapRing.visible = false; this.yarnLine.visible = false; this.stick.visible = false;
    this.hump.visible = true;
    this.doorL.rotation.y = 0; this.doorR.rotation.y = 0;
    this.doorOpen = 0;
    this.queue = [];
    this.endStage = 0; this.endSaid = false; this.girlOverride = null; this.granHintT = 0;
    this.endWolfPose = null; this.endGranPose = null;
    if (this.pie) this.pie.visible = false;
    RU.uBurstPos.value.set(1.5, 0.8, 0.8);
    this.hud.clearBubbles();
    this.hud.end(false);
    this.player.reset(SPOT.door, Math.PI / 2);
    this.player.speedK = 1;
    this.facing = Math.PI / 2;
    this.wolfToBed();
    this.gw.pos.copy(SPOT.grandmaIn); this.gw.yaw = 0;
    this.grandma.root.visible = false;
    this.camInit = false;
    this.lastStep = 0;
    this.stamp(SPOT.door.x + 0.4, SPOT.door.z, 1.1, t, 1.2);
    this.intro(t);
  }

  wolfToBed() {
    this.ws = { s: 'sleep', t0: -1, sitUp: 0, sneeze: -1, roll: 0 };
    this.ww.pos.copy(SPOT.bedOut); this.ww.path = [];
    this.hump.visible = true;
  }

  stamp(x, z, r, t, dur = 1.4, delay = 0) { this.mask.add(x, z, r, t, { delay, dur }); }

  // ——— 台词队列 ———
  seq(t, lines) {
    let at = t;
    for (const l of lines) {
      at += l.d ?? 0;
      this.queue.push({ at, ...l });
      if (l.text) at += l.dur ?? 2.4;
    }
    this.queue.sort((x, y) => x.at - y.at);
  }
  anchor(who) {
    if (who === 'girl' || who === 'think') return () => this.girl.root.position.clone().add(V(0, this.crouch ? 1.05 : 1.45, 0));
    if (who === 'wolf' || who === 'zzz') return () => (this.ws.s === 'trapped' ? this.items.laundry.mesh.position.clone().add(V(0, 0.45, 0)) : this.wolf.headPos().clone());
    if (who === 'grandma') return () => (this.st.gran === 'inside' ? V(3.08, 2.45, -2.75) : this.grandma.headPos().clone());
    return () => V();
  }
  line(who, text, dur = 2.4) { this.hud.say(who === 'think' ? 'girl' : who === 'zzz' ? 'wolf' : who, this.anchor(who), text, dur, who); }

  intro(t) {
    const inside = () => this.st.gran === 'inside';
    const asleep = () => this.ws.s === 'sleep';
    this.seq(t, [
      { d: 0.6, fn: () => { this.ws.scriptSit = 0.55; } },
      { who: 'wolf', text: '咳咳……是小红帽呀？', dur: 2.2 },
      { who: 'wolf', text: '奶奶……有点困，先睡一会儿……', dur: 2.4, fn: () => {} },
      { fn: () => { this.ws.scriptSit = 0; } },
      { when: asleep, who: 'zzz', text: '呼——噜——', dur: 1.6 },
      { when: asleep, who: 'think', text: '奶奶的耳朵怎么尖尖的？被子外面还有一条毛尾巴……', dur: 3.2 },
      { when: inside, who: 'grandma', text: '咚咚！小红帽，我在衣柜里！床上那个是大灰狼！', dur: 3.2 },
      { when: inside, who: 'grandma', text: '钥匙在他枕头底下……千万别吵醒他哦！', dur: 3.0, fn: () => { this.st.heardKey = true; } },
      { when: inside, who: 'girl', text: '我一定要救出奶奶！', dur: 2.0 },
    ]);
  }

  // ——— 每帧 ———
  update(t, dt) {
    const inp = this.input;
    // 台词与脚本
    while (this.queue.length && this.queue[0].at <= t) {
      const q = this.queue.shift();
      if (q.when && !q.when()) continue;
      if (q.text) this.line(q.who, q.text, q.dur ?? 2.4);
      if (q.fn) q.fn(t);
    }

    // 女孩
    let st;
    if (this.phase === 'play') {
      st = this.player.update(dt, inp, Math.PI, false);
      this.facing = st.facing;
    } else {
      st = { pos: this.player.pos.clone(), facing: this.facing, walkAmt: 0, run: 0, phase: this.player.phase, hop: -1, look: 0, wind: 0 };
      inp.jump = false;
    }
    if (this.girlOverride) Object.assign(st, this.girlOverride);
    this.crouch = this.phase === 'play' && dist2(st.pos, SPOT.table) < 0.74;
    st.crouch = this.crouchK = (this.crouchK || 0) + ((this.crouch ? 1 : 0) - (this.crouchK || 0)) * Math.min(1, dt * 10);
    this.girl.root.position.copy(st.pos);
    this.girl.root.rotation.y = st.facing ?? this.facing;
    this.girl.pose(st, t, dt);
    this.gst = st;
    const sp = this.player.vel.length();
    if (this.crouch && !this.st.everHid) { this.st.everHid = true; this.hud.toast('钻到桌子底下啦，大灰狼看不见你～'); }

    // 脚印上色
    if (st.walkAmt > 0.2 && st.hop < 0 && this.phase === 'play') {
      const step = Math.floor(st.phase / Math.PI);
      if (step !== this.lastStep) {
        this.lastStep = step;
        this.stamp(st.pos.x, st.pos.z, 0.38, t, 0.8);
      }
    }

    this.updateWolf(t, dt, st, sp);
    this.updateGran(t, dt);
    if (this.phase === 'play') this.interact(t, st);
    else { this.hud.prompt(null); inp.act = false; }
    this.updateItems(t);
    this.updateHud(t);
    if (this.phase === 'ending') this.updateEnding(t, dt);

    // 衣柜门、壁炉火苗、影子
    const dk = Math.min(1, dt * 4);
    this.doorL.rotation.y += (-1.9 * this.doorOpen - this.doorL.rotation.y) * dk;
    this.doorR.rotation.y += (1.9 * this.doorOpen - this.doorR.rotation.y) * dk;
    this.flames.scale.set(1, 1 + Math.sin(t * 12) * 0.09 + Math.sin(t * 7.3) * 0.06, 1);
    this.shadows.girl.position.set(st.pos.x, 0.012, st.pos.z);
    this.shadows.wolf.position.set(this.wolf.root.position.x, 0.013, this.wolf.root.position.z);
    this.shadows.wolf.visible = this.ws.s !== 'sleep' && this.ws.s !== 'stir' && this.ws.s !== 'ask';
    this.shadows.gran.position.set(this.grandma.root.position.x, 0.014, this.grandma.root.position.z);
    this.shadows.gran.visible = this.grandma.root.visible;

    this.mask.update(t);
    this.updateCamera(t, dt, st);
    inp.act = false;
  }

  // ——— 大灰狼 ———
  updateWolf(t, dt, st, sp) {
    const W = this.wolf, ws = this.ws, ww = this.ww, girlPos = st.pos;
    const hidden = this.crouch;
    const inBed = ['sleep', 'stir', 'ask'].includes(ws.s);
    const goState = (s) => { ws.s = s; ws.t0 = t; };
    let pose = { mode: 'stand', walk: 0, phase: ww.phase, look: 0 };

    if (inBed) {
      // 吵醒值：跑步很吵，在床边走路也有一点点；站着不动慢慢降下来
      if (ws.s === 'sleep' && this.phase === 'play') {
        const nearBed = dist2(girlPos, V(-0.8, 0, -2.3)) < 2.4;
        let dn = -0.12;
        if (sp > 3.0) dn = nearBed ? 0.6 : 0.4;
        else if (sp > 0.3) dn = nearBed ? 0.05 : -0.04;
        this.noise = Math.max(0, Math.min(1, this.noise + dn * dt));
        if (this.noise >= 1) {
          goState('stir');
          this.line('wolf', '嗯……谁在吵？', 2.0);
        } else if (!this.hud.bubbles.get('wolf') || t > this.hud.bubbles.get('wolf').until + 1.2) {
          this.line('zzz', 'Z z z', 1.6);
        }
      }
      let sit = ws.scriptSit || 0;
      if (ws.s === 'stir') {
        const k = t - ws.t0;
        sit = smoothstep(0, 0.5, k);
        pose.look = Math.sin(k * 2.2) * 0.6;
        if (k > 2.4) {
          if (hidden) {
            this.line('wolf', '……一定是风吧。呼——噜——', 2.2);
            goState('sleep');
            this.noise = 0.45;
          } else {
            this.line('wolf', '小红帽！嘿嘿，把派给我！', 2.0);
            this.startChase(t);
          }
        }
      }
      if (ws.s === 'ask') sit = smoothstep(0, 0.6, t - ws.t0);
      ws.sitUp += (sit - ws.sitUp) * Math.min(1, dt * 6);
      // 躺姿：root 平躺在床上，打喷嚏后翻个身
      W.root.position.copy(SPOT.wolfLie);
      W.root.quaternion.copy(this.qLie);
      W.root.rotateY(ws.roll * 0.5);
      pose = { mode: 'lie', sitUp: ws.sitUp, sleep: ws.s === 'sleep' && ws.sitUp < 0.3, look: pose.look, sneeze: ws.sneeze };
      if (ws.sneeze >= 0) {
        ws.sneeze += dt / 1.5;
        if (ws.sneeze >= 1) { ws.sneeze = -1; ws.roll = 1; }
      }
    } else if (ws.s === 'getup' || ws.s === 'tobed') {
      const k = Math.min(1, (t - ws.t0) / 0.75), e = k * k * (3 - 2 * k);
      const a = ws.s === 'getup' ? e : 1 - e;
      const yaw = ws.s === 'getup' ? Math.atan2(girlPos.x - SPOT.bedOut.x, girlPos.z - SPOT.bedOut.z) : Math.PI;
      const qStand = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
      W.root.quaternion.copy(this.qLie).slerp(qStand, a);
      W.root.position.copy(SPOT.wolfLie).lerp(SPOT.bedOut, a);
      W.root.position.y += Math.sin(a * Math.PI) * 0.35;
      pose = { mode: 'stand', walk: 0, sleep: ws.s === 'tobed' && k > 0.6 };
      this.hump.visible = a < 0.5;
      if (k >= 1) {
        if (ws.s === 'getup') { ww.pos.copy(SPOT.bedOut); ww.yaw = yaw; ww.path = []; goState('chase'); ws.nextLine = t + 2.5; }
        else { this.wolfToBed(); this.noise = 0.3; }
      }
    } else if (ws.s === 'chase') {
      ww.goTo(girlPos, dt, 2.0, 0.2);
      pose = { mode: 'stand', walk: ww.moving, run: 0.4, phase: ww.phase, reach: 1 };
      if (t > ws.nextLine) { ws.nextLine = t + 3.5 + (t % 1.5); this.line('wolf', CHASE_LINES[Math.floor(t * 7) % CHASE_LINES.length], 1.8); }
      if (hidden) { goState('search'); ws.last = girlPos.clone(); this.line('wolf', '咦？小红帽呢？', 2.0); }
      else if (dist2(ww.pos, girlPos) < 0.62) this.caught(t);
      else if (this.st.yarn === 'set' && dist2(ww.pos, SPOT.trap) < 0.5) {
        goState('trip');
        ws.tripYaw = ww.yaw;
        this.line('wolf', '哎哟——！', 1.4);
      }
    } else if (ws.s === 'search') {
      const k = t - ws.t0;
      if (k < 2.2) ww.goTo(ws.last, dt, 1.2);
      else ww.idle(dt);
      pose = { mode: 'stand', walk: ww.moving, phase: ww.phase, look: Math.sin(k * 2.5) * 0.7 };
      if (!hidden && dist2(ww.pos, girlPos) < 2.5 && k > 0.8) { goState('chase'); ws.nextLine = t + 1.5; this.line('wolf', '找到你啦！', 1.4); }
      else if (k > 4.2) { this.line('wolf', '算了……回去睡个午觉。', 2.2); goState('return'); }
    } else if (ws.s === 'return') {
      const done = ww.goTo(SPOT.bedOut, dt, 1.3);
      pose = { mode: 'stand', walk: ww.moving, phase: ww.phase };
      if (done) goState('tobed');
    } else if (ws.s === 'trip') {
      // 被毛线绊倒：往前扑倒在地
      const k = Math.min(1, (t - ws.t0) / 0.45);
      W.root.position.set(ww.pos.x, 0.3 * k, ww.pos.z);
      W.root.rotation.set(1.57 * k * k, ws.tripYaw, 0, 'YXZ');
      pose = { mode: 'stand', walk: 0 };
      if (k >= 1) {
        if (this.st.laundry === 'set') { goState('drop'); }
        else { goState('dizzy'); this.line('wolf', '眼前好多小星星……', 2.0); }
      }
    } else if (ws.s === 'drop') {
      const k = Math.min(1, (t - ws.t0) / 0.35);
      const fwd = V(Math.sin(ws.tripYaw), 0, Math.cos(ws.tripYaw));
      const over = ww.pos.clone().addScaledVector(fwd, 1.0);
      const L = this.items.laundry.mesh;
      L.position.lerpVectors(SPOT.trap.clone().setY(0.62), over.setY(0.5 * this.laundryScale), k);
      L.rotation.set(Math.PI, 0, 0.5 * (1 - k));
      this.stick.visible = k < 0.5;
      W.root.position.set(ww.pos.x, 0.3, ww.pos.z);
      W.root.rotation.set(1.57, ws.tripYaw, 0, 'YXZ');
      if (k >= 1) this.trapWolf(t);
    } else if (ws.s === 'trapped') {
      W.root.position.set(ww.pos.x, 0.3, ww.pos.z);
      W.root.rotation.set(1.57, ws.tripYaw, 0, 'YXZ');
      pose = { mode: 'stand', walk: 0.6, phase: t * 9, kick: true };
      const L = this.items.laundry.mesh;
      L.rotation.set(Math.PI + Math.sin(t * 7) * 0.04, 0, Math.sin(t * 5.3) * 0.04);
      if (this.phase === 'play' && t > (ws.nextLine || 0)) { ws.nextLine = t + 6; this.line('wolf', '哎呀，放我出去嘛～我只是想吃派……', 2.6); }
    } else if (ws.s === 'dizzy') {
      const k = t - ws.t0;
      W.root.position.set(ww.pos.x, 0, ww.pos.z);
      W.root.rotation.set(0, ws.tripYaw, 0);
      pose = { mode: 'floor', dizzy: true };
      if (k > 2.6) { goState('chase'); ws.nextLine = t + 1; }
    } else if (ws.s === 'catch') {
      pose = { mode: 'stand', walk: 0, reach: 1 };
    } else if (ws.s === 'ending') {
      pose = this.endWolfPose || { mode: 'floor' };
    }

    if (['chase', 'search', 'return', 'catch'].includes(ws.s)) {
      W.root.position.set(ww.pos.x, 0, ww.pos.z);
      W.root.rotation.set(0, ww.yaw, 0);
    }
    W.pose(pose, t, dt);
  }

  startChase(t) {
    this.ws.s = 'getup'; this.ws.t0 = t;
    this.noise = 0;
  }

  caught(t) {
    this.ws.s = 'catch'; this.ws.t0 = t;
    this.phase = 'caught';
    this.line('wolf', '抓到啦！嗯……派好香呀！', 2.0);
    this.line('girl', '哎呀！', 1.4);
    this.seq(t, [{ d: 1.7, fn: () => this.hud.fade(() => {
      this.player.reset(SPOT.door, Math.PI / 2);
      this.facing = Math.PI / 2;
      if (this.carry && this.carry !== 'key') this.putBack(this.carry);
      this.wolfToBed();
      this.noise = 0.2;
      this.phase = 'play';
      this.camInit = false;
      this.hud.toast('大灰狼又回床上睡着了。别着急，再试一次！', 3.2);
    }) }]);
  }

  trapWolf(t) {
    this.ws.s = 'trapped'; this.ws.t0 = t;
    this.st.trapped = true;
    this.st.laundry = 'dropped';
    this.yarnLine.visible = false;
    this.ws.nextLine = t + 0.3;
    this.stamp(SPOT.trap.x, SPOT.trap.z, 2.4, t, 1.6);
    this.hud.toast('成功啦！大灰狼被扣在洗衣筐下面了！', 3);
    if (this.st.gran !== 'inside') this.startEnding(t + 2.2);
    else this.seq(t, [{ d: 2.8, who: 'grandma', text: '小红帽，好样的！快用钥匙放我出来～', dur: 2.8 }]);
  }

  // ——— 奶奶 ———
  updateGran(t, dt) {
    const G = this.grandma, gw = this.gw, s = this.st.gran;
    let pose = { mode: 'stand', walk: 0, phase: gw.phase };
    if (s === 'out') {
      const done = gw.goTo(this.granTarget, dt, 1.15);
      pose.walk = gw.moving;
      if (done) { this.st.gran = 'safe'; gw.yaw = Math.PI * 0.75; }
    } else if (s === 'safe') {
      gw.idle(dt);
      const g = this.gst.pos;
      gw.yaw += wrap(Math.atan2(g.x - gw.pos.x, g.z - gw.pos.z) - gw.yaw) * Math.min(1, dt * 3);
      pose.cheer = this.ws.s === 'trapped' && this.phase !== 'ending';
    } else if (s === 'ending') {
      pose = this.endGranPose || pose;
    }
    G.root.position.set(gw.pos.x, 0, gw.pos.z);
    G.root.rotation.y = gw.yaw;
    G.pose(pose, t);
  }

  freeGrandma(t) {
    this.st.gran = 'opening';
    this.carry = null;
    this.st.key = 'used';
    this.doorOpen = 1;
    this.noise = Math.min(0.95, this.noise + 0.3);
    this.hud.toast('吱呀——', 1.4);
    this.stamp(3.05, -2.6, 2.2, t, 1.6);
    this.grandma.root.visible = true;
    this.gw.pos.copy(SPOT.grandmaIn);
    this.gw.yaw = 0;
    this.granTarget = SPOT.wardrobe;
    const free = () => !this.st.trapped;
    const needTrap = () => !this.st.trapped && (this.st.yarn !== 'set' || this.st.laundry !== 'set');
    this.granHintT = t + 14;
    this.seq(t, [
      { d: 0.5, fn: () => { if (this.st.gran === 'opening') this.st.gran = 'out'; } },
      { d: 0.3, who: 'grandma', text: '小红帽，好孩子！', dur: 2.0 },
      { when: free, fn: () => { this.granTarget = SPOT.grandmaSafe; this.st.gran = 'out'; } },
      { when: needTrap, who: 'grandma', text: '那只馋嘴狼只是想吃派。我们给他做个陷阱吧！', dur: 2.8 },
      { when: needTrap, who: 'grandma', text: '在门边那个圈里拉好毛线、支起洗衣筐，再把他引过去！', dur: 3.4, fn: () => { this.trapRing.visible = true; this.st.talkedTrap = true; } },
      { when: () => free() && !needTrap(), who: 'grandma', text: '陷阱都做好啦？真能干！去床边问问他吧～', dur: 3.0 },
    ]);
    if (this.st.trapped) this.startEnding(t + 2.8);
  }

  updateGranHint(t) {
    if (this.st.gran !== 'safe' || this.phase !== 'play') return;
    if (t < (this.granHintT || 0)) return;
    this.granHintT = t + 9;
    let s = null;
    if (this.ws.s === 'chase') s = '往门边的陷阱那儿跑！';
    else if (this.st.yarn !== 'set' || this.st.laundry !== 'set') s = this.st.yarn !== 'set' ? '毛线在摇椅旁边的针线篮里～' : '洗衣筐在柜子旁边，抱的时候会走得慢一点哦。';
    else if (['sleep', 'stir'].includes(this.ws.s)) s = '陷阱做好啦！去床边问问他，再把他引到陷阱那儿～';
    if (s) this.line('grandma', s, 3.0);
  }

  // ——— 互动 ———
  interact(t, st) {
    const p = st.pos, S = this.st, ws = this.ws, c = this.carry;
    const bedD = Math.hypot(Math.max(SPOT.bed.x0 - p.x, 0, p.x - SPOT.bed.x1), Math.max(SPOT.bed.z0 - p.z, 0, p.z - SPOT.bed.z1));
    const wolfInBed = ['sleep', 'stir', 'ask'].includes(ws.s);
    const opts = [];
    const opt = (d, label, fn) => opts.push({ d, label, fn });
    const pick = (name) => () => this.pickUp(name, t);

    if (S.pepper === 'home' && c !== 'pepper') opt(dist2(p, SPOT.shelfStand), '拿起胡椒瓶', pick('pepper'));
    if (S.yarn === 'home' && c !== 'yarn') opt(dist2(p, SPOT.knit) - 0.3, '拿一团毛线', pick('yarn'));
    if (S.laundry === 'home' && c !== 'laundry') opt(dist2(p, SPOT.laundry) - 0.4, '抱起洗衣筐', pick('laundry'));
    if (S.key === 'floor') opt(dist2(p, SPOT.keyDrop), '捡起钥匙', pick('key'));
    if (bedD < 0.75) {
      if (wolfInBed && ws.s === 'sleep' && ws.sneeze < 0) {
        if (c === 'pepper' && S.key === 'pillow') opt(bedD, '往大灰狼鼻子上撒胡椒粉', () => this.sneeze(t));
        else if (c !== 'pepper') opt(bedD + 0.2, '问问“奶奶”（会把他叫醒哦）', () => this.ask(t));
      } else if (!wolfInBed && S.key === 'pillow') opt(bedD, '从枕头底下拿钥匙', pick('key'));
    }
    if (S.gran === 'inside') {
      const d = dist2(p, SPOT.wardrobe);
      if (c === 'key') opt(d, '用钥匙打开衣柜', () => this.freeGrandma(t));
      else opt(d + 0.1, '敲敲衣柜', () => {
        this.noise = Math.min(0.95, this.noise + 0.05);
        this.line('grandma', S.key === 'pillow' ? '小红帽？钥匙在大灰狼的枕头底下……胡椒粉能让他打喷嚏哦！' : '快用钥匙开门呀～', 3.2);
      });
    }
    if (c === 'yarn' && S.yarn !== 'set') opt(dist2(p, SPOT.trap), '在这里拉好毛线', () => this.setTrap('yarn', t));
    if (c === 'laundry' && S.laundry !== 'set') opt(dist2(p, SPOT.trap), '在这里支起洗衣筐', () => this.setTrap('laundry', t));
    if (S.gran === 'safe') opt(dist2(p, this.gw.pos), '和奶奶说说话', () => { this.granHintT = 0; this.updateGranHint(t); });

    const best = opts.filter((o) => o.d < 0.95).sort((a, b) => a.d - b.d)[0];
    this.hud.prompt(best ? best.label : null);
    if (best && this.input.act) best.fn();
    this.updateGranHint(t);
  }

  pickUp(name, t) {
    if (this.carry && this.carry !== name) {
      this.hud.toast(`先把${ITEM_NAME[this.carry]}放回去了`, 1.8);
      this.putBack(this.carry);
    }
    this.carry = name;
    this.st[name] = 'carried';
    this.items[name].mesh.visible = true;
    this.player.speedK = name === 'laundry' ? 0.72 : 1;
    if (name === 'laundry') this.noise = Math.min(0.95, this.noise + 0.05);
    if (name === 'yarn' || name === 'laundry') this.trapRing.visible = true;
    const at = this.items[name].home;
    this.stamp(at.x, at.z, 1.2, t, 1.2);
    const tip = { pepper: '胡椒瓶！凑到大灰狼鼻子边撒一点点～', key: '拿到钥匙啦！快去开衣柜！', yarn: '拿到毛线啦！放到门边的圈里～', laundry: '好重的洗衣筐……别跑，轻轻走～' }[name];
    this.line('think', tip, 2.4);
  }

  putBack(name) {
    const it = this.items[name];
    this.st[name] = name === 'key' ? 'floor' : 'home';
    it.mesh.position.copy(name === 'key' ? SPOT.keyDrop.clone().setY(0.03) : it.home);
    it.mesh.rotation.copy(it.rot);
    if (name === 'laundry') it.mesh.scale.setScalar(this.laundryScale);
    if (this.carry === name) this.carry = null;
    this.player.speedK = 1;
  }

  sneeze(t) {
    const ws = this.ws;
    ws.sneeze = 0;
    this.carry = null;
    this.st.pepper = 'home';
    this.items.pepper.mesh.position.copy(this.items.pepper.home);
    this.items.pepper.mesh.rotation.copy(this.items.pepper.rot);
    this.line('think', '撒一点点……', 1.0);
    this.seq(t, [
      { d: 0.5, who: 'wolf', text: '阿……阿……', dur: 0.8 },
      { who: 'wolf', text: '阿——嚏！！', dur: 1.2, fn: () => {
        this.st.key = 'flying'; this.keyT = this.hud.t;
        this.items.key.mesh.visible = true;
        this.stamp(-0.6, -2.4, 2.0, this.hud.t, 1.4);
      } },
      { d: 0.2, who: 'zzz', text: '呼噜……派……', dur: 1.8 },
    ]);
  }

  ask(t) {
    const ws = this.ws;
    ws.s = 'ask'; ws.t0 = t;
    this.st.asked = true;
    this.seq(t, [
      { who: 'girl', text: '奶奶，你的耳朵怎么这么尖呀？', dur: 2.1 },
      { who: 'wolf', text: '为了……更好地听你说话呀～', dur: 2.1 },
      { who: 'girl', text: '那你身后怎么有一条毛尾巴？', dur: 2.1 },
      { who: 'wolf', text: '尾、尾巴？！', dur: 1.2 },
      { who: 'wolf', text: '嘿嘿，被发现啦！把派给我！', dur: 1.5, fn: () => { if (this.ws.s === 'ask') this.startChase(this.hud.t); } },
    ]);
  }

  setTrap(name, t) {
    this.st[name] = 'set';
    this.carry = null;
    this.player.speedK = 1;
    this.noise = Math.min(0.95, this.noise + 0.08);
    const tr = SPOT.trap;
    if (name === 'yarn') {
      this.items.yarn.mesh.visible = false;
      this.yarnLine.visible = true;
    } else {
      const L = this.items.laundry.mesh;
      L.scale.setScalar(this.laundryScale);
      L.position.set(tr.x, 0.62, tr.z);
      L.rotation.set(Math.PI, 0, 0.5);
      this.stick.visible = true;
    }
    this.stamp(tr.x, tr.z, 1.1, t, 1.2);
    const both = this.st.yarn === 'set' && this.st.laundry === 'set';
    this.hud.toast(both ? '陷阱做好啦！' : name === 'yarn' ? '毛线拉好了！还差洗衣筐～' : '洗衣筐支好了！还差毛线～', 2.4);
  }

  // ——— 道具跟随 / 钥匙飞出 ———
  updateItems(t) {
    const g = this.girl.root.position;
    if (this.carry) {
      const m = this.items[this.carry].mesh;
      const big = this.carry === 'laundry';
      m.position.set(g.x, (big ? 1.25 : 1.5) + Math.sin(t * 4) * 0.03 - (this.crouch ? 0.4 : 0), g.z);
      m.rotation.set(big ? 0 : 0.2, t * (big ? 0 : 1.5), 0);
      if (big) m.scale.setScalar(0.95);
    }
    if (this.st.key === 'flying') {
      const k = Math.min(1, (t - this.keyT) / 0.8);
      const a = V(-0.8, 0.75, -3.0), b = SPOT.keyDrop.clone().setY(0.03);
      const m = this.items.key.mesh;
      m.position.lerpVectors(a, b, k);
      m.position.y += Math.sin(k * Math.PI) * 0.9;
      m.rotation.set(Math.PI / 2 + k * 6, 0, 0.4);
      if (k >= 1) { this.st.key = 'floor'; m.rotation.copy(this.items.key.rot); this.hud.toast('钥匙从枕头底下飞出来啦！', 2.2); }
    }
    if (this.st.key === 'floor') this.items.key.mesh.position.y = 0.03 + Math.abs(Math.sin(t * 3)) * 0.04;
  }

  // ——— 任务清单 / 吵醒值 / 指引箭头 ———
  updateHud(t) {
    const S = this.st, H = this.hud, c = this.carry;
    const keySub = S.key === 'pillow' ? (S.heardKey ? '钥匙在大灰狼的枕头底下（胡椒粉能让他打喷嚏）' : '奶奶在哪儿呢？') : '用钥匙打开衣柜';
    H.goals([
      { t: '救出奶奶', done: S.gran !== 'inside', sub: keySub },
      { t: '做个陷阱', done: S.yarn === 'set' && S.laundry === 'set' || S.trapped, sub: `毛线 ${S.yarn === 'set' ? '✔' : '○'} · 洗衣筐 ${S.laundry === 'set' ? '✔' : '○'}` },
      { t: '叫醒大灰狼，把他引进陷阱', done: S.trapped, sub: '躲在桌子底下他就找不到你' },
    ]);
    const bedWolf = ['sleep', 'stir'].includes(this.ws.s) && this.phase === 'play';
    H.noise(bedWolf ? this.noise : null, this.noise > 0.75 ? '要醒啦！快躲起来或者别动！' : '嘘——轻轻走，别跑');
    H.carry(c ? ITEM_NAME[c] : null);

    // 下一步指向哪儿
    let m = null;
    const up = (v, y) => () => v.clone().setY(y);
    if (this.phase !== 'play') m = null;
    else if (this.ws.s === 'chase' && S.yarn === 'set') m = up(SPOT.trap, 0.6);
    else if (S.gran === 'inside') {
      if (c === 'key') m = up(SPOT.wardrobe.clone().setZ(-2.8), 2.5);
      else if (S.key === 'floor') m = up(SPOT.keyDrop, 0.5);
      else if (S.key === 'pillow') m = c === 'pepper' || !['sleep', 'stir', 'ask'].includes(this.ws.s) ? up(V(-0.8, 0, -3.0), 1.2) : up(SPOT.pepper, 1.35);
    } else if (S.yarn !== 'set' || S.laundry !== 'set') {
      if (c === 'yarn' || c === 'laundry') m = up(SPOT.trap, 0.6);
      else if (S.yarn !== 'set') m = up(SPOT.knit, 0.75);
      else m = up(SPOT.laundry, 1.1);
    } else if (['sleep', 'stir'].includes(this.ws.s)) m = up(V(-0.8, 0, -2.3), 1.7);
    else if (S.trapped && S.gran === 'inside') m = up(V(-0.8, 0, -3.0), 1.2);
    H.marker(m);
  }

  // ——— 结局：道歉、一起吃派 ———
  startEnding(at) {
    this.seq(at, [{ fn: (t) => {
      this.phase = 'ending';
      this.endT = t;
      this.st.gran = 'ending';
      this.hud.marker(null);
      this.endWolfPose = { mode: 'stand', walk: 0.5, phase: t * 9, kick: true };
    } }]);
  }

  updateEnding(t, dt) {
    const k = t - this.endT;
    const gw = this.gw, ww = this.ww;
    if (!this.endStage) this.endStage = 0;
    if (this.endStage === 0) {
      // 奶奶走到洗衣筐旁边
      const tgt = this.items.laundry.mesh.position.clone().setY(0).add(V(0.7, 0, 0.5));
      gw.goTo(tgt, dt, 1.15);
      this.endGranPose = { mode: 'stand', walk: gw.moving, phase: gw.phase };
      if (k > 0.3 && !this.endSaid) {
        this.endSaid = true;
        this.seq(t, [
          { d: 0.6, who: 'wolf', text: '呜呜……对不起，我只是太饿了……', dur: 2.6 },
          { who: 'grandma', text: '原来是肚子饿了呀！饿了就说嘛～', dur: 2.6, fn: () => { this.endGranPose = { mode: 'stand', talk: true }; } },
          { who: 'girl', text: '那我们一起吃苹果派吧！', dur: 2.2 },
          { fn: () => this.hud.fade(() => this.tableScene(this.hud.t), 0.35) },
        ]);
      }
    } else if (this.endStage === 1) {
      const e = t - this.tableT;
      RU.uBurstR.value = 14 * smoothstep(0, 3.2, e);
      this.endWolfPose = { mode: 'sit', wave: e > 1 && e < 4 };
      this.endGranPose = { mode: 'sit', talk: e > 3 && e < 5 };
      this.girlOverride = { walkAmt: 0, hop: -1, look: 0 };
      if (e > 7.5 && !this.hud.endEl.classList.contains('show')) {
        this.hud.end(true, '大灰狼也变成了好朋友。谢谢你帮奶奶！');
        this.phase = 'done';
      }
    }
  }

  tableScene(t) {
    this.endStage = 1;
    this.tableT = t;
    this.hump.visible = false;
    this.items.laundry.mesh.position.copy(this.items.laundry.home);
    this.items.laundry.mesh.rotation.set(0, 0, 0);
    this.stick.visible = false; this.yarnLine.visible = false; this.trapRing.visible = false;
    // 狼和奶奶坐在桌子两边，小红帽站在前面
    this.ws.s = 'ending';
    this.ww.pos.copy(SPOT.chairW); this.ww.yaw = Math.PI / 2;
    this.wolf.root.position.copy(SPOT.chairW).setY(-0.02);
    this.wolf.root.rotation.set(0, Math.PI / 2, 0);
    this.gw.pos.copy(SPOT.chairE); this.gw.yaw = -Math.PI / 2;
    this.player.reset(V(SPOT.table.x, 0, SPOT.table.z + 1.05), Math.PI);
    this.facing = Math.PI;
    this.showPie(true);
    RU.uBurstPos.value.set(SPOT.table.x, 0.8, SPOT.table.z);
    this.seq(t, [
      { d: 0.8, who: 'wolf', text: '哇——是苹果派！谢谢你们！', dur: 2.6 },
      { who: 'grandma', text: '以后想吃派，就来敲门吧～', dur: 2.6 },
      { who: 'girl', text: '耶！大家都是好朋友啦！', dur: 2.4 },
    ]);
  }

  showPie(on) {
    if (!this.pie) {
      const g = new THREE.Group();
      const mat = this.items.pepper.mesh.children[0].material;
      const mk = (geo, c, x = 0, y = 0, z = 0) => { geo.translate(x, y, z); return [geo, c]; };
      const parts = [
        mk(new THREE.CylinderGeometry(0.24, 0.2, 0.08, 24), [0.88, 0.62, 0.33], 0, 0.04, 0),
        mk(new THREE.CylinderGeometry(0.21, 0.21, 0.02, 24), [0.78, 0.42, 0.22], 0, 0.085, 0),
      ];
      for (let i = -2; i <= 2; i++) {
        parts.push(mk(new THREE.BoxGeometry(0.42 - Math.abs(i) * 0.07, 0.02, 0.035), [0.93, 0.7, 0.4], 0, 0.1, i * 0.08));
        parts.push(mk(new THREE.BoxGeometry(0.035, 0.022, 0.42 - Math.abs(i) * 0.07), [0.93, 0.7, 0.4], i * 0.08, 0.1, 0));
      }
      parts.push(mk(new THREE.CylinderGeometry(0.3, 0.3, 0.015, 24), [0.98, 0.97, 0.94], 0, 0, 0));
      for (const [geo, c] of parts) {
        const gg = geo.toNonIndexed();
        gg.deleteAttribute('uv');
        const n = gg.attributes.position.count;
        gg.setAttribute('aCol', new THREE.BufferAttribute(new Float32Array(n * 3).map((_, i) => c[i % 3]), 3));
        gg.setAttribute('aTint', new THREE.BufferAttribute(new Float32Array(n), 1));
        g.add(new THREE.Mesh(gg, mat));
      }
      g.position.set(SPOT.table.x + 0.05, 0.8, SPOT.table.z + 0.15);
      this.scene.add(g);
      this.pie = g;
    }
    this.pie.visible = on;
  }

  // ——— 镜头：从南边斜上方看屋里，跟着女孩轻轻移动 ———
  updateCamera(t, dt, st) {
    const cam = this.camera;
    const aspect = innerWidth / innerHeight;
    const center = V(0, 0.55, -0.45);
    let look = center.clone().lerp(st.pos.clone().setY(0.6), 0.28);
    let dist = 11.6 * Math.max(1, 1.6 / aspect);
    let fov = 38;
    if (this.phase === 'ending' || this.phase === 'done') {
      look = this.endStage === 1 ? V(SPOT.table.x, 0.7, SPOT.table.z + 0.1) : this.items.laundry.mesh.position.clone().setY(0.5).lerp(st.pos, 0.3);
      dist = 6.0 * Math.max(1, 1.3 / aspect);
    }
    const pos = look.clone().add(V(0, 0.78, 0.66).normalize().multiplyScalar(dist));
    if (!this.camInit) { this.camInit = true; this.camPos.copy(pos); this.camLook.copy(look); cam.fov = fov; cam.updateProjectionMatrix(); }
    const k = 1 - Math.exp(-dt * 3);
    this.camPos.lerp(pos, k);
    this.camLook.lerp(look, k);
    cam.position.copy(this.camPos);
    cam.lookAt(this.camLook);
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
  }
}
