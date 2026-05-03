with open('admin.html', 'r', encoding='utf-8') as f:
    c = f.read()

widget = '''
<div id="recharge-agent-widget" style="margin:0 16px 16px;background:linear-gradient(135deg,rgba(245,158,11,0.08),rgba(16,185,129,0.08));border:1px solid rgba(245,158,11,0.25);border-radius:12px;padding:16px;display:flex;align-items:center;gap:16px;flex-wrap:wrap">
  <div style="display:flex;align-items:center;gap:10px">
    <div style="width:12px;height:12px;background:#f59e0b;border-radius:50%;animation:nocPulse 2s infinite;flex-shrink:0"></div>
    <div>
      <div style="font-size:13px;font-weight:700;color:#e2e8f0">Agent Recharge</div>
      <div style="font-size:11px;color:#64748b">Recharges automatiques 24h/24</div>
    </div>
  </div>
  <div style="display:flex;gap:16px;flex-wrap:wrap">
    <div style="text-align:center">
      <div id="rech-total" style="font-size:20px;font-weight:800;color:#f59e0b">-</div>
      <div style="font-size:10px;color:#64748b">Recharges</div>
    </div>
    <div style="text-align:center">
      <div id="rech-reussies" style="font-size:20px;font-weight:800;color:#00e676">-</div>
      <div style="font-size:10px;color:#64748b">Reussies</div>
    </div>
    <div style="text-align:center">
      <div id="rech-echecs" style="font-size:20px;font-weight:800;color:#ef4444">-</div>
      <div style="font-size:10px;color:#64748b">Echecs</div>
    </div>
    <div style="text-align:center">
      <div id="rech-volume" style="font-size:20px;font-weight:800;color:#00d4ff">-</div>
      <div style="font-size:10px;color:#64748b">FCFA</div>
    </div>
  </div>
  <div style="margin-left:auto">
    <a href="/recharge" target="_blank" style="padding:6px 12px;background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:7px;color:#f59e0b;font-size:11px;cursor:pointer;text-decoration:none">Ouvrir recharge</a>
  </div>
</div>
<script>
function loadRechargeStats(){
  fetch('/api/recharge/stats?token=pst-admin-2026')
  .then(function(r){return r.json();})
  .then(function(d){
    document.getElementById('rech-total').textContent = d.total || 0;
    document.getElementById('rech-reussies').textContent = d.reussies || 0;
    document.getElementById('rech-echecs').textContent = d.echecs || 0;
    document.getElementById('rech-volume').textContent = (d.volume||0).toLocaleString('fr-FR');
  }).catch(function(){});
}
loadRechargeStats();
setInterval(loadRechargeStats, 60000);
</script>
'''

# Insert after SMS marketing widget
if 'sms-agent-widget' in c:
    c = c.replace('</div>\n<script>\nfunction loadSmsStats', '</div>\n' + widget + '\n<script>\nfunction loadSmsStats', 1)
    print("Inserted after SMS widget")
else:
    c = c.replace('id="noc-agent-widget"', 'id="noc-agent-widget"')
    c = c.replace('</div>\n<style>\n@keyframes nocPulse', '</div>\n' + widget + '\n<style>\n@keyframes nocPulse', 1)
    print("Inserted after NOC widget")

with open('admin.html', 'w', encoding='utf-8') as f:
    f.write(c)

print('Done! recharge-agent-widget in file:', 'recharge-agent-widget' in c)
