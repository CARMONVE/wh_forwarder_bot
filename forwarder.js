const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const fs = require('fs');
const XLSX = require('xlsx');
const path = require('path');

// Configuración del navegador Puppeteer
const puppeteerConfig = {
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--no-first-run',
    '--no-zygote',
    '--single-process'
  ],
};

// Inicialización del cliente de WhatsApp
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: puppeteerConfig
});

// Mostrar QR como imagen cuadrada y enlace
client.on('qr', async (qr) => {
  console.log('📱 Escanea el código QR para conectar tu bot...');

  try {
    const filePath = path.join(__dirname, 'qr.png');
    await qrcode.toFile(filePath, qr, { width: 400 });
    console.log(`✅ QR guardado como imagen: ${filePath}`);

    // También muestra una URL escaneable en consola
    const url = await qrcode.toDataURL(qr);
    console.log(`🌐 Copia y abre este enlace para escanear el QR:\n${url}\n`);
  } catch (err) {
    console.error('❌ Error generando QR:', err);
  }
});

client.on('ready', () => {
  console.log('✅ Bot conectado y listo para reenviar mensajes');
});

client.on('message', async (message) => {
  try {
    const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
    const rules = config.rules || [];

    for (const rule of rules) {
      const originMatch = message.from.includes(rule.origin);
      const pattern = new RegExp(rule.pattern, rule.flags || 'ims');

      if (originMatch && pattern.test(message.body)) {
        console.log(`📤 Reenviando mensaje de ${rule.origin} → ${rule.target}`);
        const chats = await client.getChats();
        const targetChat = chats.find(c => c.name === rule.target);

        if (targetChat) {
          await client.sendMessage(targetChat.id._serialized, message.body);
          console.log('✅ Mensaje reenviado correctamente');
        } else {
          console.warn(`⚠️ No se encontró el chat destino: ${rule.target}`);
        }
      }
    }
  } catch (err) {
    console.error('❌ Error procesando mensaje:', err);
  }
});

client.initialize();
