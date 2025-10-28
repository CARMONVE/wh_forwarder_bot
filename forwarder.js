/**
 * forwarder.js - Final version for Render
 * - Uses puppeteer (full) — not puppeteer-core
 * - Reads rules from config.json (array "rules")
 * - Uses processed.json to avoid duplicate forwards
 */

const fs = require('fs');
const path = require('path');
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');
const puppeteer = require('puppeteer');

const CONFIG_PATH = path.join(__dirname, 'config.json');
const PROCESSED_PATH = path.join(__dirname, 'processed.json');

if (!fs.existsSync(CONFIG_PATH)) {
  console.error('❌ config.json not found. Abort.');
  process.exit(1);
}

// ensure processed.json exists
if (!fs.existsSync(PROCESSED_PATH)) {
  fs.writeFileSync(PROCESSED_PATH, JSON.stringify([], null, 2), 'utf8');
}

const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
let processed = [];

try {
  processed = JSON.parse(fs.readFileSync(PROCESSED_PATH, 'utf8')) || [];
} catch (e) {
  processed = [];
}

// prepare rules (compile regex)
const RULES = (config.rules || []).map(r => {
  // each rule: { origin, target, pattern, flags }
  try {
    return {
      origin: (r.origin || '').toString(),
      target: (r.target || '').toString(),
      regex: new RegExp(r.pattern, r.flags || 'i')
    };
  } catch (err) {
    console.warn('⚠️ Invalid rule pattern, skipping:', r, err.message);
    return null;
  }
}).filter(Boolean);

async function getChromeExecutable() {
  try {
    // Puppeteer installed as dependency provides executablePath()
    const exe = puppeteer.executablePath();
    console.log('✅ puppeteer.executablePath():', exe);
    return exe;
  } catch (err) {
    console.warn('⚠️ puppeteer.executablePath() failed:', err.message);
  }

  // fallback common Render cache paths (try multiple known revisions)
  const candidates = [
    '/opt/render/.cache/puppeteer/chrome/linux-141.0.7390.122/chrome-linux64/chrome',
    '/opt/render/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/google-chrome'
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) {
      console.log('✅ Found fallback Chrome at', c);
      return c;
    }
  }

  throw new Error('Could not locate Chrome executable. Ensure puppeteer was installed in build.');
}

async function saveProcessed() {
  try {
    fs.writeFileSync(PROCESSED_PATH, JSON.stringify(processed, null, 2), 'utf8');
  } catch (err) {
    console.warn('⚠️ Could not write processed.json:', err.message);
  }
}

(async () => {
  // get chrome path
  let chromePath;
  try {
    chromePath = await getChromeExecutable();
  } catch (err) {
    console.error('❌ No Chrome executable found:', err.message);
    process.exit(1);
  }

  const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      executablePath: chromePath,
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--single-process',
        '--disable-software-rasterizer'
      ]
    }
  });

  client.on('qr', qr => {
    console.log('📱 Scan this QR to authenticate:');
    qrcode.generate(qr, { small: true });
  });

  client.on('ready', () => {
    console.log('✅ WhatsApp client ready.');
  });

  client.on('authenticated', () => {
    console.log('🔐 Authenticated with whatsapp-web.js (LocalAuth).');
  });

  client.on('auth_failure', (msg) => {
    console.error('❌ Auth failure:', msg);
  });

  client.on('disconnected', (reason) => {
    console.log('⚠️ Disconnected:', reason);
  });

  client.on('message_create', async msg => {
    // message_create fires for messages we send and receive; filter out those
    try {
      const chat = await msg.getChat();
      if (!chat || !chat.isGroup) return; // only process group messages

      const chatName = (chat.name || '').toString().trim();
      const text = (msg.body || '').toString();

      // find rules matching this origin (case-insensitive)
      const matchingRules = RULES.filter(r => r.origin.toLowerCase() === chatName.toLowerCase());
      if (!matchingRules || matchingRules.length === 0) return;

      // message id to avoid duplicates
      const msgId = msg.id && msg.id._serialized ? msg.id._serialized : null;
      if (!msgId) return;

      // if already processed, skip
      if (processed.includes(msgId)) return;

      for (const rule of matchingRules) {
        try {
          if (rule.regex.test(text)) {
            console.log(`📤 Rule matched: origin="${rule.origin}" -> target="${rule.target}"`);
            // find target chat
            const chats = await client.getChats();
            const target = chats.find(c => (c.name || '').toString().toLowerCase() === rule.target.toLowerCase());
            if (target) {
              await target.sendMessage(text);
              console.log('✅ Message forwarded to:', rule.target);
              // mark as processed (once forwarded)
              processed.push(msgId);
              await saveProcessed();
            } else {
              console.warn('⚠️ Target group not found:', rule.target);
            }
            // continue to next rule to allow multiple forwards
          }
        } catch (err) {
          console.error('❌ Error applying rule:', err.message);
        }
      }
    } catch (err) {
      console.error('❌ Error processing message:', err.message);
    }
  });

  await client.initialize();
})();