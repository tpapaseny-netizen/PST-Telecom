with open('zama.html', 'r', encoding='utf-8') as f:
    html = f.read()

# Dans cpLancerPaiement, si l'API retourne une erreur,
# fallback vers le POS izichange directement dans le navigateur

old = """    if (!data.ok || !data.address) throw new Error(data.error || 'Adresse non generee');
    _cpIziId = data.izi_id; _cpAddr = data.address; _cpAmt = data.amount_crypto; _cpNet = data.network || _cpNet;
    _cpShowAddr();
  } catch (err) { _cpShowStep('choose'); toast('Erreur: ' + err.message, 'err'); }"""

new = """    if (!data.ok) throw new Error(data.error || 'Erreur API');

    // Si on a une adresse directe
    if (data.address) {
      _cpIziId = data.izi_id;
      _cpAddr = data.address;
      _cpAmt = data.amount_crypto || amount_usd;
      _cpNet = data.network || _cpNet;
      _cpShowAddr();
      return;
    }

    // Si on a une URL de redirection
    if (data.redirect_url) {
      _cpShowStep('choose');
      toast('Redirection vers izichangePay...', 'info');
      setTimeout(function() { window.open(data.redirect_url, '_blank'); }, 500);
      return;
    }

    throw new Error(data.error || 'Adresse non generee');
  } catch (err) {
    _cpShowStep('choose');
    // Fallback: ouvrir le POS izichange directement
    var posUrl = 'https://pay.izichange.com/pos/a1b8f972-befb-4186-b0e6-45c982750402?memo=' + (orderId || 'ZAMA');
    toast('Ouverture izichangePay...', 'info');
    setTimeout(function() { window.open(posUrl, '_blank'); }, 800);
  }"""

if old in html:
    html = html.replace(old, new)
    print("OK - fallback POS ajoute")
else:
    print("Pattern non trouve")
    idx = html.find('Adresse non generee')
    if idx >= 0:
        print("Context:", repr(html[idx-200:idx+100]))

with open('zama.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("Termine!")
