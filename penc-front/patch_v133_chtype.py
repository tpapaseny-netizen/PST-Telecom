# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v133 (canaux etape 2 : choix du type a la creation)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v133 — choix du type de canal")

# 1) Selecteur de type apres la description
TYPEBLOCK=("+'<input class=\"create-ch-inp\" id=\"chNewDesc\" placeholder=\"Description (optionnel)\" maxlength=\"200\"/>'\n"
"    +'<div style=\"margin:6px 0 2px;font-size:13px;color:var(--muted);font-weight:600;\">Type de canal</div>'\n"
"    +'<div style=\"display:flex;gap:10px;margin-bottom:4px;\">'\n"
"    +'<div id=\"chTypeBroadcast\" onclick=\"selChTypeB()\" style=\"flex:1;cursor:pointer;border:2px solid #00C896;background:rgba(0,200,150,.10);border-radius:14px;padding:12px 8px;text-align:center;transition:all .15s;\">'\n"
"    +'<svg width=\"26\" height=\"26\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#00C896\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" style=\"margin-bottom:6px;\"><path d=\"m3 11 18-5v12L3 14v-3z\"/><path d=\"M11.6 16.8a3 3 0 1 1-5.8-1.6\"/></svg>'\n"
"    +'<div style=\"font-size:13px;font-weight:700;color:var(--text);\">Canal de diffusion</div>'\n"
"    +'<div style=\"font-size:11px;color:var(--muted);line-height:1.3;margin-top:3px;\">Vous publiez, les abonnés lisent.</div>'\n"
"    +'</div>'\n"
"    +'<div id=\"chTypeGroup\" onclick=\"selChTypeG()\" style=\"flex:1;cursor:pointer;border:2px solid var(--border);background:var(--card2);border-radius:14px;padding:12px 8px;text-align:center;transition:all .15s;\">'\n"
"    +'<svg width=\"26\" height=\"26\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"#8A9BB0\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\" style=\"margin-bottom:6px;\"><path d=\"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2\"/><circle cx=\"9\" cy=\"7\" r=\"4\"/><path d=\"M22 21v-2a4 4 0 0 0-3-3.87\"/><path d=\"M16 3.13a4 4 0 0 1 0 7.75\"/></svg>'\n"
"    +'<div style=\"font-size:13px;font-weight:700;color:var(--text);\">Groupe-Canal</div>'\n"
"    +'<div style=\"font-size:11px;color:var(--muted);line-height:1.3;margin-top:3px;\">Les membres peuvent écrire.</div>'\n"
"    +'</div>'\n"
"    +'</div>'\n"
"    +'<input type=\"hidden\" id=\"chNewType\" value=\"broadcast\"/>'")
s=R(s,"+'<input class=\"create-ch-inp\" id=\"chNewDesc\" placeholder=\"Description (optionnel)\" maxlength=\"200\"/>'",
      TYPEBLOCK,"Selecteur de type")

# 2) Fonctions de selection (avant submitCreateChannel)
FNS=("function _chType(t){\n"
"  var hid=document.getElementById('chNewType'); if(hid) hid.value=t;\n"
"  var b=document.getElementById('chTypeBroadcast'), g=document.getElementById('chTypeGroup');\n"
"  function paint(el,on){ if(!el) return; var sv=el.querySelector('svg');\n"
"    if(on){ el.style.border='2px solid #00C896'; el.style.background='rgba(0,200,150,.10)'; if(sv) sv.setAttribute('stroke','#00C896'); }\n"
"    else { el.style.border='2px solid var(--border)'; el.style.background='var(--card2)'; if(sv) sv.setAttribute('stroke','#8A9BB0'); }\n"
"  }\n"
"  paint(b, t==='broadcast'); paint(g, t==='group');\n"
"}\n"
"function selChTypeB(){ _chType('broadcast'); }\n"
"function selChTypeG(){ _chType('group'); }\n"
"async function submitCreateChannel(){")
s=R(s,"async function submitCreateChannel(){",FNS,"Fonctions selChType")

# 3) submitCreateChannel : lire et transmettre le type
s=R(s,"var icon=document.getElementById('chNewIcon').value.trim();\n  if(!name){showNotif('❌','Erreur','Nom du canal requis','red',null);return;}\n  var r=await api('/channels','POST',{name,description:desc,icon_url:icon||null});",
      "var icon=document.getElementById('chNewIcon').value.trim();\n  var ctype=(document.getElementById('chNewType')||{}).value||'broadcast';\n  if(!name){showNotif('❌','Erreur','Nom du canal requis','red',null);return;}\n  var r=await api('/channels','POST',{name,description:desc,icon_url:icon||null,type:ctype});",
      "submit: transmettre type")

# 4) Build bump
s=R(s,"console.log('PENC build v132 (SEO: description, Open Graph, sitemap)');",
      "console.log('PENC build v133 (canaux: choix du type a la creation)');","Build -> v133")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v133.")
