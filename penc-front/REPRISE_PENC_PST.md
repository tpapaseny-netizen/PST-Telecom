# 📋 REPRISE — Écosystème PST / Penc (à coller dans la prochaine discussion)

> Document de continuité pour Papa Seny Touré (PST – Pure Smart Telecom, Thiès/Sénégal).
> Objectif : reprendre **exactement** où on s'est arrêté, sans rien perdre.
> Ton attendu : collégial, français, « mon frère ». Crédo : **rapidité** + **« ne jamais détruire un acquis »**.

---

## 1) ÉTAT ACTUEL DES FICHIERS (dernières versions)

| Fichier | Version | Rôle | Où le déployer |
|---|---|---|---|
| `messager.html` | **build v285** (header `3c 21 44`, LF, **pas de BOM**) | Front Penc | Cloudflare `penc-front` |
| `sw.js` | **SW_VERSION v285** | Service Worker | Cloudflare `penc-front` |
| `server-at.js` | merge PG/JSONBin ajouté (**BOM ef bb bf + CRLF équilibré**) | Backend | Git → Render `PST-Telecom` |
| `penc-manifest.json` | maskable 192+512 ajoutés | Manifest PWA | Cloudflare `penc-front` |
| `penc-icon-192/512/180.png`, `penc-icon-192/512-maskable.png`, `penc-favicon.png` | nouveau logo | Icônes PWA | Cloudflare `penc-front` |
| `Business_Plan_Penc.docx` | 15 pages, bleu Penc | Business plan (40M FCFA) | — |

**SW_VERSION doit toujours être synchro avec le numéro de build.**

---

## 2) CE QU'ON A FAIT CETTE SESSION (v280 → v285 + backend)

1. **Player vocal équidistant (v280)** — Cause : bulle ouverte = **56px fixes**, l'ancien `translateY` remontait l'avatar (vide en bas). Correctif : play + waveform + dot + avatar **centrés sur l'axe médian** ; temps en **légende absolue en bas** (`.voice-foot{position:absolute;left:48px;right:6px;bottom:4px}`, `.voice-mid{align-self:stretch;flex:1;justify-content:center}`). Vérifié au rendu (wkhtmltoimage).
2. **Emoji picker (v281→v283)** — Refonte demandée : au-dessus du clavier, **sans barre de recherche**, **Twemoji net** dans picker ET messages (messages utilisaient déjà `_twemo`).
   - v281 « en flux » a **cassé l'ouverture** (CSS `position:relative !important` écrasait le positionnement) + **saturation réseau** (tout l'emoji converti d'un coup → app très lente : chat, DegluFM, statuts, canaux).
   - **v282** : lazy-load `_emojiLazyTwemo(p)` (1ʳᵉ catégorie instantanée via `_twemo(grids[0])`, reste en `IntersectionObserver` root:p) + gestionnaire média défensif (`if(t.muted)return` / `if(m.muted)return` pour ne pas « bagarrer » les vidéos muettes).
   - **v283** : **retour à l'overlay fixe éprouvé** (`toggleStickers` → `position:fixed;bottom:_h;maxHeight:42vh;zIndex:150`) car le « push-up » cassait le clic ; lazy-load conservé ; `pointer-events:none` sur `img.emoji` (tap fiable). **Picker réactif + rapide + net.**
3. **Nouveau logo Penc (v284)** — Logo complet (carré bleu `#0160f8`, marque clé/Y + 4 icônes + flèche, « Penc ») **intégré en base64** (classe CSS `.penc-logo-img` + `.penc-logo-badge{border-radius:22%}`). Remplacé partout : **splash** (148px, fond `#070D1A`), **login** (118px), **en-tête discussions** (badge 34px, `onclick="adminTap()"` conservé), **viewer média** (22px).
4. **Fix « nouveaux utilisateurs invisibles » (backend)** — Cause : comptes créés dans **JSONBin** (quand PG momentanément indispo), mais recherche/admin lisent **PG seul**. Correctif : `pgAllUsersMerged()` fusionne **PG + JSONBin** (dedup par **id ET téléphone**, normalise le format JSONBin). Utilisé dans `/api/penc/contacts`, `/api/penc/contacts/search` (branche q vide) et `/api/penc/admin/overview`. **Purement additif.**
5. **Icônes PWA + favicon (v285)** — Régénérées depuis le nouveau logo (mêmes noms). Maskable = logo à **72% centré** sur fond bleu (safe zone du crop circulaire). Manifest mis à jour (maskable 192+512). En-tête : `apple-touch-icon` → 180, ajout `<link rel="icon">` (192 + favicon 64).

---

## 3) DÉPLOIEMENT (à refaire à chaque livraison)

**FRONT (Cloudflare `penc-front` UNIQUEMENT — jamais git) :**
```powershell
$repo  = "$env:USERPROFILE\Desktop\PST-Telecom"; $front = "$repo\penc-front"; $dl = "$env:USERPROFILE\Downloads"
Copy-Item (Get-ChildItem "$dl\messager*.html" | Sort LastWriteTime -Desc | Select -First 1).FullName "$front\messager.html" -Force
Copy-Item (Get-ChildItem "$dl\sw*.js"        | Sort LastWriteTime -Desc | Select -First 1).FullName "$front\sw.js" -Force
# + déposer aussi : penc-manifest.json, penc-icon-*.png, penc-favicon.png dans $front
```
Puis **Cloudflare → Workers & Pages → penc-front → Create deployment → glisser-déposer le dossier → Deploy.**
Vérifier `https://penc-messagerie.com/sw.js` = bonne version.
**⚠️ TOUJOURS vider le cache SW** : DevTools → Application → Service Workers → **Unregister** → recharger (sinon ancienne version active).

**BACKEND (`server-at.js` → Render) :**
```powershell
Copy-Item (Get-ChildItem "$env:USERPROFILE\Downloads\server-at*.js" | Sort LastWriteTime -Desc | Select -First 1).FullName "$repo\server-at.js" -Force
cd $repo; git add server-at.js; git commit -m "maj"; git push   # → Render redéploie
```
**⚠️ PIÈGE :** toujours **télécharger `server-at.js` depuis Downloads AVANT le git push**, sinon git dit « Everything up-to-date » sans rien mettre à jour.
Déployer le **backend AVANT le front** quand le front dépend de nouvelles routes.

---

## 4) MÉTHODE DE PATCH (à respecter)

- Scripts **Python heredoc** `<< 'PY'`, helper `R(s, old, new, label)` exigeant **count == 1** (jamais PowerShell pour modifier le code).
- **Front** : `io.open(..., encoding='utf-8', newline='')` ; vérifs : header = `3c 21 44`, **0 CRLF**, bump build + SW ; extraire les **4 blocs `<script>`** (regex) + `node --check` chacun.
- **Backend** : **préserver le BOM** (`ef bb bf`) et **CRLF équilibré** (`b.count(b'\r')==b.count(b'\n')`) ; `node --check`.
- Ancres **uniques** obligatoires (plusieurs handlers login/signup/google partagent du code).
- Livrables dans `/mnt/user-data/outputs/` + `present_files`. Prévisualiser les designs quand possible.

---

## 5) ARCHITECTURE PENC

- **Domaine** : `penc-messagerie.com`. Front 100% statique (Cloudflare `penc-front`).
- **Backend** : Render `pst-telecom.onrender.com` (`server-at.js`).
- **Stockage** : **PostgreSQL `penc-db`** = source de vérité (`_pgPool`), **JSONBin = fallback légataire** (`pencUsers()` lit `BINS.penc_users`).
- **JWT** : `PENC_SECRET = pst-jwt-2026-xK9mPq7nR3`. Admins : `tpapaseny@ept.sn`, `papasenytoure@gmail.com`.
- **DegluFM** : iframe `radioFrame` → `https://deglufm.base44.app` (app base44 séparée, 210+ stations), postMessage `source:'penc'/'deglufm'`. Si lent → c'est le chargement base44 (externe), pas Penc.
- **Sécurité déjà en place** : 4 couches + E2E (phases A/B/C), **sauvegarde clé zero-knowledge** (PBKDF2 200k + nacl.secretbox, colonne `key_backup`), **2FA TOTP** Google Authenticator (RFC6238 sans dépendance, secret AES-256-GCM au repos, colonnes `totp_secret`/`totp_enabled`, routes `/auth/2fa/status|setup|enable|disable|login`, login 2 étapes JWT pending 5min). `pencStrip` retire password/password_hash/totp_secret.

---

## 6) ⛔ RÈGLES ABSOLUES

- **NE JAMAIS** modifier/toucher quoi que ce soit lié à **ZAMA** (zama-sn.com) ou **SenSMS** (sensms.com) : code, routes, bins JSONBin, config. Modifs **exclusivement Penc** (et autres services PST non-ZAMA/SenSMS).
- **NE JAMAIS** vider/reset la base (garde-fou `pencSaveUsers` déjà présent).
- **Ne jamais détruire un acquis** : tester étape par étape avant de déployer.

---

## 7) ✅ TODO / PISTES POUR LA SUITE

- **Sécurité** (proposé, non fait) : codes de secours 2FA, 2FA sur **connexion Google** (actuellement la 2FA TOTP ne se déclenche PAS via Google sign-in), **Double Ratchet** (forward secrecy).
- **Emoji « push-up clavier »** : si tu y tiens, le refaire **proprement** (panneau en flux qui pousse `#msgsArea`, sans casser le positionnement/clic) — l'overlay fixe actuel marche et est rapide.
- **DegluFM** : si toujours lent, envisager préchargement de l'iframe / indicateur de chargement (mais cause = base44 externe).
- **Vérifier en prod** : nouveaux comptes visibles dans recherche + admin (fix merge), nouveau logo partout, icône PWA à l'installation.

---

## 8) RAPPEL TICKET EN COURS À LA CLÔTURE

Tout est **livré et copié** dans `/mnt/user-data/outputs/` (front v285, backend merge, icônes, manifest, business plan).
**Prochaine action concrète** : déployer v285 (front Cloudflare + backend Render), vider le cache SW, et valider en prod.

— Fin du document de reprise. Bon courage, mon frère. 🇸🇳
