const { addonBuilder, serveHTTP } = require("stremio-addon-sdk")
const fetch = require("node-fetch")
const cheerio = require("cheerio")
const express = require("express")

// Hardcoded Letterboxd username
const LETTERBOXD_USER = "jake84"
const BASE_URL = `https://letterboxd.com/${LETTERBOXD_USER}/films/`

// Create Stremio addon manifest
const manifest = {
    id: "org.jake84.letterboxd",
    version: "1.0.0",
    name: `Letterboxd - ${LETTERBOXD_USER}`,
    description: `Movies watched and rated by ${LETTERBOXD_USER} on Letterboxd`,
    resources: ["catalog", "meta"],
    types: ["movie"],
    idPrefixes: ["letterboxd:"],
}

// Create addon builder
const builder = new addonBuilder(manifest)

// Utility: scrape Letterboxd page
async function scrapeLetterboxd() {
    const res = await fetch(BASE_URL)
    const body = await res.text()
    const $ = cheerio.load(body)
    const movies = []

    $(".film-detail").each((i, el) => {
        const title = $(el).find(".film-title").text().trim()
        const rating = $(el).find(".rating").attr("data-rating") || null
        const id = `letterboxd:${title.toLowerCase().replace(/ /g, "-")}`
        if(title) movies.push({ id, title, rating })
    })

    return movies
}

// Catalog handler
builder.defineCatalogHandler(async ({ type }) => {
    if(type !== "movie") return { metas: [] }
    const movies = await scrapeLetterboxd()
    const metas = movies.map(m => ({
        id: m.id,
        type: "movie",
        name: m.title,
        description: m.rating ? `Rating: ${m.rating}/5` : "No rating",
    }))
    return { metas }
})

// Meta handler (detailed info)
builder.defineMetaHandler(async ({ type, id }) => {
    const movies = await scrapeLetterboxd()
    const movie = movies.find(m => m.id === id)
    if(!movie) return null
    return {
        id: movie.id,
        type: "movie",
        name: movie.title,
        description: movie.rating ? `Rating: ${movie.rating}/5` : "No rating",
    }
})

// ------------------------
// EXPRESS SERVER (for Render)
// ------------------------
const app = express()
app.use("/", builder.getInterface())

const port = process.env.PORT || 3000
app.listen(port, () => {
    console.log(`Addon listening on port ${port}`)
})

process.on("uncaughtException", err => console.error("Uncaught exception:", err))
process.on("unhandledRejection", err => console.error("Unhandled rejection:", err))
