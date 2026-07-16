# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v138 (#1 ecran Statuts vide premium)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v138 — statut vide premium")

# 1) CSS bouton premium
s=R(s,".empty-text{font-size:15px;color:var(--muted);text-align:center;}",
      ".empty-text{font-size:15px;color:var(--muted);text-align:center;}\n"
      ".sv-empty-btn{transition:transform .2s,box-shadow .2s;}\n"
      ".sv-empty-btn:hover{transform:translateY(-2px);box-shadow:0 12px 30px rgba(0,200,150,.42);}\n"
      ".sv-empty-btn:active{transform:scale(.97);}",
      "CSS bouton premium")

# 2) Markup premium etat vide
OLD='''if(!Object.keys(grouped).length&&!mine.length) html+='<div class="empty-state" style="flex:1;"><div class="empty-icon">📸</div><div class="empty-text">Aucun statut récent.<br>Sois le premier !</div></div>';'''
NEW=('''if(!Object.keys(grouped).length&&!mine.length) html+='<div class="empty-state" style="flex:1;justify-content:center;">'
    +'<div style="width:120px;height:120px;border-radius:50%;background:radial-gradient(circle,rgba(0,200,150,.16),rgba(0,200,150,.04));display:flex;align-items:center;justify-content:center;margin-bottom:8px;">'
    +'<svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#00C896" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>'
    +'</div>'
    +'<div style="font-size:18px;font-weight:800;color:#fff;">Aucun statut récent</div>'
    +'<div style="font-size:14px;color:#8A9BB0;margin-bottom:14px;">Sois le premier à partager un moment</div>'
    +'<button class="sv-empty-btn" onclick="openAddStatus()" style="border:none;border-radius:16px;background:linear-gradient(135deg,#00C896,#1C6B4A);color:#fff;font-weight:700;font-size:15px;padding:14px 26px;cursor:pointer;box-shadow:0 8px 24px rgba(0,200,150,.32);">Ajouter mon premier statut</button>'
    +'</div>';''')
s=R(s,OLD,NEW,"Markup etat vide premium")

# 3) Build bump
s=R(s,"console.log('PENC build v137 (canaux: vues par message)');",
      "console.log('PENC build v138 (statut vide premium)');","Build -> v138")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v138.")
