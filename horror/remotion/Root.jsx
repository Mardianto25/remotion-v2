import React from "react";
import { Composition } from "remotion";
import { HorrorVideo } from "./HorrorVideo.jsx";
import { ShortVideo } from "./ShortVideo.jsx";
import { generatedStory } from "./generatedStory.js";
import { generatedShorts } from "./generatedShorts.js";

export const Root = () => (
  <>
    <Composition
      id="HorrorVideo"
      component={HorrorVideo}
      durationInFrames={Math.max(1, generatedStory.durationInFrames || 1800)}
      fps={generatedStory.fps || 30}
      width={1080}
      height={1920}
    />
    {generatedShorts.map((short, index) => (
      <Composition
        key={short.id}
        id={`HorrorShort-${short.id}`}
        component={ShortVideo}
        defaultProps={{ shortIndex: index }}
        durationInFrames={Math.max(1, short.durationInFrames)}
        fps={short.fps || 30}
        width={1080}
        height={1920}
      />
    ))}
  </>
);
