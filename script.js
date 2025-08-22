(function(){
  // ===================== Parameters & World =====================
  const W = 150, H = 100, SCALE = 4; // grid and pixel scale
  const canvas = document.getElementById('view');
  canvas.width = W * SCALE; canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d', { alpha: false });
  const hud = document.getElementById('hud');
  const sim = new Sim(canvas, hud);
  window.simInstance = sim;

  // UI refs
  const ui = {
    u_max: qs('#u_max'), K: qs('#K'), c_maint: qs('#c_maint'), Y_E: qs('#Y_E'),
    E_div: qs('#E_div'), E_new: qs('#E_new'), D: qs('#D'), r: qs('#r'), Fmax: qs('#Fmax'),
    delta: qs('#delta'), seedNoise: qs('#seedNoise'), initB: qs('#initB'), rngSeed: qs('#rngSeed'),
    speed: qs('#speed'),
  };
  qid('gridSize').textContent = `${sim.W}×${sim.H}`;
  qid('pxScale').textContent = `${sim.SCALE}`;

  // Cycle grid resolutions
  const gridOptions = [
    { W: 120, H: 80 },
    { W: 150, H: 100 },
    { W: 180, H: 120 },
  ];
  let gridIdx = Math.max(0, gridOptions.findIndex(o=> o.W===sim.W && o.H===sim.H));
  if (gridIdx === -1) gridIdx = 0;
  const btnGrid = document.getElementById('btnGrid');
  if (btnGrid){
    btnGrid.addEventListener('click', ()=>{
      gridIdx = (gridIdx + 1) % gridOptions.length;
      const opt = gridOptions[gridIdx];
      // Change resolution, keep SCALE constant
      const wasRunning = running;
      running = false;
      const oldCanvas = document.getElementById('view');
      // Update sim internals
      sim.W = opt.W; sim.H = opt.H;
      sim.canvas.width = sim.W * sim.SCALE; sim.canvas.height = sim.H * sim.SCALE;
      if (overlay){ overlay.width = sim.canvas.width; overlay.height = sim.canvas.height; }
      sim.img = sim.ctx.createImageData(sim.W*sim.SCALE, sim.H*sim.SCALE);
      sim.data = sim.img.data;
      sim.F = new Float32Array(sim.W*sim.H);
      sim.Ftmp = new Float32Array(sim.W*sim.H);
      // Update labels
      qid('gridSize').textContent = `${sim.W}×${sim.H}`;
      qid('pxScale').textContent = `${sim.SCALE}`;
      // Reset world with new size
      sim.reset(
        ui.rngSeed.value,
        parseInt(ui.initB.value,10),
        parseFloat(ui.seedNoise.value),
        parseFloat(ui.E_div.value)
      );
      draw(); updateHUD();
      running = wasRunning;
    });
  }

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
  const overlay = document.getElementById('overlay');
  const overlayCtx = overlay ? overlay.getContext('2d') : null;
  function draw(){
    sim.render(parseFloat(ui.Fmax.value), overlayCtx);
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
    // Update insights cards
    const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    setText('statTicks', String(stats.ticks));
    setText('statCount', String(stats.count));
    setText('statAvgE', stats.avgE.toFixed(2));
    setText('statAvgF', stats.avgFood.toFixed(3));
    setText('statBirths', String(stats.births));
    setText('statDeaths', String(stats.deaths));
  }

  // ===================== Simple Charts =====================
  const chartCount = document.getElementById('chartCount');
  const chartFood = document.getElementById('chartFood');
  const chartCtxCount = chartCount ? chartCount.getContext('2d') : null;
  const chartCtxFood = chartFood ? chartFood.getContext('2d') : null;
  const histLen = 300;
  const seriesCount = []; const seriesFood = [];

  function pushSeries(){
    const s = sim.getStats(parseFloat(ui.Fmax.value));
    seriesCount.push(s.count);
    seriesFood.push(s.avgFood);
    if (seriesCount.length > histLen) seriesCount.shift();
    if (seriesFood.length > histLen) seriesFood.shift();
  }

  function drawSeries(ctx, series, color){
    if (!ctx || series.length < 2) return;
    const w = ctx.canvas.width, h = ctx.canvas.height;
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle = '#0b0e1a'; ctx.fillRect(0,0,w,h);
    ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
    const min = Math.min(...series), max = Math.max(...series);
    const range = (max - min) || 1;
    for (let i=0;i<series.length;i++){
      const x = i / (histLen-1) * (w-10) + 5;
      const y = h - 5 - ((series[i]-min)/range) * (h-10);
      if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.stroke();
  }

  // ===================== Loop =====================
  function loop(){
    if (running){
      const steps = parseInt(ui.speed.value,10);
      for (let s=0;s<steps;s++) simulateTick();
      draw(); updateHUD();
      pushSeries();
      drawSeries(chartCtxCount, seriesCount, '#7ae582');
      drawSeries(chartCtxFood, seriesFood, '#6ec3ff');
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
      body: 'Think of u_max as appetite.\n\nBiologically: The maximum substrate uptake rate in Monod kinetics. When food is abundant, uptake approaches u_max.\nEmergence: Higher u_max accelerates front expansion and can create sharp invasion waves. Too high with low F_max may rapidly deplete food and cause boom-bust cycles.'
    },
    'K': {
      title: 'K — Half-saturation',
      body: 'Sensitivity to scarcity.\n\nBiologically: The substrate level where uptake is half of u_max. Lower K means better scavenging at low concentrations.\nEmergence: Lower K supports survival on the fringes and produces broader, softer fronts; higher K favors rich patches and can produce patchy growth.'
    },
    'c_maint': {
      title: 'c_maint — Maintenance cost',
      body: 'The metabolic “rent.”\n\nBiologically: Baseline energy drain each tick to stay alive.\nEmergence: Raising c_maint prunes weak colonies and amplifies differences between rich and poor regions. Too high can cause mass die-off if food diffusivity is low.'
    },
    'Y_E': {
      title: 'Y_E — Yield to energy',
      body: 'How efficiently dinner becomes battery charge.\n\nBiologically: Conversion factor from uptake to internal energy.\nEmergence: Higher yield lets cells hit division sooner, increasing birth rates; combined with diffusion and replenish, it controls the balance between steady growth vs. oscillations.'
    },
    'E_div': {
      title: 'E_div — Division threshold',
      body: 'The birth trigger.\n\nMechanics: Minimum internal energy required to divide.\nEmergence: Lowering E_div increases branching and dense clusters; higher E_div delays division and yields sparser, more exploratory populations.'
    },
    'E_new': {
      title: 'E_new — Offspring energy',
      body: 'The dowry.\n\nMechanics: Energy gifted to offspring at birth (and removed from the parent).\nEmergence: Larger E_new boosts newborn survival in poor zones but slows parent regrowth; small E_new favors rapid, risky expansion.'
    },
    'D': {
      title: 'D — Diffusion',
      body: 'How quickly the buffet spreads.\n\nField physics: Diffusion coefficient of food between tiles.\nEmergence: Higher D smooths gradients and feeds fronts from behind, enabling wider waves; low D creates stark patch boundaries and localized starvation pockets.'
    },
    'r': {
      title: 'r — Replenish',
      body: 'Nature’s refill rate.\n\nField physics: Relaxation toward F_max each tick.\nEmergence: Higher r supports persistent blooms and recovery after depletion; low r makes scarcities long-lived and selects for efficient foragers.'
    },
    'Fmax': {
      title: 'F_max — Carrying capacity',
      body: 'Ceiling of abundance.\n\nField physics: Maximum food concentration (target of replenish).\nEmergence: Higher F_max amplifies contrast in the colormap and increases potential energy inflow; interacts with u_max and K to set equilibrium densities.'
    },
    'delta': {
      title: 'δ — Decay',
      body: 'Entropy tax on the pantry.\n\nField physics: Multiplicative decay of food each tick.\nEmergence: Non-zero decay discourages long-lived plateaus, carving channels and forcing continuous movement to fresher regions.'
    },
    'seedNoise': {
      title: 'Seed noise',
      body: 'Initial chaos factor.\n\nInitialization: Amplitude of random noise added to the seeded food field.\nEmergence: Higher noise creates hotspots and voids that shape early colony geometry; lower noise yields smoother, symmetric spreads.'
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
