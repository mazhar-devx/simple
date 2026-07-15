// Native fetch used (Node 22+)

async function deepSearch(query, type = "web") {
    const safeQuery = encodeURIComponent(query);
    const searchUrl = `https://html.duckduckgo.com/html/?q=${safeQuery}${type === 'video' ? '+site:youtube.com' : ''}`;

    console.log(`?? [SEARCH] Deep searching (${type}): ${query}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
        const response = await fetch(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            signal: controller.signal
        });

        clearTimeout(timeout);
        if (!response.ok) throw new Error(`Search failed: ${response.status}`);

        const html = await response.text();

        const results = [];
        const linkRegex = /<a class="result__a" href="(.*?)">(.*?)<\/a>/g;
        let match;

        while ((match = linkRegex.exec(html)) !== null && results.length < 5) {
            let url = match[1];
            if (url.startsWith('//duckduckgo.com/l/?kh=-1&uddg=')) {
                url = decodeURIComponent(url.split('uddg=')[1].split('&')[0]);
            }
            const title = match[2].replace(/<[^>]*>/g, '');
            results.push({ title, url });
        }

        return results;
    } catch (err) {
        console.error("? [SEARCH SERVICE] Error:", err.message);
        return [];
    }
}

async function searchWebImages(query, count = 1) {
    const safeQuery = encodeURIComponent(query);
    const uas = [
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ];
    const ua = uas[Math.floor(Math.random() * uas.length)];

    console.log(`?? [GOOGLE HUNTER v14.1-SHIELD] Hunting real web for: ${query}`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
        const res = await fetch(`https://www.google.com/search?q=${safeQuery}&tbm=isch&sclient=img`, {
            headers: { 'User-Agent': ua, 'Referer': 'https://www.google.com/' },
            signal: controller.signal
        });
        const html = await res.text();

        const results = [];
        const regex = /(https?:\/\/[^"'\s]+\.(?:jpg|jpeg|png|webp|gif|bmp|svg))(?:\?[^"'\s]*)?/gi;
        let match;

        while ((match = regex.exec(html)) !== null && results.length < count * 5) {
            const url = match[1];
            if (url.includes("google") || url.includes("gstatic") || url.includes("encrypted") || url.includes("favicon") || url.includes("logo")) continue;
            results.push(url);
        }

        if (results.length > 0) {
            results.sort(() => 0.5 - Math.random());
            return results.slice(0, count);
        }

        console.warn("?? [HUNTER] Google result empty, trying DDG...");
        const initialRes = await fetch(`https://duckduckgo.com/?q=${safeQuery}&iax=images&ia=images`, {
            headers: { 'User-Agent': ua }
        });
        const initialHtml = await initialRes.text();
        const vqdMatch = initialHtml.match(/vqd=[\"'](.*?)[\"']/);

        if (vqdMatch) {
            const vqd = vqdMatch[1];
            const jsonUrl = `https://duckduckgo.com/i.js?q=${safeQuery}&o=json&vqd=${vqd}&f=,,,,,&p=1`;
            const apiRes = await fetch(jsonUrl, { headers: { 'User-Agent': ua } });
            if (apiRes.ok) {
                const data = await apiRes.json();
                if (data.results && data.results.length > 0) {
                    const ddgResults = data.results.map(r => r.image);
                    ddgResults.sort(() => 0.5 - Math.random());
                    return ddgResults.slice(0, count);
                }
            }
        }

        throw new Error("All discovery strategies failed");
    } catch (err) {
        console.error("? [HUNTER] Discovery Fail:", err.message);
        const lock = Math.floor(Math.random() * 1000000);
        return [`https://loremflickr.com/1280/720/${safeQuery.replace(/%20/g, "_")}?lock=${lock}`];
    }
}

async function performResearch(query) {
    const [webResults, videoResults, imageResults] = await Promise.all([
        deepSearch(query, "web"),
        deepSearch(query, "video"),
        searchWebImages(query, 3)
    ]);

    return {
        query,
        web: webResults,
        video: videoResults,
        images: imageResults
    };
}

const yts = require("yt-search");
const play = require("play-dl");

async function searchAudio(query) {
    console.log(`?? [AUDIO ENGINE v21] Deep Search: ${query}`);
    try {
        const search = await yts(query);
        const video = search.videos[0];
        if (!video) throw new Error("No video found.");

        const vidUrl = video.url;
        console.log(`?? [AUDIO] Found target: ${video.title}. Hunting download link...`);

        try {
            console.log("?? Trying API 0: Maher-Zubair...");
            const res = await fetch(`https://api.maher-zubair.tech/download/ytmp3?url=${vidUrl}`);
            if (res.ok) {
                const data = await res.json();
                if (data.status === 200 && data.result?.link) {
                    const bufRes = await fetch(data.result.link);
                    if (bufRes.ok) return Buffer.from(await bufRes.arrayBuffer());
                }
            }
        } catch (e) { }

        try {
            console.log("?? Trying API 1: BK9...");
            const res = await fetch(`https://bk9.fun/download/youtube?url=${vidUrl}`);
            if (res.ok) {
                const data = await res.json();
                if (data.status && data.BK9?.download?.url) {
                    const bufRes = await fetch(data.BK9.download.url);
                    if (bufRes.ok) return Buffer.from(await bufRes.arrayBuffer());
                }
            }
        } catch (e) { }

        try {
            console.log("?? Trying API 1: Ryzendesu...");
            const res = await fetch(`https://api.ryzendesu.vip/api/downloader/ytmp3?url=${vidUrl}`);
            if (res.ok) {
                const data = await res.json();
                if (data.url) {
                    const bufRes = await fetch(data.url);
                    if (bufRes.ok) return Buffer.from(await bufRes.arrayBuffer());
                }
            }
        } catch (e) { }

        try {
            console.log("?? Trying API 2: Siputzx...");
            const res = await fetch(`https://api.siputzx.my.id/api/d/ytmp3?url=${vidUrl}`);
            if (res.ok) {
                const data = await res.json();
                if (data.data?.dl) {
                    const bufRes = await fetch(data.data.dl);
                    if (bufRes.ok) return Buffer.from(await bufRes.arrayBuffer());
                }
            }
        } catch (e) { }

        try {
            console.log("?? Trying API 3: Agatz...");
            const res = await fetch(`https://api.agatz.xyz/api/ytmp3?url=${vidUrl}`);
            if (res.ok) {
                const data = await res.json();
                if (data.data?.dl) {
                    const bufRes = await fetch(data.data.dl);
                    if (bufRes.ok) return Buffer.from(await bufRes.arrayBuffer());
                }
            }
        } catch (e) { }

        console.log("?? Trying LAST RESORT: Cobalt...");
        try {
            const cobaltRes = await fetch("https://api.cobalt.tools/", {
                method: "POST",
                headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: vidUrl, isAudioOnly: true })
            });
            if (cobaltRes.ok) {
                const cobaltData = await cobaltRes.json();
                if (cobaltData.url) {
                    const bufRes = await fetch(cobaltData.url);
                    if (bufRes.ok) return Buffer.from(await bufRes.arrayBuffer());
                }
            }
        } catch (e) { }

        throw new Error("All APIs failed to extract audio.");
    } catch (err) {
        console.error("? [AUDIO ENGINE] Failed definitively:", err.message);
        throw err;
    }
}

async function searchVideo(query) {
    console.log(`?? [VIDEO ENGINE v21] Deep Search: ${query}`);
    try {
        const search = await yts(query);
        const video = search.videos[0];
        if (!video) throw new Error("No video found.");

        const vidUrl = video.url;
        console.log(`?? [VIDEO] Found target: ${video.title}. Hunting download link...`);

        try {
            console.log("?? Trying API 0: BK9...");
            const res = await fetch(`https://bk9.fun/download/youtube?url=${vidUrl}`);
            if (res.ok) {
                const data = await res.json();
                if (data.status && data.BK9?.download?.url) {
                    const bufRes = await fetch(data.BK9.download.url);
                    if (bufRes.ok) return Buffer.from(await bufRes.arrayBuffer());
                }
            }
        } catch (e) { }

        try {
            console.log("?? Trying API 0: Maher-Zubair...");
            const res = await fetch(`https://api.maher-zubair.tech/download/ytmp4?url=${vidUrl}`);
            if (res.ok) {
                const data = await res.json();
                if (data.status === 200 && data.result?.link) {
                    const bufRes = await fetch(data.result.link);
                    if (bufRes.ok) return Buffer.from(await bufRes.arrayBuffer());
                }
            }
        } catch (e) { }

        try {
            console.log("?? Trying API 1: BK9...");
            const res = await fetch(`https://bk9.fun/download/youtube?url=${vidUrl}`);
            if (res.ok) {
                const data = await res.json();
                if (data.status && data.BK9?.download?.url) {
                    const bufRes = await fetch(data.BK9.download.url);
                    if (bufRes.ok) return Buffer.from(await bufRes.arrayBuffer());
                }
            }
        } catch (e) { }

        try {
            console.log("?? Trying API 2: Siputzx...");
            const res = await fetch(`https://api.siputzx.my.id/api/d/ytmp4?url=${vidUrl}`);
            if (res.ok) {
                const data = await res.json();
                if (data.data?.dl) {
                    const bufRes = await fetch(data.data.dl);
                    if (bufRes.ok) return Buffer.from(await bufRes.arrayBuffer());
                }
            }
        } catch (e) { }

        try {
            console.log("?? Trying API 3: Agatz...");
            const res = await fetch(`https://api.agatz.xyz/api/ytmp4?url=${vidUrl}`);
            if (res.ok) {
                const data = await res.json();
                if (data.data?.dl) {
                    const bufRes = await fetch(data.data.dl);
                    if (bufRes.ok) return Buffer.from(await bufRes.arrayBuffer());
                }
            }
        } catch (e) { }

        console.log("?? Trying LAST RESORT: Cobalt...");
        try {
            const cobaltRes = await fetch("https://api.cobalt.tools/", {
                method: "POST",
                headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: vidUrl })
            });
            if (cobaltRes.ok) {
                const cobaltData = await cobaltRes.json();
                if (cobaltData.url) {
                    const bufRes = await fetch(cobaltData.url);
                    if (bufRes.ok) return Buffer.from(await bufRes.arrayBuffer());
                }
            }
        } catch (e) { }

        throw new Error("All APIs failed to extract video.");
    } catch (err) {
        console.error("? [VIDEO ENGINE] Failed definitively:", err.message);
        throw err;
    }
}

module.exports = { deepSearch, performResearch, searchWebImages, searchAudio, searchVideo };