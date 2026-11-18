import * as THREE from 'three';
import { U } from './materials.js';
import { postMat, makePetals } from './fx.js';
import { buildWorld } from './world.js';
import { Girl } from './girl.js';
import { ColorMask } from './mask.js';
import { Director } from './director.js';
import { Input } from './player.js';

THREE.ColorManagement.enabled = false;

const params = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, innerWidth / innerHeight, 0.3, 700);

const mask = new ColorMask();
U.uMask.value = mask.tex;
U.uMaskB.value.copy(mask.bounds);

const world = buildWorld(scene);
const girl = new Girl();
scene.add(girl.root);
scene.add(makePetals(900));
const input = new Input(renderer.domElement);
const director = new Director(world, girl, mask, camera, input);
if (params.has('auto')) director.mode = 'auto';

// 场景先画进带深度的 RT，再用后期描边
const rt = new THREE.WebGLRenderTarget(1, 1, {
  depthTexture: new THREE.DepthTexture(1, 1),
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
});
const post = postMat();
post.uniforms.tColor.value = rt.texture;
post.uniforms.tDepth.value = rt.depthTexture;
post.uniforms.uNear.value = camera.near;
post.uniforms.uFar.value = camera.far;
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post);
quad.frustumCulled = false;
const postScene = new THREE.Scene();
postScene.add(quad);
const postCam = new THREE.Camera();

function resize() {
  const w = innerWidth, h = innerHeight, pr = renderer.getPixelRatio();
  renderer.setSize(w, h);
  rt.setSize(Math.floor(w * pr), Math.floor(h * pr));
  post.uniforms.uRes.value.set(Math.floor(w * pr), Math.floor(h * pr));
  post.uniforms.uPx.value = pr;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

const titleEl = document.getElementById('title');
const replayEl = document.getElementById('replay');

function step(t, dt) {
  U.uTime.value = t;
  director.update(t, dt);
  mask.update(t);
  post.uniforms.uTime.value = t;
  post.uniforms.uWarm.value = U.uSky.value;
}

let t = 0;
function restart(t0 = 0) {
  director.reset();
  t = 0;
  for (; t < t0; t += 1 / 30) step(t, 1 / 30);
}
restart(parseFloat(params.get('t') || '0'));
let paused = params.has('pause');

const hintEl = document.getElementById('hint');
const modeEl = document.getElementById('mode');
const stickEl = document.getElementById('stick');
const knobEl = document.getElementById('stick-knob');
const jumpBtnEl = document.getElementById('jump-btn');
const isTouch = matchMedia('(hover: none) and (pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) {
  document.body.classList.add('touch-ui');
  hintEl.textContent = '左下摇杆走动（推到底跑）· 滑屏转视角 · 双指缩放';
}
let stickPtr = null;
const moveStick = (e) => {
  const r = stickEl.getBoundingClientRect(), maxR = r.width * 0.36;
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  let dx = e.clientX - cx, dy = e.clientY - cy;
  const d = Math.hypot(dx, dy);
  if (d > maxR) { dx = dx / d * maxR; dy = dy / d * maxR; }
  knobEl.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
  input.setStick(dx / maxR, -dy / maxR);
};
const resetStick = () => {
  stickPtr = null;
  knobEl.style.transform = '';
  input.setStick(0, 0);
};
stickEl.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  stickPtr = e.pointerId;
  stickEl.setPointerCapture(e.pointerId);
  moveStick(e);
});
stickEl.addEventListener('pointermove', (e) => {
  if (e.pointerId !== stickPtr) return;
  e.stopPropagation();
  moveStick(e);
});
stickEl.addEventListener('pointerup', (e) => { if (e.pointerId === stickPtr) { e.stopPropagation(); resetStick(); } });
stickEl.addEventListener('pointercancel', (e) => { if (e.pointerId === stickPtr) resetStick(); });
jumpBtnEl.addEventListener('pointerdown', (e) => {
  e.stopPropagation();
  input.jump = true;
  input.touched = true;
});

function syncUI() {
  modeEl.textContent = director.mode === 'auto' ? '🎮 自己走' : '▶ 自动演示';
  replayEl.textContent = director.mode === 'auto' ? '↻ 重新播放' : '↻ 重新开始';
}
syncUI();
replayEl.addEventListener('click', () => restart(0));
modeEl.addEventListener('click', () => {
  director.mode = director.mode === 'auto' ? 'play' : 'auto';
  restart(0);
  syncUI();
  modeEl.blur();
});
addEventListener('keydown', (e) => {
  if (e.code === 'KeyR') restart(0);
  // 自动演示时按下方向键：就地接管
  if (director.mode === 'auto' && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
    director.setMode('play');
    syncUI();
  }
});

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!paused) t += dt;
  if (!params.has('record')) step(t, paused ? 1 / 60 : dt);   // 录屏模式由外部逐帧推进
  if (window.__cam) {   // 调试特写：__cam = { off:[x,y,z], look:[x,y,z] }（相对女孩脚底）
    const g = director.girl.root.position, { off, look } = window.__cam;
    camera.position.set(g.x + off[0], g.y + off[1], g.z + off[2]);
    camera.lookAt(g.x + look[0], g.y + look[1], g.z + look[2]);
  }
  const showPlay = director.mode === 'play' && t > 1.0;
  titleEl.classList.toggle('show', t > 0.5 && t < 4.2 && !(director.mode === 'play' && input.touched));
  hintEl.classList.toggle('show', showPlay && !(input.touched && t > 9));
  stickEl.classList.toggle('show', showPlay);
  jumpBtnEl.classList.toggle('show', showPlay);
  replayEl.classList.toggle('show', director.mode === 'play' ? t > 3 : director.bloomT !== null && t - director.bloomT > 16);
  modeEl.classList.toggle('show', t > 3);
  renderer.setRenderTarget(rt);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  renderer.render(postScene, postCam);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// 调试用：__seek(秒) 跳到某一刻并暂停
window.__dbg = { director, U, scene, camera, input, get t() { return t; } };
window.__seek = (tt, hold = true) => { restart(tt); paused = hold; };
// 调试：按住某些键快速模拟若干秒，例如 __sim(['KeyW'], 5)
window.__sim = (keys, sec, yaw) => {
  keys.forEach((k) => input.keys.add(k));
  for (let i = 0; i < sec * 30; i++) {
    if (yaw !== undefined) director.orbit.yaw = yaw;
    t += 1 / 30; step(t, 1 / 30);
  }
  keys.forEach((k) => input.keys.delete(k));
  const p = director.girl.root.position;
  return [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)];
};
