(function(){
  // ===================== Parameters & World =====================
  const W = 150, H = 100, SCALE = 4; // grid and pixel scale
  const canvas = document.getElementById('view');
  canvas.width = W * SCALE; canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d', { alpha: false });
  const hud = document.getElementById('hud');

  // UI refs
  const ui = {
    u_max: qs('#u_max'), K: qs('#K'), c_maint: qs('#c_maint'), Y_E: qs('#Y_E'),
    E_div: qs('#E_div'), E_new: qs('#E_new'), D: qs('#D'), r: qs('#r'), Fmax: qs('#Fmax'),
    delta: qs('#delta'), seedNoise: qs('#seedNoise'), initB: qs('#initB'), rngSeed: qs('#rngSeed'),
    speed: qs('#speed'),
  };
  qid('gridSize').textContent = `${W}×${H}`;
  qid('pxScale').textContent = `${SCALE}`;

  // RNG (mulberry32)
  function mulberry32(a){ return function(){ let t = a += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; } }
  let rand = mulberry32(42);
  const rnd = () => rand();

  // Field arrays
  let F = new Float32Array(W*H);
  let Ftmp = new Float32Array(W*H);

  // Bacteria: array of {x, y, E}
  /** @type {{x:number, y:number, E:number}[]} */
  let B = [];

  // Controls
  let running = false; let ticks = 0; let birthsTotal = 0; let deathsTotal = 0;

  // ===================== Initialization =====================
  function setSeed(s){
    const n = s.toString();
    let h = 2166136261;
    for (let i=0;i<n.length;i++) { h ^= n.charCodeAt(i); h = Math.imul(h, 16777619); }
    rand = mulberry32(h >>> 0);
  }

  function seedFood(noise=0.35){
    const Fmax = parseFloat(ui.Fmax.value);
    for (let i=0;i<F.length;i++) {
      // base with mild gradient + noise
      const gx = (i % W) / W, gy = Math.floor(i / W) / H;
      const base = 0.8 - 0.6*Math.hypot(gx-0.5, gy-0.5);
      F[i] = clamp(base*Fmax + (rnd()*2-1)*noise*Fmax, 0, Fmax);
    }
  }

  function seedBacteria(n=150){
    const Ediv = parseFloat(ui.E_div.value);
    for (let i=0;i<n;i++) B.push({ x: (rnd()*W)|0, y: (rnd()*H)|0, E: 0.5*Ediv });
  }

  function reset(){
    setSeed(ui.rngSeed.value);
    B = []; ticks = 0; birthsTotal = 0; deathsTotal = 0;
    F.fill(0); Ftmp.fill(0);
    seedFood(parseFloat(ui.seedNoise.value));
    seedBacteria(parseInt(ui.initB.value,10));
    draw(); updateHUD();
  }

  // ===================== Simulation Core =====================
  function simulateTick(){
    const umax = parseFloat(ui.u_max.value);
    const K = parseFloat(ui.K.value);
    const cMaint = parseFloat(ui.c_maint.value);
    const YE = parseFloat(ui.Y_E.value);
    const Ediv = parseFloat(ui.E_div.value);
    const Enew = parseFloat(ui.E_new.value);

    // Uptake + energy + local food
    const births = [];
    const survivors = [];

    for (let i=0;i<B.length;i++){
      const b = B[i];
      const idx = b.x + b.y*W;
      let f = F[idx];
      let u = umax * f / (K + f + 1e-9);
      if (u > f) u = f; // cannot consume more than available

      b.E += YE*u - cMaint;
      F[idx] = f - u;

      // Death check
      if (b.E <= 0) { deathsTotal++; continue; }

      // Division check
      if (b.E >= Ediv) {
        // place offspring in random Moore neighbor
        const dir = pickNeighbor();
        const nx = clampInt(b.x + dir[0], 0, W-1);
        const ny = clampInt(b.y + dir[1], 0, H-1);
        if (b.E >= Enew) {
          b.E -= Enew;
          births.push({ x: nx, y: ny, E: Enew });
          birthsTotal++;
        }
      }

      survivors.push(b);
    }

    if (births.length) survivors.push(...births);
    B = survivors;

    // Food physics (diffusion + replenish + decay)
    diffuseAndReplenish();

    ticks++;
  }

  function diffuseAndReplenish(){
    const D = parseFloat(ui.D.value);
    const r = parseFloat(ui.r.value);
    const Fmax = parseFloat(ui.Fmax.value);
    const delta = parseFloat(ui.delta.value);

    // 5-point stencil, clamped borders
    for (let y=0; y<H; y++){
      const yN = (y>0? y-1 : y), yS = (y<H-1? y+1 : y);
      for (let x=0; x<W; x++){
        const xW = (x>0? x-1 : x), xE = (x<W-1? x+1 : x);
        const i = x + y*W;
        const fn = F[x + yN*W];
        const fs = F[x + yS*W];
        const fw = F[xW + y*W];
        const fe = F[xE + y*W];
        const f = F[i];
        let v = f + D * ((fn + fs + fw + fe) - 4*f);
        // replenish toward Fmax, decay
        v += r * (Fmax - v);
        v *= (1 - delta);
        Ftmp[i] = clamp(v, 0, Fmax);
      }
    }
    // swap
    const t = F; F = Ftmp; Ftmp = t;
  }

  function pickNeighbor(){
    // 8 neighbors
    const dirs = [
      [-1,-1],[0,-1],[1,-1],
      [-1, 0],        [1, 0],
      [-1, 1],[0, 1],[1, 1]
    ];
    return dirs[(rnd()*dirs.length)|0];
  }

  // ===================== Rendering =====================
  const img = ctx.createImageData(W*SCALE, H*SCALE);
  const data = img.data;

  function draw(){
    // Draw food field as grayscale → subtle bluish tint
    for (let y=0; y<H; y++){
      for (let x=0; x<W; x++){
        const i = x + y*W;
        const f = F[i];
        const Fmax = parseFloat(ui.Fmax.value);
        const v = Fmax > 0 ? (f / Fmax) : 0;
        // color map: dark navy → cyan
        const r = (8 + 30*v)|0;
        const g = (14 + 150*v)|0;
        const b = (28 + 200*v)|0;
        putScaledPixel(x, y, r, g, b, 255);
      }
    }

    // Draw bacteria as soft green pixels
    for (let i=0;i<B.length;i++){
      const {x,y} = B[i];
      putScaledPixel(x, y, 170, 255, 190, 255);
    }

    ctx.putImageData(img, 0, 0);
  }

  function putScaledPixel(x, y, r, g, b, a){
    const ps = SCALE;
    const baseX = x*ps, baseY = y*ps;
    for (let dy=0; dy<ps; dy++){
      for (let dx=0; dx<ps; dx++){
        const idx = ((baseY+dy)*W*ps + (baseX+dx)) * 4;
        data[idx+0] = r; data[idx+1] = g; data[idx+2] = b; data[idx+3] = a;
      }
    }
  }

  function updateHUD(){
    const avgFood = F.reduce((a,v)=>a+v,0) / F.length;
    const avgE = B.length ? (B.reduce((a,b)=>a+b.E,0) / B.length) : 0;
    hud.innerHTML = `
      <div><strong>Ticks:</strong> ${ticks}</div>
      <div><strong>Bacteria:</strong> ${B.length}</div>
      <div><strong>Avg energy:</strong> ${avgE.toFixed(2)}</div>
      <div><strong>Avg food:</strong> ${avgFood.toFixed(3)}</div>
      <div><strong>Births:</strong> ${birthsTotal} &nbsp; <strong>Deaths:</strong> ${deathsTotal}</div>
    `;
  }

  // ===================== Loop =====================
  function loop(){
    if (running){
      const steps = parseInt(ui.speed.value,10);
      for (let s=0;s<steps;s++) simulateTick();
      draw(); updateHUD();
    }
    requestAnimationFrame(loop);
  }

  // ===================== UI Events =====================
  qid('btnToggle').addEventListener('click', ()=>{
    running = !running;
    qid('btnToggle').textContent = running ? '⏸ Pause' : '▶️ Start';
  });
  qid('btnStep').addEventListener('click', ()=>{ simulateTick(); draw(); updateHUD(); });
  qid('btnReset').addEventListener('click', ()=>{ reset(); });
  qid('btnSeedB').addEventListener('click', ()=>{ seedBacteria(50); updateHUD(); draw(); });
  qid('btnSeedF').addEventListener('click', ()=>{ seedFood(parseFloat(ui.seedNoise.value)); draw(); });

  // Presets
  document.querySelectorAll('.preset').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const p = btn.dataset.preset;
      if (p === 'bloom'){
        setKnob('u_max', 1.0); setKnob('K', 0.2); setKnob('c_maint', 0.10); setKnob('Y_E', 1.0); setKnob('E_div', 3); setKnob('E_new', 1.5);
        setKnob('D', 0.10); setKnob('r', 0.01); setKnob('Fmax', 1.0); setKnob('delta', 0.0); setKnob('seedNoise', 0.35);
      } else if (p === 'patchy'){
        setKnob('u_max', 0.9); setKnob('K', 0.3); setKnob('c_maint', 0.12); setKnob('Y_E', 0.95); setKnob('E_div', 3.4); setKnob('E_new', 1.7);
        setKnob('D', 0.04); setKnob('r', 0.006); setKnob('Fmax', 1.1); setKnob('delta', 0.00); setKnob('seedNoise', 0.55);
      } else if (p === 'harsh'){
        setKnob('u_max', 0.8); setKnob('K', 0.25); setKnob('c_maint', 0.18); setKnob('Y_E', 0.9); setKnob('E_div', 3.8); setKnob('E_new', 1.6);
        setKnob('D', 0.10); setKnob('r', 0.004); setKnob('Fmax', 0.8); setKnob('delta', 0.02); setKnob('seedNoise', 0.30);
      } else if (p === 'fastdiff'){
        setKnob('u_max', 1.0); setKnob('K', 0.2); setKnob('c_maint', 0.10); setKnob('Y_E', 1.0); setKnob('E_div', 3); setKnob('E_new', 1.5);
        setKnob('D', 0.25); setKnob('r', 0.01); setKnob('Fmax', 1.0); setKnob('delta', 0.0); setKnob('seedNoise', 0.30);
      }
    });
  });

  // ===================== Knob Logic =====================
  const knobEls = Array.from(document.querySelectorAll('.knob'));
  const knobState = new Map();

  function clampToStep(value, min, max, step){
    const v = Math.min(Math.max(value, min), max);
    const snapped = Math.round((v - min) / step) * step + min;
    return Number(snapped.toFixed(6));
  }

  function valueToAngle(value, min, max){
    const t = (value - min) / (max - min || 1);
    return -135 + t * 270; // map to [-135, 135]
  }

  function angleToValue(angle, min, max){
    const t = (angle + 135) / 270;
    return min + t * (max - min);
  }

  function formatValue(val, step){
    const decimals = (step.toString().split('.')[1] || '').length;
    return val.toFixed(Math.min(3, Math.max(0, decimals)));
  }

  function setKnob(key, value){
    const entry = knobState.get(key);
    if (!entry) return;
    const v = clampToStep(value, entry.min, entry.max, entry.step);
    entry.value = v;
    entry.input.value = String(v);
    entry.valueEl.textContent = formatValue(v, entry.step);
    const ang = valueToAngle(v, entry.min, entry.max);
    entry.ind.style.transform = `translate(-50%, 0) rotate(${ang}deg)`;
  }

  function initKnobs(){
    knobEls.forEach(el=>{
      const key = el.dataset.key;
      const min = parseFloat(el.dataset.min);
      const max = parseFloat(el.dataset.max);
      const step = parseFloat(el.dataset.step);
      const input = el.querySelector('input[type="hidden"]');
      const dial = el.querySelector('.knob__dial');
      const ind = el.querySelector('.knob__indicator');
      const valueEl = el.querySelector('.knob__value');
      const startValue = parseFloat(input.value);
      knobState.set(key, { min, max, step, input, dial, ind, valueEl, value: startValue });
      setKnob(key, startValue);

      let dragging = false;
      let startAngle = 0;
      let startVal = startValue;

      function updateFromPointer(clientX, clientY){
        const rect = dial.getBoundingClientRect();
        const cx = rect.left + rect.width/2;
        const cy = rect.top + rect.height/2;
        const ang = Math.atan2(clientY - cy, clientX - cx) * 180 / Math.PI + 90; // 0 at top
        const clampedAng = Math.min(135, Math.max(-135, ang));
        const rawVal = angleToValue(clampedAng, min, max);
        setKnob(key, rawVal);
      }

      dial.addEventListener('mousedown', (e)=>{ dragging = true; e.preventDefault(); });
      window.addEventListener('mousemove', (e)=>{ if (dragging) updateFromPointer(e.clientX, e.clientY); });
      window.addEventListener('mouseup', ()=>{ dragging = false; });

      dial.addEventListener('touchstart', (e)=>{ dragging = true; e.preventDefault(); });
      window.addEventListener('touchmove', (e)=>{ if (!dragging) return; const t = e.touches[0]; updateFromPointer(t.clientX, t.clientY); }, { passive: false });
      window.addEventListener('touchend', ()=>{ dragging = false; });

      dial.addEventListener('wheel', (e)=>{
        e.preventDefault();
        const delta = Math.sign(e.deltaY) * step;
        setKnob(key, knobState.get(key).value - delta);
      }, { passive: false });
    });
  }

  // init knobs before first reset so values are in sync
  initKnobs();

  // Helpers
  function clamp(v, lo, hi){ return v < lo ? lo : v > hi ? hi : v; }
  function clampInt(v, lo, hi){ return v < lo ? lo : v > hi ? hi : v|0; }
  function qs(sel){ return document.querySelector(sel); }
  function qid(id){ return document.getElementById(id); }

  // Kick off
  reset();
  loop();
})();
