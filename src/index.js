require("dotenv").config();
const { connectToWhatsApp } = require("./lib/whatsapp");
const { handleMessage, handlePresence } = require("./handlers/message");
const { startWebServer, setSocket, setAiEnabled, getAiEnabled, pushEvent } = require("./services/web");

startWebServer();

let conflictCounter   = 0;
let reconnectTimer    = null;
let isReconnecting    = false;
let sock              = null;
let cleanupRequested  = false;

// ??? Stable reconnect with exponential backoff ????????????????????????????????
function scheduleReconnect(delay = 5000, reason = "") {
    if (isReconnecting) return;
    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }
    isReconnecting = true;
    console.log(`?? [SYSTEM] Reconnecting in ${Math.round(delay/1000)}s...${reason ? " Reason: " + reason : ""}`);
    reconnectTimer = setTimeout(() => {
        isReconnecting = false;
        startSystem();
    }, delay);
}

async function startSystem() {
    if (cleanupRequested) return;

    process.title = "Mazhar-DevX-Bot";
    console.log("?? [SYSTEM] Initializing Mazhar DevX Elite v2.0...");
    console.log(`?? [SYSTEM] Process ID: ${process.pid}`);
    if (process.env.DASHBOARD_MANAGED !== "1") {
        console.warn("?? [TIP] Run via dashboard: python dashboard.py ? ? Start");
        console.warn("   Manual 'node index.js' causes 440 conflicts with dashboard.");
    }

    // ?? Clean up previous socket ??
    if (sock) {
        console.log("?? [SYSTEM] Cleaning up previous socket...");
        try {
            // Remove the whatsapp.js internal listener FIRST before clearing ours
            sock.ev.removeAllListeners("connection.update");
            sock.ev.removeAllListeners("messages.upsert");
            sock.ev.removeAllListeners("presence.update");
            sock.ev.removeAllListeners("creds.update");
            if (sock.ws && sock.ws.readyState !== 3) {
                sock.ws.close();
            }
        } catch (e) { /* ignore */ }
        sock = null;
        setSocket(null);
        // Small delay after cleanup before reconnecting
        await new Promise(r => setTimeout(r, 1000));
    }

    try {
        sock = await connectToWhatsApp();

        // ?? CRITICAL: Remove whatsapp.js internal listener to prevent double-firing ??
        // whatsapp.js registers its own connection.update; we manage it here instead
        sock.ev.removeAllListeners("connection.update");

        // Our connection monitor
        sock.ev.on("connection.update", async (update) => {
            const { connection, lastDisconnect, qr } = update;

            // Restore QR code generation/save (previously skipped due to removeAllListeners)
            if (qr) {
                console.log("\n?? [SYSTEM] NEW QR CODE DETECTED!");
                console.log("?? Terminal View:");
                try {
                    const qrcodeTerm = require("qrcode-terminal");
                    qrcodeTerm.generate(qr, { small: true });
                } catch (_) {}

                try {
                    const QRCode = require("qrcode");
                    const path = require("path");
                    const fs = require("fs");
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
                // Only reset conflict counter if we had a clean connection (not 440 loop)
                isReconnecting  = false;
                if (reconnectTimer) {
                    clearTimeout(reconnectTimer);
                    reconnectTimer = null;
                }
                setSocket(sock);
                console.log("? [SYSTEM] All systems operational.");
                if (typeof pushEvent === "function") {
                    pushEvent("CONN_OK", {});
                }
                return;
            }

            if (connection === "close") {
                setSocket(null);
                const err        = lastDisconnect?.error;
                const statusCode = err?.output?.statusCode || err?.statusCode || 0;

                // ?? 401: Session expired / logged out ? NEVER retry ??
                if (statusCode === 401) {
                    console.log("? [SYSTEM] Logged out (401). Reset auth and rescan QR.");
                    console.log("   ? Click ?? Auth in dashboard ? ? Start ? scan QR");
                    if (typeof pushEvent === "function") {
                        pushEvent("LOGGED_OUT", {});
                    }
                    return;
                }

                // ?? 440: Connection Replaced ??
                // This happens when WhatsApp is open on your phone AND another
                // WhatsApp Web session (browser) is open at the same time.
                // OR when you have another bot process running.
                // Fix: The user must close WhatsApp Web in the browser.
                if (statusCode === 440) {
                    conflictCounter++;
                    console.warn(`\n?? [CONFLICT 440] Your WhatsApp session was replaced.`);
                    console.warn(`   Another bot OR WhatsApp Web browser tab is using this session.`);
                    console.warn(`   ? FIX 1: Close ALL 'node index.js' terminals — use dashboard ONLY`);
                    console.warn(`   ? FIX 2: Close WhatsApp Web in Chrome/Edge/Firefox`);
                    console.warn(`   ? FIX 3: Dashboard ? ? Stop ? ?? Port ? wait 10s ? ? Start\n`);
                    if (typeof pushEvent === "function") {
                        pushEvent("CONFLICT", {});
                    }

                    // Never reconnect on 440 — it makes the conflict worse
                    cleanupRequested = true;
                    if (reconnectTimer) {
                        clearTimeout(reconnectTimer);
                        reconnectTimer = null;
                    }
                    isReconnecting = false;
                    try {
                        if (sock) {
                            sock.ev.removeAllListeners();
                            if (sock.ws) sock.ws.close();
                        }
                    } catch (_) { }
                    sock = null;
                    setSocket(null);
                    try {
                        const { releaseInstanceLock } = require("./services/web");
                        if (typeof releaseInstanceLock === "function") releaseInstanceLock();
                    } catch (_) { }
                    console.error("?? [SYSTEM] Stopped due to 440 conflict. Fix the issue, then ? Start ONCE.");
                    setTimeout(() => process.exit(2), 2000);
                    return;
                }

                if (typeof pushEvent === "function") {
                    pushEvent("CONN_LOST", { statusCode });
                }

                // ?? All other codes: normal reconnect with backoff ??
                const delay = Math.min(5000 * Math.pow(2, Math.min(conflictCounter, 4)), 60000);
                scheduleReconnect(delay, `code ${statusCode}`);
            }
        });

        // ?? Message handler ??
        sock.ev.on("messages.upsert", async ({ messages, type }) => {
            if (type !== "notify") return;
            for (const msg of messages) {
                try {
                    await handleMessage(sock, msg);
                } catch (e) {
                    console.error("? [MSG_HANDLER]", e.message);
                }
            }
        });

        // ?? Presence handler ??
        sock.ev.on("presence.update", (update) => {
            try { handlePresence(update); } catch (e) { }
        });

    } catch (err) {
        console.error("? [SYSTEM] Boot failure:", err.message);
        scheduleReconnect(10000, "boot error");
    }
}

// ?? Graceful shutdown ??????????????????????????????????????????????????????????
function gracefulShutdown(signal) {
    console.log(`\n?? [SYSTEM] ${signal} received. Shutting down...`);
    cleanupRequested = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (sock) {
        try {
            sock.ev.removeAllListeners();
            if (sock.ws) sock.ws.close();
        } catch (e) { }
    }
    try {
        const web = require("./services/web");
        if (web.releaseInstanceLock) web.releaseInstanceLock();
    } catch (_) { }
    console.log("? [SYSTEM] Shutdown complete.");
    process.exit(0);
}

process.on("SIGINT",  () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("uncaughtException",  (err) => console.error("?? [UNCAUGHT]", err.message));
process.on("unhandledRejection", (r)   => console.error("?? [REJECTION]", r?.message || r));

startSystem();
