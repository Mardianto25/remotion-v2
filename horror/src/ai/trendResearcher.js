import { GoogleGenAI } from "@google/genai";
import { google } from "googleapis";
import { CHANNEL_NAME, config } from "../config.js";

const TREND_QUERIES = [
  "cerita horor indonesia",
  "misteri indonesia",
  "tempat angker indonesia",
  "urban legend indonesia",
  "kisah mistis indonesia"
];

function yesterdayJakartaWindow(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  // WIB = UTC+7. Ambil satu hari kalender penuh kemarin, bukan rolling 24 jam.
  const start = new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), -7, 0, 0));
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

function parseJson(text) {
  const clean = String(text || "").replace(/^\x60{3}json\s*/i, "").replace(/\s*\x60{3}$/, "").trim();
  try { return JSON.parse(clean); } catch {
    const start = clean.indexOf("{");
    const end = clean.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("Gemini tidak mengembalikan JSON untuk topik tren.");
    return JSON.parse(clean.slice(start, end + 1));
  }
}

export async function researchTrendingTopic() {
  const required = ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET", "YOUTUBE_REFRESH_TOKEN_V2"];
  for (const key of required) {
    if (!process.env[key]) throw new Error("Mode otomatis membutuhkan GitHub Secret " + key + ".");
  }
  if (!config.geminiApiKey) throw new Error("Mode otomatis membutuhkan GEMINI_API_KEY.");

  const oauth = new google.auth.OAuth2(process.env.YOUTUBE_CLIENT_ID, process.env.YOUTUBE_CLIENT_SECRET);
  oauth.setCredentials({ refresh_token: process.env.YOUTUBE_REFRESH_TOKEN_V2 });
  const youtube = google.youtube({ version: "v3", auth: oauth });
  const { start, end } = yesterdayJakartaWindow();
  console.log("Riset tren YouTube Indonesia: " + start.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) +
    " sampai " + end.toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }) + " WIB");

  const found = new Map();
  for (const query of TREND_QUERIES) {
    console.log("[trend] Cari: " + query);
    const response = await youtube.search.list({
      part: ["snippet"],
      q: query,
      type: "video",
      order: "viewCount",
      regionCode: "ID",
      relevanceLanguage: "id",
      publishedAfter: start.toISOString(),
      publishedBefore: end.toISOString(),
      maxResults: 10
    });
    for (const item of response.data.items || []) {
      const id = item.id?.videoId;
      if (id) found.set(id, item.snippet);
    }
  }

  if (!found.size) {
    throw new Error("Tidak ditemukan video horor/misteri Indonesia yang terbit kemarin. Coba jalankan mode manual atau ulangi riset nanti.");
  }

  const ids = [...found.keys()];
  const stats = [];
  for (let i = 0; i < ids.length; i += 50) {
    const response = await youtube.videos.list({
      part: ["snippet", "statistics"],
      id: ids.slice(i, i + 50)
    });
    for (const item of response.data.items || []) {
      const snippet = item.snippet || {};
      const publishedAt = new Date(snippet.publishedAt || start);
      const ageHours = Math.max(1, (Date.now() - publishedAt.getTime()) / 3600000);
      const views = Number(item.statistics?.viewCount || 0);
      stats.push({
        videoId: item.id,
        title: snippet.title || "",
        channelTitle: snippet.channelTitle || "",
        publishedAt: snippet.publishedAt || null,
        views,
        viewsPerHour: Math.round(views / ageHours),
        url: "https://www.youtube.com/watch?v=" + item.id
      });
    }
  }
  stats.sort((a, b) => b.viewsPerHour - a.viewsPerHour || b.views - a.views);
  const topVideos = stats.slice(0, 20);
  const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
  const prompt = `Kamu adalah periset ide konten untuk channel YouTube Indonesia "${CHANNEL_NAME}" yang fokus pada horor, misteri, urban legend, dan kisah mistis Indonesia.
Analisis daftar video yang benar-benar terbit kemarin di YouTube Indonesia. Gunakan jumlah views dan views per jam sebagai sinyal minat, bukan bukti bahwa suatu cerita benar.
Pilih satu tema yang paling menjanjikan untuk dibuat menjadi cerita ORISINAL. Jangan menyalin judul, nama channel, narasi, atau detail khas video sumber. Ambil pola ketertarikan/topiknya saja. Jangan mengarang fakta.
Kembalikan JSON valid saja: {"topic":"topik cerita orisinal yang spesifik","reason":"alasan singkat berdasarkan tren","alternativeTopics":["ide 2","ide 3","ide 4"]}.
Daftar video tren (viewsPerHour adalah estimasi views dibagi umur video dalam jam):
${JSON.stringify(topVideos, null, 2)}`;
  const response = await ai.models.generateContent({
    model: config.geminiModel,
    contents: prompt,
    config: { responseMimeType: "application/json" }
  });
  const choice = parseJson(response.text);
  const topic = String(choice.topic || "").trim();
  if (topic.length < 8 || topic.length > 180) {
    throw new Error("Gemini menghasilkan topik tren yang tidak valid: " + topic);
  }
  return {
    topic,
    reason: String(choice.reason || ""),
    alternativeTopics: Array.isArray(choice.alternativeTopics) ? choice.alternativeTopics.slice(0, 3) : [],
    window: { start: start.toISOString(), end: end.toISOString(), timezone: "Asia/Jakarta" },
    queries: TREND_QUERIES,
    sourceVideos: topVideos
  };
}
