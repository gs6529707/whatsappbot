const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason, makeInMemoryStore } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const pino = require('pino');

const SESSION_DIR = process.env.SESSION_DIR || '/data/auth';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const logger = pino({ level: LOG_LEVEL });

function parseTokensToMinutes(tokens) {
  let totalMinutes = 0;
  const parseErrors = [];

  tokens.forEach(tokRaw => {
    const tok = String(tokRaw).trim();
    if (!tok) return;
    let hours = 0, minutes = 0;

    try {
      if (tok.includes(':')) {
        const [h, m] = tok.split(':');
        hours = parseInt(h || '0', 10);
        minutes = parseInt(m || '0', 10);
      } else if (tok.toLowerCase().includes('h')) {
        const [h, m] = tok.toLowerCase().split('h');
        hours = parseInt(h || '0', 10);
        minutes = parseInt(m || '0', 10);
      } else if (tok.includes('.')) {
        const [h, mRaw] = tok.split('.');
        hours = parseInt(h || '0', 10);
        if (!mRaw) minutes = 0;
        else if (/^\d+$/.test(mRaw)) {
          minutes = mRaw.length === 1 ? parseInt(mRaw,10) * 10 : parseInt(mRaw.slice(0,2),10);
        } else minutes = 0;
      } else if (/^\d+$/.test(tok)) {
        hours = parseInt(tok,10);
        minutes = 0;
      } else {
        parseErrors.push(tok);
        return;
      }

      if (Number.isNaN(hours) || Number.isNaN(minutes)) {
        parseErrors.push(tok);
        return;
      }

      // normalize overflow minutes
      if (minutes > 59) {
        hours += Math.floor(minutes / 60);
        minutes = minutes % 60;
      }
      totalMinutes += hours * 60 + minutes;
    } catch (e) {
      parseErrors.push(tok);
    }
  });

  return { totalMinutes, parseErrors };
}

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
  const store = makeInMemoryStore({ logger });
  const sock = makeWASocket({
    logger,
    auth: state,
    printQRInTerminal: false,
    keepAliveIntervalMs: 20000
  });

  store.bind(sock.ev);

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      try {
        const outPath = `${SESSION_DIR}/qr.png`;
        await qrcode.toFile(outPath, qr, { scale: 6 });
        logger.info({ qrSaved: outPath }, 'QR saved - download this file and scan with WhatsApp');
      } catch (e) {
        logger.error({ err: e }, 'Failed to write QR image');
      }
    }

    if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode;
      logger.info({ connection, reason }, 'connection closed');
      if (lastDisconnect && lastDisconnect.error) {
        if (lastDisconnect.error?.output?.statusCode === DisconnectReason.loggedOut) {
          logger.error('Logged out - delete auth folder to re-scan QR.');
        } else {
          logger.info('Reconnecting...');
          start().catch(err => logger.error({ err }, 'start error during reconnect'));
        }
      }
    }

    if (connection === 'open') {
      logger.info('Connection open - bot ready');
    }
  });

  sock.ev.on('messages.upsert', async (m) => {
    try {
      const messages = m.messages || [];
      for (const msg of messages) {
        if (!msg.message || msg.key && msg.key.remoteJid === 'status@broadcast') continue;
        const remoteJid = msg.key.remoteJid;

        const text =
          msg.message?.conversation ||
          msg.message?.extendedTextMessage?.text ||
          msg.message?.imageMessage?.caption ||
          msg.message?.videoMessage?.caption ||
          '';

        if (!text) continue;

        logger.info({ from: remoteJid, text }, 'incoming message');

        const tokens = text.split(/[+\s,]+/).filter(Boolean);
        const { totalMinutes, parseErrors } = parseTokensToMinutes(tokens);
        const totalHours = Math.floor(totalMinutes / 60);
        const remMinutes = totalMinutes % 60;
        const hhmm = `${String(totalHours).padStart(2,'0')}:${String(remMinutes).padStart(2,'0')}`;

        let reply = `Total: ${totalHours} hour${totalHours !== 1 ? 's' : ''} ${remMinutes} minute${remMinutes !== 1 ? 's' : ''} (${hhmm})`;
        if (parseErrors.length) {
          reply += `\nCouldn't parse: ${parseErrors.join(', ')}. Use formats like 4.50, 4:50, 4h50 or 4`;
        }

        await sock.sendMessage(remoteJid, { text: reply });
        logger.info({ to: remoteJid, reply }, 'sent reply');
      }
    } catch (err) {
      logger.error({ err }, 'message handler error');
    }
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT - saving creds & exiting');
    await saveCreds();
    process.exit(0);
  });
}

start().catch(err => {
  console.error('Fatal start error', err);
  process.exit(1);
});
