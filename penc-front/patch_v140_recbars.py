# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v140 (#3 bandeaux enregistrement + envoi vocal premium)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v140 — bandeaux vocaux premium")

# 1) CSS premium (remplace l'ancien bloc .rec-bar)
OLDCSS=(".rec-bar{display:none;align-items:center;gap:9px;background:rgba(220,38,38,0.1);border:1px solid rgba(220,38,38,0.3);border-radius:11px;padding:8px 12px;margin-bottom:7px;}\n"
".rec-bar.show{display:flex;}\n"
".rec-dot{width:9px;height:9px;border-radius:50%;background:var(--danger);animation:pulse 1s infinite;}\n"
".rec-time{font-size:13px;font-weight:700;color:var(--danger);flex:1;}\n"
".rec-cancel{font-size:12px;color:var(--muted);cursor:pointer;}")
NEWCSS=(".rec-bar{display:flex;align-items:center;gap:11px;background:#1A1A1A;border-left:3px solid #FF6B00;border-radius:12px;padding:0 14px;margin-bottom:0;max-height:0;opacity:0;overflow:hidden;transform:translateY(6px);transition:max-height .25s ease,opacity .25s ease,transform .25s ease,padding .25s ease,margin .25s ease;box-shadow:0 4px 14px rgba(0,0,0,.25);}\n"
".rec-bar.show{max-height:64px;opacity:1;transform:translateY(0);padding:10px 14px;margin-bottom:7px;}\n"
".rec-mic-ic{color:#FF6B00;flex-shrink:0;display:flex;animation:recPulse 1.3s ease-in-out infinite;}\n"
".rec-txt{display:flex;flex-direction:column;flex:1;min-width:0;}\n"
".rec-txt-main{font-size:14px;font-weight:700;color:#fff;line-height:1.2;}\n"
".rec-time{font-size:12px;font-weight:600;color:#8A9BB0;}\n"
".rec-cancel{font-size:12px;color:#8A9BB0;cursor:pointer;display:flex;align-items:center;gap:4px;flex-shrink:0;transition:color .2s;}\n"
".rec-cancel:active{color:#FF4444;}\n"
"@keyframes recPulse{0%,100%{transform:scale(1);opacity:1;}50%{transform:scale(1.18);opacity:.65;}}\n"
".voc-send-bar{display:flex;align-items:center;gap:11px;background:#1A1A1A;border-left:3px solid #00C896;border-radius:12px;padding:0 14px;margin-bottom:0;max-height:0;opacity:0;overflow:hidden;transform:translateY(6px);transition:max-height .25s ease,opacity .25s ease,transform .25s ease,padding .25s ease,margin .25s ease;box-shadow:0 4px 14px rgba(0,0,0,.25);}\n"
".voc-send-bar.show{max-height:64px;opacity:1;transform:translateY(0);padding:10px 14px;margin-bottom:7px;}\n"
".voc-send-ic{color:#00C896;flex-shrink:0;display:flex;animation:vocSpin 1.2s linear infinite;}\n"
"@keyframes vocSpin{from{transform:rotate(0);}to{transform:rotate(360deg);}}")
s=R(s,OLDCSS,NEWCSS,"CSS bandeaux premium")

# 2) Markup : recBar premium + vocSendBar
OLDMK='''    <div class="rec-bar" id="recBar"><div class="rec-dot"></div><span class="rec-time" id="recTime">0:00</span><span class="rec-cancel" onclick="cancelRec()">Annuler ✕</span></div>'''
NEWMK=('''    <div class="rec-bar" id="recBar"><span class="rec-mic-ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg></span><div class="rec-txt"><span class="rec-txt-main">Enregistrement…</span><span class="rec-time" id="recTime">0:00</span></div><span class="rec-cancel" onclick="cancelRec()"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Annuler</span></div>
    <div class="voc-send-bar" id="vocSendBar"><span class="voc-send-ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/></svg></span><div class="rec-txt"><span class="rec-txt-main">Envoi du vocal…</span><span class="rec-time">Patiente un instant</span></div></div>''')
s=R(s,OLDMK,NEWMK,"Markup bandeaux")

# 3) JS : afficher/masquer le bandeau d'envoi autour de l'upload
s=R(s,'''    if(recSecs<1) return;
    await uploadAndSend(blob,'voice','audio/webm');''',
      '''    if(recSecs<1) return;
    var _vsb=document.getElementById('vocSendBar'); if(_vsb) _vsb.classList.add('show');
    try{ await uploadAndSend(blob,'voice','audio/webm'); }
    finally{ if(_vsb) _vsb.classList.remove('show'); }''',
      "Hook bandeau envoi")

# 4) Build bump
s=R(s,"console.log('PENC build v139 (lecteur audio canal premium)');",
      "console.log('PENC build v140 (bandeaux enregistrement + envoi vocal premium)');","Build -> v140")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v140.")
