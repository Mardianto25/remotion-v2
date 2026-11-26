import React from "react";
import fs from "node:fs";
import path from "node:path";
import { Composition } from "remotion";
import { Facebook3DScenePlate } from "./ScenePlate.jsx";
import { FacebookHybridReel } from "./HybridReel.jsx";

const storyPath = path.resolve("out/facebook-reels/animation-story.json");
const story = JSON.parse(fs.readFileSync(storyPath, "utf8"));
const fps = story.fps || 30;
const durationInFrames = Math.max(1, Math.ceil(story.durationSeconds * fps));
const sharedProps = {
  segments: story.segments || [],
  characterProfiles: story.characterProfiles || []
};

export const FacebookAnimatedRoot = () => (
  <>
    <Composition
      id="Facebook3DPlate"
      component={Facebook3DScenePlate}
      durationInFrames={durationInFrames}
      fps={fps}
      width={story.width || 1080}
      height={story.height || 1920}
      defaultProps={sharedProps}
    />
    <Composition
      id="FacebookHybridReel"
      component={FacebookHybridReel}
      durationInFrames={durationInFrames}
      fps={fps}
      width={story.width || 1080}
      height={story.height || 1920}
      defaultProps={{
        segments: story.segments || [],
        plateSrc: "3d-plate.mp4",
        audioSrc: "narration.wav"
      }}
    />
  </>
);
