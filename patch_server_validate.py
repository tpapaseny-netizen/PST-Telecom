# -*- coding: utf-8 -*-
"""PENC SERVER — call:invite:request + call:invite:declined (validation par le createur)"""
import io, sys
FN="server-at.js"
s=io.open(FN,"r",encoding="utf-8-sig",newline="").read()
print("Patch serveur — validation des invites")

ANCHOR="  socket.on('call:initiate', async ({target_user_id, type, caller_name, caller_avatar, room_name}) => {"
if s.count(ANCHOR)!=1:
    print("  [ECHEC] anchor:", s.count(ANCHOR)); sys.exit(1)

INSERT=(
"  socket.on('call:invite:request', async ({host_id, room_name, type, user_ids, requester_name, user_names}) => {\r\n"
"    try{\r\n"
"      if(!host_id || !room_name || !Array.isArray(user_ids) || !user_ids.length) return;\r\n"
"      let rn = requester_name || 'Un participant';\r\n"
"      try{ const us=_pgPool?(await pgAllUsers()||[]):await pencUsers(); const u=(us||[]).find(x=>String(x.id)===String(pencUserId)); if(u) rn=u.full_name||u.username||rn; }catch(e){}\r\n"
"      await emitToUsers([String(host_id)], 'call:invite:request', { room_name, type:type||'audio', user_ids:user_ids.map(String), user_names:Array.isArray(user_names)?user_names:[], requester_id:pencUserId, requester_name:rn });\r\n"
"      console.log('[call:invite:request]', String(pencUserId).slice(0,8), '-> host', String(host_id).slice(0,8), user_ids.length);\r\n"
"    }catch(e){ console.error('call:invite:request err', e.message); }\r\n"
"  });\r\n"
"  socket.on('call:invite:declined', async ({requester_id, room_name}) => {\r\n"
"    try{\r\n"
"      if(!requester_id) return;\r\n"
"      await emitToUsers([String(requester_id)], 'call:invite:declined', { room_name:room_name||null, from:pencUserId });\r\n"
"      console.log('[call:invite:declined] host', String(pencUserId).slice(0,8), '-> ', String(requester_id).slice(0,8));\r\n"
"    }catch(e){ console.error('call:invite:declined err', e.message); }\r\n"
"  });\r\n"
)
s=s.replace(ANCHOR, INSERT+ANCHOR, 1)
print("  [OK]   call:invite:request + call:invite:declined")

io.open(FN,"wb").write(("\ufeff"+s).encode("utf-8"))
print("Termine.")
