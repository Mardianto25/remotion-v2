import React from "react";
import fs from "node:fs";
import path from "node:path";
import { Composition } from "remotion";
import { AnimatedShort } from "../../src/animated/AnimatedShort.jsx";

const storyPath = path.resolve("out/facebook-reels/animation-story.json");
const story = JSON.parse(fs.readFileSync(storyPath, "utf8"));
const durationInFrames = Math.ceil(story.durationSeconds * (story.fps || 30));

export const FacebookAnimatedRoot = () => (
  <Composition
    id="FacebookAnimatedReel"
    component={AnimatedShort}
    durationInFrames={durationInFrames}
    fps={story.fps || 30}
    width={story.width || 1080}
    height={story.height || 1920}
    defaultProps={{
      segments: story.segments,
      audioSrc: "narration.wav"
    }}
  />
);
