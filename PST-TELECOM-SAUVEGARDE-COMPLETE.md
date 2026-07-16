# 🗂️ PST TELECOM — Sauvegarde complète de l'écosystème
**Pour reprendre dans une nouvelle discussion · 13 juin 2026 · Fondateur : Papa Seny Touré**

> Colle ce document au début de ta prochaine conversation pour que Claude reprenne exactement où on en est.

---

## ⚠️ 0. PROBLÈME EN COURS — à résoudre EN PRIORITÉ (affichage front Penc)

**Symptôme :** les dernières améliorations du front Penc (login premium v71, menu statut, amis obligatoires…) **ne s'affichent pas** dans l'app, alors que le déploiement « réussit ».

**Ce qui est PROUVÉ (à ne pas re-débattre) :**
- ✅ Le **serveur** (Render) déploie bien — dernier commit live : `a0bf471` (« check-username + reply_to persiste + amis admin + ping »).
- ✅ Cloudflare **sert bien le v71** : la commande `Invoke-WebRequest` sur `https://penc-messagerie.com/` a renvoyé **`EN LIGNE = PENC build v71`**. Donc le fichier en ligne est le bon.
- ✅ Le `messager.html` v71 (441 KB = 452 KO) est bien présent dans `penc-front`.
- ✅ Un fichier **`_headers`** (no-cache) a été ajouté pour empêcher le cache navigateur.
- ✅ Le front a été **consolidé** dans `C:\Users\NDCHEIKH\Desktop\PST-Telecom\penc-front` (6 fichiers : `messager.html`, `sw.js`, `_redirects`, `_headers`, `penc-manifest.json`, `penc-icon-192.png`).

**MAIS** : malgré déploiement + navigation privée, l'utilisateur voit « toujours rien ». Donc le problème est **côté affichage client**, pas côté déploiement.

**🔍 PISTES À CREUSER EN PRIORITÉ au prochain chat (par ordre de probabilité) :**
1. **Ancien Service Worker en cache** : un vieux `sw.js` (avec cache de pages) peut être encore enregistré sur l'appareil et servir l'ancienne page. → Sur PC : **F12 → onglet Application → Service Workers → Unregister**, PUIS **Application → Storage → Clear site data**, puis recharger. C'est l'option « nucléaire » qui force le v71.
2. **Vérifier que « Déployer » a bien été cliqué** avec les 6 fichiers ET qu'un message de succès est apparu (pas juste l'upload).
3. **Re-vérifier la version en ligne APRÈS le dernier déploiement** avec la commande Invoke-WebRequest (voir §9).
4. **Règle de cache Cloudflare au niveau zone** : créer une *Cache Rule* sur `penc-messagerie.com` → pour le chemin `/` et `/messager.html` → **Bypass cache** (au cas où l'edge Cloudflare garde l'HTML, indépendamment du `_headers`).
5. **www vs non-www** : tester `penc-messagerie.com` ET `www.penc-messagerie.com` (les deux sont en Production sur le worker — vérifier qu'ils servent tous deux le v71).
6. **PWA installée** : désinstaller l'icône de l'écran d'accueil → rouvrir dans le navigateur → réinstaller.
7. Vérifier dans le HTML servi la présence du **code v71 complet** (chercher `auth-premium`, `_authTogglePw`, `_FRIEND_IDS`, `openStatusMenu`), pas seulement le marqueur de build.

---

## 1. ARCHITECTURE & DÉPLOIEMENT

**Dépôt git unique :** `tpapaseny-netizen/PST-Telecom` (dossier local `C:\Users\NDCHEIKH\Desktop\PST-Telecom`).
- À la racine : `server-at.js` → **git push** → **Render** auto-déploie (service `srv-d8a5t5eq1p3s73ddofpg`). API : `api.penc-messagerie.com` (CNAME Cloudflare `api` → `pst-telecom.onrender.com`, **nuage gris / DNS-only** — critique pour le SSL Render). Render Free s'endort après inactivité (~50 s de réveil).
- Sous-dossier (nouveau) : `penc-front/` → les 6 fichiers du **front Penc** → upload manuel vers **Cloudflare** (worker static-assets `tiny-morning-bf7e`).

**Front Penc (Cloudflare) :** worker `tiny-morning-bf7e`, domaines `penc-messagerie.com` + `www.penc-messagerie.com` (Production, HTTPS actif). Déploiement = glisser-déposer **les 6 fichiers** (Cloudflare remplace tout le déploiement → toujours envoyer les 6). **Jamais** mettre `server-at.js` sur Cloudflare (secrets).

**Stockage :** PostgreSQL `penc-db` (Render Free, **expire ~6 juillet 2026**). Abonnements push dans JSONBin bin `penc_push`. Cloudinary : cloud `dkuekfrh9`, preset `pst_uploads`.

**Environnement de dev :** Windows, VS Code, PowerShell. Communication en **français**, ton chaleureux. Préférences : scripts patch Python, fichiers téléchargeables (pas de code inline), guidage pas-à-pas, une étape à la fois.

---

## 2. PENC — Messagerie PWA (build actuel : **v71**)

### Ce qui a été FAIT dans la dernière session (validé, à déployer/vérifier) :
1. **Anti-veille Render** : endpoint serveur `/ping` (rapide, sans log) + keep-alive front (`_kPing`, ping immédiat + toutes les 14 min).
2. **Menu contextuel statut** : blocage du menu natif du navigateur dans `#statusViewer` (+ `-webkit-touch-callout:none` sur `#svImg`/`#svVid`), remplacé par un menu Penc sur appui long (520 ms) : **Télécharger / Partager via Penc / Signaler** (`openStatusMenu`, `_svAttachLongPress`, `window._svCur`).
3. **Citation statut sur 1er message** (BUG CORRIGÉ) : le handler socket `message:send` appelait `pgSaveMessage` **sans `reply_to` ni `pending`** → la citation du statut était livrée en temps réel mais jamais persistée → perdue à la réouverture. Ajout de `reply_to` + `pending` à cet appel.
4. **Amis obligatoires** : dans « Nouvelle conversation », les non-amis voient **« Demande d'ami »** au lieu de « Message » (`window._FRIEND_IDS` chargé via `/friends`, classe `.su-addfr`). **Exception admins** (côté front ET serveur : `_senderAdmin` exempte du gel « 1er message en attente »).
5. **Refonte login premium (point 5)** : `#screen-auth` redesigné — fond blanc `#F8F9FA`, logo P turquoise `#00C896`, carte ombrée, onglets, champs avec icônes SVG + œil (`_authTogglePw`), barre de force du mot de passe (`_pwStrength`), **vérif username temps réel** (`_checkUsername`, debounce 500 ms → route publique serveur `GET /api/penc/check-username`), cartes d'erreur premium (`showErr` avec icône). **Tous les IDs et la logique d'auth préservés** (`l-id`, `l-pw`, `r-name`, `r-user`, `r-phone`, `r-email`, `r-pw`, `doLogin`, `doRegister`, `switchTab`, `showForgot`). CSS scopée `#screen-auth` (style `id="auth-premium"` avant `</head>`) pour ne pas toucher le reste de l'app (`.form-input`/`.btn-primary` sont partagés).

### Repères techniques front (messager.html, LF, sans BOM) :
- `API = 'https://api.penc-messagerie.com/api/penc'` ; `SOCKET_URL = 'https://api.penc-messagerie.com'` ; socket = `SOCKET` ; token global `TOKEN` (localStorage `penc_tok`).
- Helpers : `esc()`, `showNotif(icon,title,body,color,onclick)`, `_frBtn(kind)`, overlays `.overlay`+`.sheet`+`.sheet-handle`+`.show`.
- Citations reply_to : cache local `_saveRT`/`_getRT` (localStorage `penc_rt`) ; rendu gère `_rt.kind==='status'` ; `svStatusQuote()` construit `{kind:'status',type,content,author_id,author_name,thumb}`.
- Marqueur de build : `console.log('PENC build vXX ...')` (~ligne 4775) — sert de témoin de version en ligne.

### Repères serveur (server-at.js, CRLF, AVEC BOM) :
- Admins : `PENC_ADMIN_EMAILS = ['tpapaseny@ept.sn','papasenytoure@gmail.com']` (ligne ~5301). `penc_users.is_admin` (booléen). `penc_users.id` = **TEXT**.
- Messages : table `penc_messages` (colonne `reply_to` TEXT/JSON, `pending` bool). `pgSaveMessage` persiste `reply_to` en `JSON.stringify`.
- Gel amitié : si conversation a 0 message et pas `pgFriendAccepted` → `msg.pending=true` + `pgEnsureFriendRequest` (sauf admin).
- Push : VAPID **déjà configurés sur Render et NE PAS CHANGER** : `VAPID_PUBLIC_KEY = BE0QDhQMS3SxCSgrMXDvycggcxqfYwJ_xwM-A6cJ_IvWwdcoYjk0-u-Z3DeNhN3-GNk39Ej_EVCnllm6gq2CLIA` / `VAPID_PRIVATE_KEY = ReTt2jDR8z2xSIbJU6nktiQWssMEunfqnkc-HqrttA0`. (Une paire BNS2…/ujz2… avait été générée par erreur puis annulée.) Push OK pour : message, statut publié, appel entrant, demande d'ami, ami accepté.

### Méthodologie patch (anti-régression) — IMPÉRATIF :
- Scripts Python en heredoc ; helper `R(o,n,label)` qui **exige count==1** (sinon échec).
- `server-at.js` : lire bytes → décoder `utf-8-sig` → éditer → ré-encoder UTF-8 **AVEC BOM** + **CRLF** (`\r\n`).
- `messager.html` : mode texte `newline=''`, **LF**, **sans BOM**.
- Pour grosses injections JS : écrire un snippet propre via fichier (template literals évitent l'enfer des quotes), puis str_replace à une ancre unique.
- Valider à chaque étape : `node --check server-at.js`, `node check.js` (blocs `<script>` du HTML), check Python LF/BOM.
- Toujours : ne rien casser, ne pas reset la BD, `IF NOT EXISTS` pour tables/colonnes, bumper le marqueur de build, dire ce qui a changé + ce qui n'a PAS été touché.

### Sondages Penc (déjà déployés, session précédente) :
Tables `penc_polls`, `penc_poll_options`, `penc_poll_votes`. Routes admin (créer/activer/fermer/résultats/votants/export CSV) + user (voter, 1 participation/compte). Front : module admin + cartes de vote + pastilles dans les statuts + onglet « Sondages » dans la barre du bas (`nav-polls`).

---

## 3. ZAMA — fintech/crypto→FCFA (🚫 NE JAMAIS MODIFIER)
- Hébergé sur **Cloudflare Pages** (branche `zama`, `zama-sn.com` + `www.zama-sn.com`, SSL actif, NS `devin.ns.cloudflare.com` / `paityn.ns.cloudflare.com`).
- Thème sombre premium `#070D1A`. POS izichangePay : `https://pay.izichange.com/pos/a1b8f972-befb-4186-b0e6-45c982750402`. API key izichange : `14l6GaXhhqoxsaly2PsAnv888xqDsxlNuXgUYJv1Wfi56393680`.
- Admin : 5 clics sur le logo → email + mot de passe `Pstdiama@1`. Emails admin : `tpapaseny@ept.sn` + `papasenytoure@gmail.com`. Infobip sender ID : `ZAMA`.
- Sitemap soumis à Google Search Console (2 pages indexées).

## 4. SenSMS — SMS en masse (🚫 NE JAMAIS MODIFIER)
- Migré de MongoDB → **JSONBin.io**. Bins : `JSONBIN_USERS_BIN=6a170c67f47d5c455c3d7ced`, `JSONBIN_CAMPAIGNS_BIN=6a170c678ef04f453821bc75`, `JSONBIN_CONTACTS_BIN=6a170c678ef04f453821bc76`. Master key en var Render.
- Techsoft SMS : token `1597|WVx84MHm3x4VoCzT7vzBm2RKZKANDok1N0wCtRd8f6f57823`, 18 FCFA/SMS, endpoint `https://app.techsoft-sms.com/api/http/`. Thème `#F5F0E8`/`#1C1917`. Branche `main` / projet Vercel `pst-telecom`.
- Connu en attente : route `/api/sen-sms/me` renvoyait 404 (fix à finaliser).

## 5. AUTRES SERVICES
- **AfriVote** (`afrivote.html`, sondages anti-fraude, déployé sur `zama-sn.com` via `main`).
- **CCJ** (`ccj.html`, 6 profils, admin hiérarchique, broadcast 558 communes).
- **DegluFM** (radio, app Base44 `deglufm.base44.app`). Domaine `deglufm.com` acheté sur Cloudflare (actif jusqu'au 13 juin 2027). Domaine perso Base44 = plan **Builder ($40/mois)** requis → en attendant : **règle de redirection Cloudflare gratuite** (`@` + `www` → IP `192.0.2.1` nuage orange, Redirect Rule 301 → `https://deglufm.base44.app`). Limite : l'URL affiche `.base44.app` après redirection.
- **Ngoyane Music** (`ngoyane.base44.app`, cible `ngoyane-music.com`). **AfriRadio** (`afri-radio.base44.app`). **ZAMIN** (collecte terrain `/zamin`). **SenBet**, **PST Stream/NOC/TRAX/TV**, **DDM**, jeux éducatifs — prototypes.

## 6. CREDENTIALS & CONFIG CLÉS (garde ce fichier en lieu sûr)
- `JWT secret` : `pst-jwt-2026-xK9mPq7nR3` · `Admin token` : `pst-admin-2026`
- Gmail app password : `gwwjmwlgrigemvmd` (vars `GMAIL_USER` + `GMAIL_APP_PASSWORD` sur Render)
- Wave merchant : `https://pay.wave.com/m/M_rlEv9b4P3VtG/c/sn/?amount=XXX`
- IziPay : `IZIPAY_IPN_SECRET=Pstdiama@1`, `IZIPAY_API_KEY=14l6GaXhhqoxsaly2PsAnv888xqDsxlNuXgUYJv1Wfi56393680`
- Infobip `pst-voip` : valable jusqu'au 24/05/2027, base URL `y42xy1.api.infobip.com`, app ID `default`
- Cloudinary : cloud `dkuekfrh9`, preset `pst_uploads`
- Penc DB PostgreSQL `penc-db` (Render Free, **expire ~6 juillet 2026 → prévoir migration/renouvellement**)

## 7. ⛔ RÈGLES ABSOLUES
1. **Ne JAMAIS modifier/toucher ZAMA ni SenSMS** (code, routes, variables, bins, config). Toutes les modifs concernent **uniquement Penc** et les autres services non-ZAMA/non-SenSMS.
2. **Plus de MongoDB** depuis mai 2026 → tout en **JSONBin** (ignorer les erreurs « bad auth » MongoDB, normales). Penc utilise **PostgreSQL** (`penc-db`).
3. Ne pas reset la base. `IF NOT EXISTS` pour toute table/colonne. Préserver toutes les fonctionnalités existantes.
4. Ne PAS changer les clés VAPID (elles correspondent déjà entre front et Render).

## 8. POUR REPRENDRE DANS UN NOUVEAU CHAT
**Vérifier la version réellement en ligne (à relancer après chaque déploiement) :**
```powershell
$html = (Invoke-WebRequest "https://penc-messagerie.com/?x=$(Get-Random)" -UseBasicParsing).Content
$m = [regex]::Match($html, "PENC build v\d+")
if ($m.Success) { Write-Host "EN LIGNE = $($m.Value)" -ForegroundColor Green } else { Write-Host "Aucun marqueur" -ForegroundColor Red }
```

**Déployer le front (depuis le dossier consolidé) :**
```powershell
explorer "$env:USERPROFILE\Desktop\PST-Telecom\penc-front"
# Ctrl+A → glisser les 6 fichiers dans Cloudflare (worker tiny-morning-bf7e) → Déployer
```

**Déployer le serveur :**
```powershell
cd "$env:USERPROFILE\Desktop\PST-Telecom"
git add . ; git commit -m "Penc: ..." ; git push origin main   # Render auto-déploie
```

**Si le front « n'arrive toujours pas » :** suivre les pistes du §0 — d'abord **F12 → Application → Service Workers → Unregister + Clear site data**, puis une **Cache Rule Cloudflare** (Bypass cache sur `/` et `/messager.html`).

---

*Fin de la sauvegarde. Bonne continuation sur l'écosystème PST Telecom 🇸🇳 — Penc, ZAMA, SenSMS et tout le reste.*
