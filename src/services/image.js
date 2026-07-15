const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

async function searchImages(query, count = 1) {
    const safeQuery = (query || "random").replace(/[^\w\s]/gi, "").trim();
    console.log(`?? [SYSTEM] Searching for ${count} images: ${safeQuery}`);

    try {
        const results = [];
        const safeCount = Math.min(Math.max(1, count), 5);

        for (let i = 0; i < safeCount; i++) {
            const lock = Math.floor(Math.random() * 1000000);
            const url = `https://loremflickr.com/1280/720/${encodeURIComponent(safeQuery)}?lock=${lock}`;
            results.push(url);
        }
        return results;
    } catch (err) {
        console.error("? [IMAGE SERVICE] Error during URL generation:", err.message);
        return [];
    }
}

module.exports = { searchImages };
