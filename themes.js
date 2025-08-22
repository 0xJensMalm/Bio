(function(){
  function q(id){ return document.getElementById(id); }
  function show(el){ el.style.display = ''; }
  function hide(el){ el.style.display = 'none'; }

  const panelParams = document.querySelector('.panel');
  const panelThemes = q('themesPanel');
  const btnThemes = q('btnThemes');
  const btnParams = q('btnParams');
  const btnApply = q('btnThemeApply');

  if (btnThemes){ btnThemes.addEventListener('click', ()=>{ hide(panelParams); show(panelThemes); }); }
  if (btnParams){ btnParams.addEventListener('click', ()=>{ show(panelParams); hide(panelThemes); }); }

  function setValDisplay(id, value){ const el = document.querySelector(`[data-val="${id}"]`); if (el) el.textContent = String(value); }

  const gamma = q('fxGamma');
  const trace = q('fxTrace');
  if (gamma){ gamma.addEventListener('input', ()=> { setValDisplay('fxGamma', Number(gamma.value).toFixed(2)); applyTheme(false); }); }
  if (trace){ trace.addEventListener('input', ()=> { setValDisplay('fxTrace', Number(trace.value).toFixed(2)); applyTheme(false); }); }

  function applyTheme(resetFade){
    if (!window.simInstance) return;
    window.simInstance.setTheme({
      foodLow: q('thFoodLow').value,
      foodHigh: q('thFoodHigh').value,
      bacteria: q('thBacteria').value,
      gamma: Number(gamma ? gamma.value : 1.0),
      tracerAlpha: Number(trace ? trace.value : 0)
    });
  }

  if (btnApply){ btnApply.addEventListener('click', ()=> applyTheme(false)); }
})();
