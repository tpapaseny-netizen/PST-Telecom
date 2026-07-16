# -*- coding: utf-8 -*-
"""
PENC FRONT — Patch v94 (C2 : statuts officiels epingles + badge)
Dans le fil de statuts (stories row) :
  - les statuts de 'penc_official' sont epingles EN TETE
  - ring bleu + badge verifie + nom "Penc"

    python patch_v94_official_status_pin.py
"""
import io, sys, os

FN = "messager.html"

def R(s, old, new, label):
    n = s.count(old)
    if n != 1:
        print("  [ECHEC] '%s' : trouve %d fois (attendu 1)." % (label, n)); sys.exit(1)
    print("  [OK]   %s" % label)
    return s.replace(old, new)

if not os.path.exists(FN):
    print("Fichier introuvable : %s" % FN); sys.exit(1)

with io.open(FN, "r", encoding="utf-8", newline="") as f:
    s = f.read()

print("Patch v94 — Statuts officiels epingles")

# 1) CSS
CSS = (
    '<style id="penc-official-story">\n'
    '.story-ring-off{ background:linear-gradient(135deg,#1D9BF0,#0E8C7C) !important; }\n'
    '.story-badge{ position:absolute; bottom:-2px; right:-2px; width:18px; height:18px; line-height:0; z-index:2; }\n'
    '.story-badge svg{ width:18px; height:18px; display:block; }\n'
    '</style>\n'
)
s = R(s, "\n</head>", "\n" + CSS + "</head>", "CSS ring/badge officiel")

# 2) renderStories : epingler + badge
OLD = r'''  Object.values(byUser).forEach(({user,items})=>{
    const el=document.createElement('div'); el.className='story-item';
    const init=initials(user?.full_name||'?');
    const seen=items.every(s=>s.viewed);
    el.innerHTML=`<div class="story-ring${seen?' seen':''}"><div class="story-inner">${user?.avatar_url?`<img src="${user.avatar_url}" alt=""/>`:`<span>${init}</span>`}</div></div><span class="story-name">${esc(user?.full_name?.split(' ')[0]||'?')}</span>`;
    el.onclick=()=>viewStatuses(items);
    row.appendChild(el);
  });'''
NEW = """  var _ents=Object.keys(byUser).map(function(k){return {uid:k,user:byUser[k].user,items:byUser[k].items};});
  _ents.sort(function(a,b){ return (b.uid==='penc_official'?1:0)-(a.uid==='penc_official'?1:0); });
  _ents.forEach(function(o){
    var user=o.user, items=o.items, isOff=_isPenc(o.uid);
    var el=document.createElement('div'); el.className='story-item';
    var init=initials((user&&user.full_name)||'?');
    var seen=items.every(function(s){return s.viewed;});
    var av=(user&&user.avatar_url)?('<img src="'+user.avatar_url+'" alt=""/>'):('<span>'+init+'</span>');
    var nm=isOff?'Penc':esc(((user&&user.full_name)?user.full_name.split(' ')[0]:'?'));
    var badge=isOff?('<span class="story-badge">'+_pencBadge()+'</span>'):'';
    el.innerHTML='<div class="story-ring'+(seen?' seen':'')+(isOff?' story-ring-off':'')+'"><div class="story-inner">'+av+'</div>'+badge+'</div><span class="story-name">'+nm+'</span>';
    el.onclick=function(){ viewStatuses(items); };
    row.appendChild(el);
  });"""
s = R(s, OLD, NEW, "Epinglage + badge dans renderStories")

# 3) Bump build
s = R(s,
  "console.log('PENC build v93 (admin: publier un statut officiel Penc)');",
  "console.log('PENC build v94 (statuts officiels Penc epingles en tete + badge)');",
  "Marqueur build -> v94")

assert s.count("'penc_official'?1:0") >= 1 and 'story-ring-off' in s, "Epinglage absent !"

with io.open(FN, "w", encoding="utf-8", newline="") as f:
    f.write(s)

print("\nTermine. messager.html -> v94.")
print("Verifie : node check.js")
