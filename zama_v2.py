#!/usr/bin/env python3
# zama_v2.py — Username, Notifications, Slogan animé, Envoyer plein écran

import re

with open('zama.html', 'r', encoding='utf-8', errors='replace') as f:
    html = f.read()

print("Taille initiale:", len(html))

# ══════════════════════════════════════════════
# 1. CSS — Slogan animé + Notifs + Username
# ══════════════════════════════════════════════
new_css = """
/* ══ SLOGAN ANIMÉ ══ */
.slogan-strip{display:flex;align-items:center;gap:8px;margin-top:12px;overflow:hidden;}
.slogan-pill{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:100px;font-size:11px;font-weight:700;white-space:nowrap;}
.sp-crypto{background:rgba(99,102,241,.12);border:1px solid rgba(99,102,241,.2);color:#818CF8;}
.sp-arrow{color:rgba(255,255,255,.3);font-size:14px;}
.sp-zama{background:rgba(245,176,20,.1);border:1px solid rgba(245,176,20,.2);color:var(--gold);}
.sp-mm{background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.2);color:var(--green);}
.sp-time{font-size:10px;color:rgba(255,255,255,.3);margin-left:4px;}

/* ══ NOTIF TOAST PREMIUM ══ */
.notif-pop{position:fixed;top:16px;left:50%;transform:translateX(-50%) translateY(-120px);z-index:99999;background:rgba(13,21,37,.98);border:1px solid rgba(34,197,94,.3);border-radius:16px;padding:12px 18px;display:flex;align-items:center;gap:12px;min-width:260px;max-width:calc(100% - 40px);box-shadow:0 8px 32px rgba(0,0,0,.6);transition:transform .4s cubic-bezier(.34,1.56,.64,1);pointer-events:none;}
.notif-pop.show{transform:translateX(-50%) translateY(0);}
.notif-ico{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:18px;}
.notif-txt{flex:1;}
.notif-title{font-size:13px;font-weight:700;color:#fff;}
.notif-sub{font-size:11px;color:rgba(255,255,255,.5);margin-top:2px;}

/* ══ USERNAME ══ */
.username-badge{display:inline-flex;align-items:center;gap:5px;margin-top:6px;padding:4px 10px;background:rgba(245,176,20,.08);border:1px solid rgba(245,176,20,.15);border-radius:100px;font-size:12px;font-weight:700;color:var(--gold);cursor:pointer;}
.username-badge svg{width:12px;height:12px;stroke:var(--gold);fill:none;stroke-width:2;}
.username-modal{position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:500;display:none;align-items:flex-end;justify-content:center;max-width:430px;margin:0 auto;}
.username-modal.open{display:flex;}
.username-sheet{background:var(--s1);border-radius:24px 24px 0 0;padding:24px 20px 36px;width:100%;border-top:1px solid var(--border);}
.un-preview{font-size:28px;font-weight:800;color:var(--gold);text-align:center;margin:16px 0;letter-spacing:1px;}
.un-avail{text-align:center;font-size:12px;margin-bottom:16px;}
.un-avail.ok{color:var(--green);}
.un-avail.err{color:var(--red);}

/* ══ SEND FULLSCREEN ══ */
#scr-send{display:flex !important;flex-direction:column !important;}
#scr-send .send-hero{flex:1;display:flex;flex-direction:column;justify-content:center;}
#scr-send .btn-foot{margin-top:auto;flex-shrink:0;}
"""

if '/* ══ SLOGAN ANIMÉ ══ */' not in html:
    html = html.replace('</style>', new_css + '</style>', 1)
    print("P1 CSS ajouté ✅")

# ══════════════════════════════════════════════
# 2. SLOGAN ANIMÉ dans le hero (remplace rate-pill)
# ══════════════════════════════════════════════
old_rate_pill = '<div class="rate-pill"><div class="rdot"></div>1 USD = <strong id="h-rate" style="color:#fff;margin:0 2px">--</strong> FCFA · temps réel</div>'
new_rate_pill = '''<div class="rate-pill"><div class="rdot"></div>1 USD = <strong id="h-rate" style="color:#fff;margin:0 2px">--</strong> FCFA · temps r&#233;el</div>
      <div class="slogan-strip">
        <div class="slogan-pill sp-crypto">&#128176; Crypto</div>
        <span class="sp-arrow">&#8594;</span>
        <div class="slogan-pill sp-zama">&#9733; ZAMA</div>
        <span class="sp-arrow">&#8594;</span>
        <div class="slogan-pill sp-mm">&#128247; Wave / OM</div>
        <span class="sp-time">en 30 min</span>
      </div>'''

if 'slogan-strip' not in html and old_rate_pill in html:
    html = html.replace(old_rate_pill, new_rate_pill, 1)
    print("P2 Slogan animé ajouté ✅")
elif 'slogan-strip' not in html:
    # Chercher avec regex
    m = re.search(r'<div class="rate-pill">[\s\S]*?</div>', html)
    if m:
        old = m.group(0)
        html = html.replace(old, old + '\n      <div class="slogan-strip"><div class="slogan-pill sp-crypto">&#128176; Crypto</div><span class="sp-arrow">&#8594;</span><div class="slogan-pill sp-zama">&#9733; ZAMA</div><span class="sp-arrow">&#8594;</span><div class="slogan-pill sp-mm">Wave / OM</div><span class="sp-time">en 30 min</span></div>', 1)
        print("P2 Slogan ajouté (regex) ✅")

# ══════════════════════════════════════════════
# 3. NOTIF POPUP dans le body
# ══════════════════════════════════════════════
notif_html = """
<!-- NOTIF POPUP -->
<div class="notif-pop" id="notif-pop">
  <div class="notif-ico" id="notif-ico">&#128178;</div>
  <div class="notif-txt">
    <div class="notif-title" id="notif-title">Notification</div>
    <div class="notif-sub" id="notif-sub">ZAMA</div>
  </div>
</div>
"""

if 'notif-pop' not in html:
    html = html.replace('<!-- TOAST -->', notif_html + '\n<!-- TOAST -->', 1)
    if 'notif-pop' not in html:
        html = html.replace('<div class="toast"', notif_html + '\n<div class="toast"', 1)
    print("P3 Notif popup ajoutée ✅")

# ══════════════════════════════════════════════
# 4. USERNAME dans le profil account
# ══════════════════════════════════════════════
username_modal = """
<!-- USERNAME MODAL -->
<div class="username-modal" id="username-modal">
  <div class="username-sheet">
    <div style="text-align:center;margin-bottom:16px">
      <div style="font-size:18px;font-weight:700">Choisir mon @username</div>
      <div style="font-size:12px;color:var(--text3);margin-top:4px">Identifiant unique pour recevoir de l'argent</div>
    </div>
    <div class="fg" style="padding:0;margin-bottom:8px">
      <div style="position:relative">
        <span style="position:absolute;left:14px;top:50%;transform:translateY(-50%);font-size:16px;font-weight:700;color:var(--gold)">@</span>
        <input class="finp" type="text" id="un-input" placeholder="tonnom" style="padding-left:32px;font-size:16px;font-weight:700" oninput="checkUsername(this.value)" maxlength="20">
      </div>
    </div>
    <div class="un-preview" id="un-preview">@tonnom</div>
    <div class="un-avail" id="un-avail">Entrez un username (3-20 caractères)</div>
    <button class="btn-p" style="width:100%;margin:0 0 10px" onclick="saveUsername()">Confirmer</button>
    <button style="width:100%;padding:12px;background:var(--s3);border:1px solid var(--border);color:var(--text2);border-radius:var(--rsm);cursor:pointer;font-family:var(--font)" onclick="document.getElementById('username-modal').classList.remove('open')">Annuler</button>
  </div>
</div>
"""

if 'username-modal' not in html:
    html = html.replace('<div class="toast"', username_modal + '\n<div class="toast"', 1)
    print("P4 Username modal ajouté ✅")

# Ajouter username badge dans le profil account (après acct-phone)
old_acct_phone = '<div class="acct-phone" id="a-phone">--</div>'
new_acct_phone = '''<div class="acct-phone" id="a-phone">--</div>
        <div class="username-badge" id="un-badge" onclick="openUsernameModal()" style="display:none">
          <svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
          <span id="un-display">@ajouter username</span>
        </div>'''

if 'un-badge' not in html and old_acct_phone in html:
    html = html.replace(old_acct_phone, new_acct_phone, 1)
    print("P5 Username badge ajouté ✅")

# ══════════════════════════════════════════════
# 5. JS — Notifs + Username + Slogan
# ══════════════════════════════════════════════
new_js = """
// ══ NOTIF PREMIUM ══
var _notifT = null;
function showNotif(title, sub, ico, color) {
  var pop = document.getElementById('notif-pop');
  var ti = document.getElementById('notif-title');
  var si = document.getElementById('notif-sub');
  var ic = document.getElementById('notif-ico');
  if(!pop) return;
  if(ti) ti.textContent = title || 'ZAMA';
  if(si) si.textContent = sub || '';
  if(ic) ic.textContent = ico || '\\u{1F4B8}';
  pop.style.borderColor = color ? 'rgba(' + color + ',.3)' : 'rgba(34,197,94,.3)';
  pop.classList.add('show');
  if(navigator.vibrate) navigator.vibrate([50, 30, 80]);
  clearTimeout(_notifT);
  _notifT = setTimeout(function(){ pop.classList.remove('show'); }, 4000);
}

// ══ USERNAME ══
function getUsername() {
  return localStorage.getItem('zama_username') || '';
}
function openUsernameModal() {
  var modal = document.getElementById('username-modal');
  if(modal) modal.classList.add('open');
  var inp = document.getElementById('un-input');
  if(inp) { inp.value = getUsername().replace('@',''); inp.focus(); }
  checkUsername(getUsername().replace('@',''));
}
function checkUsername(val) {
  var prev = document.getElementById('un-preview');
  var avail = document.getElementById('un-avail');
  val = val.toLowerCase().replace(/[^a-z0-9._]/g,'');
  var inp = document.getElementById('un-input');
  if(inp) inp.value = val;
  if(prev) prev.textContent = '@' + (val || 'tonnom');
  if(!val || val.length < 3) {
    if(avail) { avail.textContent = 'Minimum 3 caractères'; avail.className = 'un-avail err'; }
    return;
  }
  if(val.length > 20) {
    if(avail) { avail.textContent = 'Maximum 20 caractères'; avail.className = 'un-avail err'; }
    return;
  }
  if(avail) { avail.textContent = '@' + val + ' est disponible ✓'; avail.className = 'un-avail ok'; }
}
function saveUsername() {
  var inp = document.getElementById('un-input');
  if(!inp || inp.value.length < 3) { toast('Username trop court','err'); return; }
  var username = '@' + inp.value.toLowerCase();
  localStorage.setItem('zama_username', username);
  if(user) { user.username = username; saveULS(user); }
  var disp = document.getElementById('un-display');
  if(disp) disp.textContent = username;
  document.getElementById('username-modal').classList.remove('open');
  toast('Username ' + username + ' sauvegardé !', 'ok');
  showNotif('Username créé !', username + ' · ZAMA', '\\u2728', '245,176,20');
  renderAcct();
}
function renderUsername() {
  var badge = document.getElementById('un-badge');
  var disp = document.getElementById('un-display');
  if(!badge) return;
  if(user) {
    badge.style.display = 'inline-flex';
    var un = getUsername() || user.username || '';
    if(disp) disp.textContent = un || '+ Ajouter @username';
  } else {
    badge.style.display = 'none';
  }
}

// ══ SLOGAN ANIMATION ══
function animateSlogan() {
  var pills = document.querySelectorAll('.slogan-pill');
  if(!pills.length) return;
  pills.forEach(function(p, i) {
    p.style.opacity = '0';
    p.style.transform = 'translateY(6px)';
    setTimeout(function() {
      p.style.transition = 'all .4s cubic-bezier(.34,1.56,.64,1)';
      p.style.opacity = '1';
      p.style.transform = 'translateY(0)';
    }, i * 150);
  });
}

// Appeler animateSlogan au chargement
window.addEventListener('load', function() {
  setTimeout(animateSlogan, 800);
});
"""

if 'showNotif' not in html:
    html = html.replace('</script>', new_js + '\n</script>', 1)
    print("P6 JS Premium ajouté ✅")

# renderUsername dans renderAcct
if 'renderUsername()' not in html:
    html = html.replace(
        'var ki=document.getElementById("kyc-item");if(ki)ki.style.display=user.kyc?"none":"flex";}',
        'var ki=document.getElementById("kyc-item");if(ki)ki.style.display=user.kyc?"none":"flex";renderUsername();}',
        1
    )
    print("P7 renderUsername dans renderAcct ✅")

# showNotif au login
if 'showNotif' in html:
    html = html.replace(
        'toast("Bienvenue, "+(found.prenom||"Client")+" !","ok");goto("scr-acct");',
        'toast("Bienvenue, "+(found.prenom||"Client")+" !","ok");showNotif("Bienvenue "+( found.prenom||"")+" \\uD83D\\uDC4B","Connexion r\\u00E9ussie","\\uD83D\\uDC4B","245,176,20");goto("scr-acct");',
        1
    )
    print("P8 Notif au login ✅")

with open('zama.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("\n✅ ZAMA v2 terminé! Taille:", len(html))
