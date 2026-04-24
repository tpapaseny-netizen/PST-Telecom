// ============================================
// PST — usePSTCall.js
// Hook React pour les appels VoIP via Twilio
// ============================================

import { useState, useEffect, useRef } from 'react';
import { Device } from '@twilio/voice-sdk';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

export function usePSTCall(userId) {
  const [device, setDevice]         = useState(null);
  const [statut, setStatut]         = useState('idle'); // idle | connecting | en_appel | ended
  const [duree, setDuree]           = useState(0);
  const [erreur, setErreur]         = useState(null);
  const [appelsRecents, setAppels]  = useState([]);
  const callRef   = useRef(null);
  const timerRef  = useRef(null);

  // ── Initialiser le Device Twilio ──────────
  useEffect(() => {
    if (!userId) return;

    async function initDevice() {
      try {
        const res  = await fetch(`${API_URL}/api/calls/token`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ userId }),
        });
        const { token } = await res.json();

        const dev = new Device(token, { logLevel: 1, codecPreferences: ['opus', 'pcmu'] });

        dev.on('incoming', call => {
          // Appel entrant — afficher une notification
          if (window.confirm(`Appel entrant de ${call.parameters.From} — Décrocher ?`)) {
            call.accept();
            callRef.current = call;
            setStatut('en_appel');
            startTimer();
            call.on('disconnect', endCall);
          } else {
            call.reject();
          }
        });

        dev.on('error', err => setErreur(err.message));
        await dev.register();
        setDevice(dev);

      } catch (err) {
        setErreur('Impossible d\'initialiser le service d\'appel: ' + err.message);
      }
    }

    initDevice();
    chargerHistorique();

    return () => {
      if (device) device.destroy();
      clearInterval(timerRef.current);
    };
  }, [userId]);

  // ── Passer un appel sortant ───────────────
  async function appeler(numeroDestinataire) {
    if (!device) { setErreur('Service non initialisé'); return; }
    if (statut !== 'idle') { setErreur('Un appel est déjà en cours'); return; }

    // Nettoyer le numéro
    const numero = numeroDestinataire.replace(/[\s\-\(\)]/g, '');
    if (!numero.startsWith('+')) {
      setErreur('Format international requis (ex: +221771234567)');
      return;
    }

    setStatut('connecting');
    setErreur(null);
    setDuree(0);

    try {
      const call = await device.connect({
        params: { To: numero, userId },
      });

      callRef.current = call;

      call.on('accept',     () => { setStatut('en_appel'); startTimer(); });
      call.on('disconnect', endCall);
      call.on('cancel',     endCall);
      call.on('error',      err => { setErreur(err.message); endCall(); });

    } catch (err) {
      setErreur('Erreur appel: ' + err.message);
      setStatut('idle');
    }
  }

  // ── Raccrocher ────────────────────────────
  function raccrocher() {
    if (callRef.current) {
      callRef.current.disconnect();
    }
    endCall();
  }

  // ── Mettre en sourdine ────────────────────
  function toggleMute() {
    if (callRef.current) {
      const muted = callRef.current.isMuted();
      callRef.current.mute(!muted);
      return !muted;
    }
    return false;
  }

  // ── Helpers internes ──────────────────────
  function startTimer() {
    timerRef.current = setInterval(() => setDuree(d => d + 1), 1000);
  }

  function endCall() {
    clearInterval(timerRef.current);
    callRef.current = null;
    setStatut('ended');
    setTimeout(() => setStatut('idle'), 2000);
    chargerHistorique();
  }

  async function chargerHistorique() {
    try {
      const res = await fetch(`${API_URL}/api/calls/history/${userId}`);
      const data = await res.json();
      setAppels(data);
    } catch {}
  }

  // ── Formater la durée ─────────────────────
  function formatDuree(secondes) {
    const m = Math.floor(secondes / 60).toString().padStart(2, '0');
    const s = (secondes % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  return {
    statut,
    duree: formatDuree(duree),
    dureeSecondes: duree,
    erreur,
    appelsRecents,
    appeler,
    raccrocher,
    toggleMute,
    enAppel:     statut === 'en_appel',
    enConnexion: statut === 'connecting',
  };
}
