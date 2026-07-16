# -*- coding: utf-8 -*-
"""
PENC SERVER — Patch A2b (messages envoyes par utilisateur)
Ajoute msgs_sent a chaque utilisateur dans /api/penc/admin/overview
(via SELECT sender_id, COUNT(*) FROM penc_messages GROUP BY sender_id).
Penc uniquement. ZAMA/SenSMS intacts. BOM + CRLF preserves.

    python patch_server_A2b_msgcount.py
"""
import io, sys, os

FN = "server-at.js"

def R(s, old, new, label):
    n = s.count(old)
    if n != 1:
        print("  [ECHEC] '%s' : trouve %d fois (attendu 1)." % (label, n)); sys.exit(1)
    print("  [OK]   %s" % label)
    return s.replace(old, new)

if not os.path.exists(FN):
    print("Fichier introuvable : %s" % FN); sys.exit(1)

with io.open(FN, "rb") as f:
    s = f.read().decode("utf-8-sig")

print("Patch serveur A2b — messages/user")

# 1) Peupler _msgMap juste apres _modMap
MOD = "    const _modMap={}; try{ if(_pgPool){ const _mq=await _pgPool.query('SELECT id, muted_until, suspended FROM penc_users'); _mq.rows.forEach(function(r){ _modMap[String(r.id)]={muted_until:r.muted_until||null, suspended:!!r.suspended}; }); } }catch(_e){}"
MSG = MOD + "\r\n    const _msgMap={}; try{ if(_pgPool){ const _qq=await _pgPool.query('SELECT sender_id, COUNT(*)::int c FROM penc_messages GROUP BY sender_id'); _qq.rows.forEach(function(r){ _msgMap[String(r.sender_id)]=r.c; }); } }catch(_e){}"
s = R(s, MOD, MSG, "Map messages/user")

# 2) Ajouter msgs_sent dans l'objet enrich
EN_OLD = "      muted_until:(_modMap[String(u.id)]||{}).muted_until||null, suspended:!!(_modMap[String(u.id)]||{}).suspended };"
EN_NEW = "      msgs_sent:(_msgMap[String(u.id)]||0), muted_until:(_modMap[String(u.id)]||{}).muted_until||null, suspended:!!(_modMap[String(u.id)]||{}).suspended };"
s = R(s, EN_OLD, EN_NEW, "Champ msgs_sent dans enrich")

with io.open(FN, "wb") as f:
    f.write(("\ufeff" + s).encode("utf-8"))

print("\nTermine. server-at.js mis a jour (A2b).")
print("Verifie : node --check server-at.js")
