
import React from 'react';

import {
  AbsoluteFill,
  Audio,
  Img,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring
} from 'remotion';

export const ShortsVideo = ({ subtitles = [] }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const currentTime = frame / fps;

  // ==========================================================
  // ACTIVE SCENE
  // ==========================================================

  const activeIndex = subtitles.findIndex(
    (s) =>
      currentTime >= s.start &&
      currentTime < s.end
  );

  let safeIndex = activeIndex;

  if (safeIndex === -1 && subtitles.length > 0) {
    safeIndex =
      currentTime < subtitles[0].start
        ? 0
        : subtitles.length - 1;
  }

  const activeSegment =
    safeIndex >= 0
      ? subtitles[safeIndex]
      : {
          text: '',
          image: '',
          start: 0,
          end: 5
        };

  // ==========================================================
  // SCENE TIMING
  // ==========================================================

  const segmentDurationFrames = Math.max(
    (activeSegment.end - activeSegment.start) * fps,
    1
  );

  const frameInSegment = Math.max(
    frame - activeSegment.start * fps,
    0
  );

  // ==========================================================
  // KEN BURNS EFFECT
  // ==========================================================

  const isEvenIndex = safeIndex % 2 === 0;

  const scale = isEvenIndex
    ? interpolate(
        frameInSegment,
        [0, segmentDurationFrames],
        [1, 1.15],
        {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp'
        }
      )
    : interpolate(
        frameInSegment,
        [0, segmentDurationFrames],
        [1.15, 1],
        {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp'
        }
      );

  // ==========================================================
  // IMAGE FADE
  // ==========================================================

  const fadeDuration = Math.max(
    Math.round(fps * 0.45),
    1
  );

  const imageOpacity = interpolate(
    frameInSegment,
    [0, fadeDuration],
    [0, 1],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp'
    }
  );

  // ==========================================================
  // SUBTITLE ANIMATION
  // ==========================================================

  const textSpring = spring({
    frame: frameInSegment,
    fps,
    config: {
      damping: 14,
      mass: 0.6,
      stiffness: 120
    }
  });

  const textOpacity = interpolate(
    textSpring,
    [0, 1],
    [0, 1],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp'
    }
  );

  const textTranslateY = interpolate(
    textSpring,
    [0, 1],
    [40, 0],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp'
    }
  );

  // ==========================================================
  // IMAGE SOURCE
  // ==========================================================

  const imageSrc = activeSegment.image
    ? activeSegment.image.startsWith('http')
      ? activeSegment.image
      : staticFile(activeSegment.image)
    : null;

  // ==========================================================
  // RENDER
  // ==========================================================

  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#000'
      }}
    >

      {/* BACKGROUND IMAGE */}

      {imageSrc && (
        <AbsoluteFill
          style={{
            overflow: 'hidden'
          }}
        >
          <Img
            src={imageSrc}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transform: `scale(${scale})`,
              opacity: imageOpacity
            }}
          />

          {/* DARK GRADIENT */}

          <AbsoluteFill
            style={{
              background:
                'linear-gradient(to bottom, rgba(0,0,0,0.2), rgba(0,0,0,0.55))'
            }}
          />
        </AbsoluteFill>
      )}

      {/* SUBTITLE */}

      <AbsoluteFill
        style={{
          justifyContent: 'center',
          alignItems: 'center',
          padding: '0 60px',
          textAlign: 'center'
        }}
      >
        <div
          style={{
            color: '#ffffff',
            fontSize: 52,
            fontWeight: 800,
            fontFamily: 'system-ui, sans-serif',
            lineHeight: 1.35,

            opacity: textOpacity,

            transform: `translateY(${textTranslateY}px)`,

            textShadow:
              '3px 3px 12px rgba(0,0,0,0.95), 0 0 25px rgba(0,0,0,0.8), 0 2px 4px rgba(0,0,0,0.9)',

            padding: '0 15px',
            maxWidth: '90%'
          }}
        >
          {activeSegment.text}
        </div>
      </AbsoluteFill>

      {/* AUDIO */}

      <Audio
        src={staticFile('audio.mp3')}
      />

    </AbsoluteFill>
  );
};
