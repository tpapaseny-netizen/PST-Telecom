# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v142 (#5 reactions premium SVG + picker)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v142 — reactions premium")

# 1) CSS reactions + picker
s=R(s,".ch-post-react-pill{background:var(--card2);border-radius:20px;padding:3px 8px;font-size:12px;cursor:pointer;}",
      ".ch-post-react-pill{background:var(--card2);border-radius:20px;padding:3px 8px;font-size:12px;cursor:pointer;}\n"
      ".ch-react-btn{display:inline-flex;align-items:center;gap:4px;background:var(--card2);border:1px solid transparent;border-radius:20px;padding:4px 9px;cursor:pointer;font-size:12px;color:var(--muted);transition:transform .2s,background .2s,border-color .2s;}\n"
      ".ch-react-btn:active{transform:scale(.92);}\n"
      ".ch-react-btn.heart.active{background:rgba(255,59,92,.12);border-color:rgba(255,59,92,.35);color:#FF3B5C;}\n"
      ".ch-react-btn.thumb.active{background:rgba(45,156,255,.12);border-color:rgba(45,156,255,.35);color:#2D9CFF;}\n"
      ".ch-react-btn .ch-react-n{font-weight:700;}\n"
      ".ch-react-plus{display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:var(--card2);border:none;cursor:pointer;transition:transform .2s;}\n"
      ".ch-react-plus:active{transform:scale(.9);}\n"
      ".ch-react-picker{position:fixed;z-index:99900;display:flex;gap:2px;background:#1F1F1F;border:1px solid rgba(255,255,255,.1);border-radius:24px;padding:6px;box-shadow:0 8px 28px rgba(0,0,0,.45);opacity:0;transform:translateY(6px) scale(.96);transition:opacity .2s,transform .2s;}\n"
      ".ch-react-picker.show{opacity:1;transform:translateY(0) scale(1);}\n"
      ".ch-rp-emo{background:none;border:none;font-size:22px;cursor:pointer;width:38px;height:38px;border-radius:50%;transition:transform .15s,background .15s;line-height:1;}\n"
      ".ch-rp-emo:hover{background:rgba(255,255,255,.08);transform:scale(1.2);}",
      "CSS reactions premium")

# 2) Fonctions picker (avant buildChPost)
PK=(r'''function _chReactPicker(ev,chId,pid){
  try{ ev.stopPropagation(); }catch(_){}
  var old=document.getElementById('chReactPicker'); if(old) old.remove();
  var emojis=['❤️','👍','😂','😮','😢','🙏','🔥','👏'];
  var pk=document.createElement('div'); pk.id='chReactPicker'; pk.className='ch-react-picker';
  pk.innerHTML=emojis.map(function(em){ return '<button class="ch-rp-emo" onclick="_chPickReact(\''+chId+'\',\''+pid+'\',\''+em+'\')">'+em+'</button>'; }).join('');
  document.body.appendChild(pk);
  var r=ev.currentTarget.getBoundingClientRect();
  var pw=Math.min(window.innerWidth-16, emojis.length*42+16);
  var left=Math.max(8, Math.min(window.innerWidth-pw-8, r.left+r.width/2-pw/2));
  var top=r.top-52; if(top<8) top=r.bottom+8;
  pk.style.left=left+'px'; pk.style.top=top+'px';
  requestAnimationFrame(function(){ pk.classList.add('show'); });
  setTimeout(function(){ document.addEventListener('click',_chClosePicker,{once:true}); },10);
}
function _chClosePicker(){ var p=document.getElementById('chReactPicker'); if(p){ p.classList.remove('show'); setTimeout(function(){ if(p&&p.parentNode) p.remove(); },180); } }
function _chPickReact(chId,pid,em){ var p=document.getElementById('chReactPicker'); if(p) p.remove(); reactChPost(chId,pid,em); }
function buildChPost(p,chId,isCreator){''')
s=R(s,"function buildChPost(p,chId,isCreator){",PK,"Fonctions picker")

# 3) Remplacer la construction des reactions
OLD=(r'''  var rHtml=Object.keys(p.reactions||{}).map(function(em){
    return '<span class="ch-post-react-pill" onclick="reactChPost(\''+chId+'\',\''+p.id+'\',\''+em+'\')">'+em+' '+(p.reactions[em]||[]).length+'</span>';
  }).join('');
  rHtml+='<span class="ch-post-react-pill" onclick="reactChPost(\''+chId+'\',\''+p.id+'\',\'\u2764\ufe0f\')">+👍</span>';''')
NEW=(r'''  var R=p.reactions||{};
  var _myId=String(ME&&ME.id);
  var _hA=(R['❤️']||[]).map(String).indexOf(_myId)>-1, _hN=(R['❤️']||[]).length;
  var _tA=(R['👍']||[]).map(String).indexOf(_myId)>-1, _tN=(R['👍']||[]).length;
  var _heartSvg=_hA?'<svg width="17" height="17" viewBox="0 0 24 24" fill="#FF3B5C" stroke="#FF3B5C" stroke-width="1.5"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>':'<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#8A9BB0" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/></svg>';
  var _thumbSvg=_tA?'<svg width="17" height="17" viewBox="0 0 24 24" fill="#2D9CFF" stroke="#2D9CFF" stroke-width="1.5" stroke-linejoin="round"><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/></svg>':'<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#8A9BB0" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/></svg>';
  var _otherR=Object.keys(R).filter(function(em){ return em!=='❤️'&&em!=='👍'&&(R[em]||[]).length>0; }).map(function(em){
    return '<span class="ch-post-react-pill" onclick="reactChPost(\''+chId+'\',\''+p.id+'\',\''+em+'\')">'+em+' '+(R[em]||[]).length+'</span>';
  }).join('');
  var rHtml='<button class="ch-react-btn heart'+(_hA?' active':'')+'" onclick="reactChPost(\''+chId+'\',\''+p.id+'\',\'❤️\')">'+_heartSvg+(_hN?'<span class="ch-react-n">'+_hN+'</span>':'')+'</button>'
    +'<button class="ch-react-btn thumb'+(_tA?' active':'')+'" onclick="reactChPost(\''+chId+'\',\''+p.id+'\',\'👍\')">'+_thumbSvg+(_tN?'<span class="ch-react-n">'+_tN+'</span>':'')+'</button>'
    +'<button class="ch-react-plus" onclick="_chReactPicker(event,\''+chId+'\',\''+p.id+'\')"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8A9BB0" stroke-width="1.8" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>'
    +_otherR;''')
s=R(s,OLD,NEW,"Construction reactions premium")

# 4) Build bump
s=R(s,"console.log('PENC build v141 (bouton stop vocal premium)');",
      "console.log('PENC build v142 (reactions premium SVG + picker)');","Build -> v142")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v142.")
