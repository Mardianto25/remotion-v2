import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { AUDIO_DIR, DATA_DIR, OUT_DIR } from "../src/config.js";

const TARGET = 42, MIN = 34, MAX = 48, COUNT = 3;
const STOPWORDS = new Set("yang dan di ke dari itu ini ada aku saya kamu dia mereka kami kita dengan untuk pada dalam saat ketika karena tetapi lalu sudah belum hanya tidak pun adalah akan jadi sangat lebih paling sebuah seorang suatu setelah sebelum oleh hingga tanpa seperti".split(" "));
function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}`)));
  });
}
function parseVtt(vtt) {
  const blocks = vtt.replace(/\r/g, "").split(/\n\n+/);
  return blocks.flatMap(block => {
    const lines = block.split("\n"), line = lines.find(value => value.includes("-->"));
    if (!line) return [];
    const parts = line.split("-->").map(value => value.trim().split(" ")[0]);
    const sec = value => { const p = value.replace(",", ".").split(":").map(Number); return p.length === 3 ? p[0]*3600+p[1]*60+p[2] : p[0]*60+p[1]; };
    const text = lines.slice(lines.indexOf(line)+1).join(" ").replace(/<[^>]+>/g,"").replace(/&amp;/g,"&").trim();
    return text ? [{start:sec(parts[0]),end:sec(parts[1]),text}] : [];
  });
}
function pick(captions,target,duration,used) {
  let best=null, scoreBest=Infinity;
  for (const c of captions) {
    if (c.start >= duration-MIN) continue;
    const endCap=captions.find(x=>x.end>=c.start+MIN && x.end<=c.start+MAX);
    if (!endCap) continue;
    const end=endCap.end;
    if (used.some(r=>c.start<r.end && end>r.start)) continue;
    const score=Math.abs(c.start-target)+Math.abs((end-c.start)-TARGET)*0.35;
    if(score<scoreBest){best={start:c.start,end};scoreBest=score;}
  }
  return best;
}
function buildMetadata(captions, range, index) {
  const transcript = captions.filter(c=>c.start < range.end && c.end > range.start).map(c=>c.text).join(" ").replace(/\s+/g," ").trim();
  const sentence = transcript.split(/(?<=[.!?])\s+/)[0] || transcript;
  let hook = sentence.replace(/^[,.;:!?\s]+|[,.;:!?\s]+$/g,"");
  if (hook.length > 76) hook = hook.slice(0,73).replace(/\s+\S*$/,"") + "...";
  if (hook.length < 12) hook = transcript.slice(0,76).trim();
  const title = `Cerita Horor: ${hook}`.slice(0,100);
  const words = [...new Set((transcript.toLocaleLowerCase("id-ID").match(/[\p{L}\p{N}]{4,}/gu)||[]).filter(w=>!STOPWORDS.has(w)))];
  const tags = [...new Set(["cerita horor","horor indonesia","cerita misteri","kisah mistis","shorts",...words.slice(0,12)])].slice(0,18);
  const hashtags = ["#shorts","#CeritaHoror","#HororIndonesia","#KisahMisteri"];
  const description = [
    `Potongan cerita horor: ${hook || "Ada misteri yang belum terungkap."}.`,
    "",
    transcript.slice(0,650),
    "",
    "Tonton cerita lengkapnya di channel Ruang Cerita Indonesia.",
    "Subscribe untuk cerita horor, misteri, dan kisah mistis lainnya.",
    "",
    hashtags.join(" ")
  ].join("\n").slice(0,4900);
  return { title, description, hashtags, tags, transcript, clipNumber:index };
}
await fs.mkdir(path.join(OUT_DIR,"shorts"),{recursive:true});
const video=path.join(OUT_DIR,"indonesian-horror.mp4");
const vtt=path.join(AUDIO_DIR,"narration.vtt");
await fs.access(video);
const captions=parseVtt(await fs.readFile(vtt,"utf8"));
if(!captions.length) throw new Error("Subtitle narration.vtt tidak ditemukan atau kosong.");
const duration=await new Promise((resolve,reject)=>{
  const child=spawn("ffprobe",["-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1",video]);
  let out="";child.stdout.on("data",c=>out+=c);child.on("error",reject);child.on("close",code=>code===0?resolve(Number(out.trim())):reject(new Error("ffprobe gagal")));
});
if(!Number.isFinite(duration)||duration<=MIN) throw new Error("Video panjang terlalu pendek untuk dipotong.");
const used=[],shorts=[];
for(let i=0;i<COUNT;i++){
  const range=pick(captions,duration*[0.12,0.43,0.73][i],duration,used);
  if(!range){console.warn(`Shorts ${i+1} dilewati: tidak ada rentang subtitle yang cocok.`);continue;}
  used.push(range);
  const id=i+1, file=`short-${String(id).padStart(2,"0")}.mp4`, output=path.join(OUT_DIR,"shorts",file);
  const seconds=range.end-range.start;
  const filter="[0:v]split=2[bg][fg];[bg]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,boxblur=24:8,eq=brightness=-0.22[bgv];[fg]scale=1080:-2[fgv];[bgv][fgv]overlay=(W-w)/2:(H-h)/2,setsar=1,format=yuv420p[v]";
  await run("ffmpeg",["-y","-ss",range.start.toFixed(3),"-i",video,"-t",seconds.toFixed(3),"-filter_complex",filter,"-map","[v]","-map","0:a:0","-c:v","libx264","-preset","veryfast","-crf","22","-c:a","aac","-b:a","160k","-movflags","+faststart",output]);
  const metadata=buildMetadata(captions,range,id);
  shorts.push({id,fileName:file,startSeconds:range.start,durationSeconds:seconds,...metadata});
  console.log(`[Shorts ${id}] ${metadata.title}`);
}
if(!shorts.length) throw new Error("Tidak ada Shorts yang berhasil dibuat.");
await fs.mkdir(DATA_DIR,{recursive:true});
await fs.writeFile(path.join(DATA_DIR,"shorts-manifest.json"),JSON.stringify(shorts,null,2));
await fs.writeFile(path.join(DATA_DIR,"shorts-metadata.json"),JSON.stringify(shorts,null,2));
console.log(`Berhasil membuat ${shorts.length} Shorts dengan SEO berbasis subtitle. Tidak ada panggilan Gemini, FLUX, atau TTS.`);
