# -*- coding: utf-8 -*-
"""PENC SERVEUR — emitToUser : émettre vers la room SANS condition (comme les messages)"""
import io, sys
FN="server-at.js"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8-sig",newline="").read()
print("Patch serveur — emitToUser inconditionnel")

OLD=("    // 0) Livraison via la room user: (fiable, identique aux messages)\r\n"
"    try{ const _room=await io.in('user:'+String(uid)).fetchSockets(); if(_room && _room.length){ io.to('user:'+String(uid)).emit(event,data); console.log('📡',event,'→',String(uid).slice(0,10),'via room'); return true; } }catch(_e0){}")
NEW=("    // 0) Émettre vers la room user: SANS condition (identique à emitToUsers/messages — fiable)\r\n"
"    io.to('user:'+String(uid)).emit(event,data);\r\n"
"    try{ const _room=await io.in('user:'+String(uid)).fetchSockets(); if(_room && _room.length){ console.log('📡',event,'→',String(uid).slice(0,10),'via room (online)'); return true; } }catch(_e0){}")
s=R(s,OLD,NEW,"emitToUser room inconditionnel")

data=("\ufeff"+s).encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. server-at.js mis a jour.")
