# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v173 (Appels dans la barre ; retirer icone en-tete ; Sondages reste hors barre)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v173 — Appels dans la barre")

# 1) Remettre Appels dans la barre (avant Canaux)
NAVITEM='    <div class="nav-item" id="nav-calls" onclick="showTab(\'calls\')"><span class="nav-icon"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg></span><span>Appels</span></div>\n'
s=R(s,'    <div class="nav-item" id="nav-channels" onclick="showTab(\'channels\')">',
      NAVITEM+'    <div class="nav-item" id="nav-channels" onclick="showTab(\'channels\')">',"Remettre nav Appels")

# 2) Retirer l'icone Appels de l'en-tete
CALLS_HEAD='      <div class="radio-btn" onclick="showTab(\'calls\')" role="button" tabindex="0" aria-label="Appels"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg><span class="radio-btn-label">Appels</span></div>\n'
s=R(s,CALLS_HEAD,"","Retirer icone Appels en-tete")

# 3) Build
s=R(s,"console.log('PENC build v172 (barre allegee + Appels en-tete)');",
      "console.log('PENC build v173 (Appels dans la barre)');","Build -> v173")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v173.")
