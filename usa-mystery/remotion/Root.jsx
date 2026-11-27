import React from "react";
import { Composition } from "remotion";
import { USAMysteryShort } from "./USAMysteryShort.jsx";
import { generatedStory } from "./generatedStory.js";
export const Root=()=> <Composition id="USAMysteryShort" component={USAMysteryShort} durationInFrames={Math.max(1,generatedStory.durationInFrames||1500)} fps={generatedStory.fps||30} width={1080} height={1920}/>;
