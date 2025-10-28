/**
 * forwarder.js (adaptado)
 * Node 18+ / npm install puppeteer
 *
 * Este script observa mensajes en los chats configurados (config.json) y reenvía
 * el mensaje completo al chat destino si todas las restricciones (regex) coinciden.
 *
 * ARCHIVOS:
 * - config.json  : reglas generadas a partir del Excel (LISTA.xlsx)
 * - processed.json: historial simple de mensajes procesados para evitar duplicados
 *
 * Uso gratis: instalar Node.js (gratuito) y ejecutar `npm install puppeteer` (descarga Chromium).
 *
 * Advertencia: automatizar WhatsApp Web puede violar TOS. Usar solo con cuentas que controlas.
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const CONFIG_FILE = path.join(__dirname, 'config.json');
const PROCESSED_FILE = path.join(__dirname, 'processed.json');

if (!fs.existsSync(CONFIG_FILE)) {
  console.error('No se encontró config.json en la misma carpeta que forwarder.js');
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
const processed = fs.existsSync(PROCESSED_FILE) ? JSON.parse(fs.readFileSync(PROCESSED_FILE, 'utf8')) : { hashes: [] };

const saveProcessed = () => fs.writeFileSync(PROCESSED_FILE, JSON.stringify(processed, null, 2));

const hashMsg = (chat, sender, timestamp, text) => {
  const s = `${chat}||${sender}||${timestamp}||${text}`;
  return Buffer.from(s).toString('base64');
};

// Normalize rules and index by origin
const RULES = (config.rules || []).map(r => ({ regex: new RegExp(r.pattern, r.flags || ''), target: r.target, includeMatchInForward: !!r.includeMatchInForward, origin: r.origin }));
const ORIGINS = Array.from(new Set(config.sourceChats || RULES.map(r=>r.origin))).filter(Boolean);

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--start-maximized'],
    defaultViewport: null
  });
  const page = await browser.newPage();
  page.setDefaultTimeout(config.whatsapp?.waitForSelectorsTimeoutMs || 30000);

  await page.goto('https://web.whatsapp.com');
  console.log('Abre WhatsApp Web y escanea el QR si es necesario. Esperando carga...');

  // Wait for a likely main selector
  const mainReadySelectors = [
    'div[role="grid"]',
    'div[data-testid="chat-list-search"]',
    'div[data-testid="side"]',
    'div[data-testid="conversation-panel-messages"]'
  ];
  let found = false;
  for (const sel of mainReadySelectors) {
    try { await page.waitForSelector(sel, { timeout: 15000 }); found = true; break; } catch(e) {}
  }
  if (!found) console.warn('No se encontró selector típico de WhatsApp Web. Puede que los selectores cambien.');

  async function openChatByName(name) {
    if (!name) return false;
    const xpathTitle = `//span[@title="${name}"]`;
    try {
      const direct = await page.$x(xpathTitle);
      if (direct.length) { await direct[0].click(); await page.waitForTimeout(600); return true; }
      // try search box
      const searchBox = await page.$('div[title="Buscar o empezar un chat"], div[data-testid="chat-list-search"]');
      if (searchBox) {
        await searchBox.click({ clickCount: 1 });
        await page.keyboard.down('Control');
        await page.keyboard.press('a');
        await page.keyboard.up('Control');
        await page.keyboard.press('Backspace');
        await page.keyboard.type(name, { delay: 50 });
        await page.waitForTimeout(800);
        const alt = await page.$x(xpathTitle);
        if (alt.length) { await alt[0].click(); await page.waitForTimeout(600); return true; }
      }
    } catch (e) {}
    console.warn(`No se pudo abrir chat con nombre exacto: "${name}"`);
    return false;
  }

  await page.exposeFunction('nodeOnNewMessage', async (payload) => {
    try {
      // payload: { chat, text, sender, time }
      const chat = payload.chat || 'unknown';
      const text = payload.text || '';
      const sender = payload.sender || 'unknown';
      const time = payload.time || new Date().toISOString();
      const h = hashMsg(chat, sender, time, text);

      if (!ORIGINS.includes(chat)) {
        if (config.debug) console.log('Mensaje en chat no monitorizado:', chat);
        return;
      }

      if (processed.hashes.includes(h)) {
        if (config.debug) console.log('Ya procesado:', h);
        return;
      }

      // Find rules that apply for this origin
      const applicable = RULES.filter(r => r.origin === chat || (Array.isArray(config.sourceChats) && config.sourceChats.includes(chat)));
      for (const rule of applicable) {
        const m = text.match(rule.regex);
        if (m) {
          console.log(`Regla encontrada para chat "${chat}" → reenviando a "${rule.target}"`);
          const ok = await openChatByName(rule.target);
          if (!ok) { console.error('No se pudo abrir chat destino:', rule.target); continue; }

          // Build forward text
          const forwardText = rule.includeMatchInForward && m.length>1 ? m.slice(1).join(' ') : (`[De: ${sender} | ${time} | Origen: ${chat}]\n${text}`);

          // Find input box
          const inputSelectors = [
            `div[contenteditable="true"][data-tab="${config.whatsapp?.inputDataTab || '10'}"]`,
            'div[contenteditable="true"][role="textbox"]',
            'div._2A8P4.copyable-text.selectable-text'
          ];
          let input = null;
          for (const s of inputSelectors) {
            try { input = await page.$(s); if (input) break; } catch(e){}
          }
          if (!input) { console.error('No se encontró la caja de texto. Ajusta selectores.'); continue; }

          await input.focus();
          // Use evaluation to set plain text in the active element
          await page.evaluate((txt) => {
            const el = document.activeElement;
            if (!el) return;
            // For whatsapp contenteditable, setting innerHTML/textContent and dispatching input
            el.innerHTML = '';
            el.textContent = txt;
            el.dispatchEvent(new InputEvent('input', { bubbles: true }));
          }, forwardText);
          await page.keyboard.press('Enter');
          console.log('Reenviado a', rule.target);

          processed.hashes.push(h);
          if (processed.hashes.length > 5000) processed.hashes.splice(0, 2000);
          saveProcessed();
          break;
        }
      }
    } catch (err) {
      console.error('Error en nodeOnNewMessage:', err);
    }
  });

  // Inject observer that extracts chat title + message text
  await page.evaluate(() => {
    function findConversationContainer() {
      return document.querySelector('div[data-testid="conversation-panel-messages"]') ||
             document.querySelector('div._1ays2') ||
             document.querySelector('div.copyable-area');
    }
    function getChatTitle() {
      try {
        // header span with title
        const h = document.querySelector('header') || document.querySelector('div._2UaNq');
        const titleSpan = h && (h.querySelector('span[title]') || h.querySelector('div[dir="auto"] span'));
        if (titleSpan) return titleSpan.getAttribute('title') || titleSpan.innerText || titleSpan.textContent;
        // fallback: page title (not reliable)
        if (document.title) return document.title.replace('WhatsApp','').trim();
        return null;
      } catch(e) { return null; }
    }

    const container = findConversationContainer() || document.body;
    const obs = new MutationObserver((mutations) => {
      for (const mut of mutations) {
        for (const n of mut.addedNodes) {
          try {
            const textSpan = n.querySelector && (n.querySelector('span.selectable-text') || n.querySelector('span[dir="ltr"]'));
            if (!textSpan) continue;
            const text = textSpan.innerText || textSpan.textContent || '';
            if (!text || text.trim().length===0) continue;

            // get sender/time from data-pre-plain-text if present on ancestor
            let sender = 'unknown', time = new Date().toISOString();
            const messageWrapper = n.closest('div.message-in, div.message-out, div._1wlJG') || n;
            if (messageWrapper) {
              const pre = messageWrapper.querySelector && (messageWrapper.querySelector('div[data-pre-plain-text]') || messageWrapper.querySelector('span[data-pre-plain-text]'));
              if (pre && pre.getAttribute) {
                const meta = pre.getAttribute('data-pre-plain-text');
                if (meta && meta.includes(']')) {
                  const idx = meta.indexOf(']');
                  time = meta.substring(1, idx);
                  sender = meta.substring(idx+1).trim().replace(':','');
                }
              }
            }
            const chat = getChatTitle() || 'unknown';
            window.nodeOnNewMessage({ chat, text, sender, time });
          } catch(e){}
        }
      }
    });
    obs.observe(container, { childList: true, subtree: true });
    console.log('Observer inyectado en', container===document.body ? 'body (fallback)' : 'contenedor de conversación');
  });

  console.log('Observador activo.');

  // open each origin chat once so observer sees messages when they arrive
  for (const ch of ORIGINS) {
    try { await openChatByName(ch); await page.waitForTimeout(600); } catch(e){}
  }

  process.on('SIGINT', async () => {
    console.log('\\nCerrando navegador y saliendo...');
    await browser.close();
    process.exit(0);
  });
})();
