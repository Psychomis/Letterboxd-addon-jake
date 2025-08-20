const { addonBuilder } = require("stremio-addon-sdk")
const fetch = require("node-fetch") // must be v2
const cheerio = require("cheerio")
const express = require("express")

console.log("Addon starting...")

const LETTERBOXD_USER = "jake84"
const BASE_URL = `https://letterboxd.com/${LETTERBOXD_USER}/films/`

// Manifest with catalogs array
const manifest = {
    id: "org.jake84.letterboxd",
    version: "1.0.0",
    name: `Letterboxd - ${LETTERBOXD_USER}`,
    description: `Movies watched and rated by ${LETTERBOXD_USER} on Letterboxd`,
    resources: ["catalog", "meta"],
    types: ["movie"],
    idPrefixes: ["letterboxd:"],
    catalogs: [
        {
            type: "movie",
            id: "letterboxd-films",
            name: `Films of ${LETTERBOXD_USER}`
        }
    ]
}

const builder = new addonBuilder(manifest)

// Safe scraping function
async function scrapeLetterboxd() {
    try {
        const res = await fetch(BASE_URL)
        const body = await res.text()
        const $ = cheerio.load(body)
        const movies = []

        $(".film-detail").each((i, el) => {
            const title = $(el).find(".film-title").text().trim()
            const rating = $(el).find(".rating").attr("data-rating") || null
            const id = `letterboxd:${title.toLowerCase().replace(/ /g, "-")}`
            if (title) movies.push({ id, title, rating })
        })

        return movies
    } catch (err) {
        console.error("Error scraping Letterboxd:", err)
        return []
    }
}

// Catalog handler
builder.defineCatalogHandler(async ({ type }) => {
    if (type !== "movie") return { metas: [] }
    const movies = await scrapeLetterboxd()
    return {
        metas: movies.map(m => ({
            id: m.id,
            type: "movie",
            name: m.title,
            description: m.rating ? `Rating: ${m.rating}/5` : "No rating"
        }))
    }
})

// Meta handler
builder.defineMetaHandler(async ({ type, id }) => {
    const movies = await scrapeLetterboxd()
    const movie = movies.find(m => m.id === id)
    if (!movie) return null
    return {
        id: movie.id,
        type: "movie",
        name: movie.title,
        description: movie.rating ? `Rating: ${movie.rating}/5` : "No rating"
    }
})

// Express server
const app = express()

// Serve manifest.json for Stremio
app.get("/manifest.json", (req, res) => res.json(manifest))

// Test route to see scraped movies in browser
app.get("/test", async (req, res) => {
    try {
        const movies = await scrapeLetterboxd()
        res.json(movies)
    } catch (err) {
        console.error("Error in /test route:", err)
        res.status(500).send("Error fetching movies")
    }
})

// Correctly mount Stremio addon router
const addonRouter = builder.getInterface()
app.use("/", addonRouter)

const port = process.env.PORT || 3000
app.listen(port, () => console.log(`Addon listening on port ${port}`))

process.on("uncaughtException", err => console.error("Uncaught exception:", err))
process.on("unhandledRejection", err => console.error("Unhandled rejection:", err))
