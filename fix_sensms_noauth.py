with open('sensms.html', 'r', encoding='utf-8') as f:
    content = f.read()

import re

# 1. Supprimer le modal auth entier
content = re.sub(r'<!-- ══════ AUTH MODAL ══════ -->.*?<!-- ══════ NAV ══════ -->', '<!-- ══════ NAV ══════ -->', content, flags=re.DOTALL)

# 2. Dans showDashboard, supprimer la vérification user/auth
old_show = """function showDashboard(packId) {
  var user = null;
  try { user = JSON.parse(localStorage.getItem('sensms_user')); } catch(e) {}
  if (!user) {
    showAuthModal();
    window._pendingPack = packId;
    return;
  }
  document.getElementById('dashboard-section').classList.add('active');"""

new_show = """function showDashboard(packId) {
  document.getElementById('dashboard-section').classList.add('active');"""

if old_show in content:
    content = content.replace(old_show, new_show)
    print("✅ Vérification auth supprimée dans showDashboard")
else:
    # Remplacement regex
    content = re.sub(
        r"function showDashboard\(packId\) \{.*?document\.getElementById\('dashboard-section'\)\.classList\.add\('active'\);",
        "function showDashboard(packId) {\n  document.getElementById('dashboard-section').classList.add('active');",
        content, flags=re.DOTALL, count=1
    )
    print("✅ showDashboard simplifié via regex")

# 3. Supprimer le bloc script auth (sensmsLogin, sensmsRegister, etc.)
content = re.sub(r'<script>\n// ── AUTH ─+.*?</script>', '', content, flags=re.DOTALL)

# 4. Supprimer nav-auth-btn et son onclick
content = content.replace(
    '<li><span id="nav-auth-btn" style="color:var(--green);font-size:14px;font-weight:600;cursor:pointer"></span></li>',
    ''
)

# 5. Supprimer les CSS auth inutiles (garder les variables)
content = re.sub(r'/\* ══+\s*AUTH MODAL[^*]*\*+/.*?\.auth-skip:hover span \{ text-decoration: underline; \}', 
                 '', content, flags=re.DOTALL)

with open('sensms.html', 'w', encoding='utf-8') as f:
    f.write(content)

print("✅ Auth supprimée de sensms.html")
print(f"Taille finale: {len(content)} chars")

# Vérification
checks = ['showAuthModal', 'sensmsLogin', 'sensmsRegister', 'auth-card', 'sensms-auth-modal']
for c in checks:
    status = '❌ encore présent' if c in content else '✅ supprimé'
    print(f"  {c}: {status}")
