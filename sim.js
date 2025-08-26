(function(){
  class Sim {
    constructor(canvas, hud){
      this.W = 150; this.H = 100; this.SCALE = 4;
      this.canvas = canvas;
      this.canvas.width = this.W * this.SCALE;
      this.canvas.height = this.H * this.SCALE;
      this.ctx = this.canvas.getContext('2d', { alpha: false });
      this.hud = hud;

      this.rand = this.mulberry32(42);
      this.rnd = () => this.rand();

      this.F = new Float32Array(this.W*this.H);
      this.Ftmp = new Float32Array(this.W*this.H);
      this.obs = new Uint8Array(this.W*this.H);
      /** @type {{x:number, y:number, E:number}[]} */
      this.B = [];

      this.ticks = 0; this.birthsTotal = 0; this.deathsTotal = 0;

      this.img = this.ctx.createImageData(this.W*this.SCALE, this.H*this.SCALE);
      this.data = this.img.data;

      this.theme = {
        foodEmpty: [7, 10, 18],
        foodLow: [8, 30, 60],
        foodHigh: [110, 195, 255],
        bacteria: [170, 255, 190],
        gamma: 1.0
      };
    }

    // RNG
    mulberry32(a){ return function(){ let t = a += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; } }
    setSeed(seedStr){
      const n = seedStr.toString();
      let h = 2166136261;
      for (let i=0;i<n.length;i++) { h ^= n.charCodeAt(i); h = Math.imul(h, 16777619); }
      this.rand = this.mulberry32(h >>> 0);
    }

    // Helpers
    clamp(v, lo, hi){ return v < lo ? lo : v > hi ? hi : v; }
    clampInt(v, lo, hi){ return v < lo ? lo : v > hi ? hi : v|0; }
    pickNeighbor(){
      const dirs = [[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];
      return dirs[(this.rnd()*dirs.length)|0];
    }

    // Init
    reset(seed, initB, seedNoise, E_div){
      this.setSeed(seed);
      this.B.length = 0; this.ticks = 0; this.birthsTotal = 0; this.deathsTotal = 0;
      this.F.fill(0); this.Ftmp.fill(0); this.obs.fill(0);
      this.seedFood(this.Fmax || 1.0, seedNoise);
      this.seedBacteria(initB, E_div);
    }

    seedFood(Fmax, noise){
      this.Fmax = Fmax;
      for (let i=0;i<this.F.length;i++){
        const gx = (i % this.W) / this.W, gy = Math.floor(i / this.W) / this.H;
        const base = 0.8 - 0.6*Math.hypot(gx-0.5, gy-0.5);
        this.F[i] = this.clamp(base*Fmax + (this.rnd()*2-1)*noise*Fmax, 0, Fmax);
      }
    }

    seedBacteria(n, E_div){
      for (let i=0;i<n;i++) this.B.push({ x: (this.rnd()*this.W)|0, y: (this.rnd()*this.H)|0, E: 0.5*E_div });
    }

    tick(params){
      const { u_max, K, c_maint, Y_E, E_div, E_new, D, r, Fmax, delta, moveRate } = params;

      // Bacteria phase
      const births = []; const survivors = [];
      for (let i=0;i<this.B.length;i++){
        const b = this.B[i];
        const idx = b.x + b.y*this.W;
        let f = this.F[idx];
        let u = u_max * f / (K + f + 1e-9);
        if (u > f) u = f;
        b.E += Y_E*u - c_maint;
        this.F[idx] = f - u;

        if (b.E <= 0) { this.deathsTotal++; continue; }
        if (b.E >= E_div){
          const dir = this.pickNeighbor();
          const nx = this.clampInt(b.x + dir[0], 0, this.W-1);
          const ny = this.clampInt(b.y + dir[1], 0, this.H-1);
          if (b.E >= E_new && !this.obs[nx + ny*this.W]){
            b.E -= E_new;
            births.push({ x: nx, y: ny, E: E_new });
            this.birthsTotal++;
          }
        }
        if (moveRate && moveRate > 0){
          if (this.rnd() < moveRate){
            const d = this.pickNeighbor();
            const mx = this.clampInt(b.x + d[0], 0, this.W-1);
            const my = this.clampInt(b.y + d[1], 0, this.H-1);
            if (!this.obs[mx + my*this.W]){ b.x = mx; b.y = my; }
          }
        }
        survivors.push(b);
      }
      if (births.length) survivors.push(...births);
      this.B = survivors;

      // Food physics
      this.diffuseAndReplenish(D, r, Fmax, delta);

      this.ticks++;
    }

    diffuseAndReplenish(D, r, Fmax, delta){
      const W = this.W, H = this.H, F = this.F, Ftmp = this.Ftmp;
      for (let y=0; y<H; y++){
        const yN = (y>0? y-1 : y), yS = (y<H-1? y+1 : y);
        for (let x=0; x<W; x++){
          const xW = (x>0? x-1 : x), xE = (x<W-1? x+1 : x);
          const i = x + y*W;
          if (this.obs[i]){ this.Ftmp[i] = this.F[i]; continue; }
          const fn = F[x + yN*W];
          const fs = F[x + yS*W];
          const fw = F[xW + y*W];
          const fe = F[xE + y*W];
          const f = F[i];
          let v = f + D * ((fn + fs + fw + fe) - 4*f);
          v += r * (Fmax - v);
          v *= (1 - delta);
          Ftmp[i] = this.clamp(v, 0, Fmax);
        }
      }
      // swap
      this.F = Ftmp; this.Ftmp = F;
    }

    render(Fmax, overlayCtx){
      const W = this.W, H = this.H, SCALE = this.SCALE, data = this.data, img = this.img;
      const [re,ge,be] = this.theme.foodEmpty;
      const [rl,gl,bl] = this.theme.foodLow;
      const [rh,gh,bh] = this.theme.foodHigh;
      const gamma = this.theme.gamma || 1.0;
      // Food
      for (let y=0; y<H; y++){
        for (let x=0; x<W; x++){
          const i = x + y*W;
          const f = this.F[i];
          if (f <= 0){
            this.putScaledPixel(x, y, re, ge, be, 255);
            continue;
          }
          let v = Fmax > 0 ? (f / Fmax) : 0;
          if (gamma !== 1.0){ v = Math.pow(v, 1/gamma); }
          const r = (rl + (rh-rl)*v)|0;
          const g = (gl + (gh-gl)*v)|0;
          const b = (bl + (bh-bl)*v)|0;
          this.putScaledPixel(x, y, r, g, b, 255);
        }
      }
      // Obstacles overlay to dim food
      for (let y=0; y<H; y++){
        for (let x=0; x<W; x++){
          const i = x + y*W; if (!this.obs[i]) continue;
          const ps = this.SCALE;
          const baseX = x*ps, baseY = y*ps;
          for (let dy=0; dy<ps; dy++){
            for (let dx=0; dx<ps; dx++){
              const idx = ((baseY+dy)*W*ps + (baseX+dx)) * 4;
              data[idx+0] = (data[idx+0]*0.3)|0; data[idx+1] = (data[idx+1]*0.3)|0; data[idx+2] = (data[idx+2]*0.3)|0; data[idx+3] = 255;
            }
          }
        }
      }

      // Bacteria (base)
      for (let i=0;i<this.B.length;i++){
        const {x,y} = this.B[i];
        const [br,bg,bb] = this.theme.bacteria;
        const idx = x + y*W;
        if (!this.obs[idx]) this.putScaledPixel(x, y, br, bg, bb, 255);
      }
      this.ctx.putImageData(img, 0, 0);

      // Tracer overlay
      if (overlayCtx){
        const alpha = this.theme.tracerAlpha || 0;
        if (alpha > 0){
          overlayCtx.globalCompositeOperation = 'destination-out';
          overlayCtx.fillStyle = `rgba(0,0,0,${0.08 + (0.4*alpha)})`;
          overlayCtx.fillRect(0,0,this.canvas.width,this.canvas.height);
          overlayCtx.globalCompositeOperation = 'lighter';
          const [br,bg,bb] = this.theme.bacteria;
          overlayCtx.fillStyle = `rgba(${br},${bg},${bb},${Math.min(0.9, 0.2+alpha)})`;
          const ps = this.SCALE;
          for (let i=0;i<this.B.length;i++){
            const {x,y} = this.B[i];
            overlayCtx.fillRect(x*ps, y*ps, ps, ps);
          }
          overlayCtx.globalCompositeOperation = 'source-over';
        } else {
          overlayCtx.clearRect(0,0,this.canvas.width,this.canvas.height);
        }
      }
    }

    putScaledPixel(x, y, r, g, b, a){
      const ps = this.SCALE, W = this.W, data = this.data;
      const baseX = x*ps, baseY = y*ps;
      for (let dy=0; dy<ps; dy++){
        for (let dx=0; dx<ps; dx++){
          const idx = ((baseY+dy)*W*ps + (baseX+dx)) * 4;
          data[idx+0] = r; data[idx+1] = g; data[idx+2] = b; data[idx+3] = a;
        }
      }
    }

    getStats(Fmax){
      const avgFood = this.F.reduce((a,v)=>a+v,0) / this.F.length;
      const avgE = this.B.length ? (this.B.reduce((a,b)=>a+b.E,0) / this.B.length) : 0;
      return {
        ticks: this.ticks,
        count: this.B.length,
        avgE: avgE,
        avgFood: avgFood,
        births: this.birthsTotal,
        deaths: this.deathsTotal
      };
    }

    setTheme({ foodEmpty, foodLow, foodHigh, bacteria, gamma, tracerAlpha }){
      const parse = (hex)=>{
        if (!hex) return null;
        const m = /^#?([0-9a-fA-F]{6})$/.exec(hex);
        if (!m) return null;
        const h = m[1];
        return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
      };
      const fe = parse(foodEmpty); const fl = parse(foodLow); const fh = parse(foodHigh); const bc = parse(bacteria);
      if (fe) this.theme.foodEmpty = fe;
      if (fl) this.theme.foodLow = fl;
      if (fh) this.theme.foodHigh = fh;
      if (bc) this.theme.bacteria = bc;
      if (typeof gamma === 'number') this.theme.gamma = gamma;
      if (typeof tracerAlpha === 'number') this.theme.tracerAlpha = tracerAlpha;
    }
  }

  window.Sim = Sim;
})();
