const { addonBuilder, serveHTTP } = require("stremio-addon-sdk")
const fetch = require("node-fetch") // v2
const xml2js = require("xml2js")

console.log("Addon starting...")

const LETTERBOXD_USER = "jake84"
const RSS_URL = `https://letterboxd.com/${LETTERBOXD_USER}/rss/`

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
            id: "letterboxd-rss",
            name: `Films of ${LETTERBOXD_USER}`
        }
    ]
}

const builder = new addonBuilder(manifest)

// Fetch and parse RSS feed
async function fetchRSS() {
    try {
        const res = await fetch(RSS_URL)
        const xml = await res.text()
        const parsed = await xml2js.parseStringPromise(xml)
        const items = parsed.rss.channel[0].item || []

        if (!items.length) {
            // fallback meta if no items found
            return [{
                id: "letterboxd:placeholder",
                title: "No movies found",
                description: "",
                poster: "https://via.placeholder.com/200x300?text=No+Image"
            }]
        }

        return items.map(item => {
            const titleRaw = item.title[0] // e.g. "The Matrix (1999)"
            const title = titleRaw.replace(/\(\d{4}\)$/, "").trim() // remove year
            const yearMatch = titleRaw.match(/\((\d{4})\)$/)
            const year = yearMatch ? parseInt(yearMatch[1]) : null
            const idSafe = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")
            return {
                id: `letterboxd:${idSafe}`,
                title: title || "Unknown Title",
                description: year ? `Year: ${year}` : "",
                poster: "https://via.placeholder.com/200x300?text=No+Image"
            }
        })
    } catch (err) {
        console.error("Error fetching RSS:", err)
        return [{
            id: "letterboxd:placeholder",
            title: "Error fetching list",
            description: "",
            poster: "https://via.placeholder.com/200x300?text=No+Image"
        }]
    }
}

// Catalog handler
builder.defineCatalogHandler(async ({ type }) => {
    if (type !== "movie") return { metas: [] }
    const movies = await fetchRSS()
    return { metas: movies.map(m => ({
        id: m.id,
        type: "movie",
        name: m.title,
        description: m.description,
        poster: m.poster
    })) }
})

// Meta handler
builder.defineMetaHandler(async ({ type, id }) => {
    const movies = await fetchRSS()
    const movie = movies.find(m => m.id === id)
    if (!movie) return null
    return {
        id: movie.id,
        type: "movie",
        name: movie.title,
        description: movie.description,
        poster: movie.poster
    }
})

// Serve the addon on Render
const addonInterface = builder.getInterface()
const PORT = parseInt(process.env.PORT || 3000)
serveHTTP(addonInterface, { port: PORT })
console.log(`Addon listening on port ${PORT}`)
