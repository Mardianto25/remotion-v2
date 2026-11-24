import React from "react";
import { Composition } from "remotion";
import { HorrorVideo } from "./HorrorVideo.jsx";
import { ShortVideo } from "./ShortVideo.jsx";
import { LongVideo } from "./LongVideo.jsx";
import { generatedLongStory } from "./generatedLongStory.js";
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
    <Composition id="LongVideo" component={LongVideo} durationInFrames={Math.max(1, generatedLongStory.durationInFrames || 9000)} fps={generatedLongStory.fps || 30} width={1920} height={1080} />
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
