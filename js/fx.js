import * as THREE from 'three';
import { NOISE, COMMON } from './glsl.js';
import { U } from './materials.js';
import { rng } from './terrain.js';

// 花瓣：完全在顶点着色器里算轨迹（无状态），从树冠飘落、旋转、随风往前漂
const PETAL_VS = /* glsl */ `
attribute vec4 aSeed;
uniform float uPetalT;
uniform vec3 uTree;
uniform float uGroundMin;
varying vec3 vW; varying vec3 vN; varying vec3 vC; varying float vA;
mat3 rotAxis(vec3 a, float ang){
  float s = sin(ang), c = cos(ang), oc = 1.0 - c;
  return mat3(oc*a.x*a.x + c, oc*a.x*a.y + a.z*s, oc*a.z*a.x - a.y*s,
              oc*a.x*a.y - a.z*s, oc*a.y*a.y + c, oc*a.y*a.z + a.x*s,
              oc*a.z*a.x + a.y*s, oc*a.y*a.z - a.x*s, oc*a.z*a.z + c);
}
void main(){
  float life = 8.0 + aSeed.w * 5.0;
  float t = uPetalT - aSeed.x * 6.0;
  float alive = step(0.0, t);
  float age = mod(max(t, 0.0), life);
  float ang = aSeed.y * 6.2831;
  float rad = sqrt(aSeed.z) * 5.8;
  vec3 pos = uTree + vec3(cos(ang) * rad, 4.2 + fract(aSeed.y * 13.7) * 4.2, sin(ang) * rad * 0.85);
  pos.y -= age * 0.72;
  pos.x += age * 0.32 + sin(age * 1.6 + aSeed.y * 30.0) * 0.6;
  pos.z += age * 0.62 + cos(age * 1.1 + aSeed.z * 20.0) * 0.5;
  float spin = age * (2.0 + aSeed.w * 3.0) + aSeed.x * 10.0;
  vec3 axis = normalize(vec3(sin(aSeed.y * 40.0), 0.6, cos(aSeed.z * 40.0)));
  mat3 R = rotAxis(axis, spin);
  float fade = smoothstep(0.0, 0.5, age) * (1.0 - smoothstep(life - 1.2, life, age)) * alive;
  fade *= smoothstep(uGroundMin - 0.2, uGroundMin + 0.4, pos.y);
  vec3 wp = pos + R * (position * (0.75 + aSeed.w * 0.5) * fade);
  vW = wp; vN = R * vec3(0.0, 0.0, 1.0);
  vC = mix(vec3(0.96, 0.62, 0.74), vec3(1.0, 0.88, 0.92), aSeed.w);
  vA = fade;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
}
`;

const PETAL_FS = /* glsl */ `
varying vec3 vW; varying vec3 vN; varying vec3 vC; varying float vA;
void main(){
  if (vA < 0.02) discard;
  vec3 N = normalize(vN);
  float l = 0.72 + 0.28 * abs(dot(N, uSunDir));
  vec3 c = vC * l + vec3(0.06, 0.03, 0.03);
  float d = length(vW - cameraPosition);
  float f = (1.0 - exp(-max(d - 14.0, 0.0) * 0.024)) * 0.9;
  gl_FragColor = vec4(mix(c, uHaze, f), 1.0);
}
`;

export function makePetals(count = 900) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.bezierCurveTo(0.05, 0.02, 0.065, 0.075, 0.022, 0.105);
  s.lineTo(0, 0.09);
  s.lineTo(-0.022, 0.105);
  s.bezierCurveTo(-0.065, 0.075, -0.05, 0.02, 0, 0);
  const g = new THREE.ShapeGeometry(s, 4);
  g.translate(0, -0.052, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, p.getX(i) * p.getX(i) * 6.0);
  g.computeVertexNormals();
  const seeds = new Float32Array(count * 4);
  const R = rng(9);
  for (let i = 0; i < seeds.length; i++) seeds[i] = R();
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  const m = new THREE.ShaderMaterial({
    uniforms: { ...U },
    vertexShader: NOISE + COMMON + PETAL_VS,
    fragmentShader: NOISE + COMMON + PETAL_FS,
    side: THREE.DoubleSide,
    depthWrite: false,   // 不写深度：后期描边不会给每片花瓣描黑边
  });
  const mesh = new THREE.InstancedMesh(g, m, count);
  mesh.renderOrder = 5;
  mesh.frustumCulled = false;
  return mesh;
}

// 后期：深度描边（带抖动与“二次描线”的手绘感）+ 纸纹 + 暗角 + 上色后的暖光
const POST_FS = /* glsl */ `
uniform sampler2D tColor; uniform sampler2D tDepth;
uniform vec2 uRes; uniform float uNear, uFar, uTime, uWarm, uPx;
varying vec2 vUv;
float lin(vec2 uv){ float z = texture2D(tDepth, uv).x; return uNear * uFar / (uFar - z * (uFar - uNear)); }
float edge(vec2 uv, float px){
  vec2 o = px / uRes;
  float c = lin(uv);
  float l = lin(uv - vec2(o.x, 0.0)), r = lin(uv + vec2(o.x, 0.0));
  float d = lin(uv - vec2(0.0, o.y)), u = lin(uv + vec2(0.0, o.y));
  float lap = abs(l + r + d + u - 4.0 * c) / c;
  return smoothstep(0.03, 0.10, lap);
}
void main(){
  vec2 px = 1.0 / uRes;
  float boil = floor(uTime * 4.0);
  vec2 q = vUv * uRes / (28.0 * uPx);
  vec2 wob = (vec2(vnoise(q + boil * 7.1), vnoise(q + 13.7 + boil * 3.3)) - 0.5) * 2.4 * uPx * px;
  vec2 q2 = q * 1.7 + 31.0;
  vec2 wob2 = (vec2(vnoise(q2 + boil), vnoise(q2 + 26.0 - boil)) - 0.5) * 3.4 * uPx * px;
  float e = max(edge(vUv + wob, 1.0 * uPx), edge(vUv + wob2, 1.6 * uPx) * 0.5);
  e *= 0.6 + 0.4 * vnoise(vUv * uRes / (14.0 * uPx) + 3.0);
  float dc = lin(vUv);
  e *= 1.0 - smoothstep(28.0, 110.0, dc) * 0.8;

  vec3 col = texture2D(tColor, vUv).rgb;
  vec3 lineCol = col * vec3(0.30, 0.29, 0.33);
  col = mix(col, lineCol, clamp(e, 0.0, 1.0) * 0.9);

  float asp = uRes.x / uRes.y;
  float g = hash12(gl_FragCoord.xy);
  float fib = vnoise(gl_FragCoord.xy * vec2(0.09, 0.35) / uPx);
  float mott = fbm(vUv * vec2(asp, 1.0) * 3.0);
  col *= 0.955 + 0.045 * g;
  col *= 0.975 + 0.04 * fib;
  col *= 0.965 + 0.05 * mott;
  vec2 sp = (vUv - vec2(0.12, 1.08)) * vec2(asp, 1.0);
  col += vec3(1.0, 0.86, 0.62) * uWarm * 0.12 * smoothstep(1.2, 0.0, length(sp));
  float vg = length((vUv - 0.5) * vec2(asp, 1.0));
  col *= mix(1.0, 0.84, smoothstep(0.45, 1.1, vg));
  gl_FragColor = vec4(col, 1.0);
}
`;

export function postMat() {
  return new THREE.ShaderMaterial({
    uniforms: {
      tColor: { value: null }, tDepth: { value: null },
      uRes: { value: new THREE.Vector2(1, 1) }, uNear: { value: 0.3 }, uFar: { value: 700 },
      uTime: { value: 0 }, uWarm: { value: 0 }, uPx: { value: 1 },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: NOISE + POST_FS,
    depthTest: false, depthWrite: false,
  });
}
