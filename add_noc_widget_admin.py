
import re

with open('admin.html', 'r', encoding='utf-8') as f:
    c = f.read()

widget = '''
<div id="noc-agent-widget" style="margin:16px;background:linear-gradient(135deg,rgba(0,212,255,0.08),rgba(124,58,237,0.08));border:1px solid rgba(0,212,255,0.25);border-radius:12px;padding:16px;display:flex;align-items:center;gap:16px;flex-wrap:wrap">
  <div style="display:flex;align-items:center;gap:10px">
    <div id="noc-agent-dot" style="width:12px;height:12px;background:#00e676;border-radius:50%;animation:nocPulse 2s infinite;flex-shrink:0"></div>
    <div>
      <div style="font-size:13px;font-weight:700;color:#e2e8f0">Agent NOC</div>
      <div id="noc-agent-label" style="font-size:11px;color:#64748b">Chargement...</div>
    </div>
  </div>
  <div style="display:flex;gap:16px;flex-wrap:wrap">
    <div style="text-align:center">
      <div id="noc-total" style="font-size:20px;font-weight:800;color:#00d4ff">-</div>
      <div style="font-size:10px;color:#64748b">Cameras</div>
    </div>
    <div style="text-align:center">
      <div id="noc-online" style="font-size:20px;font-weight:800;color:#00e676">-</div>
      <div style="font-size:10px;color:#64748b">En ligne</div>
    </div>
    <div style="text-align:center">
      <div id="noc-offline" style="font-size:20px;font-weight:800;color:#ef4444">-</div>
      <div style="font-size:10px;color:#64748b">Hors ligne</div>
    </div>
  </div>
  <div style="margin-left:auto;display:flex;gap:8px">
    <button onclick="nocCheckNow()" style="padding:6px 12px;background:rgba(0,212,255,0.1);border:1px solid rgba(0,212,255,0.3);border-radius:7px;color:#00d4ff;font-size:11px;cursor:pointer">Verifier maintenant</button>
    <a href="/noc?token=pst-admin-2026" target="_blank" style="padding:6px 12px;background:rgba(0,212,255,0.1);border:1px solid rgba(0,212,255,0.3);border-radius:7px;color:#00d4ff;font-size:11px;cursor:pointer;text-decoration:none">Ouvrir NOC</a>
  </div>
  <div id="noc-last-check" style="width:100%;font-size:10px;color:#475569;margin-top:4px"></div>
</div>
<style>
@keyframes nocPulse{0%,100%{box-shadow:0 0 0 0 rgba(0,230,118,0.4)}70%{box-shadow:0 0 0 6px rgba(0,230,118,0)}}
</style>
<script>
function loadNocStatus(){
  fetch('/api/noc/agent/status?token=pst-admin-2026')
  .then(function(r){return r.json();})
  .then(function(d){
    document.getElementById('noc-total').textContent = d.cameras || 0;
    document.getElementById('noc-online').textContent = d.online || 0;
    document.getElementById('noc-offline').textContent = d.offline || 0;
    var dot = document.getElementById('noc-agent-dot');
    var label = document.getElementById('noc-agent-label');
    if(d.running){
      dot.style.background = '#00e676';
      label.textContent = 'Actif - Surveillance toutes les 5 minutes';
    } else {
      dot.style.background = '#ef4444';
      label.textContent = 'Inactif';
    }
    if(d.offline > 0){
      dot.style.background = '#ef4444';
      label.textContent = d.offline + ' camera(s) hors ligne !';
    }
    var t = new Date(d.lastCheck);
    document.getElementById('noc-last-check').textContent = 'Derniere verification : ' + t.toLocaleTimeString('fr-FR');
  }).catch(function(){
    document.getElementById('noc-agent-label').textContent = 'Erreur connexion';
  });
}
function nocCheckNow(){
  fetch('/api/noc/agent/check-now?token=pst-admin-2026',{method:'POST'})
  .then(function(){setTimeout(loadNocStatus,3000);});
}
loadNocStatus();
setInterval(loadNocStatus, 60000);
</script>
'''

# Insert widget after the opening of the main content area or after <body>
# Find a good insertion point - after the first <div class="content"> or similar
if '<div class="content">' in c:
    c = c.replace('<div class="content">', '<div class="content">' + widget, 1)
    print("Inserted after content div")
elif 'id="dashboard"' in c:
    c = c.replace('id="dashboard"', 'id="dashboard">' + widget + '<div style="display:none"', 1)
    print("Inserted in dashboard")
else:
    # Insert after <body> or after header
    c = c.replace('</nav>', '</nav>' + widget, 1)
    print("Inserted after nav")

with open('admin.html', 'w', encoding='utf-8') as f:
    f.write(c)

print('Done! noc-agent-widget in file:', 'noc-agent-widget' in c)
