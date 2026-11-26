import React from "react";
import fs from "node:fs";
import path from "node:path";
import { Composition } from "remotion";
import { FacebookReel } from "./Video.jsx";

const dataPath = path.resolve("out/facebook-reels/scenes.json");
const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const durationInFrames = 45 * 30;

export const RemotionRoot = () => (
  <Composition
    id="FacebookReel"
    component={FacebookReel}
    durationInFrames={durationInFrames}
    fps={data.fps || 30}
    width={data.width || 1080}
    height={data.height || 1920}
    defaultProps={{ scenes: data.scenes }}
  />
);
