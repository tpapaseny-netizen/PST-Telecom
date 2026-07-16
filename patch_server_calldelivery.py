# -*- coding: utf-8 -*-
"""PENC SERVEUR — fiabiliser la livraison des appels (room user: + coercition de type)"""
import io, sys
FN="server-at.js"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8-sig",newline="").read()
print("Patch serveur — livraison appels")

# 1) Livraison via la room user: (fiable, identique aux messages) + coercition map
OLD1=("  async function emitToUser(uid, event, data){\r\n"
"    // 1) pencOnline map (rapide)\r\n"
"    const sid=pencOnline.get(uid);")
NEW1=("  async function emitToUser(uid, event, data){\r\n"
"    // 0) Livraison via la room user: (fiable, identique aux messages)\r\n"
"    try{ const _room=await io.in('user:'+String(uid)).fetchSockets(); if(_room && _room.length){ io.to('user:'+String(uid)).emit(event,data); console.log('\U0001F4E1',event,'\u2192',String(uid).slice(0,10),'via room'); return true; } }catch(_e0){}\r\n"
"    // 1) pencOnline map (rapide)\r\n"
"    const sid=pencOnline.get(uid)||pencOnline.get(String(uid));")
s=R(s,OLD1,NEW1,"Livraison via room user: + map coercee")

# 2) Coercition de type dans le fallback fetchSockets
OLD2="      const target=sockets.find(s=>s.data.pencUserId===uid);"
NEW2="      const target=sockets.find(s=>String(s.data.pencUserId)===String(uid));"
s=R(s,OLD2,NEW2,"fetchSockets coercion de type")

data=("\ufeff"+s).encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. server-at.js mis a jour.")
