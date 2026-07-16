# -*- coding: utf-8 -*-
"""PENC SERVER — Signaling appels de groupe (channel:call:start / channel:call:invite)"""
import io, sys
FN="server-at.js"
s=io.open(FN,"r",encoding="utf-8-sig").read()
print("Patch serveur — appels de groupe (signaling)")

ANCHOR="  socket.on('call:initiate', async ({target_user_id, type, caller_name, caller_avatar, room_name}) => {"
if s.count(ANCHOR)!=1:
    print("  [ECHEC] anchor call:initiate:", s.count(ANCHOR)); sys.exit(1)

INSERT = (
"  socket.on('channel:call:start', async ({channel_id, type}) => {\r\n"
"    try{\r\n"
"      if(!channel_id) return;\r\n"
"      const chans = await pencChannels();\r\n"
"      const ch = (chans||[]).find(c=>String(c.id)===String(channel_id));\r\n"
"      if(!ch || ch.type!=='group') return;\r\n"
"      const members = Array.from(new Set([...(ch.followers||[]), ...(ch.admins||[]), ch.creator_id].map(String))).filter(Boolean);\r\n"
"      if(!members.includes(String(pencUserId))) return;\r\n"
"      const room_name = 'chcall_'+channel_id;\r\n"
"      let callerName=\"Quelqu'un\";\r\n"
"      try{ const us=_pgPool?(await pgAllUsers()||[]):await pencUsers(); const u=(us||[]).find(x=>String(x.id)===String(pencUserId)); if(u) callerName=u.full_name||u.username||callerName; }catch(e){}\r\n"
"      const targets = members.filter(m=>m!==String(pencUserId));\r\n"
"      await emitToUsers(targets, 'channel:call:incoming', { channel_id, room_name, type:type||'audio', from:pencUserId, caller_name:callerName, channel_name:ch.name||'Canal', channel_icon:ch.icon_url||null });\r\n"
"      console.log('[channel:call:start]', String(channel_id).slice(0,8), 'by', String(pencUserId).slice(0,8), '->', targets.length, 'membres');\r\n"
"    }catch(e){ console.error('channel:call:start err', e.message); }\r\n"
"  });\r\n"
"  socket.on('channel:call:invite', async ({channel_id, room_name, type, user_ids}) => {\r\n"
"    try{\r\n"
"      if(!channel_id || !Array.isArray(user_ids) || !user_ids.length) return;\r\n"
"      const chans = await pencChannels();\r\n"
"      const ch = (chans||[]).find(c=>String(c.id)===String(channel_id));\r\n"
"      if(!ch) return;\r\n"
"      let callerName=\"Quelqu'un\";\r\n"
"      try{ const us=_pgPool?(await pgAllUsers()||[]):await pencUsers(); const u=(us||[]).find(x=>String(x.id)===String(pencUserId)); if(u) callerName=u.full_name||u.username||callerName; }catch(e){}\r\n"
"      await emitToUsers(user_ids.map(String), 'channel:call:incoming', { channel_id, room_name:room_name||('chcall_'+channel_id), type:type||'audio', from:pencUserId, caller_name:callerName, channel_name:ch.name||'Canal', channel_icon:ch.icon_url||null, invite:true });\r\n"
"      console.log('[channel:call:invite]', String(channel_id).slice(0,8), '->', user_ids.length);\r\n"
"    }catch(e){ console.error('channel:call:invite err', e.message); }\r\n"
"  });\r\n"
)

s=s.replace(ANCHOR, INSERT+ANCHOR, 1)
print("  [OK]   2 handlers groupe inseres avant call:initiate")

io.open(FN,"wb").write(("\ufeff"+s).encode("utf-8"))
print("Termine. server-at.js mis a jour.")
