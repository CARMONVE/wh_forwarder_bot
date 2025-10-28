const fs = require("fs");
const path = require("path");
const qrcode = require("qrcode-terminal");
const { Client, LocalAuth } = require("whatsapp-web.js");
const XLSX = require("xlsx");
const puppeteer = require("puppeteer");

// === CONFIGURACIÓN GENERAL ===
process.env.PUPPETEER_CACHE_DIR = "/opt/render/.cache/puppeteer";
const CONFIG_PATH = path.join(__dirname, "config.json");
const LISTA_PATH = path.join(__dirname, "LISTA.xlsx");

// === FUNCIONES AUXILIARES ===
async function getChromePath() {
  try {
    const browserFetcher = puppeteer.createBrowserFetcher();
    const revisionInfo = browserFetcher.revisionInfo(puppeteer.browserRevision);
    console.log("🚀 Using Chrome path:", revisionInfo.executablePath);
    return revisionInfo.executablePath;
  } catch (err) {
    console.warn(⚠️ No se pudo obtener Chrome de caché:", err.message);
    // Valor de respaldo por defecto en Render
    return "/opt/render/.cache/puppeteer/chrome/linux-127.0.6533.88/chrome-linux64/chrome";
  }
}

function loadExcelData() {
  const workbook = XLSX.readFile(LISTA_PATH);
  const sheetName = workbook.SheetNames[0];
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
}

function loadConfig() {
  if (fs.existsSync(CONFIG_PATH)) {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  }
  throw new Error("❌ No se encontró el archivo config.json");
}

// === PROCESO PRINCIPAL ===
(async () => {
  const chromePath = await getChromePath();
  const config = loadConfig();
  const lista = loadExcelData();

  const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
      executablePath: chromePath,
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    }
  });

  client.on("qr", qr => {
    console.log("📲 Escanea este código QR para conectar WhatsApp:");
    qrcode.generate(qr, { small: true });
  });

  client.on("ready", () => {
    console.log("✅ Bot conectado correctamente.");
  });

  client.on("message", async msg => {
    console.log("📩 Mensaje recibido de:", msg.from);
    const texto = msg.body.toLowerCase();

    // Ejemplo: buscar en la lista y responder
    const coincidencia = lista.find(row => texto.includes(row.Keyword?.toLowerCase()));
    if (coincidencia) {
      await msg.reply(`✅ Coincidencia encontrada:\n${JSON.stringify(coincidencia, null, 2)}`);
    } else {
      await msg.reply("⚙️ No encontré coincidencias en la lista.");
    }
  });

  client.initialize();
})();

