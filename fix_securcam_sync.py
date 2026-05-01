s = open('securcam-admin.html', 'r', encoding='utf-8').read()

# Corriger la fonction init pour charger depuis l'API correctement
old_init = '''async function init() {
  startClock();
  await loadClients();
  await loadDevis();
  renderDashboard();
  renderClients();
  renderCameras();
  renderBilling();
  startAlertSimulation();
}'''

new_init = '''async function init() {
  startClock();
  await loadClients();
  await loadDevis();
  renderDashboard();
  renderClients();
  renderCameras();
  renderBilling();
  startAlertSimulation();
  // Refresh automatique toutes les 30 secondes
  setInterval(async () => {
    await loadClients();
    renderDashboard();
    renderClients();
    renderCameras();
  }, 30000);
}'''

if old_init in s:
    s = s.replace(old_init, new_init)
    print('OK - refresh auto ajouté')

# Corriger loadClients pour mieux gérer les données
old_load = '''async function loadClients() {
  try {
    const res = await fetch(API + '/api/securcam/clients');
    const data = await res.json();
    if (data.clients) clients = data.clients;
  } catch(e) {'''

new_load = '''async function loadClients() {
  try {
    const res = await fetch(API + '/api/securcam/clients');
    const data = await res.json();
    if (data.clients && data.clients.length > 0) {
      clients = data.clients;
      console.log('Clients chargés depuis API:', clients.length);
    } else {
      console.log('Aucun client en DB, utilisation des données démo');
    }
  } catch(e) {
    console.warn('API non disponible:', e.message);'''

if old_load in s:
    s = s.replace(old_load, new_load)
    print('OK - loadClients amélioré')

# Ajouter bouton NOC dans les liens rapides
old_noc = '''<div class="nav-item" onclick="window.open(\'/securcam\')"><span class="nav-icon">👁</span> Portail client</div>
      <div class="nav-item" onclick="window.open(\'/admin\')"><span class="nav-icon">🔧</span> Admin PST principal</div>'''

new_noc = '''<div class="nav-item" onclick="window.open(\'/securcam\')"><span class="nav-icon">👁</span> Portail client</div>
      <div class="nav-item" onclick="window.open(\'/noc?token=pst-admin-2026\')"><span class="nav-icon">📺</span> NOC Center</div>
      <div class="nav-item" onclick="window.open(\'/admin\')"><span class="nav-icon">🔧</span> Admin PST principal</div>'''

if old_noc in s:
    s = s.replace(old_noc, new_noc)
    print('OK - lien NOC ajouté dans sidebar')

open('securcam-admin.html', 'w', encoding='utf-8').write(s)
print('securcam-admin.html mis à jour')
