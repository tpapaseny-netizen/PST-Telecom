// ══════════════════════════════════════════════════════════════════════════════
//  ACADÉMIE NUMÉRIQUE DU SÉNÉGAL (ANS) — module serveur
//  De la CI à la Terminale : cours des professeurs partenaires, quiz et évaluations,
//  progression hors connexion, abonnements (Wave, Orange Money, Google Play, codes
//  prépayés / écoles, bourses et subventions, accès au mérite), et l'IA au cœur
//  (Prof IA, quiz générés, correction, vidéos avec avatar et doublage).
//  Branché sur server-at.js par une seule ligne ; tables préfixées « ans_ » ;
//  ne touche à aucune autre partie de PST-Telecom.
// ══════════════════════════════════════════════════════════════════════════════
'use strict';
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

module.exports = function ansMount(ctx){
  const app = ctx.app;
  const pg = function(){ return ctx.pg(); };
  const jwt = ctx.jwt;
  const bcrypt = ctx.bcrypt;
  const SECRET = ctx.secret;
  const R2 = ctx.r2 || {};
  const API = '/api/ans';
  const log = function(){ try{ console.log.apply(console, ['[ans]'].concat([].slice.call(arguments))); }catch(_){} };

  // ── Le programme sénégalais ──
  const LEVELS = [
    { code:'CI', name:'CI', cycle:'elementaire', order:1 }, { code:'CP', name:'CP', cycle:'elementaire', order:2 },
    { code:'CE1', name:'CE1', cycle:'elementaire', order:3 }, { code:'CE2', name:'CE2', cycle:'elementaire', order:4 },
    { code:'CM1', name:'CM1', cycle:'elementaire', order:5 }, { code:'CM2', name:'CM2 (CFEE)', cycle:'elementaire', order:6 },
    { code:'6E', name:'6e', cycle:'moyen', order:7 }, { code:'5E', name:'5e', cycle:'moyen', order:8 },
    { code:'4E', name:'4e', cycle:'moyen', order:9 }, { code:'3E', name:'3e (BFEM)', cycle:'moyen', order:10 },
    { code:'2ND', name:'Seconde', cycle:'secondaire', order:11, series:['L','S'] },
    { code:'1ER', name:'Première', cycle:'secondaire', order:12, series:['L1','L2','S1','S2','S3','G'] },
    { code:'TLE', name:'Terminale (Bac)', cycle:'secondaire', order:13, series:['L1','L2','S1','S2','S3','G'] }
  ];
  const SUBJECTS = [
    { code:'fr', name:'Français', icon:'📖', cycles:['elementaire','moyen','secondaire'] },
    { code:'math', name:'Mathématiques', icon:'📐', cycles:['elementaire','moyen','secondaire'] },
    { code:'eveil', name:'Éveil (sciences, histoire, géo)', icon:'🌱', cycles:['elementaire'] },
    { code:'ecm', name:'Éducation civique', icon:'🇸🇳', cycles:['elementaire','moyen'] },
    { code:'svt', name:'SVT', icon:'🧬', cycles:['moyen','secondaire'] },
    { code:'pc', name:'Physique-Chimie', icon:'⚗️', cycles:['moyen','secondaire'] },
    { code:'hg', name:'Histoire-Géographie', icon:'🌍', cycles:['moyen','secondaire'] },
    { code:'ang', name:'Anglais', icon:'🇬🇧', cycles:['elementaire','moyen','secondaire'] },
    { code:'esp', name:'Espagnol', icon:'🇪🇸', cycles:['moyen','secondaire'] },
    { code:'ar', name:'Arabe', icon:'🌙', cycles:['elementaire','moyen','secondaire'] },
    { code:'philo', name:'Philosophie', icon:'💭', cycles:['secondaire'] },
    { code:'eco', name:'Économie / Gestion', icon:'📊', cycles:['secondaire'] },
    { code:'info', name:'Informatique', icon:'💻', cycles:['moyen','secondaire'] },
    { code:'wo', name:'Wolof', icon:'🗣️', cycles:['elementaire','moyen','secondaire'] }
  ];
  const DEFAULTS = { price_month: 2500, price_quarter: 6500, price_year: 20000, price_eval: 500, merit_days: 30, merit_score: 80,
    wave_url: process.env.ANS_WAVE_URL || '', om_number: process.env.ANS_OM_NUMBER || '', om_name: 'Académie Numérique du Sénégal',
    support_phone: process.env.ANS_SUPPORT_PHONE || '', trial_days: 7 };
  const PLANS = { month: { days: 31, key: 'price_month', label: '1 mois' }, quarter: { days: 92, key: 'price_quarter', label: '3 mois' }, year: { days: 366, key: 'price_year', label: '1 an' } };

  // ── Base de données ──
  let ready = null;
  function init(){
    if(ready) return ready;
    const db = pg(); if(!db) return Promise.reject(new Error('Base indisponible'));
    ready = db.query(`
      CREATE TABLE IF NOT EXISTS ans_users (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT UNIQUE NOT NULL, email TEXT, pwd_hash TEXT NOT NULL,
        role TEXT DEFAULT 'eleve', level TEXT, serie TEXT, school TEXT, region TEXT, bio TEXT, avatar_url TEXT, subjects JSONB DEFAULT '[]',
        prof_status TEXT, banned BOOLEAN DEFAULT FALSE, pwd_changed_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW(), last_seen TIMESTAMPTZ DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS ans_courses (id TEXT PRIMARY KEY, prof_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT, level TEXT NOT NULL, serie TEXT, subject TEXT NOT NULL,
        cover_url TEXT, lang TEXT DEFAULT 'fr', free BOOLEAN DEFAULT FALSE, status TEXT DEFAULT 'draft', reject_reason TEXT, views INT DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW(), published_at TIMESTAMPTZ);
      CREATE INDEX IF NOT EXISTS ans_courses_lvl ON ans_courses(level, subject, status);
      CREATE TABLE IF NOT EXISTS ans_lessons (id TEXT PRIMARY KEY, course_id TEXT NOT NULL, idx INT DEFAULT 0, title TEXT NOT NULL, kind TEXT NOT NULL,
        media_url TEXT, media_size BIGINT, duration INT, body TEXT, quiz JSONB, free_preview BOOLEAN DEFAULT FALSE, versions JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW());
      CREATE INDEX IF NOT EXISTS ans_lessons_c ON ans_lessons(course_id, idx);
      CREATE TABLE IF NOT EXISTS ans_progress (user_id TEXT NOT NULL, lesson_id TEXT NOT NULL, course_id TEXT, done BOOLEAN DEFAULT FALSE, score INT, seconds INT DEFAULT 0,
        updated_at TIMESTAMPTZ DEFAULT NOW(), PRIMARY KEY(user_id, lesson_id));
      CREATE TABLE IF NOT EXISTS ans_evals (id TEXT PRIMARY KEY, author_id TEXT, course_id TEXT, level TEXT, serie TEXT, subject TEXT, title TEXT NOT NULL, kind TEXT DEFAULT 'quiz',
        price INT DEFAULT 0, questions JSONB NOT NULL, minutes INT, pass_score INT DEFAULT 50, merit BOOLEAN DEFAULT FALSE, status TEXT DEFAULT 'published', created_at TIMESTAMPTZ DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS ans_attempts (id TEXT PRIMARY KEY, eval_id TEXT NOT NULL, user_id TEXT NOT NULL, score INT, answers JSONB, client_id TEXT, created_at TIMESTAMPTZ DEFAULT NOW());
      CREATE UNIQUE INDEX IF NOT EXISTS ans_attempts_cid ON ans_attempts(user_id, client_id);
      CREATE TABLE IF NOT EXISTS ans_access (user_id TEXT PRIMARY KEY, until TIMESTAMPTZ, source TEXT, updated_at TIMESTAMPTZ DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS ans_eval_unlocks (user_id TEXT NOT NULL, eval_id TEXT NOT NULL, source TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), PRIMARY KEY(user_id, eval_id));
      CREATE TABLE IF NOT EXISTS ans_payments (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, method TEXT NOT NULL, purpose TEXT NOT NULL, amount INT NOT NULL, status TEXT DEFAULT 'pending',
        ref TEXT, payer_phone TEXT, proof_url TEXT, meta JSONB, created_at TIMESTAMPTZ DEFAULT NOW(), decided_at TIMESTAMPTZ, decided_by TEXT);
      CREATE TABLE IF NOT EXISTS ans_codes (code TEXT PRIMARY KEY, days INT NOT NULL, sponsor TEXT, school TEXT, batch TEXT, used_by TEXT, used_at TIMESTAMPTZ, created_by TEXT, created_at TIMESTAMPTZ DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS ans_grants (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT DEFAULT 'bourse', reason TEXT, school TEXT, guardian_phone TEXT, doc_url TEXT,
        status TEXT DEFAULT 'pending', days INT, note TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), decided_at TIMESTAMPTZ, decided_by TEXT);
      CREATE TABLE IF NOT EXISTS ans_merit (user_id TEXT NOT NULL, eval_id TEXT NOT NULL, days INT, created_at TIMESTAMPTZ DEFAULT NOW(), PRIMARY KEY(user_id, eval_id));
      CREATE TABLE IF NOT EXISTS ans_settings (k TEXT PRIMARY KEY, v JSONB);
      CREATE TABLE IF NOT EXISTS ans_ai_log (id BIGSERIAL PRIMARY KEY, user_id TEXT, kind TEXT, lesson_id TEXT, tokens INT, created_at TIMESTAMPTZ DEFAULT NOW());
      CREATE TABLE IF NOT EXISTS ans_ai_jobs (id TEXT PRIMARY KEY, user_id TEXT, lesson_id TEXT, kind TEXT NOT NULL, params JSONB, status TEXT DEFAULT 'queued', progress INT DEFAULT 0,
        result_url TEXT, error TEXT, worker TEXT, created_at TIMESTAMPTZ DEFAULT NOW(), started_at TIMESTAMPTZ, done_at TIMESTAMPTZ);
    `).then(function(){ log('tables prêtes'); }).catch(function(e){ ready = null; throw e; });
    return ready;
  }
  setTimeout(function(){ init().catch(function(e){ log('init:', e.message); }); }, 8000);

  // ── Outils ──
  function id(p){ return p + '_' + Date.now().toString(36) + crypto.randomBytes(4).toString('hex'); }
  function txt(s, n){ return String(s == null ? '' : s).replace(/[<>]/g, '').trim().slice(0, n || 200); }
  function phone(p){ let s = String(p || '').replace(/[^0-9+]/g, '').replace(/^00/, '+'); if(/^[0-9]{9}$/.test(s)) s = '+221' + s; if(/^221[0-9]{9}$/.test(s)) s = '+' + s; return /^\+[0-9]{9,15}$/.test(s) ? s : null; }
  function lvl(c){ c = String(c || '').toUpperCase(); return LEVELS.find(function(l){ return l.code === c; }) || null; }
  function subj(c){ return SUBJECTS.find(function(s){ return s.code === String(c || ''); }) || null; }
  function okUrl(u){ return /^https?:\/\/[^\s<>"']{6,900}$/.test(String(u || '')); }
  function sign(u){ return jwt.sign({ ans: u.id }, SECRET, { expiresIn: '365d' }); }
  async function settings(){ try{ const r = (await pg().query("SELECT v FROM ans_settings WHERE k='main'")).rows[0]; return Object.assign({}, DEFAULTS, (r && r.v) || {}); }catch(_){ return Object.assign({}, DEFAULTS); } }
  function pubUser(u){ if(!u) return null; return { id:u.id, name:u.name, phone:u.phone, email:u.email || null, role:u.role, level:u.level, serie:u.serie, school:u.school, region:u.region,
    bio:u.bio, avatar_url:u.avatar_url, subjects:u.subjects || [], prof_status:u.prof_status || null, created_at:u.created_at }; }
  function wrap(fn){ return async function(req, res){ try{ await init(); await fn(req, res); }catch(e){ log(req.method, req.path, e.message); if(!res.headersSent){ if(/^Le Prof IA/.test(e.message)) res.status(503).json({ error: e.message }); else res.status(500).json({ error:'Erreur serveur, réessaie.' }); } } }; }
  const rate = new Map();
  function tooFast(key, max, ms){ const now = Date.now(); const a = (rate.get(key) || []).filter(function(t){ return now - t < ms; }); a.push(now); rate.set(key, a); if(rate.size > 20000) rate.clear(); return a.length > max; }

  async function auth(req, res, next){
    try{
      const h = req.headers.authorization || ''; if(!h.startsWith('Bearer ')) return res.status(401).json({ error:'Connecte-toi' });
      let d; try{ d = jwt.verify(h.slice(7), SECRET); }catch(_){ return res.status(401).json({ error:'Session expirée, reconnecte-toi' }); }
      await init();
      const u = (await pg().query('SELECT * FROM ans_users WHERE id=$1', [String(d.ans)])).rows[0];
      if(!u) return res.status(401).json({ error:'Session expirée, reconnecte-toi' });
      if(u.banned) return res.status(403).json({ error:'Compte suspendu' });
      if(u.pwd_changed_at && d.iat && d.iat * 1000 < new Date(u.pwd_changed_at).getTime() - 1000) return res.status(401).json({ error:'Session expirée, reconnecte-toi' });
      req.ans = u; pg().query('UPDATE ans_users SET last_seen=NOW() WHERE id=$1', [u.id]).catch(function(){});
      next();
    }catch(e){ res.status(500).json({ error:'Erreur' }); }
  }
  function role(){ const roles = [].slice.call(arguments); return function(req, res, next){ if(roles.indexOf(req.ans.role) < 0 && req.ans.role !== 'admin') return res.status(403).json({ error:'Accès réservé' }); if(req.ans.role === 'prof' && roles.indexOf('prof') >= 0 && req.ans.prof_status !== 'approved' && roles.indexOf('prof_pending') < 0) return res.status(403).json({ error:'Ton compte professeur est en cours de validation' }); next(); }; }
  const isAdmin = function(req, res, next){ if(req.ans.role !== 'admin') return res.status(403).json({ error:'Accès réservé à l’administration' }); next(); };

  async function access(uid){ const r = (await pg().query('SELECT until, source FROM ans_access WHERE user_id=$1', [uid])).rows[0]; const until = r && r.until ? new Date(r.until) : null; return { active: !!(until && until > new Date()), until: until ? until.toISOString() : null, source: r ? r.source : null }; }
  async function extend(uid, days, source){
    await pg().query(`INSERT INTO ans_access(user_id, until, source, updated_at) VALUES($1, NOW() + ($2 || ' days')::interval, $3, NOW())
      ON CONFLICT (user_id) DO UPDATE SET until = GREATEST(COALESCE(ans_access.until, NOW()), NOW()) + ($2 || ' days')::interval, source=$3, updated_at=NOW()`, [uid, String(Math.max(1, Math.round(days))), source]);
    return access(uid);
  }
  async function canSee(u, course, lesson){
    if(!u) return false;
    if(u.role === 'admin' || String(course.prof_id) === String(u.id)) return true;
    if(course.free || (lesson && lesson.free_preview)) return true;
    return (await access(u.id)).active;
  }
  function lessonOut(l, open){ return { id:l.id, course_id:l.course_id, idx:l.idx, title:l.title, kind:l.kind, duration:l.duration, media_size:l.media_size ? Number(l.media_size) : null, free_preview:!!l.free_preview, locked:!open,
    media_url: open ? (l.media_url || null) : null, body: open ? (l.body || null) : null, quiz: open ? (l.quiz || null) : null, versions: open ? (l.versions || {}) : {}, updated_at:l.updated_at }; }
  function courseOut(c, extra){ return Object.assign({ id:c.id, title:c.title, description:c.description, level:c.level, serie:c.serie, subject:c.subject, cover_url:c.cover_url, lang:c.lang, free:!!c.free, status:c.status,
    reject_reason:c.reject_reason || null, prof_id:c.prof_id, views:c.views || 0, updated_at:c.updated_at, published_at:c.published_at }, extra || {}); }
  async function profNames(ids){ const m = {}; if(!ids.length) return m; (await pg().query('SELECT id, name, avatar_url, school FROM ans_users WHERE id = ANY($1)', [ids])).rows.forEach(function(u){ m[u.id] = u; }); return m; }

  // ═══════════════ Comptes ═══════════════
  app.post(API + '/auth/register', wrap(async function(req, res){
    const b = req.body || {}; const ph = phone(b.phone); const name = txt(b.name, 80);
    if(!name || name.length < 2) return res.status(400).json({ error:'Écris ton nom complet' });
    if(!ph) return res.status(400).json({ error:'Numéro de téléphone invalide' });
    if(String(b.password || '').length < 6) return res.status(400).json({ error:'Le mot de passe doit avoir au moins 6 caractères' });
    if(tooFast('reg:' + (req.ip || ''), 8, 3600000)) return res.status(429).json({ error:'Trop de tentatives, réessaie plus tard' });
    if((await pg().query('SELECT 1 FROM ans_users WHERE phone=$1', [ph])).rows.length) return res.status(409).json({ error:'Ce numéro a déjà un compte. Connecte-toi.' });
    let r = b.role === 'prof' ? 'prof' : (b.role === 'ecole' ? 'ecole' : 'eleve');
    const L = lvl(b.level); const serie = L && L.series && L.series.indexOf(String(b.serie || '')) >= 0 ? String(b.serie) : null;
    const n = (await pg().query('SELECT COUNT(*)::int AS n FROM ans_users')).rows[0].n;
    const admins = String(process.env.ANS_ADMIN_PHONES || '').split(',').map(phone).filter(Boolean);
    let profStatus = r === 'prof' ? 'pending' : null;
    if(admins.indexOf(ph) >= 0 || (!admins.length && n === 0)){ r = 'admin'; profStatus = 'approved'; }
    const u = { id: id('ansu'), name: name, phone: ph };
    await pg().query('INSERT INTO ans_users(id,name,phone,email,pwd_hash,role,level,serie,school,region,subjects,prof_status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',
      [u.id, name, ph, txt(b.email, 120) || null, await bcrypt.hash(String(b.password), 10), r, L ? L.code : null, serie, txt(b.school, 120) || null, txt(b.region, 60) || null,
       JSON.stringify(Array.isArray(b.subjects) ? b.subjects.filter(subj).slice(0, 8) : []), profStatus]);
    // essai gratuit pour les élèves
    const s = await settings(); if(r === 'eleve' && s.trial_days > 0) await extend(u.id, s.trial_days, 'essai');
    const full = (await pg().query('SELECT * FROM ans_users WHERE id=$1', [u.id])).rows[0];
    res.json({ success:true, token: sign(full), user: pubUser(full), access: await access(full.id) });
  }));
  app.post(API + '/auth/login', wrap(async function(req, res){
    const b = req.body || {}; const ph = phone(b.phone);
    if(!ph) return res.status(400).json({ error:'Numéro de téléphone invalide' });
    if(tooFast('login:' + ph, 10, 900000)) return res.status(429).json({ error:'Trop de tentatives, attends quelques minutes' });
    const u = (await pg().query('SELECT * FROM ans_users WHERE phone=$1', [ph])).rows[0];
    if(!u || !(await bcrypt.compare(String(b.password || ''), u.pwd_hash))) return res.status(401).json({ error:'Numéro ou mot de passe incorrect' });
    if(u.banned) return res.status(403).json({ error:'Compte suspendu' });
    res.json({ success:true, token: sign(u), user: pubUser(u), access: await access(u.id) });
  }));
  app.get(API + '/me', auth, wrap(async function(req, res){
    const u = req.ans; const done = (await pg().query('SELECT COUNT(*)::int AS n FROM ans_progress WHERE user_id=$1 AND done', [u.id])).rows[0].n;
    res.json({ user: pubUser(u), access: await access(u.id), stats: { lessons_done: done } });
  }));
  app.put(API + '/me', auth, wrap(async function(req, res){
    const b = req.body || {}; const u = req.ans; const L = b.level !== undefined ? lvl(b.level) : lvl(u.level);
    const serie = L && L.series ? (L.series.indexOf(String(b.serie !== undefined ? b.serie : u.serie || '')) >= 0 ? String(b.serie !== undefined ? b.serie : u.serie) : null) : null;
    await pg().query('UPDATE ans_users SET name=COALESCE($2,name), level=$3, serie=$4, school=COALESCE($5,school), region=COALESCE($6,region), bio=COALESCE($7,bio), email=COALESCE($8,email), subjects=COALESCE($9,subjects) WHERE id=$1',
      [u.id, b.name ? txt(b.name, 80) : null, L ? L.code : null, serie, b.school !== undefined ? txt(b.school, 120) : null, b.region !== undefined ? txt(b.region, 60) : null,
       b.bio !== undefined ? txt(b.bio, 600) : null, b.email !== undefined ? txt(b.email, 120) : null, Array.isArray(b.subjects) ? JSON.stringify(b.subjects.filter(subj).slice(0, 8)) : null]);
    if(b.password){ if(String(b.password).length < 6) return res.status(400).json({ error:'Mot de passe trop court' }); if(!(await bcrypt.compare(String(b.old_password || ''), u.pwd_hash))) return res.status(401).json({ error:'Ancien mot de passe incorrect' });
      await pg().query('UPDATE ans_users SET pwd_hash=$2, pwd_changed_at=NOW() WHERE id=$1', [u.id, await bcrypt.hash(String(b.password), 10)]); }
    const full = (await pg().query('SELECT * FROM ans_users WHERE id=$1', [u.id])).rows[0];
    res.json({ success:true, user: pubUser(full), token: b.password ? sign(full) : undefined });
  }));

  // ═══════════════ Catalogue ═══════════════
  app.get(API + '/catalog', wrap(async function(req, res){
    const s = await settings();
    const counts = {}; (await pg().query("SELECT level, subject, COUNT(*)::int AS n FROM ans_courses WHERE status='published' GROUP BY 1,2")).rows.forEach(function(r){ counts[r.level + ':' + r.subject] = r.n; });
    res.json({ levels: LEVELS, subjects: SUBJECTS, counts: counts,
      prices: { month: s.price_month, quarter: s.price_quarter, year: s.price_year, eval: s.price_eval }, plans: Object.keys(PLANS).map(function(k){ return { id:k, label:PLANS[k].label, days:PLANS[k].days, price:s[PLANS[k].key] }; }),
      pay: { wave: !!s.wave_url, om: !!s.om_number, om_number: s.om_number || null, om_name: s.om_name, play: true, codes: true, grants: true }, merit: { score: s.merit_score, days: s.merit_days }, trial_days: s.trial_days,
      support_phone: s.support_phone || null, ai: aiOn() });
  }));
  app.get(API + '/courses', auth, wrap(async function(req, res){
    const q = req.query || {}; const where = ["c.status='published'"], params = [];
    const L = lvl(q.level || req.ans.level); if(L && q.level !== 'all'){ params.push(L.code); where.push('c.level=$' + params.length); }
    if(q.subject && subj(q.subject)){ params.push(q.subject); where.push('c.subject=$' + params.length); }
    if(q.serie){ params.push(String(q.serie)); where.push('(c.serie IS NULL OR c.serie=$' + params.length + ')'); }
    if(q.q){ params.push('%' + String(q.q).toLowerCase().slice(0, 60) + '%'); where.push('(LOWER(c.title) LIKE $' + params.length + ' OR LOWER(COALESCE(c.description,\'\')) LIKE $' + params.length + ')'); }
    const rows = (await pg().query('SELECT c.*, (SELECT COUNT(*)::int FROM ans_lessons l WHERE l.course_id=c.id) AS n_lessons, (SELECT COALESCE(SUM(media_size),0)::bigint FROM ans_lessons l WHERE l.course_id=c.id) AS size FROM ans_courses c WHERE ' + where.join(' AND ') + ' ORDER BY c.published_at DESC NULLS LAST LIMIT 200', params)).rows;
    const done = {}; if(rows.length) (await pg().query('SELECT course_id, COUNT(*)::int AS n FROM ans_progress WHERE user_id=$1 AND done AND course_id = ANY($2) GROUP BY 1', [req.ans.id, rows.map(function(c){ return c.id; })])).rows.forEach(function(r){ done[r.course_id] = r.n; });
    const pn = await profNames(Array.from(new Set(rows.map(function(c){ return c.prof_id; }))));
    res.json({ courses: rows.map(function(c){ const p = pn[c.prof_id] || {}; return courseOut(c, { n_lessons:c.n_lessons, size:Number(c.size) || 0, done:done[c.id] || 0, prof_name:p.name || 'Professeur', prof_avatar:p.avatar_url || null }); }) });
  }));
  app.get(API + '/courses/:id', auth, wrap(async function(req, res){
    const c = (await pg().query('SELECT * FROM ans_courses WHERE id=$1', [req.params.id])).rows[0];
    if(!c || (c.status !== 'published' && String(c.prof_id) !== String(req.ans.id) && req.ans.role !== 'admin')) return res.status(404).json({ error:'Cours introuvable' });
    const ls = (await pg().query('SELECT * FROM ans_lessons WHERE course_id=$1 ORDER BY idx, created_at', [c.id])).rows;
    const acc = await access(req.ans.id); const own = req.ans.role === 'admin' || String(c.prof_id) === String(req.ans.id);
    const prog = {}; (await pg().query('SELECT lesson_id, done, score FROM ans_progress WHERE user_id=$1 AND course_id=$2', [req.ans.id, c.id])).rows.forEach(function(r){ prog[r.lesson_id] = { done:r.done, score:r.score }; });
    const pn = await profNames([c.prof_id]); const p = pn[c.prof_id] || {};
    pg().query('UPDATE ans_courses SET views=views+1 WHERE id=$1', [c.id]).catch(function(){});
    const evals = (await pg().query("SELECT id, title, kind, price, minutes, pass_score, merit, jsonb_array_length(questions) AS n FROM ans_evals WHERE course_id=$1 AND status='published' ORDER BY created_at", [c.id])).rows;
    res.json({ course: courseOut(c, { prof_name:p.name || 'Professeur', prof_avatar:p.avatar_url || null, prof_school:p.school || null }), access: acc,
      lessons: ls.map(function(l){ const open = own || c.free || l.free_preview || acc.active; return Object.assign(lessonOut(l, open), { progress: prog[l.id] || null }); }), evals: evals });
  }));
  // tout le cours d'un coup pour l'étudier sans connexion
  app.get(API + '/courses/:id/package', auth, wrap(async function(req, res){
    const c = (await pg().query("SELECT * FROM ans_courses WHERE id=$1", [req.params.id])).rows[0];
    if(!c || (c.status !== 'published' && String(c.prof_id) !== String(req.ans.id) && req.ans.role !== 'admin')) return res.status(404).json({ error:'Cours introuvable' });
    const ls = (await pg().query('SELECT * FROM ans_lessons WHERE course_id=$1 ORDER BY idx, created_at', [c.id])).rows;
    const acc = await access(req.ans.id); const own = req.ans.role === 'admin' || String(c.prof_id) === String(req.ans.id);
    const items = ls.map(function(l){ const open = own || c.free || l.free_preview || acc.active; return lessonOut(l, open); });
    const evals = (await pg().query("SELECT * FROM ans_evals WHERE course_id=$1 AND status='published' AND price=0 ORDER BY created_at", [c.id])).rows;
    res.json({ course: courseOut(c), lessons: items, evals: evals.map(function(e){ return evalOut(e, true); }), access: acc, total_size: items.reduce(function(a, l){ return a + (l.locked ? 0 : (l.media_size || 0)); }, 0), at: new Date().toISOString() });
  }));

  // ═══════════════ Progression (et synchronisation après le hors connexion) ═══════════════
  async function saveProgress(uid, p){
    const l = (await pg().query('SELECT id, course_id FROM ans_lessons WHERE id=$1', [String(p.lesson_id || '')])).rows[0]; if(!l) return false;
    await pg().query(`INSERT INTO ans_progress(user_id, lesson_id, course_id, done, score, seconds, updated_at) VALUES($1,$2,$3,$4,$5,$6,NOW())
      ON CONFLICT (user_id, lesson_id) DO UPDATE SET done = ans_progress.done OR EXCLUDED.done, score = GREATEST(COALESCE(ans_progress.score,0), COALESCE(EXCLUDED.score,0)), seconds = ans_progress.seconds + EXCLUDED.seconds, updated_at=NOW()`,
      [uid, l.id, l.course_id, !!p.done, p.score != null ? Math.max(0, Math.min(100, Math.round(Number(p.score) || 0))) : null, Math.max(0, Math.min(36000, Math.round(Number(p.seconds) || 0)))]);
    return true;
  }
  app.post(API + '/progress', auth, wrap(async function(req, res){ res.json({ success: await saveProgress(req.ans.id, req.body || {}) }); }));
  app.post(API + '/sync', auth, wrap(async function(req, res){
    const b = req.body || {}; let p = 0, a = 0; const results = [];
    for(const x of (Array.isArray(b.progress) ? b.progress.slice(0, 500) : [])){ if(await saveProgress(req.ans.id, x)) p++; }
    for(const x of (Array.isArray(b.attempts) ? b.attempts.slice(0, 100) : [])){ try{ const r = await submitEval(req.ans, String(x.eval_id || ''), x.answers || {}, String(x.client_id || '').slice(0, 60) || null); if(r && !r.error){ a++; results.push(Object.assign({ client_id:x.client_id }, r)); } }catch(_){} }
    res.json({ success:true, progress:p, attempts:a, results:results, access: await access(req.ans.id) });
  }));
  app.get(API + '/my/progress', auth, wrap(async function(req, res){
    const rows = (await pg().query(`SELECT c.id, c.title, c.subject, c.level, (SELECT COUNT(*)::int FROM ans_lessons l WHERE l.course_id=c.id) AS total, x.done, x.last
      FROM (SELECT course_id, COUNT(*) FILTER (WHERE done)::int AS done, MAX(updated_at) AS last FROM ans_progress WHERE user_id=$1 GROUP BY course_id) x JOIN ans_courses c ON c.id=x.course_id ORDER BY x.last DESC LIMIT 50`, [req.ans.id])).rows;
    res.json({ courses: rows });
  }));

  // ═══════════════ Évaluations ═══════════════
  function evalOut(e, withQ){ const qs = Array.isArray(e.questions) ? e.questions : [];
    return { id:e.id, course_id:e.course_id, level:e.level, serie:e.serie, subject:e.subject, title:e.title, kind:e.kind, price:e.price || 0, minutes:e.minutes, pass_score:e.pass_score, merit:!!e.merit, n:qs.length,
      questions: withQ ? qs.map(function(q, i){ return { i:i, q:q.q, type:q.type || 'qcm', choices:q.choices || [], points:q.points || 1, image:q.image || null }; }) : undefined }; }
  function cleanQuestions(arr){
    return (Array.isArray(arr) ? arr : []).slice(0, 100).map(function(q){
      const type = ['qcm','vf','court','long'].indexOf(q.type) >= 0 ? q.type : 'qcm';
      const choices = type === 'vf' ? ['Vrai','Faux'] : (Array.isArray(q.choices) ? q.choices.map(function(c){ return txt(c, 300); }).filter(Boolean).slice(0, 6) : []);
      return { q: txt(q.q, 1200), type: type, choices: choices, answer: type === 'qcm' || type === 'vf' ? Math.max(0, Math.min(choices.length - 1, parseInt(q.answer, 10) || 0)) : txt(q.answer, 1200),
        explain: txt(q.explain, 1200), points: Math.max(1, Math.min(20, parseInt(q.points, 10) || 1)), image: okUrl(q.image) ? q.image : null };
    }).filter(function(q){ return q.q && (q.type === 'court' || q.type === 'long' || q.choices.length >= 2); });
  }
  app.get(API + '/evals', auth, wrap(async function(req, res){
    const q = req.query || {}; const L = lvl(q.level || req.ans.level); const params = []; const w = ["status='published'"];
    if(L){ params.push(L.code); w.push('level=$' + params.length); }
    if(q.subject){ params.push(String(q.subject)); w.push('subject=$' + params.length); }
    const rows = (await pg().query('SELECT * FROM ans_evals WHERE ' + w.join(' AND ') + ' ORDER BY created_at DESC LIMIT 100', params)).rows;
    const un = {}; if(rows.length) (await pg().query('SELECT eval_id FROM ans_eval_unlocks WHERE user_id=$1', [req.ans.id])).rows.forEach(function(r){ un[r.eval_id] = 1; });
    const best = {}; if(rows.length) (await pg().query('SELECT eval_id, MAX(score)::int AS s, COUNT(*)::int AS n FROM ans_attempts WHERE user_id=$1 GROUP BY 1', [req.ans.id])).rows.forEach(function(r){ best[r.eval_id] = r; });
    const acc = await access(req.ans.id);
    res.json({ evals: rows.map(function(e){ return Object.assign(evalOut(e, false), { unlocked: !e.price || !!un[e.id] || acc.active, best: best[e.id] ? best[e.id].s : null, attempts: best[e.id] ? best[e.id].n : 0 }); }) });
  }));
  async function evalOpen(u, e){ if(!e.price || u.role === 'admin' || String(e.author_id) === String(u.id)) return true; if((await access(u.id)).active) return true; return !!(await pg().query('SELECT 1 FROM ans_eval_unlocks WHERE user_id=$1 AND eval_id=$2', [u.id, e.id])).rows.length; }
  app.get(API + '/evals/:id', auth, wrap(async function(req, res){
    const e = (await pg().query('SELECT * FROM ans_evals WHERE id=$1', [req.params.id])).rows[0]; if(!e) return res.status(404).json({ error:'Évaluation introuvable' });
    const open = await evalOpen(req.ans, e);
    res.json({ eval: Object.assign(evalOut(e, open), { unlocked: open }) });
  }));
  async function submitEval(u, evalId, answers, clientId){
    const e = (await pg().query('SELECT * FROM ans_evals WHERE id=$1', [evalId])).rows[0]; if(!e) return { error:'Évaluation introuvable' };
    if(!(await evalOpen(u, e))) return { error:'Évaluation à débloquer', locked:true };
    if(clientId){ const ex = (await pg().query('SELECT * FROM ans_attempts WHERE user_id=$1 AND client_id=$2', [u.id, clientId])).rows[0]; if(ex) return { attempt_id: ex.id, score: ex.score, duplicate: true }; }
    const qs = Array.isArray(e.questions) ? e.questions : []; let pts = 0, tot = 0; const detail = [];
    for(let i = 0; i < qs.length; i++){
      const q = qs[i]; const a = answers[i] != null ? answers[i] : answers[String(i)]; tot += q.points || 1; let ok = null, got = 0, fb = null;
      if(q.type === 'qcm' || q.type === 'vf'){ ok = parseInt(a, 10) === q.answer; got = ok ? (q.points || 1) : 0; }
      else { // réponse écrite : l'IA corrige si elle est disponible, sinon comparaison simple
        const norm0 = function(s){ return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9/ ]+/g, ' ').replace(/\s+/g, ' ').trim(); };
        const exact = !!a && norm0(a) === norm0(q.answer);
        const g = exact ? { score:100, feedback:null } : await aiGrade(q, String(a || ''), u).catch(function(){ return null; });
        if(g){ got = Math.round((q.points || 1) * g.score / 100 * 10) / 10; ok = g.score >= 50; fb = g.feedback; }
        else { const norm = function(s){ return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); };
          ok = !!a && norm(a) === norm(q.answer); got = ok ? (q.points || 1) : 0; }
      }
      pts += got; detail.push({ i:i, ok:ok, points:got, max:q.points || 1, answer: q.type === 'qcm' || q.type === 'vf' ? q.answer : q.answer, explain:q.explain || null, feedback:fb });
    }
    const score = tot ? Math.round(pts / tot * 100) : 0; const aid = id('ansa');
    await pg().query('INSERT INTO ans_attempts(id, eval_id, user_id, score, answers, client_id) VALUES($1,$2,$3,$4,$5,$6)', [aid, e.id, u.id, score, JSON.stringify(answers || {}), clientId]);
    // accès au mérite : une bonne note à une évaluation « mérite » offre des jours d'accès (une fois par évaluation)
    let merit = null; const s = await settings();
    if(e.merit && score >= Math.max(e.pass_score || 0, s.merit_score)){
      const ins = await pg().query('INSERT INTO ans_merit(user_id, eval_id, days) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING user_id', [u.id, e.id, s.merit_days]);
      if(ins.rows.length){ const a2 = await extend(u.id, s.merit_days, 'merite'); merit = { days: s.merit_days, until: a2.until }; }
    }
    return { attempt_id: aid, score: score, passed: score >= (e.pass_score || 50), detail: detail, merit: merit };
  }
  app.post(API + '/evals/:id/submit', auth, wrap(async function(req, res){
    const b = req.body || {}; const r = await submitEval(req.ans, req.params.id, b.answers || {}, b.client_id ? String(b.client_id).slice(0, 60) : null);
    if(r.error) return res.status(r.locked ? 402 : 404).json(r);
    res.json(Object.assign({ success:true }, r));
  }));

  // ═══════════════ Paiements et accès ═══════════════
  async function purposeAmount(purpose){ const s = await settings(); const m = /^sub:(month|quarter|year)$/.exec(purpose); if(m) return { amount: s[PLANS[m[1]].key], days: PLANS[m[1]].days, label:'Abonnement ' + PLANS[m[1]].label };
    const e = /^eval:(.+)$/.exec(purpose); if(e){ const ev = (await pg().query('SELECT id, title, price FROM ans_evals WHERE id=$1', [e[1]])).rows[0]; if(ev && ev.price > 0) return { amount: ev.price, eval_id: ev.id, label:'Évaluation : ' + ev.title }; }
    return null; }
  async function grant(p){ // paiement confirmé → accès
    const m = /^sub:(month|quarter|year)$/.exec(p.purpose); if(m) return extend(p.user_id, PLANS[m[1]].days, p.method);
    const e = /^eval:(.+)$/.exec(p.purpose); if(e){ await pg().query('INSERT INTO ans_eval_unlocks(user_id, eval_id, source) VALUES($1,$2,$3) ON CONFLICT DO NOTHING', [p.user_id, e[1], p.method]); return access(p.user_id); }
  }
  app.post(API + '/pay/init', auth, wrap(async function(req, res){
    const b = req.body || {}; const method = ['wave','om'].indexOf(b.method) >= 0 ? b.method : null; if(!method) return res.status(400).json({ error:'Moyen de paiement inconnu' });
    const pa = await purposeAmount(String(b.purpose || '')); if(!pa) return res.status(400).json({ error:'Offre inconnue' });
    if(tooFast('pay:' + req.ans.id, 12, 3600000)) return res.status(429).json({ error:'Trop de demandes, réessaie plus tard' });
    const s = await settings(); const pid = id('ansp');
    await pg().query('INSERT INTO ans_payments(id,user_id,method,purpose,amount,meta) VALUES($1,$2,$3,$4,$5,$6)', [pid, req.ans.id, method, String(b.purpose), pa.amount, JSON.stringify({ label: pa.label })]);
    // Wave Business (paiement automatique) si la clé est fournie ; sinon lien Wave + référence vérifiée par l'admin
    if(method === 'wave' && process.env.ANS_WAVE_API_KEY){
      try{ const r = await fetch('https://api.wave.com/v1/checkout/sessions', { method:'POST', headers:{ 'Authorization':'Bearer ' + process.env.ANS_WAVE_API_KEY, 'Content-Type':'application/json' },
          body: JSON.stringify({ amount: String(pa.amount), currency:'XOF', client_reference: pid, success_url: (process.env.ANS_PUBLIC_URL || 'https://api.penc-messagerie.com') + '/academie/merci', error_url: (process.env.ANS_PUBLIC_URL || 'https://api.penc-messagerie.com') + '/academie/erreur' }) });
        const j = await r.json(); if(j && j.wave_launch_url){ await pg().query("UPDATE ans_payments SET meta = meta || $2::jsonb WHERE id=$1", [pid, JSON.stringify({ wave_session: j.id })]); return res.json({ success:true, payment_id: pid, amount: pa.amount, label: pa.label, auto: true, url: j.wave_launch_url }); }
      }catch(e){ log('wave:', e.message); }
    }
    res.json({ success:true, payment_id: pid, amount: pa.amount, label: pa.label, auto:false,
      url: method === 'wave' && s.wave_url ? (s.wave_url + (s.wave_url.indexOf('?') >= 0 ? '&' : '?') + 'amount=' + pa.amount) : null,
      om_number: method === 'om' ? (s.om_number || null) : null, om_name: s.om_name,
      steps: method === 'wave' ? ['Paie ' + pa.amount + ' FCFA avec Wave', 'Copie la référence de la transaction (dans le reçu Wave)', 'Colle-la ici : ton accès s’ouvre dès la vérification']
        : ['Envoie ' + pa.amount + ' FCFA par Orange Money au ' + (s.om_number || 'numéro indiqué'), 'Note la référence du SMS de confirmation', 'Colle-la ici : ton accès s’ouvre dès la vérification'] });
  }));
  app.post(API + '/pay/:id/proof', auth, wrap(async function(req, res){
    const b = req.body || {}; const ref = txt(b.ref, 80); if(ref.length < 4) return res.status(400).json({ error:'Référence trop courte' });
    const p = (await pg().query('SELECT * FROM ans_payments WHERE id=$1 AND user_id=$2', [req.params.id, req.ans.id])).rows[0]; if(!p) return res.status(404).json({ error:'Paiement introuvable' });
    if(p.status !== 'pending') return res.json({ success:true, status: p.status });
    if((await pg().query("SELECT 1 FROM ans_payments WHERE ref=$1 AND id<>$2 AND status<>'rejected'", [ref, p.id])).rows.length) return res.status(409).json({ error:'Cette référence a déjà été utilisée' });
    await pg().query('UPDATE ans_payments SET ref=$2, payer_phone=$3, proof_url=$4 WHERE id=$1', [p.id, ref, phone(b.payer_phone) || null, okUrl(b.proof_url) ? b.proof_url : null]);
    res.json({ success:true, status:'pending', message:'Merci ! Ton paiement est en vérification. Ton accès s’ouvre dès qu’il est confirmé.' });
  }));
  // Wave Business : confirmation automatique (webhook)
  app.post(API + '/pay/wave/webhook', wrap(async function(req, res){
    try{
      const sec = process.env.ANS_WAVE_WEBHOOK_SECRET; const sig = String(req.headers['wave-signature'] || '');
      if(sec){ const parts = {}; sig.split(',').forEach(function(x){ const kv = x.split('='); parts[kv[0]] = kv[1]; }); const raw = req.rawBody ? req.rawBody.toString('utf8') : JSON.stringify(req.body || {});
        const h = crypto.createHmac('sha256', sec).update((parts.t || '') + raw).digest('hex'); if(!parts.v1 || h !== parts.v1) return res.status(401).end(); }
      const ev = req.body || {}; const d = ev.data || {};
      if(ev.type === 'checkout.session.completed' && d.client_reference && (d.payment_status === 'succeeded' || d.checkout_status === 'complete')){
        const p = (await pg().query("UPDATE ans_payments SET status='confirmed', decided_at=NOW(), decided_by='wave', ref=COALESCE(ref,$2) WHERE id=$1 AND status='pending' RETURNING *", [String(d.client_reference), String(d.id || '')])).rows[0];
        if(p) await grant(p);
      }
      res.json({ ok:true });
    }catch(e){ res.status(500).end(); }
  }));
  app.get(API + '/pay/mine', auth, wrap(async function(req, res){ res.json({ payments: (await pg().query('SELECT id, method, purpose, amount, status, ref, created_at, decided_at FROM ans_payments WHERE user_id=$1 ORDER BY created_at DESC LIMIT 30', [req.ans.id])).rows, access: await access(req.ans.id) }); }));
  // Google Play : abonnement acheté dans l'appli (vérifié auprès de Google quand le compte de service est configuré)
  const PLAY_PRODUCTS = { 'ans_mois': 'month', 'ans_trimestre': 'quarter', 'ans_annee': 'year' };
  app.post(API + '/pay/play', auth, wrap(async function(req, res){
    const b = req.body || {}; const plan = PLAY_PRODUCTS[String(b.product_id || '')]; const token = String(b.purchase_token || '').slice(0, 500);
    if(!plan || token.length < 20) return res.status(400).json({ error:'Achat invalide' });
    if((await pg().query("SELECT 1 FROM ans_payments WHERE method='play' AND ref=$1 AND status='confirmed'", [token])).rows.length) return res.json({ success:true, access: await access(req.ans.id), duplicate:true });
    const s = await settings(); const pid = id('ansp'); let verified = null;
    try{ verified = await playVerify(String(b.product_id), token); }catch(e){ log('play:', e.message); }
    const status = verified === true ? 'confirmed' : (verified === false ? 'rejected' : 'pending');
    await pg().query('INSERT INTO ans_payments(id,user_id,method,purpose,amount,status,ref,meta,decided_at,decided_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [pid, req.ans.id, 'play', 'sub:' + plan, s[PLANS[plan].key], status, token, JSON.stringify({ product_id: b.product_id, order_id: txt(b.order_id, 80) }), status !== 'pending' ? new Date() : null, status !== 'pending' ? 'google' : null]);
    // vérifié par Google : accès complet ; vérification impossible pour l'instant : 3 jours d'accès en attendant (l'admin voit l'achat)
    if(status === 'confirmed') await grant({ user_id: req.ans.id, purpose: 'sub:' + plan, method: 'play' });
    else if(status === 'pending' && !(await pg().query("SELECT 1 FROM ans_payments WHERE user_id=$1 AND method='play' AND status='pending' AND id<>$2", [req.ans.id, pid])).rows.length) await extend(req.ans.id, 3, 'play-attente');
    res.json({ success: status !== 'rejected', status: status, access: await access(req.ans.id) });
  }));
  async function playVerify(productId, token){
    let sa = null; try{ sa = JSON.parse(process.env.ANS_PLAY_SA || process.env.FIREBASE_SERVICE_ACCOUNT || ''); }catch(_){ return null; }
    if(!sa || !sa.client_email || !sa.private_key) return null;
    const now = Math.floor(Date.now() / 1000);
    const assertion = jwt.sign({ iss: sa.client_email, scope: 'https://www.googleapis.com/auth/androidpublisher', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }, sa.private_key, { algorithm: 'RS256' });
    const t = await (await fetch('https://oauth2.googleapis.com/token', { method:'POST', headers:{ 'Content-Type':'application/x-www-form-urlencoded' }, body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + assertion })).json();
    if(!t.access_token) return null;
    const pkg = process.env.ANS_PACKAGE || 'sn.academie.numerique';
    const r = await fetch('https://androidpublisher.googleapis.com/androidpublisher/v3/applications/' + pkg + '/purchases/subscriptions/' + encodeURIComponent(productId) + '/tokens/' + encodeURIComponent(token), { headers:{ Authorization:'Bearer ' + t.access_token } });
    if(r.status === 404 || r.status === 410) return false; if(!r.ok) return null;
    const j = await r.json(); return Number(j.expiryTimeMillis || 0) > Date.now() && (j.paymentState === 1 || j.paymentState === 2 || j.paymentState == null);
  }
  // codes prépayés (écoles, parents, sponsors)
  app.post(API + '/codes/redeem', auth, wrap(async function(req, res){
    const code = String((req.body || {}).code || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); if(code.length < 6) return res.status(400).json({ error:'Code invalide' });
    if(tooFast('code:' + req.ans.id, 8, 3600000)) return res.status(429).json({ error:'Trop d’essais, réessaie dans une heure' });
    const c = (await pg().query('UPDATE ans_codes SET used_by=$2, used_at=NOW() WHERE code=$1 AND used_by IS NULL RETURNING *', [code, req.ans.id])).rows[0];
    if(!c) return res.status(404).json({ error:'Code inconnu ou déjà utilisé' });
    const a = await extend(req.ans.id, c.days, 'code' + (c.sponsor ? ':' + c.sponsor : ''));
    res.json({ success:true, days: c.days, sponsor: c.sponsor || null, school: c.school || null, access: a });
  }));
  // bourses et subventions
  app.post(API + '/grants', auth, wrap(async function(req, res){
    const b = req.body || {}; const reason = txt(b.reason, 1500); if(reason.length < 20) return res.status(400).json({ error:'Explique ta situation en quelques phrases' });
    if((await pg().query("SELECT 1 FROM ans_grants WHERE user_id=$1 AND status='pending'", [req.ans.id])).rows.length) return res.status(409).json({ error:'Tu as déjà une demande en cours' });
    const gid = id('ansg'); await pg().query('INSERT INTO ans_grants(id,user_id,kind,reason,school,guardian_phone,doc_url) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [gid, req.ans.id, b.kind === 'subvention' ? 'subvention' : 'bourse', reason, txt(b.school, 120) || null, phone(b.guardian_phone) || null, okUrl(b.doc_url) ? b.doc_url : null]);
    res.json({ success:true, id: gid, message:'Demande envoyée. L’équipe de l’Académie te répond rapidement.' });
  }));
  app.get(API + '/grants/mine', auth, wrap(async function(req, res){ res.json({ grants: (await pg().query('SELECT id, kind, status, days, note, created_at, decided_at FROM ans_grants WHERE user_id=$1 ORDER BY created_at DESC', [req.ans.id])).rows }); }));

  // ═══════════════ Espace professeur ═══════════════
  const PROF = [auth, role('prof')];
  async function myCourse(req, cid){ const c = (await pg().query('SELECT * FROM ans_courses WHERE id=$1', [cid])).rows[0]; if(!c) return null; if(req.ans.role !== 'admin' && String(c.prof_id) !== String(req.ans.id)) return null; return c; }
  app.get(API + '/prof/courses', PROF, wrap(async function(req, res){
    const rows = (await pg().query('SELECT c.*, (SELECT COUNT(*)::int FROM ans_lessons l WHERE l.course_id=c.id) AS n_lessons, (SELECT COUNT(DISTINCT p.user_id)::int FROM ans_progress p WHERE p.course_id=c.id) AS students FROM ans_courses c WHERE c.prof_id=$1 ORDER BY c.updated_at DESC', [req.ans.id])).rows;
    res.json({ courses: rows.map(function(c){ return courseOut(c, { n_lessons:c.n_lessons, students:c.students }); }) });
  }));
  app.post(API + '/prof/courses', PROF, wrap(async function(req, res){
    const b = req.body || {}; const L = lvl(b.level), S = subj(b.subject); const title = txt(b.title, 140);
    if(!title) return res.status(400).json({ error:'Donne un titre au cours' }); if(!L) return res.status(400).json({ error:'Choisis la classe' }); if(!S) return res.status(400).json({ error:'Choisis la matière' });
    const cid = id('ansc'); await pg().query('INSERT INTO ans_courses(id,prof_id,title,description,level,serie,subject,cover_url,lang,free) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
      [cid, req.ans.id, title, txt(b.description, 3000) || null, L.code, L.series && L.series.indexOf(String(b.serie || '')) >= 0 ? String(b.serie) : null, S.code, okUrl(b.cover_url) ? b.cover_url : null, ['fr','wo','en','ar'].indexOf(b.lang) >= 0 ? b.lang : 'fr', !!b.free]);
    res.json({ success:true, course: courseOut((await pg().query('SELECT * FROM ans_courses WHERE id=$1', [cid])).rows[0]) });
  }));
  app.put(API + '/prof/courses/:id', PROF, wrap(async function(req, res){
    const c = await myCourse(req, req.params.id); if(!c) return res.status(404).json({ error:'Cours introuvable' });
    const b = req.body || {}; const L = b.level ? lvl(b.level) : lvl(c.level), S = b.subject ? subj(b.subject) : subj(c.subject);
    await pg().query("UPDATE ans_courses SET title=$2, description=$3, level=$4, serie=$5, subject=$6, cover_url=$7, lang=$8, free=$9, updated_at=NOW(), status=CASE WHEN status='rejected' THEN 'draft' ELSE status END WHERE id=$1",
      [c.id, txt(b.title != null ? b.title : c.title, 140) || c.title, b.description != null ? txt(b.description, 3000) : c.description, L ? L.code : c.level, L && L.series && L.series.indexOf(String(b.serie != null ? b.serie : c.serie || '')) >= 0 ? String(b.serie != null ? b.serie : c.serie) : null,
       S ? S.code : c.subject, b.cover_url !== undefined ? (okUrl(b.cover_url) ? b.cover_url : null) : c.cover_url, ['fr','wo','en','ar'].indexOf(b.lang) >= 0 ? b.lang : c.lang, b.free != null ? !!b.free : c.free]);
    res.json({ success:true, course: courseOut((await pg().query('SELECT * FROM ans_courses WHERE id=$1', [c.id])).rows[0]) });
  }));
  app.post(API + '/prof/courses/:id/submit', PROF, wrap(async function(req, res){
    const c = await myCourse(req, req.params.id); if(!c) return res.status(404).json({ error:'Cours introuvable' });
    const n = (await pg().query('SELECT COUNT(*)::int AS n FROM ans_lessons WHERE course_id=$1', [c.id])).rows[0].n; if(!n) return res.status(400).json({ error:'Ajoute au moins une leçon avant d’envoyer le cours' });
    const st = req.ans.role === 'admin' ? 'published' : 'pending';
    await pg().query("UPDATE ans_courses SET status=$2, reject_reason=NULL, updated_at=NOW(), published_at=CASE WHEN $2='published' THEN NOW() ELSE published_at END WHERE id=$1", [c.id, st]);
    res.json({ success:true, status: st });
  }));
  app.delete(API + '/prof/courses/:id', PROF, wrap(async function(req, res){
    const c = await myCourse(req, req.params.id); if(!c) return res.status(404).json({ error:'Cours introuvable' });
    await pg().query("UPDATE ans_courses SET status='archived', updated_at=NOW() WHERE id=$1", [c.id]); res.json({ success:true });
  }));
  function lessonIn(b){ const kind = ['video','pdf','text','quiz','audio'].indexOf(b.kind) >= 0 ? b.kind : 'text';
    return { title: txt(b.title, 160), kind: kind, media_url: okUrl(b.media_url) ? b.media_url : null, media_size: b.media_size ? Math.max(0, Math.round(Number(b.media_size))) : null, duration: b.duration ? Math.max(0, Math.round(Number(b.duration))) : null,
      body: b.body != null ? String(b.body).slice(0, 60000) : null, quiz: kind === 'quiz' ? JSON.stringify(cleanQuestions(b.quiz)) : null, free_preview: !!b.free_preview }; }
  app.post(API + '/prof/courses/:id/lessons', PROF, wrap(async function(req, res){
    const c = await myCourse(req, req.params.id); if(!c) return res.status(404).json({ error:'Cours introuvable' });
    const L = lessonIn(req.body || {}); if(!L.title) return res.status(400).json({ error:'Donne un titre à la leçon' });
    if((L.kind === 'video' || L.kind === 'pdf' || L.kind === 'audio') && !L.media_url) return res.status(400).json({ error:'Ajoute le fichier de la leçon' });
    if(L.kind === 'quiz' && !JSON.parse(L.quiz).length) return res.status(400).json({ error:'Ajoute au moins une question' });
    const idx = (await pg().query('SELECT COALESCE(MAX(idx),-1)+1 AS i FROM ans_lessons WHERE course_id=$1', [c.id])).rows[0].i; const lid = id('ansl');
    await pg().query('INSERT INTO ans_lessons(id,course_id,idx,title,kind,media_url,media_size,duration,body,quiz,free_preview) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)',
      [lid, c.id, idx, L.title, L.kind, L.media_url, L.media_size, L.duration, L.body, L.quiz, L.free_preview]);
    await pg().query('UPDATE ans_courses SET updated_at=NOW() WHERE id=$1', [c.id]);
    res.json({ success:true, lesson: lessonOut((await pg().query('SELECT * FROM ans_lessons WHERE id=$1', [lid])).rows[0], true) });
  }));
  async function myLesson(req, lid){ const l = (await pg().query('SELECT * FROM ans_lessons WHERE id=$1', [lid])).rows[0]; if(!l) return null; const c = await myCourse(req, l.course_id); return c ? { l:l, c:c } : null; }
  app.put(API + '/prof/lessons/:id', PROF, wrap(async function(req, res){
    const x = await myLesson(req, req.params.id); if(!x) return res.status(404).json({ error:'Leçon introuvable' });
    const b = req.body || {}; const L = lessonIn(Object.assign({}, x.l, { quiz: x.l.quiz }, b));
    await pg().query('UPDATE ans_lessons SET title=$2, kind=$3, media_url=$4, media_size=$5, duration=$6, body=$7, quiz=$8, free_preview=$9, idx=COALESCE($10, idx), updated_at=NOW() WHERE id=$1',
      [x.l.id, L.title || x.l.title, L.kind, L.media_url, L.media_size, L.duration, L.body, L.quiz, L.free_preview, b.idx != null ? Math.round(Number(b.idx)) : null]);
    res.json({ success:true, lesson: lessonOut((await pg().query('SELECT * FROM ans_lessons WHERE id=$1', [x.l.id])).rows[0], true) });
  }));
  app.delete(API + '/prof/lessons/:id', PROF, wrap(async function(req, res){
    const x = await myLesson(req, req.params.id); if(!x) return res.status(404).json({ error:'Leçon introuvable' });
    await pg().query('DELETE FROM ans_lessons WHERE id=$1', [x.l.id]); res.json({ success:true });
  }));
  app.post(API + '/prof/courses/:id/order', PROF, wrap(async function(req, res){
    const c = await myCourse(req, req.params.id); if(!c) return res.status(404).json({ error:'Cours introuvable' });
    const ids = Array.isArray((req.body || {}).ids) ? req.body.ids.slice(0, 300) : []; for(let i = 0; i < ids.length; i++) await pg().query('UPDATE ans_lessons SET idx=$3 WHERE id=$1 AND course_id=$2', [String(ids[i]), c.id, i]);
    res.json({ success:true });
  }));
  app.post(API + '/prof/evals', PROF, wrap(async function(req, res){
    const b = req.body || {}; const qs = cleanQuestions(b.questions); if(!txt(b.title, 160)) return res.status(400).json({ error:'Donne un titre' }); if(!qs.length) return res.status(400).json({ error:'Ajoute des questions' });
    let course = null; if(b.course_id){ course = await myCourse(req, String(b.course_id)); if(!course) return res.status(404).json({ error:'Cours introuvable' }); }
    const L = lvl(b.level || (course && course.level)); const eid = id('anse'); const s = await settings();
    await pg().query('INSERT INTO ans_evals(id,author_id,course_id,level,serie,subject,title,kind,price,questions,minutes,pass_score,merit,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)',
      [eid, req.ans.id, course ? course.id : null, L ? L.code : null, b.serie ? String(b.serie).slice(0, 4) : (course ? course.serie : null), subj(b.subject) ? b.subject : (course ? course.subject : null), txt(b.title, 160),
       b.kind === 'examen' ? 'examen' : 'quiz', b.paid ? (parseInt(b.price, 10) > 0 ? Math.min(20000, parseInt(b.price, 10)) : s.price_eval) : 0, JSON.stringify(qs), b.minutes ? Math.max(1, Math.min(300, parseInt(b.minutes, 10))) : null,
       Math.max(0, Math.min(100, parseInt(b.pass_score, 10) || 50)), req.ans.role === 'admin' ? !!b.merit : false, 'published']);
    res.json({ success:true, eval: evalOut((await pg().query('SELECT * FROM ans_evals WHERE id=$1', [eid])).rows[0], true) });
  }));
  app.get(API + '/prof/stats', PROF, wrap(async function(req, res){
    const r = (await pg().query(`SELECT COUNT(DISTINCT p.user_id)::int AS students, COUNT(*) FILTER (WHERE p.done)::int AS lessons_done, COALESCE(SUM(p.seconds),0)::bigint AS seconds
      FROM ans_progress p JOIN ans_courses c ON c.id=p.course_id WHERE c.prof_id=$1`, [req.ans.id])).rows[0];
    res.json({ students: r.students, lessons_done: r.lessons_done, hours: Math.round(Number(r.seconds) / 360) / 10 });
  }));
  // fichiers des cours (vidéo, PDF, image, audio) envoyés directement au stockage
  app.post(API + '/media/presign', PROF, wrap(async function(req, res){
    const b = req.body || {}; const kind = ['video','pdf','image','audio'].indexOf(b.kind) >= 0 ? b.kind : null; if(!kind) return res.status(400).json({ error:'Type de fichier inconnu' });
    const ext = String(b.ext || '').replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 6) || ({ video:'mp4', pdf:'pdf', image:'jpg', audio:'mp3' })[kind];
    const key = 'ans/' + kind + '/' + req.ans.id + '/' + Date.now() + '-' + crypto.randomBytes(6).toString('hex') + '.' + ext;
    if(R2.ready && R2.ready()){ const url = await R2.presign(key, String(b.mime || 'application/octet-stream')); return res.json({ success:true, upload_url: url, public_url: R2.public + '/' + key, key: key }); }
    if(process.env.ANS_LOCAL_UPLOAD){ return res.json({ success:true, upload_url: (process.env.ANS_PUBLIC_URL || '') + API + '/media/local/' + encodeURIComponent(key.replace(/\//g, '__')), public_url: (process.env.ANS_PUBLIC_URL || '') + API + '/media/local/' + encodeURIComponent(key.replace(/\//g, '__')), key: key }); }
    res.status(503).json({ error:'Stockage des fichiers indisponible' });
  }));
  if(process.env.ANS_LOCAL_UPLOAD){ // banc d'essai uniquement
    const dir = process.env.ANS_LOCAL_UPLOAD; try{ fs.mkdirSync(dir, { recursive:true }); }catch(_){}
    app.put(API + '/media/local/:f', function(req, res){ const f = path.join(dir, path.basename(req.params.f)); const w = fs.createWriteStream(f); req.pipe(w); w.on('finish', function(){ res.set('Access-Control-Allow-Origin', '*'); res.json({ ok:true }); }); });
    app.options(API + '/media/local/:f', function(req, res){ res.set('Access-Control-Allow-Origin', '*'); res.set('Access-Control-Allow-Methods', 'PUT,GET'); res.set('Access-Control-Allow-Headers', '*'); res.end(); });
    app.get(API + '/media/local/:f', function(req, res){ res.set('Access-Control-Allow-Origin', '*'); res.sendFile(path.join(dir, path.basename(req.params.f)), function(e){ if(e && !res.headersSent) res.status(404).end(); }); });
  }

  // ═══════════════ Administration ═══════════════
  const ADM = [auth, isAdmin];
  app.get(API + '/admin/overview', ADM, wrap(async function(req, res){
    const q = async function(sql){ return (await pg().query(sql)).rows[0]; };
    res.json({ users: await q("SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE role='eleve')::int AS eleves, COUNT(*) FILTER (WHERE role='prof')::int AS profs, COUNT(*) FILTER (WHERE last_seen > NOW() - INTERVAL '7 days')::int AS actifs FROM ans_users"),
      courses: await q("SELECT COUNT(*) FILTER (WHERE status='published')::int AS published, COUNT(*) FILTER (WHERE status='pending')::int AS pending FROM ans_courses"),
      profs_pending: (await q("SELECT COUNT(*)::int AS n FROM ans_users WHERE role='prof' AND prof_status='pending'")).n,
      payments: await q("SELECT COUNT(*) FILTER (WHERE status='pending' AND ref IS NOT NULL)::int AS to_check, COALESCE(SUM(amount) FILTER (WHERE status='confirmed' AND created_at > date_trunc('month', NOW())),0)::int AS month_fcfa FROM ans_payments"),
      grants_pending: (await q("SELECT COUNT(*)::int AS n FROM ans_grants WHERE status='pending'")).n,
      subscribers: (await q("SELECT COUNT(*)::int AS n FROM ans_access WHERE until > NOW()")).n });
  }));
  app.get(API + '/admin/profs', ADM, wrap(async function(req, res){ const st = String((req.query || {}).status || 'pending');
    res.json({ profs: (await pg().query("SELECT * FROM ans_users WHERE role='prof' AND ($1='all' OR prof_status=$1) ORDER BY created_at DESC LIMIT 300", [st])).rows.map(pubUser) }); }));
  app.post(API + '/admin/profs/:id/:act', ADM, wrap(async function(req, res){ const a = req.params.act; if(['approve','reject'].indexOf(a) < 0) return res.status(400).json({ error:'Action inconnue' });
    await pg().query("UPDATE ans_users SET prof_status=$2 WHERE id=$1 AND role='prof'", [req.params.id, a === 'approve' ? 'approved' : 'rejected']); res.json({ success:true }); }));
  app.get(API + '/admin/courses', ADM, wrap(async function(req, res){ const st = String((req.query || {}).status || 'pending');
    const rows = (await pg().query("SELECT c.*, (SELECT COUNT(*)::int FROM ans_lessons l WHERE l.course_id=c.id) AS n_lessons FROM ans_courses c WHERE ($1='all' OR c.status=$1) ORDER BY c.updated_at DESC LIMIT 300", [st])).rows;
    const pn = await profNames(Array.from(new Set(rows.map(function(c){ return c.prof_id; }))));
    res.json({ courses: rows.map(function(c){ return courseOut(c, { n_lessons:c.n_lessons, prof_name:(pn[c.prof_id] || {}).name || '?' }); }) }); }));
  app.post(API + '/admin/courses/:id/:act', ADM, wrap(async function(req, res){ const a = req.params.act;
    if(a === 'publish') await pg().query("UPDATE ans_courses SET status='published', reject_reason=NULL, published_at=COALESCE(published_at,NOW()), updated_at=NOW() WHERE id=$1", [req.params.id]);
    else if(a === 'reject') await pg().query("UPDATE ans_courses SET status='rejected', reject_reason=$2, updated_at=NOW() WHERE id=$1", [req.params.id, txt((req.body || {}).reason, 500) || 'À revoir']);
    else if(a === 'unpublish') await pg().query("UPDATE ans_courses SET status='draft', updated_at=NOW() WHERE id=$1", [req.params.id]);
    else return res.status(400).json({ error:'Action inconnue' });
    res.json({ success:true }); }));
  app.get(API + '/admin/payments', ADM, wrap(async function(req, res){ const st = String((req.query || {}).status || 'pending');
    res.json({ payments: (await pg().query("SELECT p.*, u.name, u.phone FROM ans_payments p LEFT JOIN ans_users u ON u.id=p.user_id WHERE ($1='all' OR p.status=$1) ORDER BY (p.ref IS NULL), p.created_at DESC LIMIT 300", [st])).rows }); }));
  app.post(API + '/admin/payments/:id/:act', ADM, wrap(async function(req, res){ const a = req.params.act; if(['confirm','reject'].indexOf(a) < 0) return res.status(400).json({ error:'Action inconnue' });
    const p = (await pg().query("UPDATE ans_payments SET status=$2, decided_at=NOW(), decided_by=$3 WHERE id=$1 AND status='pending' RETURNING *", [req.params.id, a === 'confirm' ? 'confirmed' : 'rejected', req.ans.id])).rows[0];
    if(!p) return res.status(409).json({ error:'Déjà traité' }); if(a === 'confirm') await grant(p); res.json({ success:true }); }));
  app.post(API + '/admin/codes', ADM, wrap(async function(req, res){ const b = req.body || {}; const n = Math.max(1, Math.min(1000, parseInt(b.count, 10) || 1)); const days = Math.max(1, Math.min(800, parseInt(b.days, 10) || 31));
    const batch = id('lot'); const out = []; const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    for(let i = 0; i < n; i++){ let c = 'ANS'; const by = crypto.randomBytes(9); for(let k = 0; k < 9; k++) c += A[by[k] % A.length]; out.push(c);
      await pg().query('INSERT INTO ans_codes(code,days,sponsor,school,batch,created_by) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING', [c, days, txt(b.sponsor, 80) || null, txt(b.school, 120) || null, batch, req.ans.id]); }
    res.json({ success:true, batch: batch, days: days, codes: out }); }));
  app.get(API + '/admin/codes', ADM, wrap(async function(req, res){ res.json({ batches: (await pg().query('SELECT batch, days, sponsor, school, MIN(created_at) AS at, COUNT(*)::int AS total, COUNT(used_by)::int AS used FROM ans_codes GROUP BY 1,2,3,4 ORDER BY at DESC LIMIT 100')).rows }); }));
  app.get(API + '/admin/codes/:batch', ADM, wrap(async function(req, res){ res.json({ codes: (await pg().query('SELECT c.code, c.days, c.used_at, u.name AS used_by_name FROM ans_codes c LEFT JOIN ans_users u ON u.id=c.used_by WHERE c.batch=$1 ORDER BY c.code', [req.params.batch])).rows }); }));
  app.get(API + '/admin/grants', ADM, wrap(async function(req, res){ const st = String((req.query || {}).status || 'pending');
    res.json({ grants: (await pg().query("SELECT g.*, u.name, u.phone, u.level, u.school AS user_school FROM ans_grants g LEFT JOIN ans_users u ON u.id=g.user_id WHERE ($1='all' OR g.status=$1) ORDER BY g.created_at DESC LIMIT 300", [st])).rows }); }));
  app.post(API + '/admin/grants/:id/:act', ADM, wrap(async function(req, res){ const a = req.params.act; if(['approve','reject'].indexOf(a) < 0) return res.status(400).json({ error:'Action inconnue' });
    const days = Math.max(1, Math.min(800, parseInt((req.body || {}).days, 10) || 366));
    const g = (await pg().query("UPDATE ans_grants SET status=$2, days=$3, note=$4, decided_at=NOW(), decided_by=$5 WHERE id=$1 AND status='pending' RETURNING *", [req.params.id, a === 'approve' ? 'approved' : 'rejected', a === 'approve' ? days : null, txt((req.body || {}).note, 500) || null, req.ans.id])).rows[0];
    if(!g) return res.status(409).json({ error:'Déjà traité' }); if(a === 'approve') await extend(g.user_id, days, g.kind); res.json({ success:true }); }));
  app.get(API + '/admin/settings', ADM, wrap(async function(req, res){ res.json({ settings: await settings() }); }));
  app.put(API + '/admin/settings', ADM, wrap(async function(req, res){ const b = req.body || {}; const cur = await settings(); const v = {};
    ['price_month','price_quarter','price_year','price_eval','merit_days','merit_score','trial_days'].forEach(function(k){ if(b[k] != null && isFinite(Number(b[k]))) v[k] = Math.max(0, Math.round(Number(b[k]))); });
    ['wave_url','om_number','om_name','support_phone'].forEach(function(k){ if(b[k] != null) v[k] = txt(b[k], 300); });
    const next = Object.assign({}, cur, v); await pg().query("INSERT INTO ans_settings(k,v) VALUES('main',$1) ON CONFLICT (k) DO UPDATE SET v=$1", [JSON.stringify(next)]); res.json({ success:true, settings: next }); }));
  app.get(API + '/admin/users', ADM, wrap(async function(req, res){ const q = '%' + String((req.query || {}).q || '').toLowerCase().slice(0, 40) + '%';
    const rows = (await pg().query("SELECT u.*, a.until FROM ans_users u LEFT JOIN ans_access a ON a.user_id=u.id WHERE LOWER(u.name) LIKE $1 OR u.phone LIKE $1 ORDER BY u.created_at DESC LIMIT 200", [q])).rows;
    res.json({ users: rows.map(function(u){ return Object.assign(pubUser(u), { access_until: u.until, banned: u.banned, last_seen: u.last_seen }); }) }); }));
  app.post(API + '/admin/users/:id/:act', ADM, wrap(async function(req, res){ const a = req.params.act; const b = req.body || {};
    if(a === 'access'){ return res.json({ success:true, access: await extend(req.params.id, Math.max(1, Math.min(800, parseInt(b.days, 10) || 31)), 'admin') }); }
    if(a === 'ban' || a === 'unban'){ await pg().query('UPDATE ans_users SET banned=$2 WHERE id=$1', [req.params.id, a === 'ban']); return res.json({ success:true }); }
    if(a === 'role' && ['eleve','prof','admin','ecole'].indexOf(b.role) >= 0){ await pg().query('UPDATE ans_users SET role=$2, prof_status=CASE WHEN $2 IN (\'prof\',\'admin\') THEN \'approved\' ELSE prof_status END WHERE id=$1', [req.params.id, b.role]); return res.json({ success:true }); }
    res.status(400).json({ error:'Action inconnue' }); }));

  // ═══════════════ L'IA au cœur ═══════════════
  // Un modèle de langage (Claude d'Anthropic par défaut) : clé ANS_AI_KEY (ou ANTHROPIC_API_KEY) dans Render.
  // Plusieurs fournisseurs, essayés dans l'ordre : Anthropic (payant, ANS_AI_KEY), Groq (gratuit, ANS_GROQ_KEY),
  // Google Gemini (gratuit, ANS_GEMINI_KEY). Si l'un est saturé ou en panne, le suivant répond.
  function providers(){
    const out = [];
    if(process.env.ANS_AI_KEY || process.env.ANTHROPIC_API_KEY) out.push('anthropic');
    if(process.env.ANS_GROQ_KEY) out.push('groq');
    if(process.env.ANS_GEMINI_KEY) out.push('gemini');
    return out;
  }
  function aiOn(){ return providers().length > 0; }
  async function callProvider(p, system, messages, maxTokens){
    if(p === 'anthropic'){
      const r = await fetch(process.env.ANS_AI_URL || 'https://api.anthropic.com/v1/messages', { method:'POST', headers:{ 'x-api-key': process.env.ANS_AI_KEY || process.env.ANTHROPIC_API_KEY, 'anthropic-version':'2023-06-01', 'content-type':'application/json' },
        body: JSON.stringify({ model: process.env.ANS_AI_MODEL || 'claude-haiku-5-5', max_tokens: maxTokens || 900, system: system, messages: messages }) });
      const j = await r.json(); if(!r.ok) throw new Error((j && j.error && j.error.message) || ('IA ' + r.status));
      return { text: (j.content || []).filter(function(c){ return c.type === 'text'; }).map(function(c){ return c.text; }).join('\n').trim(), tokens: ((j.usage || {}).input_tokens || 0) + ((j.usage || {}).output_tokens || 0) };
    }
    if(p === 'groq'){
      const r = await fetch(process.env.ANS_GROQ_URL || 'https://api.groq.com/openai/v1/chat/completions', { method:'POST', headers:{ Authorization:'Bearer ' + process.env.ANS_GROQ_KEY, 'content-type':'application/json' },
        body: JSON.stringify({ model: process.env.ANS_GROQ_MODEL || 'llama-3.3-70b-versatile', max_tokens: maxTokens || 900, temperature: 0.4, messages: [{ role:'system', content: system }].concat(messages) }) });
      const j = await r.json(); if(!r.ok) throw new Error((j && j.error && j.error.message) || ('Groq ' + r.status));
      return { text: String((((j.choices || [])[0] || {}).message || {}).content || '').trim(), tokens: (j.usage || {}).total_tokens || 0 };
    }
    if(p === 'gemini'){
      const model = process.env.ANS_GEMINI_MODEL || 'gemini-2.5-flash';
      const base = process.env.ANS_GEMINI_URL || 'https://generativelanguage.googleapis.com/v1beta';
      const gen = { maxOutputTokens: maxTokens || 900, temperature: 0.4 }; if(/2\.5-flash/.test(model)) gen.thinkingConfig = { thinkingBudget: 0 };
      const r = await fetch(base + '/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(process.env.ANS_GEMINI_KEY), { method:'POST', headers:{ 'content-type':'application/json' },
        body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: messages.map(function(m){ return { role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }; }), generationConfig: gen }) });
      const j = await r.json(); if(!r.ok) throw new Error((j && j.error && j.error.message) || ('Gemini ' + r.status));
      const c = (j.candidates || [])[0] || {}; const text = ((c.content || {}).parts || []).map(function(x){ return x.text || ''; }).join('').trim();
      if(!text) throw new Error('Gemini : réponse vide');
      return { text: text, tokens: (j.usageMetadata || {}).totalTokenCount || 0 };
    }
    throw new Error('fournisseur inconnu');
  }
  async function llm(system, messages, maxTokens){
    let last = null;
    for(const p of providers()){
      try{ const r = await callProvider(p, system, messages, maxTokens); if(r.text) return Object.assign({ provider: p }, r); }
      catch(e){ last = e; log('IA ' + p + ' :', e.message); }
    }
    throw new Error('Le Prof IA est très demandé en ce moment, réessaie dans une minute 🙂' + (last ? '' : ''));
  }
  function levelName(c){ const L = lvl(c); return L ? L.name : 'élève'; }
  function tutorSystem(u, lesson, course){
    return 'Tu es « Prof IA », le professeur particulier de l’Académie Numérique du Sénégal. Tu aides un élève de ' + levelName((course && course.level) || u.level) + (u.serie ? ' série ' + u.serie : '') + ' au Sénégal.\n'
      + 'Règles : explique simplement, pas à pas, avec des exemples de la vie au Sénégal (marché, FCFA, villes, sport, histoire du pays). Tutoie l’élève, sois chaleureux et encourageant.\n'
      + 'Ne donne pas directement la réponse d’un exercice noté : guide avec des indices, puis vérifie. Reste dans le programme scolaire sénégalais. Si la question n’a rien à voir avec l’école, ramène gentiment vers les cours.\n'
      + 'Réponds dans la langue de l’élève (français par défaut ; wolof, anglais ou arabe si l’élève écrit dans cette langue). Réponses courtes : 120 mots au plus sauf si l’élève demande plus. Pas de Markdown lourd ; listes simples autorisées.\n'
      + (lesson ? ('\nLeçon en cours : « ' + lesson.title + ' » (' + (course ? course.title : '') + ').\nContenu de la leçon :\n' + String(lesson.body || '').slice(0, 6000) + (lesson.quiz ? '\nQuestions du quiz : ' + JSON.stringify((lesson.quiz || []).map(function(q){ return q.q; })).slice(0, 1500) : '')) : '');
  }
  async function aiGuard(req, res, kind, max){
    if(!aiOn()){ res.status(503).json({ error:'Le Prof IA arrive bientôt.', ai:false }); return false; }
    if(tooFast('ai:' + req.ans.id, max || 40, 3600000)){ res.status(429).json({ error:'Tu as beaucoup demandé au Prof IA. Fais une petite pause et reviens dans un moment 🙂' }); return false; }
    if(req.ans.role === 'eleve'){ const a = await access(req.ans.id); if(!a.active){ const n = (await pg().query("SELECT COUNT(*)::int AS n FROM ans_ai_log WHERE user_id=$1 AND created_at > NOW() - INTERVAL '1 day'", [req.ans.id])).rows[0].n; if(n >= 5){ res.status(402).json({ error:'Avec l’abonnement, le Prof IA répond sans limite. Sans abonnement : 5 questions par jour.', need_access:true }); return false; } } }
    return true;
  }
  app.post(API + '/ai/tutor', auth, wrap(async function(req, res){
    if(!(await aiGuard(req, res, 'tutor'))) return;
    const b = req.body || {}; const q = String(b.question || '').trim().slice(0, 2000); if(!q) return res.status(400).json({ error:'Pose ta question' });
    let lesson = null, course = null; if(b.lesson_id){ lesson = (await pg().query('SELECT * FROM ans_lessons WHERE id=$1', [String(b.lesson_id)])).rows[0] || null; if(lesson) course = (await pg().query('SELECT * FROM ans_courses WHERE id=$1', [lesson.course_id])).rows[0] || null; }
    const hist = (Array.isArray(b.history) ? b.history.slice(-8) : []).map(function(m){ return { role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 2000) }; }).filter(function(m){ return m.content; });
    while(hist.length && hist[0].role !== 'user') hist.shift();
    const msgs = hist.concat([{ role:'user', content:q }]);
    const out = await llm(tutorSystem(req.ans, lesson, course), msgs, 700);
    pg().query('INSERT INTO ans_ai_log(user_id, kind, lesson_id, tokens) VALUES($1,$2,$3,$4)', [req.ans.id, 'tutor', lesson ? lesson.id : null, out.tokens]).catch(function(){});
    res.json({ success:true, answer: out.text });
  }));
  function parseJson(t){ t = String(t || '').replace(/```(?:json)?/gi, '');
    const cands = []; const o1 = t.indexOf('{'), o2 = t.lastIndexOf('}'), a1 = t.indexOf('['), a2 = t.lastIndexOf(']');
    if(o1 >= 0 && o2 > o1) cands.push(t.slice(o1, o2 + 1)); if(a1 >= 0 && a2 > a1) cands.push(t.slice(a1, a2 + 1));
    cands.sort(function(x, y){ return t.indexOf(x) - t.indexOf(y); });
    for(const c of cands){ try{ return JSON.parse(c); }catch(_){} } return null; }
  // le professeur colle son cours : l'IA propose un quiz (qu'il relit et corrige avant de publier)
  app.post(API + '/ai/quiz', auth, role('prof'), wrap(async function(req, res){
    if(!(await aiGuard(req, res, 'quiz', 30))) return;
    const b = req.body || {}; const text = String(b.text || '').slice(0, 12000); if(text.length < 80) return res.status(400).json({ error:'Colle au moins quelques paragraphes du cours' });
    const n = Math.max(3, Math.min(15, parseInt(b.n, 10) || 6));
    const out = await llm('Tu es un concepteur d’évaluations pour l’école sénégalaise (' + levelName(b.level) + '). Tu réponds UNIQUEMENT avec du JSON valide, sans texte autour.',
      [{ role:'user', content:'À partir de ce cours, écris ' + n + ' questions variées (QCM à 4 choix surtout, quelques Vrai/Faux, 1 question à réponse courte). Format : {"questions":[{"q":"…","type":"qcm|vf|court","choices":["…"],"answer":<index du bon choix ou texte attendu>,"explain":"explication courte"}]}.\n\nCOURS :\n' + text }], 2500);
    const j = parseJson(out.text); const qs = cleanQuestions((j && (j.questions || j)) || []);
    pg().query('INSERT INTO ans_ai_log(user_id, kind, tokens) VALUES($1,$2,$3)', [req.ans.id, 'quiz', out.tokens]).catch(function(){});
    if(!qs.length) return res.status(502).json({ error:'L’IA n’a pas réussi cette fois, réessaie.' });
    res.json({ success:true, questions: qs });
  }));
  // l'élève colle un exercice ou pose une question précise : l'IA explique la méthode
  app.post(API + '/ai/explain', auth, wrap(async function(req, res){
    if(!(await aiGuard(req, res, 'explain'))) return;
    const b = req.body || {}; const q = String(b.text || '').trim().slice(0, 3000); if(!q) return res.status(400).json({ error:'Écris l’exercice' });
    const out = await llm(tutorSystem(req.ans, null, null), [{ role:'user', content:'Explique-moi la méthode pour cet exercice, étape par étape, sans me donner tout de suite le résultat final :\n' + q }], 900);
    pg().query('INSERT INTO ans_ai_log(user_id, kind, tokens) VALUES($1,$2,$3)', [req.ans.id, 'explain', out.tokens]).catch(function(){});
    res.json({ success:true, answer: out.text });
  }));
  async function aiGrade(q, answer, u){
    if(!aiOn() || !answer.trim()) return null;
    const out = await llm('Tu corriges une copie d’élève (école sénégalaise). Réponds UNIQUEMENT en JSON : {"score":0-100,"feedback":"une ou deux phrases bienveillantes en français"}.',
      [{ role:'user', content:'Question : ' + q.q + '\nRéponse attendue (corrigé du professeur) : ' + q.answer + '\nRéponse de l’élève : ' + answer.slice(0, 3000) }], 300);
    const j = parseJson(out.text); if(!j || !isFinite(Number(j.score))) return null;
    pg().query('INSERT INTO ans_ai_log(user_id, kind, tokens) VALUES($1,$2,$3)', [u.id, 'grade', out.tokens]).catch(function(){});
    return { score: Math.max(0, Math.min(100, Math.round(Number(j.score)))), feedback: String(j.feedback || '').slice(0, 400) };
  }
  // ── Vidéos IA (serveur GPU loué à l'heure) : A = cours présenté par un avatar, B = doublage dans une autre langue ──
  app.post(API + '/ai/jobs', auth, role('prof'), wrap(async function(req, res){
    const b = req.body || {}; const kind = ['avatar','dub'].indexOf(b.kind) >= 0 ? b.kind : null; if(!kind) return res.status(400).json({ error:'Type inconnu' });
    const x = b.lesson_id ? await myLesson(req, String(b.lesson_id)) : null; if(b.lesson_id && !x) return res.status(404).json({ error:'Leçon introuvable' });
    const p = { lang: ['fr','wo','en','ar'].indexOf(b.lang) >= 0 ? b.lang : 'fr', script: b.script ? String(b.script).slice(0, 20000) : null, avatar_url: okUrl(b.avatar_url) ? b.avatar_url : null,
      voice: txt(b.voice, 40) || null, source_url: kind === 'dub' ? (okUrl(b.source_url) ? b.source_url : (x && x.l.media_url) || null) : null, target_lang: ['fr','wo','en','ar'].indexOf(b.target_lang) >= 0 ? b.target_lang : 'en' };
    if(kind === 'avatar' && (!p.script || !p.avatar_url)) return res.status(400).json({ error:'Il faut le texte du cours et une photo de présentateur' });
    if(kind === 'dub' && !p.source_url) return res.status(400).json({ error:'Il faut la vidéo à doubler' });
    const jid = id('ansj'); await pg().query('INSERT INTO ans_ai_jobs(id,user_id,lesson_id,kind,params) VALUES($1,$2,$3,$4,$5)', [jid, req.ans.id, x ? x.l.id : null, kind, JSON.stringify(p)]);
    res.json({ success:true, job: { id: jid, kind: kind, status:'queued' } });
    wakeGpu().catch(function(e){ log('gpu:', e.message); });
  }));
  app.get(API + '/ai/jobs', auth, role('prof'), wrap(async function(req, res){ res.json({ jobs: (await pg().query('SELECT id, lesson_id, kind, params, status, progress, result_url, error, created_at, done_at FROM ans_ai_jobs WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50', [req.ans.id])).rows }); }));
  // Serveur GPU loué à l'heure (RunPod) : allumé quand un travail arrive, il s'éteint tout seul quand il n'a plus rien à faire
  let lastWorker = 0, lastWake = 0;
  async function wakeGpu(){
    const key = process.env.ANS_RUNPOD_KEY, pod = process.env.ANS_RUNPOD_POD_ID; if(!key || !pod) return;
    if(Date.now() - lastWorker < 3 * 60000 || Date.now() - lastWake < 5 * 60000) return; lastWake = Date.now();
    const r = await fetch('https://rest.runpod.io/v1/pods/' + encodeURIComponent(pod) + '/start', { method:'POST', headers:{ Authorization:'Bearer ' + key } });
    log('serveur GPU démarré (' + r.status + ')');
  }
  setInterval(function(){ if(!pg()) return; pg().query("SELECT COUNT(*)::int AS n FROM ans_ai_jobs WHERE status='queued'").then(function(r){ if(r.rows[0].n > 0) wakeGpu().catch(function(){}); }).catch(function(){});
    pg().query("UPDATE ans_ai_jobs SET status='queued', worker=NULL WHERE status='running' AND started_at < NOW() - INTERVAL '3 hours'").catch(function(){}); }, 120000);
  // le serveur GPU vient chercher le travail (clé ANS_WORKER_KEY) puis rend le résultat
  function workerOk(req){ if(req.headers['x-worker-key']) lastWorker = Date.now(); const k = process.env.ANS_WORKER_KEY; return !!k && String(req.headers['x-worker-key'] || '') === k; }
  app.post(API + '/worker/next', wrap(async function(req, res){
    if(!workerOk(req)) return res.status(401).end();
    const j = (await pg().query("UPDATE ans_ai_jobs SET status='running', started_at=NOW(), worker=$1 WHERE id = (SELECT id FROM ans_ai_jobs WHERE status='queued' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *", [txt((req.body || {}).worker, 60) || 'gpu'])).rows[0];
    if(!j) return res.json({ job:null });
    let presign = null; const key = 'ans/ai/' + j.id + '.mp4';
    if(R2.ready && R2.ready()){ presign = { upload_url: await R2.presign(key, 'video/mp4'), public_url: R2.public + '/' + key }; }
    else if(process.env.ANS_LOCAL_UPLOAD){ const u = (process.env.ANS_PUBLIC_URL || '') + API + '/media/local/' + encodeURIComponent(key.replace(/\//g, '__')); presign = { upload_url: u, public_url: u }; }
    res.json({ job: { id: j.id, kind: j.kind, params: j.params }, upload: presign });
  }));
  // traduction des phrases d'une vidéo (doublage) : faite ici, la clé de l'IA reste sur le serveur
  app.post(API + '/worker/translate', wrap(async function(req, res){
    if(!workerOk(req)) return res.status(401).end(); if(!aiOn()) return res.status(503).json({ error:'IA non configurée' });
    const b = req.body || {}; const segs = (Array.isArray(b.segments) ? b.segments : []).slice(0, 400).map(function(x){ return String(x || '').slice(0, 600); });
    const L = { fr:'français', wo:'wolof (écrit en alphabet latin officiel du Sénégal)', en:'anglais', ar:'arabe' }; const to = L[b.to] || 'anglais';
    const out = await llm('Tu traduis les sous-titres d’une vidéo de cours pour des élèves sénégalais. Traduction fidèle, naturelle à l’oral, phrases courtes, même nombre d’éléments. Réponds UNIQUEMENT avec un tableau JSON de chaînes.',
      [{ role:'user', content:'Traduis en ' + to + ' chaque élément de ce tableau JSON (garde l’ordre) :\n' + JSON.stringify(segs) }], 4000);
    const j = parseJson(out.text); if(!Array.isArray(j) || j.length !== segs.length) return res.status(502).json({ error:'Traduction incomplète' });
    res.json({ segments: j.map(function(x){ return String(x || ''); }) });
  }));
  app.post(API + '/worker/:id/progress', wrap(async function(req, res){ if(!workerOk(req)) return res.status(401).end(); await pg().query("UPDATE ans_ai_jobs SET progress=$2 WHERE id=$1", [req.params.id, Math.max(0, Math.min(99, parseInt((req.body || {}).progress, 10) || 0))]); res.json({ ok:true }); }));
  app.post(API + '/worker/:id/done', wrap(async function(req, res){
    if(!workerOk(req)) return res.status(401).end(); const b = req.body || {};
    if(b.error){ await pg().query("UPDATE ans_ai_jobs SET status='failed', error=$2, done_at=NOW() WHERE id=$1", [req.params.id, txt(b.error, 500)]); return res.json({ ok:true }); }
    const j = (await pg().query("UPDATE ans_ai_jobs SET status='done', progress=100, result_url=$2, done_at=NOW() WHERE id=$1 RETURNING *", [req.params.id, okUrl(b.result_url) ? b.result_url : null])).rows[0];
    // doublage : la nouvelle langue est ajoutée à la leçon (l'élève choisit sa langue)
    // vidéo avatar : une leçon écrite devient une leçon vidéo (le texte reste comme résumé) ; une leçon vidéo reçoit une version de plus
    if(j && j.kind === 'avatar' && j.lesson_id && j.result_url){ const lg = (j.params || {}).lang || 'fr'; const l = (await pg().query('SELECT kind, media_url FROM ans_lessons WHERE id=$1', [j.lesson_id])).rows[0];
      if(l && (l.kind === 'text' || !l.media_url)) await pg().query("UPDATE ans_lessons SET kind='video', media_url=$2, updated_at=NOW() WHERE id=$1", [j.lesson_id, j.result_url]);
      else if(l) await pg().query("UPDATE ans_lessons SET versions = COALESCE(versions,'{}'::jsonb) || jsonb_build_object($2::text, $3::text), updated_at=NOW() WHERE id=$1", [j.lesson_id, 'avatar_' + lg, j.result_url]); }
    if(j && j.kind === 'dub' && j.lesson_id && j.result_url){ const lg = (j.params || {}).target_lang || 'en'; await pg().query("UPDATE ans_lessons SET versions = COALESCE(versions,'{}'::jsonb) || jsonb_build_object($2::text, $3::text), updated_at=NOW() WHERE id=$1", [j.lesson_id, lg, j.result_url]); }
    res.json({ ok:true });
  }));

  // ═══════════════ Site de l'Académie (espace professeurs + administration) ═══════════════
  const WEB = path.join(__dirname, 'academie-web.html');
  app.get(['/academie', '/academie/', '/academie/merci', '/academie/erreur'], function(req, res){ res.set('Cache-Control', 'no-cache'); res.sendFile(WEB, function(e){ if(e && !res.headersSent) res.status(404).send('Académie : page introuvable'); }); });
  log('module chargé');
};
