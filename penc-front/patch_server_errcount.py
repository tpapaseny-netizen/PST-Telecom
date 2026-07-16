# -*- coding: utf-8 -*-
"""PENC SERVER — compteur erreurs app (24h) dans /admin/security"""
import io, sys
FN="server-at.js"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"rb").read().decode("utf-8-sig")
print("Patch serveur — errors_24h")

s=R(s,"    let logs=[], failed_24h=0, suspended=[], moderators=[];",
      "    let logs=[], failed_24h=0, errors_24h=0, suspended=[], moderators=[];",
      "Var errors_24h")

ANCH="    try { const f = await _pgPool.query(\"SELECT COUNT(*)::int c FROM penc_security_logs WHERE type='login_failed' AND created_at >= NOW() - INTERVAL '24 hours'\"); failed_24h = f.rows[0].c; } catch(e){}"
ADD=ANCH+"\r\n    try { const ce = await _pgPool.query(\"SELECT COUNT(*)::int c FROM penc_security_logs WHERE type='client_error' AND created_at >= NOW() - INTERVAL '24 hours'\"); errors_24h = ce.rows[0].c; } catch(e){}"
s=R(s,ANCH,ADD,"Query errors_24h")

s=R(s,"    res.json({ logs, failed_24h, suspended, moderators });",
      "    res.json({ logs, failed_24h, errors_24h, suspended, moderators });",
      "Retour errors_24h")

data=("\ufeff"+s).encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. server-at.js (errors_24h).")
