# -*- coding: utf-8 -*-
"""PENC SERVER — stockage statut multi-photos (colonne media_urls)"""
import io, sys
FN="server-at.js"
def R(s,old,new,label):
    n=s.count(old)
    if n!=1: print("  [ECHEC] %s : %d"%(label,n)); sys.exit(1)
    print("  [OK]   %s"%label); return s.replace(old,new)
s=io.open(FN,"rb").read().decode("utf-8-sig")
print("Patch serveur — media_urls")

# 1) ALTER TABLE
s=R(s,"      ALTER TABLE penc_statuses ADD COLUMN IF NOT EXISTS shares INTEGER DEFAULT 0;",
      "      ALTER TABLE penc_statuses ADD COLUMN IF NOT EXISTS shares INTEGER DEFAULT 0;\r\n      ALTER TABLE penc_statuses ADD COLUMN IF NOT EXISTS media_urls JSONB DEFAULT NULL;",
      "ALTER media_urls")

# 2a) INSERT colonnes
s=R(s,
"'INSERT INTO penc_statuses(id,user_id,type,media_url,text_content,bg_color,caption,reactions,views,view_ips,created_at,expires_at,duration)'\r\n    +' VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *',",
"'INSERT INTO penc_statuses(id,user_id,type,media_url,text_content,bg_color,caption,reactions,views,view_ips,created_at,expires_at,duration,media_urls)'\r\n    +' VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *',",
"INSERT colonnes media_urls")

# 2b) INSERT valeur
s=R(s,"     st.duration||10]\r\n  );",
      "     st.duration||10,\r\n     (Array.isArray(st.media_urls)&&st.media_urls.length)?JSON.stringify(st.media_urls):null]\r\n  );",
      "INSERT valeur media_urls")

# 3) pgStatusToObj
s=R(s,
"    view_log: typeof row.view_log==='string'?JSON.parse(row.view_log):row.view_log||[]\r\n  };",
"    view_log: typeof row.view_log==='string'?JSON.parse(row.view_log):row.view_log||[],\r\n    media_urls: typeof row.media_urls==='string'?JSON.parse(row.media_urls):(row.media_urls||null)\r\n  };",
"pgStatusToObj media_urls")

# 4) Route POST /api/penc/statuses
s=R(s,
"    const { type, media_url, text_content, bg_color, caption, duration } = req.body;\r\n    const status = {\r\n      id: 'st_'+Date.now()+Math.random().toString(36).slice(2),\r\n      user_id: req.pencUser.userId, type: type||'text',\r\n      media_url: media_url||null, text_content: text_content||null,",
"    const { type, media_url, text_content, bg_color, caption, duration, media_urls } = req.body;\r\n    const _mu = Array.isArray(media_urls)?media_urls.filter(function(u){return !!u;}).slice(0,10):null;\r\n    const status = {\r\n      id: 'st_'+Date.now()+Math.random().toString(36).slice(2),\r\n      user_id: req.pencUser.userId, type: type||'text',\r\n      media_url: (_mu&&_mu.length)?_mu[0]:(media_url||null), media_urls: (_mu&&_mu.length>1)?_mu:null, text_content: text_content||null,",
"Route POST media_urls")

data=("\ufeff"+s).encode("utf-8")
io.open(FN,"wb").write(data)
print("\nTermine. server-at.js (media_urls).")
