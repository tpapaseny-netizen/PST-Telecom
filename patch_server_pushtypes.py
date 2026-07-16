# -*- coding: utf-8 -*-
"""PENC SERVER — push detailles par type (formats exacts + like + commentaire)"""
import io, sys, re
FN="server-at.js"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
def RX(s,pat,new,label):
    new2,n=re.subn(pat,new,s,flags=re.S)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return new2
s=io.open(FN,"rb").read().decode("utf-8-sig")
print("Patch serveur — push par type")

# A) Helpers apres sendPencPush
HELP=("  } catch (e) { console.error('sendPencPush:', e.message); }\r\n}\r\n"
"function _pencDur(sec){ sec=Math.max(0,Math.round(sec||0)); var m=Math.floor(sec/60), s=sec%60; return m+':'+(s<10?'0':'')+s; }\r\n"
"function pencMsgBody(type, content, duration){\r\n"
"  if(type==='voice') return 'Message vocal'+((duration&&duration>0)?' '+_pencDur(duration):'');\r\n"
"  if(type==='image') return 'A envoyé une photo 📷';\r\n"
"  if(type==='video') return 'A envoyé une vidéo 🎬';\r\n"
"  if(type==='money') return '💸 '+(content||'Transfert');\r\n"
"  if(type==='sticker') return content||'Sticker';\r\n"
"  return (content||'').slice(0,50);\r\n"
"}\r\n")
s=R(s,"  } catch (e) { console.error('sendPencPush:', e.message); }\r\n}\r\n",HELP,"Helpers pencMsgBody")

# B) REST message push (4937)
s=R(s,
"let pbody=type==='voice'?'Message vocal':type==='image'?'Photo':type==='video'?'Video':type==='money'?('Transfert '+(content||'')):type==='sticker'?(content||'Sticker'):((content||'').slice(0,120));",
"let pbody=pencMsgBody(type, content, media_duration);",
"REST message body")

# C) Socket message push (bloc if/else avec emojis) -> regex
s=RX(s, r"let pbody = '';.*?else pbody = \(content \|\| ''\)\.slice\(0, 120\);",
      "let pbody = pencMsgBody(type, content, msg.media_duration);",
      "Socket message body")

# D) DM admin (5676)
s=R(s,"body: content.slice(0, 120), tag: 'penc-' + conv.id, url: '/messager?conv=' + conv.id, conv_id: conv.id }",
      "body: pencMsgBody('text', content), tag: 'penc-' + conv.id, url: '/messager?conv=' + conv.id, conv_id: conv.id }",
      "DM admin body")

# E) Demande ami : titre Penc + 'veut vous ajouter'
s=R(s,"title:'Nouvelle demande d\\'ami'","title:'Penc'","Friend req titre")
s=R(s,"+' souhaite vous ajouter'","+' veut vous ajouter'","Friend req corps")

# F) Statut : 'A publié...'
s=R(s,"body:'a publié un nouveau statut'","body:'A publié un nouveau statut'","Statut corps")

# G) Push LIKE (route /react)
s=R(s,
"emitToUsers(String(st.user_id),'status:reaction',{status_id:req.params.id, emoji:emoji, from_name:_rn}); }",
"emitToUsers(String(st.user_id),'status:reaction',{status_id:req.params.id, emoji:emoji, from_name:_rn}); try{ sendPencPush(String(st.user_id),{title:'Penc', body:_rn+' a aimé votre statut', icon:'/penc-icon-192.png', badge:'/penc-icon-192.png', tag:'penc-like-'+req.params.id, url:'/messager?status='+req.params.id, data:{type:'status_like', status_id:req.params.id, url:'/messager?status='+req.params.id}}); }catch(_lp){} }",
"Push like")

# H) Push COMMENTAIRE (route /comment)
s=R(s,
"    const u=await pgFindUser('id',uid)||{};\r\n    res.json({success:true, comment:{id, status_id:req.params.id",
"    const u=await pgFindUser('id',uid)||{};\r\n    try{ const _sr=await _pgPool.query('SELECT user_id FROM penc_statuses WHERE id=$1',[req.params.id]); const _own=_sr.rows[0]&&_sr.rows[0].user_id; if(_own && String(_own)!==String(uid)){ const _cn=u.full_name||u.username||'Une personne'; sendPencPush(String(_own),{title:_cn, body:'a commenté votre statut', icon:'/penc-icon-192.png', badge:'/penc-icon-192.png', tag:'penc-comment-'+req.params.id, url:'/messager?status='+req.params.id, data:{type:'status_comment', status_id:req.params.id, url:'/messager?status='+req.params.id}}); } }catch(_cp){}\r\n    res.json({success:true, comment:{id, status_id:req.params.id",
"Push commentaire")

data=("\ufeff"+s).encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. server-at.js (push par type).")
