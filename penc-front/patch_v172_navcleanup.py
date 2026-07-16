# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v172 (barre: Chats/Statuts/Canaux/Profil ; Appels -> en-tete ; Sondages garde mais hors barre)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v172 — nettoyage barre")

# 1) Retirer Appels de la barre
CALLS_NAV='    <div class="nav-item" id="nav-calls" onclick="showTab(\'calls\')"><span class="nav-icon"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg></span><span>Appels</span></div>\n'
s=R(s,CALLS_NAV,"","Retirer nav Appels")

# 2) Retirer Sondages de la barre (code conserve ailleurs)
POLLS_NAV='    <div class="nav-item" id="nav-polls" onclick="showTab(\'polls\')"><span class="nav-icon"><svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg></span><span>Sondages</span></div>\n'
s=R(s,POLLS_NAV,"","Retirer nav Sondages")

# 3) Ajouter l'icone Appels dans l'en-tete (avant la radio)
RADIO='      <div class="radio-btn" onclick="openRadio()" role="button" tabindex="0" aria-label="Radio DeglouFM">'
CALLS_HEAD='      <div class="radio-btn" onclick="showTab(\'calls\')" role="button" tabindex="0" aria-label="Appels"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg><span class="radio-btn-label">Appels</span></div>\n'
s=R(s,RADIO,CALLS_HEAD+RADIO,"Icone Appels en-tete")

# 4) Build
s=R(s,"console.log('PENC build v171 (onglet Appels facon WhatsApp)');",
      "console.log('PENC build v172 (barre allegee + Appels en-tete)');","Build -> v172")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v172.")
