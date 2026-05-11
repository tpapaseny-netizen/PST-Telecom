// ═══════════════════════════════════════════════
// ZAMA — Bureau de change digital
// ═══════════════════════════════════════════════

app.get('/zama', (req, res) => {
  res.sendFile(__dirname + '/zama.html');
});

app.post('/api/zama/create', async (req, res) => {
  try {
    const { src_currency, amount, rate_fcfa, net_fcfa, receiver_phone, receiver_name, receiver_mm, email } = req.body;
    const orderId = 'ZAMA-' + Date.now();
    const cryptoAmt = (amount * (606 / (rate_fcfa || 606))).toFixed(4);

    let address = null;
    try {
      const iziRes = await fetch('https://pay.izichange.com/api/deposit/address', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (process.env.IZIPAY_API_KEY || '') },
        body: JSON.stringify({ currency: 'USDT.BEP20', order_id: orderId, amount: parseFloat(cryptoAmt), description: 'ZAMA Change ' + amount + ' ' + src_currency })
      });
      const iziData = await iziRes.json();
      address = iziData.address || null;
    } catch(e) { console.log('izichangePay error:', e.message); }

    if (db) {
      await db.collection('zama_orders').insertOne({
        order_id: orderId, src_currency, amount, rate_fcfa, net_fcfa,
        crypto_amount: cryptoAmt, receiver_phone, receiver_name, receiver_mm,
        email, address, status: 'pending', created_at: new Date()
      });
    }

    res.json({ success: true, order_id: orderId, address, net_fcfa, crypto_amount: cryptoAmt });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/zama/status/:orderId', async (req, res) => {
  try {
    if (!db) return res.json({ status: 'pending' });
    const order = await db.collection('zama_orders').findOne({ order_id: req.params.orderId });
    if (!order) return res.status(404).json({ error: 'Commande non trouvee' });
    res.json({ status: order.status, order_id: order.order_id, net_fcfa: order.net_fcfa });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/zama/ipn', async (req, res) => {
  try {
    const { order_id, status } = req.body;
    if ((status === 'completed' || status === 'confirmed') && db) {
      const order = await db.collection('zama_orders').findOne({ order_id });
      if (order && order.status === 'pending') {
        await db.collection('zama_orders').updateOne({ order_id }, { $set: { status: 'paid', paid_at: new Date() } });
        console.log('[ZAMA PAYOUT NEEDED]', order.net_fcfa, 'FCFA ->', order.receiver_phone, 'via', order.receiver_mm);
        try {
          const at = require('africastalking')({ apiKey: process.env.AT_API_KEY, username: process.env.AT_USERNAME || 'pst-telecom' });
          const phone = order.receiver_phone.startsWith('+') ? order.receiver_phone : '+221' + order.receiver_phone;
          await at.SMS.send({ to: [phone], message: 'ZAMA: Votre echange de ' + order.amount + ' ' + order.src_currency + ' est confirme. Vous allez recevoir ' + order.net_fcfa.toLocaleString() + ' FCFA via ' + (order.receiver_mm === 'wave' ? 'Wave' : 'Orange Money') + '. Ref: ' + order_id, from: 'PST' });
        } catch(e) { console.log('SMS error:', e.message); }
      }
    }
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
