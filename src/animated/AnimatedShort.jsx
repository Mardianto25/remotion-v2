import React from 'react';
import { ThreeCanvas } from '@remotion/three';
import {
  AbsoluteFill,
  Audio,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig
} from 'remotion';
import { AnimatedWorld } from './AnimatedWorld.jsx';

export const AnimatedShort = ({ segments = [], audioSrc = null }) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const seconds = frame / fps;
  const progress = interpolate(frame, [0, durationInFrames], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });

  const active = segments.find((segment, index) => (
    seconds >= segment.start &&
    (seconds < segment.end || index === segments.length - 1)
  )) || segments[0];

  const segmentIndex = Math.max(0, segments.indexOf(active));
  const cameraOffset = segmentIndex * 0.12;

  return (
    <AbsoluteFill style={{ backgroundColor: '#a9c8df' }}>
      <ThreeCanvas
        width={width}
        height={height}
        camera={{
          fov: 38,
          position: [
            Math.sin(progress * Math.PI * 1.2 + cameraOffset) * 0.7,
            5.1 - progress * 0.55,
            14 - progress * 3.2
          ]
        }}
        dpr={1}
        shadows
        gl={{ antialias: true, alpha: false }}
        style={{ width: '100%', height: '100%' }}
      >
        <AnimatedWorld frame={frame} segment={active || {}} />
      </ThreeCanvas>

      <AbsoluteFill
        style={{
          background: 'linear-gradient(180deg, rgba(12,18,24,0.02) 45%, rgba(8,12,18,0.72) 100%)',
          pointerEvents: 'none'
        }}
      />

      {active?.text && (
        <AbsoluteFill
          style={{
            justifyContent: 'flex-end',
            alignItems: 'center',
            padding: '0 82px 250px',
            textAlign: 'center',
            pointerEvents: 'none'
          }}
        >
          <div
            style={{
              maxWidth: 920,
              color: '#fff',
              fontFamily: 'Arial, sans-serif',
              fontSize: 54,
              fontWeight: 700,
              lineHeight: 1.25,
              textShadow: '0 3px 12px rgba(0,0,0,0.95)'
            }}
          >
            {active.text}
          </div>
        </AbsoluteFill>
      )}

      {audioSrc ? <Audio src={staticFile(audioSrc)} /> : null}
    </AbsoluteFill>
  );
};
