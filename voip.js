// ============================================
// PST — VoIP WebRTC Server
// Utilise drachtio-server + FreeSWITCH
// Solution 100% autonome
// ============================================

const express = require('express');
const http    = require('http');
const { Server } = require('socket.io');
const crypto  = require('crypto');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, { cors: { origin: '*' } });

app.use(express.json());
app.use(express.static('public'));

// Abonnés connectés en temps réel
const connectes = {};
const appelsEnCours = {};

// ══════════════════════════════════════════
// WebRTC Signaling via Socket.IO
// ══════════════════════════════════════════

io.on('connection', (socket) => {
  console.log('Client connecté:', socket.id);

  // Abonné s'enregistre
  socket.on('register', ({ userId, numeroVirtuel }) => {
    connectes[userId] = { socketId: socket.id, numeroVirtuel, userId };
    socket.userId = userId;
    console.log(`✅ ${userId} enregistré - ${numeroVirtuel}`);
    socket.emit('registered', { success: true, numeroVirtuel });
  });

  // Initier un appel sortant
  socket.on('call', ({ from, to, offer }) => {
    const appelId = 'CALL-' + crypto.randomBytes(4).toString('hex').toUpperCase();
    
    // Chercher le destinataire par numéro
    const dest = Object.values(connectes).find(c => 
      c.numeroVirtuel === to || c.userId === to
    );

    appelsEnCours[appelId] = { from, to, offer, socketFrom: socket.id };

    if (dest) {
      // Appel interne PST → PST
      io.to(dest.socketId).emit('incoming_call', {
        appelId, from, offer,
        message: `Appel de ${from}`
      });
      socket.emit('call_ringing', { appelId });
    } else {
      // Appel externe → numéro GSM classique
      // On simule pour l'instant, AT Voice en production
      socket.emit('call_status', { 
        appelId, 
        status: 'connecting',
        message: `Connexion vers ${to}...` 
      });
      
      setTimeout(() => {
        socket.emit('call_status', { 
          appelId, 
          status: 'answered',
          message: 'En appel'
        });
      }, 2000);
    }
  });

  // Répondre à un appel
  socket.on('answer', ({ appelId, answer }) => {
    const appel = appelsEnCours[appelId];
    if (appel) {
      io.to(appel.socketFrom).emit('call_answered', { appelId, answer });
    }
  });

  // Refuser un appel
  socket.on('reject', ({ appelId }) => {
    const appel = appelsEnCours[appelId];
    if (appel) {
      io.to(appel.socketFrom).emit('call_rejected', { appelId });
      delete appelsEnCours[appelId];
    }
  });

  // Raccrocher
  socket.on('hangup', ({ appelId }) => {
    const appel = appelsEnCours[appelId];
    if (appel) {
      io.to(appel.socketFrom).emit('call_ended', { appelId });
      io.to(appel.socketTo || '').emit('call_ended', { appelId });
      delete appelsEnCours[appelId];
    }
  });

  // ICE Candidates WebRTC
  socket.on('ice_candidate', ({ appelId, candidate }) => {
    const appel = appelsEnCours[appelId];
    if (appel) {
      const dest = appel.socketFrom === socket.id ? appel.socketTo : appel.socketFrom;
      if (dest) io.to(dest).emit('ice_candidate', { appelId, candidate });
    }
  });

  socket.on('disconnect', () => {
    if (socket.userId) {
      delete connectes[socket.userId];
      console.log(`${socket.userId} déconnecté`);
    }
  });
});

// API REST
app.get('/api/voip/connectes', (req, res) => {
  res.json({ connectes: Object.keys(connectes).length, users: Object.values(connectes).map(c => c.numeroVirtuel) });
});

const PORT = process.env.VOIP_PORT || 3002;
server.listen(PORT, () => {
  console.log(`PST VoIP Server — Port ${PORT} ✅`);
});

module.exports = { app, io };
