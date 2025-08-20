const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');
const cheerio = require('cheerio');

const PORT = process.env.PORT || 3000;
const LETTERBOXD_USER = 'jake84';
const BASE_URL = `https://letterboxd.com/${LETTERBOXD_USER}/films/by/rated-date/`;

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
    const res = await axios.get(BASE_URL);
    const $ = cheerio.load(res.data);

    const movies = [];

    $('.film-detail').each((i, el) => {
        const titleEl = $(el).find('a[href*="/film/"]');
        const posterEl = $(el).find('img');
        const ratingEl = $(el).find('.rating');

        const title = titleEl.text().trim() || 'Unknown';
        const poster = posterEl.attr('data-src') || posterEl.attr('src') || 'https://via.placeholder.com/300x450?text=No+Image';

        let ratingStars = 'No rating';
        if (ratingEl.length) {
            const ratingValue = parseFloat(ratingEl.text().trim());
            if (!isNaN(ratingValue)) {
                const fullStars = '★'.repeat(Math.round(ratingValue));
                const emptyStars = '☆'.repeat(5 - Math.round(ratingValue));
                ratingStars = fullStars + emptyStars;
            }
        }

        const id = 'letterboxd:' + title.replace(/\s+/g, '-').toLowerCase() + '-' + i;

        movies.push({
            id,
            title,
            poster,
            description: ratingStars
        });
    });

    return movies;
}

// === CATALOG HANDLER WITH CACHE ===
builder.defineCatalogHandler(async () => {
    const now = Date.now();
    if (cachedMovies.length && now - lastScrape < CACHE_TTL) {
        return { metas: cachedMovies };
    }

    try {
        const movies = await scrapeLetterboxd();
        cachedMovies = movies;
        lastScrape = now;
        return { metas: movies };
    } catch (err) {
        console.error('Error scraping Letterboxd:', err);
        return {
            metas: cachedMovies.length ? cachedMovies : [{
                id: 'letterboxd:none',
                title: 'No Movies Found',
                poster: 'https://via.placeholder.com/300x450?text=No+Image',
                description: 'Scraping failed'
            }]
        };
    }
});

// === META HANDLER (minimal) ===
builder.defineMetaHandler(async ({ id }) => {
    return { meta: { id, name: id.replace('letterboxd:', '').replace(/-/g, ' '), poster: '', description: '' } };
});

// === START SERVER ===
serveHTTP(builder.getInterface(), { port: PORT });
console.log(`Stremio addon listening on port ${PORT}`);
