import React from "react";
import { Composition } from "remotion";
import { FacebookReelsVideo } from "./ShortsVideo.jsx";
import subtitles from "../../public/facebook-reels/subtitles.json";

export const FacebookReelsRoot = () => {
  const fps = 30;
  const lastEnd = subtitles.length ? subtitles[subtitles.length - 1].end : 45;
  const durationInFrames = Math.max(1, Math.ceil(lastEnd * fps));
  return (
    <Composition
      id="FacebookReels"
      component={FacebookReelsVideo}
      durationInFrames={durationInFrames}
      fps={fps}
      width={1080}
      height={1920}
      defaultProps={{ subtitles }}
    />
  );
};
