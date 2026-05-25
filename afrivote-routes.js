
// ============================================================
//  AFRIVOTE — Routes API
//  À injecter dans server-at.js avant le bloc DÉMARRAGE
// ============================================================

const mongoose = require('mongoose');  // déjà importé dans server-at.js

// ---- SCHEMA ----
const SondageSchema = new mongoose.Schema({
  titre:       { type: String, required: true },
  description: { type: String, default: '' },
  categorie:   { type: String, default: 'societe' },
  options:     [{ label: String, votes: { type: Number, default: 0 } }],
  totalVotes:  { type: Number, default: 0 },
  actif:       { type: Boolean, default: true },
  dureeJours:  { type: Number, default: 7 },  // 0 = sans limite
  closedAt:    { type: Date, default: null },
  votants:     [String],  // IP + userId hash pour anti-doublon
}, { timestamps: true });

const Sondage = mongoose.models.Sondage || mongoose.model('Sondage', SondageSchema);

const AFRIVOTE_ADMIN_PASS = process.env.AFRIVOTE_ADMIN_PASS || 'Pstdiama@1';

// ---- MIDDLEWARE ADMIN ----
function checkAdminPass(req, res, next) {
  const { adminPass } = req.body || {};
  if (adminPass !== AFRIVOTE_ADMIN_PASS) {
    return res.status(403).json({ success: false, message: 'Accès non autorisé' });
  }
  next();
}

// ---- GET tous les sondages ----
app.get('/api/afrivote/sondages', async (req, res) => {
  try {
    const sondages = await Sondage.find().sort({ createdAt: -1 }).lean();
    // Auto-fermeture si durée dépassée
    const now = new Date();
    const updated = sondages.map(s => {
      if (s.actif && s.dureeJours > 0) {
        const created = new Date(s.createdAt);
        const limit = new Date(created.getTime() + s.dureeJours * 86400000);
        if (now > limit) s.actif = false;
      }
      return s;
    });
    res.json({ success: true, sondages: updated });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ---- GET résultats d'un sondage ----
app.get('/api/afrivote/resultats/:id', async (req, res) => {
  try {
    const s = await Sondage.findById(req.params.id).lean();
    if (!s) return res.status(404).json({ success: false, message: 'Sondage introuvable' });
    res.json({ success: true, options: s.options, totalVotes: s.totalVotes, actif: s.actif });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ---- POST créer un sondage (admin) ----
app.post('/api/afrivote/sondages', async (req, res) => {
  const { titre, description, categorie, options, dureeJours, adminPass } = req.body;
  if (adminPass !== AFRIVOTE_ADMIN_PASS) {
    return res.status(403).json({ success: false, message: 'Accès non autorisé' });
  }
  if (!titre || !options || options.length < 2) {
    return res.status(400).json({ success: false, message: 'Titre et au moins 2 options requis' });
  }
  try {
    const opts = options.map(l => ({ label: typeof l === 'string' ? l : l.label, votes: 0 }));
    const sondage = new Sondage({ titre, description, categorie, options: opts, dureeJours: dureeJours || 7 });
    await sondage.save();
    res.json({ success: true, sondage });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ---- POST voter ----
app.post('/api/afrivote/vote', async (req, res) => {
  const { sondageId, optionIdx } = req.body;
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket.remoteAddress || 'unknown';

  // Optionnel: identifiant user via Authorization header
  let userId = null;
  const auth = req.headers['authorization'];
  if (auth && auth.startsWith('Bearer ')) {
    try {
      const decoded = JSON.parse(Buffer.from(auth.slice(7), 'base64').toString());
      userId = decoded.id || null;
    } catch(e) {}
  }

  const voterKey = userId ? `user_${userId}` : `ip_${ip}`;

  try {
    const sondage = await Sondage.findById(sondageId);
    if (!sondage) return res.status(404).json({ success: false, message: 'Sondage introuvable' });
    if (!sondage.actif) return res.status(400).json({ success: false, message: 'Ce sondage est clôturé' });

    // Anti-doublon
    if (sondage.votants.includes(voterKey)) {
      return res.status(400).json({ success: false, message: 'Vous avez déjà voté' });
    }
    if (optionIdx < 0 || optionIdx >= sondage.options.length) {
      return res.status(400).json({ success: false, message: 'Option invalide' });
    }

    sondage.options[optionIdx].votes += 1;
    sondage.totalVotes += 1;
    sondage.votants.push(voterKey);
    sondage.markModified('options');
    await sondage.save();

    res.json({ success: true, totalVotes: sondage.totalVotes, options: sondage.options });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ---- POST clôturer un sondage ----
app.post('/api/afrivote/sondages/:id/close', checkAdminPass, async (req, res) => {
  try {
    const s = await Sondage.findByIdAndUpdate(req.params.id, { actif: false, closedAt: new Date() }, { new: true });
    if (!s) return res.status(404).json({ success: false, message: 'Sondage introuvable' });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ---- DELETE supprimer un sondage ----
app.delete('/api/afrivote/sondages/:id', async (req, res) => {
  const { adminPass } = req.body;
  if (adminPass !== AFRIVOTE_ADMIN_PASS) {
    return res.status(403).json({ success: false, message: 'Accès non autorisé' });
  }
  try {
    await Sondage.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ---- GET stats admin ----
app.get('/api/afrivote/admin', async (req, res) => {
  try {
    const total = await Sondage.countDocuments();
    const live = await Sondage.countDocuments({ actif: true });
    const votes = await Sondage.aggregate([{ $group: { _id: null, sum: { $sum: '$totalVotes' } } }]);
    res.json({ success: true, total, live, totalVotes: votes[0]?.sum || 0 });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// ============================================================
//  FIN AFRIVOTE
// ============================================================
