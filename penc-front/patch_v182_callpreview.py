# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v182 (icone appel premium + direction + duree dans la liste)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v182 — apercu appel premium")

# 1) msgPreview : direction + statut + duree
s=R(s,"  if(msg.type==='call') return '\U0001F4DE Appel';",
      "  if(msg.type==='call'){\n"
      "    var _cd={}; try{ _cd=JSON.parse(msg.content||'{}'); }catch(_e){}\n"
      "    var _out=ME&&String(msg.sender_id)===String(ME.id);\n"
      "    var _ans=_cd.status==='answered';\n"
      "    var _dur=(_ans&&typeof _cd.duration==='number'&&_cd.duration>0)?fmtDur(_cd.duration):'';\n"
      "    var _base=_cd.call_type==='video'?'Appel vid\\u00e9o':'Appel';\n"
      "    var _lbl=_ans?(_base+(_dur?' \\u00b7 '+_dur:'')):(_out?'Appel annul\\u00e9':'Appel manqu\\u00e9');\n"
      "    return '\\uD83D\\uDCDE'+(_out?'\\u2197':'\\u2199')+' '+_lbl;\n"
      "  }","msgPreview call duree+direction")

# 2) _clPreview : branche appel premium (SVG teal/rouge + fleche)
OLD=("  var ic='';\n"
"  if(/^\\uD83C\\uDF99/.test(p)){ ic=MIC; p=p.replace(/^\\uD83C\\uDF99\\uFE0F?\\s*/,''); }")
NEW=("  var ic='';\n"
"  if(/^\\uD83D\\uDCDE/.test(p)){ var _rst=p.replace(/^\\uD83D\\uDCDE/,''); var _out=_rst.charAt(0)==='\\u2197'; _rst=_rst.replace(/^[\\u2197\\u2199]\\s*/,''); var _miss=/manqu|annul/i.test(_rst); var _col=_miss?'#FF4444':'#00C896'; "
"var _PH='<svg class=\"cl-ic\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"'+_col+'\" stroke-width=\"1.5\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z\"/></svg>'; "
"var _AR='<svg viewBox=\"0 0 24 24\" width=\"11\" height=\"11\" fill=\"none\" stroke=\"'+_col+'\" stroke-width=\"2.4\" stroke-linecap=\"round\" stroke-linejoin=\"round\">'+(_out?'<line x1=\"7\" y1=\"17\" x2=\"16\" y2=\"8\"/><polyline points=\"9 8 16 8 16 15\"/>':'<line x1=\"16\" y1=\"8\" x2=\"7\" y2=\"17\"/><polyline points=\"14 17 7 17 7 10\"/>')+'</svg>'; "
"ic='<span class=\"cl-call\">'+_AR+_PH+'</span>'; p=_rst; }\n"
"  else if(/^\\uD83C\\uDF99/.test(p)){ ic=MIC; p=p.replace(/^\\uD83C\\uDF99\\uFE0F?\\s*/,''); }")
s=R(s,OLD,NEW,"_clPreview branche appel")

# 3) CSS
s=R(s,".call-log .cl-tx{color:#e6e8ea;font-size:13.5px;font-weight:600}",
      ".call-log .cl-tx{color:#e6e8ea;font-size:13.5px;font-weight:600}\n"
      ".cl-call{display:inline-flex;align-items:center;gap:1px;margin-right:5px;vertical-align:-2px}\n"
      ".cl-call .cl-ic{width:16px;height:16px;margin:0}","CSS cl-call")

# 4) Build
s=R(s,"console.log('PENC build v181 (bandeau Quitter premium)');",
      "console.log('PENC build v182 (apercu appel premium + duree)');","Build -> v182")
io.open(FN,"wb").write(s.encode("utf-8")); print("OK v182")
