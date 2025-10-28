/**
 * BOT DE REENVÍO AUTOMÁTICO DE WHATSAPP
 * Totalmente compatible con Render (headless, sin GUI)
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

// === DETECCIÓN AUTOMÁTICA DEL CHROME ===
async function getChromePath() {
  const renderPath = "/opt/render/.cache/puppeteer/chrome";
  try {
    const versions = fs.readdirSync(renderPath);
    if (versions.length > 0) {
      const chromePath = path.join(
        renderPath,
        versions[0],
        "chrome-linux64",
        "chrome"
      );
      console.log("✅ Chrome detectado:", chromePath);
      return chromePath;
    }
  } catch (e) {}

  // En local
  const local = puppeteer.executablePath();
  console.log("✅ Chrome local detectado:", local);
  return local;
}

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

// === PREPARAR REGLAS ===
const RULES = rules.map((r) => {
  try {
    return {
      origin: r.Grupo_Origen,
      target: r.Grupo_Destino,
      regexes: [
        new RegExp((r.Restriccion_1 || "").replace(/\*/g, ".*"), "i"),
        new RegExp((r.Restriccion_2 || "").replace(/\*/g, ".*"), "i"),
        new RegExp((r.Restriccion_3 || "").replace(/\*/g, ".*"), "i"),
      ],
    };
  } catch (err) {
    console.warn("⚠️ Error creando regla:", r, err.message);
    return null;
  }
}).filter(Boolean);

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
      const ruleSet = RULES.filter(
        (r) => r.origin.toLowerCase() === chat.name.toLowerCase()
      );
      if (ruleSet.length === 0) return;

      for (const rule of ruleSet) {
        const text = msg.body.replace(/\*/g, ""); // elimina negritas
        const allMatch = rule.regexes.every((rx) => rx.test(text));

        if (allMatch) {
          console.log(`📤 Reenviando mensaje de "${chat.name}" a "${rule.target}"`);
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

  await client.initialize();
})();
