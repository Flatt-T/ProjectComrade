// Visual-only effects layer: particles, ground decals and superweapon animations.
// Nothing here touches the simulation, so Math.random is fine.

export interface Particle {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  life: number; max: number;
  size: number; grow: number;
  color: [number, number, number];
  alpha: number;
  gravity: number;
  glow?: boolean;
}

export interface Decal { x: number; y: number; r: number; until: number; born: number; kind: 'scorch' | 'crater' | 'wreck' }

const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class FxLayer {
  particles: Particle[] = [];
  decals: Decal[] = [];

  emit(x: number, y: number, z: number, n: number, kind: 'smoke' | 'fire' | 'spark' | 'debris' | 'dust' | 'sand' | 'blue' | 'steam', scale = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      let p: Particle;
      switch (kind) {
        case 'smoke': p = { x: x + rand(-4, 4) * scale, y: y + rand(-3, 3) * scale, z, vx: rand(-6, 6) * scale, vy: rand(-3, 3), vz: rand(10, 26) * scale, life: 0, max: rand(1.2, 2.4), size: rand(3, 6) * scale, grow: rand(5, 10) * scale, color: [104, 98, 92], alpha: 0.34, gravity: 0 }; break;
        case 'steam': p = { x: x + rand(-3, 3), y: y + rand(-2, 2), z, vx: rand(-3, 3), vy: 0, vz: rand(14, 24), life: 0, max: rand(0.8, 1.4), size: rand(2, 4), grow: rand(4, 8), color: [210, 206, 200], alpha: 0.35, gravity: 0 }; break;
        case 'fire': p = { x: x + rand(-5, 5) * scale, y: y + rand(-4, 4) * scale, z: z + rand(0, 6), vx: rand(-14, 14) * scale, vy: rand(-8, 8) * scale, vz: rand(14, 40) * scale, life: 0, max: rand(0.35, 0.8), size: rand(3, 7) * scale, grow: rand(2, 6) * scale, color: [255, rand(120, 200), 40], alpha: 0.9, gravity: 0, glow: true }; break;
        case 'spark': p = { x, y, z, vx: Math.cos(a) * rand(30, 110) * scale, vy: Math.sin(a) * rand(20, 70) * scale, vz: rand(30, 120) * scale, life: 0, max: rand(0.3, 0.7), size: rand(1, 1.8), grow: -1, color: [255, rand(200, 240), 120], alpha: 1, gravity: 240, glow: true }; break;
        case 'blue': p = { x, y, z, vx: Math.cos(a) * rand(20, 90) * scale, vy: Math.sin(a) * rand(15, 60) * scale, vz: rand(20, 100) * scale, life: 0, max: rand(0.3, 0.8), size: rand(1, 2), grow: -1, color: [170, 230, 255], alpha: 1, gravity: 160, glow: true }; break;
        case 'debris': p = { x, y, z: z + 4, vx: Math.cos(a) * rand(20, 80) * scale, vy: Math.sin(a) * rand(15, 50) * scale, vz: rand(40, 110) * scale, life: 0, max: rand(0.6, 1.1), size: rand(1.5, 3), grow: 0, color: [54, 50, 44], alpha: 1, gravity: 260 }; break;
        case 'sand': p = { x: x + rand(-6, 6) * scale, y: y + rand(-4, 4) * scale, z, vx: Math.cos(a) * rand(6, 26) * scale, vy: Math.sin(a) * rand(4, 16) * scale, vz: rand(8, 30) * scale, life: 0, max: rand(0.6, 1.3), size: rand(2, 4) * scale, grow: rand(4, 9) * scale, color: [214, 176, 118], alpha: 0.5, gravity: 20 }; break;
        default: p = { x: x + rand(-5, 5) * scale, y: y + rand(-3, 3) * scale, z, vx: Math.cos(a) * rand(6, 22) * scale, vy: Math.sin(a) * rand(3, 12) * scale, vz: rand(4, 16) * scale, life: 0, max: rand(0.5, 1.1), size: rand(2, 4) * scale, grow: rand(3, 7) * scale, color: [150, 136, 112], alpha: 0.45, gravity: 10 }; break;
      }
      this.particles.push(p);
    }
    if (this.particles.length > 1800) this.particles.splice(0, this.particles.length - 1800);
  }

  step(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.max) { this.particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.vz -= p.gravity * dt;
      if (p.z < 0) { p.z = 0; p.vz *= -0.3; p.vx *= 0.6; p.vy *= 0.6; }
      p.vx *= 1 - dt * 0.8; p.vy *= 1 - dt * 0.8;
      p.size = Math.max(0.3, p.size + p.grow * dt);
    }
    const now = performance.now();
    this.decals = this.decals.filter(d => d.until > now);
  }

  draw(ctx: CanvasRenderingContext2D) {
    for (const p of this.particles) {
      const k = 1 - p.life / p.max;
      const [r, g, b] = p.color;
      if (p.glow) ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(${r | 0},${g | 0},${b | 0},${p.alpha * k})`;
      ctx.beginPath(); ctx.arc(p.x, p.y - p.z, p.size, 0, Math.PI * 2); ctx.fill();
      if (p.glow) ctx.globalCompositeOperation = 'source-over';
    }
  }

  drawDecals(ctx: CanvasRenderingContext2D, iso: boolean) {
    const now = performance.now();
    for (const d of this.decals) {
      const fade = Math.min(1, (d.until - now) / 4000);
      const sy = iso ? 0.5 : 0.75;
      if (d.kind === 'wreck') {
        // Burnt-out hull with dying embers.
        ctx.fillStyle = `rgba(30,28,26,${0.85 * fade})`;
        ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r, d.r * sy, 0.3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(70,64,58,${0.8 * fade})`;
        ctx.fillRect(d.x - d.r * 0.5, d.y - d.r * 0.5, d.r, d.r * 0.4);
        if ((now - d.born) < 8000 && Math.random() < 0.5) {
          ctx.fillStyle = `rgba(255,${120 + Math.random() * 80},40,${0.8 * fade})`;
          ctx.beginPath(); ctx.arc(d.x + rand(-3, 3), d.y + rand(-2, 2), 1.5, 0, Math.PI * 2); ctx.fill();
        }
        continue;
      }
      const g = ctx.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r);
      const a = (d.kind === 'crater' ? 0.75 : 0.5) * fade;
      g.addColorStop(0, `rgba(24,18,14,${a})`); g.addColorStop(0.6, `rgba(40,30,22,${a * 0.6})`); g.addColorStop(1, 'rgba(40,30,22,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r, d.r * sy, 0, 0, Math.PI * 2); ctx.fill();
      if (d.kind === 'crater') {
        ctx.strokeStyle = `rgba(90,74,58,${0.6 * fade})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r * 0.55, d.r * 0.55 * sy, 0, 0, Math.PI * 2); ctx.stroke();
      }
    }
  }
}

/** A jagged lightning path from (x0,y0) to (x1,y1). */
export function bolt(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number, jag: number, alpha: number) {
  const steps = 10;
  const pts: [number, number][] = [[x0, y0]];
  for (let k = 1; k < steps; k++) {
    const f = k / steps;
    pts.push([x0 + (x1 - x0) * f + rand(-jag, jag), y0 + (y1 - y0) * f + rand(-jag * 0.3, jag * 0.3)]);
  }
  pts.push([x1, y1]);
  const path = () => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); };
  ctx.globalCompositeOperation = 'lighter';
  path(); ctx.strokeStyle = `rgba(120,170,255,${0.5 * alpha})`; ctx.lineWidth = 7; ctx.stroke();
  path(); ctx.strokeStyle = `rgba(200,225,255,${0.8 * alpha})`; ctx.lineWidth = 3; ctx.stroke();
  path(); ctx.strokeStyle = `rgba(255,255,255,${alpha})`; ctx.lineWidth = 1.2; ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
  return pts;
}

/** A missile drawn along `angle`, with exhaust flame. */
export function missile(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, size: number, flicker: number) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
  ctx.globalCompositeOperation = 'lighter';
  const fl = ctx.createRadialGradient(-size * 1.4, 0, 0, -size * 1.4, 0, size * (1.6 + flicker));
  fl.addColorStop(0, 'rgba(255,250,210,0.95)'); fl.addColorStop(0.4, 'rgba(255,170,60,0.7)'); fl.addColorStop(1, 'rgba(255,90,20,0)');
  ctx.fillStyle = fl; ctx.beginPath(); ctx.ellipse(-size * 1.6, 0, size * (1.6 + flicker), size * 0.7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#e8e8e4'; ctx.fillRect(-size, -size * 0.3, size * 2, size * 0.6);
  ctx.fillStyle = '#c0392b'; ctx.beginPath(); ctx.moveTo(size, -size * 0.3); ctx.lineTo(size * 1.6, 0); ctx.lineTo(size, size * 0.3); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#7d7f80'; ctx.fillRect(-size, -size * 0.55, size * 0.5, size * 1.1);
  ctx.restore();
}
