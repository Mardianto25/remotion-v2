import fs from "node:fs/promises";
import path from "node:path";
import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) throw new Error("GEMINI_API_KEY is required.");
const ai = new GoogleGenAI({ apiKey });
const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const topic = process.argv.slice(2).join(" ").trim() || "The Last Train Had One Extra Passenger";
const duration = Number(process.env.USA_STORY_DURATION_SECONDS || 55);

const prompt = `
Create an original, advertiser-friendly YouTube Short story for a US audience.
Genre: animated mystery with atmospheric horror, suspense, and a clever twist.
Topic: ${topic}
Language: natural contemporary American English.
Target narration duration: ${duration} seconds (roughly 115-145 spoken words).
Rules:
- Fully fictional; do not present it as a true story.
- No graphic violence, gore, hate, or real-person allegations.
- Strong curiosity hook in the first sentence; escalate every few seconds.
- End with a memorable twist and a short question that invites comments.
- Create 6-8 visually coherent scenes. Keep character appearance consistent.
Return ONLY valid JSON with this shape:
{
 "title": "short clickable title",
 "logline": "one sentence",
 "narration": "complete voiceover",
 "description": "YouTube description",
 "hashtags": ["#MysteryShorts", "#AnimatedHorror"],
 "scenes": [
  {"id": 1, "durationSeconds": 7, "narration": "exact narration segment",
   "visualPrompt": "cinematic 3D animated scene, vertical 9:16, detailed composition, lighting, camera, consistent character details",
   "soundCue": "brief sound design cue"}
 ]
}
`;

const response = await ai.models.generateContent({
  model,
  contents: prompt,
  config: { responseMimeType: "application/json", temperature: 0.85 }
});
const raw = response.text || "";
let story;
try { story = JSON.parse(raw); }
catch { throw new Error("Gemini returned invalid JSON: " + raw.slice(0, 500)); }

if (!story.title || !story.narration || !Array.isArray(story.scenes) || story.scenes.length < 5) {
  throw new Error("Generated story failed schema validation.");
}
const words = story.narration.trim().split(/\\s+/).length;
if (words < 90 || words > 170) {
  throw new Error(`Narration word count ${words} is outside the 90-170 word safety range.`);
}
const outDir = path.resolve("data");
await fs.mkdir(outDir, { recursive: true });
const output = path.join(outDir, "story.json");
await fs.writeFile(output, JSON.stringify({
  ...story,
  market: "US",
  language: "en-US",
  genre: "animated-mystery-horror",
  generatedAt: new Date().toISOString(),
  narrationWordCount: words
}, null, 2));
console.log(`Story generated: ${output} (${words} words, ${story.scenes.length} scenes)`);
