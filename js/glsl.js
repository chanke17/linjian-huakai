// GLSL 片段：噪声、显色遮罩、铅笔排线、水彩上色

export const NOISE = /* glsl */ `
float hash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash13(vec3 p3){ p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float vnoise3(vec3 p){
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec2 p){
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++){ s += a * vnoise(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; }
  return s / 0.9375;
}
`;

// 顶点与片元都能用：共享 uniform + 显色判定
export const COMMON = /* glsl */ `
uniform float uTime;
uniform sampler2D uMask;
uniform vec4 uMaskB;
uniform vec3 uBurstPos;
uniform float uBurstR;
uniform float uRevealMin;
uniform vec3 uSunDir;
uniform vec3 uPaper;
uniform vec3 uHaze;

float lum(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }

// 0 = 铅笔线稿，1 = 上色。脚印遮罩 + 花树爆发的球形扩散，边缘带水彩晕染的噪声
float revealAt(vec3 w){
  vec2 uv = (w.xz - uMaskB.xy) / uMaskB.zw;
  float m = texture2D(uMask, uv).r;
  float n = fbm(w.xz * 0.42 + w.y * 0.25);
  float v = smoothstep(0.43, 0.57, m + (n - 0.5) * 0.6);
  float d = length(w - uBurstPos) + (n - 0.5) * 6.0;
  float b = (1.0 - smoothstep(uBurstR - 2.5, uBurstR, d)) * step(0.001, uBurstR);
  return max(max(v, b), uRevealMin);
}
`;

// 只在片元里用（含 fwidth）
export const FRAG = /* glsl */ `
float hline(float c, float wd){
  float aa = fwidth(c);
  float d = abs(fract(c + 0.5) - 0.5);
  float l = 1.0 - smoothstep(wd * 0.5, wd * 0.5 + aa * 1.2 + 0.001, d);
  l *= smoothstep(0.0, 0.05, wd);
  return mix(l, wd, smoothstep(0.3, 0.75, aa));
}

// 一组断续的铅笔排线：每根线按“暗度”决定出不出现，沿线方向再断成长短不一的笔触
float strokeSet(vec3 w, vec3 dir, vec3 along, float dark, float seed){
  float c = dot(w, dir) * 9.0 + vnoise3(w * 1.1 + seed) * 0.8;
  float k = floor(c + 0.5);
  float d = abs(c - k);
  float aa = fwidth(c);
  float s = dot(w, along) * 1.7 + hash12(vec2(k, seed)) * 7.0;
  float seg = floor(s);
  float amt = clamp(dark * 1.25 - 0.1, 0.0, 1.0);
  float present = step(hash12(vec2(k * 1.37 + seg * 0.71, seed + 3.1)), amt);
  float f = fract(s);
  float gap = smoothstep(0.0, 0.07, f) * smoothstep(1.0, 0.9, f);
  float wd = 0.09 + 0.12 * dark;
  float l = (1.0 - smoothstep(wd * 0.5, wd * 0.5 + aa * 1.2 + 0.001, d)) * present * gap;
  return mix(l, wd * amt, smoothstep(0.3, 0.75, aa));
}

// 两组排线：亮处空白，暗处单排线，更暗处交叉排线
float hatch(vec3 w, vec3 N, float dark){
  vec3 d1 = normalize(vec3(0.62, 0.70, 0.35));
  vec3 d2 = normalize(vec3(-0.58, 0.62, 0.52));
  vec3 a1 = normalize(cross(d1, vec3(0.3, 0.2, 1.0)));
  vec3 a2 = normalize(cross(d2, vec3(1.0, 0.2, 0.3)));
  float h1 = strokeSet(w, d1, a1, dark, 1.0) * (1.0 - smoothstep(0.7, 0.95, abs(dot(N, d1))));
  float h2 = strokeSet(w, d2, a2, (dark - 0.4) * 1.6, 5.0) * (1.0 - smoothstep(0.7, 0.95, abs(dot(N, d2))));
  float g = 0.7 + 0.3 * vnoise3(w * 11.0);
  return max(h1, h2 * 0.9) * g;
}

varying float vT;

// 吉卜力式的柔和上色：暖光、冷影、天光补色、边缘逆光、颜料斑驳；树叶/花团加笔触斑点
vec3 painted(vec3 base, vec3 N, vec3 V, vec3 w){
  float ndl = dot(N, uSunDir);
  float fol = 0.0, lf = 3.0;
#ifdef FOLIAGE
  fol = vT;
#endif
#ifdef BLOSSOM
  fol = 1.0; lf = 5.5;
#endif
  float leaf = vnoise3(w * lf) * 0.65 + vnoise3(w * lf * 2.3) * 0.35;
  ndl += (leaf - 0.5) * 0.9 * fol;
  float lit = smoothstep(-0.22, 0.48, ndl);
#ifdef ALWAYS
  // 角色：从镜头方向补一点柔光，暗部偏暖，任何角度看都清楚
  lit = max(lit, clamp(dot(N, V), 0.0, 1.0) * 0.6);
  vec3 sh = base * vec3(0.80, 0.70, 0.74);
  vec3 li = base * vec3(1.06, 1.02, 0.96);
#elif defined(BLOSSOM)
  vec3 sh = base * vec3(0.88, 0.68, 0.74);
  vec3 li = base * vec3(1.05, 1.02, 1.0) + vec3(0.05, 0.04, 0.04);
#else
  vec3 sh = base * vec3(0.52, 0.60, 0.82);
  vec3 li = base * vec3(1.10, 1.04, 0.90);
#endif
  vec3 c = mix(sh, li, lit);
  c += vec3(0.04, 0.06, 0.09) * (N.y * 0.5 + 0.5);
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  c += vec3(1.0, 0.9, 0.7) * rim * 0.10 * (0.4 + lit);
  float fl1 = smoothstep(0.76, 0.84, vnoise3(w * lf * 3.1));
  float fl2 = smoothstep(0.78, 0.86, vnoise3(w * lf * 2.7 + 9.0));
  c = mix(c, li * 1.12 + 0.03, fl1 * lit * 0.55 * fol);
  c = mix(c, sh * 0.82, fl2 * (1.0 - lit) * 0.6 * fol);
  float pn = fbm(w.xz * 1.3 + w.y * 0.9);
  c *= 0.9 + 0.2 * pn;
  return c;
}

vec3 sketched(vec3 base, vec3 N, vec3 w){
  float ndl = dot(N, uSunDir);
  float tone = smoothstep(-0.35, 0.65, ndl);
  float dark = clamp((1.0 - tone) * 0.8 + (0.45 - lum(base)) * 0.7, 0.0, 1.0);
  float h = hatch(w, N, dark);
  return uPaper * (1.0 - h * 0.55) * (1.0 - dark * 0.06);
}

// 混合线稿与上色：交界处加一圈水彩积色，再叠空气透视
vec3 finish(vec3 sk, vec3 cc, float r, vec3 w){
  float rim = r * (1.0 - r) * 4.0;
  cc *= 1.0 - rim * 0.22;
  vec3 c = mix(sk, cc, r);
  float d = length(w - cameraPosition);
  float f = (1.0 - exp(-max(d - 14.0, 0.0) * 0.024)) * 0.9;
  return mix(c, mix(uPaper, uHaze, r), f);
}
`;
