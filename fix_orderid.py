with open('zama.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Remplacer la vérification orderId dans cpLancerPaiement
# Au lieu de bloquer, on crée la commande si orderId est vide

old = """async function cpLancerPaiement(){
  if(!orderId){toast("Créez d'abord la commande",'err');return;}"""

new = """async function cpLancerPaiement(){
  // Si orderId vide, créer la commande d'abord
  if(!orderId){
    var amt=parseFloat(document.getElementById('s-amt')?document.getElementById('s-amt').value:0)||0;
    var rn=document.getElementById('r-name')?document.getElementById('r-name').value.trim():'';
    var rph=document.getElementById('r-phone')?document.getElementById('r-phone').value.trim():'';
    var sn=document.getElementById('s-name')?document.getElementById('s-name').value.trim():'';
    var se=document.getElementById('s-email')?document.getElementById('s-email').value.trim():'';
    if(!amt||!rn||!rph||!sn||!se){toast("Remplissez tous les champs d'abord",'err');return;}
    try{
      var rateV=rates[cK]||606;
      var net=Math.round(amt*rateV*(1-FEE));
      var res=await fetch(API+'/api/zama/create',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({src_currency:curr,amount:amt,rate_fcfa:rateV,net_fcfa:net,
          receiver_name:rn,receiver_phone:rph,receiver_mm:MM,
          sender_name:sn,sender_email:se,user_id:user?user.id:null})});
      var data=await res.json();
      if(data.order_id){orderId=data.order_id;saveOrder({order_id:orderId,src_currency:curr,amount:amt,net_fcfa:net,receiver_name:rn,receiver_phone:rph,receiver_mm:MM,status:'pending',created_at:new Date().toISOString()});}
    }catch(e){toast('Erreur commande: '+e.message,'err');return;}
  }
  if(!orderId){toast("Erreur: commande non créée",'err');return;}"""

if old in html:
    html = html.replace(old, new)
    print("OK - cpLancerPaiement corrige")
else:
    # Chercher variante sans accent
    old2 = "if(!orderId){toast(\"Cr\u00e9ez d'abord la commande\",'err');return;}"
    if old2 in html:
        html = html.replace(old2, new.split('\n  if(!orderId){toast("Erreur: commande non cr\u00e9\u00e9e")')[0].strip())
        print("OK - variante corrigee")
    else:
        print("Pattern non trouve - cherche manuellement...")
        idx = html.find('cpLancerPaiement')
        while idx != -1:
            snippet = html[idx:idx+200]
            print(f"Position {idx}: {repr(snippet[:100])}")
            idx = html.find('cpLancerPaiement', idx+1)

with open('zama.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("Termine!")
