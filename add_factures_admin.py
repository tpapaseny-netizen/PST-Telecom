import re

with open('admin.html', 'r', encoding='utf-8') as f:
    c = f.read()

# Add Factures nav item in sidebar
old_nav = '📹 PST SecurCam'
new_nav = '📹 PST SecurCam'

# Find a nav item to insert after
facture_nav = '''
<div class="nav-item" onclick="showSection('factures')" id="nav-factures">
  <span class="nav-icon">🧾</span> Factures
</div>'''

# Insert after SMS Marketing nav item
if 'SMS Marketing' in c and 'nav-sms-marketing' in c:
    c = c.replace(
        'id="nav-sms-marketing"',
        'id="nav-sms-marketing"'
    )

# Add to SECTION_TITLES
if 'SECTION_TITLES' in c:
    c = c.replace(
        "};",
        "  factures: '🧾 Factures & Agent Facturation',\n};",
        1
    )

# Add factures section content
factures_section = """
// ─── SECTION FACTURES ───────────────────────────────
if (section === 'factures') {
  content = `
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:24px">
    <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px;text-align:center">
      <div style="font-size:28px;font-weight:800;color:var(--accent)" id="fact-total">-</div>
      <div style="font-size:12px;color:var(--muted);margin-top:4px">Total factures</div>
    </div>
    <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px;text-align:center">
      <div style="font-size:28px;font-weight:800;color:#00e676" id="fact-sent">-</div>
      <div style="font-size:12px;color:var(--muted);margin-top:4px">Envoyees</div>
    </div>
    <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px;text-align:center">
      <div style="font-size:28px;font-weight:800;color:var(--yellow)" id="fact-revenue">-</div>
      <div style="font-size:12px;color:var(--muted);margin-top:4px">FCFA factures</div>
    </div>
  </div>
  
  <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;padding:20px;margin-bottom:20px">
    <h3 style="font-size:14px;font-weight:700;margin-bottom:16px">Generer une facture manuellement</h3>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
      <input id="f-client" type="text" placeholder="Nom du client" style="padding:8px 12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;outline:none">
      <input id="f-tel" type="text" placeholder="Telephone +221..." style="padding:8px 12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;outline:none">
      <input id="f-email" type="email" placeholder="Email (optionnel)" style="padding:8px 12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;outline:none">
      <input id="f-service" type="text" placeholder="Service (ex: Forfait Smart)" style="padding:8px 12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;outline:none">
      <input id="f-montant" type="number" placeholder="Montant FCFA" style="padding:8px 12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;outline:none">
      <input id="f-forfait" type="text" placeholder="Detail forfait (optionnel)" style="padding:8px 12px;background:var(--bg);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px;outline:none">
    </div>
    <button onclick="genererFacture()" style="margin-top:12px;padding:10px 20px;background:var(--accent);border:none;border-radius:8px;color:#000;font-weight:700;cursor:pointer;font-size:13px">Generer la facture</button>
    <span id="f-status" style="margin-left:12px;font-size:12px;color:var(--muted)"></span>
  </div>

  <div style="background:var(--card);border:1px solid var(--border);border-radius:12px;overflow:hidden">
    <div style="padding:16px 20px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
      <h3 style="font-size:14px;font-weight:700">Historique des factures</h3>
      <button onclick="loadFactures()" style="padding:6px 12px;background:transparent;border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px;cursor:pointer">Actualiser</button>
    </div>
    <div id="factures-list" style="max-height:400px;overflow-y:auto">
      <div style="padding:40px;text-align:center;color:var(--muted)">Chargement...</div>
    </div>
  </div>`;
  
  container.innerHTML = content;
  loadFactures();
}
"""

# Add JS functions
factures_js = """
async function loadFactures() {
  try {
    const r = await fetch(API + '/api/factures?token=' + TOKEN);
    const facts = await r.json();
    
    document.getElementById('fact-total').textContent = facts.length;
    document.getElementById('fact-sent').textContent = facts.filter(f => f.sent).length;
    const rev = facts.reduce((s, f) => s + (Number(f.montant) || 0), 0);
    document.getElementById('fact-revenue').textContent = rev.toLocaleString('fr-FR');
    
    const list = document.getElementById('factures-list');
    if (!facts.length) {
      list.innerHTML = '<div style="padding:40px;text-align:center;color:var(--muted)">Aucune facture</div>';
      return;
    }
    list.innerHTML = facts.map(f => `
      <div style="display:flex;align-items:center;gap:12px;padding:12px 20px;border-bottom:1px solid rgba(255,255,255,0.04)">
        <div style="width:8px;height:8px;border-radius:50%;background:${f.sent ? '#00e676' : '#f59e0b'};flex-shrink:0"></div>
        <div style="flex:1">
          <div style="font-size:13px;font-weight:600">${f.numero || 'N/A'}</div>
          <div style="font-size:11px;color:var(--muted)">${f.client || ''} • ${f.service || ''}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:13px;font-weight:700;color:var(--accent)">${Number(f.montant||0).toLocaleString('fr-FR')} F</div>
          <div style="font-size:10px;color:var(--muted)">${new Date(f.createdAt).toLocaleDateString('fr-FR')}</div>
        </div>
        <div style="display:flex;gap:6px">
          <button onclick="window.open('${API}/api/factures/${f.numero}','_blank')" style="padding:4px 8px;background:rgba(0,212,255,0.1);border:1px solid rgba(0,212,255,0.3);border-radius:5px;color:var(--accent);font-size:11px;cursor:pointer">Voir</button>
          <button onclick="supprimerFacture('${f._id}')" style="padding:4px 8px;background:rgba(255,61,87,0.1);border:1px solid rgba(255,61,87,0.3);border-radius:5px;color:#ff3d57;font-size:11px;cursor:pointer">X</button>
        </div>
      </div>`).join('');
  } catch(e) { console.error('Factures error:', e); }
}

async function genererFacture() {
  const client = document.getElementById('f-client').value.trim();
  const montant = document.getElementById('f-montant').value.trim();
  if (!client || !montant) { alert('Client et montant requis'); return; }
  
  const status = document.getElementById('f-status');
  status.textContent = 'Generation en cours...';
  
  try {
    const r = await fetch(API + '/api/factures/generer', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        client,
        telephone: document.getElementById('f-tel').value.trim(),
        email: document.getElementById('f-email').value.trim(),
        service: document.getElementById('f-service').value.trim() || 'Service PST',
        montant: Number(montant),
        forfait: document.getElementById('f-forfait').value.trim()
      })
    });
    const d = await r.json();
    if (d.success) {
      status.textContent = 'Facture ' + d.numero + ' generee !';
      status.style.color = '#00e676';
      setTimeout(loadFactures, 1000);
    } else {
      status.textContent = 'Erreur: ' + (d.error || 'Inconnue');
      status.style.color = '#ff3d57';
    }
  } catch(e) { status.textContent = 'Erreur reseau'; }
}

async function supprimerFacture(id) {
  if (!confirm('Supprimer cette facture ?')) return;
  await fetch(API + '/api/factures/' + id + '?token=' + TOKEN, {method: 'DELETE'});
  loadFactures();
}
"""

# Insert section in showSection function
if "section === 'recharges'" in c:
    c = c.replace(
        "// fin sections",
        factures_section + "\n// fin sections"
    )
elif "container.innerHTML = content;" in c:
    # Find last if block and add after
    last_idx = c.rfind("container.innerHTML = content;")
    insert_pos = c.find("\n}", last_idx) + 2
    c = c[:insert_pos] + factures_section + c[insert_pos:]

# Add nav item
if 'nav-recharges' in c:
    c = c.replace(
        'id="nav-recharges"',
        'id="nav-recharges"'
    )
    # Add factures nav after recharges
    c = c.replace(
        'onclick="showSection(\'recharges\')"',
        'onclick="showSection(\'recharges\')"'
    )

# Add JS functions before closing script tag
c = c.replace('</script>', factures_js + '\n</script>', 1)

# Add nav link - find SMS Marketing nav and add after
c = c.replace(
    "onclick=\"showSection('sms-marketing')\"",
    "onclick=\"showSection('sms-marketing')\""
)

# Simple approach - add nav item near the end of nav items
nav_item = '<div class="nav-item" onclick="showSection(\'factures\')" id="nav-factures"><span class="nav-icon">🧾</span> Factures</div>'

if 'nav-securcam' in c:
    c = c.replace('id="nav-securcam">', 'id="nav-securcam">' )
    
# Add before closing nav or sidebar
if '</nav>' in c:
    c = c.replace('</nav>', nav_item + '\n</nav>', 1)

with open('admin.html', 'w', encoding='utf-8') as f:
    f.write(c)

print('Done! factures in file:', 'factures-list' in c)
print('genererFacture in file:', 'genererFacture' in c)
