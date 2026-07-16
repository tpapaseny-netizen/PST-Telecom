# -*- coding: utf-8 -*-
"""
PENC — Patch v75  (BLOC 3 : Radio)
- Header : remplace les 2 boutons (recherche + crayon) par 1 bouton radio rond teal (icone ondes blanches).
  (la recherche reste dispo via la barre de recherche ; nouveau message via le FAB)
- Au clic : panneau plein ecran avec un iframe qui charge https://deglufm.base44.app + bouton retour.
  Repli automatique "Ouvrir DeglouFM" si le site bloque l'iframe (anti-framing).
- Retour : masque le panneau SANS detruire l'iframe -> le son continue en arriere-plan.
- Barre persistante au-dessus de la nav : icone + nom + "Rouvrir" + "Arreter" (croix).
  (pas de vrai "pause" : impossible de piloter un iframe cross-origin ; voir plan B audio natif.)
Tout est ADDITIF. Seul changement sur l'existant : les 2 boutons du header (fonctions conservees ailleurs).

Lancer depuis le dossier contenant messager.html :
    python patch_v75_radio.py
"""
import io, sys, os

FN = "messager.html"

def R(s, old, new, label):
    n = s.count(old)
    if n != 1:
        print("  [ECHEC] '%s' : trouve %d fois (attendu 1). Aucune modif." % (label, n))
        sys.exit(1)
    print("  [OK]   %s" % label)
    return s.replace(old, new)

if not os.path.exists(FN):
    print("Fichier introuvable : %s" % FN); sys.exit(1)

with io.open(FN, "r", encoding="utf-8", newline="") as f:
    s = f.read()

print("Patch v75 — Radio (bouton header + panneau + barre)")

# 1) Header : 2 boutons -> 1 bouton radio
OLD_TOPBAR = '<div class="top-bar-actions">\n      <div class="icon-btn" onclick="focusConvSearch()" aria-label="Rechercher"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg></div>\n      <div class="icon-btn" onclick="openNewChat()" aria-label="Nouveau message"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></div>'
NEW_TOPBAR = '<div class="top-bar-actions">\n      <div class="radio-btn" onclick="openRadio()" role="button" tabindex="0" aria-label="Radio DeglouFM"><svg viewBox="0 0 24 24" width="21" height="21" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2"/><path d="M7.76 16.24a6 6 0 0 1 0-8.49"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49"/><path d="M4.93 19.07a10 10 0 0 1 0-14.14"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg></div>'
s = R(s, OLD_TOPBAR, NEW_TOPBAR, "Bouton radio dans le header")

# 2) CSS radio (avant </head>)
CSS_BLOCK = """<style id="radio-ui">
.radio-btn{ width:40px; height:40px; border-radius:50%; background:#00C896; display:flex; align-items:center; justify-content:center; cursor:pointer; box-shadow:0 4px 12px rgba(0,200,150,.40); transition:transform .12s, box-shadow .2s; }
.radio-btn:active{ transform:scale(.92); }
.radio-panel{ position:fixed; inset:0; z-index:4000; background:#fff; display:none; flex-direction:column; }
.radio-panel.show{ display:flex; }
.radio-top{ display:flex; align-items:center; gap:12px; padding:14px 16px; padding-top:calc(14px + env(safe-area-inset-top)); background:#00C896; color:#fff; flex-shrink:0; }
.radio-back{ width:38px; height:38px; border-radius:50%; background:rgba(255,255,255,.18); border:none; color:#fff; display:flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0; }
.radio-title{ font-weight:700; font-size:17px; flex:1; }
.radio-ext{ background:none; border:none; color:#fff; cursor:pointer; padding:6px; display:flex; opacity:.92; }
.radio-body{ flex:1; position:relative; background:#0f1115; }
#radioFrame{ width:100%; height:100%; border:none; display:block; }
.radio-fallback{ position:absolute; inset:0; display:none; flex-direction:column; align-items:center; justify-content:center; gap:18px; text-align:center; padding:30px; color:#fff; }
.radio-fallback.show{ display:flex; }
.radio-fallback button{ background:#00C896; color:#fff; border:none; border-radius:14px; padding:14px 22px; font-weight:700; font-size:15px; cursor:pointer; }
.radio-bar{ display:none; align-items:center; gap:11px; padding:9px 14px; background:var(--card,#fff); border-top:1px solid var(--border,#eee); flex-shrink:0; }
.radio-bar.show{ display:flex; }
.rb-ic{ width:34px; height:34px; border-radius:50%; background:#00C896; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.rb-name{ flex:1; min-width:0; font-weight:700; font-size:13.5px; color:var(--text,#1a1a1a); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.rb-name small{ display:block; font-weight:500; font-size:11px; color:var(--muted,#888); }
.rb-btn{ border:none; background:rgba(0,200,150,.12); color:#00C896; border-radius:9px; padding:8px 12px; font-weight:700; font-size:12.5px; cursor:pointer; flex-shrink:0; }
.rb-stop{ border:none; background:rgba(128,128,128,.14); color:var(--muted,#888); border-radius:9px; width:34px; height:34px; display:flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0; font-size:15px; }
.radio-active .fab{ bottom:132px; }
</style>
"""
s = R(s, "\n</head>", "\n" + CSS_BLOCK + "</head>", "CSS radio avant </head>")

# 3) Panneau + barre (avant la bottom-nav)
PANEL_HTML = """  <div class="radio-bar" id="radioBar">
    <span class="rb-ic"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="2"/><path d="M7.76 16.24a6 6 0 0 1 0-8.49"/><path d="M16.24 7.76a6 6 0 0 1 0 8.49"/></svg></span>
    <span class="rb-name">DeglouFM<small>En lecture</small></span>
    <button class="rb-btn" onclick="openRadio()">Rouvrir</button>
    <button class="rb-stop" onclick="stopRadio()" aria-label="Arreter">&#10005;</button>
  </div>
  <div class="radio-panel" id="radioPanel">
    <div class="radio-top">
      <button class="radio-back" onclick="closeRadio()" aria-label="Retour"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></button>
      <span class="radio-title">DeglouFM</span>
      <button class="radio-ext" onclick="window.open('https://deglufm.base44.app','_blank')" aria-label="Ouvrir dans le navigateur"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6"/><path d="M10 14L21 3"/></svg></button>
    </div>
    <div class="radio-body">
      <iframe id="radioFrame" title="DeglouFM" allow="autoplay; encrypted-media; fullscreen"></iframe>
      <div class="radio-fallback" id="radioFallback">
        <div style="font-size:15px; line-height:1.5;">DeglouFM ne peut pas s'afficher integre ici<br/>(protection anti-iframe du site).</div>
        <button onclick="window.open('https://deglufm.base44.app','_blank')">Ouvrir DeglouFM &#8599;</button>
      </div>
    </div>
  </div>
"""
s = R(s, '  <div class="bottom-nav">', PANEL_HTML + '  <div class="bottom-nav">', "Panneau + barre avant bottom-nav")

# 4) JS radio (avant </body>)
JS_BLOCK = """<script>
(function(){
  var RADIO_URL='https://deglufm.base44.app';
  var _loaded=false, _fbTimer=null, _active=false;
  function el(id){ return document.getElementById(id); }
  window.openRadio=function(){
    var p=el('radioPanel'), fr=el('radioFrame'), fb=el('radioFallback');
    if(!p||!fr) return;
    if(!_active){
      _loaded=false; if(fb) fb.classList.remove('show');
      fr.onload=function(){ _loaded=true; if(fb) fb.classList.remove('show'); };
      fr.src=RADIO_URL;
      if(_fbTimer) clearTimeout(_fbTimer);
      _fbTimer=setTimeout(function(){ if(!_loaded && fb) fb.classList.add('show'); }, 6000);
      _active=true;
    }
    p.classList.add('show');
    var bar=el('radioBar'); if(bar) bar.classList.remove('show');
    var sm=el('screen-main'); if(sm) sm.classList.remove('radio-active');
  };
  window.closeRadio=function(){
    var p=el('radioPanel'); if(p) p.classList.remove('show');
    if(_active){
      var bar=el('radioBar'); if(bar) bar.classList.add('show');
      var sm=el('screen-main'); if(sm) sm.classList.add('radio-active');
    }
  };
  window.stopRadio=function(){
    var fr=el('radioFrame'); if(fr){ try{ fr.src='about:blank'; }catch(_){} }
    var p=el('radioPanel'); if(p) p.classList.remove('show');
    var bar=el('radioBar'); if(bar) bar.classList.remove('show');
    var sm=el('screen-main'); if(sm) sm.classList.remove('radio-active');
    _active=false; _loaded=false;
    if(_fbTimer) clearTimeout(_fbTimer);
  };
})();
</script>
"""
s = R(s, "</body>", JS_BLOCK + "</body>", "JS radio avant </body>")

# 5) Bump build
s = R(s,
  "console.log('PENC build v74 (anti-dictionnaire: selection native desactivee hors champs + menu Penc only)');",
  "console.log('PENC build v75 (radio header + panneau DeglouFM integre + barre persistante)');",
  "Marqueur build -> v75")

# Garde-fous : ne pas avoir casse l'existant
for must in ['openNewChat()', 'id="convSearch"', 'class="fab"', 'id="screen-main"', 'showTab(']:
    assert must in s, "REGRESSION : '%s' a disparu !" % must
assert s.count('id="radioPanel"') == 1 and s.count('id="radioBar"') == 1, "Panneau/barre absents ou dupliques !"
assert s.count('class="radio-btn"') == 1, "Bouton radio absent ou duplique !"

with io.open(FN, "w", encoding="utf-8", newline="") as f:
    f.write(s)

print("\nTermine. messager.html -> v75 (radio).")
print("Verifie : node check.js")
