const pdf = require('pdf-parse');

async function extractTextFromPdf(buffer) {
    try {
        const data = await pdf(buffer);
        return data.text
            .replace(/\n\s*\n/g, '\n')
            .replace(/\s+/g, ' ')
            .trim();
    } catch (err) {
        console.error("? [PDF SERVICE] Error parsing PDF:", err.message);
        throw new Error("Failed to parse PDF document.");
    }
}

module.exports = { extractTextFromPdf };
