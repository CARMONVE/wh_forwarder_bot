const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const xlsx = require('xlsx');
const express = require('express');
const puppeteer = require('puppeteer');
const config = require('./config.json');

const app = express();
const PORT = process.env.PORT || 3000;

// 🌐 Servidor HTTP para mantener el servicio activo en Render
app.get('/', (req, res) => {
  res.send('🚀 WhatsApp Forwarder Bot is running.');
});
app.listen(PORT, () => console.log(`🌍 Server listening on port ${PORT}`));

// 📦 Inicializa Puppeteer solo si Render lo necesita
(async () => {
  try {
    console.log('✅ Verificando instalación de Chrome...');
    const browser = await puppeteer.launch({ headless: true });
    await browser.close();
  } catch (err) {
    console.error('⚠️ Puppeteer no pudo iniciar Chrome:', err.message);
  }
})();

// 🔐 Autenticación de WhatsApp con almacenamiento local
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu'
    ]
  }
});

// 🔍 Muestra el QR de conexión (proporción correcta)
client.on('qr', qr => {
  console.log('📱 Escanea este código QR para conectar WhatsApp:');
  qrcode.generate(qr, { small: false });
});

// ✅ Listo para enviar y reenviar mensajes
client.on('ready', () => {
  console.log('✅ WhatsApp bot conectado y listo.');
});

// 🔁 Procesamiento de mensajes entrantes
client.on('message', async msg => {
  const chat = await msg.getChat();
  const from = chat.name || chat.id.user;

  for (const rule of config.rules) {
    if (from.includes(rule.origin)) {
      const regex = new RegExp(rule.pattern, rule.flags);
      if (regex.test(msg.body)) {
        const targetChat = await findChat(rule.target);
        if (targetChat) {
          await targetChat.sendMessage(msg.body);
          console.log(`➡️ Mensaje reenviado de [${from}] a [${rule.target}]`);
        } else {
          console.log(`⚠️ No se encontró el chat destino: ${rule.target}`);
        }
      }
    }
  }
});

// 🔍 Busca un chat destino por nombre o ID
async function findChat(targetName) {
  const chats = await client.getChats();
  return chats.find(c =>
    c.name?.toLowerCase().includes(targetName.toLowerCase())
  );
}

client.initialize();

