import React from "react";
import { AbsoluteFill, Audio, Img, Sequence, staticFile, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { generatedStory } from "./generatedStory.js";

const Caption = () => {
  const frame = useCurrentFrame();
  const seconds = frame / (generatedStory.fps || 30);
  const active = generatedStory.captions?.find(c => seconds >= c.start && seconds <= c.end);
  if (!active) return null;
  return <div style={{
    position: "absolute", top: "50%", left: 72, right: 72, transform: "translateY(-50%)", textAlign: "center",
    color: "white", fontSize: 39, fontWeight: 900, lineHeight: 1.3,
    textShadow: "0 3px 12px #000, 0 0 4px #000", background: "rgba(0,0,0,.28)",
    padding: "12px 22px", borderRadius: 10
  }}>{active.text}</div>;
};

const Scene = ({ scene }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const progress = interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [0, 1], { extrapolateRight: "clamp" });
  const scale = interpolate(progress, [0, 1], [1.02, 1.12]);
  const reverse = Number(scene.id || 0) % 2 === 0;
  const x = interpolate(progress, [0, 1], reverse ? [0, 22] : [0, -22]);
  const y = interpolate(progress, [0, 1], reverse ? [0, -10] : [0, 8]);
  return <AbsoluteFill style={{ backgroundColor: "#080808", overflow: "hidden" }}>
    <Img src={staticFile("assets/" + scene.fileName)} style={{
      width: "100%", height: "100%", objectFit: "cover",
      transform: "scale(" + scale + ") translate(" + x + "px, " + y + "px)"
    }} />
    <AbsoluteFill style={{ background: "linear-gradient(180deg, rgba(0,0,0,.12), transparent 45%, rgba(0,0,0,.55))" }} />
  </AbsoluteFill>;
};

export const HorrorVideo = () => {
  const { durationInFrames } = useVideoConfig();
  const music = generatedStory.musicBed;
  const musicVolume = frame => interpolate(
    frame,
    [0, 45, Math.max(46, durationInFrames - 60), durationInFrames],
    [0, music?.volume ?? 0.12, music?.volume ?? 0.12, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );
  return <AbsoluteFill style={{ backgroundColor: "#000" }}>
  {generatedStory.scenes.map(scene => <Sequence key={scene.fileName} from={scene.startFrame} durationInFrames={scene.durationInFrames}>
    <Scene scene={scene} />
  </Sequence>)}
  {generatedStory.soundBeds?.map((bed, index) => <Sequence key={"bed-" + index} from={bed.startFrame} durationInFrames={bed.durationInFrames}>
    <Audio src={staticFile("audio/sfx/" + bed.asset)} loop volume={bed.volume ?? 0.16} />
  </Sequence>)}
  {generatedStory.soundEffects?.map((effect, index) => <Sequence key={"sfx-" + index} from={effect.startFrame}>
    <Audio src={staticFile("audio/sfx/" + effect.asset)} volume={effect.volume ?? 0.28} />
  </Sequence>)}
  {music?.asset && <Audio src={staticFile("audio/" + music.asset)} volume={musicVolume} />}
  <Audio src={staticFile("audio/narration.mp3")} volume={1} />
  <Caption />
  <AbsoluteFill style={{ top: 26, left: 48, right: 48, bottom: "auto", height: 36, alignItems: "flex-end" }}>
    <div style={{ color: "rgba(255,255,255,.55)", fontSize: 16, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>RUANG CERITA INDONESIA</div>
  </AbsoluteFill>
  </AbsoluteFill>;
};
