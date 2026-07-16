# -*- coding: utf-8 -*-
"""PENC FRONT — Patch v143 (#1 confirmations de suppression premium)"""
import io, sys
FN="messager.html"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8",newline="").read()
print("Patch v143 — confirmations premium")

# 1) Suppression d'une publication
s=R(s,"""async function delChPost(chId,postId){
  if(!confirm('Supprimer ce post ?')) return;""",
      """async function delChPost(chId,postId){
  if(!(await pencConfirm({title:'Supprimer cette publication',message:'Cette action est irréversible.',ok:'Supprimer'}))) return;""",
      "delChPost")

# 2) Suppression d'un canal
s=R(s,"  if(!confirm('Supprimer ce canal ?')) return;",
      "  if(!(await pencConfirm({title:'Supprimer ce canal',message:'Le canal et tout son historique seront supprimés définitivement.',ok:'Supprimer'}))) return;",
      "deleteChannel")

# 3) Retirer un membre du canal
s=R(s,"function chKick(chId,uid,btn){ if(!confirm('Retirer ce membre du canal ?')) return; api('/channels/'+chId+'/members/'+uid,'DELETE').then(function(r){ if(r&&r.success) _frDropRow(btn); else showNotif('❌','Erreur',(r&&r.error)||'','red',null); }).catch(function(){}); }",
      "function chKick(chId,uid,btn){ pencConfirm({title:'Retirer ce membre',message:'Il sera retiré du canal.',ok:'Retirer'}).then(function(ok){ if(!ok) return; api('/channels/'+chId+'/members/'+uid,'DELETE').then(function(r){ if(r&&r.success) _frDropRow(btn); else showNotif('❌','Erreur',(r&&r.error)||'','red',null); }).catch(function(){}); }); }",
      "chKick")

# 4) Retirer un ami
s=R(s,"function frRemove(uid,btn){ if(!confirm('Retirer cet ami ?')) return; api('/friends/remove/'+uid,'DELETE').then(function(){ _frDropRow(btn); }).catch(function(){}); }",
      "function frRemove(uid,btn){ pencConfirm({title:'Retirer cet ami',message:'Vous ne serez plus amis.',ok:'Retirer'}).then(function(ok){ if(!ok) return; api('/friends/remove/'+uid,'DELETE').then(function(){ _frDropRow(btn); }).catch(function(){}); }); }",
      "frRemove")

# 5) Bloquer un utilisateur
s=R(s,"function frBlock(uid,btn){ if(!confirm('Bloquer cet utilisateur ? Il ne pourra plus vous écrire ni vous envoyer de demande.')) return; api('/friends/block/'+uid,'POST').then(function(){ _frDropRow(btn); showNotif('🚫','Utilisateur bloqué','','red',null); }).catch(function(){}); }",
      "function frBlock(uid,btn){ pencConfirm({title:'Bloquer cet utilisateur',message:'Il ne pourra plus vous écrire ni vous envoyer de demande.',ok:'Bloquer'}).then(function(ok){ if(!ok) return; api('/friends/block/'+uid,'POST').then(function(){ _frDropRow(btn); showNotif('🚫','Utilisateur bloqué','','red',null); }).catch(function(){}); }); }",
      "frBlock")

# 6) Build bump
s=R(s,"console.log('PENC build v142 (reactions premium SVG + picker)');",
      "console.log('PENC build v143 (confirmations de suppression premium)');","Build -> v143")

data=s.encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. messager.html -> v143.")
