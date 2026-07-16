# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v179 (modal Ajouter un statut PREMIUM - icones SVG)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v179 — modal statut premium")
CAM='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>'
CLAP='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9v11a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9z"/><path d="m2.5 9.2 18.6-4.3a1 1 0 0 0 .74-1.2l-.4-1.7a1 1 0 0 0-1.2-.74L2.3 5.5a1 1 0 0 0-.74 1.2l.4 1.7a1 1 0 0 0 .54.8Z"/><path d="m7 5-1.5 4"/><path d="m13 3.6-1.5 4"/></svg>'
PEN='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>'
s=R(s,'<div class="sheet-opt" onclick="pickStatus(\'image\')"><div class="sheet-opt-icon">\U0001F4F7</div>',
      '<div class="sheet-opt sopt-pro" onclick="pickStatus(\'image\')"><div class="sheet-opt-icon st-ic">'+CAM+'</div>',"Option Photo")
s=R(s,'<div class="sheet-opt" onclick="pickStatus(\'video\')"><div class="sheet-opt-icon">\U0001F3AC</div>',
      '<div class="sheet-opt sopt-pro" onclick="pickStatus(\'video\')"><div class="sheet-opt-icon st-ic">'+CLAP+'</div>',"Option Video")
s=R(s,'<div class="sheet-opt" onclick="showTextStatus()"><div class="sheet-opt-icon">\u270D\uFE0F</div>',
      '<div class="sheet-opt sopt-pro" onclick="showTextStatus()"><div class="sheet-opt-icon st-ic">'+PEN+'</div>',"Option Texte")
s=R(s,'<button class="btn-primary" onclick="closeOl(\'ol-status\')" style="margin-top:8px;background:var(--card2);color:var(--muted);">Annuler</button>',
      '<button class="btn-primary" onclick="closeOl(\'ol-status\')" style="margin-top:8px;background:transparent;color:var(--muted);border:1px solid var(--border);">Annuler</button>',"Annuler restyle")
s=R(s,".sheet-opt-sub{font-size:12px;color:var(--muted);margin-top:2px;}",
      ".sheet-opt-sub{font-size:12px;color:var(--muted);margin-top:2px;}\n"
      ".sheet-opt.sopt-pro{border:1px solid var(--border);}\n"
      ".sheet-opt.sopt-pro:active{background:var(--bg3);}\n"
      ".sheet-opt-icon.st-ic{background:rgba(0,200,150,.14);color:var(--accent);}\n"
      ".sheet-opt-icon.st-ic svg{width:22px;height:22px;}\n"
      ".sheet-x{position:absolute;top:10px;right:10px;width:34px;height:34px;border-radius:50%;border:none;background:var(--card2);color:var(--muted);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:background .12s,color .12s;z-index:5;}\n"
      ".sheet-x:active{background:var(--bg3);color:#fff;}","CSS status+sheet-x")
s=R(s,"console.log('PENC build v178 (photo appelant en fond flou)');",
      "console.log('PENC build v179 (modal statut premium)');","Build -> v179")
io.open(FN,"wb").write(s.encode("utf-8")); print("OK v179")
