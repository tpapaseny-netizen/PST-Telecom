# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v135 (canaux etape 4 : design premium, icones SVG)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v135 — design premium canaux")

# 0) Badge de type : couleur thema-compatible
s=R(s,"font-size:11px;color:rgba(255,255,255,.72);display:flex;align-items:center;gap:5px;margin-top:1px;",
      "font-size:11px;color:var(--muted);display:flex;align-items:center;gap:5px;margin-top:1px;",
      "Badge type couleur muted")

# 1) Helper _svgIcon (avant buildChRow)
SVG = r'''function _svgIcon(name,sz,col){
  sz=sz||20; col=col||'currentColor';
  var P={
    gear:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    trash:'<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
    paperclip:'<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>',
    mic:'<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/>',
    send:'<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>',
    megaphone:'<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
    group:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'
  };
  return '<svg width="'+sz+'" height="'+sz+'" viewBox="0 0 24 24" fill="none" stroke="'+col+'" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;flex-shrink:0;">'+(P[name]||'')+'</svg>';
}
function buildChRow(c){'''
s=R(s,"function buildChRow(c){",SVG,"Helper _svgIcon")

# 2) buildChRow : icone type + unite + badge Admin
s=R(s,"""+'<span class="ch-followers">'+c.follower_count+' abonné'+(c.follower_count>1?'s':'')+'</span>'
    +(c.is_creator?'<span style="font-size:10px;color:var(--accent);">Mon canal</span>':'')""",
      """+'<span class="ch-followers" style="display:flex;align-items:center;gap:4px;">'+_svgIcon((c.type==='group')?'group':'megaphone',13,'var(--muted)')+(c.follower_count||0)+' '+((c.type==='group')?'membre':'abonné')+((c.follower_count||0)>1?'s':'')+'</span>'
    +(c.is_creator?'<span style="font-size:10px;color:var(--accent);font-weight:700;">Mon canal</span>':(c.is_admin?'<span style="font-size:10px;color:#00C896;font-weight:700;">Admin</span>':''))""",
      "buildChRow icone type + Admin")

# 3) Banniere megaphone SVG
s=R(s,'<div class="ch-banner-icon">\U0001F4E3</div>',
      '<div class="ch-banner-icon" style="display:flex;align-items:center;justify-content:center;">\'+_svgIcon(\'megaphone\',28,\'var(--accent)\')+\'</div>',
      "Banniere megaphone")

# 4) Gear SVG (engrenage)
s=R(s,'>\u2699\ufe0f</button>\'):\'\'',
      '>\'+_svgIcon(\'gear\',18,\'currentColor\')+\'</button>\'):\'\'',
      "Gear SVG")

# 5) Trash canal SVG
s=R(s,'>\U0001F5D1\ufe0f</button>\')',
      '>\'+_svgIcon(\'trash\',18,\'#fff\')+\'</button>\')',
      "Trash canal SVG")

# 6) Paperclip SVG
s=R(s,'border-radius:11px;background:var(--card2);font-size:18px;cursor:pointer;">\U0001F4CE</button>',
      'border-radius:11px;background:var(--card2);font-size:18px;cursor:pointer;">\'+_svgIcon(\'paperclip\',19,\'#8A9BB0\')+\'</button>',
      "Paperclip SVG")

# 7) Mic SVG
s=R(s,'border-radius:11px;background:var(--card2);font-size:18px;cursor:pointer;">\U0001F3A4</button>',
      'border-radius:11px;background:var(--card2);font-size:18px;cursor:pointer;">\'+_svgIcon(\'mic\',19,\'#8A9BB0\')+\'</button>',
      "Mic SVG")

# 8) Send SVG
s=R(s,'>\u25BA</button>',
      '>\'+_svgIcon(\'send\',18,\'#fff\')+\'</button>',
      "Send SVG")

# 9) Trash post SVG
s=R(s,'>\U0001F5D1\ufe0f</button>\':\'\'',
      '>\'+_svgIcon(\'trash\',15,\'var(--danger)\')+\'</button>\':\'\'',
      "Trash post SVG")

# 10) Build bump
s=R(s,"console.log('PENC build v134 (canaux: badge de type + permissions ecriture)');",
      "console.log('PENC build v135 (canaux: design premium icones SVG)');","Build -> v135")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v135.")
