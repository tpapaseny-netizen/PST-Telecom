import re

# Lire le noc.html
s = open('noc.html', 'r', encoding='utf-8').read()

# 1. Ajouter boutons modifier/supprimer sur chaque cellule caméra
old_cam_bottom = '''      <div class="cam-bottom">
        <div class="cam-name-tag">${cam.name}</div>
        <div class="cam-client-tag">${cam.client}</div>
      </div>'''

new_cam_bottom = '''      <div class="cam-bottom">
        <div class="cam-name-tag">${cam.name}</div>
        <div class="cam-client-tag">${cam.client}</div>
        <div class="cam-action-btns" style="display:flex;gap:4px;margin-top:4px;" onclick="event.stopPropagation()">
          <button onclick="event.stopPropagation();editCam('${cam.id}')" style="background:rgba(0,212,255,0.2);border:1px solid rgba(0,212,255,0.3);color:#00D4FF;border-radius:4px;padding:2px 8px;font-size:9px;cursor:pointer;">✏️ Modifier</button>
          <button onclick="event.stopPropagation();deleteCam('${cam.id}')" style="background:rgba(255,59,59,0.2);border:1px solid rgba(255,59,59,0.3);color:#FF3B3B;border-radius:4px;padding:2px 8px;font-size:9px;cursor:pointer;">🗑 Supprimer</button>
        </div>
      </div>'''

if old_cam_bottom in s:
    s = s.replace(old_cam_bottom, new_cam_bottom)
    print('OK - boutons modifier/supprimer ajoutés')
else:
    print('ERREUR - cam-bottom non trouvé')

# 2. Ajouter les fonctions editCam et deleteCam dans le JS
old_delete = '''function deleteCam(id) {
  const cam = allCameras.find(c=>c.id===id);
  cameras = cameras.filter(c => c.id !== id);
  renderCameras();
  updateStats();
  if (cam) addAlert('offline', cam.name, cam.client, 'Caméra supprimée');
  showToast('🗑 Caméra supprimée');
}'''

# Chercher la fonction deleteCam existante
if 'async function addCamera()' in s:
    # Ajouter editCam avant addCamera
    old_add = 'async function addCamera() {'
    new_add = '''function editCam(id) {
  const cam = allCameras.find(c=>c.id===id);
  if (!cam) return;
  // Remplir le formulaire avec les données existantes
  document.getElementById('m-new-client').value = cam.client;
  document.getElementById('m-name').value = cam.name;
  document.getElementById('m-type').value = cam.type || 'embed';
  document.getElementById('m-url').value = cam.url || '';
  document.getElementById('m-brand').value = cam.brand || 'Hikvision';
  document.getElementById('m-loc').value = cam.loc || '';
  document.getElementById('m-zone').value = cam.zone || '';
  // Marquer comme édition
  document.getElementById('add-modal').dataset.editId = id;
  document.querySelector('.btn-submit').textContent = '✅ Mettre à jour la caméra';
  openAddCam();
}

async function deleteCam(id) {
  const cam = allCameras.find(c=>c.id===id);
  if (!confirm('Supprimer la caméra "' + (cam?.name||id) + '" ?')) return;
  allCameras = allCameras.filter(c=>c.id!==id);
  filteredCameras = filteredCameras.filter(c=>c.id!==id);
  try {
    await fetch(API + '/api/noc/cameras/' + id, { method: 'DELETE' });
  } catch(e) {}
  renderAll();
  if (cam) addAlert('offline', cam.name, cam.client, 'Caméra supprimée du NOC');
  showToast('🗑 Caméra "' + (cam?.name||'') + '" supprimée');
}

async function addCamera() {'''

    if old_add in s:
        s = s.replace(old_add, new_add)
        print('OK - fonctions editCam et deleteCam ajoutées')
    else:
        print('ERREUR - addCamera non trouvé')

# 3. Modifier addCamera pour gérer l'édition
old_add_end = '''  renderAll();
  closeAddCam();
  addAlert('online', cam.name, cam.client, 'Nouvelle caméra connectée au NOC');
  showToast('✅ ' + name + ' ajoutée au NOC');

  ['m-name','m-url','m-loc','m-zone','m-new-client'].forEach(id => document.getElementById(id).value='');
}'''

new_add_end = '''  const editId = document.getElementById('add-modal').dataset.editId;
  if (editId) {
    // Mode édition
    const idx = allCameras.findIndex(c=>c.id===editId);
    if (idx >= 0) {
      allCameras[idx] = {...allCameras[idx], ...cam, id: editId};
      try { await fetch(API + '/api/noc/cameras/' + editId, { method: 'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(allCameras[idx]) }); } catch(e) {}
      showToast('✅ Caméra mise à jour !');
    }
    delete document.getElementById('add-modal').dataset.editId;
    document.querySelector('.btn-submit').textContent = '✅ Ajouter au NOC';
  } else {
    allCameras.push(cam);
    try { await fetch(API + '/api/noc/cameras', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(cam) }); } catch(e) {}
    addAlert('online', cam.name, cam.client, 'Nouvelle caméra connectée au NOC');
    showToast('✅ ' + name + ' ajoutée au NOC');
  }

  filteredCameras = [...allCameras];
  renderAll();
  closeAddCam();
  ['m-name','m-url','m-loc','m-zone','m-new-client'].forEach(id => document.getElementById(id).value='');
}'''

if old_add_end in s:
    s = s.replace(old_add_end, new_add_end)
    print('OK - logique édition ajoutée dans addCamera')
else:
    print('WARN - fin addCamera non trouvée - version alternative')

open('noc.html', 'w', encoding='utf-8').write(s)
print('NOC.html mis à jour')
