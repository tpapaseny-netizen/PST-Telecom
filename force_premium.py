#!/usr/bin/env python3
# Force insertion directe sans vérification "déjà présent"
import re

with open('zama.html', 'r', encoding='utf-8', errors='replace') as f:
    html = f.read()

print("Taille:", len(html))

# ── Balance Card ──
balance_html = '''
    <!-- BALANCE CARD -->
    <div class="balance-card" id="balance-card">
      <div class="balance-label">Activit&#233; ZAMA</div>
      <div class="balance-row">
        <div>
          <div class="balance-amount" id="bal-amount">0 FCFA</div>
          <div class="balance-sub" id="bal-sub">Total envoy&#233; via ZAMA</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:10px;color:rgba(255,255,255,.3);margin-bottom:4px">Ce mois</div>
          <div style="font-size:13px;font-weight:700;color:var(--green)" id="bal-month">+0 FCFA</div>
        </div>
      </div>
      <div class="balance-stats">
        <div class="bs-item"><div class="bs-val" id="bs-sent">0</div><div class="bs-lbl">Envois</div></div>
        <div class="bs-item"><div class="bs-val" id="bs-saved">0 FCFA</div><div class="bs-lbl">Economis&#233;</div></div>
        <div class="bs-item"><div class="bs-val">&lt; 2 min</div><div class="bs-lbl">Vitesse moy.</div></div>
      </div>
    </div>
'''

# ── Trust Badges ──
trust_html = '''
    <!-- TRUST BADGES -->
    <div class="trust-badges">
      <div class="tb"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>256-bit SSL</div>
      <div class="tb blue"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>99.9% uptime</div>
      <div class="tb gold"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20,6 9,17 4,12"/></svg>Anti-fraude</div>
      <div class="tb"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>Support 24/7</div>
    </div>
'''

# Trouver qa-grid avec regex flexible
m = re.search(r'(<div class="qa-grid")', html)
if m:
    pos = m.start()
    html = html[:pos] + balance_html + '\n    ' + html[pos:]
    print("P2 Balance card inseree ✅")
else:
    print("P2 ❌ qa-grid introuvable")

# Trouver "Taux en direct" avec regex flexible  
m2 = re.search(r'(<div class="slbl">[^<]*Taux en direct)', html)
if m2:
    pos2 = m2.start()
    html = html[:pos2] + trust_html + '\n    ' + html[pos2:]
    print("P3 Trust badges inseres ✅")
else:
    print("P3 ❌ Taux en direct introuvable")

# updateBalanceCard
if 'updateBalanceCard()' not in html:
    if 'window.addEventListener("load"' in html:
        html = html.replace(
            'loadSavedLogos();\n  user=loadU();',
            'loadSavedLogos();\n  user=loadU();',
            1
        )
    # Ajouter après fetchRates
    html = html.replace(
        'setInterval(fetchRates,60000);',
        'setInterval(fetchRates,60000);\n  setTimeout(updateBalanceCard,500);',
        1
    )
    print("P5 updateBalanceCard appel ✅")

with open('zama.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("\n✅ Force premium termine! Taille:", len(html))
print("balance-card:", 'balance-card' in html)
print("trust-badges:", 'trust-badges' in html)
