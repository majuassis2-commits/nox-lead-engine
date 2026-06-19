require("dotenv").config();
const axios = require("axios");
const cheerio = require("cheerio");
const { createClient } = require("@supabase/supabase-js");
const config = require("./config.json");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl || "https://example.supabase.co", supabaseKey || "missing");

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cleanText(text) {
  return (text || "").replace(/\s+/g, " ").trim();
}

function guessPhone(text) {
  const found = text.match(/(?:\(?\d{2}\)?\s?)?(?:9?\d{4})[-\s]?\d{4}/);
  return found ? found[0] : "";
}

function googleSearchUrl(query) {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

async function searchGoogle(query, limit) {
  const response = await axios.get(googleSearchUrl(query), {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
      "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8"
    },
    timeout: 20000
  });

  const $ = cheerio.load(response.data);
  const results = [];

  $("a").each((_, el) => {
    const href = $(el).attr("href") || "";
    const text = cleanText($(el).text());

    if (!text || text.length < 3) return;
    if (!href.includes("/url?q=")) return;

    let link = href.split("/url?q=")[1]?.split("&")[0] || "";
    try { link = decodeURIComponent(link); } catch(e) {}

    if (!link || link.includes("google.") || link.includes("webcache")) return;

    const lower = text.toLowerCase();
    const bad = ["maps", "youtube", "wikipedia", "reclame aqui"];
    if (bad.some(b => lower === b)) return;

    results.push({
      title: text.slice(0, 120),
      link
    });
  });

  const unique = [];
  const seen = new Set();

  for (const item of results) {
    const key = item.link.split("?")[0];
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
    if (unique.length >= limit) break;
  }

  return unique;
}

async function enrichLead(lead) {
  try {
    const response = await axios.get(lead.website, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8"
      },
      timeout: 12000
    });

    const $ = cheerio.load(response.data);
    const text = cleanText($("body").text());
    const phone = guessPhone(text);

    let instagram = "";
    $("a").each((_, el) => {
      const href = $(el).attr("href") || "";
      if (!instagram && href.includes("instagram.com")) instagram = href;
    });

    return { ...lead, phone, instagram };
  } catch (e) {
    return lead;
  }
}

async function saveLead(lead) {
  const payload = {
    company: lead.company,
    niche: lead.niche,
    city: lead.city,
    phone: lead.phone || "",
    instagram: lead.instagram || "",
    maps_link: "",
    website: lead.website || "",
    score: lead.phone ? 80 : 55,
    status: "novo",
    source: "nox_robo_regional_3x3",
    notes: "capturado automaticamente pelo robô regional 3x3"
  };

  const { error } = await supabase.from("leads").insert(payload);
  if (error) throw error;
  return payload;
}

async function runScan() {
  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env");
  }

  const saved = [];
  const errors = [];

  for (const city of config.cities) {
    for (const niche of config.niches) {
      const query = `${niche} ${city} whatsapp site`;
      console.log("Buscando:", query);

      try {
        const results = await searchGoogle(query, config.maxResultsPerSearch);
        for (const result of results) {
          const lead = await enrichLead({
            company: result.title,
            niche,
            city,
            website: result.link,
            phone: "",
            instagram: ""
          });

          const savedLead = await saveLead(lead);
          saved.push(savedLead);
          await sleep(1000);
        }
      } catch (error) {
        errors.push({ query, error: error.message });
      }

      await sleep(2500);
    }
  }

  console.log(`Finalizado. Leads salvos: ${saved.length}`);
  return { savedCount: saved.length, saved, errors };
}

if (require.main === module) {
  runScan()
    .then(result => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch(error => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { runScan };
