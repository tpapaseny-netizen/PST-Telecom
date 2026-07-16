# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v148 (accueil de bienvenue apres inscription)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v148 — accueil bienvenue")

# 1) CSS de l'accueil
s=R(s,"#screen-auth .auth-trust svg{ width:13px; height:13px; color:#00C896; flex-shrink:0; }",
      "#screen-auth .auth-trust svg{ width:13px; height:13px; color:#00C896; flex-shrink:0; }\n"
      ".pwelcome-ov{position:fixed;inset:0;z-index:99950;background:rgba(0,0,0,.72);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:22px;opacity:0;transition:opacity .3s;}\n"
      ".pwelcome-ov.show{opacity:1;}\n"
      ".pwelcome-card{width:100%;max-width:380px;background:#0D1B2A;border:1px solid rgba(0,200,150,.2);border-radius:26px;padding:34px 26px;box-shadow:0 30px 80px rgba(0,0,0,.6);text-align:center;transform:translateY(16px) scale(.97);transition:transform .35s cubic-bezier(.2,.8,.3,1.1);}\n"
      ".pwelcome-ov.show .pwelcome-card{transform:translateY(0) scale(1);}\n"
      ".pwelcome-title{font-size:22px;font-weight:800;color:#fff;margin-bottom:6px;}\n"
      ".pwelcome-sub{font-size:13.5px;color:rgba(255,255,255,.6);margin-bottom:20px;line-height:1.4;}\n"
      ".pwelcome-feats{text-align:left;display:flex;flex-direction:column;gap:13px;margin-bottom:24px;}\n"
      ".pwelcome-feat{display:flex;align-items:center;gap:12px;font-size:14px;color:rgba(255,255,255,.85);font-weight:500;}\n"
      ".pwelcome-feat svg{width:20px;height:20px;color:#00C896;flex-shrink:0;}\n"
      ".pwelcome-btn{width:100%;height:52px;border:none;border-radius:16px;background:linear-gradient(135deg,#00C896,#2D9CFF);color:#fff;font-size:16px;font-weight:700;letter-spacing:.3px;cursor:pointer;box-shadow:0 10px 26px rgba(0,200,150,.35);transition:transform .15s;}\n"
      ".pwelcome-btn:active{transform:scale(.97);}",
      "CSS accueil")

# 2) Fonctions de l'accueil (avant doRegister)
FNS=(r'''function _pencWelcome(){
  try{ if(localStorage.getItem('penc_welcomed')) return; localStorage.setItem('penc_welcomed','1'); }catch(e){}
  var nm=''; try{ if(ME&&ME.full_name) nm=' '+ME.full_name.split(' ')[0]; }catch(e){}
  function _wf(p,t){ return '<div class="pwelcome-feat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">'+p+'</svg><span>'+t+'</span></div>'; }
  var feats=_wf('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>','Discute en privé ou en groupe')
    +_wf('<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>','Envoie des vocaux et des photos')
    +_wf('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>','Partage tes statuts éphémères')
    +_wf('<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>','Crée et suis des canaux')
    +_wf('<path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/><path d="M19.1 4.9C23 8.8 23 15.1 19.1 19"/>','Écoute la radio en direct');
  var ov=document.createElement('div'); ov.id='pencWelcomeOv'; ov.className='pwelcome-ov';
  ov.innerHTML='<div class="pwelcome-card">'
    +'<div style="width:64px;height:64px;border-radius:18px;background:linear-gradient(135deg,#00C896,#2D9CFF);display:flex;align-items:center;justify-content:center;font-size:34px;font-weight:800;color:#fff;font-family:Syne,sans-serif;box-shadow:0 8px 24px rgba(0,200,150,.4);margin:0 auto 14px;">P</div>'
    +'<div class="pwelcome-title">Bienvenue'+esc(nm)+' 🎉</div>'
    +'<div class="pwelcome-sub">Ravi de t\'accueillir sur Penc. Voici ce qui t\'attend :</div>'
    +'<div class="pwelcome-feats">'+feats+'</div>'
    +'<button class="pwelcome-btn" onclick="_pencCloseWelcome()">Commencer</button>'
  +'</div>';
  document.body.appendChild(ov);
  requestAnimationFrame(function(){ ov.classList.add('show'); });
}
function _pencCloseWelcome(){ var o=document.getElementById('pencWelcomeOv'); if(o){ o.classList.remove('show'); setTimeout(function(){ if(o&&o.parentNode) o.remove(); },300); } }
async function doRegister() {''')
s=R(s,"async function doRegister() {",FNS,"Fonctions accueil")

# 3) Declencher l'accueil apres inscription reussie
s=R(s,"""    const r = await api('/auth/register','POST',{full_name:name,username:uname,phone,email,password:pw});
    if(r.error) throw new Error(r.error);
    saveSession(r.user, r.token);
    showScreen('screen-main'); initSocket(); initCallSocket();""",
      """    const r = await api('/auth/register','POST',{full_name:name,username:uname,phone,email,password:pw});
    if(r.error) throw new Error(r.error);
    saveSession(r.user, r.token);
    showScreen('screen-main'); initSocket(); initCallSocket();
    _pencWelcome();""",
      "Hook accueil")

# 4) Build bump
s=R(s,"console.log('PENC build v147 (connexion: fond aurora anime premium)');",
      "console.log('PENC build v148 (accueil de bienvenue apres inscription)');","Build -> v148")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v148.")
