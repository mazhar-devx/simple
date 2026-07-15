const http = require("http");
const fs   = require("fs");
const path = require("path");

const BASE_PORT = parseInt(process.env.PORT || "3000", 10);
const QR_PATH   = path.join(process.cwd(), "user_files", "login-qr.png");
const LOCK_PATH = path.join(process.cwd(), "user_files", "bot.lock");
const DASHBOARD_MANAGED = process.env.DASHBOARD_MANAGED === "1";

let _sock = null;
let _aiEnabled = true;
let _boundPort = null;

let _eventQueue = [];
const MAX_EVENTS = 500;

function pushEvent(type, data) {
    _eventQueue.push({
        id: Date.now() + "_" + Math.random().toString(36).substr(2, 5),
        type,
        timestamp: Date.now(),
        data
    });
    if (_eventQueue.length > MAX_EVENTS) {
        _eventQueue.shift();
    }
}

function isPidAlive(pid) {
    if (!pid || pid === process.pid) return false;
    try {
        process.kill(pid, 0);
        return true;
    } catch (_) {
        return false;
    }
}

function acquireInstanceLock() {
    const dir = path.dirname(LOCK_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    if (fs.existsSync(LOCK_PATH)) {
        const raw = fs.readFileSync(LOCK_PATH, "utf8").trim();
        const oldPid = parseInt(raw.split("\n")[0], 10);
        if (oldPid && oldPid !== process.pid && isPidAlive(oldPid)) {
            console.error(`\n? [SYSTEM] Another bot is ALREADY running (PID ${oldPid}).`);
            console.error("   ? Do NOT run 'node index.js' manually — use dashboard ? Start ONLY");
            console.error("   ? Or click ? Stop in dashboard, then ? Start again");
            console.error("   ? Only ONE bot process allowed at a time.\n");
            process.exit(1);
        }
        try { fs.unlinkSync(LOCK_PATH); } catch (_) { }
    }
    fs.writeFileSync(LOCK_PATH, `${process.pid}\n${Date.now()}\n${BASE_PORT}`);
}

function releaseInstanceLock() {
    try {
        if (fs.existsSync(LOCK_PATH)) {
            const raw = fs.readFileSync(LOCK_PATH, "utf8").trim();
            const pid = parseInt(raw.split("\n")[0], 10);
            if (pid === process.pid) fs.unlinkSync(LOCK_PATH);
        }
    } catch (_) { }
}

acquireInstanceLock();
process.on("exit", releaseInstanceLock);
process.on("SIGINT",  () => { releaseInstanceLock(); });
process.on("SIGTERM", () => { releaseInstanceLock(); });

function setSocket(sock) {
    _sock = sock;
}

function setAiEnabled(enabled) {
    _aiEnabled = !!enabled;
    console.log(`\uD83E\uDD16 [AI] Auto-reply ${_aiEnabled ? 'ENABLED' : 'DISABLED'} by admin.`);
}

function getAiEnabled() {
    return _aiEnabled;
}

function parseBody(req) {
    return new Promise((resolve, reject) => {
        let data = "";
        req.on("data", chunk => data += chunk);
        req.on("end", () => {
            try   { resolve(JSON.parse(data)); }
            catch { reject(new Error("Invalid JSON")); }
        });
        req.on("error", reject);
    });
}

function startWebServer(port = BASE_PORT) {
    const server = http.createServer(async (req, res) => {

        res.setHeader("Access-Control-Allow-Origin",  "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");

        if (req.method === "OPTIONS") {
            res.writeHead(204); res.end(); return;
        }

        if (req.method === "POST" && req.url === "/send") {
            try {
                const body = await parseBody(req);
                const { jid, text, type, media, mimetype } = body;

                if (!_sock) {
                    res.writeHead(503, { "Content-Type": "application/json" });
                    return res.end(JSON.stringify({ error: "Bot not connected yet" }));
                }
                if (!jid) {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    return res.end(JSON.stringify({ error: "Missing jid" }));
                }

                const msgType = (type || "text").toLowerCase();

                if (msgType === "text" || !media) {
                    await _sock.sendMessage(jid, { text: text || "" });
                    console.log(`?? [DASHBOARD] Text sent to ${jid}`);
                }
                else if (msgType === "image") {
                    const buf = Buffer.from(media, "base64");
                    await _sock.sendMessage(jid, {
                        image: buf,
                        mimetype: mimetype || "image/jpeg",
                        caption: text || ""
                    });
                    console.log(`?? [DASHBOARD] Image sent to ${jid}`);
                }
                else if (msgType === "gif") {
                    const buf = Buffer.from(media, "base64");
                    await _sock.sendMessage(jid, {
                        video: buf,
                        mimetype: "video/mp4",
                        gifPlayback: true,
                        caption: text || ""
                    });
                    console.log(`?? [DASHBOARD] GIF sent to ${jid}`);
                }
                else if (msgType === "video") {
                    const buf = Buffer.from(media, "base64");
                    await _sock.sendMessage(jid, {
                        video: buf,
                        mimetype: mimetype || "video/mp4",
                        caption: text || ""
                    });
                    console.log(`?? [DASHBOARD] Video sent to ${jid}`);
                }
                else if (msgType === "audio") {
                    const buf = Buffer.from(media, "base64");
                    await _sock.sendMessage(jid, {
                        audio: buf,
                        mimetype: mimetype || "audio/ogg; codecs=opus",
                        ptt: true
                    });
                    console.log(`?? [DASHBOARD] Audio sent to ${jid}`);
                }
                else if (msgType === "doc" || msgType === "document") {
                    const buf  = Buffer.from(media, "base64");
                    const fname = text || "document";
                    await _sock.sendMessage(jid, {
                        document: buf,
                        mimetype: mimetype || "application/octet-stream",
                        fileName: fname
                    });
                    console.log(`?? [DASHBOARD] Document sent to ${jid}`);
                }
                else {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    return res.end(JSON.stringify({ error: `Unknown type: ${msgType}` }));
                }

                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ success: true, type: msgType }));

            } catch (e) {
                console.error("? [SEND API]", e.message);
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: e.message }));
            }
            return;
        }

        if (req.url === "/status") {
            res.writeHead(200, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({
                ok: true,
                connected: !!_sock,
                port: _boundPort || port,
                pid: process.pid,
                aiEnabled: _aiEnabled
            }));
        }

        if (req.method === "POST" && req.url === "/ai-control") {
            try {
                const body = await parseBody(req);
                const { enabled } = body;
                setAiEnabled(!!enabled);
                res.writeHead(200, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ success: true, aiEnabled: _aiEnabled }));
            } catch (e) {
                res.writeHead(500, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: e.message }));
            }
        }

        if (req.method === "POST" && req.url === "/ai-reply") {
            try {
                const body = await parseBody(req);
                const { prompt, sender, pushName } = body;
                const { mazharAiReply } = require("./ai");
                const reply = await mazharAiReply(prompt || "", sender || "dashboard", pushName || "Mazhar");
                res.writeHead(200, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ success: true, reply }));
            } catch (e) {
                res.writeHead(500, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: e.message }));
            }
        }

        if (req.method === "GET" && req.url.startsWith("/poll-updates")) {
            try {
                const urlObj = new URL(req.url, `http://${req.headers.host}`);
                const since = parseInt(urlObj.searchParams.get("since") || "0", 10);
                const filtered = _eventQueue.filter(e => e.timestamp > since);
                res.writeHead(200, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ success: true, events: filtered }));
            } catch (e) {
                res.writeHead(500, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: e.message }));
            }
        }

        if (req.method === "POST" && req.url === "/presence-sub") {
            try {
                const body = await parseBody(req);
                const { jid } = body;
                if (!_sock) {
                    res.writeHead(503, { "Content-Type": "application/json" });
                    return res.end(JSON.stringify({ error: "Bot not connected" }));
                }
                if (!jid) {
                    res.writeHead(400, { "Content-Type": "application/json" });
                    return res.end(JSON.stringify({ error: "Missing jid" }));
                }
                await _sock.presenceSubscribe(jid);
                res.writeHead(200, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ success: true }));
            } catch (e) {
                res.writeHead(500, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: e.message }));
            }
        }

        if (req.url === "/qr") {
            if (fs.existsSync(QR_PATH)) {
                res.writeHead(200, { "Content-Type": "image/png" });
                return fs.createReadStream(QR_PATH).pipe(res);
            } else {
                res.writeHead(404, { "Content-Type": "text/plain" });
                return res.end("QR not generated yet.");
            }
        }

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`<!DOCTYPE html><html><head><title>Mazhar DevX Bot</title></head>
<body style="background:#06090f;color:#c8d8ef;font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;">
<h1 style="color:#00f5c4;">?? Mazhar DevX Bot</h1>
<p>Status: <b style="color:${_sock ? '#00f5c4' : '#f43f5e'}">${_sock ? '?? Connected' : '?? Waiting...'}</b></p>
<div style="display:flex;gap:12px;margin-top:16px;">
<a href="/qr" style="color:#3b82f6;border:1px solid #3b82f6;padding:10px 20px;border-radius:8px;text-decoration:none;">View QR Code</a>
<a href="/status" style="color:#10b981;border:1px solid #10b981;padding:10px 20px;border-radius:8px;text-decoration:none;">API Status</a>
</div>
<p style="color:#3b5270;margin-top:20px;font-size:12px;">Dashboard v4.0 | POST /send supports text, image, video, audio, gif, document</p>
</body></html>`);
    });

    server.on("error", (err) => {
        if (err.code === "EADDRINUSE") {
            if (DASHBOARD_MANAGED) {
                console.error(`\n? [WEB] Port ${port} is already in use.`);
                console.error("   ? Dashboard will kill old processes — click ? Start again.");
                console.error("   ? Do NOT run 'node index.js' in a separate terminal.\n");
                releaseInstanceLock();
                setTimeout(() => process.exit(3), 500);
                return;
            }
            const next = port + 1;
            if (next <= BASE_PORT + 10) {
                console.warn(`?? [WEB] Port ${port} in use ? trying ${next}...`);
                server.close();
                startWebServer(next);
            } else {
                console.error(`? [WEB] No free port (${BASE_PORT}–${BASE_PORT + 10}). Web disabled.`);
            }
        } else {
            console.error("? [WEB] Server error:", err.message);
        }
    });

    server.listen(port, "0.0.0.0", () => {
        _boundPort = port;
        console.log(`?? [SYSTEM] Web Server running at port ${port}`);
        console.log(`?? [SYSTEM] QR Page: http://localhost:${port}/qr`);
        console.log(`?? [SYSTEM] Send API: POST http://localhost:${port}/send`);
        console.log(`?? [SYSTEM] Supports: text, image, video, audio, gif, document`);
        console.log(`?? [SYSTEM] Single-instance lock active (PID ${process.pid})`);
    });
}

module.exports = { startWebServer, setSocket, setAiEnabled, getAiEnabled, releaseInstanceLock, pushEvent };
