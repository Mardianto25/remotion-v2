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
          {/* Gradasi gelap tipis di latar belakang agar gambar tetap estetik */}
          <AbsoluteFill style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.1), rgba(0,0,0,0.4))' }} />
        </AbsoluteFill>
      )}

      {/* Kontainer Subtitle Dinamis (Tanpa background hitam / glassmorphism) */}
      <AbsoluteFill
        style={{
          justifyContent: 'center',
          alignItems: 'center',
          padding: '0 50px',
          textAlign: 'center'
        }}
      >
        <div
          style={{
            color: '#ffffff',
            fontSize: '56px',
            fontWeight: '800',
            fontFamily: 'system-ui, sans-serif',
            lineHeight: 1.3,
            opacity: textOpacity,
            transform: `translateY(${textTranslateY}px)`,
            // Mengandalkan bayangan teks yang kuat agar tetap sangat kontras terbaca di berbagai latar belakang
            textShadow: '3px 3px 12px rgba(0,0,0,0.95), 0 0 25px rgba(0,0,0,0.8), 0 2px 4px rgba(0,0,0,0.9)',
            padding: '0 10px',
            maxWidth: '90%'
          }}
        >
          {activeSegment.text}
        </div>
      </AbsoluteFill>

      {/* Audio Utama */}
      <Audio staticFile={staticFile('audio.mp3')} src={staticFile('audio.mp3')} />
    </AbsoluteFill>
  );
};
