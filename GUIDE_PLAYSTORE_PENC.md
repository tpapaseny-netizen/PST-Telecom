# 📱 Penc sur le Play Store — Guide complet (TWA)

**Objectif** : transformer Penc (PWA) en application Android native publiée sur Google Play, sans réécrire une ligne de code — via **Trusted Web Activity (TWA)**. C'est la technologie officielle de Google pour les PWA (utilisée par Twitter Lite, etc.). L'app native charge `penc-messagerie.com` en plein écran, sans barre d'adresse, avec icône Penc, splash screen et présence dans le tiroir d'applications.

**Budget** : 16 250 FCFA (frais Google Play, paiement unique, déjà prévu dans le budget de 150 000).

---

## Étape 0 — Préparer le site (avant tout)

1. **Remplacer `penc-manifest.json`** sur Cloudflare Pages par la version fournie (`penc-manifest.json` de ce kit). Vérifie d'abord que ton manifest actuel ne contient pas de champs supplémentaires à conserver (fusionne si besoin).
2. **Créer l'icône maskable** : le manifest référence `/penc-icon-maskable-512.png`. Il faut une version 512×512 du pingouin avec **marge de sécurité** (le logo occupe ~66 % du centre, fond NAVY `#12388C` plein). Outil gratuit : **maskable.app/editor** — charge `penc-icon-512.png`, ajuste, exporte. Sans elle, l'icône sera rognée en cercle moche sur certains téléphones.
3. Déployer et vérifier : `https://penc-messagerie.com/penc-manifest.json` doit répondre, ainsi que l'icône maskable.

## Étape 1 — Compte Google Play Console

1. Va sur **play.google.com/console** → « Créer un compte développeur ».
2. Compte **personnel** (plus rapide) ou **organisation** (nécessite NINEA — tu peux commencer en personnel et transférer l'app plus tard vers un compte organisation PST).
3. Paiement des **25 USD** (~16 250 FCFA) par carte bancaire.
4. ⚠️ Vérification d'identité obligatoire (pièce d'identité). Compte 1–3 jours.
5. ⚠️ **Nouveauté comptes personnels** : Google exige un **test fermé avec 12 testeurs pendant 14 jours** avant la publication publique. Prévois-le dans ton calendrier — Les Bâtisseurs sont parfaits comme testeurs ! 🎯

## Étape 2 — Générer le package Android (.aab) avec PWABuilder

Pas besoin d'Android Studio. Tout se fait en ligne :

1. Va sur **pwabuilder.com** → colle `https://penc-messagerie.com/messager`.
2. PWABuilder analyse le manifest + service worker et donne un score. Corrige ce qu'il signale en rouge (normalement rien après l'Étape 0).
3. Clique **Package for Stores → Android**.
4. Remplis :
   - **Package ID** : `com.penc.messagerie` (définitif, impossible à changer après — vérifie bien !)
   - **App name** : `Penc`
   - **Version** : `1.0.0` / versionCode `1`
   - **Host** : `penc-messagerie.com`
   - **Start URL** : `/messager`
   - **Theme color** : `#1877F2` — **Background** : `#12388C`
   - **Signing key** : choisis « Create new » → PWABuilder génère le keystore.
5. Télécharge le ZIP. Il contient :
   - `app-release-signed.aab` → à envoyer sur Play Console
   - `signing.keystore` + `signing-key-info.txt` → **🔐 À CONSERVER PRÉCIEUSEMENT** (Google Drive + clé USB). Perdu = impossible de mettre à jour l'app. Traite-le comme le JWT_SECRET.
   - `assetlinks.json` → voir Étape 3.

## Étape 3 — assetlinks.json (l'étape qui enlève la barre d'adresse)

C'est LE fichier qui prouve à Android que l'app et le site t'appartiennent tous les deux. Sans lui, l'app s'ouvre avec une barre Chrome moche en haut.

1. Dans le repo du front Penc (Cloudflare Pages), crée le dossier et fichier :
   ```
   .well-known/assetlinks.json
   ```
2. Utilise le template fourni. Il faut y mettre **l'empreinte SHA-256 de la clé de signature Google Play** (pas celle de PWABuilder !) :
   - Play Console → ton app → **Configuration → Intégrité de l'application → Signature des applications**
   - Copie « Empreinte du certificat SHA-256 » de la **clé de signature d'application**.
   - ⚠️ Astuce fiabilité : mets **les deux empreintes** dans le tableau (celle de Google Play **et** celle de ton keystore PWABuilder, lisible dans `signing-key-info.txt`) — couvre tous les cas.
3. Déploie, puis vérifie : `https://penc-messagerie.com/.well-known/assetlinks.json` doit répondre en JSON.
4. Test officiel Google :
   `https://developers.google.com/digital-asset-links/tools/generator` → entre le domaine + package + empreinte → doit être vert.

## Étape 4 — Fiche Play Store

Dans Play Console → « Créer une application » :

| Champ | Valeur suggérée |
|---|---|
| Nom | Penc — La messagerie panafricaine |
| Description courte (80 c.) | Penc, la messagerie panafricaine : messages, statuts, appels et réunions vidéo. |
| Catégorie | Communication |
| E-mail contact | tpapaseny@ept.sn |
| Politique de confidentialité | **OBLIGATOIRE** — URL publique requise (ex : `penc-messagerie.com/confidentialite`). Si tu n'as pas encore la page, on la rédige ensemble à la prochaine session. |

**Visuels requis** :
- Icône 512×512 (PNG, sans transparence) → fournie : `3_Play_Console/penc-icon-512-store.png`
- **Feature graphic 1024×500** → bannière à créer → fournie : `3_Play_Console/penc-feature-graphic-1024x500.png`
- Minimum **2 captures d'écran téléphone** (prends conversation + Penc Meet, mode portrait)

**Questionnaires obligatoires** :
- *Classification du contenu* : app de communication → généralement PEGI 3/Tout public avec mention interactions entre utilisateurs.
- *Sécurité des données* : Penc collecte e-mail, nom, messages (chiffrés), photos. Déclare honnêtement : données transmises chiffrées (HTTPS), suppression de compte possible.
- *Compte de test pour Google* : fournis un compte Penc de démo (les reviewers doivent pouvoir se connecter).

## Étape 5 — Publication

1. **Production → Créer une release** → charge le `.aab`.
2. Laisse Google gérer la signature (Play App Signing) — recommandé.
3. Envoie en **test fermé** d'abord (obligatoire compte personnel) : 12 testeurs × 14 jours.
4. Puis **passage en production** : examen Google 1–7 jours.

## Étape 6 — Après publication (bonus TWA)

- **Mises à jour de contenu** : GRATUITES et instantanées — comme la TWA charge le site, chaque push Cloudflare Pages met à jour l'app sans repasser par le Play Store. Le `.aab` ne doit être re-généré que si tu changes d'icône, de nom ou de domaine. 🎯
- **Galerie native « Penc »** : la TWA ouvre la porte à une future migration Capacitor pour l'écriture directe dans la galerie (pas indispensable au lancement).
- **Notifications push** : fonctionnent déjà (service worker) ✅

---

## 📋 Checklist express

- [ ] Manifest TWA déployé (`penc-manifest.json` du kit)
- [ ] Icône maskable 512 créée et en ligne
- [ ] Compte Play Console + 25 USD + identité vérifiée
- [ ] `.aab` généré sur PWABuilder (package `com.penc.messagerie`)
- [ ] 🔐 Keystore sauvegardé en 2 endroits
- [ ] `.well-known/assetlinks.json` déployé avec les 2 empreintes
- [ ] Test vert sur le générateur Digital Asset Links
- [ ] Page politique de confidentialité en ligne
- [ ] Feature graphic 1024×500 + 2 captures
- [ ] Compte démo pour les reviewers Google
- [ ] Test fermé 12 testeurs / 14 jours
- [ ] 🚀 Production

*Kit préparé pour Papa Seny Touré — PST Pure Smart Telecom, juillet 2026.*
