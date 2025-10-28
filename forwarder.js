const fs = require('fs');
const qrcode = require('qrcode-terminal');
const { Client, LocalAuth } = require('whatsapp-web.js');
const puppeteer = require('puppeteer');
const XLSX = require('xlsx');
const path = require('path');

const config = require('./config.json');

async function getChromePath() {
  try {
    // Intentar usar Puppeteer instalado en Render
    const chromePath = puppeteer.executablePath();
    console.log(`✅ Chrome path detectado: ${chromePath}`);
    return chromePath;
  } catch (error) {
    console.warn('⚠️ No se pudo obtener el path de Chrome automáticamente:', error.message);
    // Path por defecto en Render (fallback)
    return '/opt/render/.cache/puppeteer/chrome/linux-141.0.7390.122/chrome-linux64/chrome';
  }
}

(async () => {
  const chromePath = await getChromePath();

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
        '--single-process'
      ]
    }
  });

  client.on('qr', qr => {
    console.log('📱 Escanea este código QR para iniciar sesión:');
    qrcode.generate(qr, { small: true });
  });

  client.on('ready', () => {
    console.log('✅ Bot conectado y listo.');
  });

  client.on('message', async msg => {
    console.log(`💬 Mensaje recibido de ${msg.from}: ${msg.body}`);
    // Aquí podrías incluir la lógica de reenvío o procesamiento según config.json
  });

  client.on('disconnected', reason => {
    console.log(`⚠️ Cliente desconectado: ${reason}`);
  });

  await client.initialize();
})();
