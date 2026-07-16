# -*- coding: utf-8 -*-
"""PENC SERVER — call:invite + call:upgrade (inviter en 1:1 -> bascule groupe)"""
import io, sys
FN="server-at.js"
# IMPORTANT: newline='' pour PRESERVER les CRLF
s=io.open(FN,"r",encoding="utf-8-sig",newline="").read()
print("Patch serveur — call:invite + call:upgrade")

ANCHOR="  socket.on('call:initiate', async ({target_user_id, type, caller_name, caller_avatar, room_name}) => {"
if s.count(ANCHOR)!=1:
    print("  [ECHEC] anchor call:initiate:", s.count(ANCHOR)); sys.exit(1)

INSERT=(
"  socket.on('call:invite', async ({room_name, type, user_ids, caller_name}) => {\r\n"
"    try{\r\n"
"      if(!room_name || !Array.isArray(user_ids) || !user_ids.length) return;\r\n"
"      let cn = caller_name || \"Quelqu'un\";\r\n"
"      try{ const us=_pgPool?(await pgAllUsers()||[]):await pencUsers(); const u=(us||[]).find(x=>String(x.id)===String(pencUserId)); if(u) cn=u.full_name||u.username||cn; }catch(e){}\r\n"
"      await emitToUsers(user_ids.map(String), 'channel:call:incoming', { channel_id:null, room_name, type:type||'audio', from:pencUserId, caller_name:cn, channel_name:'Appel de groupe', invite:true });\r\n"
"      console.log('[call:invite]', String(pencUserId).slice(0,8), '->', user_ids.length);\r\n"
"    }catch(e){ console.error('call:invite err', e.message); }\r\n"
"  });\r\n"
"  socket.on('call:upgrade', async ({target_user_id, room_name, type}) => {\r\n"
"    try{\r\n"
"      if(!target_user_id || !room_name) return;\r\n"
"      await emitToUsers([String(target_user_id)], 'call:upgrade', { room_name, type:type||'audio', from:pencUserId });\r\n"
"      console.log('[call:upgrade]', String(pencUserId).slice(0,8), '->', String(target_user_id).slice(0,8));\r\n"
"    }catch(e){ console.error('call:upgrade err', e.message); }\r\n"
"  });\r\n"
)
s=s.replace(ANCHOR, INSERT+ANCHOR, 1)
print("  [OK]   call:invite + call:upgrade inseres")

io.open(FN,"wb").write(("\ufeff"+s).encode("utf-8"))
print("Termine.")
