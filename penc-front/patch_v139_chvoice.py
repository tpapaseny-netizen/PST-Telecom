# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v139 (#2 lecteur audio canal premium)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v139 — lecteur audio canal premium")

# 1) CSS conteneur vocal canal
s=R(s,".voice-bar{ transition:opacity .08s, background .08s; }",
      ".voice-bar{ transition:opacity .08s, background .08s; }\n"
      ".ch-voice{margin:6px 0;}\n"
      ".ch-voice .msg-bubble.voice-wrap{background:#1A1A1A;border:1px solid rgba(255,255,255,.08);box-shadow:none;border-radius:14px;display:inline-block;max-width:100%;}\n"
      ".ch-voice.mine .msg-bubble.voice-wrap{background:linear-gradient(135deg,#0E5A43,#1A6B4A);border-color:transparent;}\n"
      ".ch-voice .voice-play{background:#fff;color:#0E5A43;}\n"
      ".ch-voice .voice-bar{background:#8A9BB0;}\n"
      ".ch-voice.mine .voice-bar{background:rgba(255,255,255,.85);}\n"
      ".ch-voice .voice-bar.played{background:#00C896!important;opacity:1!important;}\n"
      ".ch-voice.mine .voice-bar.played{background:#fff!important;opacity:1!important;}\n"
      ".ch-voice .voice-dur{color:#fff;opacity:1;}\n"
      ".ch-voice .voice-dl{color:#fff;opacity:.7;}",
      "CSS ch-voice")

# 2) Remplacer le lecteur natif par le composant premium
s=R(s,'''  if(p.type==='voice'||p.type==='audio') return '<audio src="'+p.media_url+'" controls style="width:100%;margin:6px 0;display:block;"></audio>';''',
      '''  if(p.type==='voice'||p.type==='audio'){ var _vmine=(ME&&p.sender_id&&String(p.sender_id)===String(ME.id)); return '<div class="ch-voice'+(_vmine?' mine':'')+'">'+buildVoiceBubble({media_url:p.media_url,media_duration:p.media_duration||p.duration||0})+'</div>'; }''',
      "Lecteur premium canal")

# 3) Build bump
s=R(s,"console.log('PENC build v138 (statut vide premium)');",
      "console.log('PENC build v139 (lecteur audio canal premium)');","Build -> v139")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v139.")
