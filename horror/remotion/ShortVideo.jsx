import React from "react";
import { AbsoluteFill, Audio, Img, Sequence, staticFile, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { generatedShorts } from "./generatedShorts.js";

const Caption = ({ captions }) => {
  const frame = useCurrentFrame();
  const seconds = frame / 30;
  const active = captions?.find(c => seconds >= c.start && seconds <= c.end);
  if (!active) return null;
  return <div style={{
    position: "absolute", left: 54, right: 54, bottom: 300,
    textAlign: "center", color: "#fff", fontSize: 58, fontWeight: 900,
    lineHeight: 1.16, letterSpacing: 0.2,
    textShadow: "0 4px 14px #000, 0 0 5px #000",
    background: "rgba(0,0,0,.58)", padding: "20px 24px", borderRadius: 18
  }}>{active.text}</div>;
};

const ShortScene = ({ scene }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const progress = interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [0, 1], { extrapolateRight: "clamp" });
  const scale = interpolate(progress, [0, 1], [1.04, 1.16]);
  return <AbsoluteFill style={{ backgroundColor: "#050505", overflow: "hidden" }}>
    <Img src={staticFile("assets/" + scene.fileName)} style={{
      width: "100%", height: "100%", objectFit: "cover",
      transform: `scale(${scale})`, filter: "brightness(.72)"
    }} />
    <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,.35), transparent 30%, rgba(0,0,0,.08) 55%, rgba(0,0,0,.72))" }} />
  </AbsoluteFill>;
};

export const ShortVideo = ({ shortIndex = 0 }) => {
  const short = generatedShorts[shortIndex];
  if (!short) return <AbsoluteFill style={{ backgroundColor: "#000", color: "#fff", justifyContent: "center", alignItems: "center" }}>Shorts belum dibuat</AbsoluteFill>;
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const showEndCard = frame >= durationInFrames - 75;
  return <AbsoluteFill style={{ backgroundColor: "#000" }}>
    {short.scenes.map((scene, index) => <Sequence key={`${scene.fileName}-${index}`} from={scene.startFrame} durationInFrames={scene.durationInFrames}>
      <ShortScene scene={scene} />
    </Sequence>)}
    <Audio src={staticFile("audio/" + short.audioFile)} />
    <AbsoluteFill style={{ top: 76, left: 54, right: 54, bottom: "auto", height: 110 }}>
      <div style={{ color: "white", fontSize: 35, fontWeight: 900, letterSpacing: 2, textShadow: "0 3px 12px #000" }}>RUANG CERITA INDONESIA</div>
    </AbsoluteFill>
    <Caption captions={short.captions} />
    {showEndCard && <AbsoluteFill style={{
      background: "rgba(0,0,0,.82)", justifyContent: "center", alignItems: "center",
      padding: 70, textAlign: "center"
    }}>
      <div style={{ color: "#fff", fontSize: 66, fontWeight: 900, lineHeight: 1.15 }}>TONTON CERITA LENGKAPNYA</div>
      <div style={{ color: "#ddd", fontSize: 38, marginTop: 28 }}>Ruang Cerita Indonesia</div>
    </AbsoluteFill>}
  </AbsoluteFill>;
};
