import React from "react";
import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig
} from "remotion";

export const FacebookHybridReel = ({
  segments = [],
  plateSrc = "3d-plate.mp4",
  audioSrc = "narration.wav"
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const seconds = frame / fps;
  const index = Math.max(0, segments.findIndex((segment, i) =>
    seconds >= segment.start && (seconds < segment.end || i === segments.length - 1)
  ));
  const active = segments[index] || segments[0];
  const showSubtitle = Boolean(active && seconds >= active.start && seconds < active.end);
  const localFrame = active ? Math.max(0, frame - Math.round(active.start * fps)) : 0;
  const fade = interpolate(localFrame, [0, 8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "#090d12" }}>
      <OffthreadVideo
        src={staticFile(plateSrc)}
        muted
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
      <AbsoluteFill style={{
        background: "linear-gradient(180deg, rgba(0,0,0,.08) 0%, rgba(0,0,0,.04) 48%, rgba(0,0,0,.76) 100%)",
        pointerEvents: "none"
      }} />
      {showSubtitle && (
        <AbsoluteFill style={{
          justifyContent: "flex-end",
          alignItems: "center",
          padding: "0 82px 285px",
          textAlign: "center",
          pointerEvents: "none"
        }}>
          <div style={{
            maxWidth: 920,
            color: "#fff",
            fontFamily: "Arial, sans-serif",
            fontSize: 52,
            fontWeight: 700,
            lineHeight: 1.25,
            opacity: fade,
            transform: `translateY(${(1 - fade) * 14}px)`,
            textShadow: "0 3px 14px rgba(0,0,0,.95)"
          }}>
            {active.text}
          </div>
        </AbsoluteFill>
      )}
      <Audio src={staticFile(audioSrc)} />
    </AbsoluteFill>
  );
};
