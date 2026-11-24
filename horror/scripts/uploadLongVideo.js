import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { createReadStream } from "node:fs";
import { google } from "googleapis";
import { LONG_DATA_DIR, LONG_OUT_DIR } from "../src/config.js";

const id=String(process.env.LONG_VIDEO_ID||"").replace(/[^a-z0-9-]/gi,"");
if(!id)throw new Error("LONG_VIDEO_ID wajib diisi.");
for(const key of ["YOUTUBE_CLIENT_ID_3N","YOUTUBE_CLIENT_SECRET_3N","YOUTUBE_REFRESH_TOKEN_3N"])if(!process.env[key])throw new Error("GitHub Secret belum diatur: "+key);
const dataDir=path.join(LONG_DATA_DIR,id),outDir=path.join(LONG_OUT_DIR,id);
const videoPath=path.join(outDir,"long-video.mp4"),thumbnailPath=path.join(outDir,"youtube-thumbnail.jpg"),metadataPath=path.join(dataDir,"youtube-metadata.json"),statePath=path.join(dataDir,"youtube-upload.json");
for(const file of [videoPath,thumbnailPath,metadataPath])await fs.access(file);
const metadata=JSON.parse(await fs.readFile(metadataPath,"utf8"));
const mode=String(process.env.LONG_VIDEO_UPLOAD_MODE||"new_video");
if(!["new_video","retry_thumbnail"].includes(mode))throw new Error("Mode upload tidak valid.");
const oauth=new google.auth.OAuth2(process.env.YOUTUBE_CLIENT_ID_3N,process.env.YOUTUBE_CLIENT_SECRET_3N);
oauth.setCredentials({refresh_token:process.env.YOUTUBE_REFRESH_TOKEN_3N});
const youtube=google.youtube({version:"v3",auth:oauth});
const {data:channels}=await youtube.channels.list({part:["snippet"],mine:true});
const channel=channels.items?.[0];if(!channel)throw new Error("OAuth tidak memiliki akses ke channel YouTube.");
const expected=(process.env.YOUTUBE_CHANNEL_NAME_3N||"Ruang Cerita Indonesia").trim().toLocaleLowerCase("id-ID");
const actual=String(channel.snippet?.title||"").trim().toLocaleLowerCase("id-ID");
if(actual!==expected)throw new Error('Channel tidak cocok. Expected "'+expected+'", actual "'+actual+'".');
let state={channelId:channel.id,channelTitle:channel.snippet?.title};
try{state={...state,...JSON.parse(await fs.readFile(statePath,"utf8"))};}catch(e){if(e.code!=="ENOENT")throw e;}
if(state.channelId!==channel.id)throw new Error("State upload berasal dari channel berbeda.");
const save=()=>fs.writeFile(statePath,JSON.stringify(state,null,2)+"\n");
async function setThumbnail(){
 if(!state.videoId)throw new Error("Video ID belum tersedia.");
 const result=await youtube.thumbnails.set({videoId:state.videoId,media:{mimeType:"image/jpeg",body:createReadStream(thumbnailPath)}});
 if(!result.data?.items?.length)throw new Error("YouTube tidak mengonfirmasi pemasangan thumbnail.");
 state.thumbnailUploaded=true;state.thumbnailUpdatedAt=new Date().toISOString();state.thumbnailAspectRatio="16:9";await save();
}
if(mode==="retry_thumbnail"){
 if(!state.videoId)throw new Error("Belum ada videoId untuk retry. Jalankan mode new_video terlebih dahulu.");
 await setThumbnail();console.log("Thumbnail berhasil diperbarui:",state.url);process.exit(0);
}
const description=String(metadata.description||"").slice(0,4900);
const {data}=await youtube.videos.insert({
 part:["snippet","status"],
 requestBody:{snippet:{title:String(metadata.title||"Video Cerita Indonesia").slice(0,100),description,tags:[...new Set([...(metadata.tags||[]),"cerita indonesia","storytelling"])].slice(0,18),categoryId:"22",defaultLanguage:"id",defaultAudioLanguage:"id"},status:{privacyStatus:"private",selfDeclaredMadeForKids:false}},
 media:{body:createReadStream(videoPath)}
});
if(!data.id)throw new Error("YouTube tidak mengembalikan video ID.");
state={...state,videoId:data.id,title:metadata.title,privacyStatus:"private",uploadedAt:new Date().toISOString(),url:"https://www.youtube.com/watch?v="+data.id,thumbnailUploaded:false};
await save();
await setThumbnail();
console.log("Upload Long Video PRIVATE berhasil:",state.url);
