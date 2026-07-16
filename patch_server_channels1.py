# -*- coding: utf-8 -*-
"""PENC SERVER — Canaux etape 1 : type group/broadcast, lecture seule, permissions"""
import io, sys
FN="server-at.js"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"rb").read().decode("utf-8-sig")
print("Patch serveur — canaux etape 1")

# A) Create : type + read_only
s=R(s,"try{ const uid=req.pencUser.userId; const {name,description,icon_url}=req.body;\r\n    if(!name||name.trim().length<2) return res.status(400).json({error:'Nom requis (2 car. min)'});",
      "try{ const uid=req.pencUser.userId; const {name,description,icon_url,type}=req.body; const _ctype=(type==='group')?'group':'broadcast';\r\n    if(!name||name.trim().length<2) return res.status(400).json({error:'Nom requis (2 car. min)'});",
      "Create: lire type")
s=R(s,"const ch={id:'ch_'+Date.now(),name:name.trim(),description:(description||'').trim(),icon_url:icon_url||null,creator_id:uid,admins:[],followers:[uid],posts:[],created_at:new Date().toISOString()};",
      "const ch={id:'ch_'+Date.now(),name:name.trim(),description:(description||'').trim(),icon_url:icon_url||null,type:_ctype,read_only:false,creator_id:uid,admins:[],followers:[uid],posts:[],created_at:new Date().toISOString()};",
      "Create: type+read_only dans l'objet")

# B) GET liste : can_post
s=R(s,",is_admin:(ch.admins||[]).map(String).includes(String(uid)),last_post:(ch.posts||[]).slice(-1)[0]||null}));",
      ",is_admin:(ch.admins||[]).map(String).includes(String(uid)),type:ch.type||'broadcast',read_only:!!ch.read_only,can_post:(String(ch.creator_id)===String(uid)||(ch.admins||[]).map(String).includes(String(uid))||((ch.type==='group')&&!ch.read_only&&(ch.followers||[]).map(String).includes(String(uid)))),last_post:(ch.posts||[]).slice(-1)[0]||null}));",
      "GET liste: type/read_only/can_post")

# C) GET detail : can_post
s=R(s,"res.json({...ch,is_following:(ch.followers||[]).includes(uid),is_creator:String(ch.creator_id)===String(uid),is_admin:(ch.admins||[]).map(String).includes(String(uid))}); }catch(e){res.status(500).json({error:'Erreur serveur'});}",
      "res.json({...ch,type:ch.type||'broadcast',read_only:!!ch.read_only,is_following:(ch.followers||[]).includes(uid),is_creator:String(ch.creator_id)===String(uid),is_admin:(ch.admins||[]).map(String).includes(String(uid)),can_post:(String(ch.creator_id)===String(uid)||(ch.admins||[]).map(String).includes(String(uid))||((ch.type==='group')&&!ch.read_only&&(ch.followers||[]).map(String).includes(String(uid))))}); }catch(e){res.status(500).json({error:'Erreur serveur'});}",
      "GET detail: can_post")

# D) Post : permission selon type + auteur
s=R(s,"if(String(ch.creator_id)!==String(uid) && !(ch.admins||[]).map(String).includes(String(uid))) return res.status(403).json({error:'Seuls le proprietaire et les admins peuvent publier'});",
      "const _isChAdmin=String(ch.creator_id)===String(uid)||(ch.admins||[]).map(String).includes(String(uid));\r\n    const _memberCanPost=(ch.type==='group')&&!ch.read_only&&(ch.followers||[]).map(String).includes(String(uid));\r\n    if(!_isChAdmin && !_memberCanPost) return res.status(403).json({error:'Vous ne pouvez pas publier dans ce canal'});",
      "Post: permission selon type")
s=R(s,"const post={id:'p_'+Date.now(),content:content||'',type:type||'text',\r\n      media_url:media_url||null,created_at:new Date().toISOString(),reactions:{}};",
      "const post={id:'p_'+Date.now(),sender_id:uid,content:content||'',type:type||'text',\r\n      media_url:media_url||null,created_at:new Date().toISOString(),reactions:{}};",
      "Post: auteur sender_id")

# E) Nouvelles routes : lecture seule + edition (apres delete channel)
ANCHOR="    channels.splice(idx,1); await pencSaveChannels(channels); res.json({success:true}); }catch(e){res.status(500).json({error:'Erreur serveur'});}\r\n});\r\n"
NEWROUTES=ANCHOR+("app.post('/api/penc/channels/:id/readonly', pencAuth, async (req,res) => {\r\n"
"  try{ const uid=req.pencUser.userId; const channels=await pencChannels(); const ch=channels.find(x=>x.id===req.params.id);\r\n"
"    if(!ch) return res.status(404).json({error:'Canal introuvable'});\r\n"
"    if(String(ch.creator_id)!==String(uid) && !(ch.admins||[]).map(String).includes(String(uid))) return res.status(403).json({error:'Non autorise'});\r\n"
"    ch.read_only=!!req.body.read_only; await pencSaveChannels(channels);\r\n"
"    try{ (ch.followers||[]).forEach(function(fid){ emitToUsers(String(fid),'channel:update',{channel_id:ch.id,read_only:ch.read_only}); }); }catch(e){}\r\n"
"    res.json({success:true,read_only:ch.read_only}); }catch(e){ res.status(500).json({error:'Erreur serveur'}); }\r\n"
"});\r\n"
"app.put('/api/penc/channels/:id', pencAuth, async (req,res) => {\r\n"
"  try{ const uid=req.pencUser.userId; const channels=await pencChannels(); const ch=channels.find(x=>x.id===req.params.id);\r\n"
"    if(!ch) return res.status(404).json({error:'Canal introuvable'});\r\n"
"    if(String(ch.creator_id)!==String(uid) && !(ch.admins||[]).map(String).includes(String(uid))) return res.status(403).json({error:'Non autorise'});\r\n"
"    const b=req.body||{};\r\n"
"    if(b.name && b.name.trim().length>=2) ch.name=b.name.trim();\r\n"
"    if(typeof b.description==='string') ch.description=b.description.trim();\r\n"
"    if(b.icon_url) ch.icon_url=b.icon_url;\r\n"
"    await pencSaveChannels(channels);\r\n"
"    res.json({success:true,channel:{id:ch.id,name:ch.name,description:ch.description,icon_url:ch.icon_url}}); }catch(e){ res.status(500).json({error:'Erreur serveur'}); }\r\n"
"});\r\n")
s=R(s,ANCHOR,NEWROUTES,"Routes readonly + edit")

data=("\ufeff"+s).encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. server-at.js (canaux etape 1).")
