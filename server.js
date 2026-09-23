const express = require("express");
const cors = require("cors");
const fs = require("fs");
const pino = require("pino");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");

const app = express();
const PORT = process.env.PORT || 3000;
const AUTH_DIR = process.env.AUTH_DIR || "./auth";
const CONFIG_FILE = process.env.CONFIG_FILE || "./config.json";
const API_KEY = process.env.API_KEY || ""; // optionnel mais recommandé

app.use(cors());
app.use(express.json());

/* ---------- petite protection : clé API (si définie) ---------- */
function guard(req, res, next) {
  if (!API_KEY) return next();
  if (req.headers["x-api-key"] === API_KEY) return next();
  return res.status(401).json({ success: false, message: "Unauthorized" });
}

/* ---------- config persistante ---------- */
let config = { channelJid: null, channelName: null, emoji: "❤️", enabled: false };
try {
  config = { ...config, ...JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")) };
} catch (_) {}
const saveConfig = () =>
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));

/* ---------- WhatsApp ---------- */
let sock = null;
let connected = false;
let starting = false;
const reacted = new Set(); // évite de réagir deux fois au même post
const recentLog = [];
const log = (m) => {
  console.log(m);
  recentLog.unshift(`${new Date().toISOString()} ${m}`);
  recentLog.length = Math.min(recentLog.length, 30);
};

async function startSock() {
  if (starting) return;
  starting = true;
  try {
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      auth: state,
      logger: pino({ level: "silent" }),
      printQRInTerminal: false,
      browser: ["Channel Reaction", "Chrome", "1.0.0"]
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
      if (connection === "open") {
        connected = true;
        log("WhatsApp connected");
        if (config.channelJid) {
          try {
            await sock.subscribeNewsletterUpdates(config.channelJid);
          } catch (e) {
            log("subscribe error: " + e.message);
          }
        }
      }
      if (connection === "close") {
        connected = false;
        const code = lastDisconnect?.error?.output?.statusCode;
        log("WhatsApp closed, code " + code);
        starting = false;
        if (code === DisconnectReason.loggedOut) {
          fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        }
        setTimeout(startSock, 3000);
      }
    });

    // Nouveaux posts du canal -> une seule réaction
    sock.ev.on("messages.upsert", async ({ messages }) => {
      if (!config.enabled || !config.channelJid) return;
      for (const m of messages) {
        try {
          if (m.key?.remoteJid !== config.channelJid) continue;
          const serverId = m.key.server_id || m.newsletter_server_id;
          if (!serverId || reacted.has(serverId)) continue;
          reacted.add(serverId);
          await sock.newsletterReactMessage(
            config.channelJid,
            String(serverId),
            config.emoji
          );
          log(`Reacted ${config.emoji} to post ${serverId}`);
        } catch (e) {
          log("react error: " + e.message);
        }
      }
    });
  } finally {
    starting = false;
  }
}
startSock().catch((e) => log("start error: " + e.message));

/* ---------- API ---------- */
app.get("/", (req, res) =>
  res.json({ success: true, message: "Channel Reaction Backend is running 🚀" })
);

app.get("/api/status", (req, res) =>
  res.json({
    success: true,
    status: "online",
    whatsappConnected: connected,
    paired: !!sock?.authState?.creds?.registered,
    config,
    log: recentLog.slice(0, 10)
  })
);

// 1) Lier le numéro : renvoie un code à saisir dans WhatsApp
//    (Appareils connectés > Connecter avec un numéro de téléphone)
app.post("/api/pair", guard, async (req, res) => {
  try {
    const phone = String(req.body.phone || "").replace(/\D/g, "");
    if (phone.length < 8)
      return res.status(400).json({ success: false, message: "Numéro invalide (format international, sans +)" });
    if (sock?.authState?.creds?.registered)
      return res.json({ success: true, message: "Déjà lié" });
    const code = await sock.requestPairingCode(phone);
    return res.json({ success: true, code });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

// 2) Enregistrer le canal
app.post("/api/channel", guard, async (req, res) => {
  const { channelLink } = req.body;
  if (!channelLink)
    return res.status(400).json({ success: false, message: "Channel link is required" });
  if (!channelLink.startsWith("https://whatsapp.com/channel/"))
    return res.status(400).json({ success: false, message: "Invalid WhatsApp Channel link" });
  if (!connected)
    return res.status(503).json({ success: false, message: "WhatsApp pas encore connecté : lie ton numéro d'abord" });

  try {
    const code = channelLink.split("/channel/")[1].split(/[/?#]/)[0];
    const meta = await sock.newsletterMetadata("invite", code);
    config.channelJid = meta.id;
    config.channelName = meta.name || meta.thread_metadata?.name?.text || null;
    saveConfig();
    await sock.subscribeNewsletterUpdates(config.channelJid).catch(() => {});
    return res.json({ success: true, message: "Channel link received", channelName: config.channelName, channelLink });
  } catch (e) {
    return res.status(500).json({ success: false, message: "Canal introuvable : " + e.message });
  }
});

// 3) Choisir l'emoji + activer / désactiver
app.post("/api/reactions", guard, (req, res) => {
  const { emoji, enabled } = req.body;
  if (!config.channelJid)
    return res.status(400).json({ success: false, message: "Enregistre le canal d'abord" });
  if (emoji) config.emoji = String(emoji);
  config.enabled = enabled !== false;
  saveConfig();
  log(`Auto-reaction ${config.enabled ? "ON" : "OFF"} (${config.emoji})`);
  return res.json({ success: true, message: "Auto-reaction " + (config.enabled ? "activée" : "désactivée"), config });
});

app.listen(PORT, () => console.log(`Backend running on port ${PORT}`));
