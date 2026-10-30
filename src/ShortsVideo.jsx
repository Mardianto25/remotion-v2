import React from 'react';
import { AbsoluteFill, Audio, Img, staticFile, useCurrentFrame, useVideoConfig, interpolate } from 'remotion';

export const ShortsVideo = ({ subtitles = [] }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;

  const activeSegment = subtitles.find(
    (s) => currentTime >= s.start && currentTime <= s.end
  ) || subtitles[subtitles.length - 1] || {
    text: '',
    image: '[https://images.pexels.com/photos/167699/pexels-photo-167699.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1080&h=1920](https://images.pexels.com/photos/167699/pexels-photo-167699.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1080&h=1920)',
    start: 0,
    end: 5
  };

  const segmentDurationFrames = Math.max((activeSegment.end - activeSegment.start) * fps, 1);
  const frameInSegment = Math.max(frame - activeSegment.start * fps, 0);
  const scale = interpolate(frameInSegment, [0, segmentDurationFrames], [1, 1.12], {
    extrapolateRight: 'clamp'
  });

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {activeSegment.image && (
        <AbsoluteFill style={{ overflow: 'hidden' }}>
          <Img
            src={activeSegment.image}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transform: `scale(${scale})`
            }}
          />
          <AbsoluteFill style={{ background: 'rgba(0, 0, 0, 0.35)' }} />
        </AbsoluteFill>
      )}

      <AbsoluteFill
        style={{
          justifyContent: 'center',
          alignItems: 'center',
          padding: '0 80px',
          textAlign: 'center'
        }}
      >
        <div
          style={{
            color: '#ffffff',
            fontSize: '58px',
            fontWeight: '800',
            fontFamily: 'sans-serif',
            lineHeight: 1.35,
            textShadow: '0 4px 20px rgba(0,0,0,0.85), 0 2px 6px rgba(0,0,0,0.9)',
            backgroundColor: 'rgba(0, 0, 0, 0.45)',
            padding: '28px 36px',
            borderRadius: '24px'
          }}
        >
          {activeSegment.text}
        </div>
      </AbsoluteFill>

      <Audio src={staticFile('audio.mp3')} />
    </AbsoluteFill>
  );
};
