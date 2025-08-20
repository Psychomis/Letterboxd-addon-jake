const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const puppeteer = require('puppeteer-core');

const PORT = process.env.PORT || 3000;
const LETTERBOXD_USER = 'jake84';
const BASE_URL = `https://letterboxd.com/${LETTERBOXD_USER}/films/by/rated-date/`;
const CHROME_PATH = process.env.CHROME_PATH || '/usr/bin/chromium-browser';

// === CACHE SETUP ===
let cachedMovies = [];
let lastScrape = 0;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// === STREMIO MANIFEST ===
const manifest = {
    id: 'org.jake84.letterboxd',
    version: '1.0.0',
    name: `Letterboxd - ${LETTERBOXD_USER}`,
    description: `Movies watched by ${LETTERBOXD_USER} on Letterboxd with ratings`,
    resources: ['catalog', 'meta'],
    types: ['movie'],
    idPrefixes: ['letterboxd:'],
    catalogs: [
        {
            type: 'movie',
            id: 'letterboxd-rss',
            name: `Films of ${LETTERBOXD_USER}`
        }
    ]
};

const builder = new addonBuilder(manifest);

// === HELPER FUNCTION: scrape movies ===
async function scrapeLetterboxd() {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        executablePath: CHROME_PATH
    });

    const page = await browser.newPage();
    await page.goto(BASE_URL, { waitUntil: 'networkidle2' });

    const movies = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('.film-detail')).map(film => {
            const titleEl = film.querySelector('a[href*="/film/"]');
            const posterEl = film.querySelector('img');
            const ratingEl = film.querySelector('.rating');

            const poster = posterEl?.getAttribute('data-src') || posterEl?.getAttribute('src') || '';
            
            let ratingStars = 'No rating';
            if (ratingEl) {
                const ratingValue = parseFloat(ratingEl.textContent.trim());
                if (!isNaN(ratingValue)) {
                    const fullStars = '★'.repeat(Math.round(ratingValue));
                    const emptyStars = '☆'.repeat(5 - Math.round(ratingValue));
                    ratingStars = fullStars + emptyStars;
                }
            }

            return {
                id: 'letterboxd:' + (titleEl?.href.split('/film/')[1]?.replace(/\//g, '') || Date.now()),
                title: titleEl?.textContent.trim() || 'Unknown',
                poster: poster,
                description: ratingStars
            };
        });
    });

    await browser.close();
    return movies;
}

// === CATALOG HANDLER WITH CACHE ===
builder.defineCatalogHandler(async () => {
    const now = Date.now();
    if (cachedMovies.length > 0 && now - lastScrape < CACHE_TTL) {
        return { metas: cachedMovies };
    }

    try {
        const movies = await scrapeLetterboxd();
        cachedMovies = movies;
        lastScrape = now;
        return { metas: movies };
    } catch (err) {
        console.error('Error scraping Letterboxd:', err);
        // fallback: return cached movies if scraping fails
        return { metas: cachedMovies };
    }
});

// === META HANDLER (minimal) ===
builder.defineMetaHandler(async ({ id }) => {
    return { meta: { id, name: id.replace('letterboxd:', '').replace(/-/g, ' '), poster: '', description: '' } };
});

// === START SERVER ===
serveHTTP(builder.getInterface(), { port: PORT });
console.log(`Stremio addon listening on port ${PORT}`);
