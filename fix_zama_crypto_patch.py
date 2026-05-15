
import re, os

with open('zama.html', 'r', encoding='utf-8') as f:
    html = f.read()

original_len = len(html)

# ── 1. Supprimer CSS iframe izi ──────────────────────────────
html = re.sub(
    r'\s*#izi-iframe-wrap\{[^}]+\}\s*\n\s*#izi-iframe\{[^}]+\}\s*\n\s*@media[^}]+\{#izi-iframe\{[^}]+\}\}',
    '',
    html
)

# ── 2. Ajouter CSS crypto natif dans <style> ─────────────────
css_new = """
/* ── PANEL CRYPTO NATIF ── */
.crypto-coin-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-bottom:16px;}
.cc-pill{display:flex;align-items:center;gap:10px;padding:12px 14px;border:1.5px solid var(--border);background:var(--s2);border-radius:12px;cursor:pointer;transition:all .15s;user-select:none;-webkit-tap-highlight-color:transparent;}
.cc-pill:active{transform:scale(.96);}
.cc-pill.on{border-color:var(--gold);background:var(--gold-l);}
.cc-ico{width:36px;height:36px;border-radius:10px;flex-shrink:0;display:flex;align-items:center;justify-content:center;}
.cc-info{flex:1;min-width:0;}
.cc-name{font-size:13px;font-weight:700;color:var(--text);}
.cc-net{font-size:10px;color:var(--text3);margin-top:1px;}
.cc-pill.on .cc-name{color:var(--gold);}
.cc-pill.on .cc-net{color:rgba(245,176,20,.6);}
.crypto-addr-card{background:var(--s2);border:1px solid var(--border);border-radius:16px;overflow:hidden;margin-bottom:14px;}
.cac-badge{display:flex;align-items:center;gap:6px;padding:5px 12px;border-radius:100px;font-size:11px;font-weight:700;}
.cac-badge-wait{background:var(--amber-l);color:var(--amber);border:1px solid rgba(245,158,11,.2);}
.cac-badge-ok{background:var(--green-l);color:var(--green);border:1px solid rgba(34,197,94,.2);}
.cac-qr{display:flex;flex-direction:column;align-items:center;padding:20px;gap:12px;}
.qr-box{background:#fff;border-radius:14px;padding:12px;box-shadow:0 4px 20px rgba(0,0,0,.3);}
.cac-network-badge{display:inline-flex;align-items:center;gap:5px;padding:4px 12px;border-radius:100px;font-size:11px;font-weight:700;background:var(--gold-l);border:1px solid var(--gold-m);color:var(--gold);}
.addr-display{width:100%;background:var(--bg);border:1px dashed var(--border2);border-radius:10px;padding:12px 14px;font-family:'Courier New',monospace;font-size:12px;color:var(--text);word-break:break-all;line-height:1.7;text-align:center;}
.cac-amount-box{margin:0 16px 14px;background:var(--gold-l);border:1px solid var(--gold-m);border-radius:10px;padding:14px 16px;display:flex;align-items:center;justify-content:space-between;}
.cam-lbl{font-size:11px;color:rgba(245,176,20,.7);font-weight:600;}
.cam-val{font-size:22px;font-weight:800;color:var(--gold);}
.cam-coin{font-size:13px;color:var(--gold);font-weight:600;}
.cac-actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:0 16px 16px;}
.ca-btn{display:flex;align-items:center;justify-content:center;gap:6px;padding:11px;border-radius:10px;border:1px solid var(--border);background:var(--s3);color:var(--text2);font-size:12px;font-weight:700;cursor:pointer;font-family:var(--font);transition:all .15s;}
.ca-btn:active{transform:scale(.96);}
.ca-btn svg{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2;}
.ca-btn.gold{background:var(--gold-l);border-color:var(--gold-m);color:var(--gold);}
.network-warn{margin:0 16px 14px;background:var(--red-l);border:1px solid rgba(239,68,68,.2);border-radius:10px;padding:11px 14px;font-size:12px;color:var(--red);display:flex;gap:8px;align-items:flex-start;line-height:1.6;}
.network-warn svg{width:14px;height:14px;stroke:var(--red);fill:none;stroke-width:2;flex-shrink:0;margin-top:1px;}
.crypto-steps{padding:14px 16px;display:flex;flex-direction:column;gap:10px;border-top:1px solid var(--border);}
.cstep{display:flex;align-items:flex-start;gap:10px;}
.cstep-num{width:22px;height:22px;border-radius:50%;background:var(--gold);color:#000;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px;}
.cstep-txt{font-size:12px;color:var(--text2);line-height:1.6;}
.cstep-txt strong{color:var(--text);}
.confirms-bar{display:flex;align-items:center;gap:8px;padding:10px 16px;border-top:1px solid var(--border);font-size:12px;color:var(--text3);}
.conf-dots{display:flex;gap:4px;}
.conf-dot{width:8px;height:8px;border-radius:50%;background:var(--border);transition:background .4s;}
.conf-dot.on{background:var(--green);}
.crypto-loading{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:48px 20px;text-align:center;}
.cl-spinner{width:48px;height:48px;border:3px solid var(--border);border-top-color:var(--gold);border-radius:50%;animation:spin .7s linear infinite;}
.cl-title{font-size:16px;font-weight:700;color:var(--text);}
.cl-sub{font-size:13px;color:var(--text3);}
.cl-badge{padding:8px 20px;background:var(--gold-l);border:1px solid var(--gold-m);border-radius:var(--rsm);font-size:13px;font-weight:700;color:var(--gold);}
.crypto-success{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:36px 20px;text-align:center;}
.cs-ico{width:72px;height:72px;border-radius:50%;background:var(--green-l);border:2px solid rgba(34,197,94,.3);display:flex;align-items:center;justify-content:center;animation:glow-green 2s ease-in-out infinite;}
.cs-ico svg{width:36px;height:36px;stroke:var(--green);fill:none;stroke-width:2;}
.cs-title{font-size:20px;font-weight:800;color:var(--green);}
.cs-sub{font-size:13px;color:var(--text2);line-height:1.6;}
"""

html = html.replace('</style>\n<script src="https://cdnjs', css_new + '</style>\n<script src="https://cdnjs')

# ── 3. Remplacer le panel-crypto HTML ────────────────────────
new_panel = """<!-- PANEL CRYPTO -->
  <div id="panel-crypto" style="position:absolute;inset:0;display:none;flex-direction:column;overflow:hidden">

    <!-- STEP 1 : Choix coin -->
    <div id="cp-step-choose" style="flex:1;overflow-y:auto;padding:16px">
      <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.8px;margin-bottom:12px">Choisissez votre crypto</div>
      <div class="crypto-coin-grid" id="cp-coins">
        <div class="cc-pill on" data-coin="usdt.trc20" data-label="USDT TRC20" data-net="TRC20" onclick="cpPickCoin(this)"><div class="cc-ico" style="background:#26A17B"><svg viewBox="0 0 32 32" width="22" height="22"><circle cx="16" cy="16" r="16" fill="#26A17B"/><path d="M17.9 17.2v-.1c3.3-.2 5.7-1 5.7-2s-2.4-1.8-5.7-2v-2.3h-3.8v2.3c-3.3.2-5.7 1-5.7 2s2.4 1.8 5.7 2v5.5h3.8zm-1.9-.5c-2.9 0-5.2-.5-5.2-1.1s2.3-1.1 5.2-1.1 5.2.5 5.2 1.1-2.3 1.1-5.2 1.1z" fill="white"/></svg></div><div class="cc-info"><div class="cc-name">USDT</div><div class="cc-net">TRC20 · Tron</div></div></div>
        <div class="cc-pill" data-coin="usdt.bep20" data-label="USDT BEP20" data-net="BEP20" onclick="cpPickCoin(this)"><div class="cc-ico" style="background:#F3BA2F"><svg viewBox="0 0 32 32" width="22" height="22"><circle cx="16" cy="16" r="16" fill="#F3BA2F"/><path d="M12.2 14.4L16 10.6l3.9 3.8 2.2-2.2L16 6 10 12.2l2.2 2.2zM6 16l2.2-2.2 2.2 2.2-2.2 2.2L6 16zm6.2 1.6L16 21.4l3.8-3.8 2.2 2.2L16 26l-6-6 2.2-2.2zM21.6 16l2.2-2.2 2.2 2.2-2.2 2.2-2.2-2.2zm-3.2 0L16 13.8 13.8 16l2.2 2.2L18.4 16z" fill="white"/></svg></div><div class="cc-info"><div class="cc-name">USDT</div><div class="cc-net">BEP20 · BSC</div></div></div>
        <div class="cc-pill" data-coin="usdt.erc20" data-label="USDT ERC20" data-net="ERC20" onclick="cpPickCoin(this)"><div class="cc-ico" style="background:#627EEA"><svg viewBox="0 0 32 32" width="22" height="22"><circle cx="16" cy="16" r="16" fill="#627EEA"/><path d="M17.9 17.2v-.1c3.3-.2 5.7-1 5.7-2s-2.4-1.8-5.7-2v-2.3h-3.8v2.3c-3.3.2-5.7 1-5.7 2s2.4 1.8 5.7 2v5.5h3.8zm-1.9-.5c-2.9 0-5.2-.5-5.2-1.1s2.3-1.1 5.2-1.1 5.2.5 5.2 1.1-2.3 1.1-5.2 1.1z" fill="white"/></svg></div><div class="cc-info"><div class="cc-name">USDT</div><div class="cc-net">ERC20 · Ethereum</div></div></div>
        <div class="cc-pill" data-coin="usdt.ton" data-label="USDT TON" data-net="TON" onclick="cpPickCoin(this)"><div class="cc-ico" style="background:#0098EA"><svg viewBox="0 0 32 32" width="22" height="22"><circle cx="16" cy="16" r="16" fill="#0098EA"/><path d="M16 7.5l9 5v9l-9 5-9-5v-9l9-5zm0 2.6L9.2 14v4.4l6.8 3.8 6.8-3.8V14L16 10.1zm0 3.1 3.8 2.2v3.4L16 21l-3.8-2.2v-3.4L16 13.2z" fill="white"/></svg></div><div class="cc-info"><div class="cc-name">USDT</div><div class="cc-net">TON · Telegram</div></div></div>
        <div class="cc-pill" data-coin="usdc.trc20" data-label="USDC TRC20" data-net="TRC20" onclick="cpPickCoin(this)"><div class="cc-ico" style="background:#2775CA"><svg viewBox="0 0 32 32" width="22" height="22"><circle cx="16" cy="16" r="16" fill="#2775CA"/><text x="16" y="21" text-anchor="middle" font-size="13" font-weight="900" fill="white" font-family="Arial">$</text></svg></div><div class="cc-info"><div class="cc-name">USDC</div><div class="cc-net">TRC20 · Tron</div></div></div>
        <div class="cc-pill" data-coin="usdc.bep20" data-label="USDC BEP20" data-net="BEP20" onclick="cpPickCoin(this)"><div class="cc-ico" style="background:#2775CA"><svg viewBox="0 0 32 32" width="22" height="22"><circle cx="16" cy="16" r="16" fill="#2775CA"/><text x="16" y="21" text-anchor="middle" font-size="13" font-weight="900" fill="white" font-family="Arial">$</text></svg></div><div class="cc-info"><div class="cc-name">USDC</div><div class="cc-net">BEP20 · BSC</div></div></div>
        <div class="cc-pill" data-coin="usdc.erc20" data-label="USDC ERC20" data-net="ERC20" onclick="cpPickCoin(this)"><div class="cc-ico" style="background:#2775CA"><svg viewBox="0 0 32 32" width="22" height="22"><circle cx="16" cy="16" r="16" fill="#2775CA"/><text x="16" y="21" text-anchor="middle" font-size="13" font-weight="900" fill="white" font-family="Arial">$</text></svg></div><div class="cc-info"><div class="cc-name">USDC</div><div class="cc-net">ERC20 · Ethereum</div></div></div>
      </div>
      <button class="btn-p" style="width:100%;margin:0 0 16px" id="cp-pay-btn" onclick="cpLancerPaiement()"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#000" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>Payer en <span id="cp-pay-lbl">USDT TRC20</span></button>
      <div style="font-size:11px;color:var(--text3);text-align:center;padding-bottom:16px;line-height:1.6">Montant crypto calculé en temps réel · izichangePay</div>
    </div>

    <!-- STEP 2 : Loading -->
    <div id="cp-step-loading" style="display:none;flex:1;flex-direction:column">
      <div class="crypto-loading"><div class="cl-spinner"></div><div class="cl-title">Génération de l'adresse...</div><div class="cl-sub">Connexion à izichangePay</div><div class="cl-badge" id="cp-loading-lbl">USDT TRC20</div></div>
    </div>

    <!-- STEP 3 : Adresse + QR -->
    <div id="cp-step-addr" style="display:none;flex:1;flex-direction:column;overflow:hidden">
      <div style="flex-shrink:0;padding:8px 14px;background:var(--s2);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
        <div style="display:flex;align-items:center;gap:8px"><div style="font-size:13px;font-weight:700;color:var(--text)" id="cp-addr-lbl">USDT TRC20</div><div class="cac-badge cac-badge-wait" id="cp-status-badge"><div class="rdot" style="width:6px;height:6px"></div>En attente</div></div>
        <button onclick="cpRetourChoix()" style="background:var(--s3);border:1px solid var(--border);color:var(--text2);padding:5px 12px;border-radius:20px;font-size:11px;font-weight:600;cursor:pointer;font-family:var(--font)">← Changer</button>
      </div>
      <div style="flex:1;overflow-y:auto">
        <div class="cac-amount-box"><div><div class="cam-lbl">Montant EXACT à envoyer</div><div class="cam-val" id="cp-crypto-amt">--</div></div><div style="text-align:right"><div class="cam-coin" id="cp-crypto-coin">USDT</div><div style="font-size:10px;color:rgba(245,176,20,.6);margin-top:2px" id="cp-crypto-net">TRC20</div></div></div>
        <div class="cac-qr"><div class="qr-box"><canvas id="cp-qr-canvas" width="160" height="160"></canvas></div><div class="cac-network-badge" id="cp-net-badge">TRC20</div><div class="addr-display" id="cp-addr-display">--</div></div>
        <div class="cac-actions"><button class="ca-btn gold" onclick="cpCopyAddr()"><svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>Copier</button><button class="ca-btn" onclick="cpShareAddr()"><svg viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>Partager</button></div>
        <div class="network-warn" id="cp-net-warn"><svg viewBox="0 0 24 24"><path d="m10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg><div>Envoyez <strong>uniquement <span id="cp-warn-coin">USDT TRC20</span></strong> à cette adresse. Tout autre réseau = perte définitive.</div></div>
        <div class="crypto-steps"><div class="cstep"><div class="cstep-num">1</div><div class="cstep-txt">Ouvrez votre wallet et envoyez exactement <strong id="cs-amt1">--</strong></div></div><div class="cstep"><div class="cstep-num">2</div><div class="cstep-txt">Attendez <strong>1–3 confirmations</strong> blockchain (1–5 min)</div></div><div class="cstep"><div class="cstep-num">3</div><div class="cstep-txt">ZAMA convertit et envoie les FCFA sur <strong id="cs-mm">Wave</strong></div></div></div>
        <div class="confirms-bar" id="cp-confirms-bar" style="display:none"><div class="conf-dots"><div class="conf-dot" id="cf0"></div><div class="conf-dot" id="cf1"></div><div class="conf-dot" id="cf2"></div></div><span id="cp-confirms-txt">Confirmations : 0/3</span></div>
        <div style="padding:14px 16px 6px"><button class="btn-p" style="width:100%;margin:0" id="cp-verify-btn" onclick="cpVerifyPayment()"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#000" stroke-width="2.5"><polyline points="1,4 1,10 7,10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg>J'ai envoyé — Vérifier</button></div>
        <div class="sec-badge" style="padding-bottom:20px"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>Sécurisé par izichangePay · ZAMA by PST Telecom</div>
      </div>
    </div>

    <!-- STEP 4 : Succès -->
    <div id="cp-step-success" style="display:none;flex:1;flex-direction:column;overflow-y:auto">
      <div class="crypto-success"><div class="cs-ico"><svg viewBox="0 0 24 24"><polyline points="20,6 9,17 4,12"/></svg></div><div class="cs-title">Paiement reçu !</div><div class="cs-sub">Conversion en cours...<br>Les FCFA arrivent sur <strong id="cs-mm-success">Wave</strong> sous 2 minutes</div><button class="btn-p" style="width:calc(100% - 32px);margin:10px 0 0" onclick="startTracking()"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#000" stroke-width="2.5"><polyline points="22,12 18,12 15,21 9,3 6,12 2,12"/></svg>Suivre le transfert</button><button onclick="goto('scr-home')" style="width:calc(100% - 32px);padding:13px;background:var(--s2);border:1px solid var(--border);color:var(--text2);border-radius:var(--rsm);font-size:14px;font-weight:600;cursor:pointer;font-family:var(--font);margin-top:8px">Retour à l'accueil</button></div>
    </div>

  </div><!-- fin panel-crypto -->"""

# Trouver et remplacer le panel-crypto existant
# Chercher depuis <!-- PANEL CRYPTO --> jusqu'au </div><!-- fin panel-crypto -->
pattern = r'<!-- PANEL CRYPTO -->.*?</div><!-- fin panel-crypto -->'
if re.search(pattern, html, re.DOTALL):
    html = re.sub(pattern, new_panel, html, flags=re.DOTALL)
    print("Panel crypto HTML remplace")
else:
    # Chercher juste le div id="panel-crypto"
    pattern2 = r'<!-- PANEL CRYPTO -->\s*<div id="panel-crypto"[^>]*>.*?(?=\n\s*<!-- TRACKING -->)'
    if re.search(pattern2, html, re.DOTALL):
        html = re.sub(pattern2, new_panel + '\n\n', html, flags=re.DOTALL)
        print("Panel crypto HTML remplace (pattern2)")
    else:
        print("ATTENTION: panel-crypto non trouve, insertion manuelle requise")

# ── 4. Remplacer les fonctions JS crypto ─────────────────────
new_js = """
// ── État crypto ──────────────────────────────────────────────────
var _cpCoin  = 'usdt.trc20';
var _cpLabel = 'USDT TRC20';
var _cpNet   = 'TRC20';
var _cpIziId = null;
var _cpAddr  = null;
var _cpAmt   = null;
var _cpCheckT = null;

function cpPickCoin(el) {
  document.querySelectorAll('#cp-coins .cc-pill').forEach(function(b) { b.classList.remove('on'); });
  el.classList.add('on');
  _cpCoin  = el.getAttribute('data-coin');
  _cpLabel = el.getAttribute('data-label');
  _cpNet   = el.getAttribute('data-net');
  var lbl = document.getElementById('cp-pay-lbl');
  if (lbl) lbl.textContent = _cpLabel;
}

async function cpLancerPaiement() {
  if (!orderId) { toast("Créez d'abord la commande", 'err'); return; }
  _cpShowStep('loading');
  var ll = document.getElementById('cp-loading-lbl');
  if (ll) ll.textContent = _cpLabel;
  var amt = parseFloat(document.getElementById('s-amt') ? document.getElementById('s-amt').value : 0) || 0;
  var rateV = rates[cK] || 606;
  var rateToUsd = cK === 'usd' ? 1 : (rates.usd / (rateV || 1));
  try {
    var res = await fetch(API + '/api/zama/crypto/create', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ coin_key: _cpCoin, amount: amt, src_currency: curr, rate_usd: rateToUsd, order_id: orderId,
        receiver_name: document.getElementById('r-name') ? document.getElementById('r-name').value.trim() : '',
        receiver_phone: document.getElementById('r-phone') ? document.getElementById('r-phone').value.trim() : '',
        receiver_mm: MM, sender_name: document.getElementById('s-name') ? document.getElementById('s-name').value.trim() : '',
        sender_email: document.getElementById('s-email') ? document.getElementById('s-email').value.trim() : '',
        net_fcfa: Math.round(amt * rateV * (1 - FEE)) })
    });
    var data = await res.json();
    if (!data.ok || !data.address) throw new Error(data.error || 'Adresse non générée');
    _cpIziId = data.izi_id; _cpAddr = data.address; _cpAmt = data.amount_crypto; _cpNet = data.network || _cpNet;
    _cpShowAddr();
  } catch (err) { _cpShowStep('choose'); toast('Erreur: ' + err.message, 'err'); }
}

function _cpShowAddr() {
  var _s = function(id, v) { var e = document.getElementById(id); if (e) e.textContent = v || '--'; };
  _s('cp-addr-lbl', _cpLabel); _s('cp-addr-display', _cpAddr); _s('cp-crypto-amt', _cpAmt);
  _s('cp-crypto-coin', _cpLabel.split(' ')[0]); _s('cp-crypto-net', _cpNet); _s('cp-net-badge', _cpNet);
  _s('cp-warn-coin', _cpLabel); _s('cs-amt1', (_cpAmt || '--') + ' ' + (_cpLabel.split(' ')[0] || ''));
  _s('cs-mm', MM === 'wave' ? 'Wave' : 'Orange Money'); _s('cs-mm-success', MM === 'wave' ? 'Wave' : 'Orange Money');
  var warn = document.getElementById('cp-net-warn');
  if (warn) warn.innerHTML = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="m10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg><div>Envoyez <strong>uniquement ' + _cpLabel + '</strong> à cette adresse. Tout autre réseau = perte définitive.</div>';
  cpDrawQR(_cpAddr);
  _cpShowStep('addr');
  if (_cpCheckT) clearInterval(_cpCheckT);
  _cpCheckT = setInterval(cpAutoCheck, 20000);
}

function cpDrawQR(text) {
  var cv = document.getElementById('cp-qr-canvas'); if (!cv) return;
  var parent = cv.parentNode; var existing = document.getElementById('cp-qr-img'); if (existing) existing.remove();
  var img = document.createElement('img'); img.id = 'cp-qr-img'; img.width = 160; img.height = 160;
  img.style.cssText = 'display:block;border-radius:4px';
  img.src = 'https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=' + encodeURIComponent(text) + '&color=070D1A&bgcolor=ffffff&format=png&margin=2';
  cv.style.display = 'none'; parent.appendChild(img);
}

function cpCopyAddr() { if (!_cpAddr) { toast('Adresse non disponible', 'err'); return; } navigator.clipboard.writeText(_cpAddr).then(function() { toast('Adresse copiée !', 'ok'); }); }
function cpShareAddr() { if (!_cpAddr) return; var text = 'Paiement ZAMA — ' + _cpLabel + '\\nMontant : ' + _cpAmt + ' ' + _cpLabel.split(' ')[0] + '\\nAdresse : ' + _cpAddr; if (navigator.share) navigator.share({ title: 'Paiement ZAMA', text: text }).catch(function(){}); else navigator.clipboard.writeText(text).then(function() { toast('Copié !', 'ok'); }); }

async function cpVerifyPayment() {
  if (!orderId) return;
  var btn = document.getElementById('cp-verify-btn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spin"></div> Vérification...'; }
  try {
    var res = await fetch(API + '/api/zama/crypto/status/' + orderId);
    var data = await res.json();
    _cpUpdateConfirms(data.confirmations || 0);
    if (data.status === 'paid') { _cpOnPaid(); return; }
    toast('Pas encore confirmé (' + (data.confirmations||0) + '/3 conf.)', 'info');
  } catch (e) { toast('Erreur: ' + e.message, 'err'); }
  if (btn) { btn.disabled = false; btn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#000" stroke-width="2.5"><polyline points="1,4 1,10 7,10"/><path d="M3.51 15a9 9 0 1 0 .49-3.5"/></svg> J\\'ai envoyé — Vérifier'; }
}

async function cpAutoCheck() {
  if (!orderId) return;
  try { var res = await fetch(API + '/api/zama/crypto/status/' + orderId); var data = await res.json(); _cpUpdateConfirms(data.confirmations||0); if (data.status === 'paid') { clearInterval(_cpCheckT); _cpOnPaid(); } } catch(e) {}
}

function _cpUpdateConfirms(n) {
  var bar = document.getElementById('cp-confirms-bar'); if (bar) bar.style.display = n > 0 ? 'flex' : 'none';
  var txt = document.getElementById('cp-confirms-txt'); if (txt) txt.textContent = 'Confirmations : ' + n + '/3';
  for (var i = 0; i < 3; i++) { var dot = document.getElementById('cf' + i); if (dot) dot.className = 'conf-dot' + (i < n ? ' on' : ''); }
}

function _cpOnPaid() {
  clearInterval(_cpCheckT); updateOrder(orderId, 'paid'); updateBalanceCard();
  var badge = document.getElementById('cp-status-badge');
  if (badge) { badge.className = 'cac-badge cac-badge-ok'; badge.innerHTML = '<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20,6 9,17 4,12"/></svg> Confirmé !'; }
  _cpShowStep('success');
  if (navigator.vibrate) navigator.vibrate([50, 30, 100]);
  showNotif('Paiement reçu ! \\uD83C\\uDF89', _cpLabel + ' · Conversion en cours', '\\u2705', '34,197,94');
}

function _cpShowStep(step) {
  var steps = { choose: 'cp-step-choose', loading: 'cp-step-loading', addr: 'cp-step-addr', success: 'cp-step-success' };
  Object.keys(steps).forEach(function(k) {
    var el = document.getElementById(steps[k]); if (!el) return;
    el.style.display = k === step ? (k === 'choose' ? 'block' : 'flex') : 'none';
    if (k === step && k !== 'choose') el.style.flexDirection = 'column';
  });
}

function cpRetourChoix() { if (_cpCheckT) clearInterval(_cpCheckT); _cpAddr = null; _cpAmt = null; _cpIziId = null; _cpShowStep('choose'); }

// Compatibilité avec switchTab()
function lancerPaiementCrypto() { cpLancerPaiement(); }
function showIframeLoading() { _cpShowStep('choose'); _cpAddr = null; _cpAmt = null; _cpIziId = null; }
function showIframe(url) { window._payUrl = url; }
function showFallback() { switchTab('crypto'); _cpShowStep('choose'); }
function retourChoix() { cpRetourChoix(); }
"""

# Chercher et remplacer les anciennes fonctions
old_pattern = r'// ── État crypto.*?function retourChoix\(\)[^\n]*\n[^\n]*\}'
if re.search(old_pattern, html, re.DOTALL):
    html = re.sub(old_pattern, new_js.strip(), html, flags=re.DOTALL)
    print("Fonctions JS crypto remplacees")
else:
    # Chercher juste lancerPaiementCrypto et remplacer jusqu'à showFallback
    old_pattern2 = r'var _coin\s*=.*?function showFallback\(\)\s*\{[^}]+\}'
    if re.search(old_pattern2, html, re.DOTALL):
        html = re.sub(old_pattern2, new_js.strip(), html, flags=re.DOTALL)
        print("Fonctions JS remplacees (pattern2)")
    else:
        # Ajouter avant le TOAST
        html = html.replace("// TOAST\nvar _toastT;", new_js.strip() + "\n\n// TOAST\nvar _toastT;")
        print("Fonctions JS ajoutees avant TOAST")

with open('zama.html', 'w', encoding='utf-8') as f:
    f.write(html)

new_len = len(html)
print(f"Termine! {original_len} -> {new_len} octets")
