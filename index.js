const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const axios = require('axios');
const cheerio = require('cheerio');

const PORT = process.env.PORT || 3000;
const LETTERBOXD_USER = 'jake84';
const BASE_URL = `https://letterboxd.com/${LETTERBOXD_USER}/films/by/rated-date/`;

// Cache
let cachedMovies = [];
let lastScrape = 0;
const CACHE_TTL = 10 * 60 * 1000; // 10 min

// Manifest
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

// Helper to scrape a single page
async function scrapePage(url) {
    const res = await axios.get(url);
    const $ = cheerio.load(res.data);
    const movies = [];

    $('.film-detail').each((i, el) => {
        const posterEl = $(el).find('img');
        const title = posterEl.attr('alt')?.trim() || 'No Title';
        const poster = posterEl.attr('data-src') || posterEl.attr('src') || 'https://via.placeholder.com/300x450?text=No+Image';

        // Only Jake’s rating
        let ratingStars = 'No rating';
        const ratingEl = $(el).find('.rating');
        if (ratingEl.length) {
            const ratingValue = parseFloat(ratingEl.text().trim());
            if (!isNaN(ratingValue)) {
                const fullStars = '★'.repeat(Math.round(ratingValue));
                const emptyStars = '☆'.repeat(5 - Math.round(ratingValue));
                ratingStars = fullStars + emptyStars;
            }
        }

        // Valid ID
        const id = 'letterboxd:' + encodeURIComponent(title) + '-' + i;

        movies.push({ id, title, poster, description: ratingStars });
    });

    // Pagination
    const nextPageEl = $('.paginate-next a');
    const nextPage = nextPageEl.length ? nextPageEl.attr('href') : null;

    return { movies, nextPage };
}

// Scrape all pages (or limit for speed)
async function scrapeAllMovies(limit = 50) {
    let url = BASE_URL;
    let allMovies = [];

    while (url && allMovies.length < limit) {
        try {
            const { movies, nextPage } = await scrapePage(url);
            allMovies = allMovies.concat(movies);
            url = nextPage ? `https://letterboxd.com${nextPage}` : null;
        } catch (err) {
            console.error('Error scraping page:', url, err);
            break;
        }
    }

    // Limit to first N movies to avoid Stremio timeout
    return allMovies.slice(0, limit);
}

// Catalog handler
builder.defineCatalogHandler(async () => {
    const now = Date.now();
    if (cachedMovies.length && now - lastScrape < CACHE_TTL) {
        return { metas: cachedMovies };
    }

    try {
        const movies = await scrapeAllMovies();
        cachedMovies = movies;
        lastScrape = now;
        return { metas: movies };
    } catch (err) {
        console.error('Error scraping Letterboxd:', err);
        return {
            metas: [{
                id: 'letterboxd:none',
                title: 'No Movies Found',
                poster: 'https://via.placeholder.com/300x450?text=No+Image',
                description: 'Scraping failed'
            }]
        };
    }
});

// Minimal meta handler
builder.defineMetaHandler(async ({ id }) => {
    return {
        meta: {
            id,
            name: id.replace('letterboxd:', '').replace(/-/g, ' '),
            poster: 'https://via.placeholder.com/300x450?text=No+Image',
            description: ''
        }
    };
});

// Start server
serveHTTP(builder.getInterface(), { port: PORT });
console.log(`Stremio addon listening on port ${PORT}`);
