const fs = require('fs');
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');
const puppeteer = require('puppeteer');
const XLSX = require('xlsx');

(async () => {
  const configPath = './config.json';
  const processedPath = './processed.json';
  
  // Crear archivo processed.json si no existe
  if (!fs.existsSync(processedPath)) fs.writeFileSync(processedPath, '[]', 'utf-8');

  // Cargar reglas de configuración
  const config = fs.existsSync(configPath)
    ? JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    : { rules: [] };

  console.log('🚀 Iniciando WhatsApp bot con Puppeteer estándar...');

  let chromePath;
  try {
    chromePath = await puppeteer.executablePath();
  } catch {
    console.warn('⚠️ No se pudo obtener el path de Chrome, usando Puppeteer integrado.');
    chromePath = undefined;
  }

  const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      headless: true,
      executablePath: chromePath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-gpu',
        '--no-zygote',
        '--disable-dev-shm-usage'
      ]
    }
  });

  client.on('qr', (qr) => {
    console.log('📱 Escanea este código QR para conectar:');
    qrcode.generate(qr, { small: true });
  });

  client.on('ready', () => {
    console.log('✅ Bot conectado y operativo.');
  });

  client.on('message', async (msg) => {
    try {
      const processed = JSON.parse(fs.readFileSync(processedPath, 'utf-8'));
      if (processed.includes(msg.id._serialized)) return;

      const rule = config.rules.find(r => {
        if (r.origin !== msg.from) return false;
        const regex = new RegExp(r.pattern, r.flags);
        return regex.test(msg.body);
      });

      if (rule) {
        await client.sendMessage(rule.target, msg.body);
        console.log(`📤 Reenviado de ${rule.origin} a ${rule.target}`);
      }

      processed.push(msg.id._serialized);
      fs.writeFileSync(processedPath, JSON.stringify(processed, null, 2));
    } catch (err) {
      console.error('❌ Error procesando mensaje:', err);
    }
  });

  await client.initialize();
})();
