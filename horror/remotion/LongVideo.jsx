import React from "react";
import { AbsoluteFill, Audio, Img, Sequence, staticFile, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { generatedLongStory } from "./generatedLongStory.js";
const Caption = () => {
  const frame = useCurrentFrame();
  const seconds = frame / (generatedLongStory.fps || 30);
  const active = generatedLongStory.captions?.find(item => seconds >= item.start && seconds <= item.end);
  if (!active) return null;
  return <div style={{ position: "absolute", left: 180, right: 180, bottom: 92, textAlign: "center", color: "#fff", fontSize: 42, fontWeight: 800, lineHeight: 1.25, textShadow: "0 3px 14px #000", background: "rgba(0,0,0,.35)", padding: "14px 24px", borderRadius: 12 }}>{active.text}</div>;
};
const Scene = ({ scene }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const progress = interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [0, 1], { extrapolateRight: "clamp" });
  const scale = interpolate(progress, [0, 1], [1.02, 1.09]);
  const direction = Number(scene.id || 0) % 2 === 0 ? 1 : -1;
  const x = interpolate(progress, [0, 1], [0, direction * 24]);
  return <AbsoluteFill style={{ backgroundColor: "#080808", overflow: "hidden" }}>
    <Img src={staticFile(generatedLongStory.assetPrefix + "/assets/" + scene.fileName)} style={{ width: "100%", height: "100%", objectFit: "cover", transform: "scale(" + scale + ") translateX(" + x + "px)" }} />
    <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,.12), transparent 55%, rgba(0,0,0,.48))" }} />
  </AbsoluteFill>;
};
export const LongVideo = () => <AbsoluteFill style={{ backgroundColor: "#000" }}>
  {generatedLongStory.scenes.map(scene => <Sequence key={scene.fileName} from={scene.startFrame} durationInFrames={scene.durationInFrames}><Scene scene={scene} /></Sequence>)}
  <Audio src={staticFile(generatedLongStory.assetPrefix + "/audio/narration.mp3")} volume={1} />
  <Caption />
  <AbsoluteFill style={{ top: 34, left: 64, right: 64, bottom: "auto", height: 40, alignItems: "flex-end" }}>
    <div style={{ color: "rgba(255,255,255,.6)", fontSize: 18, fontWeight: 700, letterSpacing: 3, textTransform: "uppercase" }}>RUANG CERITA INDONESIA</div>
  </AbsoluteFill>
</AbsoluteFill>;
