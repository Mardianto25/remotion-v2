import React from 'react';
import { Composition } from 'remotion';
import { ShortsVideo } from './ShortsVideo.jsx';
import { AnimatedShort } from './animated/AnimatedShort.jsx';
import { defaultAnimatedSegments } from './animated/story.js';
import subtitles from '../public/subtitles.json';

export const RemotionRoot = () => {
  const fps = 30;
  const lastEnd = subtitles.length > 0 ? subtitles[subtitles.length - 1].end : 10;
  const durationInFrames = Math.max(Math.ceil((lastEnd + 1) * fps), 60);
  const animatedDurationInFrames = Math.ceil(
    defaultAnimatedSegments[defaultAnimatedSegments.length - 1].end * fps
  );

  return (
    <>
      <Composition
        id="ShortsVideo"
        component={ShortsVideo}
        durationInFrames={durationInFrames}
        fps={fps}
        width={1080}
        height={1920}
        defaultProps={{ subtitles }}
      />
      <Composition
        id="AnimatedStoryShort"
        component={AnimatedShort}
        durationInFrames={animatedDurationInFrames}
        fps={fps}
        width={1080}
        height={1920}
        defaultProps={{
          segments: defaultAnimatedSegments,
          audioSrc: null
        }}
      />
    </>
  );
};
