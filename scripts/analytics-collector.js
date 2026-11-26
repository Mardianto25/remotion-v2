import fs from "node:fs/promises";
import path from "node:path";
const API = "https://www.googleapis.com";
const GRAPH = "https://graph.facebook.com";
const VERSION = process.env.FACEBOOK_GRAPH_API_VERSION || "v27.0";
const REGISTRY = path.resolve("data/analytics/videos.json");
const HISTORY = path.resolve("data/analytics/snapshots.json");
const OUT = path.resolve("out/analytics");
async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return fallback; throw error; }
}
function dateOnly(value) {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) throw new Error("Tanggal publikasi tidak valid: " + value);
  return d.toISOString().slice(0, 10);
}
async function refreshGoogleToken() {
  const refreshToken = process.env.YOUTUBE_ANALYTICS_REFRESH_TOKEN || process.env.YOUTUBE_REFRESH_TOKEN_3N;
  const clientId = process.env.YOUTUBE_CLIENT_ID_3N;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET_3N;
  if (!refreshToken || !clientId || !clientSecret) throw new Error("Secret YOUTUBE_CLIENT_ID_3N, YOUTUBE_CLIENT_SECRET_3N, dan YOUTUBE_ANALYTICS_REFRESH_TOKEN (atau YOUTUBE_REFRESH_TOKEN_3N) wajib tersedia.");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" })
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error("OAuth YouTube Analytics gagal: " + JSON.stringify(data));
  return data.access_token;
}
async function fetchYouTubeAnalytics(accessToken, videoId, startDate, endDate) {
  const url = new URL(API + "/youtube/analytics/v2/reports");
  url.search = new URLSearchParams({
    ids: "channel==MINE", startDate, endDate,
    metrics: "views,estimatedMinutesWatched,averageViewDuration,likes,comments,shares,subscribersGained",
    dimensions: "day", filters: "video==" + videoId, sort: "day"
  }).toString();
  const response = await fetch(url, { headers: { Authorization: "Bearer " + accessToken } });
  const data = await response.json();
  if (!response.ok) throw new Error("YouTube Analytics API: " + (data.error?.message || JSON.stringify(data)));
  const headers = (data.columnHeaders || []).map(item => item.name);
  const rows = (data.rows || []).map(row => Object.fromEntries(headers.map((key, index) => [key, row[index]])));
  const totals = rows.reduce((sum, row) => {
    for (const key of ["views", "estimatedMinutesWatched", "likes", "comments", "shares", "subscribersGained"]) sum[key] += Number(row[key] || 0);
    sum.weightedAverageViewDuration += Number(row.averageViewDuration || 0) * Number(row.views || 0);
    sum.viewsForAverage += Number(row.views || 0);
    return sum;
  }, { views: 0, estimatedMinutesWatched: 0, likes: 0, comments: 0, shares: 0, subscribersGained: 0, weightedAverageViewDuration: 0, viewsForAverage: 0 });
  totals.averageViewDuration = totals.viewsForAverage ? totals.weightedAverageViewDuration / totals.viewsForAverage : 0;
  delete totals.weightedAverageViewDuration;
  delete totals.viewsForAverage;
  return { rows, totals };
}
async function fetchFacebookPostInsights(postId, token) {
  const url = new URL(GRAPH + "/" + VERSION + "/" + encodeURIComponent(postId) + "/insights");
  url.search = new URLSearchParams({ metric: "post_impressions,post_engaged_users", access_token: token }).toString();
  const response = await fetch(url);
  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error?.message || JSON.stringify(data));
  const metrics = {};
  for (const item of data.data || []) metrics[item.name] = item.values?.at(-1)?.value ?? null;
  return metrics;
}
async function main() {
  const registry = await readJson(REGISTRY, { videos: [] });
  if (!Array.isArray(registry.videos) || !registry.videos.length) throw new Error("Belum ada video di data/analytics/videos.json. Jalankan publish-facebook setelah perubahan ini.");
  const googleToken = await refreshGoogleToken();
  const facebookToken = process.env.FB_PAGE_ACCESS_TOKEN || process.env.FACEBOOK_PAGE_ACCESS_TOKEN || "";
  const now = new Date();
  const snapshot = { collectedAt: now.toISOString(), videos: [] };
  for (const video of registry.videos) {
    const published = new Date(video.publishedAt || video.scheduledPublishAt || video.registeredAt);
    const ageHours = Math.max(0, (now.getTime() - published.getTime()) / 3600000);
    const start = dateOnly(published);
    const firstDayEnd = start; // First calendar-day cohort; day-1 is only reported after 24 hours.
    const sevenDayEnd = dateOnly(new Date(published.getTime() + 6 * 24 * 3600000));
    const today = dateOnly(now);
    const youtube = { status: "not_available", error: null, day1: null, day7: null };
    try {
      const day1 = ageHours >= 24 ? await fetchYouTubeAnalytics(googleToken, video.youtubeVideoId, start, firstDayEnd) : null;
      const day7 = ageHours >= 168 ? await fetchYouTubeAnalytics(googleToken, video.youtubeVideoId, start, sevenDayEnd) : null;
      const current = await fetchYouTubeAnalytics(googleToken, video.youtubeVideoId, start, today);
      youtube.status = "ok"; youtube.current = current.totals;
      youtube.day1 = day1?.totals || null; youtube.day7 = day7?.totals || null; youtube.daily = current.rows;
    } catch (error) { youtube.status = "error"; youtube.error = error.message; }
    const facebook = { status: "not_configured", posts: [] };
    if (facebookToken && Array.isArray(video.facebookPostIds) && video.facebookPostIds.length) {
      facebook.status = "partial";
      for (const postId of video.facebookPostIds) {
        try { facebook.posts.push({ postId, status: "ok", insights: await fetchFacebookPostInsights(postId, facebookToken) }); }
        catch (error) { facebook.posts.push({ postId, status: "unavailable", error: error.message }); }
      }
      if (facebook.posts.length && facebook.posts.every(item => item.status === "ok")) facebook.status = "ok";
    }
    snapshot.videos.push({
      videoId: video.youtubeVideoId, title: video.title, theme: video.theme || "renungan-motivasi",
      publishedAt: published.toISOString(), ageHours: Number(ageHours.toFixed(2)), youtube, facebook
    });
    console.log("[Analytics] " + video.youtubeVideoId + " | YouTube: " + youtube.status + " | Facebook: " + facebook.status);
  }
  const history = await readJson(HISTORY, { snapshots: [] });
  history.snapshots = Array.isArray(history.snapshots) ? history.snapshots : [];
  history.snapshots.push(snapshot);
  await fs.mkdir(path.dirname(HISTORY), { recursive: true });
  await fs.writeFile(HISTORY, JSON.stringify(history, null, 2) + "\n", "utf8");
  await fs.mkdir(OUT, { recursive: true });
  await fs.writeFile(path.join(OUT, "latest-snapshot.json"), JSON.stringify(snapshot, null, 2) + "\n", "utf8");
  console.log("[Analytics] Snapshot tersimpan: " + snapshot.videos.length + " video.");
}
main().catch(error => { console.error("[Analytics Collector Error]", error); process.exit(1); });
