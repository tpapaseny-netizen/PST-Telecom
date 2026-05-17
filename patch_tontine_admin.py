# patch_tontine_admin.py
# Patch zama.html :
# 1. Modal cotisation : ajouter champ reference + appel /cotiser-demande
# 2. Panneau admin : ajouter sections cotisations + distributions tontine
# 3. JS : loadCotisationsPending, loadDistributionsPending, loadTousComptesTontine

import re

with open('zama.html', 'r', encoding='utf-8') as f:
    content = f.read()

# ─────────────────────────────────────────────────────────────────
# 1. Remplacer confirmerCotisation() pour passer par /cotiser-demande
# ─────────────────────────────────────────────────────────────────
OLD_CONFIRMER = """async function confirmerCotisation(){
  var ton = window._tontines ? window._tontines[_tonActiveIdx] : null;
  if(!ton || !user) return;
  var btn = document.getElementById('ton-modal-confirm-btn');
  if(btn){ btn.disabled = true; btn.innerHTML = '<div class="spin"></div> Enregistrement...'; }
  try{
    var res = await fetch(API+'/api/zama/tontine/'+ton.tontine_id+'/cotiser',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({phone: user.phone, wave_ref: _tonMethodePending || 'wave'})
    });
    var data = await res.json();
    if(data.ok){
      if(data.pot_distribue){
        toast('Pot distribue ! Virement en cours','ok');
      } else {
        toast('Cotisation enregistree !','ok');
      }
      fermerTonModal();
      await loadTontines();
      // Rafraichir le detail si ouvert
      if(_tonActiveIdx >= 0 && window._tontines && window._tontines[_tonActiveIdx]){
        ouvrirTontine(_tonActiveIdx);
      }
    } else toast(data.error || 'Erreur','err');
  }catch(e){ toast('Erreur: '+e.message,'err'); }
  if(btn){ btn.disabled = false; btn.innerHTML = "J ai paye - Confirmer ma cotisation"; }
}"""

NEW_CONFIRMER = """async function confirmerCotisation(){
  var ton = window._tontines ? window._tontines[_tonActiveIdx] : null;
  if(!ton || !user) return;
  var refEl = document.getElementById('ton-modal-ref');
  var ref = refEl ? refEl.value.trim() : '';
  if(!ref){ toast('Collez la reference de transaction Wave/OM', 'err'); if(refEl) refEl.focus(); return; }
  var btn = document.getElementById('ton-modal-confirm-btn');
  if(btn){ btn.disabled = true; btn.innerHTML = '<div class="spin"></div> Soumission...'; }
  try{
    var res = await fetch(API+'/api/zama/tontine/'+ton.tontine_id+'/cotiser-demande',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({phone: user.phone, methode: _tonMethodePending === 'wave' ? 'Wave' : 'Orange Money', reference: ref})
    });
    var data = await res.json();
    if(data.ok){
      toast('Cotisation soumise - Validation admin sous 1h max', 'ok');
      fermerTonModal();
      await loadTontines();
      if(_tonActiveIdx >= 0 && window._tontines && window._tontines[_tonActiveIdx]){
        ouvrirTontine(_tonActiveIdx);
      }
    } else toast(data.error || 'Erreur','err');
  }catch(e){ toast('Erreur reseau: '+e.message,'err'); }
  if(btn){ btn.disabled = false; btn.innerHTML = "Soumettre pour validation"; }
}"""

if OLD_CONFIRMER in content:
    content = content.replace(OLD_CONFIRMER, NEW_CONFIRMER)
    print('OK - confirmerCotisation() mis a jour')
else:
    # Essai partiel
    if 'cotiser-demande' not in content:
        content = content.replace(
            "J ai paye - Confirmer ma cotisation\"; }",
            "Soumettre pour validation\"; }"
        )
        print('WARN - confirmerCotisation() partiellement patche')
    else:
        print('INFO - confirmerCotisation() deja mis a jour')

# ─────────────────────────────────────────────────────────────────
# 2. Ajouter champ reference dans le modal cotisation tontine
# ─────────────────────────────────────────────────────────────────
OLD_MODAL_CONFIRM = """    <!-- Confirmation apres paiement -->
    <div id="ton-modal-confirm" style="display:none;background:rgba(245,176,20,.08);border:1px solid rgba(245,176,20,.2);border-radius:10px;padding:14px;text-align:center;margin-bottom:14px">
      <div style="font-size:13px;color:var(--gold);font-weight:600">Paiement effectue sur <span id="ton-modal-method">Wave</span> ?</div>
      <div style="font-size:11px;color:var(--text3);margin-top:4px">Confirmez pour enregistrer votre cotisation</div>
    </div>
    <button class="btn-p" id="ton-modal-confirm-btn" style="width:100%;margin:0 0 10px;display:none" onclick="confirmerCotisation()">
      J ai paye - Confirmer ma cotisation
    </button>"""

NEW_MODAL_CONFIRM = """    <!-- Confirmation apres paiement -->
    <div id="ton-modal-confirm" style="display:none;background:rgba(245,176,20,.08);border:1px solid rgba(245,176,20,.2);border-radius:10px;padding:14px;margin-bottom:14px">
      <div style="font-size:13px;color:var(--gold);font-weight:600;margin-bottom:8px">Paiement effectue sur <span id="ton-modal-method">Wave</span> ?</div>
      <div style="font-size:11px;color:var(--text3);margin-bottom:10px">Collez la reference de transaction recue par SMS</div>
      <input id="ton-modal-ref" type="text" placeholder="Ex: WAVE-TXN-XXXXXXXX ou OM-123456"
        style="width:100%;padding:10px 12px;border-radius:8px;border:1px solid rgba(245,176,20,.4);background:var(--s3);color:var(--text1);font-size:13px;font-family:var(--font);box-sizing:border-box;outline:none">
      <div style="font-size:10px;color:var(--text3);margin-top:6px">La reference apparait dans le SMS de confirmation Wave/OM</div>
    </div>
    <button class="btn-p" id="ton-modal-confirm-btn" style="width:100%;margin:0 0 10px;display:none" onclick="confirmerCotisation()">
      Soumettre pour validation admin
    </button>"""

if OLD_MODAL_CONFIRM in content:
    content = content.replace(OLD_MODAL_CONFIRM, NEW_MODAL_CONFIRM)
    print('OK - Champ reference ajoute dans modal cotisation')
elif 'ton-modal-ref' not in content:
    # Patch partiel sur le bouton
    content = content.replace(
        'J ai paye - Confirmer ma cotisation',
        'Soumettre pour validation admin'
    )
    print('WARN - Modal: seul le label bouton change (pattern complet non trouve)')
else:
    print('INFO - Champ reference deja present')

# ─────────────────────────────────────────────────────────────────
# 3. Ajouter sections tontine dans le panneau admin (apres comptes epargne)
# ─────────────────────────────────────────────────────────────────
TONTINE_ADMIN_HTML = """
      <!-- ══ TONTINE ADMIN ══ -->
      <div class="slbl" style="padding:0;margin-bottom:10px;margin-top:4px">Tontine \u2014 Cotisations \u00e0 valider</div>
      <div style="background:var(--s2);border:1px solid rgba(245,176,20,.25);border-radius:14px;padding:16px;margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <div style="font-size:13px;font-weight:700;color:var(--gold)">Cotisations en attente</div>
          <button onclick="loadCotisationsPending()" style="font-size:11px;color:var(--gold);background:none;border:1px solid rgba(245,176,20,.3);cursor:pointer;font-family:var(--font);padding:4px 10px;border-radius:6px">\u21bb</button>
        </div>
        <div id="admin-cotisations-list"><div style="font-size:12px;color:var(--text3);text-align:center;padding:16px">Cliquez \u21bb pour charger</div></div>
      </div>

      <div class="slbl" style="padding:0;margin-bottom:10px">Tontine \u2014 Distributions \u00e0 valider</div>
      <div style="background:var(--s2);border:1px solid rgba(34,197,94,.2);border-radius:14px;padding:16px;margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <div style="font-size:13px;font-weight:700;color:var(--green)">Distributions en attente</div>
          <button onclick="loadDistributionsPending()" style="font-size:11px;color:var(--green);background:none;border:1px solid rgba(34,197,94,.3);cursor:pointer;font-family:var(--font);padding:4px 10px;border-radius:6px">\u21bb</button>
        </div>
        <div id="admin-distributions-list"><div style="font-size:12px;color:var(--text3);text-align:center;padding:16px">Cliquez \u21bb pour charger</div></div>
      </div>

      <div class="slbl" style="padding:0;margin-bottom:10px">Tous les comptes tontine</div>
      <div style="background:var(--s2);border:1px solid var(--border);border-radius:14px;padding:16px;margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <div style="font-size:13px;font-weight:700">Comptes tontine</div>
          <button onclick="loadTousComptesTontine()" style="font-size:11px;color:var(--text2);background:none;border:1px solid var(--border);cursor:pointer;font-family:var(--font);padding:4px 10px;border-radius:6px">\u21bb</button>
        </div>
        <div id="admin-stats-tontine" style="display:flex;gap:12px;margin-bottom:12px">
          <div style="flex:1;background:var(--s3);border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:18px;font-weight:700;color:var(--gold)" id="adm-total-tontine">--</div>
            <div style="font-size:10px;color:var(--text3)">FCFA distribues</div>
          </div>
          <div style="flex:1;background:var(--s3);border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:18px;font-weight:700;color:var(--green)" id="adm-nb-tontines">--</div>
            <div style="font-size:10px;color:var(--text3)">Tontines actives</div>
          </div>
          <div style="flex:1;background:var(--s3);border-radius:8px;padding:10px;text-align:center">
            <div style="font-size:18px;font-weight:700;color:var(--blue)" id="adm-frais-tontine">--</div>
            <div style="font-size:10px;color:var(--text3)">FCFA revenus (1%)</div>
          </div>
        </div>
        <div id="admin-tontines-list"><div style="font-size:12px;color:var(--text3);text-align:center;padding:16px">Cliquez \u21bb pour charger</div></div>
      </div>

"""

# Injerer apres la section comptes epargne
TARGET_AFTER = '    <div id="adm-content" style="padding-bottom:32px"></div>\n  </div>\n</div>'
if TARGET_AFTER in content and 'admin-cotisations-list' not in content:
    content = content.replace(TARGET_AFTER, TONTINE_ADMIN_HTML + TARGET_AFTER)
    print('OK - Sections tontine admin ajoutees dans le panneau admin')
elif 'admin-cotisations-list' in content:
    print('INFO - Sections tontine admin deja presentes')
else:
    print('WARN - Pattern panneau admin non trouve, insertion manuelle necessaire')

# ─────────────────────────────────────────────────────────────────
# 4. Ajouter les fonctions JS pour les sections tontine admin
# ─────────────────────────────────────────────────────────────────
TONTINE_ADMIN_JS = """
// ─── TONTINE ADMIN ────────────────────────────────────────────────
async function loadCotisationsPending(){
  var el = document.getElementById('admin-cotisations-list');
  if(!el) return;
  el.innerHTML = '<div style="font-size:12px;color:var(--text3);text-align:center;padding:16px"><div class="spin" style="margin:0 auto 8px"></div>Chargement...</div>';
  try {
    var res = await fetch(API+'/api/zama/tontine/admin/cotisations-pending?token=pst-admin-2026');
    var data = await res.json();
    var list = data.cotisations || [];
    if(!list.length){ el.innerHTML = '<div style="font-size:12px;color:var(--text3);text-align:center;padding:16px">Aucune cotisation en attente</div>'; return; }
    var out = '';
    list.forEach(function(c){
      out += '<div style="background:var(--s3);border-radius:10px;padding:12px;margin-bottom:8px;border:1px solid rgba(245,176,20,.15)">' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:6px">' +
        '<div style="font-size:13px;font-weight:700;color:var(--gold)">' + (c.montant_fcfa||0).toLocaleString('fr-FR') + ' FCFA</div>' +
        '<div style="font-size:11px;color:var(--text3)">' + (c.methode||'Wave') + '</div></div>' +
        '<div style="font-size:12px;color:var(--text2);margin-bottom:2px">Tontine: ' + (c.tontine_nom||c.tontine_id) + '</div>' +
        '<div style="font-size:12px;color:var(--text3);margin-bottom:6px">Membre: ' + (c.phone||'--') + '</div>' +
        '<div style="font-size:11px;color:var(--gold);background:rgba(245,176,20,.08);border-radius:6px;padding:6px;margin-bottom:8px">Ref: ' + (c.reference||'non fournie') + '</div>' +
        '<div style="display:flex;gap:8px">' +
        '<a href="' + API + '/api/zama/tontine/admin/valider-cotisation/' + c.cotisation_id + '?token=pst-admin-2026" target="_blank" ' +
        'style="flex:1;padding:8px;border-radius:8px;background:#22c55e;color:#fff;text-align:center;text-decoration:none;font-size:12px;font-weight:700">Valider</a>' +
        '<a href="' + API + '/api/zama/tontine/admin/rejeter-cotisation/' + c.cotisation_id + '?token=pst-admin-2026" target="_blank" ' +
        'style="flex:1;padding:8px;border-radius:8px;background:#ef4444;color:#fff;text-align:center;text-decoration:none;font-size:12px;font-weight:700">Rejeter</a>' +
        '</div></div>';
    });
    el.innerHTML = out;
  } catch(e){ el.innerHTML = '<div style="font-size:12px;color:var(--red);text-align:center;padding:16px">Erreur: '+e.message+'</div>'; }
}

async function loadDistributionsPending(){
  var el = document.getElementById('admin-distributions-list');
  if(!el) return;
  el.innerHTML = '<div style="font-size:12px;color:var(--text3);text-align:center;padding:16px"><div class="spin" style="margin:0 auto 8px"></div>Chargement...</div>';
  try {
    var res = await fetch(API+'/api/zama/tontine/admin/distributions-pending?token=pst-admin-2026');
    var data = await res.json();
    var list = data.distributions || [];
    if(!list.length){ el.innerHTML = '<div style="font-size:12px;color:var(--text3);text-align:center;padding:16px">Aucune distribution en attente</div>'; return; }
    var out = '';
    list.forEach(function(d){
      out += '<div style="background:var(--s3);border-radius:10px;padding:12px;margin-bottom:8px;border:2px solid rgba(34,197,94,.3)">' +
        '<div style="font-size:14px;font-weight:800;color:var(--green);margin-bottom:6px">A VIRER: ' + (d.montant_net||0).toLocaleString('fr-FR') + ' FCFA</div>' +
        '<div style="font-size:12px;color:var(--text2);margin-bottom:2px">Tontine: ' + (d.tontine_nom||d.tontine_id) + '</div>' +
        '<div style="font-size:12px;color:var(--text3);margin-bottom:2px">Beneficiaire: ' + (d.beneficiaire_phone||'--') + '</div>' +
        '<div style="font-size:11px;color:var(--text3);margin-bottom:8px">Frais ZAMA (1%): ' + (d.montant_frais||0).toLocaleString('fr-FR') + ' FCFA</div>' +
        '<div style="font-size:11px;color:var(--green);margin-bottom:10px">Effectuez le virement Wave/OM puis cliquez Valider</div>' +
        '<div style="display:flex;gap:8px">' +
        '<a href="' + API + '/api/zama/tontine/admin/valider-distribution/' + d.distribution_id + '?token=pst-admin-2026" target="_blank" ' +
        'style="flex:1;padding:8px;border-radius:8px;background:#22c55e;color:#fff;text-align:center;text-decoration:none;font-size:12px;font-weight:700">Distribution effectuee</a>' +
        '<a href="' + API + '/api/zama/tontine/admin/rejeter-distribution/' + d.distribution_id + '?token=pst-admin-2026" target="_blank" ' +
        'style="flex:1;padding:8px;border-radius:8px;background:#ef4444;color:#fff;text-align:center;text-decoration:none;font-size:12px;font-weight:700">Annuler</a>' +
        '</div></div>';
    });
    el.innerHTML = out;
  } catch(e){ el.innerHTML = '<div style="font-size:12px;color:var(--red);text-align:center;padding:16px">Erreur: '+e.message+'</div>'; }
}

async function loadTousComptesTontine(){
  var el = document.getElementById('admin-tontines-list');
  if(!el) return;
  el.innerHTML = '<div style="font-size:12px;color:var(--text3);text-align:center;padding:16px"><div class="spin" style="margin:0 auto 8px"></div>Chargement...</div>';
  try {
    var res = await fetch(API+'/api/zama/tontine/admin/tous-comptes?token=pst-admin-2026');
    var data = await res.json();
    var s = data.stats || {};
    var el2 = document.getElementById('adm-total-tontine'); if(el2) el2.textContent = (s.total_distribue||0).toLocaleString('fr-FR');
    var el3 = document.getElementById('adm-nb-tontines'); if(el3) el3.textContent = s.nb_actives||0;
    var el4 = document.getElementById('adm-frais-tontine'); if(el4) el4.textContent = (s.total_frais||0).toLocaleString('fr-FR');
    var list = data.tontines || [];
    if(!list.length){ el.innerHTML = '<div style="font-size:12px;color:var(--text3);text-align:center;padding:16px">Aucune tontine</div>'; return; }
    var out = '';
    list.forEach(function(t){
      var membres_actifs = (t.membres||[]).filter(function(m){ return m.statut==='actif'; });
      var payes = membres_actifs.filter(function(m){ return m.a_paye; }).length;
      out += '<div style="background:var(--s3);border-radius:10px;padding:12px;margin-bottom:8px">' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:4px">' +
        '<div style="font-size:13px;font-weight:700">' + (t.nom||'--') + '</div>' +
        '<div style="font-size:10px;padding:2px 8px;border-radius:10px;background:'+(t.status==='actif'?'rgba(34,197,94,.15)':'rgba(100,116,139,.15)')+';color:'+(t.status==='actif'?'var(--green)':'var(--text3)')+'">'+t.status+'</div></div>' +
        '<div style="font-size:11px;color:var(--text3)">Cotisation: ' + (t.cotisation_fcfa||0).toLocaleString('fr-FR') + ' FCFA / ' + (t.frequence||'--') + '</div>' +
        '<div style="font-size:11px;color:var(--text3)">Membres: ' + membres_actifs.length + ' | Payes ce tour: ' + payes + '/' + membres_actifs.length + '</div>' +
        '<div style="font-size:11px;color:var(--gold)">Beneficiaire actuel: ' + (t.beneficiaire_actuel||'Termine') + '</div>' +
        '</div>';
    });
    el.innerHTML = out;
  } catch(e){ el.innerHTML = '<div style="font-size:12px;color:var(--red);text-align:center;padding:16px">Erreur: '+e.message+'</div>'; }
}
// ─── FIN TONTINE ADMIN ────────────────────────────────────────────
"""

# Injecter avant </script> final
if 'loadCotisationsPending' not in content:
    last_script = content.rfind('</script>')
    if last_script != -1:
        content = content[:last_script] + TONTINE_ADMIN_JS + '\n</script>' + content[last_script+9:]
        print('OK - Fonctions JS tontine admin ajoutees')
    else:
        print('WARN - Balise </script> non trouvee')
else:
    print('INFO - Fonctions JS tontine admin deja presentes')

# ─────────────────────────────────────────────────────────────────
# 5. Charger tontine admin quand on ouvre scr-admin
# ─────────────────────────────────────────────────────────────────
OLD_LOAD_ADMIN = 'if(id==="scr-admin"){loadAdmStats();loadDepotsPending();loadRetraitsPending();}'
NEW_LOAD_ADMIN = 'if(id==="scr-admin"){loadAdmStats();loadDepotsPending();loadRetraitsPending();loadCotisationsPending();loadDistributionsPending();}'

if OLD_LOAD_ADMIN in content:
    content = content.replace(OLD_LOAD_ADMIN, NEW_LOAD_ADMIN)
    print('OK - Chargement auto tontine admin au goto scr-admin')
elif NEW_LOAD_ADMIN in content:
    print('INFO - Chargement auto deja present')
else:
    print('WARN - Pattern goto scr-admin non trouve')

with open('zama.html', 'w', encoding='utf-8') as f:
    f.write(content)

print('')
print('=== PATCH TERMINE ===')
print('Verification syntaxe JS...')

import subprocess
result = subprocess.run(['node', '--check', 'zama.html'], capture_output=True, text=True)
if result.returncode == 0:
    print('ZERO ERREUR JS - Fichier propre')
else:
    print('ERREUR JS:', result.stderr[:300])
