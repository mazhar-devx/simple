const {
    default: makeWASocket,
    useMultiFileAuthState,
    fetchLatestBaileysVersion,
    DisconnectReason,
    Browsers,
    makeCacheableSignalKeyStore,
} = require("@whiskeysockets/baileys");
const Pino = require("pino");
const qrcodeTerm = require("qrcode-terminal");
const QRCode = require("qrcode");
const path = require("path");
const fs = require("fs");

async function connectToWhatsApp(authPath = "auth") {
    const { state, saveCreds } = await useMultiFileAuthState(authPath);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, Pino({ level: "silent" })),
        },
        logger: Pino({ level: "silent" }),
        browser: Browsers.macOS("Desktop"),
        markOnlineOnConnect: false,
        syncFullHistory: false,
        keepAliveIntervalMs: 10_000,
        generateHighQualityLinkPreview: false,
        retryRequestDelayMs: 250,
        emitOwnEvents: false,
        connectTimeoutMs: 60_000,
        getMessage: async () => undefined,
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
        const { connection, qr } = update;

        if (qr) {
            console.log("\n?? [SYSTEM] NEW QR CODE DETECTED!");
            console.log("?? Terminal View:");
            qrcodeTerm.generate(qr, { small: true });

            try {
                const qrDir = path.join(process.cwd(), "user_files");
                if (!fs.existsSync(qrDir)) {
                    fs.mkdirSync(qrDir, { recursive: true });
                }
                const qrPath = path.join(qrDir, "login-qr.png");
                await QRCode.toFile(qrPath, qr, {
                    color: { dark: "#000000", light: "#ffffff" },
                    width: 500,
                });
                console.log("?? [SYSTEM] QR saved ? user_files/login-qr.png");
                console.log(`?? [SYSTEM] Browser QR: http://localhost:${process.env.PORT || 3000}/qr`);
            } catch (err) {
                console.error("? [SYSTEM] QR image failed:", err.message);
            }
        }

        if (connection === "open") {
            console.log("?? [SYSTEM] WhatsApp Bot is ONLINE and ready!");
        }

        if (connection === "close") {
            const statusCode =
                update.lastDisconnect?.error?.output?.statusCode ||
                update.lastDisconnect?.error?.statusCode;
            console.log("?? [SYSTEM] Connection closed. Reason ID:", statusCode);
        }
    });

    return sock;
}

module.exports = { connectToWhatsApp };