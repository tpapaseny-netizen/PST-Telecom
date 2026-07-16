# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v117 (retirer Radio & Sondage du menu piece jointe)"""
import io, sys, re
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
def RX(s,pat,label):
    new,n=re.subn(pat,"",s,flags=re.S)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return new
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v117 — menu piece jointe")

s=RX(s,r'\s*<div class="attach-opt" onclick="toggleAttach\(\);openRadioSheet\(\)">.*?</div>',"Retrait option Radio")
s=RX(s,r'\s*<div class="attach-opt" onclick="toggleAttach\(\);openPollSheet\(\)">.*?</div>',"Retrait option Sondage")

# Garde-fou : Radio/Sondage restent accessibles ailleurs (onglets dedies)
assert 'openRadioSheet' in s, "openRadioSheet supprime ailleurs !"
assert 'openPollSheet' in s, "openPollSheet supprime ailleurs !"
# Verifie qu'il reste bien 3 options dans le menu attach
seg=s[s.index('id="attachMenu"'):]
seg=seg[:seg.index('</div>\n    </div>')+20] if '</div>\n    </div>' in seg else seg[:600]
print("  attach-opt restants:", s[s.index('id="attachMenu"'):s.index('id="attachMenu"')+1200].count('class="attach-opt"'))

s=R(s,"console.log('PENC build v116 (suppression statut premium: modale + toast)');",
      "console.log('PENC build v117 (menu piece jointe: Photo/Video/Fichier)');","Build -> v117")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v117.")
