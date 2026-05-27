import re

with open('zama.html', 'r', encoding='utf-8-sig') as f:
    content = f.read()

# ── 1. Remplacer le bloc style landing complet ────────────────────
start = content.find("<style>\n@import url('https://fonts.googleapis.com/css2?family=Sora")
end = content.find('</style>', start) + len('</style>')

if start < 0:
    print("ERREUR: bloc style landing non trouve")
    exit(1)

NEW_STYLE = """<style>
@import url('https://fonts.googleapis.com/css2?family=Sora:wght@300;400;600;700;800;900&display=swap');
#landing *{box-sizing:border-box;margin:0;padding:0;}
#landing{-webkit-overflow-scrolling:touch;color:#1C1917;}
.lnd-nav{position:fixed;top:0;left:0;right:0;z-index:100;display:flex;align-items:center;justify-content:space-between;padding:14px 24px;background:rgba(245,240,232,.94);backdrop-filter:blur(12px);border-bottom:1px solid rgba(28,25,23,.08);}
.lnd-logo{display:flex;align-items:center;gap:10px;}
.lnd-logo-icon{width:34px;height:34px;border-radius:10px;background:#1C1917;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:900;color:#F5F0E8;letter-spacing:-0.5px;}
.lnd-logo-txt{font-size:17px;font-weight:800;color:#1C1917;letter-spacing:1px;}
.lnd-cta-nav{padding:9px 20px;border-radius:50px;background:#1C1917;color:#F5F0E8;font-size:13px;font-weight:700;cursor:pointer;border:none;font-family:inherit;transition:opacity .15s;}
.lnd-cta-nav:hover{opacity:.85;}
.lnd-hero{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:100px 24px 60px;text-align:center;position:relative;overflow:hidden;background:#F5F0E8;}
.lnd-hero-bg{position:absolute;inset:0;background:radial-gradient(ellipse 70% 50% at 50% 0%,rgba(28,25,23,.05) 0%,transparent 60%);pointer-events:none;}
.lnd-pill{display:inline-flex;align-items:center;gap:6px;background:rgba(28,25,23,.07);border:1px solid rgba(28,25,23,.14);border-radius:50px;padding:6px 16px;font-size:12px;color:#57534e;font-weight:600;margin-bottom:28px;letter-spacing:.5px;}
.lnd-pill-dot{width:6px;height:6px;border-radius:50%;background:#22C55E;animation:lnd-pulse 2s infinite;}
@keyframes lnd-pulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:.5;transform:scale(.8);}}
.lnd-h1{font-size:clamp(34px,8vw,62px);font-weight:900;color:#1C1917;line-height:1.05;margin-bottom:20px;letter-spacing:-1.5px;}
.lnd-h1 span{position:relative;display:inline-block;}
.lnd-h1 span::after{content:'';position:absolute;bottom:-3px;left:0;right:0;height:3px;background:#1C1917;border-radius:2px;}
.lnd-sub{font-size:clamp(15px,3vw,18px);color:#78716c;line-height:1.7;max-width:520px;margin:0 auto 36px;}
.lnd-btns{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin-bottom:48px;}
.lnd-btn-main{padding:16px 32px;border-radius:50px;background:#1C1917;color:#F5F0E8;font-size:16px;font-weight:800;cursor:pointer;border:none;font-family:inherit;transition:transform .15s,box-shadow .15s;box-shadow:0 4px 24px rgba(28,25,23,.25);}
.lnd-btn-main:hover{transform:translateY(-2px);box-shadow:0 8px 32px rgba(28,25,23,.35);}
.lnd-btn-ghost{padding:16px 32px;border-radius:50px;background:transparent;color:#1C1917;font-size:16px;font-weight:700;cursor:pointer;border:1.5px solid rgba(28,25,23,.25);font-family:inherit;transition:all .15s;}
.lnd-btn-ghost:hover{border-color:#1C1917;background:rgba(28,25,23,.05);}
.lnd-rate-pill{display:inline-flex;align-items:center;gap:8px;background:#fff;border:1px solid rgba(28,25,23,.1);border-radius:12px;padding:10px 18px;font-size:13px;color:#78716c;box-shadow:0 2px 12px rgba(28,25,23,.06);}
.lnd-rate-pill strong{color:#1C1917;font-size:15px;}
.lnd-phone-mock{display:none;}
.lnd-phone-inner{display:none;}
.lnd-phone-bar{display:none;}
.lnd-features{padding:80px 24px;max-width:900px;margin:0 auto;background:#F5F0E8;}
.lnd-feat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px;margin-top:40px;}
.lnd-feat-card{background:#fff;border:1px solid rgba(28,25,23,.08);border-radius:20px;padding:24px;transition:all .2s;box-shadow:0 2px 8px rgba(28,25,23,.04);}
.lnd-feat-card:hover{border-color:rgba(28,25,23,.2);transform:translateY(-3px);box-shadow:0 8px 24px rgba(28,25,23,.1);}
.lnd-feat-ico{width:44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;margin-bottom:16px;font-size:20px;background:rgba(28,25,23,.06);}
.lnd-feat-title{font-size:15px;font-weight:700;color:#1C1917;margin-bottom:8px;}
.lnd-feat-desc{font-size:13px;color:#78716c;line-height:1.7;}
.lnd-services{padding:60px 24px;max-width:900px;margin:0 auto;background:#F5F0E8;}
.lnd-serv-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-top:32px;}
.lnd-serv-card{border-radius:18px;padding:22px;cursor:pointer;transition:all .2s;background:#fff;border:1px solid rgba(28,25,23,.08);box-shadow:0 2px 8px rgba(28,25,23,.04);}
.lnd-serv-card:hover{transform:scale(1.02);box-shadow:0 8px 24px rgba(28,25,23,.1);}
.lnd-section-tag{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:#a8a29e;margin-bottom:12px;}
.lnd-section-title{font-size:clamp(24px,5vw,36px);font-weight:800;color:#1C1917;line-height:1.2;}
.lnd-taux{padding:60px 24px;max-width:900px;margin:0 auto;background:#F5F0E8;}
.lnd-taux-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:24px;}
.lnd-taux-card{background:#fff;border:1px solid rgba(28,25,23,.08);border-radius:14px;padding:16px;text-align:center;box-shadow:0 2px 8px rgba(28,25,23,.04);}
.lnd-taux-flag{font-size:22px;margin-bottom:6px;}
.lnd-taux-code{font-size:11px;color:#a8a29e;margin-bottom:4px;font-weight:600;letter-spacing:.5px;}
.lnd-taux-val{font-size:18px;font-weight:800;color:#1C1917;}
.lnd-cta-section{padding:80px 24px;text-align:center;position:relative;overflow:hidden;background:#1C1917;}
.lnd-cta-bg{display:none;}
.lnd-footer{padding:32px 24px;border-top:1px solid rgba(28,25,23,.08);text-align:center;color:#a8a29e;font-size:12px;line-height:1.8;background:#F5F0E8;}
</style>"""

content = content[:start] + NEW_STYLE + content[end:]

# ── 2. Fond du div landing ────────────────────────────────────────
content = content.replace(
    "background:#04080F;font-family:'Sora',sans-serif",
    "background:#F5F0E8;font-family:'Sora',sans-serif"
)

# ── 3. Textes CTA section ─────────────────────────────────────────
content = content.replace(
    "color:rgba(255,255,255,.45);font-size:15px;margin-bottom:32px;font-family:'Sora',sans-serif",
    "color:rgba(245,240,232,.5);font-size:15px;margin-bottom:32px;font-family:'Sora',sans-serif"
)
content = content.replace(
    'class="lnd-btn-main" style="font-size:17px;padding:18px 40px" onclick="entrerDansApp()">\n    🚀 Ouvrir ZAMA maintenant\n  </button>\n  <div style="margin-top:20px;font-size:12px;color:rgba(255,255,255,.25)">',
    'style="padding:18px 44px;border-radius:50px;background:#F5F0E8;color:#1C1917;font-size:17px;font-weight:800;cursor:pointer;border:none;font-family:inherit;box-shadow:0 4px 24px rgba(0,0,0,.3)" onclick="entrerDansApp()">Ouvrir ZAMA maintenant →</button>\n  <div style="margin-top:20px;font-size:12px;color:rgba(245,240,232,.25)">'
)

# ── 4. Section title CTA ──────────────────────────────────────────
content = content.replace(
    'class="lnd-section-title" style="margin-bottom:16px">Prêt à commencer ?</h2>',
    'class="lnd-section-title" style="margin-bottom:16px;color:#F5F0E8">Prêt à commencer ?</h2>'
)

# ── 5. Section tag CTA ────────────────────────────────────────────
content = content.replace(
    'class="lnd-section-tag">Gratuit · Sans engagement</div>\n  <h2 class="lnd-section-title" style="margin-bottom:16px;color:#F5F0E8">',
    'class="lnd-section-tag" style="color:rgba(245,240,232,.4)">Gratuit · Sans engagement</div>\n  <h2 class="lnd-section-title" style="margin-bottom:16px;color:#F5F0E8">'
)

# ── 6. Footer ─────────────────────────────────────────────────────
content = content.replace(
    "color:rgba(255,255,255,.5);margin-bottom:8px\">ZAMA by PST Telecom",
    "color:#57534e;margin-bottom:8px\">ZAMA by PST Telecom"
)
content = content.replace(
    "color:rgba(245,176,20,.6);text-decoration:none\">support@zama-sn.com",
    "color:#78716c;text-decoration:none\">support@zama-sn.com"
)

# ── 7. initLanding : toujours montrer si pas connecte ────────────
content = content.replace(
    """function initLanding() {
  var user = loadU();
  var skipLanding = localStorage.getItem('zama_skip_landing');
  if (!user && !skipLanding) {
    afficherLanding();
  } else if (skipLanding) {
    // Déjà visité, aller direct dans l'app
    checkPinLoad();
  } else {
    // Connecté, aller direct dans l'app
    checkPinLoad();
  }
}""",
    """function initLanding() {
  var user = loadU();
  if (!user) {
    afficherLanding();
  } else {
    checkPinLoad();
  }
}"""
)

# ── 8. entrerDansApp : ne plus stocker skip_landing ──────────────
content = content.replace(
    "localStorage.setItem('zama_skip_landing', '1');\n  checkPinLoad();",
    "checkPinLoad();"
)

with open('zama.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("OK: patch applique !")
