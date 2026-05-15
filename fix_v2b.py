#!/usr/bin/env python3
import re

with open('zama.html', 'r', encoding='utf-8', errors='replace') as f:
    html = f.read()

# ── 1. Slogan animé — insérer après rate-pill ──
if 'slogan-strip' not in html:
    slogan = '\n      <div class="slogan-strip"><div class="slogan-pill sp-crypto">&#128176; Crypto</div><span class="sp-arrow"> &#8594; </span><div class="slogan-pill sp-zama">&#9733; ZAMA</div><span class="sp-arrow"> &#8594; </span><div class="slogan-pill sp-mm">Wave / OM</div><span class="sp-time">en 30 min</span></div>'
    # Trouver la fin du rate-pill
    m = re.search(r'(class="rate-pill"[^<]*(?:<[^/][^>]*>[^<]*</[^>]+>)*</div>)', html)
    if m:
        pos = m.end()
        html = html[:pos] + slogan + html[pos:]
        print("P2 Slogan inséré ✅")
    else:
        # Fallback: après </div> de rate-pill
        html = html.replace(
            'FCFA · temps r&#233;el</div>',
            'FCFA · temps r&#233;el</div>' + slogan,
            1
        )
        if 'slogan-strip' in html:
            print("P2 Slogan inséré (fallback) ✅")
        else:
            html = html.replace(
                'FCFA · temps réel</div>',
                'FCFA · temps réel</div>' + slogan,
                1
            )
            print("P2 Slogan inséré (fallback2):", 'slogan-strip' in html)

# ── 2. Notif popup + Username modal avant toast ──
notif_html = """
<!-- NOTIF POPUP -->
<div class="notif-pop" id="notif-pop">
  <div class="notif-ico" id="notif-ico">&#128178;</div>
  <div class="notif-txt">
    <div class="notif-title" id="notif-title">Notification</div>
    <div class="notif-sub" id="notif-sub">ZAMA</div>
  </div>
</div>

<!-- USERNAME MODAL -->
<div class="username-modal" id="username-modal">
  <div class="username-sheet">
    <div style="text-align:center;margin-bottom:16px">
      <div style="font-size:18px;font-weight:700">Choisir mon @username</div>
      <div style="font-size:12px;color:var(--text3);margin-top:4px">Identifiant unique pour recevoir</div>
    </div>
    <div style="position:relative;margin-bottom:8px">
      <span style="position:absolute;left:14px;top:50%;transform:translateY(-50%);font-size:16px;font-weight:700;color:var(--gold)">@</span>
      <input class="finp" type="text" id="un-input" placeholder="tonnom" style="padding-left:32px;font-size:16px;font-weight:700" oninput="checkUsername(this.value)" maxlength="20">
    </div>
    <div class="un-preview" id="un-preview">@tonnom</div>
    <div class="un-avail" id="un-avail">Entrez un username (3-20 car.)</div>
    <button class="btn-p" style="width:100%;margin:8px 0" onclick="saveUsername()">Confirmer</button>
    <button style="width:100%;padding:12px;background:var(--s3);border:1px solid var(--border);color:var(--text2);border-radius:var(--rsm);cursor:pointer;font-family:var(--font)" onclick="document.getElementById('username-modal').classList.remove('open')">Annuler</button>
  </div>
</div>
"""

if 'notif-pop' not in html or 'username-modal' not in html:
    # Trouver le toast div
    toast_pos = html.find('<div class="toast"')
    if toast_pos > 0:
        html = html[:toast_pos] + notif_html + '\n' + html[toast_pos:]
        print("P3+P4 Notif + Username modal insérés ✅")
    else:
        # Avant </div>\n</body>
        html = html.replace('</div>\n</body>', notif_html + '\n</div>\n</body>', 1)
        print("P3+P4 insérés (fallback) ✅")

# ── 3. renderUsername dans renderAcct ──
if 'renderUsername()' not in html:
    html = html.replace(
        'var ki=document.getElementById("kyc-item");if(ki)ki.style.display=user.kyc?"none":"flex";}else{',
        'var ki=document.getElementById("kyc-item");if(ki)ki.style.display=user.kyc?"none":"flex";renderUsername();}else{',
        1
    )
    print("P7 renderUsername ✅")

with open('zama.html', 'w', encoding='utf-8') as f:
    f.write(html)

print("\n✅ Fix v2 terminé! Taille:", len(html))
print("slogan-strip:", 'slogan-strip' in html)
print("notif-pop:", 'notif-pop' in html)
print("username-modal:", 'username-modal' in html)
