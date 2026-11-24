import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { generateStory } from "../src/ai/storyGenerator.js";
import { generateSeo } from "../src/ai/seoGenerator.js";
import { getSceneImage } from "../src/visual/providers.js";
import { generateNarration } from "../src/audio/edgeTts.js";
import { generateLongThumbnail } from "../src/visual/thumbnail.js";
import { ROOT, LONG_PUBLIC_DIR, LONG_DATA_DIR, LONG_OUT_DIR } from "../src/config.js";

const [stage, ...args] = process.argv.slice(2);
const arg = (name, fallback = "") => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] || fallback : fallback; };
const durationMinutes = Number(arg("--duration", "5"));
if (!Number.isFinite(durationMinutes) || durationMinutes < 1 || durationMinutes > 8) throw new Error("--duration harus 1 sampai 8 menit.");
const storyFile = arg("--story-file");
const topic = arg("--topic");
const id = String(arg("--output-id", topic || path.basename(storyFile || "single-video", ".json"))).toLowerCase().normalize("NFKD").replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "long-video";
const dataDir = path.join(LONG_DATA_DIR, id);
const assetsDir = path.join(LONG_PUBLIC_DIR, id, "assets");
const audioDir = path.join(LONG_PUBLIC_DIR, id, "audio");
const outDir = path.join(LONG_OUT_DIR, id);
const storyPath = path.join(dataDir, "story.json");
const readJson = async file => JSON.parse(await fs.readFile(file, "utf8"));
const writeJson = async (file, value) => { await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, JSON.stringify(value, null, 2) + "\n"); };
const requireFile = async file => { try { await fs.access(file); } catch { throw new Error("File belum tersedia: " + file + ". Jalankan workflow tahap sebelumnya."); } };
const run = (cmd, argv) => new Promise((resolve, reject) => { const p = spawn(cmd, argv, { stdio: "inherit" }); p.on("error", reject); p.on("close", code => code === 0 ? resolve() : reject(new Error(cmd + " exit code " + code))); });
const durationOf = file => new Promise((resolve, reject) => { const p = spawn("ffprobe", ["-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1",file]); let out=""; p.stdout.on("data", c => out += c); p.on("error",reject); p.on("close",code => code === 0 ? resolve(Number(out.trim())) : reject(new Error("ffprobe gagal: "+file))); });
function parseVtt(vtt) {
 return vtt.replace(/\r/g,"").split(/\n\n+/).flatMap(block => {
  const lines=block.split("\n"), line=lines.find(x=>x.includes("-->")); if(!line)return [];
  const [start,end]=line.split("-->").map(x=>x.trim().split(" ")[0]);
  const seconds=v=>{const p=v.replace(",",".").split(":").map(Number);return p.length===3?p[0]*3600+p[1]*60+p[2]:p[0]*60+p[1];};
  const text=lines.slice(lines.indexOf(line)+1).join(" ").replace(/<[^>]+>/g,"").trim();
  return text?[{start:seconds(start),end:seconds(end),text}]:[];
 });
}
await Promise.all([dataDir,assetsDir,audioDir,outDir].map(p=>fs.mkdir(p,{recursive:true})));
const getStory = async () => { await requireFile(storyPath); return readJson(storyPath); };

if (stage === "story") {
 let story;
 if (storyFile) story = await readJson(path.resolve(ROOT, storyFile));
 else {
  if (!topic) throw new Error('Tahap story membutuhkan --topic "topik cerita".');
  story = await generateStory(topic,{durationMinutes,longVideo:true,genre:process.env.STORY_GENRE||"mystery"});
 }
 if (!story.narration || !Array.isArray(story.scenes) || !story.scenes.length) throw new Error("Naskah tidak memiliki narration/scenes.");
 story.outputId=id;
 await writeJson(storyPath,story);
 await writeJson(path.join(dataDir,"stage-state.json"),{story:"completed",updatedAt:new Date().toISOString()});
 console.log("[long-video] Naskah tersimpan:",storyPath);
} else if (stage === "images") {
 const story=await getStory();
 process.env.STORY_GENRE=String(story.genre||story.category||"mystery");
 for(let i=0;i<story.scenes.length;i++){
  const file=path.join(assetsDir,"scene-"+String(i+1).padStart(3,"0")+".jpg");
  try{const st=await fs.stat(file);if(st.size>1024){console.log("[images] Skip scene",i+1);continue;}}catch{}
  console.log("[images] Generate",i+1,"/",story.scenes.length);
  await getSceneImage(story.scenes[i],i,assetsDir,story.characters||[],{aspectRatio:"16:9"});
  const st=await fs.stat(file);if(st.size<=1024)throw new Error("Image scene "+(i+1)+" tidak valid.");
  await writeJson(path.join(dataDir,"image-progress.json"),{completed:i+1,total:story.scenes.length,updatedAt:new Date().toISOString()});
 }
 await writeJson(path.join(dataDir,"image-manifest.json"),story.scenes.map((s,i)=>({id:s.id,fileName:"scene-"+String(i+1).padStart(3,"0")+".jpg",visualPrompt:s.visualPrompt||""})));
 console.log("[images] Semua gambar tersedia.");
} else if (stage === "audio") {
 const story=await getStory(), audio=path.join(audioDir,"narration.mp3"), vtt=path.join(audioDir,"narration.vtt");
 let valid=false;try{const [a,v]=await Promise.all([fs.stat(audio),fs.stat(vtt)]);valid=a.size>1024&&v.size>0;}catch{}
 if(!valid)await generateNarration(story.narration,audio,vtt);
 const duration=await durationOf(audio);if(duration>510)throw new Error("Audio melebihi 8 menit 30 detik: "+duration.toFixed(1)+" detik.");
 const captions=parseVtt(await fs.readFile(vtt,"utf8"));if(!captions.length)throw new Error("Subtitle VTT kosong/tidak valid.");
 await writeJson(path.join(dataDir,"audio-manifest.json"),{durationSeconds:Number(duration.toFixed(3)),captions,audio:"audio/narration.mp3",subtitles:"audio/narration.vtt"});
 console.log("[audio] Narasi dan subtitle siap:",duration.toFixed(1),"detik.");
} else if (stage === "thumbnail") {
 const story=await getStory();process.env.STORY_GENRE=String(story.genre||story.category||"mystery");
 const seo=await generateSeo(story,topic||story.title,{format:"long"});
 await writeJson(path.join(dataDir,"youtube-metadata.json"),seo);
 const thumbnail=await generateLongThumbnail(story,seo,topic||story.title,outDir);
 await writeJson(path.join(dataDir,"thumbnail-manifest.json"),{path:thumbnail.landscapePath,updatedAt:new Date().toISOString()});
 console.log("[thumbnail] Thumbnail landscape dan metadata SEO siap.");
} else if (stage === "render") {
 const story=await getStory();
 const audioManifest=await readJson(path.join(dataDir,"audio-manifest.json"));
 const imageManifest=await readJson(path.join(dataDir,"image-manifest.json"));
 await requireFile(path.join(audioDir,"narration.mp3"));
 if(imageManifest.length!==story.scenes.length)throw new Error("Jumlah gambar tidak sama dengan jumlah scene.");
 const fps=30,duration=Number(audioManifest.durationSeconds),totalFrames=Math.ceil(duration*fps);
 const words=story.scenes.map(s=>(String(s.narration||"").match(/\S+/g)||[]).length),total=words.reduce((a,b)=>a+b,0)||1;
 let cursor=0;
 const scenes=story.scenes.map((scene,i)=>{const startFrame=cursor,frames=i===story.scenes.length-1?totalFrames-cursor:Math.max(1,Math.round(totalFrames*words[i]/total));cursor+=frames;return {...scene,fileName:imageManifest[i].fileName,startFrame,durationInFrames:frames};});
 const manifest={assetPrefix:"long-video/"+id,title:story.title,description:story.description||"",disclaimer:story.disclaimer||"",durationInFrames:totalFrames,fps,scenes,captions:audioManifest.captions};
 await fs.writeFile(path.join(ROOT,"remotion","generatedLongStory.js"),"export const generatedLongStory = "+JSON.stringify(manifest,null,2)+";\n");
 const video=path.join(outDir,"long-video.mp4");
 await run("npx",["remotion","render","remotion/index.jsx","LongVideo",video,"--codec=h264","--crf=22"]);
 const actual=await durationOf(video);if(actual>510.5)throw new Error("Render melebihi 8:30.");
 await writeJson(path.join(dataDir,"production-manifest.json"),{outputId:id,targetDurationMinutes:durationMinutes,durationSeconds:Number(actual.toFixed(2)),aspectRatio:"16:9",visualStyle:process.env.HORROR_VISUAL_STYLE||"cinematic-3d",video,thumbnail:path.join(outDir,"youtube-thumbnail.jpg"),sceneCount:scenes.length});
 console.log("[render] Selesai:",video,actual.toFixed(1),"detik, 1920x1080.");
} else throw new Error("Stage harus story|images|audio|thumbnail|render.");
