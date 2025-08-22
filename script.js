(function(){
  // ===================== Parameters & World =====================
  const W = 150, H = 100, SCALE = 4; // grid and pixel scale
  const canvas = document.getElementById('view');
  canvas.width = W * SCALE; canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d', { alpha: false });
  const hud = document.getElementById('hud');
  const sim = new Sim(canvas, hud);

  // UI refs
  const ui = {
    u_max: qs('#u_max'), K: qs('#K'), c_maint: qs('#c_maint'), Y_E: qs('#Y_E'),
    E_div: qs('#E_div'), E_new: qs('#E_new'), D: qs('#D'), r: qs('#r'), Fmax: qs('#Fmax'),
    delta: qs('#delta'), seedNoise: qs('#seedNoise'), initB: qs('#initB'), rngSeed: qs('#rngSeed'),
    speed: qs('#speed'),
  };
  qid('gridSize').textContent = `${sim.W}×${sim.H}`;
  qid('pxScale').textContent = `${sim.SCALE}`;

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

  function reset(){
    sim.reset(
      ui.rngSeed.value,
      parseInt(ui.initB.value,10),
      parseFloat(ui.seedNoise.value),
      parseFloat(ui.E_div.value)
    );
    draw();
    updateHUD();
  }

  // ===================== Simulation Core =====================
  function simulateTick(){
    sim.tick({
      u_max: parseFloat(ui.u_max.value),
      K: parseFloat(ui.K.value),
      c_maint: parseFloat(ui.c_maint.value),
      Y_E: parseFloat(ui.Y_E.value),
      E_div: parseFloat(ui.E_div.value),
      E_new: parseFloat(ui.E_new.value),
      D: parseFloat(ui.D.value),
      r: parseFloat(ui.r.value),
      Fmax: parseFloat(ui.Fmax.value),
      delta: parseFloat(ui.delta.value),
    });
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
  function draw(){
    sim.render(parseFloat(ui.Fmax.value));
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
    const stats = sim.getStats(parseFloat(ui.Fmax.value));
    hud.innerHTML = `
      <div><strong>Ticks:</strong> ${stats.ticks}</div>
      <div><strong>Bacteria:</strong> ${stats.count}</div>
      <div><strong>Avg energy:</strong> ${stats.avgE.toFixed(2)}</div>
      <div><strong>Avg food:</strong> ${stats.avgFood.toFixed(3)}</div>
      <div><strong>Births:</strong> ${stats.births} &nbsp; <strong>Deaths:</strong> ${stats.deaths}</div>
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
  qid('btnSeedB').addEventListener('click', ()=>{ sim.seedBacteria(50, parseFloat(ui.E_div.value)); updateHUD(); draw(); });
  qid('btnSeedF').addEventListener('click', ()=>{ sim.seedFood(parseFloat(ui.Fmax.value), parseFloat(ui.seedNoise.value)); draw(); });

  // Presets
  document.querySelectorAll('.preset').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const p = btn.dataset.preset;
      if (p === 'bloom'){
        setSlider('u_max', 1.0); setSlider('K', 0.2); setSlider('c_maint', 0.10); setSlider('Y_E', 1.0); setSlider('E_div', 3); setSlider('E_new', 1.5);
        setSlider('D', 0.10); setSlider('r', 0.01); setSlider('Fmax', 1.0); setSlider('delta', 0.0); setSlider('seedNoise', 0.35);
      } else if (p === 'patchy'){
        setSlider('u_max', 0.9); setSlider('K', 0.3); setSlider('c_maint', 0.12); setSlider('Y_E', 0.95); setSlider('E_div', 3.4); setSlider('E_new', 1.7);
        setSlider('D', 0.04); setSlider('r', 0.006); setSlider('Fmax', 1.1); setSlider('delta', 0.00); setSlider('seedNoise', 0.55);
      } else if (p === 'harsh'){
        setSlider('u_max', 0.8); setSlider('K', 0.25); setSlider('c_maint', 0.18); setSlider('Y_E', 0.9); setSlider('E_div', 3.8); setSlider('E_new', 1.6);
        setSlider('D', 0.10); setSlider('r', 0.004); setSlider('Fmax', 0.8); setSlider('delta', 0.02); setSlider('seedNoise', 0.30);
      } else if (p === 'fastdiff'){
        setSlider('u_max', 1.0); setSlider('K', 0.2); setSlider('c_maint', 0.10); setSlider('Y_E', 1.0); setSlider('E_div', 3); setSlider('E_new', 1.5);
        setSlider('D', 0.25); setSlider('r', 0.01); setSlider('Fmax', 1.0); setSlider('delta', 0.0); setSlider('seedNoise', 0.30);
      }
    });
  });

  // ===================== Slider Value Binding =====================
  const sliderIds = ['u_max','K','c_maint','Y_E','E_div','E_new','D','r','Fmax','delta','seedNoise'];
  function setSlider(id, value){
    const el = qid(id);
    if (!el) return;
    el.value = String(value);
    const disp = document.querySelector(`[data-val="${id}"]`);
    if (disp) {
      const stepAttr = el.getAttribute('step') || '0.01';
      const decimals = (stepAttr.split('.')[1] || '').length;
      disp.textContent = Number(value).toFixed(Math.min(3, Math.max(0, decimals)));
    }
  }

  function bindSliders(){
    sliderIds.forEach(id=>{
      const el = qid(id);
      const disp = document.querySelector(`[data-val="${id}"]`);
      if (!el || !disp) return;
      el.addEventListener('input', ()=> setSlider(id, parseFloat(el.value)));
      // initialize display
      setSlider(id, parseFloat(el.value));
    });
  }

  bindSliders();

  // ===================== Param Info Modal =====================
  const paramInfo = {
    'u_max': {
      title: 'u_max — Max uptake rate',
      body: 'Maximum food uptake rate in Monod kinetics. Controls how quickly cells can consume when food is plentiful.'
    },
    'K': {
      title: 'K — Half-saturation',
      body: 'Food concentration at which uptake reaches half of u_max. Lower K increases efficiency at low food levels.'
    },
    'c_maint': {
      title: 'c_maint — Maintenance cost',
      body: 'Baseline energy expenditure per tick. If uptake cannot cover this, energy declines and cells may die.'
    },
    'Y_E': {
      title: 'Y_E — Yield to energy',
      body: 'Fraction of consumed food converted to internal energy. Higher values allow energy to accumulate faster.'
    },
    'E_div': {
      title: 'E_div — Division threshold',
      body: 'Internal energy level required to trigger division. On division, a new cell spawns in a neighboring tile.'
    },
    'E_new': {
      title: 'E_new — Offspring energy',
      body: 'Initial energy granted to the offspring. Parent loses this amount when dividing.'
    },
    'D': {
      title: 'D — Diffusion',
      body: 'Diffusion coefficient for food between neighboring tiles. Higher values smooth the food field more quickly.'
    },
    'r': {
      title: 'r — Replenish',
      body: 'Rate at which food replenishes toward F_max each tick.'
    },
    'Fmax': {
      title: 'F_max — Carrying capacity',
      body: 'Maximum food concentration supported by the environment.'
    },
    'delta': {
      title: 'δ — Decay',
      body: 'Fractional decay applied to food each tick. Models loss due to external processes.'
    },
    'seedNoise': {
      title: 'Seed noise',
      body: 'Noise amplitude added to the initial food field to create heterogeneous patches.'
    }
  };

  function openParamModal(key){
    const modal = qid('paramModal');
    const t = qid('paramModalTitle');
    const b = qid('paramModalBody');
    const info = paramInfo[key];
    if (!info) return;
    t.textContent = info.title;
    b.textContent = info.body;
    modal.classList.add('modal-open');
  }
  function closeParamModal(){ qid('paramModal').classList.remove('modal-open'); }
  qid('paramModalClose').addEventListener('click', closeParamModal);
  qid('paramModal').addEventListener('click', (e)=>{ if (e.target === qid('paramModal')) closeParamModal(); });

  function bindParamLabelClicks(){
    const pairs = [
      ['u_max','u_max'], ['K','K'], ['c_maint','c_maint'], ['Y_E','Y_E'], ['E_div','E_div'], ['E_new','E_new'],
      ['D','D'], ['r','r'], ['Fmax','Fmax'], ['delta','delta'], ['seedNoise','seedNoise']
    ];
    pairs.forEach(([key, id])=>{
      const row = qid(id)?.closest('.row');
      if (!row) return;
      const label = row.querySelector('label');
      if (!label) return;
      label.style.cursor = 'pointer';
      label.addEventListener('click', ()=> openParamModal(key));
    });
  }
  bindParamLabelClicks();

  // Helpers
  function clamp(v, lo, hi){ return v < lo ? lo : v > hi ? hi : v; }
  function clampInt(v, lo, hi){ return v < lo ? lo : v > hi ? hi : v|0; }
  function qs(sel){ return document.querySelector(sel); }
  function qid(id){ return document.getElementById(id); }

  // Kick off
  reset();
  loop();
})();
