with open('zama.html', 'r', encoding='utf-8') as f:
    html = f.read()

# 1. Ajouter modal dépôt/retrait dans le HTML avant </div></body>
modal_html = """
<!-- MODAL DÉPÔT ÉPARGNE -->
<div id="ep-depot-modal" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:999;align-items:flex-end;justify-content:center;max-width:430px;margin:0 auto">
  <div style="background:var(--s1);border-radius:24px 24px 0 0;padding:24px 20px 36px;width:100%;border-top:1px solid var(--border)">
    <div style="width:36px;height:4px;background:var(--border);border-radius:2px;margin:0 auto 20px"></div>
    <div style="font-size:18px;font-weight:700;margin-bottom:16px" id="ep-modal-title">Déposer</div>
    <div class="fg" style="padding:0;margin-bottom:12px">
      <label>Montant (FCFA) *</label>
      <input class="finp" type="number" id="ep-modal-montant" placeholder="Ex: 10000" inputmode="numeric">
    </div>
    <div class="fg" style="padding:0;margin-bottom:16px">
      <label>Référence Wave (optionnel)</label>
      <input class="finp" type="text" id="ep-modal-ref" placeholder="Ex: WAVE-XXXX">
    </div>
    <button class="btn-p" style="width:100%;margin:0 0 10px" id="ep-modal-btn" onclick="confirmerDepot()">Confirmer le dépôt</button>
    <button style="width:100%;padding:12px;background:var(--s3);border:1px solid var(--border);color:var(--text2);border-radius:var(--rsm);cursor:pointer;font-family:var(--font)" onclick="fermerEpModal()">Annuler</button>
  </div>
</div>
"""

# Insérer avant </div></body> ou avant le toast
if '<div class="toast"' in html:
    html = html.replace('<div class="toast"', modal_html + '\n<div class="toast"')
    print("OK - modal ajouté")

# 2. Remplacer deposerEpargne et retirerEpargne
old_dep = """async function deposerEpargne(i){
  var ep=window._epargnes?window._epargnes[i]:null;
  if(!ep)return;
  var montant=prompt('Montant a deposer (FCFA):');
  if(!montant||isNaN(montant))return;
  var ref=prompt('Reference Wave (optionnel):');
  try{
    var res=await fetch(API+'/api/zama/epargne/'+ep.epargne_id+'/depot',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({montant_fcfa:parseInt(montant),wave_ref:ref||null})});
    var data=await res.json();
    if(data.ok){toast(data.message||'Depot enregistre','ok');loadEpargnes();}
    else toast(data.error||'Erreur','err');
  }catch(e){toast('Erreur','err');}
}
async function retirerEpargne(i){
  var ep=window._epargnes?window._epargnes[i]:null;
  if(!ep)return;
  var montant=prompt('Montant a retirer (vide = tout):');
  try{
    var body={phone:user?user.phone:''};
    if(montant&&!isNaN(montant))body.montant_fcfa=parseInt(montant);
    var res=await fetch(API+'/api/zama/epargne/'+ep.epargne_id+'/retrait',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    var data=await res.json();
    if(data.ok){toast(data.message||'Retrait enregistre','ok');loadEpargnes();}
    else toast(data.error||'Erreur','err');
  }catch(e){toast('Erreur','err');}
}"""

new_dep = """var _epActionIdx = -1;
var _epAction = 'depot';

function deposerEpargne(i){
  _epActionIdx = i;
  _epAction = 'depot';
  var ep = window._epargnes ? window._epargnes[i] : null;
  if(!ep)return;
  var title = document.getElementById('ep-modal-title');
  var btn = document.getElementById('ep-modal-btn');
  var montant = document.getElementById('ep-modal-montant');
  var ref = document.getElementById('ep-modal-ref');
  if(title) title.textContent = 'Deposer dans : ' + ep.description;
  if(btn) btn.textContent = 'Confirmer le depot';
  if(montant) montant.value = '';
  if(ref) { ref.value = ''; ref.parentElement.style.display = 'block'; }
  var modal = document.getElementById('ep-depot-modal');
  if(modal){ modal.style.display = 'flex'; }
}

function retirerEpargne(i){
  _epActionIdx = i;
  _epAction = 'retrait';
  var ep = window._epargnes ? window._epargnes[i] : null;
  if(!ep)return;
  var title = document.getElementById('ep-modal-title');
  var btn = document.getElementById('ep-modal-btn');
  var montant = document.getElementById('ep-modal-montant');
  var ref = document.getElementById('ep-modal-ref');
  if(title) title.textContent = 'Retirer de : ' + ep.description + ' (solde: ' + ep.solde_fcfa.toLocaleString('fr-FR') + ' FCFA)';
  if(btn) { btn.textContent = 'Confirmer le retrait'; btn.onclick = confirmerRetrait; }
  if(montant) montant.value = '';
  if(ref) ref.parentElement.style.display = 'none';
  var modal = document.getElementById('ep-depot-modal');
  if(modal){ modal.style.display = 'flex'; }
}

function fermerEpModal(){
  var modal = document.getElementById('ep-depot-modal');
  if(modal) modal.style.display = 'none';
}

async function confirmerDepot(){
  var ep = window._epargnes ? window._epargnes[_epActionIdx] : null;
  if(!ep){ toast('Erreur','err'); return; }
  var montant = parseInt(document.getElementById('ep-modal-montant').value);
  var ref = document.getElementById('ep-modal-ref').value.trim();
  if(!montant || montant < 100){ toast('Montant minimum 100 FCFA','err'); return; }
  var btn = document.getElementById('ep-modal-btn');
  if(btn){ btn.disabled = true; btn.innerHTML = '<div class="spin"></div> Traitement...'; }
  try{
    var res = await fetch(API+'/api/zama/epargne/'+ep.epargne_id+'/depot',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({montant_fcfa:montant, wave_ref:ref||null})
    });
    var data = await res.json();
    if(data.ok){ toast(data.message||'Depot enregistre !','ok'); fermerEpModal(); loadEpargnes(); }
    else toast(data.error||'Erreur','err');
  }catch(e){ toast('Erreur: '+e.message,'err'); }
  if(btn){ btn.disabled = false; btn.innerHTML = 'Confirmer le depot'; }
}

async function confirmerRetrait(){
  var ep = window._epargnes ? window._epargnes[_epActionIdx] : null;
  if(!ep){ toast('Erreur','err'); return; }
  var montant = document.getElementById('ep-modal-montant').value;
  var btn = document.getElementById('ep-modal-btn');
  if(btn){ btn.disabled = true; btn.innerHTML = '<div class="spin"></div> Traitement...'; }
  try{
    var body = {phone: user ? user.phone : ''};
    if(montant && !isNaN(montant)) body.montant_fcfa = parseInt(montant);
    var res = await fetch(API+'/api/zama/epargne/'+ep.epargne_id+'/retrait',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify(body)
    });
    var data = await res.json();
    if(data.ok){ toast(data.message||'Retrait enregistre !','ok'); fermerEpModal(); loadEpargnes(); }
    else toast(data.error||'Erreur','err');
  }catch(e){ toast('Erreur: '+e.message,'err'); }
  if(btn){ btn.disabled = false; btn.innerHTML = 'Confirmer le retrait'; }
}"""

if old_dep in html:
    html = html.replace(old_dep, new_dep)
    print("OK - deposerEpargne et retirerEpargne remplacées")
else:
    # Chercher variante
    import re
    m = re.search(r'async function deposerEpargne\(i\)\{.*?async function cotiserTontine', html, re.DOTALL)
    if m:
        html = html[:m.start()] + new_dep + '\n' + html[m.end()-len('async function cotiserTontine'):]
        print("OK - remplacé via regex")
    else:
        print("WARN - pattern non trouvé, ajout à la fin")
        html = html.replace('// TOAST', new_dep + '\n// TOAST')

with open('zama.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("Terminé!")
