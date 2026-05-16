with open('zama.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Remplacer le modal par un vrai flow Wave/OM
modal_html = """
<!-- MODAL DÉPÔT/RETRAIT ÉPARGNE -->
<div id="ep-depot-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:999;align-items:flex-end;justify-content:center;max-width:430px;margin:0 auto">
  <div style="background:var(--s1);border-radius:24px 24px 0 0;padding:24px 20px 36px;width:100%;border-top:1px solid var(--border)">
    <div style="width:36px;height:4px;background:var(--border);border-radius:2px;margin:0 auto 20px"></div>
    <div style="font-size:18px;font-weight:700;margin-bottom:4px" id="ep-modal-title">Dépôt épargne</div>
    <div style="font-size:13px;color:var(--text3);margin-bottom:20px" id="ep-modal-sub">Choisissez le montant</div>

    <div class="fg" style="padding:0;margin-bottom:16px">
      <label>Montant (FCFA) *</label>
      <input class="finp" type="number" id="ep-modal-montant" placeholder="Ex: 10000" inputmode="numeric">
    </div>

    <div style="font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px">Payer via</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px">
      <button onclick="payerEpargne('wave')" style="padding:14px;border-radius:12px;border:2px solid #1D9BF0;background:rgba(29,155,240,.1);color:#1D9BF0;font-size:14px;font-weight:700;cursor:pointer;font-family:var(--font);display:flex;align-items:center;justify-content:center;gap:8px">
        <svg viewBox="0 0 36 36" width="20"><circle cx="18" cy="18" r="18" fill="#1D9BF0"/><text x="18" y="23" text-anchor="middle" font-size="13" font-weight="900" fill="white" font-family="Arial">W</text></svg>
        Wave
      </button>
      <button onclick="payerEpargne('om')" style="padding:14px;border-radius:12px;border:2px solid #FF6600;background:rgba(255,102,0,.1);color:#FF6600;font-size:14px;font-weight:700;cursor:pointer;font-family:var(--font);display:flex;align-items:center;justify-content:center;gap:8px">
        <svg viewBox="0 0 36 36" width="20"><circle cx="18" cy="18" r="18" fill="#FF6600"/><circle cx="18" cy="18" r="8" stroke="white" stroke-width="2.5" fill="none"/><circle cx="18" cy="18" r="3" fill="white"/></svg>
        Orange Money
      </button>
    </div>

    <div id="ep-modal-confirm" style="display:none">
      <div style="background:var(--gold-l);border:1px solid var(--gold-m);border-radius:10px;padding:14px;font-size:13px;color:var(--gold);margin-bottom:14px;text-align:center">
        ✅ Paiement effectué ? Confirmez pour enregistrer votre dépôt.
      </div>
      <button class="btn-p" style="width:100%;margin:0 0 10px" onclick="confirmerDepotEpargne()">
        J'ai payé — Confirmer le dépôt
      </button>
    </div>

    <button style="width:100%;padding:12px;background:var(--s3);border:1px solid var(--border);color:var(--text2);border-radius:var(--rsm);cursor:pointer;font-family:var(--font)" onclick="fermerEpModal()">Annuler</button>
  </div>
</div>

<!-- MODAL RETRAIT ÉPARGNE -->
<div id="ep-retrait-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:999;align-items:flex-end;justify-content:center;max-width:430px;margin:0 auto">
  <div style="background:var(--s1);border-radius:24px 24px 0 0;padding:24px 20px 36px;width:100%;border-top:1px solid var(--border)">
    <div style="width:36px;height:4px;background:var(--border);border-radius:2px;margin:0 auto 20px"></div>
    <div style="font-size:18px;font-weight:700;margin-bottom:4px">Retrait épargne</div>
    <div style="font-size:13px;color:var(--text3);margin-bottom:20px" id="ep-retrait-sub">Vous recevrez sur votre Wave ou OM</div>

    <div class="fg" style="padding:0;margin-bottom:12px">
      <label>Montant à retirer (FCFA) *</label>
      <input class="finp" type="number" id="ep-retrait-montant" placeholder="Vide = tout retirer" inputmode="numeric">
    </div>
    <div class="fg" style="padding:0;margin-bottom:16px">
      <label>Votre numéro Wave/OM *</label>
      <input class="finp" type="tel" id="ep-retrait-phone" placeholder="+221 77 XXX XX XX" inputmode="tel">
    </div>

    <button class="btn-p" style="width:100%;margin:0 0 10px" onclick="confirmerRetraitEpargne()">
      <svg viewBox="0 0 24 24" width="16" fill="none" stroke="#000" stroke-width="2.5"><polyline points="20,6 9,17 4,12"/></svg>
      Demander le retrait
    </button>
    <button style="width:100%;padding:12px;background:var(--s3);border:1px solid var(--border);color:var(--text2);border-radius:var(--rsm);cursor:pointer;font-family:var(--font)" onclick="fermerRetraitModal()">Annuler</button>
  </div>
</div>
"""

# Insérer avant le toast
if 'ep-depot-modal' not in html:
    html = html.replace('<div class="toast"', modal_html + '\n<div class="toast"')
    print("OK - modals ajoutés")
else:
    # Remplacer l'ancien modal
    import re
    old_modal = re.search(r'<!-- MODAL DÉPÔT ÉPARGNE -->.*?</div>\n</div>', html, re.DOTALL)
    if old_modal:
        html = html[:old_modal.start()] + modal_html + html[old_modal.end():]
        print("OK - modal remplacé")

# Remplacer les fonctions JS
old_fns = """var _epActionIdx = -1;
var _epAction = 'depot';

function deposerEpargne(i){"""

new_fns = """var _epActionIdx = -1;

function deposerEpargne(i){
  _epActionIdx = i;
  var ep = window._epargnes ? window._epargnes[i] : null;
  if(!ep) return;
  var title = document.getElementById('ep-modal-title');
  var sub = document.getElementById('ep-modal-sub');
  var montant = document.getElementById('ep-modal-montant');
  var confirm = document.getElementById('ep-modal-confirm');
  if(title) title.textContent = ep.description;
  if(sub) sub.textContent = 'Solde actuel : ' + ep.solde_fcfa.toLocaleString('fr-FR') + ' FCFA';
  if(montant) montant.value = '';
  if(confirm) confirm.style.display = 'none';
  var modal = document.getElementById('ep-depot-modal');
  if(modal) modal.style.display = 'flex';
}

function payerEpargne(method){
  var montant = parseInt(document.getElementById('ep-modal-montant').value);
  if(!montant || montant < 100){ toast('Entrez un montant (min 100 FCFA)','err'); return; }
  var url = method === 'wave'
    ? 'https://pay.wave.com/m/M_rlEv9b4P3VtG/c/sn/?amount=' + montant
    : 'https://qosic.net/orange_money/index.php?montant=' + montant;
  window.open(url, '_blank');
  // Afficher bouton confirmation
  var confirm = document.getElementById('ep-modal-confirm');
  if(confirm) confirm.style.display = 'block';
  // Sauvegarder le montant pour la confirmation
  window._epMontantPending = montant;
  window._epMethodPending = method;
}

async function confirmerDepotEpargne(){
  var ep = window._epargnes ? window._epargnes[_epActionIdx] : null;
  if(!ep){ toast('Erreur','err'); return; }
  var montant = window._epMontantPending || parseInt(document.getElementById('ep-modal-montant').value);
  if(!montant){ toast('Montant invalide','err'); return; }
  var btn = event.target;
  btn.disabled = true;
  btn.innerHTML = '<div class="spin"></div> Enregistrement...';
  try{
    var res = await fetch(API+'/api/zama/epargne/'+ep.epargne_id+'/depot',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({montant_fcfa: montant, wave_ref: window._epMethodPending || 'wave'})
    });
    var data = await res.json();
    if(data.ok){
      toast(data.objectif_atteint ? 'Objectif atteint !' : 'Depot enregistre !', 'ok');
      fermerEpModal();
      loadEpargnes();
    } else toast(data.error || 'Erreur', 'err');
  }catch(e){ toast('Erreur: '+e.message,'err'); }
  btn.disabled = false;
  btn.innerHTML = "J'ai paye - Confirmer le depot";
}

function fermerEpModal(){
  var modal = document.getElementById('ep-depot-modal');
  if(modal) modal.style.display = 'none';
  window._epMontantPending = null;
  window._epMethodPending = null;
}

function retirerEpargne(i){
  _epActionIdx = i;
  var ep = window._epargnes ? window._epargnes[i] : null;
  if(!ep) return;
  var sub = document.getElementById('ep-retrait-sub');
  var phone = document.getElementById('ep-retrait-phone');
  var montant = document.getElementById('ep-retrait-montant');
  if(sub) sub.textContent = 'Solde disponible : ' + ep.solde_fcfa.toLocaleString('fr-FR') + ' FCFA';
  if(phone) phone.value = user ? user.phone || '' : '';
  if(montant) montant.value = '';
  var modal = document.getElementById('ep-retrait-modal');
  if(modal) modal.style.display = 'flex';
}

async function confirmerRetraitEpargne(){
  var ep = window._epargnes ? window._epargnes[_epActionIdx] : null;
  if(!ep){ toast('Erreur','err'); return; }
  var montant = document.getElementById('ep-retrait-montant').value;
  var phone = document.getElementById('ep-retrait-phone').value.trim();
  if(!phone){ toast('Entrez votre numéro','err'); return; }
  var btn = event.target;
  btn.disabled = true;
  btn.innerHTML = '<div class="spin"></div> Envoi...';
  try{
    var body = {phone: phone};
    if(montant && !isNaN(montant)) body.montant_fcfa = parseInt(montant);
    var res = await fetch(API+'/api/zama/epargne/'+ep.epargne_id+'/retrait',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(body)
    });
    var data = await res.json();
    if(data.ok){
      toast('Retrait demande ! Virement en cours...','ok');
      fermerRetraitModal();
      loadEpargnes();
    } else toast(data.error || 'Erreur','err');
  }catch(e){ toast('Erreur: '+e.message,'err'); }
  btn.disabled = false;
  btn.innerHTML = 'Demander le retrait';
}

function fermerRetraitModal(){
  var modal = document.getElementById('ep-retrait-modal');
  if(modal) modal.style.display = 'none';
}

function _old_deposerEpargne(i){"""

if old_fns in html:
    html = html.replace(old_fns, new_fns)
    print("OK - fonctions remplacées")
else:
    # Chercher et remplacer deposerEpargne existante
    import re
    m = re.search(r'function deposerEpargne\(i\)\{.*?function retirerEpargne\(i\)\{', html, re.DOTALL)
    if m:
        html = html[:m.start()] + new_fns + '\n' + html[m.start() + len(m.group(0)) - len('function retirerEpargne(i){'):]
        print("OK - remplacé via regex")
    else:
        # Juste ajouter avant // TOAST
        html = html.replace('// TOAST', new_fns + '\n// TOAST')
        print("OK - ajouté avant TOAST")

with open('zama.html', 'w', encoding='utf-8') as f:
    f.write(html)

# Valider
import re
scripts = re.findall(r'<script[^>]*>(.*?)</script>', html, re.DOTALL)
js = scripts[0]
with open('/tmp/testep.js', 'w', encoding='utf-8') as f:
    f.write(js)

print("\nTerminé!")
