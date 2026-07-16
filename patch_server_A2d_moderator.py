# -*- coding: utf-8 -*-
"""
PENC SERVER — Patch A2d (moderateur)
  - colonne penc_users.moderator (BOOLEAN)
  - route POST /api/penc/admin/moderator/:userId  {moderator:bool}
  - is_moderator inclus dans /admin/overview
Penc uniquement. ZAMA/SenSMS intacts. BOM + CRLF preserves.

    python patch_server_A2d_moderator.py
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

print("Patch serveur A2d — moderateur")

# 1) Colonne moderator
ALT = "      ALTER TABLE penc_users ADD COLUMN IF NOT EXISTS suspended BOOLEAN DEFAULT FALSE;"
s = R(s, ALT, ALT + "\r\n      ALTER TABLE penc_users ADD COLUMN IF NOT EXISTS moderator BOOLEAN DEFAULT FALSE;", "Colonne moderator")

# 2) _modMap inclut moderator
MOD_OLD = "const _mq=await _pgPool.query('SELECT id, muted_until, suspended FROM penc_users'); _mq.rows.forEach(function(r){ _modMap[String(r.id)]={muted_until:r.muted_until||null, suspended:!!r.suspended}; });"
MOD_NEW = "const _mq=await _pgPool.query('SELECT id, muted_until, suspended, moderator FROM penc_users'); _mq.rows.forEach(function(r){ _modMap[String(r.id)]={muted_until:r.muted_until||null, suspended:!!r.suspended, moderator:!!r.moderator}; });"
s = R(s, MOD_OLD, MOD_NEW, "Map moderator")

# 3) is_moderator dans enrich
EN_OLD = "      msgs_sent:(_msgMap[String(u.id)]||0), muted_until:(_modMap[String(u.id)]||{}).muted_until||null, suspended:!!(_modMap[String(u.id)]||{}).suspended };"
EN_NEW = "      msgs_sent:(_msgMap[String(u.id)]||0), is_moderator:!!(_modMap[String(u.id)]||{}).moderator, muted_until:(_modMap[String(u.id)]||{}).muted_until||null, suspended:!!(_modMap[String(u.id)]||{}).suspended };"
s = R(s, EN_OLD, EN_NEW, "Champ is_moderator")

# 4) Route toggle moderateur (avant la route DELETE user)
ROUTE = """app.post('/api/penc/admin/moderator/:userId', pencAuth, pencAdmin, async (req,res)=>{
  try{ if(!_pgPool) return res.json({success:true});
    const mod=!!(req.body&&req.body.moderator);
    await _pgPool.query('UPDATE penc_users SET moderator=$1 WHERE id=$2',[mod,req.params.userId]);
    res.json({success:true}); }catch(e){ res.status(500).json({error:'Erreur serveur'}); }
});
""".replace("\n", "\r\n")
ANCHOR = "app.delete('/api/penc/admin/user/:id', pencAuth, pencAdmin, async (req, res) => {"
s = R(s, ANCHOR, ROUTE + ANCHOR, "Route moderateur")

with io.open(FN, "wb") as f:
    f.write(("\ufeff" + s).encode("utf-8"))

print("\nTermine. server-at.js mis a jour (A2d).")
print("Verifie : node --check server-at.js")
