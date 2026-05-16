import re

with open('zama.html', 'r', encoding='utf-8') as f:
    html = f.read()

# ══ FIX 1: Recharger la liste épargne à chaque fois qu'on ouvre scr-epargne
# Chercher dans la fonction goto()
old_goto = 'if(id==="scr-epargne")loadEpargnes();\n  if(id==="scr-tontine")loadTontines();'

if old_goto in html:
    print("OK - goto déjà correct")
else:
    # Ajouter dans goto
    html = html.replace(
        'if(id==="scr-admin")loadAdmStats();',
        'if(id==="scr-admin")loadAdmStats();\n  if(id==="scr-epargne"){loadEpargnes();}\n  if(id==="scr-tontine"){loadTontines();}'
    )
    print("OK - loadEpargnes ajouté dans goto")

# ══ FIX 2: Ajouter champ mot de passe dans le formulaire nouveau plan épargne
old_form_end = '''      <button class="btn-p" style="width:100%;margin:0" onclick="creerEpargne()">Creer mon plan</button>'''

new_form_end = '''      <div class="fg" style="padding:0;margin-bottom:16px">
        <label>Mot de passe de protection (optionnel)</label>
        <input class="finp" type="password" id="ep-password" placeholder="Ex: 1234 ou un mot secret">
        <div style="font-size:11px;color:var(--text3);margin-top:4px">Si renseigné, le retrait nécessitera ce mot de passe</div>
      </div>
      <button class="btn-p" style="width:100%;margin:0" onclick="creerEpargne()">Creer mon plan</button>'''

if old_form_end in html:
    html = html.replace(old_form_end, new_form_end)
    print("OK - champ mot de passe ajouté")
else:
    print("WARN - pattern formulaire non trouvé")

# ══ FIX 3: Modifier creerEpargne pour inclure le mot de passe
old_create = '''async function creerEpargne(){
  if(!user){toast('Connectez-vous','err');goto('scr-login');return;}
  var desc=document.getElementById('ep-desc').value.trim();
  var obj=parseInt(document.getElementById('ep-objectif').value);
  var dur=parseInt(document.getElementById('ep-duree').value);
  if(!desc){toast('Entrez une description','err');return;}
  if(!obj||obj<500){toast('Min 500 FCFA','err');return;}
  if(!dur||dur<1){toast('Min 1 jour','err');return;}
  try{
    var res=await fetch(API+'/api/zama/epargne/create',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({user_id:user.id,user_name:(user.prenom||'')+' '+(user.nom||''),user_phone:user.phone,
        objectif_fcfa:obj,duree_jours:dur,description:desc,retrait_libre:_epMode==='libre'})});
    var data=await res.json();
    if(data.ok){toast('Plan cree !','ok');gb();loadEpargnes();}
    else toast(data.error||'Erreur','err');
  }catch(e){toast('Erreur','err');}
}'''

new_create = '''async function creerEpargne(){
  if(!user){toast('Connectez-vous','err');goto('scr-login');return;}
  var desc=document.getElementById('ep-desc').value.trim();
  var obj=parseInt(document.getElementById('ep-objectif').value);
  var dur=parseInt(document.getElementById('ep-duree').value);
  var pwd=document.getElementById('ep-password')?document.getElementById('ep-password').value.trim():'';
  if(!desc){toast('Entrez une description','err');return;}
  if(!obj||obj<500){toast('Min 500 FCFA','err');return;}
  if(!dur||dur<1){toast('Min 1 jour','err');return;}
  var btn=event.target;
  btn.disabled=true;
  btn.textContent='Creation...';
  try{
    var res=await fetch(API+'/api/zama/epargne/create',{method:'POST',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({user_id:user.id,user_name:(user.prenom||'')+' '+(user.nom||''),user_phone:user.phone,
        objectif_fcfa:obj,duree_jours:dur,description:desc,retrait_libre:_epMode==='libre',
        password:pwd||null})});
    var data=await res.json();
    if(data.ok){
      toast('Plan cree !','ok');
      document.getElementById('ep-desc').value='';
      document.getElementById('ep-objectif').value='';
      document.getElementById('ep-duree').value='';
      if(document.getElementById('ep-password'))document.getElementById('ep-password').value='';
      gb();
      loadEpargnes();
    }else toast(data.error||'Erreur','err');
  }catch(e){toast('Erreur','err');}
  btn.disabled=false;
  btn.textContent='Creer mon plan';
}'''

if old_create in html:
    html = html.replace(old_create, new_create)
    print("OK - creerEpargne mis à jour")
else:
    print("WARN - creerEpargne non trouvé")

# ══ FIX 4: Modifier retirerEpargne pour vérifier le mot de passe
old_retrait_confirm = '''async function confirmerRetraitEpargne(){
  var ep = window._epargnes ? window._epargnes[_epActionIdx] : null;
  if(!ep){ toast('Erreur','err'); return; }
  var montant = document.getElementById('ep-retrait-montant').value;
  var phone = document.getElementById('ep-retrait-phone').value.trim();
  if(!phone){ toast('Entrez votre numéro','err'); return; }
  var btn = event.target;
  btn.disabled = true;
  btn.innerHTML = '<div class="spin"></div> Envoi...';
  try{
    var body = {phone: phone};
    if(montant && !isNaN(montant)) body.montant_fcfa = parseInt(montant);
    var res = await fetch(API+'/api/zama/epargne/'+ep.epargne_id+'/retrait',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(body)
    });
    var data = await res.json();
    if(data.ok){
      toast(data.message||'Retrait enregistre !','ok');
      fermerRetraitModal();
      loadEpargnes();
    } else toast(data.error || 'Erreur','err');
  }catch(e){ toast('Erreur: '+e.message,'err'); }
  btn.disabled = false;
  btn.innerHTML = 'Demander le retrait';
}'''

new_retrait_confirm = '''async function confirmerRetraitEpargne(){
  var ep = window._epargnes ? window._epargnes[_epActionIdx] : null;
  if(!ep){ toast('Erreur','err'); return; }
  var montant = document.getElementById('ep-retrait-montant').value;
  var phone = document.getElementById('ep-retrait-phone').value.trim();
  var pwd = document.getElementById('ep-retrait-pwd') ? document.getElementById('ep-retrait-pwd').value.trim() : '';
  if(!phone){ toast('Entrez votre numero','err'); return; }
  // Vérifier mot de passe si l'épargne en a un
  if(ep.password && ep.password !== '' && pwd !== ep.password){
    toast('Mot de passe incorrect','err');
    return;
  }
  var btn = event.target;
  btn.disabled = true;
  btn.innerHTML = '<div class="spin"></div> Envoi...';
  try{
    var body = {phone: phone, password: pwd||null};
    if(montant && !isNaN(montant)) body.montant_fcfa = parseInt(montant);
    var res = await fetch(API+'/api/zama/epargne/'+ep.epargne_id+'/retrait',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(body)
    });
    var data = await res.json();
    if(data.ok){
      toast(data.message||'Retrait enregistre !','ok');
      fermerRetraitModal();
      loadEpargnes();
    } else toast(data.error || 'Erreur','err');
  }catch(e){ toast('Erreur: '+e.message,'err'); }
  btn.disabled = false;
  btn.innerHTML = 'Demander le retrait';
}'''

if old_retrait_confirm in html:
    html = html.replace(old_retrait_confirm, new_retrait_confirm)
    print("OK - confirmerRetraitEpargne mis à jour")

# ══ FIX 5: Ajouter champ mot de passe dans le modal retrait
old_retrait_modal_phone = '''    <div class="fg" style="padding:0;margin-bottom:16px">
      <label>Votre numéro Wave/OM *</label>
      <input class="finp" type="tel" id="ep-retrait-phone" placeholder="+221 77 XXX XX XX" inputmode="tel">
    </div>'''

new_retrait_modal_phone = '''    <div class="fg" style="padding:0;margin-bottom:12px">
      <label>Votre numéro Wave/OM *</label>
      <input class="finp" type="tel" id="ep-retrait-phone" placeholder="+221 77 XXX XX XX" inputmode="tel">
    </div>
    <div class="fg" id="ep-retrait-pwd-wrap" style="padding:0;margin-bottom:16px;display:none">
      <label>Mot de passe de l'épargne *</label>
      <input class="finp" type="password" id="ep-retrait-pwd" placeholder="Votre mot de passe secret">
    </div>'''

if old_retrait_modal_phone in html:
    html = html.replace(old_retrait_modal_phone, new_retrait_modal_phone)
    print("OK - champ pwd ajouté dans modal retrait")

# ══ FIX 6: Afficher le champ pwd dans retirerEpargne si l'épargne a un mot de passe
old_retirer = '''function retirerEpargne(i){
  _epActionIdx = i;
  var ep = window._epargnes ? window._epargnes[i] : null;
  if(!ep) return;
  var sub = document.getElementById('ep-retrait-sub');
  var phone = document.getElementById('ep-retrait-phone');
  var montant = document.getElementById('ep-retrait-montant');
  if(sub) sub.textContent = 'Solde disponible : ' + ep.solde_fcfa.toLocaleString('fr-FR') + ' FCFA';
  if(phone) phone.value = user ? user.phone || '' : '';
  if(montant) montant.value = '';
  var modal = document.getElementById('ep-retrait-modal');
  if(modal) modal.style.display = 'flex';
}'''

new_retirer = '''function retirerEpargne(i){
  _epActionIdx = i;
  var ep = window._epargnes ? window._epargnes[i] : null;
  if(!ep) return;
  var sub = document.getElementById('ep-retrait-sub');
  var phone = document.getElementById('ep-retrait-phone');
  var montant = document.getElementById('ep-retrait-montant');
  var pwdWrap = document.getElementById('ep-retrait-pwd-wrap');
  var pwd = document.getElementById('ep-retrait-pwd');
  if(sub) sub.textContent = 'Solde disponible : ' + ep.solde_fcfa.toLocaleString('fr-FR') + ' FCFA';
  if(phone) phone.value = user ? user.phone || '' : '';
  if(montant) montant.value = '';
  if(pwd) pwd.value = '';
  // Afficher champ mot de passe si l'épargne est protégée
  if(pwdWrap) pwdWrap.style.display = ep.password ? 'block' : 'none';
  var modal = document.getElementById('ep-retrait-modal');
  if(modal) modal.style.display = 'flex';
}'''

if old_retirer in html:
    html = html.replace(old_retirer, new_retirer)
    print("OK - retirerEpargne mis à jour")

with open('zama.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("\nTermine! Valider avec node --check")
