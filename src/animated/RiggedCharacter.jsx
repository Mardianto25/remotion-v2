import React, { useEffect, useMemo } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import { staticFile } from 'remotion';
import { AnimationMixer, LoopOnce, LoopRepeat } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';

const ACTION_CLIPS = {
  walking: 'Walk',
  standing: 'Idle',
  dua: 'Thinking',
  looking_up: 'Look Around',
  sitting: 'Sitting Idle',
  prayer_sitting: 'Sitting On Ground',
  reading: 'Sitting Idle',
  working: 'Thinking',
  crying: 'Kneeling',
  embracing: 'Idle',
  washing: 'Idle',
  kneeling: 'Kneeling',
  ruku: 'Bow',
  sujud: 'Kneeling'
};

const findClip = (clips, name) =>
  clips.find((clip) => clip.name.toLowerCase() === name.toLowerCase()) ||
  clips.find((clip) => clip.name.toLowerCase() === 'idle') ||
  clips[0];

/**
 * Skinned humanoid character. The GLB contains the mesh, 65-bone Mixamo-style
 * skeleton and animation clips. The mixer is driven by Remotion's frame number
 * so renders remain deterministic instead of depending on wall-clock delta.
 */
export const RiggedCharacter = ({ frame = 0, action = 'standing' }) => {
  const gltf = useLoader(GLTFLoader, staticFile('models/mannequin-man.glb'));
  const model = useMemo(() => clone(gltf.scene), [gltf]);
  const mixer = useMemo(() => new AnimationMixer(model), [model]);
  const clipName = ACTION_CLIPS[action] || 'Idle';
  const clip = useMemo(() => findClip(gltf.animations, clipName), [gltf.animations, clipName]);

  useEffect(() => {
    mixer.stopAllAction();
    if (!clip) return undefined;
    const animation = mixer.clipAction(clip);
    animation.reset();
    animation.enabled = true;
    if (clipName === 'Bow') {
      animation.setLoop(LoopOnce, 1);
      animation.clampWhenFinished = true;
    } else {
      animation.setLoop(LoopRepeat, Infinity);
    }
    animation.play();
    return () => mixer.stopAllAction();
  }, [mixer, clip]);

  useFrame(() => {
    mixer.setTime(Math.max(0, frame) / 30);
  });

  return (
    <group position={[0, 0, 1.5]} scale={1.08}>
      <primitive object={model} />
    </group>
  );
};
