# PST — Pure Smart Telecom
# Guide de déploiement production

## 1. TWILIO — Appels VoIP

### Créer un compte
1. Aller sur https://twilio.com et créer un compte
2. Vérifier votre numéro de téléphone
3. Récupérer dans la console :
   - Account SID
   - Auth Token

### Acheter un numéro
- Console > Phone Numbers > Buy a Number
- Choisir un numéro avec capacité Voice
- (Twilio ne propose pas encore de numéros +221 Sénégal)
- Alternative : utiliser un numéro US/FR et faire du call forwarding

### Créer une TwiML App
- Console > Voice > TwiML Apps > Create
- Voice Request URL : https://votre-api.com/api/calls/outgoing
- Status Callback URL : https://votre-api.com/api/calls/status
- Copier le TwiML App SID

### Créer une API Key
- Console > API keys > Create API Key
- Standard Key
- Copier Key SID et Secret

---

## 2. WAVE MONEY — Paiement

### Devenir marchand Wave
1. Aller sur https://wave.com/business
2. Créer un compte marchand
3. Fournir les documents (registre de commerce, pièce d'identité)
4. Attendre la validation (2-5 jours ouvrables)

### Obtenir les clés API
- Dashboard Wave Business > Intégrations > API
- Générer une clé API de production
- Configurer l'URL de webhook pour les confirmations

### Test en mode sandbox
```
WAVE_API_KEY=wave_sn_test_xxxx
URL de test: https://api.wave.com/v1 (avec clé test)
```

---

## 3. ORANGE MONEY — Paiement

### S'inscrire développeur
1. Aller sur https://developer.orange.com
2. Créer un compte et une application
3. Activer l'API "Orange Money Webpay Senegal"

### Devenir marchand Orange Money
- Contacter Orange Money Sénégal : +221 77 777 7777
- Demander l'accès marchand et l'intégration API
- Délai : 1-2 semaines

---

## 4. DÉPLOIEMENT BACKEND

### Option A : Railway (recommandé pour démarrer)
```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

### Option B : Heroku
```bash
heroku create pst-backend
heroku config:set TWILIO_ACCOUNT_SID=xxx
heroku config:set TWILIO_AUTH_TOKEN=xxx
# ... (toutes les variables du .env.example)
git push heroku main
```

### Option C : VPS Ubuntu (production)
```bash
# Installer Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Cloner et installer
git clone https://github.com/votre-repo/pst-backend
cd pst-backend
npm install
cp .env.example .env
# Remplir le .env avec vos vraies clés

# Démarrer avec PM2
npm install -g pm2
pm2 start server.js --name pst-backend
pm2 startup
pm2 save

# Nginx reverse proxy
sudo apt install nginx
# Configurer nginx pour proxy vers localhost:3001
```

---

## 5. DÉPLOIEMENT FRONTEND

### React + Vercel (recommandé)
```bash
npm install -g vercel
cd frontend
vercel
# Configurer : REACT_APP_API_URL=https://votre-api.railway.app
```

---

## 6. BASE DE DONNÉES — PostgreSQL

### Remplacer la db en mémoire (pour la prod)
```bash
# Installer PostgreSQL
sudo apt install postgresql

# Créer la base PST
createdb pst_production

# Tables nécessaires
CREATE TABLE users (
  user_id VARCHAR PRIMARY KEY,
  nom VARCHAR NOT NULL,
  prenom VARCHAR,
  telephone VARCHAR NOT NULL,
  forfait VARCHAR NOT NULL,
  numero_virtuel VARCHAR,
  minutes_restantes INTEGER DEFAULT 0,
  actif BOOLEAN DEFAULT FALSE,
  date_inscription TIMESTAMP DEFAULT NOW(),
  date_renouvellement TIMESTAMP
);

CREATE TABLE paiements (
  reference VARCHAR PRIMARY KEY,
  user_id VARCHAR REFERENCES users(user_id),
  methode VARCHAR NOT NULL,
  montant INTEGER NOT NULL,
  forfait VARCHAR NOT NULL,
  statut VARCHAR DEFAULT 'en_attente',
  created_at TIMESTAMP DEFAULT NOW(),
  confirmed_at TIMESTAMP
);

CREATE TABLE appels (
  call_sid VARCHAR PRIMARY KEY,
  user_id VARCHAR REFERENCES users(user_id),
  numero_destination VARCHAR,
  direction VARCHAR,
  duree_secondes INTEGER,
  statut VARCHAR,
  debut TIMESTAMP DEFAULT NOW(),
  fin TIMESTAMP
);
```

---

## 7. BUDGET DE LANCEMENT ESTIMÉ

| Service | Coût |
|---------|------|
| Twilio (numéro + appels) | ~$20-50/mois |
| Hébergement backend | ~$5-10/mois (Railway) |
| Hébergement frontend | Gratuit (Vercel) |
| Domaine .sn | ~5 000 FCFA/an |
| **Total démarrage** | **~30 000 FCFA/mois** |

Avec seulement 10 abonnés au forfait Smart (5000 FCFA),
PST génère 50 000 FCFA/mois → rentable dès le départ.

---

## 8. CONTACTS UTILES

- Twilio Support : https://help.twilio.com
- Wave Business : business@wave.com
- Orange Developer : https://developer.orange.com/contact
- ARTP Sénégal : https://www.artp.sn
