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

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const AnimatedShort = ({ segments = [], audioSrc = null }) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const seconds = frame / fps;
  const activeIndex = Math.max(0, segments.findIndex((segment, index) => (
    seconds >= segment.start &&
    (seconds < segment.end || index === segments.length - 1)
  )));
  const active = segments[activeIndex] || segments[0] || {};
  const segmentDuration = Math.max(0.1, (active.end || 1) - (active.start || 0));
  const localProgress = clamp((seconds - (active.start || 0)) / segmentDuration, 0, 1);
  const segmentFrame = Math.max(0, frame - Math.round((active.start || 0) * fps));
  const cameraStyle = active.camera || ['wide', 'medium', 'close', 'orbit', 'wide'][activeIndex % 5];

  const camera = (() => {
    const drift = Math.sin(localProgress * Math.PI) * 0.35;
    switch (cameraStyle) {
      case 'close':
        return { position: [drift * 0.35, 4.0, 10.3], fov: 34 };
      case 'orbit':
        return {
          position: [Math.sin(localProgress * Math.PI * 1.2) * 2.0, 4.8, 12.2],
          fov: 37
        };
      case 'low':
        return { position: [drift, 3.0, 13.0], fov: 39 };
      case 'wide':
        return { position: [drift, 5.3, 16.2], fov: 40 };
      case 'medium':
      default:
        return { position: [drift * 0.7, 4.6, 13.2], fov: 37 };
    }
  })();

  const fadeIn = interpolate(localProgress, [0, 0.12], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });
  const fadeOut = interpolate(localProgress, [0.86, 1], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp'
  });
  const subtitleOpacity = Math.min(fadeIn, fadeOut);

  return (
    <AbsoluteFill style={{ backgroundColor: '#a9c8df' }}>
      <ThreeCanvas
        width={width}
        height={height}
        camera={camera}
        dpr={1}
        shadows
        gl={{ antialias: true, alpha: false }}
        style={{ width: '100%', height: '100%' }}
      >
        <AnimatedWorld frame={segmentFrame} segment={active} />
      </ThreeCanvas>

      <AbsoluteFill
        style={{
          background: 'linear-gradient(180deg, rgba(12,18,24,0.02) 38%, rgba(8,12,18,0.18) 58%, rgba(8,12,18,0.82) 100%)',
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
            pointerEvents: 'none',
            opacity: subtitleOpacity
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
