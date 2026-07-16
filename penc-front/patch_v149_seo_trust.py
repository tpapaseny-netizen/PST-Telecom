# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v149 (SEO exhaustif + retrait Conçu au Senegal + atouts)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v149 — SEO exhaustif + confiance")

# 1) Meta description exhaustive
s=R(s,'<meta name="description" content="Penc — la messagerie mondiale ouverte à tous. Discutez en privé ou en groupe, partagez statuts, vocaux, photos et vidéos, suivez des canaux et écoutez la radio. Rapide, moderne et sécurisée."/>',
      '<meta name="description" content="Penc est une messagerie mondiale gratuite et moderne : discutez en privé ou en groupe, passez des appels audio et vidéo, envoyez des messages vocaux, des photos et des vidéos, partagez des statuts éphémères, créez et suivez des canaux et des groupes-canaux, écoutez la radio en direct et effectuez des transferts d\'argent. Rapide, fluide et sécurisée."/>',
      "Meta description")

# 2) Keywords exhaustifs
s=R(s,'<meta name="keywords" content="Penc, messagerie, chat, Sénégal, statuts, canaux, vocaux, messagerie sénégalaise, penc-messagerie, DeglouFM"/>',
      '<meta name="keywords" content="Penc, messagerie, messagerie gratuite, chat, appels vidéo, appels audio, messages vocaux, statuts, canaux, groupes, radio en direct, transferts d\'argent, penc-messagerie, Sénégal, DeglouFM"/>',
      "Keywords")

# 3) og:description exhaustive
s=R(s,'<meta property="og:description" content="Discutez, partagez statuts, vocaux et photos, suivez des canaux. La messagerie moderne ouverte à tous."/>',
      '<meta property="og:description" content="Messagerie mondiale gratuite : messages privés et de groupe, appels audio et vidéo, vocaux, photos, vidéos, statuts, canaux et radio en direct."/>',
      "og:description")

# 4) twitter:description exhaustive
s=R(s,'<meta name="twitter:description" content="Discutez, partagez statuts, vocaux et photos, suivez des canaux."/>',
      '<meta name="twitter:description" content="Messagerie mondiale gratuite : messages, appels audio et vidéo, vocaux, statuts, canaux et radio en direct."/>',
      "twitter:description")

# 5) Ajouter Appels + Transferts aux atouts
s=R(s,'</svg>Radio en direct</div>\n    </div>',
      '</svg>Radio en direct</div>\n'
      '      <div class="auth-feat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 8-6 4 6 4V8z"/><rect x="2" y="6" width="14" height="12" rx="2"/></svg>Appels audio &amp; vidéo</div>\n'
      '      <div class="auth-feat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/></svg>Transferts d\'argent</div>\n'
      '    </div>',
      "Atouts Appels + Transferts")

# 6) Retirer 'Conçu au Sénégal'
s=R(s,'\n      <span>🇸🇳 Conçu au Sénégal</span>',"","Retrait Concu au Senegal")

# 7) Build bump
s=R(s,"console.log('PENC build v148 (accueil de bienvenue apres inscription)');",
      "console.log('PENC build v149 (SEO exhaustif + atouts + retrait Senegal)');","Build -> v149")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v149.")
