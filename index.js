const { addonBuilder, serveHTTP } = require('stremio-addon-sdk');
const puppeteer = require('puppeteer-core');

const PORT = process.env.PORT || 3000;
const LETTERBOXD_USER = 'jake84';
const BASE_URL = `https://letterboxd.com/${LETTERBOXD_USER}/films/by/rated-date/`;

// Manifest for Stremio
const manifest = {
    id: 'org.jake84.letterboxd',
    version: '1.0.0',
    name: `Letterboxd - ${LETTERBOXD_USER}`,
    description: `Movies watched by ${LETTERBOXD_USER} on Letterboxd`,
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

// Create the addon
const builder = new addonBuilder(manifest);

// Catalog endpoint
builder.defineCatalogHandler(async ({ type, id }) => {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        executablePath: process.env.CHROME_PATH || '/usr/bin/chromium-browser'
    });

    const page = await browser.newPage();
    await page.goto(BASE_URL, { waitUntil: 'networkidle2' });

    // Scrape movies
    const movies = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('.film-detail')).map(film => {
            const titleEl = film.querySelector('a[href*="/film/"]');
            const posterEl = film.querySelector('img');
            const watchedDateEl = film.querySelector('.td-numeric');

            return {
                id: 'letterboxd:' + titleEl?.href.split('/film/')[1]?.replace(/\//g, ''),
                title: titleEl?.textContent.trim() || 'Unknown',
                poster: posterEl?.getAttribute('data-src') || posterEl?.src || '',
                description: watchedDateEl?.textContent.trim() || ''
            };
        });
    });

    await browser.close();

    return { metas: movies };
});

// Meta endpoint
builder.defineMetaHandler(async ({ type, id }) => {
    // For simplicity, return the same info as catalog
    return {
        meta: {
            id,
            name: id.replace('letterboxd:', '').replace(/-/g, ' '),
            description: '',
            poster: ''
        }
    };
});

// Serve the addon
serveHTTP(builder.getInterface(), { port: PORT });
console.log(`Stremio addon listening on port ${PORT}`);
