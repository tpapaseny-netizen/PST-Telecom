# 📂 DOSSIER PLAY STORE PENC — Où va chaque fichier

```
PlayStore_Penc/
│
├── LIS-MOI-DABORD.md            ← ce fichier
├── GUIDE_PLAYSTORE_PENC.md      ← la feuille de route complète (6 étapes)
│
├── 1_SITE_a_pousser_sur_Cloudflare/     → C:\Users\NDCHEIKH\Desktop\PST-Telecom\
│   ├── messager.html                    (build v378 : micro + auto-join + raccourcis Android)
│   ├── sw.js                            (SW_VERSION v378, synchronisé)
│   ├── penc-manifest.json               (slogan panafricain + 4 raccourcis + icône maskable)
│   ├── confidentialite.html             (obligatoire pour Google)
│   ├── penc-icon-maskable-512.png       (icône Android jamais rognée)
│   └── .well-known/
│       └── assetlinks.json              ⚠️ NE PAS POUSSER MAINTENANT — remplir
│                                          l'empreinte SHA-256 à l'Étape 3 du guide d'abord
│
├── 2_PWABuilder/                        → à garder sous la main (rien à déployer)
│   ├── REGLAGES_PWABUILDER.md           (chaque champ du formulaire, valeur exacte)
│   └── twa-manifest-reference.json      (référence + permissions de toutes les fonctionnalités)
│
└── 3_Play_Console/                      → à téléverser sur play.google.com/console
    ├── penc-icon-512-store.png          (icône de la fiche Store)
    └── penc-feature-graphic-1024x500.png (bannière avec le slogan panafricain)
```

## 🚀 Dans l'ordre

**Maintenant (5 min)** — copie le contenu de `1_SITE_a_pousser_sur_Cloudflare/` dans
`C:\Users\NDCHEIKH\Desktop\PST-Telecom\` (SAUF le dossier `.well-known`, garde-le de côté), puis :

```powershell
cd C:\Users\NDCHEIKH\Desktop\PST-Telecom
git add messager.html sw.js penc-manifest.json confidentialite.html penc-icon-maskable-512.png
git commit -m "v378: raccourcis Android + manifest TWA panafricain + confidentialite"
git push origin main
```

**Ensuite** — suis `GUIDE_PLAYSTORE_PENC.md` étape par étape :
1. Compte Play Console (25 USD ≈ 16 250 FCFA)
2. PWABuilder avec `2_PWABuilder/REGLAGES_PWABUILDER.md`
3. `.well-known/assetlinks.json` : remplir l'empreinte → pousser
4. Fiche Store avec les visuels de `3_Play_Console/` + 2 captures d'écran
5. Test fermé (12 testeurs × 14 jours — Les Bâtisseurs !)
6. Production 🚀

## ✅ Ce qui est déjà acquis (rappel des sessions)

- Build v378 cumulatif : micro pleine taille corrigé, auto-join Meet `?auto=1`,
  gestionnaire `?open=` pour les raccourcis Android
- Politique de confidentialité conforme loi sénégalaise n° 2008-12 / CDP
- Toutes les fonctionnalités Penc couvertes en TWA sans configuration native :
  vocaux, TTS/STT, appels, Penc Meet complet, push, hors-ligne, PiP, DeglouFM
- Serveur v21 inchangé — rien à déployer côté Render
- Budget : les 16 250 FCFA Play Store sont dans l'enveloppe des 150 000 (dossier EPT)
