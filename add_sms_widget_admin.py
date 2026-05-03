import re

with open('admin.html', 'r', encoding='utf-8') as f:
    c = f.read()

# SMS Marketing widget - similar to NOC widget
widget = '''
<div id="sms-agent-widget" style="margin:0 16px 16px;background:linear-gradient(135deg,rgba(124,58,237,0.08),rgba(0,212,255,0.08));border:1px solid rgba(124,58,237,0.25);border-radius:12px;padding:16px;display:flex;align-items:center;gap:16px;flex-wrap:wrap">
  <div style="display:flex;align-items:center;gap:10px">
    <div style="width:12px;height:12px;background:#7c3aed;border-radius:50%;animation:nocPulse 2s infinite;flex-shrink:0"></div>
    <div>
      <div style="font-size:13px;font-weight:700;color:#e2e8f0">Agent SMS Marketing</div>
      <div style="font-size:11px;color:#64748b">Campagnes automatiques</div>
    </div>
  </div>
  <div style="display:flex;gap:16px;flex-wrap:wrap">
    <div style="text-align:center">
      <div id="sms-total-camp" style="font-size:20px;font-weight:800;color:#7c3aed">-</div>
      <div style="font-size:10px;color:#64748b">Campagnes</div>
    </div>
    <div style="text-align:center">
      <div id="sms-total-envoyes" style="font-size:20px;font-weight:800;color:#00e676">-</div>
      <div style="font-size:10px;color:#64748b">SMS envoyes</div>
    </div>
    <div style="text-align:center">
      <div id="sms-total-echecs" style="font-size:20px;font-weight:800;color:#ef4444">-</div>
      <div style="font-size:10px;color:#64748b">Echecs</div>
    </div>
  </div>
  <div style="margin-left:auto;display:flex;gap:8px">
    <a href="/sms-marketing" target="_blank" style="padding:6px 12px;background:rgba(124,58,237,0.1);border:1px solid rgba(124,58,237,0.3);border-radius:7px;color:#7c3aed;font-size:11px;cursor:pointer;text-decoration:none">Ouvrir plateforme</a>
  </div>
  <div id="sms-campagnes-list" style="width:100%;margin-top:8px;display:none"></div>
</div>
<script>
function loadSmsStats(){
  fetch('/api/sms-marketing/stats?token=pst-admin-2026')
  .then(function(r){return r.json();})
  .then(function(d){
    document.getElementById('sms-total-camp').textContent = d.totalCampagnes || d.total || 0;
    document.getElementById('sms-total-envoyes').textContent = d.totalEnvoyes || d.envoyes || 0;
    document.getElementById('sms-total-echecs').textContent = d.totalEchecs || 0;
  }).catch(function(){});
}
loadSmsStats();
setInterval(loadSmsStats, 60000);
</script>
'''

# Insert after NOC widget
if 'noc-agent-widget' in c:
    c = c.replace('</div>\n<style>\n@keyframes nocPulse', '</div>\n' + widget + '\n<style>\n@keyframes nocPulse', 1)
    print("Inserted after NOC widget")
elif 'noc-agent-widget' in c:
    c = c.replace('id="noc-agent-widget"', 'id="noc-agent-widget"')
else:
    # Insert after opening main content
    c = c.replace('<div class="content">', '<div class="content">' + widget, 1)
    print("Inserted in content")

with open('admin.html', 'w', encoding='utf-8') as f:
    f.write(c)

print('Done! sms-agent-widget in file:', 'sms-agent-widget' in c)
print('loadSmsStats in file:', 'loadSmsStats' in c)
