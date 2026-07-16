# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v150 (etat vide conversations premium + guidant)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v150 — etat vide conversations premium")

OLD='''    <div class="empty-state" id="convEmpty" style="display:none">
      <div class="empty-icon">💬</div>
      <div class="empty-text">Aucune conversation.<br/>Appuyez sur ✏️ pour commencer.</div>
    </div>'''
NEW='''    <div class="empty-state" id="convEmpty" style="display:none">
      <div style="width:104px;height:104px;border-radius:50%;background:radial-gradient(circle,rgba(0,200,150,.16),rgba(0,200,150,.04));display:flex;align-items:center;justify-content:center;margin-bottom:6px;">
        <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="#00C896" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      </div>
      <div style="font-size:18px;font-weight:800;color:var(--text);">Aucune conversation</div>
      <div style="font-size:14px;color:var(--muted);margin-bottom:16px;text-align:center;line-height:1.4;">Trouve des amis et démarre<br/>ta première discussion.</div>
      <button class="sv-empty-btn" onclick="openNewChat()" style="border:none;border-radius:16px;background:linear-gradient(135deg,#00C896,#2D9CFF);color:#fff;font-weight:700;font-size:15px;padding:13px 24px;cursor:pointer;box-shadow:0 8px 24px rgba(0,200,150,.32);">Démarrer une discussion</button>
      <button onclick="openFriends()" style="margin-top:12px;background:none;border:none;color:#00C896;font-weight:600;font-size:14px;cursor:pointer;">Trouver des amis</button>
    </div>'''
s=R(s,OLD,NEW,"Etat vide conversations")

s=R(s,"console.log('PENC build v149 (SEO exhaustif + atouts + retrait Senegal)');",
      "console.log('PENC build v150 (etat vide conversations premium)');","Build -> v150")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v150.")
