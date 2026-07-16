# -*- coding: utf-8 -*-
"""
PENC SERVER — Patch : compte officiel "Penc" + welcome auto
  1. Cree un compte officiel 'penc_official' (full_name "Penc", avatar = logo)
  2. La route admin /message envoie DEPUIS Penc (et non depuis l'admin perso)
  3. A chaque inscription : message de bienvenue automatique envoye par Penc
Penc uniquement. ZAMA/SenSMS intacts. BOM + CRLF preserves.

    python patch_server_penc_official.py
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

print("Patch serveur — Compte officiel Penc + welcome")

# 1) Creer le compte officiel apres l'init du schema
CONLOG = "    console.log('\u2705 PostgreSQL Penc connect\u00e9 \u2014 tables users/convs/messages pr\u00eates');"
OFFICIAL = CONLOG + "\r\n    try{ await _pgPool.query(\"INSERT INTO penc_users(id,full_name,username,phone,email,password_hash,avatar_url,bio,created_at) VALUES('penc_official','Penc','penc_officiel','+00000000000',NULL,'-','https://penc-messagerie.com/penc-icon-192.png','Compte officiel Penc',NOW()) ON CONFLICT(id) DO UPDATE SET full_name='Penc', avatar_url='https://penc-messagerie.com/penc-icon-192.png', bio='Compte officiel Penc'\"); console.log('\u2705 Compte officiel Penc pret'); }catch(eOff){ console.error('Penc official:', eOff.message); }"
s = R(s, CONLOG, OFFICIAL, "Compte officiel Penc")

# 2) La route admin /message envoie depuis Penc
s = R(s, "    const conv = await pgGetOrCreateConv(adminId, target);",
          "    const conv = await pgGetOrCreateConv('penc_official', target);", "DM: conv Penc<->user")
s = R(s, "      conversation_id: conv.id, sender_id: adminId, reply_to: null,",
          "      conversation_id: conv.id, sender_id: 'penc_official', reply_to: null,", "DM: sender Penc")
s = R(s, "    let sender = { id: adminId };",
          "    let sender = { id: 'penc_official' };", "DM: sender obj Penc")
s = R(s, "    try { const u = await pgFindUser('id', adminId); if (u) sender = pencStrip(u); } catch (_) {}",
          "    try { const u = await pgFindUser('id', 'penc_official'); if (u) sender = pencStrip(u); } catch (_) {}", "DM: fetch Penc")
s = R(s, "    try { io.to('user:' + String(adminId)).emit('message:new', fullMsg); } catch (_) {}",
          "    try { io.to('user:' + String('penc_official')).emit('message:new', fullMsg); } catch (_) {}", "DM: emit Penc")

# 3) Message de bienvenue automatique a l'inscription
NOTIFY = "        try{ if(_pgPool){ const _ar=await _pgPool.query(\"SELECT id FROM penc_users WHERE LOWER(email) = ANY($1)\",[PENC_ADMIN_EMAILS]); _ar.rows.forEach(function(a){ emitToUsers(String(a.id),'admin:newuser',{id:uid, full_name:full_name, email:email||'', phone:phone}); }); } }catch(e4){}"
WELCOME = NOTIFY + (
  "\r\n        try{ if(_pgPool){"
  "\r\n          const _wconv = await pgGetOrCreateConv('penc_official', uid);"
  "\r\n          if(_wconv){"
  "\r\n            const _wtext = \"Bienvenue sur Penc, \"+full_name+\" ! \\ud83c\\udf89 Heureux de t'accueillir parmi nous. Discute en priv\\u00e9, partage tes statuts, \\u00e9coute la radio DeglouFM et profite de toutes les fonctionnalit\\u00e9s. R\\u00e9ponds \\u00e0 ce message pour toute question. \\u2014 L'\\u00e9quipe Penc \\ud83d\\udc9a\";"
  "\r\n            const _wmsg = { id:'msg_'+Date.now()+Math.random().toString(36).slice(2), conversation_id:_wconv.id, sender_id:'penc_official', type:'text', content:_wtext, created_at:new Date().toISOString() };"
  "\r\n            let _wsender={ id:'penc_official', full_name:'Penc' }; try{ const _pu=await pgFindUser('id','penc_official'); if(_pu) _wsender=pencStrip(_pu); }catch(_){}"
  "\r\n            const _wfull = Object.assign({}, _wmsg, { sender:_wsender });"
  "\r\n            try{ io.to('penc:'+_wconv.id).emit('message:new',_wfull); }catch(_){}"
  "\r\n            try{ io.to('user:'+String(uid)).emit('message:new',_wfull); }catch(_){}"
  "\r\n            try{ await pgSaveMessage({ id:_wmsg.id, conversation_id:_wconv.id, sender_id:'penc_official', type:'text', content:_wtext, created_at:_wmsg.created_at }); }catch(_){}"
  "\r\n            try{ if(typeof webpush!=='undefined' && webpush){ await sendPencPush(uid,{title:'Penc',body:'Bienvenue sur Penc ! \\ud83c\\udf89',tag:'penc-welcome',url:'/messager?conv='+_wconv.id,conv_id:_wconv.id}); } }catch(_){}"
  "\r\n          }"
  "\r\n        } }catch(eWel){}"
)
s = R(s, NOTIFY, WELCOME, "Message de bienvenue auto")

with io.open(FN, "wb") as f:
    f.write(("\ufeff" + s).encode("utf-8"))

print("\nTermine. server-at.js mis a jour (compte officiel + welcome).")
print("Verifie : node --check server-at.js")
