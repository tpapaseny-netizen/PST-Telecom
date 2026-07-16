# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v146 (connexion : accroche + features + confiance)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v146 — confiance & envie sur la connexion")

# 1) Accroche plus chaleureuse
s=R(s,'<div class="auth-logo-sub">Messagerie mondiale</div>',
      '<div class="auth-logo-sub">La messagerie qui vous rapproche</div>',
      "Accroche")

# 2) CSS features + confiance (apres le bloc auth)
s=R(s,"#screen-auth .af-userstat.no{ color:#FF6B6B; }",
      "#screen-auth .af-userstat.no{ color:#FF6B6B; }\n"
      "#screen-auth .auth-features{ display:flex; flex-wrap:wrap; justify-content:center; gap:8px; margin-top:22px; animation:authFieldIn .5s ease both; animation-delay:.5s; }\n"
      "#screen-auth .auth-feat{ display:flex; align-items:center; gap:6px; font-size:12px; font-weight:600; color:rgba(255,255,255,.72); background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.07); border-radius:20px; padding:7px 12px; }\n"
      "#screen-auth .auth-feat svg{ width:14px; height:14px; color:#00C896; flex-shrink:0; }\n"
      "#screen-auth .auth-trust{ display:flex; flex-wrap:wrap; justify-content:center; align-items:center; gap:14px; margin-top:16px; font-size:12px; color:rgba(255,255,255,.52); animation:authFieldIn .5s ease both; animation-delay:.58s; }\n"
      "#screen-auth .auth-trust span{ display:flex; align-items:center; gap:5px; }\n"
      "#screen-auth .auth-trust svg{ width:13px; height:13px; color:#00C896; flex-shrink:0; }",
      "CSS features + confiance")

# 3) Markup features + confiance (apres la carte, dans auth-wrap)
OLD='''        <div class="auth-terms">En créant un compte, vous acceptez nos <a href="#" onclick="return false">Conditions</a> et notre <a href="#" onclick="return false">Politique de confidentialité</a>.</div>
      </div>
    </div>
  </div>
</div>'''
NEW='''        <div class="auth-terms">En créant un compte, vous acceptez nos <a href="#" onclick="return false">Conditions</a> et notre <a href="#" onclick="return false">Politique de confidentialité</a>.</div>
      </div>
    </div>
    <div class="auth-features">
      <div class="auth-feat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>Messages &amp; vocaux</div>
      <div class="auth-feat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/></svg>Statuts</div>
      <div class="auth-feat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></svg>Canaux</div>
      <div class="auth-feat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/><path d="M19.1 4.9C23 8.8 23 15.1 19.1 19"/></svg>Radio en direct</div>
    </div>
    <div class="auth-trust">
      <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>100% gratuit</span>
      <span>🇸🇳 Conçu au Sénégal</span>
      <span><svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>Inscription en 30 s</span>
    </div>
  </div>
</div>'''
s=R(s,OLD,NEW,"Markup features + confiance")

# 4) Build bump
s=R(s,"console.log('PENC build v145 (refonte premium page de connexion)');",
      "console.log('PENC build v146 (connexion: accroche, features, confiance)');","Build -> v146")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v146.")
