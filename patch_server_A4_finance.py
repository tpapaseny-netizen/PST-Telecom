# -*- coding: utf-8 -*-
"""
PENC SERVER — Patch A4 (gestion financiere)
  - GET  /api/penc/admin/finance          synthese: revenus pub (total/createurs/penc/reserve),
                                            ce mois, 6 derniers mois, top createurs,
                                            retraits en attente, historique payes, total verse
  - POST /api/penc/admin/withdraw/reject   rejette une demande de retrait
(reutilise penc_ad_revenue + champs balance/withdrawn/withdraw_request deja existants)
Penc uniquement. ZAMA/SenSMS intacts. BOM + CRLF preserves.

    python patch_server_A4_finance.py
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

print("Patch serveur A4 — finances")

ROUTES = """app.get('/api/penc/admin/finance', pencAuth, pencAdmin, async (req, res) => {
  try {
    let allTime = { total:0, creators:0, penc:0, reserve:0 };
    let month   = { total:0, creators:0, penc:0, reserve:0 };
    let months = [];
    if (_pgPool) {
      try { const a = await _pgPool.query("SELECT COALESCE(SUM(total),0)::int t, COALESCE(SUM(creator_share),0)::int c, COALESCE(SUM(penc_share),0)::int p, COALESCE(SUM(reserve_share),0)::int r FROM penc_ad_revenue"); allTime = { total:a.rows[0].t, creators:a.rows[0].c, penc:a.rows[0].p, reserve:a.rows[0].r }; } catch(e){}
      try { const m = await _pgPool.query("SELECT COALESCE(SUM(total),0)::int t, COALESCE(SUM(creator_share),0)::int c, COALESCE(SUM(penc_share),0)::int p, COALESCE(SUM(reserve_share),0)::int r FROM penc_ad_revenue WHERE created_at >= date_trunc('month', NOW())"); month = { total:m.rows[0].t, creators:m.rows[0].c, penc:m.rows[0].p, reserve:m.rows[0].r }; } catch(e){}
      try { const mm = await _pgPool.query("SELECT to_char(date_trunc('month', created_at),'YYYY-MM') m, COALESCE(SUM(total),0)::int t, COALESCE(SUM(creator_share),0)::int c, COALESCE(SUM(penc_share),0)::int p FROM penc_ad_revenue WHERE created_at >= date_trunc('month', NOW()) - INTERVAL '5 months' GROUP BY m ORDER BY m"); months = mm.rows.map(function(x){ return { month:x.m, total:x.t, creators:x.c, penc:x.p }; }); } catch(e){}
    }
    const users = _pgPool ? (await pgAllUsers()||[]) : await pencUsers();
    const enrich = (u) => { const vv=u.valid_views||0; const earned=Math.floor(vv/1000)*75; const withdrawn=u.withdrawn||0; return { id:u.id, full_name:u.full_name, username:u.username, phone:u.phone, avatar_url:u.avatar_url||null, valid_views:vv, earned, withdrawn, balance:Math.max(0,earned-withdrawn), withdraw_request:u.withdraw_request||null }; };
    const all = users.map(enrich);
    const topCreators = all.filter(u=>u.earned>0).sort((a,b)=>b.earned-a.earned).slice(0,20);
    const pendingWithdrawals = all.filter(u=>u.withdraw_request && u.withdraw_request.status==='pending');
    const paidHistory = all.filter(u=>u.withdraw_request && u.withdraw_request.status==='paid').sort(function(a,b){ return new Date(b.withdraw_request.paid_at||0)-new Date(a.withdraw_request.paid_at||0); }).slice(0,50);
    const totalPaidOut = all.reduce((a,u)=>a+(u.withdrawn||0),0);
    res.json({ allTime, month, months, topCreators, pendingWithdrawals, paidHistory, totalPaidOut });
  } catch (e) { res.status(500).json({ error:'Erreur serveur' }); }
});
app.post('/api/penc/admin/withdraw/reject', pencAuth, pencAdmin, async (req, res) => {
  try {
    const { user_id } = req.body;
    const users = await pencUsers();
    const u = users.find(x => x.id === user_id);
    if (!u || !u.withdraw_request) return res.status(404).json({ error: 'Aucune demande' });
    u.withdraw_request.status = 'rejected';
    u.withdraw_request.rejected_at = new Date().toISOString();
    u.reward_pending = false;
    await pencSaveUsers(users);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: 'Erreur serveur' }); }
});
""".replace("\n", "\r\n")

ANCHOR = "// ── Modération admin (Fonct. 5) ──"
s = R(s, ANCHOR, ROUTES + ANCHOR, "Routes finances")

with io.open(FN, "wb") as f:
    f.write(("\ufeff" + s).encode("utf-8"))

print("\nTermine. server-at.js mis a jour (A4).")
print("Verifie : node --check server-at.js")
