/**
 * BOT DE REENVÍO AUTOMÁTICO DE WHATSAPP
 * Compatible con Render (modo headless)
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const qrcode = require("qrcode-terminal");
const { Client, LocalAuth } = require("whatsapp-web.js");
const puppeteer = require("puppeteer");

// === LIMPIEZA AUTOMÁTICA DE CACHÉ ===
const puppeteerCache = path.join(os.homedir(), ".cache", "puppeteer");
try {
  if (fs.existsSync(puppeteerCache)) {
    console.log("🧹 Borrando caché de Puppeteer...");
    fs.rmSync(puppeteerCache, { recursive: true, force: true });
  }
} catch (err) {
  console.warn("⚠️ No se pudo limpiar el caché:", err.message);
}

// === CARGA CONFIGURACIÓN ===
const CONFIG_PATH = path.join(__dirname, "config.json");
if (!fs.existsSync(CONFIG_PATH)) {
  console.error("❌ No se encontró config.json");
  process.exit(1);
}
const config = JSON.parse(fs.readFileSync(CONFIG_PATH));

// === OBTENER CHROME ===
async function getChromePath() {
  try {
    const browserFetcher = puppeteer.createBrowserFetcher();
    const localRevisions = await browserFetcher.localRevisions();
    if (localRevisions.length > 0) {
      const revisionInfo = await browserFetcher.revisionInfo(localRevisions[0]);
      console.log("✅ Chrome detectado:", revisionInfo.executablePath);
      return revisionInfo.executablePath;
    }
  } catch (err) {
    console.warn("⚠️ No se pudo obtener Chrome de caché:", err.message);
  }
  return puppeteer.executablePath();
}

// === FUNCIÓN PRINCIPAL ===
(async () => {
  const CHROME_PATH = await getChromePath();

  const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      executablePath: CHROME_PATH,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    },
  });

  client.on("qr", (qr) => {
    console.log("📱 Escanea este código QR para iniciar sesión:");
    qrcode.generate(qr, { small: true });
  });

  client.on("ready", () => {
    console.log("✅ Cliente listo y conectado.");
  });

  client.on("message", async (msg) => {
    try {
      const chat = await msg.getChat();
      const text = msg.body;

      const applicableRules = config.rules.filter(
        (r) => r.origin.toLowerCase() === chat.name.toLowerCase()
      );

      for (const rule of applicableRules) {
        const regex = new RegExp(rule.pattern, rule.flags || "i");
        if (regex.test(text)) {
          console.log(`📤 Coincidencia: reenviando a ${rule.target}`);
          const chats = await client.getChats();
          const targetChat = chats.find(
            (c) => c.name.toLowerCase() === rule.target.toLowerCase()
          );
          if (targetChat) {
            await targetChat.sendMessage(msg.body);
            console.log("✅ Mensaje reenviado con éxito.");
          } else {
            console.log(`⚠️ Grupo destino no encontrado: ${rule.target}`);
          }
        }
      }
    } catch (err) {
      console.error("❌ Error procesando mensaje:", err.message);
    }
  });

  await client.initialize();
})();
