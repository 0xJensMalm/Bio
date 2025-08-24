(function(){
  function q(id){ return document.getElementById(id); }
  function show(el){ if (el) el.style.display = ''; }
  function hide(el){ if (el) el.style.display = 'none'; }
  const tabs = { bio: q('tabBio'), visuals: q('tabVisuals'), draw: q('tabDraw') };
  const panels = { bio: q('bioPanel'), visuals: q('visualsPanel'), draw: q('drawPanel') };
  function setActiveTab(name){
    Object.keys(tabs).forEach(k=>{ if (tabs[k]) tabs[k].classList.toggle('primary', k===name); });
    Object.keys(panels).forEach(k=>{ (k===name? show : hide)(panels[k]); });
    if (window.appSetMode){ window.appSetMode(name === 'draw' ? 'draw' : 'preset'); }
  }
  if (tabs.bio) tabs.bio.addEventListener('click', ()=> setActiveTab('bio'));
  if (tabs.visuals) tabs.visuals.addEventListener('click', ()=> setActiveTab('visuals'));
  if (tabs.draw) tabs.draw.addEventListener('click', ()=> setActiveTab('draw'));
  // init
  setActiveTab('bio');
})();
