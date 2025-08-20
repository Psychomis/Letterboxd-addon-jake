const { addonBuilder, serveHTTP } = require("stremio-addon-sdk")
const puppeteer = require("puppeteer")

console.log("Addon starting...")

const LETTERBOXD_USER = "jake84"
const URL = `https://letterboxd.com/${LETTERBOXD_USER}/films/by/rated-date/`

const manifest = {
    id: "org.jake84.letterboxd",
    version: "1.0.0",
    name: `Letterboxd - ${LETTERBOXD_USER}`,
    description: `Movies watched by ${LETTERBOXD_USER} on Letterboxd`,
    resources: ["catalog", "meta"],
    types: ["movie"],
    idPrefixes: ["letterboxd:"],
    catalogs: [
        {
            type: "movie",
            id: "letterboxd-scraped",
            name: `Films of ${LETTERBOXD_USER}`
        }
    ]
}

const builder = new addonBuilder(manifest)

// Scrape Letterboxd page for movies
async function fetchMovies() {
    try {
        const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] })
        const page = await browser.newPage()
        await page.goto(URL, { waitUntil: "networkidle2" })

        const movies = await page.evaluate(() => {
            const list = []
            document.querySelectorAll('.film-poster')?.forEach(el => {
                const title = el.getAttribute('data-film-name')
                const year = el.getAttribute('data-film-year')
                const poster = el.querySelector('img')?.src || "https://via.placeholder.com/200x300?text=No+Image"
                const idSafe = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
                list.push({
                    id: `letterboxd:${idSafe}`,
                    title,
                    description: year ? `Year: ${year}` : "",
                    poster
                })
            })
            return list
        })

        await browser.close()
        return movies
    } catch (err) {
        console.error("Error scraping Letterboxd:", err)
        return [{
            id: "letterboxd:error",
            title: "Error fetching list",
            description: "",
            poster: "https://via.placeholder.com/200x300?text=No+Image"
        }]
    }
}

// Catalog handler
builder.defineCatalogHandler(async ({ type }) => {
    if (type !== "movie") return { metas: [] }
    const movies = await fetchMovies()
    return { metas: movies }
})

// Meta handler
builder.defineMetaHandler(async ({ type, id }) => {
    const movies = await fetchMovies()
    return movies.find(m => m.id === id) || null
})

// Serve on Render
const addonInterface = builder.getInterface()
const PORT = parseInt(process.env.PORT || 3000)
serveHTTP(addonInterface, { port: PORT })
console.log(`Addon listening on port ${PORT}`)
