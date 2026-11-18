import React from "react";
import { Composition } from "remotion";
import { HorrorVideo } from "./HorrorVideo.jsx";
import { generatedStory } from "./generatedStory.js";
export const Root = () => (
  <Composition id="HorrorVideo" component={HorrorVideo}
    durationInFrames={Math.max(1, generatedStory.durationInFrames || 1800)}
    fps={generatedStory.fps || 30} width={1920} height={1080} />
);
