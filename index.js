const { addonBuilder } = require("stremio-addon-sdk")
const fetch = require("node-fetch")
const cheerio = require("cheerio")

// ===== CONFIG =====
const USERNAME = "jake84"
const LETTERBOXD_DIARY_URL = "https://letterboxd.com/jake84/films/"
const CACHE_TTL = 1000 * 60 * 60 // 1 hour

// ===== Cache =====
let cache = {
    ratings: null,
    ratingsFetched: 0,
    movies: null,
    moviesFetched: 0
}

// ===== Manifest =====
const manifest = {
    id: "org.example.letterboxd.jake84",
    version: "1.2.0",
    name: `Letterboxd Diary: Jake84`,
    description: `All movies logged by Jake84 on Letterboxd with ratings`,
    catalogs: [
        {
            type: "movie",
            id: "letterboxd-list",
            name: `Jake84 Diary`
        }
    ],
    resources: ["catalog", "meta"],
    types: ["movie"]
}

const builder = new addonBuilder(manifest)

// ===== Functions =====

// Scrape diary for movies and posters
async function getDiaryMovies() {
    if (cache.movies && Date.now() - cache.moviesFetched < CACHE_TTL) return cache.movies

    let movies = []
    let page = 1
    let hasNext = true

    while (hasNext) {
        const url = `${LETTERBOXD_DIARY_URL}page/${page}/`
        const res = await fetch(url)
        if (!res.ok) break
        const html = await res.text()
        const $ = cheerio.load(html)

        let found = 0
        $(".film-detail-content").each((i, el) => {
            found++
            const title = $(el).find(".film-title-wrapper a").text().trim()
            const link = $(el).find(".film-title-wrapper a").attr("href")
            if (!link) return
            const id = link.split("/film/")[1].replace("/", "")
            const poster = "https://letterboxd.com" + $(el).find("img").attr("src")

            movies.push({ id, type: "movie", name: title, poster })
        })

        if (found === 0) hasNext = false
        else page++
    }

    cache.movies = movies
    cache.moviesFetched = Date.now()
    return movies
}

// Scrape ratings
async function getDiaryRatings() {
    if (cache.ratings && Date.now() - cache.ratingsFetched < CACHE_TTL) return cache.ratings

    let ratings = {}
    let page = 1
    let hasNext = true

    while (hasNext) {
        const url = `${LETTERBOXD_DIARY_URL}page/${page}/`
        const res = await fetch(url)
        if (!res.ok) break
        const html = await res.text()
        const $ = cheerio.load(html)

        let found = 0
        $(".diary-entry-row").each((i, el) => {
            found++
            const filmLink = $(el).find(".film-title a").attr("href")
            if (!filmLink) return
            const id = filmLink.split("/film/")[1].replace("/", "")
            const ratingText = $(el).find(".rating").attr("class")
            if (ratingText && ratingText.includes("rated-")) {
                const match = ratingText.match(/rated-(\d+)/)
                if (match) ratings[id] = parseInt(match[1], 10) / 10
            }
        })

        if (found === 0) hasNext = false
        else page++
    }

    cache.ratings = ratings
    cache.ratingsFetched = Date.now()
    return ratings
}

// ===== Catalog =====
builder.defineCatalogHandler(async ({ type, id }) => {
    if (id === "letterboxd-list") {
        const [movies, ratings] = await Promise.all([getDiaryMovies(), getDiaryRatings()])
        const merged = movies.map(m => ({
            ...m,
            description: ratings[m.id]
                ? `Rating by Jake84: ${ratings[m.id]}★`
                : `Not rated by Jake84`
        }))
        return { metas: merged }
    }
    return { metas: [] }
})

// ===== Meta =====
builder.defineMetaHandler(async ({ type, id }) => {
    const ratings = await getDiaryRatings()
    return {
        meta: {
            id,
            type: "movie",
            name: id,
            description: ratings[id]
                ? `Rating by Jake84: ${ratings[id]}★`
                : `No rating found for this movie`
        }
    }
})

module.exports = builder.getInterface()
