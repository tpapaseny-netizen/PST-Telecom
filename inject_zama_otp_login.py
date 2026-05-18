#!/usr/bin/env python3
# inject_zama_otp_login.py
# 1. Ajoute route /api/zama/send-otp et /api/zama/user/delete dans server-at.js
# 2. Remplace doLogin() dans zama.html par flow OTP 6 chiffres
# 3. Ajoute overlay OTP connexion dans zama.html

# ═══════════════════════════════════════════════════════════════
# PATCH 1 — server-at.js : routes OTP + delete user
# ═══════════════════════════════════════════════════════════════
SERVER_FILE = 'server-at.js'

SERVER_CODE = r"""
// ─── ZAMA OTP CONNEXION + DELETE USER ──────────────────────────────────────

// Stockage OTP en mémoire (clé: phone, valeur: {code, expireAt})
const zamaOtpStore = {};

// Envoyer OTP connexion
app.post('/api/zama/send-otp', async(req, res) => {
  try {
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'Numero requis' });
    const ph = phone.startsWith('+') ? phone : '+221' + phone;
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expireAt = Date.now() + 10 * 60 * 1000; // 10 minutes
    zamaOtpStore[ph] = { code, expireAt };
    const msg = 'ZAMA: Votre code de connexion est ' + code + '. Valable 10 minutes. Ne le partagez jamais.';
    await envoyerSMSInfobip(ph, msg);
    console.log('[ZAMA OTP] Code envoye a ' + ph);
    res.json({ success: true });
  } catch (e) {
    console.error('[ZAMA OTP]', e.message);
    res.status(500).json({ error: e.message });
  }
});

// Vérifier OTP connexion
app.post('/api/zama/verify-otp', async(req, res) => {
  try {
    const { phone, code } = req.body;
    if (!phone || !code) return res.status(400).json({ valid: false, error: 'Donnees manquantes' });
    const ph = phone.startsWith('+') ? phone : '+221' + phone;
    const entry = zamaOtpStore[ph];
    if (!entry) return res.json({ valid: false, error: 'Aucun code envoye' });
    if (Date.now() > entry.expireAt) {
      delete zamaOtpStore[ph];
      return res.json({ valid: false, error: 'Code expire' });
    }
    if (entry.code !== code.trim()) return res.json({ valid: false, error: 'Code incorrect' });
    delete zamaOtpStore[ph];
    res.json({ valid: true });
  } catch (e) {
    res.status(500).json({ valid: false, error: e.message });
  }
});

// Supprimer un utilisateur ZAMA (admin)
app.delete('/api/zama/user', async(req, res) => {
  try {
    const token = req.headers['x-admin-token'] || req.query.token;
    if (token !== (process.env.ADMIN_PASSWORD || 'pst-admin-2026')) {
      return res.status(403).json({ error: 'Non autorise' });
    }
    const { phone } = req.body;
    if (!phone) return res.status(400).json({ error: 'phone requis' });
    const ph = phone.startsWith('+') ? phone : '+221' + phone;
    if (db) {
      await db.collection('zama_users').deleteOne({ $or: [{ phone: ph }, { phone: phone }] });
    }
    res.json({ success: true, message: 'Utilisateur supprime: ' + ph });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
// ─── FIN ZAMA OTP CONNEXION + DELETE USER ──────────────────────────────────

"""

MARQUEUR = '// ─── DÉMARRAGE'

with open(SERVER_FILE, 'r', encoding='utf-8') as f:
    server = f.read()

if 'zamaOtpStore' in server:
    print('[INFO] Routes OTP/delete déjà présentes dans server-at.js — ignorées.')
else:
    if MARQUEUR not in server:
        print('[ERREUR] Marqueur DÉMARRAGE introuvable dans server-at.js')
        exit(1)
    server = server.replace(MARQUEUR, SERVER_CODE + MARQUEUR, 1)
    with open(SERVER_FILE, 'w', encoding='utf-8') as f:
        f.write(server)
    print('[OK] Routes /api/zama/send-otp, /api/zama/verify-otp, /api/zama/user (DELETE) ajoutées')

# ═══════════════════════════════════════════════════════════════
# PATCH 2 — zama.html : overlay OTP 6 chiffres connexion
# ═══════════════════════════════════════════════════════════════
ZAMA_FILE = 'zama.html'

with open(ZAMA_FILE, 'r', encoding='utf-8') as f:
    zama = f.read()

# --- 2a. Ajouter overlay OTP connexion juste avant </body> ---
OTP_OVERLAY = """
<!-- OTP Connexion 6 chiffres -->
<div id="otp-login-overlay" class="otp-overlay" style="display:none;align-items:flex-end;justify-content:center;">
  <div style="background:var(--s2);border-radius:24px 24px 0 0;padding:28px 24px 36px;width:100%;max-width:430px;">
    <div style="font-size:18px;font-weight:800;color:var(--text);margin-bottom:6px;text-align:center">Code de connexion</div>
    <div id="otp-login-sub" style="font-size:13px;color:var(--text2);text-align:center;margin-bottom:20px">Code envoyé par SMS</div>
    <div style="display:flex;gap:8px;justify-content:center;margin-bottom:20px">
      <input class="otp-inp" id="lc0" type="tel" maxlength="1" inputmode="numeric" oninput="lcN(this,0)" style="width:44px;height:52px;font-size:22px">
      <input class="otp-inp" id="lc1" type="tel" maxlength="1" inputmode="numeric" oninput="lcN(this,1)" style="width:44px;height:52px;font-size:22px">
      <input class="otp-inp" id="lc2" type="tel" maxlength="1" inputmode="numeric" oninput="lcN(this,2)" style="width:44px;height:52px;font-size:22px">
      <input class="otp-inp" id="lc3" type="tel" maxlength="1" inputmode="numeric" oninput="lcN(this,3)" style="width:44px;height:52px;font-size:22px">
      <input class="otp-inp" id="lc4" type="tel" maxlength="1" inputmode="numeric" oninput="lcN(this,4)" style="width:44px;height:52px;font-size:22px">
      <input class="otp-inp" id="lc5" type="tel" maxlength="1" inputmode="numeric" oninput="lcN(this,5)" style="width:44px;height:52px;font-size:22px">
    </div>
    <button class="btn-p" style="width:100%;margin:0 0 10px" onclick="verLoginOTP()">Vérifier</button>
    <button style="width:100%;padding:12px;background:var(--s3);border:1px solid var(--border);color:var(--text2);border-radius:var(--rsm);cursor:pointer;font-family:var(--font)" onclick="document.getElementById('otp-login-overlay').style.display='none'">Annuler</button>
    <div style="text-align:center;margin-top:14px">
      <span style="font-size:12px;color:var(--text3)">Pas reçu ? </span>
      <span style="font-size:12px;color:var(--gold);cursor:pointer;font-weight:600" onclick="renvoyerOTPLogin()">Renvoyer</span>
    </div>
  </div>
</div>
"""

if 'otp-login-overlay' in zama:
    print('[INFO] Overlay OTP connexion déjà présent dans zama.html — ignoré.')
else:
    zama = zama.replace('</body>', OTP_OVERLAY + '\n</body>', 1)
    print('[OK] Overlay OTP connexion 6 chiffres ajouté dans zama.html')

# --- 2b. Remplacer doLogin() par flow OTP ---
OLD_DOLOGIN = '''function doLogin(){
  var t = document.getElementById("lg-phone").value.trim();
  var em = document.getElementById("lg-email") ? document.getElementById("lg-email").value.trim() : "";
  var pwd = document.getElementById("lg-pwd").value;
  if(!t && !em){toast("Entrez votre numero ou email","err");return;}
  if(!pwd){toast("Entrez votre mot de passe","err");return;}
  var accts = getAllA();
  var found = null;
  if(em){
    // Connexion par email (admins)
    found = accts.find(function(a){return a.email && a.email.toLowerCase() === em.toLowerCase();});
    if(!found){
      // Créer un compte admin temporaire si email admin connu
      var admEmails = ["tpapaseny@ept.sn","papasenytoure@gmail.com"];
      if(admEmails.indexOf(em.toLowerCase()) >= 0){
        // Admin valide - créer session
        found = {id:"ADMIN-"+Date.now(),prenom:"Admin",nom:"ZAMA",phone:"",email:em,password:pwd,pays:"SN",kyc:true,isAdmin:true,created:new Date().toISOString()};
        var all = getAllA();
        all.push(found);
        localStorage.setItem("zama_accounts", JSON.stringify(all));
      } else {
        toast("Email non trouvé","err");
        return;
      }
    }
  } else {
    // Connexion par téléphone
    var phone = normPh(t);
    found = accts.find(function(a){return normPh(a.phone)===phone;});
    if(!found){toast("Numero non trouve. Creez un compte.","err");swTab("reg");return;}
  }
  if(found.password !== pwd){toast("Mot de passe incorrect","err");return;}
  saveULS(found);
  user = found;
  renderAcct();
  updateGreet();
  renderHBenefs();
  initTheme();
  // Afficher bouton admin si admin
  var admins = ["tpapaseny@ept.sn","papasenytoure@gmail.com"];
  var isAdm = user.email && admins.indexOf(user.email.toLowerCase()) >= 0;
  var btnAdm = document.getElementById("btn-admin-direct");
  if(btnAdm) btnAdm.style.display = isAdm ? "flex" : "none";
  toast("Bienvenue, "+(found.prenom||"Admin")+" !","ok");
  goto("scr-home");
}'''

NEW_DOLOGIN = '''// OTP login state
var _otpLoginUser = null;

function doLogin(){
  var t = document.getElementById("lg-phone").value.trim();
  var em = document.getElementById("lg-email") ? document.getElementById("lg-email").value.trim() : "";
  var pwd = document.getElementById("lg-pwd").value;
  if(!t && !em){toast("Entrez votre numero ou email","err");return;}
  if(!pwd){toast("Entrez votre mot de passe","err");return;}
  var accts = getAllA();
  var found = null;
  if(em){
    found = accts.find(function(a){return a.email && a.email.toLowerCase() === em.toLowerCase();});
    if(!found){
      var admEmails = ["tpapaseny@ept.sn","papasenytoure@gmail.com"];
      if(admEmails.indexOf(em.toLowerCase()) >= 0){
        found = {id:"ADMIN-"+Date.now(),prenom:"Admin",nom:"ZAMA",phone:"",email:em,password:pwd,pays:"SN",kyc:true,isAdmin:true,created:new Date().toISOString()};
        var all = getAllA(); all.push(found);
        localStorage.setItem("zama_accounts", JSON.stringify(all));
      } else { toast("Email non trouvé","err"); return; }
    }
  } else {
    var phone = normPh(t);
    found = accts.find(function(a){return normPh(a.phone)===phone;});
    if(!found){toast("Numero non trouve. Creez un compte.","err");swTab("reg");return;}
  }
  if(found.password !== pwd){toast("Mot de passe incorrect","err");return;}
  // Admin → connexion directe sans OTP
  if(found.isAdmin || !found.phone){
    finishLogin(found);
    return;
  }
  // Client → envoyer OTP 6 chiffres
  _otpLoginUser = found;
  var ph = found.phone.startsWith("+") ? found.phone : "+221" + found.phone;
  document.getElementById("otp-login-sub").textContent = "Code envoyé au " + ph;
  [0,1,2,3,4,5].forEach(function(i){ document.getElementById("lc"+i).value=""; });
  document.getElementById("otp-login-overlay").style.display = "flex";
  document.getElementById("lc0").focus();
  toast("Code OTP envoyé par SMS","ok");
  fetch(API+"/api/zama/send-otp",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({phone:found.phone})}).catch(function(){});
}

function lcN(el, idx){
  if(el.value.length===1 && idx < 5) document.getElementById("lc"+(idx+1)).focus();
}

function renvoyerOTPLogin(){
  if(!_otpLoginUser){return;}
  fetch(API+"/api/zama/send-otp",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({phone:_otpLoginUser.phone})})
    .then(function(){toast("Code renvoyé","ok");}).catch(function(){toast("Erreur envoi","err");});
}

async function verLoginOTP(){
  var code = [0,1,2,3,4,5].map(function(i){return document.getElementById("lc"+i).value;}).join("");
  if(code.length !== 6){toast("Entrez les 6 chiffres","err");return;}
  if(!_otpLoginUser){toast("Erreur, recommencez","err");return;}
  try{
    var r = await fetch(API+"/api/zama/verify-otp",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({phone:_otpLoginUser.phone,code:code})});
    var d = await r.json();
    if(d.valid){
      document.getElementById("otp-login-overlay").style.display="none";
      finishLogin(_otpLoginUser);
      _otpLoginUser = null;
    } else {
      toast(d.error||"Code incorrect","err");
    }
  }catch(e){toast("Erreur verification","err");}
}

function finishLogin(found){
  saveULS(found);
  user = found;
  renderAcct();
  updateGreet();
  renderHBenefs();
  initTheme();
  var admins = ["tpapaseny@ept.sn","papasenytoure@gmail.com"];
  var isAdm = user.email && admins.indexOf(user.email.toLowerCase()) >= 0;
  var btnAdm = document.getElementById("btn-admin-direct");
  if(btnAdm) btnAdm.style.display = isAdm ? "flex" : "none";
  toast("Bienvenue, "+(found.prenom||"Admin")+" !","ok");
  goto("scr-home");
}'''

if 'verLoginOTP' in zama:
    print('[INFO] doLogin OTP déjà patché dans zama.html — ignoré.')
elif OLD_DOLOGIN in zama:
    zama = zama.replace(OLD_DOLOGIN, NEW_DOLOGIN, 1)
    print('[OK] doLogin() remplacé par flow OTP 6 chiffres dans zama.html')
else:
    print('[WARN] doLogin() introuvable — vérifiez manuellement zama.html')

with open(ZAMA_FILE, 'w', encoding='utf-8') as f:
    f.write(zama)
    print('[OK] zama.html sauvegardé')

print()
print('[RÉSUMÉ]')
print('  ✓ Route POST /api/zama/send-otp   — génère et envoie OTP 6 chiffres')
print('  ✓ Route POST /api/zama/verify-otp — vérifie le code (expire 10 min)')
print('  ✓ Route DELETE /api/zama/user     — supprime un compte (admin)')
print('  ✓ doLogin() → OTP obligatoire pour clients (admins exemptés)')
print('  ✓ Bouton Renvoyer disponible dans overlay')
