# -*- coding: utf-8 -*-
"""PENC SERVEUR — route /api/penc/calls (historique des appels)"""
import io, sys
FN="server-at.js"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"r",encoding="utf-8-sig",newline="").read()
print("Patch serveur — /api/penc/calls")

ROUTE = (
"// GET /api/penc/calls \u2014 historique des appels (fa\u00e7on WhatsApp)\r\n"
"app.get('/api/penc/calls', pencAuth, async (req, res) => {\r\n"
"  try {\r\n"
"    const me = req.pencUser.userId;\r\n"
"    if (!_pgPool) return res.json({ calls: [] });\r\n"
"    const r = await _pgPool.query(\r\n"
"      \"SELECT m.id, m.content, m.created_at, m.sender_id, m.conversation_id, c.participants \" +\r\n"
"      \"FROM penc_messages m JOIN penc_conversations c ON c.id = m.conversation_id \" +\r\n"
"      \"WHERE m.type = 'call' AND (m.deleted_for_all IS NOT TRUE) AND c.participants @> $1::jsonb \" +\r\n"
"      \"ORDER BY m.created_at DESC LIMIT 200\",\r\n"
"      [JSON.stringify([me])]\r\n"
"    );\r\n"
"    const others = new Set();\r\n"
"    const rows = r.rows.map(row => {\r\n"
"      let parts = []; try { parts = Array.isArray(row.participants) ? row.participants : JSON.parse(row.participants || '[]'); } catch (e) {}\r\n"
"      const other = parts.find(p => String(p) !== String(me)) || null;\r\n"
"      if (other) others.add(other);\r\n"
"      let d = {}; try { d = JSON.parse(row.content || '{}'); } catch (e) {}\r\n"
"      return {\r\n"
"        id: row.id, conversation_id: row.conversation_id,\r\n"
"        call_type: d.call_type === 'video' ? 'video' : 'audio',\r\n"
"        status: d.status || 'answered', duration: d.duration || 0,\r\n"
"        direction: String(row.sender_id) === String(me) ? 'out' : 'in',\r\n"
"        other_id: other, created_at: row.created_at\r\n"
"      };\r\n"
"    });\r\n"
"    let profiles = {};\r\n"
"    if (others.size) {\r\n"
"      const ids = Array.from(others);\r\n"
"      const pr = await _pgPool.query(\"SELECT id, full_name, username, avatar_url FROM penc_users WHERE id = ANY($1)\", [ids]);\r\n"
"      pr.rows.forEach(u => { profiles[u.id] = { id: u.id, full_name: u.full_name, username: u.username, avatar_url: u.avatar_url }; });\r\n"
"    }\r\n"
"    const calls = rows.map(c => ({\r\n"
"      id: c.id, conversation_id: c.conversation_id, call_type: c.call_type,\r\n"
"      status: c.status, duration: c.duration, direction: c.direction, created_at: c.created_at,\r\n"
"      other: c.other_id ? (profiles[c.other_id] || { id: c.other_id, full_name: 'Inconnu' }) : null\r\n"
"    }));\r\n"
"    res.json({ calls });\r\n"
"  } catch (e) { console.error('penc /calls:', e.message); res.json({ calls: [] }); }\r\n"
"});\r\n"
"app.put('/api/penc/auth/profile', pencAuth, async (req, res) => {")
s=R(s,"app.put('/api/penc/auth/profile', pencAuth, async (req, res) => {",ROUTE,"Route /api/penc/calls")

data=("\ufeff"+s).encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. server-at.js mis a jour.")
