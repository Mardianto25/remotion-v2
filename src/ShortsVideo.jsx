
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
  const fadeDuration = 0.45;

  // Cari scene yang sedang aktif
  const activeIndex = subtitles.findIndex(
    (s) => currentTime >= s.start && currentTime < s.end
  );

  // Cari scene terakhir yang sudah dimulai.
  // Ini menjaga gambar tetap tampil saat jeda antar-subtitle.
  let sceneIndex = -1;

  for (let i = 0; i < subtitles.length; i++) {
    if (currentTime >= subtitles[i].start) {
      sceneIndex = i;
    } else {
      break;
    }
  }

  const activeSegment = sceneIndex >= 0
    ? subtitles[sceneIndex]
    : subtitles[0];

  if (!activeSegment) {
    return (
      <AbsoluteFill style={{ backgroundColor: '#111' }}>
        <Audio src={staticFile('audio.mp3')} />
      </AbsoluteFill>
    );
  }

  // Durasi scene
  const frameInSegment = Math.max(
    0,
    frame - activeSegment.start * fps
  );

  const segmentDurationFrames = Math.max(
    1,
    (activeSegment.end - activeSegment.start) * fps
  );

  // Ken Burns
  const scale = sceneIndex % 2 === 0
    ? interpolate(
        frameInSegment,
        [0, segmentDurationFrames],
        [1, 1.15],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
      )
    : interpolate(
        frameInSegment,
        [0, segmentDurationFrames],
        [1.15, 1],
        { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
      );

  // Image source
  const getImageSrc = (segment) => {
    if (!segment?.image) return null;

    return segment.image.startsWith('http')
      ? segment.image
      : staticFile(segment.image);
  };

  // Scene sebelumnya dan sekarang
  const previousSegment = sceneIndex > 0
    ? subtitles[sceneIndex - 1]
    : null;

  const currentImage = getImageSrc(activeSegment);
  const previousImage = getImageSrc(previousSegment);

  // Transisi hanya di awal scene baru
  const transitionProgress = interpolate(
    frameInSegment,
    [0, Math.max(1, fadeDuration * fps)],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // Subtitle hanya tampil ketika berada dalam rentang waktunya
  const hasActiveSubtitle = activeIndex >= 0;

  const textFrame = hasActiveSubtitle
    ? Math.max(0, frame - activeSegment.start * fps)
    : 0;

  const textSpring = spring({
    frame: textFrame,
    fps,
    config: {
      damping: 14,
      mass: 0.6,
      stiffness: 120
    }
  });

  const textTranslateY = interpolate(
    textSpring,
    [0, 1],
    [40, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  return (
    <AbsoluteFill style={{ backgroundColor: '#111' }}>

      {/* GAMBAR SEBELUMNYA */}
      {previousImage && frameInSegment < fadeDuration * fps && (
        <AbsoluteFill style={{ overflow: 'hidden' }}>
          <Img
            src={previousImage}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              opacity: 1 - transitionProgress
            }}
          />
        </AbsoluteFill>
      )}

      {/* GAMBAR SEKARANG */}
      {currentImage && (
        <AbsoluteFill style={{ overflow: 'hidden' }}>
          <Img
            src={currentImage}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transform: `scale(${scale})`,
              opacity: previousImage ? transitionProgress : 1
            }}
          />
        </AbsoluteFill>
      )}

      {/* GRADIENT */}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(to bottom, rgba(0,0,0,0.2), rgba(0,0,0,0.55))'
        }}
      />

      {/* SUBTITLE */}
      {hasActiveSubtitle && (
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
              color: '#fff',
              fontSize: 52,
              fontWeight: 800,
              fontFamily: 'system-ui, sans-serif',
              lineHeight: 1.35,
              opacity: textSpring,
              transform: `translateY(${textTranslateY}px)`,
              textShadow:
                '3px 3px 12px rgba(0,0,0,0.95), 0 0 25px rgba(0,0,0,0.8)',
              padding: '0 15px',
              maxWidth: '90%'
            }}
          >
            {activeSegment.text}
          </div>
        </AbsoluteFill>
      )}

      <Audio src={staticFile('audio.mp3')} />

    </AbsoluteFill>
  );
};
