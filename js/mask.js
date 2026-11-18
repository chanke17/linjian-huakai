import * as THREE from 'three';

// 俯视的“显色遮罩”：每一步在画布上印一团逐渐扩大的柔边圆，着色器据此决定线稿还是上色
export class ColorMask {
  constructor(b = { minX: -50, minZ: -72, sizeX: 100, sizeZ: 118 }, res = 512) {
    this.b = b;
    this.res = res;
    this.out = document.createElement('canvas');
    this.base = document.createElement('canvas');
    this.out.width = this.out.height = this.base.width = this.base.height = res;
    this.ctx = this.out.getContext('2d');
    this.bctx = this.base.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.out);
    this.tex.flipY = false;
    this.tex.generateMipmaps = false;
    this.tex.minFilter = this.tex.magFilter = THREE.LinearFilter;
    this.bounds = new THREE.Vector4(b.minX, b.minZ, b.sizeX, b.sizeZ);
    this.reset();
  }

  reset() {
    for (const c of [this.ctx, this.bctx]) {
      c.globalCompositeOperation = 'source-over';
      c.fillStyle = '#000';
      c.fillRect(0, 0, this.res, this.res);
    }
    this.stamps = [];
    this.tex.needsUpdate = true;
  }

  add(x, z, r, now, { delay = 0, dur = 1.4 } = {}) {
    this.stamps.push({ x, z, r, t0: now + delay, dur });
  }

  _draw(ctx, s, k) {
    const { b, res } = this;
    const px = ((s.x - b.minX) / b.sizeX) * res;
    const py = ((s.z - b.minZ) / b.sizeZ) * res;
    const rr = Math.max(0.5, ((s.r * k) / b.sizeX) * res);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(px, py);
    ctx.scale(1, b.sizeX / b.sizeZ);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rr);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.85)');
    g.addColorStop(0.75, 'rgba(255,255,255,0.4)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, rr, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  update(now) {
    if (!this.stamps.some((s) => now >= s.t0)) return;
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'copy';
    ctx.drawImage(this.base, 0, 0);
    const keep = [];
    for (const s of this.stamps) {
      if (now < s.t0) { keep.push(s); continue; }
      const k = Math.min(1, (now - s.t0) / s.dur);
      const e = 1 - Math.pow(1 - k, 3);
      if (k >= 1) this._draw(this.bctx, s, 1);
      else keep.push(s);
      this._draw(ctx, s, e);
    }
    this.stamps = keep;
    this.tex.needsUpdate = true;
  }
}
