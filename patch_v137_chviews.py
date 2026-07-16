# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v137 (canaux : vues par message)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v137 — vues par message")

# 1) Icone oeil dans _svgIcon
s=R(s,'''    group:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>' ''' .rstrip(),
      '''    group:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    eye:'<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>' '''.rstrip(),
      "Icone oeil")

# 2) Fonctions observer de vues (avant buildChPost)
FNS=(r'''function _chObserveViews(chId,ov){
  if(!('IntersectionObserver' in window)){
    ov.querySelectorAll('.ch-post[data-pid]').forEach(function(el){ _chMarkView(chId,el.getAttribute('data-pid'),ov); });
    return;
  }
  var iob=new IntersectionObserver(function(ents){
    ents.forEach(function(en){ if(!en.isIntersecting) return; var el=en.target; iob.unobserve(el); _chMarkView(chId,el.getAttribute('data-pid'),ov); });
  },{threshold:0.5});
  ov.querySelectorAll('.ch-post[data-pid]').forEach(function(el){ iob.observe(el); });
}
function _chMarkView(chId,pid,ov){
  if(!pid) return;
  var key='pcv_'+pid;
  try{ if(localStorage.getItem(key)) return; localStorage.setItem(key,'1'); }catch(e){}
  api('/channels/'+chId+'/posts/'+pid+'/view','POST').then(function(r){
    if(r&&typeof r.views==='number'){ var c=ov.querySelector('.ch-post[data-pid="'+pid+'"] .ch-views-n'); if(c) c.textContent=r.views; }
  }).catch(function(){});
}
function buildChPost(p,chId,isCreator){''')
s=R(s,"function buildChPost(p,chId,isCreator){",FNS,"Fonctions observer vues")

# 3) data-pid sur le post
s=R(s,'''return '<div class="ch-post">' ''' .rstrip(),
      '''return '<div class="ch-post" data-pid="'+p.id+'">' '''.rstrip(),
      "data-pid sur post")

# 4) Compteur de vues avant l'heure
s=R(s,'''+'<span class="ch-post-time">'+new Date(p.created_at).toLocaleDateString('fr',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})+'</span>' ''' .rstrip(),
      '''+'<span class="ch-views" style="display:flex;align-items:center;gap:3px;font-size:11px;color:var(--muted);margin-left:auto;">'+_svgIcon('eye',13,'var(--muted)')+'<span class="ch-views-n">'+(p.views||0)+'</span></span>'
    +'<span class="ch-post-time" style="margin-left:8px;">'+new Date(p.created_at).toLocaleDateString('fr',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})+'</span>' '''.rstrip(),
      "Compteur de vues")

# 5) Activer l'observer a l'ouverture du canal
s=R(s,"document.getElementById('screen-main').appendChild(ov);",
      "document.getElementById('screen-main').appendChild(ov);\n    _chObserveViews(chId,ov);",
      "Activer observer")

# 6) Build bump
s=R(s,"console.log('PENC build v136 (canaux: parametres edition + lecture seule)');",
      "console.log('PENC build v137 (canaux: vues par message)');","Build -> v137")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v137.")
