# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v132 (SEO: meta description, Open Graph, canonical)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v132 — SEO")

META=('<title>Penc — Messagerie</title>\n'
'<meta name="description" content="Penc — la messagerie mondiale ouverte à tous. Discutez en privé ou en groupe, partagez statuts, vocaux, photos et vidéos, suivez des canaux et écoutez la radio. Rapide, moderne et sécurisée."/>\n'
'<meta name="keywords" content="Penc, messagerie, chat, Sénégal, statuts, canaux, vocaux, messagerie sénégalaise, penc-messagerie, DeglouFM"/>\n'
'<meta name="author" content="PST Telecom"/>\n'
'<meta name="robots" content="index, follow"/>\n'
'<link rel="canonical" href="https://penc-messagerie.com/"/>\n'
'<meta property="og:type" content="website"/>\n'
'<meta property="og:site_name" content="Penc"/>\n'
'<meta property="og:title" content="Penc — Messagerie mondiale"/>\n'
'<meta property="og:description" content="Discutez, partagez statuts, vocaux et photos, suivez des canaux. La messagerie moderne ouverte à tous."/>\n'
'<meta property="og:url" content="https://penc-messagerie.com/"/>\n'
'<meta property="og:image" content="https://penc-messagerie.com/penc-icon-512.png"/>\n'
'<meta property="og:locale" content="fr_FR"/>\n'
'<meta name="twitter:card" content="summary"/>\n'
'<meta name="twitter:title" content="Penc — Messagerie mondiale"/>\n'
'<meta name="twitter:description" content="Discutez, partagez statuts, vocaux et photos, suivez des canaux."/>\n'
'<meta name="twitter:image" content="https://penc-messagerie.com/penc-icon-512.png"/>\n'
'<!-- google-site-verification: colle ici la balise fournie par Google Search Console si tu choisis la methode HTML -->')
s=R(s,"<title>Penc — Messagerie</title>",META,"Balises SEO")

s=R(s,"console.log('PENC build v131 (pas de rechargement pendant que DeglouFM joue)');",
      "console.log('PENC build v132 (SEO: description, Open Graph, sitemap)');","Build -> v132")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v132.")
