const fs = require('fs');
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');
const puppeteer = require('puppeteer');
const XLSX = require('xlsx');

// === Función para asegurar que Puppeteer tenga Chrome instalado ===
async function ensureChromeAvailable() {
  try {
    const browserFetcher = puppeteer.createBrowserFetcher();
    const localRevisions = await browserFetcher.localRevisions();

    if (localRevisions.length === 0) {
      console.log('⚠️ Chrome no encontrado. Descargando una versión...');
      await browserFetcher.download(puppeteer._preferredRevision);
      console.log('✅ Chrome descargado correctamente.');
    } else {
      console.log('✅ Chrome ya está disponible.');
    }
  } catch (err) {
    console.error('❌ Error verificando o descargando Chrome:', err);
  }
}

(async () => {
  await ensureChromeAvailable();

  const config = JSON.parse(fs.readFileSync('./config.json', 'utf-8'));
  const processedPath = './processed.json';
  if (!fs.existsSync(processedPath)) fs.writeFileSync(processedPath, '[]', 'utf-8');

  const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--no-zygote',
        '--disable-dev-shm-usage'
      ],
    },
  });

  client.on('qr', (qr) => {
    console.log('📱 Escanea este código QR para conectar tu bot:');
    qrcode.generate(qr, { small: true });
  });

  client.on('ready', () => {
    console.log('✅ Bot conectado y listo.');
  });

  client.on('message', async (msg) => {
    try {
      const data = JSON.parse(fs.readFileSync(processedPath, 'utf-8'));
      if (data.includes(msg.id._serialized)) return;

      const rule = config.rules.find(r => {
        if (r.origin !== msg.from) return false;
        const regex = new RegExp(r.pattern, r.flags);
        return regex.test(msg.body);
      });

      if (rule) {
        await client.sendMessage(rule.target, msg.body);
        console.log(`📤 Mensaje reenviado de ${rule.origin} a ${rule.target}`);
      }

      data.push(msg.id._serialized);
      fs.writeFileSync(processedPath, JSON.stringify(data, null, 2));
    } catch (err) {
      console.error('❌ Error procesando mensaje:', err);
    }
  });

  await client.initialize();
})();
