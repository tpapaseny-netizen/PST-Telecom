# -*- coding: utf-8 -*-
"""
PENC SERVER — Patch A1 (backend Dashboard Analytics)
Ajoute la route GET /api/penc/admin/analytics (pencAuth + pencAdmin) :
  - series 30 jours : inscriptions, messages, statuts, vues monetisees (penc_ad_revenue)
  - temps reel : utilisateurs en ligne (pencOnline.size), messages aujourd'hui,
    revenus publicitaires du mois (SUM penc_ad_revenue.total)
N'AJOUTE rien d'autre. Ne touche NI ZAMA NI SenSMS. Tables Penc uniquement.
server-at.js : CRLF + BOM preserves.

    python patch_server_A1_analytics.py
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

# Lire en utf-8-sig (retire le BOM), garde les \r\n
with io.open(FN, "rb") as f:
    raw = f.read()
s = raw.decode("utf-8-sig")

print("Patch serveur A1 — Analytics")

ROUTE = """app.get('/api/penc/admin/analytics', pencAuth, pencAdmin, async (req, res) => {
  try {
    if (!_pgPool) return res.json({ series:{signups:[],messages:[],statuses:[],views:[]}, realtime:{online:0,messages_today:0,ad_revenue_month:0} });
    const dayCounts = async (table) => {
      const q = await _pgPool.query("SELECT to_char(date_trunc('day', created_at AT TIME ZONE 'UTC'),'YYYY-MM-DD') d, COUNT(*)::int c FROM " + table + " WHERE created_at >= NOW() - INTERVAL '29 days' GROUP BY d");
      const map = {}; q.rows.forEach(r => { map[r.d] = r.c; });
      const out = [];
      for (let i = 29; i >= 0; i--) { const key = new Date(Date.now() - i*86400000).toISOString().slice(0,10); out.push({ date: key, count: map[key] || 0 }); }
      return out;
    };
    let signups=[], messages=[], statuses=[], views=[];
    try { signups  = await dayCounts('penc_users'); } catch(e){}
    try { messages = await dayCounts('penc_messages'); } catch(e){}
    try { statuses = await dayCounts('penc_statuses'); } catch(e){}
    try { views    = await dayCounts('penc_ad_revenue'); } catch(e){}
    let messages_today = 0, ad_revenue_month = 0, online = 0;
    try { const t = await _pgPool.query("SELECT COUNT(*)::int c FROM penc_messages WHERE created_at >= date_trunc('day', NOW())"); messages_today = t.rows[0].c; } catch(e){}
    try { const m = await _pgPool.query("SELECT COALESCE(SUM(total),0)::int s FROM penc_ad_revenue WHERE created_at >= date_trunc('month', NOW())"); ad_revenue_month = m.rows[0].s; } catch(e){}
    try { online = pencOnline.size; } catch(e){}
    res.json({ series:{signups,messages,statuses,views}, realtime:{online, messages_today, ad_revenue_month} });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});
"""
ROUTE = ROUTE.replace("\n", "\r\n")

ANCHOR = "app.post('/api/penc/admin/withdraw/approve', pencAuth, pencAdmin, async (req, res) => {"
s = R(s, ANCHOR, ROUTE + ANCHOR, "Route /admin/analytics inseree")

# Ecrire : BOM + CRLF preserves
with io.open(FN, "wb") as f:
    f.write(("\ufeff" + s).encode("utf-8"))

print("\nTermine. server-at.js mis a jour (A1 analytics).")
print("Verifie : node --check server-at.js")
