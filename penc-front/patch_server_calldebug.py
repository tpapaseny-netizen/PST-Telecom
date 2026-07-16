# -*- coding: utf-8 -*-
"""PENC SERVEUR — diagnostic appel renvoye a l'appelant (call:debug)"""
import io, sys
FN="server-at.js"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8-sig",newline="").read()
print("Patch serveur — call:debug")

OLD="    console.log('📞 call:initiate',pencUserId.slice(0,8),'→',target_user_id.slice(0,8),'online:',ok);"
NEW=("    console.log('📞 call:initiate',pencUserId.slice(0,8),'→',target_user_id.slice(0,8),'online:',ok);\r\n"
"    try{ let _rc=0; try{ const _rs=await io.in('user:'+String(target_user_id)).fetchSockets(); _rc=_rs?_rs.length:0; }catch(_e){} socket.emit('call:debug',{target:String(target_user_id), online:ok, room_sockets:_rc}); }catch(_ed){}")
s=R(s,OLD,NEW,"Emettre call:debug a l'appelant")

data=("\ufeff"+s).encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. server-at.js mis a jour.")
