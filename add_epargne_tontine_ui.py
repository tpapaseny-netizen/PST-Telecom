with open('zama.html', 'r', encoding='utf-8') as f:
    html = f.read()

# ── 1. Ajouter boutons Épargne + Tontine dans quick actions home ──
old_qa = """      <div class="qa" onclick="goto('scr-benefs')"><div class="qa-ico" style="background:var(--s3)"><svg viewBox="0 0 24 24" style="stroke:var(--text2)"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg></div><div class="qa-lbl">Contacts</div></div>"""

new_qa = """      <div class="qa" onclick="goto('scr-benefs')"><div class="qa-ico" style="background:var(--s3)"><svg viewBox="0 0 24 24" style="stroke:var(--text2)"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg></div><div class="qa-lbl">Contacts</div></div>"""

# Ajouter section Épargne + Tontine après les quick actions
epargne_tontine_section = """
    <!-- ÉPARGNE & TONTINE -->
    <div class="slbl">Services financiers</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:0 20px;margin-bottom:4px">
      <div onclick="goto('scr-epargne')" style="background:linear-gradient(135deg,#0F2A1F,#1A3D2B);border:1px solid rgba(34,197,94,.2);border-radius:16px;padding:18px 14px;cursor:pointer;transition:all .15s">
        <div style="width:40px;height:40px;border-radius:12px;background:var(--green-l);display:flex;align-items:center;justify-content:center;margin-bottom:10px">
          <svg viewBox="0 0 24 24" width="20" fill="none" stroke="var(--green)" stroke-width="2"><path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z"/><path d="M12 6v6l4 2"/></svg>
        </div>
        <div style="font-size:14px;font-weight:700;color:#fff;margin-bottom:3px">Épargne</div>
        <div style="font-size:11px;color:rgba(34,197,94,.7)">Économisez intelligemment</div>
      </div>
      <div onclick="goto('scr-tontine')" style="background:linear-gradient(135deg,#1A1A0F,#2A2A1A);border:1px solid rgba(245,176,20,.2);border-radius:16px;padding:18px 14px;cursor:pointer;transition:all .15s">
        <div style="width:40px;height:40px;border-radius:12px;background:var(--gold-l);display:flex;align-items:center;justify-content:center;margin-bottom:10px">
          <svg viewBox="0 0 24 24" width="20" fill="none" stroke="var(--gold)" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
        </div>
        <div style="font-size:14px;font-weight:700;color:#fff;margin-bottom:3px">Tontine</div>
        <div style="font-size:11px;color:rgba(245,176,20,.7)">Cotisez en groupe</div>
      </div>
    </div>"""

# Insérer après les quick actions (avant slbl Taux en direct)
if 'Services financiers' not in html:
    html = html.replace(
        '<div class="slbl">Taux en direct',
        epargne_tontine_section + '\n    <div class="slbl">Taux en direct'
    )
    print("OK - section Épargne+Tontine ajoutée dans home")

# ── 2. Ajouter écrans ──────────────────────────────────────────
SCREENS = """
<!-- ══ ÉPARGNE ══ -->
<div class="scr" id="scr-epargne">
  <div class="hdr">
    <button class="hbk" onclick="gb()"><svg viewBox="0 0 24 24"><polyline points="15,18 9,12 15,6"/></svg>Retour</button>
    <span class="htitle">Mon Épargne</span>
    <span class="hact" onclick="goto('scr-epargne-new')">+ Nouveau</span>
  </div>
  <div class="sb">
    <div style="background:linear-gradient(160deg,#080F1F,#0A1F14);padding:24px 20px">
      <div style="font-size:11px;color:rgba(34,197,94,.6);font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Total épargné</div>
      <div style="font-size:36px;font-weight:800;color:#fff" id="ep-total">0 FCFA</div>
      <div style="font-size:12px;color:rgba(255,255,255,.4);margin-top:4px">Tous vos plans d'épargne actifs</div>
    </div>
    <div id="ep-list" style="padding:14px 20px">
      <div class="empty-st"><svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z"/><path d="M12 6v6l4 2"/></svg><div class="et">Aucun plan d'épargne</div><div class="es">Créez votre premier plan et commencez à économiser</div></div>
    </div>
    <div style="padding:0 20px 20px">
      <button class="btn-p" onclick="goto('scr-epargne-new')">
        <svg viewBox="0 0 24 24" width="16" fill="none" stroke="#000" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Créer un plan d'épargne
      </button>
    </div>
  </div>
</div>

<!-- ══ NOUVEAU PLAN ÉPARGNE ══ -->
<div class="scr" id="scr-epargne-new">
  <div class="hdr">
    <button class="hbk" onclick="gb()"><svg viewBox="0 0 24 24"><polyline points="15,18 9,12 15,6"/></svg>Retour</button>
    <span class="htitle">Nouveau plan</span>
    <span></span>
  </div>
  <div class="sb">
    <div style="padding:20px">
      <div style="background:var(--green-l);border:1px solid rgba(34,197,94,.2);border-radius:12px;padding:14px;font-size:13px;color:var(--green);margin-bottom:20px;display:flex;gap:8px">
        <svg viewBox="0 0 24 24" width="16" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;margin-top:1px"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        <div>Votre épargne est sécurisée sur ZAMA. Vous pouvez retirer à tout moment.</div>
      </div>
      <div class="fg" style="padding:0;margin-bottom:12px"><label>Description de l'objectif *</label><input class="finp" type="text" id="ep-desc" placeholder="Ex: Achat téléphone, Loyer, Voyage..."></div>
      <div class="fg" style="padding:0;margin-bottom:12px"><label>Objectif (FCFA) *</label><input class="finp" type="number" id="ep-objectif" placeholder="Ex: 50000" inputmode="numeric"></div>
      <div class="fg" style="padding:0;margin-bottom:12px"><label>Durée (jours) *</label><input class="finp" type="number" id="ep-duree" placeholder="Ex: 90" inputmode="numeric"></div>
      <div class="fg" style="padding:0;margin-bottom:16px">
        <label>Mode de retrait</label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:6px">
          <div id="ep-mode-libre" onclick="selEpMode('libre')" style="padding:12px;border:2px solid var(--gold);background:var(--gold-l);border-radius:10px;cursor:pointer;text-align:center">
            <div style="font-size:13px;font-weight:700;color:var(--gold)">Libre</div>
            <div style="font-size:10px;color:var(--text3);margin-top:2px">Retirer quand tu veux</div>
          </div>
          <div id="ep-mode-bloque" onclick="selEpMode('bloque')" style="padding:12px;border:2px solid var(--border);background:var(--s2);border-radius:10px;cursor:pointer;text-align:center">
            <div style="font-size:13px;font-weight:700;color:var(--text2)">Bloqué</div>
            <div style="font-size:10px;color:var(--text3);margin-top:2px">Jusqu'à la date</div>
          </div>
        </div>
      </div>
      <button class="btn-p" style="width:100%;margin:0" onclick="creerEpargne()">
        <svg viewBox="0 0 24 24" width="16" fill="none" stroke="#000" stroke-width="2.5"><polyline points="20,6 9,17 4,12"/></svg>
        Créer mon plan d'épargne
      </button>
    </div>
  </div>
</div>

<!-- ══ TONTINE ══ -->
<div class="scr" id="scr-tontine">
  <div class="hdr">
    <button class="hbk" onclick="gb()"><svg viewBox="0 0 24 24"><polyline points="15,18 9,12 15,6"/></svg>Retour</button>
    <span class="htitle">Mes Tontines</span>
    <span class="hact" onclick="goto('scr-tontine-new')">+ Créer</span>
  </div>
  <div class="sb">
    <div style="background:linear-gradient(160deg,#080F1F,#1A150A);padding:24px 20px">
      <div style="font-size:11px;color:rgba(245,176,20,.6);font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">Tontines actives</div>
      <div style="font-size:36px;font-weight:800;color:#fff" id="ton-count">0</div>
      <div style="font-size:12px;color:rgba(255,255,255,.4);margin-top:4px">Groupes d'épargne en cours</div>
    </div>
    <div id="ton-list" style="padding:14px 20px">
      <div class="empty-st"><svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg><div class="et">Aucune tontine</div><div class="es">Créez une tontine et invitez vos proches</div></div>
    </div>
    <div style="padding:0 20px 20px">
      <button class="btn-p" onclick="goto('scr-tontine-new')">
        <svg viewBox="0 0 24 24" width="16" fill="none" stroke="#000" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Créer une tontine
      </button>
    </div>
  </div>
</div>

<!-- ══ NOUVELLE TONTINE ══ -->
<div class="scr" id="scr-tontine-new">
  <div class="hdr">
    <button class="hbk" onclick="gb()"><svg viewBox="0 0 24 24"><polyline points="15,18 9,12 15,6"/></svg>Retour</button>
    <span class="htitle">Nouvelle tontine</span>
    <span></span>
  </div>
  <div class="sb">
    <div style="padding:20px">
      <div style="background:var(--gold-l);border:1px solid var(--gold-m);border-radius:12px;padding:14px;font-size:13px;color:var(--gold);margin-bottom:20px;display:flex;gap:8px">
        <svg viewBox="0 0 24 24" width="16" fill="none" stroke="currentColor" stroke-width="2" style="flex-shrink:0;margin-top:1px"><path d="m10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        <div>L'ordre de bénéfice est tiré aléatoirement de façon sécurisée. Chacun reçoit son tour.</div>
      </div>
      <div class="fg" style="padding:0;margin-bottom:12px"><label>Nom de la tontine *</label><input class="finp" type="text" id="ton-nom" placeholder="Ex: Tontine famille Toure"></div>
      <div class="fg" style="padding:0;margin-bottom:12px"><label>Cotisation par membre (FCFA) *</label><input class="finp" type="number" id="ton-cotisation" placeholder="Ex: 10000" inputmode="numeric" oninput="calcPot()"></div>
      <div class="fg" style="padding:0;margin-bottom:12px">
        <label>Fréquence *</label>
        <select class="finp" id="ton-freq">
          <option value="hebdomadaire">Hebdomadaire (chaque semaine)</option>
          <option value="mensuel">Mensuel (chaque mois)</option>
        </select>
      </div>
      <div class="fg" style="padding:0;margin-bottom:8px"><label>Numéros des membres (un par ligne) *</label><textarea class="finp" id="ton-membres" rows="4" placeholder="+221771234567&#10;+221781234567&#10;+221701234567" style="resize:none"></textarea></div>
      <div id="ton-pot-preview" style="background:var(--s2);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:16px;display:none">
        <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px"><span style="color:var(--text2)">Nombre de membres</span><span id="ton-nb-membres" style="font-weight:600">--</span></div>
        <div style="display:flex;justify-content:space-between;font-size:13px"><span style="color:var(--text2)">Pot total par tour</span><span id="ton-pot-total" style="font-weight:700;color:var(--gold)">-- FCFA</span></div>
      </div>
      <button class="btn-p" style="width:100%;margin:0" onclick="creerTontine()">
        <svg viewBox="0 0 24 24" width="16" fill="none" stroke="#000" stroke-width="2.5"><polyline points="20,6 9,17 4,12"/></svg>
        Créer la tontine
      </button>
    </div>
  </div>
</div>
"""

# Insérer avant <!-- TRACKING -->
if 'scr-epargne' not in html:
    html = html.replace('<!-- TRACKING -->', SCREENS + '\n<!-- TRACKING -->')
    print("OK - écrans Épargne + Tontine ajoutés")

# ── 3. Ajouter JS ──────────────────────────────────────────────
JS = """
// ── ÉPARGNE ────────────────────────────────────────────────────
var _epMode = 'libre';

function selEpMode(mode) {
  _epMode = mode;
  var libre  = document.getElementById('ep-mode-libre');
  var bloque = document.getElementById('ep-mode-bloque');
  if(mode === 'libre') {
    libre.style.border  = '2px solid var(--gold)';
    libre.style.background = 'var(--gold-l)';
    libre.querySelector('div').style.color = 'var(--gold)';
    bloque.style.border = '2px solid var(--border)';
    bloque.style.background = 'var(--s2)';
    bloque.querySelector('div').style.color = 'var(--text2)';
  } else {
    bloque.style.border = '2px solid var(--gold)';
    bloque.style.background = 'var(--gold-l)';
    bloque.querySelector('div').style.color = 'var(--gold)';
    libre.style.border  = '2px solid var(--border)';
    libre.style.background = 'var(--s2)';
    libre.querySelector('div').style.color = 'var(--text2)';
  }
}

async function creerEpargne() {
  if(!user){toast('Connectez-vous d\'abord','err');goto('scr-login');return;}
  var desc = document.getElementById('ep-desc').value.trim();
  var obj  = parseInt(document.getElementById('ep-objectif').value);
  var dur  = parseInt(document.getElementById('ep-duree').value);
  if(!desc){toast('Entrez une description','err');return;}
  if(!obj||obj<500){toast('Objectif minimum 500 FCFA','err');return;}
  if(!dur||dur<1){toast('Durée minimum 1 jour','err');return;}
  try {
    var res = await fetch(API+'/api/zama/epargne/create',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({user_id:user.id,user_name:(user.prenom||'')+' '+(user.nom||''),user_phone:user.phone,
        objectif_fcfa:obj,duree_jours:dur,description:desc,retrait_libre:_epMode==='libre'})});
    var data = await res.json();
    if(data.ok){
      toast('Plan d\'épargne créé !','ok');
      document.getElementById('ep-desc').value='';
      document.getElementById('ep-objectif').value='';
      document.getElementById('ep-duree').value='';
      gb();
      loadEpargnes();
    } else {toast(data.error||'Erreur','err');}
  } catch(e){toast('Erreur: '+e.message,'err');}
}

async function loadEpargnes() {
  if(!user)return;
  try {
    var res = await fetch(API+'/api/zama/epargne/user/'+user.id);
    var list = await res.json();
    var el = document.getElementById('ep-list');
    var total = list.reduce(function(s,e){return s+(e.solde_fcfa||0);},0);
    var totEl = document.getElementById('ep-total');
    if(totEl) totEl.textContent = total.toLocaleString('fr-FR')+' FCFA';
    if(!el)return;
    if(!list.length){
      el.innerHTML='<div class="empty-st"><svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z"/><path d="M12 6v6l4 2"/></svg><div class="et">Aucun plan d\'épargne</div><div class="es">Créez votre premier plan</div></div>';
      return;
    }
    el.innerHTML = list.map(function(ep){
      var pct = ep.progression||0;
      var couleur = pct>=100?'var(--green)':'var(--gold)';
      var date_fin = new Date(ep.date_fin).toLocaleDateString('fr-FR',{day:'2-digit',month:'short',year:'numeric'});
      return '<div style="background:var(--s2);border:1px solid var(--border);border-radius:14px;padding:16px;margin-bottom:10px">'+
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">'+
        '<div><div style="font-size:14px;font-weight:700">'+ep.description+'</div>'+
        '<div style="font-size:11px;color:var(--text3);margin-top:2px">Objectif : '+ep.objectif_fcfa.toLocaleString('fr-FR')+' FCFA</div></div>'+
        '<div style="font-size:11px;padding:3px 8px;border-radius:100px;background:'+(ep.status==='actif'?'var(--green-l)':'var(--s3)')+';color:'+(ep.status==='actif'?'var(--green)':'var(--text3)')+'">'+ep.status+'</div></div>'+
        '<div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden;margin-bottom:8px">'+
        '<div style="height:100%;width:'+pct+'%;background:'+couleur+';border-radius:3px;transition:width .5s"></div></div>'+
        '<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text3);margin-bottom:12px">'+
        '<span style="color:'+couleur+';font-weight:700">'+ep.solde_fcfa.toLocaleString('fr-FR')+' FCFA</span>'+
        '<span>'+pct+'% · '+date_fin+'</span></div>'+
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">'+
        '<button onclick="deposerEpargne(\''+ep.epargne_id+'\')" style="padding:9px;border-radius:8px;border:1px solid var(--green);background:var(--green-l);color:var(--green);font-size:12px;font-weight:700;cursor:pointer;font-family:var(--font)">+ Déposer</button>'+
        '<button onclick="retirerEpargne(\''+ep.epargne_id+'\','+ep.retrait_libre+')" style="padding:9px;border-radius:8px;border:1px solid var(--border);background:var(--s3);color:var(--text2);font-size:12px;font-weight:700;cursor:pointer;font-family:var(--font)">Retirer</button>'+
        '</div></div>';
    }).join('');
  } catch(e){console.error(e);}
}

async function deposerEpargne(epargne_id) {
  var montant = prompt('Montant à déposer (FCFA):');
  if(!montant||isNaN(montant))return;
  var ref = prompt('Référence Wave (optionnel):');
  try {
    var res = await fetch(API+'/api/zama/epargne/'+epargne_id+'/depot',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({montant_fcfa:parseInt(montant),wave_ref:ref||null})});
    var data = await res.json();
    if(data.ok){toast(data.message||'Dépôt enregistré','ok');loadEpargnes();}
    else toast(data.error||'Erreur','err');
  } catch(e){toast('Erreur','err');}
}

async function retirerEpargne(epargne_id, retrait_libre) {
  var montant = prompt('Montant à retirer (FCFA) — laisser vide pour tout retirer:');
  try {
    var body = {phone:user?user.phone:''};
    if(montant&&!isNaN(montant)) body.montant_fcfa = parseInt(montant);
    var res = await fetch(API+'/api/zama/epargne/'+epargne_id+'/retrait',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    var data = await res.json();
    if(data.ok){toast(data.message||'Retrait enregistré','ok');loadEpargnes();}
    else toast(data.error||'Erreur','err');
  } catch(e){toast('Erreur','err');}
}

// ── TONTINE ────────────────────────────────────────────────────
function calcPot() {
  var cot = parseInt(document.getElementById('ton-cotisation').value)||0;
  var membres_txt = document.getElementById('ton-membres').value.trim();
  var membres = membres_txt ? membres_txt.split('\n').filter(function(m){return m.trim();}) : [];
  var nb = membres.length + 1;
  var preview = document.getElementById('ton-pot-preview');
  if(cot>0&&nb>1){
    preview.style.display='block';
    document.getElementById('ton-nb-membres').textContent = nb+' membres (vous inclus)';
    document.getElementById('ton-pot-total').textContent = (cot*nb).toLocaleString('fr-FR')+' FCFA';
  } else {
    preview.style.display='none';
  }
}

async function creerTontine() {
  if(!user){toast('Connectez-vous d\'abord','err');goto('scr-login');return;}
  var nom = document.getElementById('ton-nom').value.trim();
  var cot = parseInt(document.getElementById('ton-cotisation').value);
  var freq = document.getElementById('ton-freq').value;
  var membres_txt = document.getElementById('ton-membres').value.trim();
  var membres = membres_txt.split('\n').map(function(m){return m.trim();}).filter(function(m){return m;});
  if(!nom){toast('Entrez un nom pour la tontine','err');return;}
  if(!cot||cot<500){toast('Cotisation minimum 500 FCFA','err');return;}
  if(membres.length<1){toast('Ajoutez au moins 1 autre membre','err');return;}
  try {
    var res = await fetch(API+'/api/zama/tontine/create',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({createur_id:user.id,createur_name:(user.prenom||'')+' '+(user.nom||''),
        createur_phone:user.phone,nom,cotisation_fcfa:cot,frequence:freq,membres_phones:membres})});
    var data = await res.json();
    if(data.ok){
      toast('Tontine créée ! Pot : '+data.pot_total.toLocaleString('fr-FR')+' FCFA','ok');
      document.getElementById('ton-nom').value='';
      document.getElementById('ton-cotisation').value='';
      document.getElementById('ton-membres').value='';
      document.getElementById('ton-pot-preview').style.display='none';
      gb();
      loadTontines();
    } else toast(data.error||'Erreur','err');
  } catch(e){toast('Erreur: '+e.message,'err');}
}

async function loadTontines() {
  if(!user)return;
  try {
    var res = await fetch(API+'/api/zama/tontine/user/'+user.id);
    var list = await res.json();
    var el = document.getElementById('ton-list');
    var countEl = document.getElementById('ton-count');
    var actives = list.filter(function(t){return t.status==='actif';}).length;
    if(countEl) countEl.textContent = actives;
    if(!el)return;
    if(!list.length){
      el.innerHTML='<div class="empty-st"><svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg><div class="et">Aucune tontine</div><div class="es">Créez une tontine et invitez vos proches</div></div>';
      return;
    }
    el.innerHTML = list.map(function(ton){
      var payeurs = ton.cotisations.filter(function(c){return c.tour===ton.tour_actuel;}).length;
      var pct = ton.nb_membres>0?Math.round((payeurs/ton.nb_membres)*100):0;
      var prochaine = ton.prochaine_date?new Date(ton.prochaine_date).toLocaleDateString('fr-FR',{day:'2-digit',month:'short'}):'--';
      return '<div style="background:var(--s2);border:1px solid var(--border);border-radius:14px;padding:16px;margin-bottom:10px">'+
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">'+
        '<div><div style="font-size:14px;font-weight:700">'+ton.nom+'</div>'+
        '<div style="font-size:11px;color:var(--text3);margin-top:2px">'+ton.nb_membres+' membres · '+ton.cotisation_fcfa.toLocaleString('fr-FR')+' FCFA/tour</div></div>'+
        '<div style="font-size:11px;padding:3px 8px;border-radius:100px;background:'+(ton.status==='actif'?'var(--gold-l)':'var(--s3)')+';color:'+(ton.status==='actif'?'var(--gold)':'var(--text3)')+'">'+ton.status+'</div></div>'+
        '<div style="font-size:12px;color:var(--text2);margin-bottom:8px">Pot total : <strong style="color:var(--gold)">'+ton.pot_total.toLocaleString('fr-FR')+' FCFA</strong> · Tour '+(ton.tour_actuel+1)+'/'+ton.nb_membres+'</div>'+
        '<div style="height:5px;background:var(--border);border-radius:3px;overflow:hidden;margin-bottom:8px">'+
        '<div style="height:100%;width:'+pct+'%;background:var(--gold);border-radius:3px"></div></div>'+
        '<div style="font-size:11px;color:var(--text3);margin-bottom:12px">'+payeurs+'/'+ton.nb_membres+' ont cotisé · Prochaine date : '+prochaine+'</div>'+
        (ton.status==='actif'?'<button onclick="cotiserTontine(\''+ton.tontine_id+'\')" style="width:100%;padding:10px;border-radius:8px;border:none;background:linear-gradient(135deg,var(--gold),#FCD34D);color:#000;font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font)">💰 Cotiser maintenant</button>':'')+
        '</div>';
    }).join('');
  } catch(e){console.error(e);}
}

async function cotiserTontine(tontine_id) {
  if(!user){toast('Connectez-vous d\'abord','err');return;}
  var ref = prompt('Référence Wave pour votre cotisation:');
  if(ref===null)return;
  try {
    var res = await fetch(API+'/api/zama/tontine/'+tontine_id+'/cotiser',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({phone:user.phone,wave_ref:ref||null})});
    var data = await res.json();
    if(data.ok){
      if(data.pot_distribue){toast('🎉 Pot distribué à '+data.beneficiaire,'ok');}
      else toast('Cotisation enregistrée — '+data.restants+' membre(s) restants','ok');
      loadTontines();
    } else toast(data.error||'Erreur','err');
  } catch(e){toast('Erreur: '+e.message,'err');}
}
"""

# Insérer le JS avant // TOAST
if 'function creerEpargne' not in html:
    if '// TOAST' in html:
        html = html.replace('// TOAST', JS + '\n// TOAST')
    else:
        html = html.rsplit('</script>',1)
        html = html[0] + JS + '\n</script>' + html[1]
    print("OK - JS Épargne+Tontine ajouté")

# ── 4. Charger épargnes + tontines au goto ──────────────────────
if 'loadEpargnes()' not in html:
    html = html.replace(
        'if(id==="scr-admin")loadAdmStats();',
        'if(id==="scr-admin")loadAdmStats();\n  if(id==="scr-epargne")loadEpargnes();\n  if(id==="scr-tontine")loadTontines();'
    )
    print("OK - chargement auto ajouté")

# ── 5. Ajouter Épargne + Tontine dans menu Compte ───────────────
if 'scr-epargne' not in html or 'Mon Épargne' not in html:
    old_menu = '        <div class="ai" onclick="changePinFlow()">'
    new_menu = """        <div class="ai" onclick="goto('scr-epargne')"><div class="ai-ico" style="background:var(--green-l);color:var(--green)"><svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2z"/><path d="M12 6v6l4 2"/></svg></div><div class="ai-lbl">Mon Épargne</div><div class="ai-arr"><svg viewBox="0 0 24 24"><polyline points="9,18 15,12 9,6"/></svg></div></div>
        <div class="ai" onclick="goto('scr-tontine')"><div class="ai-ico" style="background:var(--gold-l);color:var(--gold)"><svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg></div><div class="ai-lbl">Mes Tontines</div><div class="ai-arr"><svg viewBox="0 0 24 24"><polyline points="9,18 15,12 9,6"/></svg></div></div>
        <div class="ai" onclick="changePinFlow()">"""
    if old_menu in html:
        html = html.replace(old_menu, new_menu)
        print("OK - menu Compte mis à jour")

with open('zama.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("\nzama.html mis à jour avec Épargne + Tontine !")
