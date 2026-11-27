import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const root=process.cwd(), dataDir=path.join(root,"data"), publicDir=path.join(root,"public");
const assetsDir=path.join(publicDir,"assets"), audioDir=path.join(publicDir,"audio");
for(const dir of [dataDir,assetsDir,audioDir,path.join(root,"out")]) await fs.mkdir(dir,{recursive:true});
const run=(cmd,args)=>new Promise((resolve,reject)=>{const p=spawn(cmd,args,{stdio:"inherit"});p.on("error",reject);p.on("close",c=>c===0?resolve():reject(new Error(cmd+" exited "+c)));});
let story;
try{story=JSON.parse(await fs.readFile(path.join(dataDir,"story.json"),"utf8"));}catch{throw new Error("Run npm run generate:story first.");}
if(!process.env.CF_ACCOUNT_ID||!process.env.CF_API_TOKEN) throw new Error("CF_ACCOUNT_ID and CF_API_TOKEN are required.");
const imageModel=process.env.CF_IMAGE_MODEL||"@cf/black-forest-labs/flux-1-schnell";
const assets=[];
for(let i=0;i<story.scenes.length;i++){
 const scene=story.scenes[i], fileName="scene-"+String(i+1).padStart(2,"0")+".png";
 console.log("[visual] Scene "+(i+1)+"/"+story.scenes.length);
 const response=await fetch("https://api.cloudflare.com/client/v4/accounts/"+process.env.CF_ACCOUNT_ID+"/ai/run/"+imageModel,{method:"POST",headers:{Authorization:"Bearer "+process.env.CF_API_TOKEN,"Content-Type":"application/json"},body:JSON.stringify({prompt:scene.visualPrompt+". Maintain identical recurring character face, age, hair, skin tone, proportions and clothing. Premium cinematic 3D CGI, atmospheric mystery, volumetric lighting, detailed environment, vertical portrait 9:16, no text, no watermark.",steps:4})});
 if(!response.ok) throw new Error("FLUX scene "+(i+1)+" failed HTTP "+response.status+": "+(await response.text()).slice(0,500));
 const payload=await response.json(); if(!payload?.result?.image) throw new Error("No image returned for scene "+(i+1));
 await fs.writeFile(path.join(assetsDir,fileName),Buffer.from(payload.result.image,"base64")); assets.push(fileName);
}
const audioPath=path.join(audioDir,"narration.mp3"), subtitlePath=path.join(audioDir,"narration.vtt");
await run(process.env.PYTHON_BIN||"python",["-m","edge_tts","--voice",process.env.EDGE_TTS_VOICE||"en-US-GuyNeural","--rate=-4%","--pitch=+0Hz","--text",story.narration,"--write-media",audioPath,"--write-subtitles",subtitlePath]);
const vtt=(await fs.readFile(subtitlePath,"utf8")).replace(/\r/g,"");
const parseTime=v=>{const [h,m,s]=v.replace(",",".").split(":");return Number(h)*3600+Number(m)*60+Number(s);};
const captions=vtt.split(/\n\n+/).flatMap(block=>{const lines=block.split("\n"), timing=lines.find(x=>x.includes("-->"));if(!timing)return[];const [start,end]=timing.split("-->").map(x=>x.trim().split(" ")[0]);const text=lines.slice(lines.indexOf(timing)+1).join(" ").replace(/<[^>]+>/g,"").trim();return text?[{start:parseTime(start),end:parseTime(end),text}]:[];});
const duration=await new Promise((resolve,reject)=>{const p=spawn("ffprobe",["-v","error","-show_entries","format=duration","-of","default=noprint_wrappers=1:nokey=1",audioPath]);let out="";p.stdout.on("data",x=>out+=x);p.on("error",reject);p.on("close",c=>c===0?resolve(Number(out.trim())):reject(new Error("ffprobe failed")));});
if(!Number.isFinite(duration)||duration<35||duration>59) throw new Error("Narration "+duration.toFixed(1)+"s outside 35-59s Shorts target. Regenerate the story.");
const fps=30,totalFrames=Math.ceil(duration*fps),weights=story.scenes.map(s=>Math.max(1,String(s.narration||"").trim().split(/\s+/).length)),total=weights.reduce((a,b)=>a+b,0);
let cursor=0;const scenes=story.scenes.map((scene,i)=>{const startFrame=cursor,durationInFrames=i===story.scenes.length-1?totalFrames-startFrame:Math.max(1,Math.round(totalFrames*weights[i]/total));cursor+=durationInFrames;return{fileName:assets[i],startFrame,durationInFrames};});
const manifest={title:story.title,description:story.description,hashtags:story.hashtags||[],fps,durationInFrames:totalFrames,durationSeconds:Number(duration.toFixed(2)),scenes,captions};
await fs.writeFile(path.join(root,"remotion","generatedStory.js"),"export const generatedStory = "+JSON.stringify(manifest,null,2)+";\n");
await fs.writeFile(path.join(dataDir,"render-manifest.json"),JSON.stringify(manifest,null,2));
console.log("[build] Story assets and English narration ready: "+duration.toFixed(1)+"s");
