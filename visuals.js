(function(){
  function q(id){ return document.getElementById(id); }
  function setValDisplay(id, value){ const el = document.querySelector(`[data-val="${id}"]`); if (el) el.textContent = String(value); }

  const gamma = q('fxGamma');
  const trace = q('fxTrace');
  if (gamma){ gamma.addEventListener('input', ()=> { setValDisplay('fxGamma', Number(gamma.value).toFixed(2)); applyTheme(); }); }
  if (trace){ trace.addEventListener('input', ()=> { setValDisplay('fxTrace', Number(trace.value).toFixed(2)); applyTheme(); }); }
  const btnApply = q('btnThemeApply');
  if (btnApply){ btnApply.addEventListener('click', ()=> applyTheme()); }

  function applyTheme(){
    if (!window.simInstance) return;
    window.simInstance.setTheme({
      foodEmpty: q('thFoodEmpty')?.value,
      foodLow: q('thFoodLow').value,
      foodHigh: q('thFoodHigh').value,
      bacteria: q('thBacteria').value,
      gamma: Number(gamma ? gamma.value : 1.0),
      tracerAlpha: Number(trace ? trace.value : 0)
    });
    // Update legend swatches
    const sEmpty = document.getElementById('swatchEmpty'); if (sEmpty && q('thFoodEmpty')) sEmpty.style.background = q('thFoodEmpty').value;
    const sLow = document.getElementById('swatchLow'); if (sLow && q('thFoodLow')) sLow.style.background = q('thFoodLow').value;
    const sHigh = document.getElementById('swatchHigh'); if (sHigh && q('thFoodHigh')) sHigh.style.background = q('thFoodHigh').value;
    const sB = document.getElementById('swatchBact'); if (sB && q('thBacteria')) sB.style.background = q('thBacteria').value;
  }
})();
