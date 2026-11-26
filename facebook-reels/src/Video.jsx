import React from "react";
import { AbsoluteFill, Audio, Img, Sequence, interpolate, staticFile, useCurrentFrame } from "remotion";

export const FacebookReel = ({ scenes = [] }) => {
  const frame = useCurrentFrame();
  const seconds = frame / 30;
  const active = scenes.find((scene, index) =>
    seconds >= scene.start && (seconds < scene.end || index === scenes.length - 1)
  ) || scenes[0];

  if (!active) return <AbsoluteFill style={{ backgroundColor: "#111" }} />;

  const localFrame = Math.max(0, frame - active.start * 30);
  const scale = interpolate(localFrame, [0, 8 * 30], [1, 1.09], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });
  const showSubtitle = seconds >= active.start && seconds < active.end;

  return (
    <AbsoluteFill style={{ backgroundColor: "#080808" }}>
      <Img
        src={staticFile(active.image)}
        style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${scale})` }}
      />
      <AbsoluteFill style={{
        background: "linear-gradient(180deg, rgba(0,0,0,.12) 0%, rgba(0,0,0,.12) 42%, rgba(0,0,0,.78) 100%)"
      }} />
      {showSubtitle && (
        <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", padding: "0 86px 300px" }}>
          <div style={{
            color: "white", fontFamily: "Arial, sans-serif", fontSize: 54,
            fontWeight: 700, lineHeight: 1.25, textAlign: "center",
            textShadow: "0 3px 12px rgba(0,0,0,.95)", maxWidth: 920
          }}>{active.text}</div>
        </AbsoluteFill>
      )}
      <Audio src={staticFile("narration.wav")} />
    </AbsoluteFill>
  );
};
