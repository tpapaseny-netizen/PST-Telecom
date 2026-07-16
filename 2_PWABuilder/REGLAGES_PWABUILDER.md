# ⚙️ Réglages exacts à saisir sur PWABuilder.com

1. Va sur **pwabuilder.com** → colle : `https://penc-messagerie.com/messager`
2. Clique **Package for Stores → Android**
3. Remplis champ par champ (copie depuis `twa-manifest-reference.json`) :

| Champ PWABuilder | Valeur |
|---|---|
| **Package ID** | `com.penc.messagerie` ⚠️ définitif, impossible à changer |
| **App name** | `Penc — La messagerie panafricaine` |
| **Launcher name** | `Penc` |
| **App version** | `1.0.0` |
| **App version code** | `1` |
| **Host** | `penc-messagerie.com` |
| **Start URL** | `/messager?source=twa` |
| **Theme color** | `#1877F2` |
| **Background color** | `#12388C` |
| **Nav color** | `#12388C` |
| **Display mode** | `Standalone` |
| **Orientation** | `Portrait` |
| **Notifications** ✅ | **Activer** (Enable notifications = ON) — indispensable pour les push Penc |
| **Location delegation** | Désactivé (Penc n'utilise pas le GPS) |
| **Play Billing** | Désactivé (les dons passent par Wave, hors app) |
| **Fallback behavior** | `Custom Tabs` |
| **Icon URL** | `https://penc-messagerie.com/penc-icon-512.png` |
| **Maskable icon URL** | `https://penc-messagerie.com/penc-icon-maskable-512.png` |
| **Signing key** | `Create new` → 🔐 sauvegarder le keystore en 2 endroits ! |

## ✅ Fonctionnalités Penc couvertes automatiquement

En TWA, l'app tourne dans le moteur Chrome : **toutes** les fonctionnalités existantes marchent sans permission manuelle supplémentaire — Chrome affiche ses invites au moment de l'usage :

- 💬 Messages, statuts, canaux, sondages
- 🎙️ Messages vocaux + transcription (STT) + lecture vocale (TTS)
- 📞 Appels audio/vidéo, 🎥 Penc Meet (30 participants, partage d'écran, sous-titres, traduction, arrière-plans IA, enregistrement local, PiP)
- 🔔 Notifications push (avec « Enable notifications » activé ci-dessus)
- 📴 Mode hors-ligne + brouillons (service worker + IndexedDB)
- 📅 Réunions programmées, liens auto-join (`?auto=1`)
- ⚡ Raccourcis d'icône Android : appui long sur l'icône Penc → Meet / Statuts / Canaux / Appels (grâce au manifest + build v378)

## 📦 Résultat

Le ZIP téléchargé contient :
- `app-release-signed.aab` → à envoyer dans **3_Play_Console**
- `signing.keystore` + `signing-key-info.txt` → 🔐 **Google Drive + clé USB, jamais dans le repo Git !**
- `assetlinks.json` → fusionner son empreinte avec celle de Play Console (voir Étape 3 du guide)
