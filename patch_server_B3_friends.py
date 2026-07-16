# -*- coding: utf-8 -*-
"""PENC SERVER — B3 (amitie obligatoire avant de discuter, strict)"""
import io, sys
FN="server-at.js"
s=io.open(FN,"rb").read().decode("utf-8-sig")
print("Patch serveur B3 — amitie stricte")

OLD = ("            if (!_blocked) {\n"
       "              const _cnt = await _pgPool.query('SELECT COUNT(*) AS n FROM penc_messages WHERE conversation_id=$1',[conversation_id]);\n"
       "              if (parseInt(_cnt.rows[0].n) === 0) {\n"
       "                const _acc = await pgFriendAccepted(pencUserId, _other);\n"
       "                if (!_acc && !_senderAdmin) { msg.pending = true; await pgEnsureFriendRequest(pencUserId, _other); }\n"
       "              }\n"
       "            }")

NEW = ("            if (!_blocked) {\n"
       "              const _acc = await pgFriendAccepted(pencUserId, _other);\n"
       "              if (!_acc && !_senderAdmin && _parts.length===2 && String(_other)!=='penc_official') { await pgEnsureFriendRequest(pencUserId, _other); try { io.to('user:'+_other).emit('friend:request',{from:pencUserId}); } catch(e){} if (typeof cb === 'function') cb({ error: 'Vous devez etre amis pour discuter. Demande d\\'ami envoyee.', need_friend: true }); return; }\n"
       "            }")

n=s.count(OLD)
if n!=1:
    print("  [ECHEC] bloc amitie : trouve %d fois (attendu 1)"%n); sys.exit(1)
s=s.replace(OLD,NEW)
print("  [OK]   Bloc amitie -> strict")

data=("\ufeff"+s).encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. server-at.js mis a jour (B3).")
