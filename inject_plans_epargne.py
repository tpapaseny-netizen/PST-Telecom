#!/usr/bin/env python3
# inject_plans_epargne.py
# Ajoute les 3 plans épargne avec taux d'intérêt dans server-at.js + zama.html

# ══════════════════════════════════════════════════════════════════
# 1. BACKEND — server-at.js
# ══════════════════════════════════════════════════════════════════

BACKEND_ROUTES = r"""
// ══════════════════════════════════════════════════════════════════
// ZAMA ÉPARGNE — Plans avec intérêts (Libre, 3m, 6m, 1an)
// ══════════════════════════════════════════════════════════════════

// Plans disponibles
const ZAMA_PLANS = {
  libre:    { nom: 'Libre',    taux_annuel: 0,    duree_jours: 0,   frais_retrait: 0.01, frais_anticipe: 0.01 },
  trois_mois: { nom: '3 Mois', taux_annuel: 0.01,  duree_jours: 90,  frais_retrait: 0.005, frais_anticipe: 0.02 },
  six_mois:   { nom: '6 Mois', taux_annuel: 0.025, duree_jours: 180, frais_retrait: 0.005, frais_anticipe: 0.03 },
  un_an:      { nom: '1 An',   taux_annuel: 0.05,  duree_jours: 365, frais_retrait: 0.005, frais_anticipe: 0.04 },
};

// Créer un plan épargne avec type
app.post('/api/zama/epargne/plan/create', async (req, res) => {
  try {
    const { user_id, user_name, user_phone, objectif_fcfa, description, plan_type, password } = req.body;
    if (!user_id || !objectif_fcfa || !plan_type) {
      return res.status(400).json({ error: 'user_id, objectif_fcfa, plan_type requis' });
    }
    const plan = ZAMA_PLANS[plan_type];
    if (!plan) return res.status(400).json({ error: 'Plan invalide. Choisissez: libre, trois_mois, six_mois, un_an' });
    if (!db) return res.status(503).json({ error: 'DB indisponible' });

    // Vérifier KYC si objectif > 100 000 FCFA
    if (parseInt(objectif_fcfa) > 100000) {
      const u = await db.collection('zama_users').findOne({ id: user_id });
      if (!u || !u.kyc || u.kyc_pending) {
        return res.status(403).json({ error: 'KYC requis pour un objectif > 100 000 FCFA' });
      }
    }

    const epargne_id = 'EP-' + Date.now();
    const date_debut = new Date();
    const date_fin = plan.duree_jours > 0
      ? new Date(Date.now() + plan.duree_jours * 24 * 60 * 60 * 1000)
      : null;

    const epargne = {
      epargne_id,
      user_id,
      user_name: user_name || '',
      user_phone: user_phone || '',
      objectif_fcfa: parseInt(objectif_fcfa),
      solde_fcfa: 0,
      interets_cumules: 0,
      plan_type,
      plan_nom: plan.nom,
      taux_annuel: plan.taux_annuel,
      taux_mensuel: parseFloat((plan.taux_annuel / 12).toFixed(6)),
      description: description || 'Mon épargne ZAMA',
      retrait_libre: plan_type === 'libre',
      frais_retrait: plan.frais_retrait,
      frais_anticipe: plan.frais_anticipe,
      password: password || null,
      status: 'actif',
      progression: 0,
      date_debut,
      date_fin,
      date_prochain_interet: new Date(date_debut.getFullYear(), date_debut.getMonth() + 1, date_debut.getDate()),
      transactions: [],
      historique_interets: [],
      created_at: new Date(),
    };

    await db.collection('zama_epargnes').insertOne(epargne);

    // SMS de bienvenue
    if (user_phone) {
      const taux_str = plan.taux_annuel > 0 ? ' - Taux ' + (plan.taux_annuel * 100).toFixed(1) + '%/an' : '';
      await zamaSendSMS(user_phone,
        'ZAMA Epargne: Plan "' + plan.nom + '" cree' + taux_str + '. Objectif: ' +
        parseInt(objectif_fcfa).toLocaleString('fr-FR') + ' FCFA. Commencez a deposer!'
      );
    }

    res.json({ ok: true, epargne_id, date_fin, plan, message: 'Plan ' + plan.nom + ' créé avec succès' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Appliquer les intérêts mensuels sur tous les plans actifs (cron ou admin)
app.post('/api/zama/epargne/admin/appliquer-interets-plans', async (req, res) => {
  try {
    const token = req.query.token || req.body.token;
    if (token !== 'pst-admin-2026') return res.status(403).json({ error: 'Non autorisé' });
    if (!db) return res.status(503).json({ error: 'DB indisponible' });

    const maintenant = new Date();
    // Trouver tous les plans avec intérêts dont la date d'intérêt est passée
    const epargnes = await db.collection('zama_epargnes').find({
      status: 'actif',
      taux_annuel: { $gt: 0 },
      solde_fcfa: { $gt: 0 },
      date_prochain_interet: { $lte: maintenant }
    }).toArray();

    let traites = 0;
    let total_interets = 0;

    for (const ep of epargnes) {
      const interet = Math.round(ep.solde_fcfa * ep.taux_mensuel);
      if (interet < 1) continue;

      const prochaine_date = new Date(ep.date_prochain_interet);
      prochaine_date.setMonth(prochaine_date.getMonth() + 1);

      await db.collection('zama_epargnes').updateOne(
        { epargne_id: ep.epargne_id },
        {
          $inc: { solde_fcfa: interet, interets_cumules: interet },
          $set: { date_prochain_interet: prochaine_date },
          $push: {
            historique_interets: {
              date: maintenant,
              montant: interet,
              solde_avant: ep.solde_fcfa,
              taux: ep.taux_mensuel
            }
          }
        }
      );

      // SMS notification
      if (ep.user_phone) {
        await zamaSendSMS(ep.user_phone,
          'ZAMA Epargne "' + ep.description + '": ' + interet.toLocaleString('fr-FR') +
          ' FCFA d\'interets credites! Nouveau solde: ' +
          (ep.solde_fcfa + interet).toLocaleString('fr-FR') + ' FCFA.'
        );
      }

      traites++;
      total_interets += interet;
    }

    res.json({ ok: true, traites, total_interets, message: traites + ' plans mis à jour' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Stats publiques des plans (pour affichage frontend)
app.get('/api/zama/epargne/plans', (req, res) => {
  res.json({ plans: ZAMA_PLANS });
});

"""

# ══════════════════════════════════════════════════════════════════
# 2. FRONTEND — zama.html
# ══════════════════════════════════════════════════════════════════

# Nouveau formulaire scr-epargne-new avec sélection de plan
NEW_FORM_HTML = '''<div class="scr" id="scr-epargne-new">
  <div class="hdr">
    <button class="hbk" onclick="gb()"><svg viewBox="0 0 24 24"><polyline points="15,18 9,12 15,6"/></svg>Retour</button>
    <span class="htitle">Nouveau plan</span>
    <span></span>
  </div>
  <div class="sb">
    <div style="padding:20px">

      <!-- Choisir le plan -->
      <div class="slbl" style="padding:0;margin-bottom:12px">Choisissez votre plan</div>
      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px" id="ep-plans-grid">

        <!-- Plan Libre -->
        <div class="ep-plan-card on" id="ep-plan-libre" onclick="selEpPlan('libre')" style="border:2px solid var(--gold);background:var(--gold-l);border-radius:14px;padding:14px 16px;cursor:pointer;transition:all .15s">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <div style="font-size:15px;font-weight:800;color:var(--gold)">Libre</div>
              <div style="font-size:11px;color:var(--text3);margin-top:2px">Retrait à tout moment</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:22px;font-weight:800;color:var(--gold)">0%</div>
              <div style="font-size:10px;color:var(--text3)">Frais retrait 1%</div>
            </div>
          </div>
        </div>

        <!-- Plan 3 Mois -->
        <div class="ep-plan-card" id="ep-plan-trois_mois" onclick="selEpPlan('trois_mois')" style="border:2px solid var(--border);background:var(--s2);border-radius:14px;padding:14px 16px;cursor:pointer;transition:all .15s">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <div style="font-size:15px;font-weight:800;color:var(--text1)">3 Mois</div>
              <div style="font-size:11px;color:var(--text3);margin-top:2px">Bloqué 90 jours · Retrait anticipé 2%</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:22px;font-weight:800;color:var(--green)">1%</div>
              <div style="font-size:10px;color:var(--text3)">par an · 0.08%/mois</div>
            </div>
          </div>
          <div style="margin-top:8px;padding:6px 10px;background:rgba(34,197,94,.08);border-radius:8px;font-size:11px;color:var(--green)">
            Ex: 100 000 FCFA → +1 000 FCFA après 3 mois
          </div>
        </div>

        <!-- Plan 6 Mois -->
        <div class="ep-plan-card" id="ep-plan-six_mois" onclick="selEpPlan('six_mois')" style="border:2px solid var(--border);background:var(--s2);border-radius:14px;padding:14px 16px;cursor:pointer;transition:all .15s">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <div style="font-size:15px;font-weight:800;color:var(--text1)">6 Mois ⭐</div>
              <div style="font-size:11px;color:var(--text3);margin-top:2px">Bloqué 180 jours · Retrait anticipé 3%</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:22px;font-weight:800;color:var(--green)">2.5%</div>
              <div style="font-size:10px;color:var(--text3)">par an · 0.21%/mois</div>
            </div>
          </div>
          <div style="margin-top:8px;padding:6px 10px;background:rgba(34,197,94,.08);border-radius:8px;font-size:11px;color:var(--green)">
            Ex: 100 000 FCFA → +2 500 FCFA après 6 mois
          </div>
        </div>

        <!-- Plan 1 An -->
        <div class="ep-plan-card" id="ep-plan-un_an" onclick="selEpPlan('un_an')" style="border:2px solid var(--border);background:var(--s2);border-radius:14px;padding:14px 16px;cursor:pointer;transition:all .15s">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <div style="font-size:15px;font-weight:800;color:var(--text1)">1 An 🏆</div>
              <div style="font-size:11px;color:var(--text3);margin-top:2px">Bloqué 365 jours · Retrait anticipé 4%</div>
            </div>
            <div style="text-align:right">
              <div style="font-size:22px;font-weight:800;color:var(--green)">5%</div>
              <div style="font-size:10px;color:var(--text3)">par an · 0.42%/mois</div>
            </div>
          </div>
          <div style="margin-top:8px;padding:6px 10px;background:rgba(34,197,94,.08);border-radius:8px;font-size:11px;color:var(--green)">
            Ex: 100 000 FCFA → +5 000 FCFA après 1 an
          </div>
        </div>

      </div>

      <!-- Formulaire -->
      <div class="fg" style="padding:0;margin-bottom:12px">
        <label>Description *</label>
        <input class="finp" type="text" id="ep-desc" placeholder="Ex: Achat telephone, Tabaski, Voyage...">
      </div>
      <div class="fg" style="padding:0;margin-bottom:12px">
        <label>Objectif (FCFA) *</label>
        <input class="finp" type="number" id="ep-objectif" placeholder="Ex: 50000" inputmode="numeric">
      </div>
      <!-- Estimation intérêts -->
      <div id="ep-estimation" style="display:none;background:rgba(34,197,94,.08);border:1px solid rgba(34,197,94,.2);border-radius:10px;padding:12px;margin-bottom:14px">
        <div style="font-size:12px;color:var(--green);font-weight:600;margin-bottom:4px">📈 Estimation de gains</div>
        <div id="ep-estim-txt" style="font-size:12px;color:var(--text2)"></div>
      </div>
      <div class="fg" style="padding:0;margin-bottom:16px">
        <label>Mot de passe de protection (optionnel)</label>
        <input class="finp" type="password" id="ep-password" placeholder="Ex: 1234 ou un mot secret">
        <div style="font-size:11px;color:var(--text3);margin-top:4px">Le retrait nécessitera ce mot de passe</div>
      </div>
      <button class="btn-p" style="width:100%;margin:0" onclick="creerEpargnePlan()">
        <svg viewBox="0 0 24 24" width="16" fill="none" stroke="#000" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        Créer mon plan épargne
      </button>

    </div>
  </div>
</div>'''

# JS pour les plans
NEW_JS = """
// ── ÉPARGNE PLANS ────────────────────────────────────────────────
var _epPlan = 'libre';

function selEpPlan(plan) {
  _epPlan = plan;
  document.querySelectorAll('.ep-plan-card').forEach(function(c) {
    c.style.border = '2px solid var(--border)';
    c.style.background = 'var(--s2)';
    var title = c.querySelector('div > div > div');
    if (title) title.style.color = 'var(--text1)';
  });
  var sel = document.getElementById('ep-plan-' + plan);
  if (sel) {
    sel.style.border = '2px solid var(--gold)';
    sel.style.background = 'var(--gold-l)';
    var t = sel.querySelector('div > div > div');
    if (t) t.style.color = 'var(--gold)';
  }
  updateEpEstimation();
}

function updateEpEstimation() {
  var obj = parseInt(document.getElementById('ep-objectif') ? document.getElementById('ep-objectif').value : 0) || 0;
  var estEl = document.getElementById('ep-estimation');
  var estTxt = document.getElementById('ep-estim-txt');
  var taux = { libre: 0, trois_mois: 0.01, six_mois: 0.025, un_an: 0.05 };
  var duree = { libre: 0, trois_mois: 3, six_mois: 6, un_an: 12 };
  var t = taux[_epPlan] || 0;
  var d = duree[_epPlan] || 0;
  if (!estEl || !estTxt) return;
  if (t === 0 || obj < 500) { estEl.style.display = 'none'; return; }
  var gains = Math.round(obj * t * d / 12);
  var total = obj + gains;
  estEl.style.display = 'block';
  estTxt.innerHTML = 'Sur ' + d + ' mois : <strong style="color:var(--green)">+' +
    gains.toLocaleString('fr-FR') + ' FCFA</strong> d\'intérêts → Total : <strong>' +
    total.toLocaleString('fr-FR') + ' FCFA</strong>';
}

async function creerEpargnePlan() {
  if (!user) { toast('Connectez-vous', 'err'); goto('scr-login'); return; }
  var desc = document.getElementById('ep-desc') ? document.getElementById('ep-desc').value.trim() : '';
  var obj  = parseInt(document.getElementById('ep-objectif') ? document.getElementById('ep-objectif').value : 0);
  var pwd  = document.getElementById('ep-password') ? document.getElementById('ep-password').value : '';
  if (!desc) { toast('Entrez une description', 'err'); return; }
  if (!obj || obj < 500) { toast('Objectif minimum 500 FCFA', 'err'); return; }
  var btn = document.querySelector('#scr-epargne-new .btn-p');
  if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spin"></div> Création...'; }
  try {
    var res = await fetch(API + '/api/zama/epargne/plan/create', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: user.id,
        user_name: (user.prenom || '') + ' ' + (user.nom || ''),
        user_phone: user.phone,
        objectif_fcfa: obj,
        description: desc,
        plan_type: _epPlan,
        password: pwd || null
      })
    });
    var data = await res.json();
    if (data.ok) {
      toast('Plan ' + (data.plan ? data.plan.nom : '') + ' créé !', 'ok');
      document.getElementById('ep-desc').value = '';
      document.getElementById('ep-objectif').value = '';
      document.getElementById('ep-password').value = '';
      document.getElementById('ep-estimation').style.display = 'none';
      _epPlan = 'libre';
      selEpPlan('libre');
      gb();
      loadEpargnes();
    } else {
      toast(data.error || 'Erreur', 'err');
    }
  } catch(e) { toast('Erreur: ' + e.message, 'err'); }
  if (btn) { btn.disabled = false; btn.innerHTML = '<svg viewBox="0 0 24 24" width="16" fill="none" stroke="#000" stroke-width="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg> Créer mon plan épargne'; }
}
// ─────────────────────────────────────────────────────────────────
"""

# ══════════════════════════════════════════════════════════════════
# INJECTION
# ══════════════════════════════════════════════════════════════════

import re, subprocess

# ── Backend ──
with open('/home/claude/server-at.js', 'r', encoding='utf-8') as f:
    srv = f.read()

TARGET = '// \u2500\u2500\u2500 D\u00c9MARRAGE'
if '/api/zama/epargne/plan/create' not in srv and TARGET in srv:
    srv = srv.replace(TARGET, BACKEND_ROUTES + TARGET)
    print('OK - Routes plans épargne injectées dans server-at.js')
elif '/api/zama/epargne/plan/create' in srv:
    print('INFO - Routes plans déjà présentes')
else:
    print('WARN - DÉMARRAGE non trouvé dans server-at.js')

result = subprocess.run(['node', '--check', '/home/claude/server-at.js'], capture_output=True, text=True)
if result.returncode == 0:
    print('OK - server-at.js syntaxe valide')
else:
    print('ERREUR server-at.js:', result.stderr[:200])

with open('/home/claude/server-at.js', 'w', encoding='utf-8') as f:
    f.write(srv)

# ── Frontend ──
with open('/home/claude/zama.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Remplacer le formulaire scr-epargne-new
OLD_FORM_START = '<div class="scr" id="scr-epargne-new">'
OLD_FORM_END = '<!-- \u2550\u2550 TONTINE \u2550\u2550 -->'

if OLD_FORM_START in html and OLD_FORM_END in html:
    idx_start = html.index(OLD_FORM_START)
    idx_end = html.index(OLD_FORM_END)
    html = html[:idx_start] + NEW_FORM_HTML + '\n\n' + html[idx_end:]
    print('OK - Formulaire épargne remplacé')
else:
    print('WARN - Formulaire non trouvé')

# Ajouter listener sur ep-objectif pour l'estimation
html = html.replace(
    'id="ep-objectif" placeholder="Ex: 50000" inputmode="numeric">',
    'id="ep-objectif" placeholder="Ex: 50000" inputmode="numeric" oninput="updateEpEstimation()">'
)

# Ajouter aussi affichage du plan + taux dans la liste épargne
OLD_EP_LINE = 'out += "<div style=\'font-size:11px;color:rgba(34,197,94,.7);margin-bottom:8px\'>+ 2% interets/mois appliques auto</div>";'
NEW_EP_LINE = '''out += "<div style='display:flex;gap:8px;align-items:center;margin-bottom:8px'>" +
        "<span style='font-size:10px;padding:3px 8px;border-radius:20px;background:rgba(34,197,94,.12);color:var(--green);font-weight:700'>" +
        (ep.plan_nom || 'Libre') + "</span>" +
        (ep.taux_annuel > 0 ? "<span style='font-size:10px;color:var(--green)'>↗ " + (ep.taux_annuel*100).toFixed(1) + "%/an · " + ((ep.interets_cumules||0)).toLocaleString('fr-FR') + " FCFA gagnés</span>" : "<span style='font-size:10px;color:var(--text3)'>Retrait libre · 1% de frais</span>") +
        "</div>";'''

if OLD_EP_LINE in html:
    html = html.replace(OLD_EP_LINE, NEW_EP_LINE)
    print('OK - Affichage plan dans liste épargne')
else:
    print('WARN - Ligne interets non trouvée dans liste')

# Injecter le JS avant </script> final
if 'function selEpPlan' not in html:
    last_script = html.rfind('</script>')
    html = html[:last_script] + NEW_JS + '\n</script>' + html[last_script+9:]
    print('OK - JS plans épargne ajouté')
else:
    print('INFO - JS plans déjà présent')

# Ajouter bouton admin pour appliquer les intérêts dans le panneau admin
OLD_ADMIN_SECTION = '<div class="slbl" style="padding:0;margin-bottom:10px">Épargne — Dépôts à valider</div>'
NEW_ADMIN_SECTION = '''<div style="background:linear-gradient(135deg,rgba(34,197,94,.1),rgba(34,197,94,.05));border:1px solid rgba(34,197,94,.3);border-radius:12px;padding:14px;margin-bottom:16px">
        <div style="font-size:13px;font-weight:700;color:var(--green);margin-bottom:6px">💰 Intérêts mensuels</div>
        <div style="font-size:11px;color:var(--text3);margin-bottom:10px">Appliquer les intérêts sur tous les plans actifs (à faire le 1er de chaque mois)</div>
        <button onclick="appliquerInteretsMensuels()" style="width:100%;padding:10px;border-radius:8px;border:none;background:var(--green);color:#fff;font-size:13px;font-weight:700;cursor:pointer;font-family:var(--font)">
          ↗ Appliquer les intérêts maintenant
        </button>
        <div id="interets-result" style="font-size:11px;color:var(--green);margin-top:8px;text-align:center"></div>
      </div>
      <div class="slbl" style="padding:0;margin-bottom:10px">Épargne — Dépôts à valider</div>'''

if OLD_ADMIN_SECTION in html:
    html = html.replace(OLD_ADMIN_SECTION, NEW_ADMIN_SECTION)
    print('OK - Bouton intérêts mensuels ajouté dans admin')
else:
    print('WARN - Section admin épargne non trouvée')

# Ajouter fonction appliquerInteretsMensuels
INTERETS_FN = """
async function appliquerInteretsMensuels() {
  var btn = event.target;
  btn.disabled = true;
  btn.innerHTML = '<div class="spin spin-w"></div> Application...';
  try {
    var res = await fetch(API + '/api/zama/epargne/admin/appliquer-interets-plans?token=pst-admin-2026', { method: 'POST' });
    var data = await res.json();
    if (data.ok) {
      var el = document.getElementById('interets-result');
      if (el) el.textContent = data.traites + ' plans mis à jour · +' + (data.total_interets||0).toLocaleString('fr-FR') + ' FCFA versés';
      toast(data.message || 'Intérêts appliqués !', 'ok');
    } else {
      toast(data.error || 'Erreur', 'err');
    }
  } catch(e) { toast('Erreur: ' + e.message, 'err'); }
  btn.disabled = false;
  btn.innerHTML = '↗ Appliquer les intérêts maintenant';
}
"""

if 'function appliquerInteretsMensuels' not in html:
    last_script = html.rfind('</script>')
    html = html[:last_script] + INTERETS_FN + '\n</script>' + html[last_script+9:]
    print('OK - appliquerInteretsMensuels ajoutée')

# Vérifier syntaxe finale
scripts = re.findall(r'<script(?![^>]*src)[^>]*>(.*?)</script>', html, re.DOTALL)
with open('/tmp/check_final.js', 'w') as f: f.write('\n'.join(scripts))
result = subprocess.run(['node', '--check', '/tmp/check_final.js'], capture_output=True, text=True)
if result.returncode == 0:
    print('ZERO ERREUR JS - zama.html')
else:
    print('ERREUR JS:', result.stderr[:300])

with open('/home/claude/zama.html', 'w', encoding='utf-8') as f:
    f.write(html)
print('\n=== TERMINÉ ===')
