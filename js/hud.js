import * as THREE from 'three';

// 屏幕上的 UI：任务清单、吵醒值、互动提示、对话气泡、目标箭头、淡入淡出、结尾卡片。
// 计时都用游戏时间 t（录屏逐帧推进时也对得上）。
const el = (tag, id, parent = document.body, cls = '') => {
  const e = document.createElement(tag);
  if (id) e.id = id;
  if (cls) e.className = cls;
  parent.appendChild(e);
  return e;
};

export class Hud {
  constructor(camera, touch) {
    this.cam = camera;
    this.touch = touch;
    this.goalsEl = el('div', 'goals');
    this.noiseEl = el('div', 'noise');
    this.noiseEl.innerHTML = '<span>嘘——别吵醒他</span><div class="bar"><i></i></div>';
    this.noiseBar = this.noiseEl.querySelector('i');
    this.noiseLabel = this.noiseEl.querySelector('span');
    this.promptEl = el('div', 'prompt');
    this.actBtn = el('button', 'act-btn');
    this.carryEl = el('div', 'carry');
    this.toastEl = el('div', 'toast');
    this.bubbleLayer = el('div', 'bubbles');
    this.markerEl = el('div', 'marker');
    this.markerEl.textContent = '▼';
    this.fadeEl = el('div', 'fade');
    this.endEl = el('div', 'endcard');
    this.endEl.innerHTML = '<h2>完</h2><p></p><div class="row"><button data-k="room">↻ 再玩一次奶奶家</button><button data-k="all">从树林重新开始</button></div>';
    this.endEl.addEventListener('click', (e) => { const k = e.target?.dataset?.k; if (k && this.onEnd) this.onEnd(k); });
    this.actBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (this.onAct) this.onAct(); });
    this.bubbles = new Map();
    this._goals = '';
    this.toastT = 0;
    this.fadeS = null;
    this.markerFn = null;
    this.t = 0;
    this._v = new THREE.Vector3();
  }

  screen(p) {
    const v = this._v.copy(p).project(this.cam);
    if (v.z > 1 || v.z < -1) return null;
    return [(v.x * 0.5 + 0.5) * innerWidth, (-v.y * 0.5 + 0.5) * innerHeight];
  }

  room(on) {
    document.body.classList.toggle('in-room', on);
    this.toastEl.classList.remove('show'); this.toastT = 0;
    if (!on) { this.goals(null); this.noise(null); this.carry(null); this.marker(null); this.clearBubbles(); this.end(false); }
  }

  prompt(text) {
    const s = text || '';
    if (s === this._prompt) return;
    this._prompt = s;
    this.promptEl.innerHTML = s ? (this.touch ? '' : '<kbd>E</kbd> ') + s : '';
    this.promptEl.classList.toggle('show', !!s);
    this.actBtn.textContent = s ? s.replace(/（.*?）/g, '').slice(0, 8) : '';
    this.actBtn.classList.toggle('show', !!s && this.touch);
  }

  goals(list) {
    const html = list ? list.map((g) => `<li class="${g.done ? 'done' : ''}"><b>${g.done ? '✔' : '○'}</b>${g.t}${g.sub && !g.done ? `<small>${g.sub}</small>` : ''}</li>`).join('') : '';
    if (html === this._goals) return;
    this._goals = html;
    this.goalsEl.innerHTML = html ? `<h3>奶奶家</h3><ul>${html}</ul>` : '';
    this.goalsEl.classList.toggle('show', !!html);
  }

  noise(v, label) {
    this.noiseEl.classList.toggle('show', v !== null && v !== undefined);
    if (v === null || v === undefined) return;
    this.noiseBar.style.width = `${Math.round(Math.min(1, v) * 100)}%`;
    this.noiseBar.style.background = v < 0.5 ? '#86b36b' : v < 0.8 ? '#e9b24a' : '#e0614f';
    if (label && label !== this._nl) { this._nl = label; this.noiseLabel.textContent = label; }
  }

  carry(text) {
    const s = text ? `手里：${text}` : '';
    if (s === this._carry) return;
    this._carry = s;
    this.carryEl.textContent = s;
    this.carryEl.classList.toggle('show', !!s);
  }

  toast(text, dur = 2.8) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    this.toastT = this.t + dur;
  }

  // who: 'girl' | 'wolf' | 'grandma' | 'think' | 'zzz'；同一个 key 的新气泡替换旧的
  say(key, anchor, text, dur = 2.4, who = key) {
    let b = this.bubbles.get(key);
    if (!b) {
      b = { e: el('div', null, this.bubbleLayer, 'bubble') };
      this.bubbles.set(key, b);
    }
    b.e.className = `bubble ${who}`;
    b.e.textContent = text;
    b.anchor = anchor;
    b.until = this.t + dur;
    b.e.classList.add('show');
  }
  hush(key) { const b = this.bubbles.get(key); if (b) b.until = 0; }
  clearBubbles() { for (const b of this.bubbles.values()) b.e.remove(); this.bubbles.clear(); }

  marker(fn) { this.markerFn = fn; }

  // 纸色淡出 → 回调 → 淡入
  fade(cb, hold = 0.2) { this.fadeS = { t0: this.t, cb, hold, fired: false }; }

  end(show, text = '') {
    if (text) this.endEl.querySelector('p').textContent = text;
    this.endEl.classList.toggle('show', show);
  }

  update(t) {
    this.t = t;
    for (const [k, b] of this.bubbles) {
      if (t > b.until) { b.e.classList.remove('show'); continue; }
      const p = this.screen(b.anchor());
      if (!p) { b.e.style.opacity = 0; continue; }
      b.e.style.opacity = '';
      // 别跑出屏幕：上面留出气泡自己的高度，左右留半个宽度
      const hw = b.e.offsetWidth / 2 + 8, hh = b.e.offsetHeight + 16;
      const x = Math.min(innerWidth - hw, Math.max(hw, p[0])), y = Math.min(innerHeight - 8, Math.max(hh, p[1]));
      b.e.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
    }
    if (this.markerFn) {
      const p = this.screen(this.markerFn());
      this.markerEl.classList.toggle('show', !!p);
      if (p) this.markerEl.style.transform = `translate(${p[0].toFixed(1)}px, ${(p[1] + Math.sin(t * 5) * 6).toFixed(1)}px) translate(-50%, -100%)`;
    } else this.markerEl.classList.remove('show');
    if (this.toastT && t > this.toastT) { this.toastEl.classList.remove('show'); this.toastT = 0; }
    if (this.fadeS) {
      const f = this.fadeS, k = t - f.t0, a = 0.45;
      let o;
      if (k < a) o = k / a;
      else {
        if (!f.fired) { f.fired = true; f.cb(); }
        o = 1 - Math.max(0, (k - a - f.hold) / 0.55);
      }
      this.fadeEl.style.opacity = Math.max(0, Math.min(1, o)).toFixed(3);
      if (k > a + f.hold + 0.55) { this.fadeS = null; this.fadeEl.style.opacity = 0; }
    }
  }
}
