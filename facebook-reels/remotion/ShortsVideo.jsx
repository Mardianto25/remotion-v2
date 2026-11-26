import React from "react";
import {
  AbsoluteFill, Audio, Img, staticFile, useCurrentFrame, useVideoConfig,
  interpolate, spring
} from "remotion";

export const FacebookReelsVideo = ({ subtitles = [] }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const time = frame / fps;
  let index = 0;
  for (let i = 0; i < subtitles.length; i++) {
    if (time >= subtitles[i].start) index = i;
    else break;
  }
  const scene = subtitles[index];
  const active = time >= scene.start && time < scene.end;
  const localFrame = Math.max(0, frame - scene.start * fps);
  const sceneFrames = Math.max(1, (scene.end - scene.start) * fps);
  const scale = interpolate(localFrame, [0, sceneFrames], [1, 1.12], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp"
  });
  const fade = interpolate(localFrame, [0, 12], [0, 1], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp"
  });
  const textSpring = spring({
    frame: active ? Math.max(0, frame - scene.start * fps) : 0,
    fps, config: { damping: 15, stiffness: 115, mass: 0.65 }
  });
  return (
    <AbsoluteFill style={{ backgroundColor: "#08090d" }}>
      <AbsoluteFill style={{ overflow: "hidden" }}>
        <Img src={staticFile(scene.image)} style={{
          width: "100%", height: "100%", objectFit: "cover",
          transform: "scale(" + scale + ")", opacity: fade
        }} />
      </AbsoluteFill>
      <AbsoluteFill style={{
        background: "linear-gradient(180deg, rgba(0,0,0,.12) 5%, rgba(0,0,0,.08) 42%, rgba(0,0,0,.68) 100%)"
      }} />
      {active && (
        <AbsoluteFill style={{
          justifyContent: "flex-end", alignItems: "center",
          padding: "0 86px 270px", textAlign: "center"
        }}>
          <div style={{
            color: "#fff", fontFamily: "Arial, sans-serif",
            fontSize: 58, lineHeight: 1.28, fontWeight: 700,
            textShadow: "0 3px 12px rgba(0,0,0,.95)",
            opacity: textSpring,
            transform: "translateY(" + ((1 - textSpring) * 16) + "px)",
            maxWidth: "100%"
          }}>{scene.text}</div>
        </AbsoluteFill>
      )}
      <Audio src={staticFile("facebook-reels/audio.wav")} />
    </AbsoluteFill>
  );
};
