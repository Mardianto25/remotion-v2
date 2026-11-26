import React from "react";
import { ThreeCanvas } from "@remotion/three";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import { AnimatedWorld } from "../../src/animated/AnimatedWorld.jsx";

export const Facebook3DScenePlate = ({ segments = [], characterProfiles = [] }) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const seconds = frame / fps;
  const index = Math.max(0, segments.findIndex((segment, i) =>
    seconds >= segment.start && (seconds < segment.end || i === segments.length - 1)
  ));
  const active = segments[index] || segments[0] || {};
  const localFrame = Math.max(0, frame - Math.round((active.start || 0) * fps));
  const progress = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp"
  });
  const camera = active.camera || {};
  const cameraX = Number.isFinite(camera.x) ? camera.x : Math.sin(index * 0.7 + progress * 1.5) * 0.42;
  const cameraY = Number.isFinite(camera.y) ? camera.y : 4.2;
  const cameraZ = Number.isFinite(camera.z) ? camera.z : 12.5;

  return (
    <AbsoluteFill style={{ backgroundColor: "#101722" }}>
      <ThreeCanvas
        width={width}
        height={height}
        camera={{ fov: 34, position: [cameraX, cameraY, cameraZ] }}
        dpr={1}
        shadows
        gl={{ antialias: true, alpha: false }}
        style={{ width: "100%", height: "100%" }}
      >
        <AnimatedWorld
          frame={localFrame}
          segment={active}
          characterProfiles={characterProfiles}
        />
      </ThreeCanvas>
    </AbsoluteFill>
  );
};
