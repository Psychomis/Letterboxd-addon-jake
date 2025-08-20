const { addonBuilder, serveHTTP } = require("stremio-addon-sdk")
const fetch = require("node-fetch") // v2
const xml2js = require("xml2js")

console.log("Addon starting...")

const LETTERBOXD_USER = "jake84"
const RSS_URL = `https://letterboxd.com/${LETTERBOXD_USER}/rss/`
const TMDB_KEY = process.env.TMDB_API_KEY
const TMDB_BASE = "https://api.themoviedb.org/3"

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

// Fetch RSS feed and parse
async function fetchRSS() {
    try {
        const res = await fetch(RSS_URL)
        const xml = await res.text()
        const parsed = await xml2js.parseStringPromise(xml)
        let items = parsed.rss.channel[0].item || []

        // sort by pubDate descending (newest first)
        items.sort((a, b) => new Date(b.pubDate[0]) - new Date(a.pubDate[0]))

        // map to movie objects
        const movies = await Promise.all(items.map(async item => {
            const titleRaw = item.title[0] // e.g. "The Matrix (1999)"
            const title = titleRaw.replace(/\(\d{4}\)$/, "").trim()
            const yearMatch = titleRaw.match(/\((\d{4})\)$/)
            const year = yearMatch ? parseInt(yearMatch[1]) : null
            const idSafe = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")

            // fetch poster from TMDb
            let poster = "https://via.placeholder.com/200x300?text=No+Image"
            if (TMDB_KEY) {
                try {
                    const query = encodeURIComponent(title)
                    const searchUrl = `${TMDB_BASE}/search/movie?api_key=${TMDB_KEY}&query=${query}&year=${year || ""}`
                    const searchRes = await fetch(searchUrl)
                    const searchData = await searchRes.json()
                    if (searchData.results && searchData.results[0] && searchData.results[0].poster_path) {
                        poster = `https://image.tmdb.org/t/p/w500${searchData.results[0].poster_path}`
                    }
                } catch (err) {
                    console.error("TMDb fetch error for", title, err)
                }
            }

            return {
                id: `letterboxd:${idSafe}`,
                title: title || "Unknown Title",
                description: year ? `Year: ${year}` : "",
                poster: poster
            }
        }))

        return movies
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

// Serve on Render
const addonInterface = builder.getInterface()
const PORT = parseInt(process.env.PORT || 3000)
serveHTTP(addonInterface, { port: PORT })
console.log(`Addon listening on port ${PORT}`)
