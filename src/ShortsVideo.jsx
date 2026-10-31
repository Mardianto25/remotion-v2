import React from 'react';
import { AbsoluteFill, Audio, Img, staticFile, useCurrentFrame, useVideoConfig, interpolate, spring } from 'remotion';

export const ShortsVideo = ({ subtitles = [] }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;

  // Cari segmen kalimat yang aktif saat ini
  const activeIndex = subtitles.findIndex(
    (s) => currentTime >= s.start && currentTime <= s.end
  );
  
  const activeSegment = activeIndex !== -1 
    ? subtitles[activeIndex] 
    : (subtitles[subtitles.length - 1] || {
        text: '',
        image: 'https://images.pexels.com/photos/167699/pexels-photo-167699.jpeg?auto=compress&cs=tinysrgb&fit=crop&w=1080&h=1920',
        start: 0,
        end: 5
      });

  // Hitung durasi dan animasi transisi masuk (fade & zoom halus) untuk setiap segmen baru
  const segmentDurationFrames = Math.max((activeSegment.end - activeSegment.start) * fps, 1);
  const frameInSegment = Math.max(frame - activeSegment.start * fps, 0);

  // Efek Ken Burns (Zoom perlahan yang dinamis)
  const scale = interpolate(frameInSegment, [0, segmentDurationFrames], [1, 1.15], {
    extrapolateRight: 'clamp'
  });

  // Efek transisi muncul (Fade In + Sedikit geser ke atas) untuk teks agar terasa hidup
  const textSpring = spring({
    frame: frameInSegment,
    fps,
    config: {
      damping: 12, // Membuat gerakan lebih natural dan kenyal halus
      mass: 0.5,
      stiffness: 100,
    },
  });

  const textOpacity = interpolate(textSpring, [0, 1], [0, 1]);
  const textTranslateY = interpolate(textSpring, [0, 1], [30, 0]);

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {/* Latar Belakang Gambar dengan Transisi Halus */}
      {activeSegment.image && (
        <AbsoluteFill style={{ overflow: 'hidden' }}>
          <Img
            src={activeSegment.image}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transform: `scale(${scale})`,
              transition: 'opacity 0.5s ease-in-out'
            }}
          />
          {/* Gradasi gelap elegan agar teks sangat kontras dan mudah dibaca */}
          <AbsoluteFill style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.2), rgba(0,0,0,0.65))' }} />
        </AbsoluteFill>
      )}

      {/* Kontainer Subtitle dengan Efek Animasi Keren */}
      <AbsoluteFill
        style={{
          justifyContent: 'center',
          alignItems: 'center',
          padding: '0 70px',
          textAlign: 'center'
        }}
      >
        <div
          style={{
            color: '#ffffff',
            fontSize: '54px',
            fontWeight: '800',
            fontFamily: 'system-ui, sans-serif',
            lineHeight: 1.4,
            opacity: textOpacity,
            transform: `translateY(${textTranslateY}px)`,
            textShadow: '0 4px 25px rgba(0,0,0,0.9), 0 2px 8px rgba(0,0,0,0.9)',
            backgroundColor: 'rgba(0, 0, 0, 0.4)',
            backdropFilter: 'blur(6px)', // Efek kaca buram (glassmorphism) yang modern
            padding: '30px 40px',
            borderRadius: '28px',
            border: '1px solid rgba(255, 255, 255, 0.15)'
          }}
        >
          {activeSegment.text}
        </div>
      </AbsoluteFill>

      {/* Audio Utama */}
      <Audio src={staticFile('audio.mp3')} />
    </AbsoluteFill>
  );
};
