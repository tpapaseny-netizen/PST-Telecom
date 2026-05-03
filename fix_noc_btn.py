with open('admin.html', 'r', encoding='utf-8') as f:
    c = f.read()

# Fix nocCheckNow function
old = "function nocCheckNow(){\n  fetch('/api/noc/agent/check-now?token=pst-admin-2026',{method:'POST'})\n  .then(function(){setTimeout(loadNocStatus,3000);});\n}"

new = """function nocCheckNow(){
  var btn = event.target;
  btn.textContent = 'Verification...';
  btn.disabled = true;
  fetch('/api/noc/agent/check-now?token=pst-admin-2026',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:'{}'
  }).then(function(r){return r.json();})
  .then(function(){
    document.getElementById('noc-agent-label').textContent='Verification lancee - resultats dans 10s';
    setTimeout(function(){
      loadNocStatus();
      btn.textContent='Verifier maintenant';
      btn.disabled=false;
    },5000);
  }).catch(function(){
    btn.textContent='Verifier maintenant';
    btn.disabled=false;
  });
}"""

if old in c:
    c = c.replace(old, new)
    print('Fixed v1')
else:
    # Try simpler replace
    c = c.replace(
        "fetch('/api/noc/agent/check-now?token=pst-admin-2026',{method:'POST'})\n  .then(function(){setTimeout(loadNocStatus,3000);});",
        "fetch('/api/noc/agent/check-now?token=pst-admin-2026',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}).then(function(){setTimeout(loadNocStatus,4000);});"
    )
    print('Fixed v2')

with open('admin.html', 'w', encoding='utf-8') as f:
    f.write(c)
print('Done')
