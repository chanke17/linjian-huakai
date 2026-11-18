import * as THREE from 'three';
import { NOISE, COMMON, FRAG } from './glsl.js';

// 所有材质共享的 uniform（同一个 {value} 对象）
export const U = {
  uTime: { value: 0 },
  uMask: { value: null },
  uMaskB: { value: new THREE.Vector4() },
  uBurstPos: { value: new THREE.Vector3() },
  uBurstR: { value: 0 },
  uSunDir: { value: new THREE.Vector3(-0.55, 0.72, 0.42).normalize() },
  uPaper: { value: new THREE.Color(0.95, 0.935, 0.9) },
  uHaze: { value: new THREE.Color(0.74, 0.84, 0.83) },
  uSky: { value: 0 },
  uGirl: { value: new THREE.Vector4(0, 0, 9, 0) },
  uBloom: { value: 0 },
  uTree: { value: new THREE.Vector3() },
  uPetalT: { value: -1 },
  uGroundMin: { value: -1 },
};

const UBER_VS = /* glsl */ `
attribute vec3 aCol;
attribute float aTint;
uniform float uWind;
uniform float uBloom;
uniform vec4 uCloak;
uniform vec2 uCloakY;
varying vec3 vW; varying vec3 vN; varying vec3 vC; varying float vT;
void main(){
  vec3 p = position;
  vT = aTint;
  vec3 col = aCol;
#ifdef USE_INSTANCING_COLOR
  col = mix(col, col * instanceColor, aTint);
#endif
  mat4 im = mat4(1.0);
#ifdef USE_INSTANCING
  im = instanceMatrix;
#endif
#ifdef BLOSSOM
  float seed = fract(sin(dot(im[3].xyz, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
  float b = clamp((uBloom - seed * 0.45) / 0.55, 0.0, 1.0);
  p *= 0.5 + 0.5 * b + sin(b * 3.14159) * 0.22;
#endif
#ifdef FLOWER
  vec3 w0 = (modelMatrix * im * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float fr = revealAt(w0);
  float open = mix(0.4, 1.0, fr) + sin(fr * 3.14159) * 0.25;
  if (aTint > 0.5) { p.xz *= open; p.y += (1.0 - fr) * 0.012; }
#endif
#ifdef GRASS
  // 线稿里的草又稀又矮；颜色漫到时一下子长高
  vec3 g0 = (modelMatrix * im * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float gr = revealAt(g0);
  float keep = step(0.5, fract(sin(dot(g0.xz, vec2(12.9898, 78.233))) * 43758.5453));
  float grow = mix(0.38 * keep, 1.0, gr) + sin(gr * 3.14159) * 0.12;
  p.y *= grow; p.z *= grow;
#endif
#ifdef CLOAK
  float f = smoothstep(uCloakY.x, uCloakY.y, p.y);
  p.z -= uCloak.x * f * f * 0.16;
  p.x += sin(uCloak.w + p.y * 9.0) * uCloak.y * f * 0.03;
  p.z += sin(uCloak.w * 2.0 + atan(p.x, p.z) * 3.0) * uCloak.y * f * 0.02;
#endif
  vec4 wp = modelMatrix * im * vec4(p, 1.0);
#ifdef WIND
  float hh = max(p.y, 0.0);
  float ph = uTime * 1.6 + wp.x * 0.21 + wp.z * 0.17;
  float g = sin(ph) + 0.5 * sin(ph * 2.3 + 1.0);
  wp.x += g * uWind * hh * hh;
  wp.z += cos(ph * 0.7) * uWind * hh * hh * 0.6;
#endif
  vW = wp.xyz;
  vN = normalize(mat3(modelMatrix) * mat3(im) * normal);
  vC = col;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const UBER_FS = /* glsl */ `
varying vec3 vW; varying vec3 vN; varying vec3 vC;
void main(){
  vec3 N = normalize(vN);
#ifndef NOFLIP
  N = gl_FrontFacing ? N : -N;
#endif
  float r = revealAt(vW);
#ifdef ALWAYS
  r = 1.0;
#endif
  vec3 V = normalize(cameraPosition - vW);
  vec3 cc = painted(vC, N, V, vW);
  vec3 sk = sketched(vC, N, vW);
  gl_FragColor = vec4(finish(sk, cc, r, vW), 1.0);
}
`;

export function uberMat(opt = {}) {
  const defines = {};
  for (const k of ['always', 'wind', 'blossom', 'cloak', 'flower', 'noflip', 'foliage', 'grass']) if (opt[k]) defines[k.toUpperCase()] = 1;
  return new THREE.ShaderMaterial({
    defines,
    side: opt.side ?? THREE.FrontSide,
    uniforms: { ...U, uWind: { value: opt.wind || 0 }, uCloak: { value: new THREE.Vector4() }, uCloakY: { value: new THREE.Vector2(1.02, 0.45) } },
    vertexShader: NOISE + COMMON + UBER_VS,
    fragmentShader: NOISE + COMMON + FRAG + UBER_FS,
  });
}

const SIMPLE_VS = /* glsl */ `
varying vec3 vW; varying vec3 vN;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vW = wp.xyz; vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const PATHFN = /* glsl */ `
float pathX(float z){ return sin(z * 0.08) * 2.6 + sin(z * 0.21 + 1.3) * 0.7; }
float streamZ(float x){ return sin(x * 0.12) * 1.8 + sin(x * 0.31 + 2.0) * 0.5; }
`;

// 地面：草地 / 土路 / 溪岸，线稿时是短笔触和路沿铅笔线
const GROUND_FS = /* glsl */ `
uniform vec4 uGirl; uniform float uBloom; uniform vec3 uTree;
varying vec3 vW; varying vec3 vN;
void main(){
  vec3 N = normalize(vN); vec3 w = vW;
  float n1 = fbm(w.xz * 0.25), n2 = fbm(w.xz * 1.7 + 3.1);
  float dpRaw = abs(w.x - pathX(w.z));
  float dp = dpRaw + (n2 - 0.5) * 0.5;
  float onPath = 1.0 - smoothstep(0.9, 1.25, dp);
  float dsRaw = abs(w.z - streamZ(w.x));
  float ds = dsRaw + (n2 - 0.5) * 0.4;
  float bank = 1.0 - smoothstep(1.7, 2.7, ds);
  vec3 grass = mix(vec3(0.29, 0.49, 0.21), vec3(0.56, 0.70, 0.30), n1);
  grass = mix(grass, vec3(0.40, 0.58, 0.24), n2 * 0.4);
  vec3 dirt = mix(vec3(0.78, 0.63, 0.42), vec3(0.64, 0.50, 0.33), n2);
  vec3 mud = mix(vec3(0.46, 0.41, 0.31), vec3(0.66, 0.61, 0.48), n2);
  vec3 base = mix(grass, dirt, onPath);
  base = mix(base, mud, bank);
  float dt = length(w.xz - uTree.xz);
  float pet = smoothstep(0.6, 0.68, vnoise(w.xz * 7.0)) * (1.0 - smoothstep(3.5, 8.5, dt + (n1 - 0.5) * 3.0)) * smoothstep(0.35, 1.0, uBloom);
  base = mix(base, vec3(0.98, 0.76, 0.82), pet * 0.9);
  float dap = smoothstep(0.42, 0.62, fbm(w.xz * 0.32 + vec2(uTime * 0.03, 0.0)));
  float gs = (1.0 - smoothstep(0.1, 0.48, length(w.xz - uGirl.xy))) * (1.0 - smoothstep(0.0, 1.0, uGirl.z));

  float r = revealAt(w);
  vec3 V = normalize(cameraPosition - w);
  vec3 cc = painted(base, N, V, w) * (0.8 + 0.3 * dap) * (1.0 - gs * 0.4);

  // 线稿：草地短笔触 + 路沿、岸线
  float grassZone = (1.0 - onPath) * (1.0 - bank);
  float sc = dot(w.xz, vec2(0.8, 0.6)) * 4.0 + vnoise(w.xz * 1.5) * 1.5;
  float dash = smoothstep(0.55, 0.78, vnoise(vec2(dot(w.xz, vec2(-0.6, 0.8)) * 2.2, floor(sc))));
  float strokes = hline(sc, 0.16) * dash * grassZone * 0.7;
  float edgeW = 0.035 + fwidth(dp) * 0.8;
  float border = 1.0 - smoothstep(edgeW * 0.4, edgeW, abs(dp - 1.1));
  border = max(border, 1.0 - smoothstep(edgeW * 0.4, edgeW, abs(ds - 2.15)));
  border *= 0.65 + 0.35 * vnoise(w.xz * 3.0);
  float pebble = smoothstep(0.86, 0.9, vnoise(w.xz * 9.0)) * onPath * 0.5;
  vec3 sk = uPaper * (1.0 - max(max(strokes, border * 0.8), pebble) * 0.55) * (1.0 - gs * 0.22);
  sk = mix(sk, sketched(base, N, w), 0.25);

  gl_FragColor = vec4(finish(sk, cc, r, w), 1.0);
}
`;

export function groundMat() {
  return new THREE.ShaderMaterial({
    uniforms: { ...U },
    vertexShader: SIMPLE_VS,
    fragmentShader: NOISE + COMMON + FRAG + PATHFN + GROUND_FS,
  });
}

// 溪水：上色时是流动的蓝绿与碎光，线稿时是顺流的铅笔短线
const WATER_FS = /* glsl */ `
uniform vec3 uStones[7];
varying vec3 vW; varying vec3 vN;
void main(){
  vec3 w = vW;
  float across = abs(w.z - streamZ(w.x));
  float t = uTime;
  float n = vnoise(vec2(w.x * 0.9 - t * 1.4, w.z * 3.5));
  float n2 = vnoise(vec2(w.x * 2.3 - t * 2.2, w.z * 7.0 + 3.0));
  float foam = 0.0, ring = 0.0;
  for (int i = 0; i < 7; i++){
    vec2 d = w.xz - uStones[i].xz;
    float L = length(d * vec2(0.85, 1.0)) - uStones[i].y;
    foam = max(foam, 1.0 - smoothstep(0.0, 0.16 + 0.12 * n2, L));
    float wake = (1.0 - smoothstep(0.0, 1.4, L)) * smoothstep(0.62, 0.78, vnoise(vec2(d.x * 3.0 - t * 2.5, d.y * 6.0)));
    foam = max(foam, wake * step(0.0, d.x) * 0.8);
    ring = max(ring, (1.0 - smoothstep(0.0, 0.035, abs(L - 0.12 - 0.05 * sin(t * 2.0 + float(i)))))*(1.0 - smoothstep(0.0, 0.5, L)));
  }
  float r = revealAt(w);
  vec3 deep = vec3(0.16, 0.42, 0.62), shallow = vec3(0.44, 0.73, 0.78);
  vec3 cc = mix(shallow, deep, smoothstep(2.0, 0.2, across));
  cc = mix(cc, vec3(0.64, 0.86, 0.92), smoothstep(0.55, 0.85, n) * 0.45);
  cc += vec3(1.0) * smoothstep(0.84, 0.92, n2) * 0.35;
  vec3 V = normalize(cameraPosition - w);
  cc = mix(cc, vec3(0.78, 0.89, 0.95), pow(1.0 - max(V.y, 0.0), 3.0) * 0.35);
  cc = mix(cc, vec3(0.96, 0.98, 1.0), foam * 0.85);

  float c1 = w.z * 5.0 + sin(w.x * 0.7 - t * 0.9) * 0.4 + n * 0.6;
  float dash = smoothstep(0.45, 0.62, vnoise(vec2(w.x * 1.2 - t * 1.3, floor(c1))));
  float ln = hline(c1, 0.12) * dash;
  vec3 sk = uPaper * (1.0 - max(ln * 0.45, ring * 0.5));

  gl_FragColor = vec4(finish(sk, cc, r, w), 1.0);
}
`;

export function waterMat(stones) {
  const arr = stones.map((s) => new THREE.Vector3(s.x, s.r, s.z));
  while (arr.length < 7) arr.push(new THREE.Vector3(999, 0, 999));
  return new THREE.ShaderMaterial({
    uniforms: { ...U, uStones: { value: arr } },
    vertexShader: SIMPLE_VS,
    fragmentShader: NOISE + COMMON + FRAG + PATHFN + WATER_FS,
  });
}

// 天空：纸面上的铅笔云线 → 从地平线往上晕开的蓝天与积云
const SKY_FS = /* glsl */ `
uniform float uSky;
varying vec3 vW;
void main(){
  vec3 d = normalize(vW - cameraPosition);
  float h = d.y;
  vec3 top = vec3(0.27, 0.53, 0.85), hor = vec3(0.80, 0.90, 0.92);
  vec3 sky = mix(hor, top, pow(clamp(h, 0.0, 1.0), 0.55));
  vec2 cp = d.xz / (max(h, 0.0) + 0.12) * 0.9 + vec2(uTime * 0.012, 0.0);
  float c = fbm(cp * 0.55) * 0.75 + fbm(cp * 1.7 + 4.0) * 0.25;
  vec2 cs = cp + uSunDir.xz * 0.18;
  float c2 = fbm(cs * 0.55) * 0.75 + fbm(cs * 1.7 + 4.0) * 0.25;
  float hm = smoothstep(0.0, 0.18, h);
  float cloud = smoothstep(0.46, 0.6, c) * hm;
  float shade = clamp((c - c2) * 5.0 + 0.6, 0.0, 1.0);
  vec3 cloudCol = mix(vec3(0.72, 0.73, 0.87), vec3(1.0, 0.98, 0.94), shade);
  vec3 cc = mix(sky, cloudCol, cloud);
  cc += vec3(1.0, 0.92, 0.75) * pow(max(dot(d, uSunDir), 0.0), 8.0) * 0.25;

  float aa = fwidth(c);
  float ln = 1.0 - smoothstep(aa * 0.6, aa * 1.8, abs(c - 0.5));
  float ln2 = 1.0 - smoothstep(aa * 0.6, aa * 1.5, abs(c - 0.58));
  vec3 sk = uPaper * (1.0 - (ln * 0.4 + ln2 * 0.18) * hm);

  float rn = fbm(d.xz * 2.5 + h * 3.0);
  float r = smoothstep(0.0, 0.2, uSky * 1.5 - h * 0.9 - (rn - 0.5) * 0.35 - 0.1);
  gl_FragColor = vec4(mix(sk, cc, r), 1.0);
}
`;

export function skyMat() {
  return new THREE.ShaderMaterial({
    uniforms: { ...U },
    vertexShader: `varying vec3 vW; void main(){ vec4 wp = modelMatrix * vec4(position, 1.0); vW = wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: NOISE + COMMON + SKY_FS,
    side: THREE.BackSide,
    depthWrite: false,
  });
}
