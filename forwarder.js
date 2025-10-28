/**
 * BOT DE REENVÍO AUTOMÁTICO DE WHATSAPP
 * Compatible con Render y Puppeteer Headless Chrome
 * Autor: CARMONVE + GPT5 Asistente
 */

const fs = require("fs");
const path = require("path");
const qrcode = require("qrcode-terminal");
const { Client, LocalAuth } = require("whatsapp-web.js");
const puppeteer = require("puppeteer");

// === LIMPIEZA AUTOMÁTICA DE CACHÉ ===
const os = require("os");
const puppeteerCache = path.join(os.homedir(), ".cache", "puppeteer");
try {
  if (fs.existsSync(puppeteerCache)) {
    console.log("🧹 Borrando caché de Puppeteer...");
    fs.rmSync(puppeteerCache, { recursive: true, force: true });
  }
} catch (err) {
  console.warn("⚠️ No se pudo limpiar el caché:", err.message);
}

// === CONFIGURACIÓN DE CHROME PARA RENDER ===
const CHROME_PATH =
  "/opt/render/.cache/puppeteer/chrome/linux-141.0.7390.122/chrome-linux64/chrome";
console.log("🚀 Using Chrome path:", CHROME_PATH);

// === CARGA DE CONFIGURACIÓN ===
const CONFIG_PATH = path.join(__dirname, "config.json");
const RULES_PATH = path.join(__dirname, "processed.json");

if (!fs.existsSync(CONFIG_PATH)) {
  console.error("❌ No se encontró config.json");
  process.exit(1);
}
if (!fs.existsSync(RULES_PATH)) {
  console.error("❌ No se encontró processed.json");
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(CONFIG_PATH));
const rules = JSON.parse(fs.readFileSync(RULES_PATH));

// === PREPARA EXPRESIONES REGULARES DE REGLAS ===
const RULES = rules.map((r) => ({
  origin: r.Grupo_Origen,
  target: r.Grupo_Destino,
  regexes: [
    new RegExp(r.Restriccion_1.replace(/\*/g, ".*"), "i"),
    new RegExp(r.Restriccion_2.replace(/\*/g, ".*"), "i"),
    new RegExp(r.Restriccion_3.replace(/\*/g, ".*"), "i"),
  ],
}));

// === INICIALIZA EL CLIENTE DE WHATSAPP ===
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    executablePath: CHROME_PATH,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});

// === EVENTOS DEL CLIENTE ===
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

    // Verifica si el mensaje proviene de un grupo relevante
    const ruleSet = RULES.filter(
      (r) => r.origin.toLowerCase() === chat.name.toLowerCase()
    );

    if (ruleSet.length === 0) return;

    for (const rule of ruleSet) {
      const text = msg.body.replace(/\*/g, ""); // Limpia negritas
      const allMatch = rule.regexes.every((rx) => rx.test(text));

      if (allMatch) {
        console.log(
          `📤 Reenviando mensaje del grupo "${chat.name}" a "${rule.target}"`
        );

        const chats = await client.getChats();
        const targetChat = chats.find(
          (c) => c.name.toLowerCase() === rule.target.toLowerCase()
        );

        if (targetChat) {
          await targetChat.sendMessage(msg.body);
          console.log("✅ Mensaje reenviado con éxito.");
        } else {
          console.log(`⚠️ No se encontró el grupo destino: ${rule.target}`);
        }
      }
    }
  } catch (err) {
    console.error("❌ Error procesando mensaje:", err.message);
  }
});

client.initialize();
