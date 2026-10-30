import React from 'react';
import { Composition } from 'remotion';
import { ShortsVideo } from './ShortsVideo.jsx';
import subtitles from '../public/subtitles.json';

export const RemotionRoot = () => {
  const fps = 30;
  const lastEnd = subtitles.length > 0 ? subtitles[subtitles.length - 1].end : 10;
  const durationInFrames = Math.max(Math.ceil((lastEnd + 1) * fps), 60);

  return (
    <Composition
      id="ShortsVideo"
      component={ShortsVideo}
      durationInFrames={durationInFrames}
      fps={fps}
      width={1080}
      height={1920}
      defaultProps={{ subtitles }}
    />
  );
};
