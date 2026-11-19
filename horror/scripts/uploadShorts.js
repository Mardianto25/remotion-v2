import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { createReadStream } from "node:fs";
import { google } from "googleapis";
import { CHANNEL_NAME, DATA_DIR, OUT_DIR } from "../src/config.js";

for (const key of ["YOUTUBE_CLIENT_ID","YOUTUBE_CLIENT_SECRET","YOUTUBE_REFRESH_TOKEN_V2"]) {
  if (!process.env[key]) throw new Error("GitHub Secret belum diatur: " + key);
}
const oauth = new google.auth.OAuth2(process.env.YOUTUBE_CLIENT_ID,process.env.YOUTUBE_CLIENT_SECRET);
oauth.setCredentials({refresh_token:process.env.YOUTUBE_REFRESH_TOKEN_V2});
const youtube=google.youtube({version:"v3",auth:oauth});
const {data:channelData}=await youtube.channels.list({part:["snippet"],mine:true});
const channel=channelData.items?.[0];
if(!channel) throw new Error("Token OAuth tidak memiliki akses ke channel YouTube.");
const channelTitle=channel.snippet?.title||"";
if(!channelTitle.toLocaleLowerCase("id-ID").includes(CHANNEL_NAME.toLocaleLowerCase("id-ID"))) {
  throw new Error(`Channel tujuan tidak cocok. Diharapkan "${CHANNEL_NAME}", token mengarah ke "${channelTitle}". Upload dibatalkan.`);
}
const metadataPath=path.join(DATA_DIR,"shorts-metadata.json");
const statePath=path.join(DATA_DIR,"shorts-upload-state.json");
const shorts=JSON.parse(await fs.readFile(metadataPath,"utf8"));
let state={channelId:channel.id,channelTitle,uploaded:{}};
try { state={...state,...JSON.parse(await fs.readFile(statePath,"utf8"))}; } catch(e) { if(e.code!=="ENOENT") throw e; }
if(state.channelId!==channel.id) throw new Error("State upload berasal dari channel berbeda. Upload dibatalkan.");

const offsetMs=7*60*60*1000;
const jakartaNow=new Date(Date.now()+offsetMs);
const eligibleDays=new Set([2,4,6]); // Selasa, Kamis, Sabtu
function nextShortsSlot(after) {
  const local=new Date(after.getTime()+offsetMs);
  for(let dayOffset=0;dayOffset<15;dayOffset++) {
    const candidate=new Date(Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate()+dayOffset,12,30,0));
    if(!eligibleDays.has(candidate.getUTCDay())) continue;
    const utc=new Date(candidate.getTime());
    if(utc.getTime()>=after.getTime()+2*60*60*1000) return utc;
  }
  throw new Error("Tidak menemukan slot Shorts dalam 15 hari.");
}
let nextAfter=new Date(Date.now());
for(const item of shorts) {
  if(state.uploaded?.[item.id]?.videoId) {
    console.log(`Shorts ${item.id} sudah pernah di-upload: ${state.uploaded[item.id].videoId}; dilewati.`);
    continue;
  }
  const file=path.join(OUT_DIR,"shorts",item.fileName);
  await fs.access(file);
  const publishAt=nextShortsSlot(nextAfter);
  nextAfter=new Date(publishAt.getTime()+60*1000);
  const hashtags=Array.isArray(item.hashtags)?item.hashtags:[];
  const description=[item.description||"",...(!String(item.description||"").toLowerCase().includes("#shorts")?["#shorts"]:[])].join("\n");
  const result=await youtube.videos.insert({
    part:["snippet","status"],
    requestBody:{
      snippet:{
        title:String(item.title||"Cerita Horor #shorts").slice(0,100),
        description:description.slice(0,4900),
        tags:[...new Set([...(item.tags||[]),"shorts","cerita horor","horor indonesia"])].slice(0,18),
        categoryId:"24",
        defaultLanguage:"id",
        defaultAudioLanguage:"id"
      },
      status:{privacyStatus:"private",publishAt:publishAt.toISOString(),selfDeclaredMadeForKids:false}
    },
    media:{body:createReadStream(file)}
  });
  const videoId=result.data.id;
  if(!videoId) throw new Error(`YouTube tidak mengembalikan video ID untuk Shorts ${item.id}.`);
  state.uploaded[item.id]={videoId,title:item.title,privacyStatus:"private",publishAt:publishAt.toISOString(),url:`https://www.youtube.com/shorts/${videoId}`};
  await fs.writeFile(statePath,JSON.stringify(state,null,2));
  console.log(`Shorts ${item.id} di-upload sebagai private dan dijadwalkan ${publishAt.toLocaleString("id-ID",{timeZone:"Asia/Jakarta"})} WIB: https://www.youtube.com/shorts/${videoId}`);
}
console.log("Selesai upload dan menjadwalkan Shorts. Channel: "+channelTitle+". Semua video diunggah private dengan jadwal publikasi.");
