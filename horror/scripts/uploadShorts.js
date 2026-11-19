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
const privacyStatus=process.env.YOUTUBE_SHORTS_PRIVACY_STATUS||"public";
if(!["private","unlisted","public"].includes(privacyStatus)) throw new Error("YOUTUBE_SHORTS_PRIVACY_STATUS tidak valid.");
for(const item of shorts) {
  if(state.uploaded?.[item.id]?.videoId) {
    console.log(`Shorts ${item.id} sudah pernah di-upload: ${state.uploaded[item.id].videoId}; dilewati.`);
    continue;
  }
  const file=path.join(OUT_DIR,"shorts",item.fileName);
  await fs.access(file);
  const hashtags=Array.isArray(item.hashtags)?item.hashtags:[];
  const description=[item.description||"",...(!String(item.description||"").includes("#shorts")?["#shorts"]:[])].join("\n");
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
      status:{privacyStatus,selfDeclaredMadeForKids:false}
    },
    media:{body:createReadStream(file)}
  });
  const videoId=result.data.id;
  if(!videoId) throw new Error(`YouTube tidak mengembalikan video ID untuk Shorts ${item.id}.`);
  state.uploaded[item.id]={videoId,title:item.title,privacyStatus,url:`https://www.youtube.com/shorts/${videoId}`};
  await fs.writeFile(statePath,JSON.stringify(state,null,2));
  console.log(`Shorts ${item.id} berhasil di-upload: https://www.youtube.com/shorts/${videoId}`);
}
console.log("Selesai upload Shorts. Channel: "+channelTitle+"; status: "+privacyStatus);
