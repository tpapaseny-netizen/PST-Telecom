# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v159 (#3 front : duree officielle + corbeille statut officiel)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v159 — front statut officiel")

# 1) Selecteur de duree dans le composeur officiel (avant le bouton Publier)
OLD_BTN="    +'<button onclick=\"sendOfficialStatus()\" style=\"width:100%;padding:12px;border:none;border-radius:12px;background:var(--accent);color:#fff;font-weight:700;cursor:pointer;\">\U0001F4E2 Publier pour tous</button></div>';"
DUR=("    +'<div style=\"margin:4px 0 12px;\"><div style=\"font-size:12px;color:var(--muted);margin-bottom:7px;font-weight:600;\">Durée avant disparition</div><div id=\"offDurRow\" style=\"display:flex;gap:7px;flex-wrap:wrap;\">'"
"    +'<div onclick=\"_offDur(\\'1\\',this)\" data-d=\"1\" class=\"off-dur\">1h</div><div onclick=\"_offDur(\\'6\\',this)\" data-d=\"6\" class=\"off-dur\">6h</div><div onclick=\"_offDur(\\'12\\',this)\" data-d=\"12\" class=\"off-dur\">12h</div><div onclick=\"_offDur(\\'24\\',this)\" data-d=\"24\" class=\"off-dur\">24h</div><div onclick=\"_offDur(\\'48\\',this)\" data-d=\"48\" class=\"off-dur\">48h</div><div onclick=\"_offDur(\\'168\\',this)\" data-d=\"168\" class=\"off-dur\">7j</div><div onclick=\"_offDur(\\'permanent\\',this)\" data-d=\"permanent\" class=\"off-dur\">Permanent</div>'"
"    +'</div></div>'\n")
s=R(s,OLD_BTN,DUR+OLD_BTN,"Selecteur de duree (composeur officiel)")

# 2) Init duree par defaut (24h) + marquage
s=R(s,"  window._offBgColor='#0E8C7C';\n  setTimeout(function(){ var f=ov.querySelector('[data-c=\"#0E8C7C\"]'); if(f) f.style.borderColor='#fff'; },0);",
      "  window._offBgColor='#0E8C7C';\n  window._offExpHours='24';\n  setTimeout(function(){ var f=ov.querySelector('[data-c=\"#0E8C7C\"]'); if(f) f.style.borderColor='#fff'; var d=ov.querySelector('.off-dur[data-d=\"24\"]'); if(d) d.classList.add('sel'); },0);",
      "Init duree par defaut 24h")

# 3) Fonction _offDur (avant _offBg)
s=R(s,"function _offBg(c,el){",
      "function _offDur(h,el){ window._offExpHours=h; var p=el.parentNode; if(p) p.querySelectorAll('.off-dur').forEach(function(x){ x.classList.remove('sel'); }); el.classList.add('sel'); }\nfunction _offBg(c,el){",
      "Fonction _offDur")

# 4) Envoyer expires_hours
s=R(s,"api('/admin/official-status','POST',{type:'text',text_content:t,bg_color:window._offBgColor||'#0E8C7C'}).then(function(r){",
      "api('/admin/official-status','POST',{type:'text',text_content:t,bg_color:window._offBgColor||'#0E8C7C',expires_hours:window._offExpHours||'24'}).then(function(r){",
      "Envoyer expires_hours")

# 5) Bouton corbeille pour les statuts officiels (admin) dans le visualiseur
OLD_ACT=("    else actDiv.innerHTML+='<button class=\"sv-action-btn\" onclick=\"editCaptionSV()\" title=\"Modifier la légende\" style=\"background:rgba(20,184,166,.4)\">'+SVG_EDIT+'</button>';\n"
"  }\n"
"  document.getElementById('statusViewer').appendChild(actDiv);")
NEW_ACT=("    else actDiv.innerHTML+='<button class=\"sv-action-btn\" onclick=\"editCaptionSV()\" title=\"Modifier la légende\" style=\"background:rgba(20,184,166,.4)\">'+SVG_EDIT+'</button>';\n"
"  }\n"
"  else if(_isPenc(sv.user_id) && ME && (ME.is_admin || (typeof ADMIN_EMAILS!=='undefined' && ADMIN_EMAILS.includes((ME.email||'').toLowerCase())))){\n"
"    actDiv.innerHTML+='<button class=\"sv-action-btn\" onclick=\"deleteSV()\" title=\"Supprimer\">'+SVG_TRASH+'</button>';\n"
"  }\n"
"  document.getElementById('statusViewer').appendChild(actDiv);")
s=R(s,OLD_ACT,NEW_ACT,"Corbeille statut officiel (admin)")

# 6) CSS chips duree
s=R(s,"#stTxtInp.st-limit{border-color:#DC2626!important;background:rgba(220,38,38,.07)!important;}",
      "#stTxtInp.st-limit{border-color:#DC2626!important;background:rgba(220,38,38,.07)!important;}\n"
      ".off-dur{padding:7px 12px;border-radius:9px;background:var(--card2);border:1px solid var(--border);cursor:pointer;font-size:13px;font-weight:600;color:var(--text);}\n"
      ".off-dur.sel{border-color:var(--accent);background:rgba(14,140,124,.18);color:var(--accent);}",
      "CSS chips duree")

# 7) Build bump
s=R(s,"console.log('PENC build v158 (statut: header sans chevauchement)');",
      "console.log('PENC build v159 (statut officiel: duree perso + suppression)');","Build -> v159")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v159.")
