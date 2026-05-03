
// ═══════════════════════════════════════════
// AGENT FACTURATION — FACTURES AUTO PDF+GMAIL
// ═══════════════════════════════════════════

const nodemailer = require('nodemailer');

// Gmail transporter
function getMailer() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER || 'papasenytoure@gmail.com',
      pass: process.env.GMAIL_APP_PASSWORD || 'gwwjmwlgrigemvmd'
    }
  });
}

// Generate invoice HTML
function generateInvoiceHTML(data) {
  const { numero, date, client, telephone, service, montant, forfait } = data;
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8">
<style>
body{font-family:Arial,sans-serif;background:#f8f9fa;margin:0;padding:20px}
.invoice{max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.1)}
.header{background:linear-gradient(135deg,#0a0d12,#1a2035);padding:30px;text-align:center}
.header h1{color:#00d4ff;font-size:28px;margin:0;letter-spacing:2px}
.header p{color:#94a3b8;margin:4px 0 0;font-size:13px}
.body{padding:30px}
.row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f0f0f0;font-size:14px}
.row:last-child{border-bottom:none}
.label{color:#64748b}
.value{font-weight:600;color:#1a2035}
.total-box{background:linear-gradient(135deg,rgba(0,212,255,0.08),rgba(124,58,237,0.08));border:1px solid rgba(0,212,255,0.2);border-radius:10px;padding:16px;margin-top:20px;display:flex;justify-content:space-between;align-items:center}
.total-label{font-size:14px;color:#64748b}
.total-amount{font-size:24px;font-weight:800;color:#00d4ff}
.footer{background:#f8f9fa;padding:20px;text-align:center;font-size:12px;color:#94a3b8}
.badge{display:inline-block;background:#00e676;color:#fff;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:700;margin-bottom:16px}
</style>
</head>
<body>
<div class="invoice">
  <div class="header">
    <h1>PST TELECOM</h1>
    <p>Pure Smart Telecom — Facture officielle</p>
  </div>
  <div class="body">
    <div style="text-align:center;margin-bottom:20px">
      <div class="badge">✓ PAIEMENT CONFIRME</div>
    </div>
    <div class="row"><span class="label">N° Facture</span><span class="value">${numero}</span></div>
    <div class="row"><span class="label">Date</span><span class="value">${date}</span></div>
    <div class="row"><span class="label">Client</span><span class="value">${client}</span></div>
    <div class="row"><span class="label">Téléphone</span><span class="value">${telephone}</span></div>
    <div class="row"><span class="label">Service</span><span class="value">${service}</span></div>
    ${forfait ? `<div class="row"><span class="label">Forfait</span><span class="value">${forfait}</span></div>` : ''}
    <div class="total-box">
      <span class="total-label">MONTANT TOTAL</span>
      <span class="total-amount">${Number(montant).toLocaleString('fr-FR')} FCFA</span>
    </div>
  </div>
  <div class="footer">
    PST Pure Smart Telecom • pst-telecom.vercel.app<br>
    Contact: +221 77 152 09 59 • papasenytoure@gmail.com<br>
    Merci de votre confiance !
  </div>
</div>
</body>
</html>`;
}

// Generate invoice number
function genInvoiceNum() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const r = Math.random().toString(36).substring(2,6).toUpperCase();
  return `PST-${y}${m}-${r}`;
}

// Main function: create and send invoice
async function sendInvoice(data) {
  try {
    const numero = genInvoiceNum();
    const date = new Date().toLocaleDateString('fr-FR', {
      day:'2-digit', month:'long', year:'numeric'
    });
    
    const invoiceData = { ...data, numero, date };
    const html = generateInvoiceHTML(invoiceData);
    
    // Save to DB
    if (db) {
      await db.collection('factures').insertOne({
        numero,
        client: data.client,
        telephone: data.telephone,
        service: data.service,
        montant: data.montant,
        email: data.email || '',
        html,
        createdAt: new Date(),
        sent: false
      });
    }
    
    // Send email if we have an email address
    if (data.email) {
      const mailer = getMailer();
      await mailer.sendMail({
        from: `PST Telecom <${process.env.GMAIL_USER || 'papasenytoure@gmail.com'}>`,
        to: data.email,
        subject: `Facture PST ${numero} — ${data.service}`,
        html,
        attachments: [{
          filename: `Facture-PST-${numero}.html`,
          content: html,
          contentType: 'text/html'
        }]
      });
      if (db) await db.collection('factures').updateOne({ numero }, { $set: { sent: true } });
      console.log(`Facture ${numero} envoyee a ${data.email}`);
    }
    
    // Always send copy to admin
    try {
      const mailer = getMailer();
      await mailer.sendMail({
        from: `PST Telecom <${process.env.GMAIL_USER}>`,
        to: process.env.GMAIL_USER || 'papasenytoure@gmail.com',
        subject: `[PST ADMIN] Nouveau paiement - ${data.client} - ${Number(data.montant).toLocaleString()} FCFA`,
        html
      });
    } catch(e) { console.log('Admin email erreur:', e.message); }
    
    return { success: true, numero };
  } catch(e) {
    console.error('Erreur facture:', e.message);
    return { success: false, error: e.message };
  }
}

// API Routes
app.post('/api/factures/generer', async (req, res) => {
  try {
    const { client, telephone, email, service, montant, forfait } = req.body;
    if (!client || !montant) return res.status(400).json({ error: 'client et montant requis' });
    const result = await sendInvoice({ client, telephone, email, service, montant, forfait });
    res.json(result);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/factures', async (req, res) => {
  try {
    if (!db) return res.json([]);
    const factures = await db.collection('factures')
      .find({}, { projection: { html: 0 } })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();
    res.json(factures);
  } catch(e) { res.json([]); }
});

app.get('/api/factures/:numero', async (req, res) => {
  try {
    if (!db) return res.status(404).json({ error: 'Non trouvee' });
    const f = await db.collection('factures').findOne({ numero: req.params.numero });
    if (!f) return res.status(404).json({ error: 'Non trouvee' });
    res.send(f.html);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/factures/:id', async (req, res) => {
  try {
    if (!db) return res.status(500).json({ error: 'DB non disponible' });
    const { ObjectId } = require('mongodb');
    let oid;
    try { oid = new ObjectId(req.params.id); } catch(e) { return res.status(400).json({ error: 'ID invalide' }); }
    await db.collection('factures').deleteOne({ _id: oid });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// Auto-generate invoice when payment confirmed (hook into existing webhook)
async function autoFactureOnPayment(paymentData) {
  if (!paymentData || !paymentData.montant) return;
  await sendInvoice({
    client: paymentData.nom || paymentData.client || 'Client PST',
    telephone: paymentData.telephone || '',
    email: paymentData.email || '',
    service: paymentData.service || 'Forfait PST',
    montant: paymentData.montant,
    forfait: paymentData.forfait || ''
  });
}

// Make available globally
global.autoFactureOnPayment = autoFactureOnPayment;

console.log('Agent Facturation pret');

