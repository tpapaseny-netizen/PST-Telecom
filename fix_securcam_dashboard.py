s = open('securcam-admin.html', 'r', encoding='utf-8').read()

# Améliorer renderDashboard pour afficher les vrais chiffres
old_render = '''function renderDashboard() {
  const allCams = clients.flatMap(c => c.cameras || []);
  const online = allCams.filter(c => c.online).length;
  document.getElementById('kpi-clients').textContent = clients.filter(c=>c.status==='active').length;
  document.getElementById('kpi-cams').textContent = allCams.length;
  document.getElementById('kpi-online').textContent = online;
  document.getElementById('kpi-alerts').textContent = allAlerts.length;'''

new_render = '''async function syncWithNOC() {
  try {
    const res = await fetch(API + '/api/noc/sync', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      console.log('Sync NOC->SecurCam:', data);
      await loadClients();
      renderDashboard();
      renderClients();
      renderCameras();
    }
  } catch(e) { console.warn('Sync échoué:', e.message); }
}

function renderDashboard() {
  const allCams = clients.flatMap(c => c.cameras || []);
  const online = allCams.filter(c => c.online !== false).length;
  document.getElementById('kpi-clients').textContent = clients.filter(c=>c.status==='active').length || clients.length;
  document.getElementById('kpi-cams').textContent = allCams.length;
  document.getElementById('kpi-online').textContent = online;
  document.getElementById('kpi-alerts').textContent = allAlerts.length;'''

if old_render in s:
    s = s.replace(old_render, new_render)
    print('OK - renderDashboard amélioré')

# Ajouter bouton Sync dans le topbar
old_topbar = '''<button class="tb-btn" onclick="openAddClient()">+ Nouveau client</button>'''
new_topbar = '''<button onclick="syncWithNOC()" style="background:rgba(0,212,255,0.1);border:1px solid rgba(0,212,255,0.3);color:#06B6D4;border-radius:8px;padding:8px 14px;font-size:12px;cursor:pointer;font-family:'DM Sans',sans-serif;">🔄 Sync NOC</button>
        <button class="tb-btn" onclick="openAddClient()">+ Nouveau client</button>'''

if old_topbar in s:
    s = s.replace(old_topbar, new_topbar)
    print('OK - bouton Sync NOC ajouté')

# Améliorer init pour syncer au démarrage
old_init_end = '''  startAlertSimulation();
  // Refresh automatique toutes les 30 secondes
  setInterval(async () => {
    await loadClients();
    renderDashboard();
    renderClients();
    renderCameras();
  }, 30000);
}'''

new_init_end = '''  startAlertSimulation();
  // Sync NOC au démarrage
  setTimeout(() => syncWithNOC(), 2000);
  // Refresh automatique toutes les 30 secondes
  setInterval(async () => {
    await loadClients();
    renderDashboard();
    renderClients();
    renderCameras();
  }, 30000);
}'''

if old_init_end in s:
    s = s.replace(old_init_end, new_init_end)
    print('OK - sync au démarrage ajouté')

open('securcam-admin.html', 'w', encoding='utf-8').write(s)
print('securcam-admin.html mis à jour')
