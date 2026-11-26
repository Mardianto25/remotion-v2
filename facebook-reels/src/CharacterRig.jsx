import React from "react";

const SKIN = { light: "#e4b99a", medium: "#ad7658", deep: "#754a38" };
const OUTFITS = {
  koko: "#e8dfca",
  abaya: "#303746",
  casual_modest: "#6d8291",
  school_uniform: "#d7d9d5",
  workwear: "#647b72"
};
const AGE_SCALE = { child: 0.78, young_adult: 0.98, adult: 1, elderly: 0.96 };
const CAPSULE = [0.115, 0.34, 5, 8];

function Limb({ color, length = 0.68, radius = 0.12 }) {
  return (
    <mesh position={[0, -length / 2, 0]} castShadow>
      <capsuleGeometry args={[radius, length, 5, 8]} />
      <meshStandardMaterial color={color} roughness={0.82} />
    </mesh>
  );
}

function Arm({ side, skin, sleeve, pose, elbowPose = 0 }) {
  return (
    <group name={`shoulder-${side}`} position={[side * 0.43, 1.93, 0]} rotation={[0, 0, pose]}>
      <mesh position={[0, -0.34, 0]} castShadow>
        <capsuleGeometry args={CAPSULE} />
        <meshStandardMaterial color={sleeve} roughness={0.9} />
      </mesh>
      <group name={`elbow-${side}`} position={[0, -0.68, 0]} rotation={[0, 0, elbowPose]}>
        <Limb color={sleeve} length={0.56} radius={0.105} />
        <mesh position={[0, -0.62, 0.015]} castShadow>
          <sphereGeometry args={[0.115, 10, 8]} />
          <meshStandardMaterial color={skin} roughness={0.88} />
        </mesh>
      </group>
    </group>
  );
}

function Leg({ side, skin, trousers, pose, kneePose = 0 }) {
  return (
    <group name={`hip-${side}`} position={[side * 0.2, 0.95, 0]} rotation={[pose, 0, 0]}>
      <mesh position={[0, -0.35, 0]} castShadow>
        <capsuleGeometry args={[0.145, 0.55, 5, 8]} />
        <meshStandardMaterial color={trousers} roughness={0.92} />
      </mesh>
      <group name={`knee-${side}`} position={[0, -0.67, 0]} rotation={[kneePose, 0, 0]}>
        <Limb color={trousers} length={0.55} radius={0.125} />
        <mesh position={[0, -0.62, 0.11]} castShadow>
          <boxGeometry args={[0.25, 0.12, 0.42]} />
          <meshStandardMaterial color="#292b30" roughness={0.9} />
        </mesh>
      </group>
    </group>
  );
}

function Headwear({ type, skin }) {
  if (type === "peci") {
    return (
      <mesh position={[0, 2.67, 0]} castShadow>
        <cylinderGeometry args={[0.34, 0.36, 0.2, 16]} />
        <meshStandardMaterial color="#17191e" roughness={0.9} />
      </mesh>
    );
  }
  if (type === "hijab") {
    return (
      <group>
        <mesh position={[0, 2.43, -0.025]} scale={[0.43, 0.58, 0.43]} castShadow>
          <sphereGeometry args={[1, 18, 14]} />
          <meshStandardMaterial color="#343d4b" roughness={0.95} />
        </mesh>
        <mesh position={[0, 1.98, -0.02]} scale={[0.53, 0.46, 0.28]} castShadow>
          <sphereGeometry args={[1, 16, 10]} />
          <meshStandardMaterial color="#343d4b" roughness={0.98} />
        </mesh>
      </group>
    );
  }
  return null;
}

/**
 * Frame-deterministic articulated character rig.
 * Each limb is attached to a shoulder/hip pivot so poses are repeatable in Remotion.
 */
export const CharacterRig = ({
  profile = {},
  action = "standing",
  emotion = "calm",
  frame = 0,
  position = [0, 0, 1.5],
  rotation = 0
}) => {
  const gender = profile.gender === "female" ? "female" : "male";
  const skin = SKIN[profile.skinTone] || SKIN.medium;
  const outfit = OUTFITS[profile.outfit] || OUTFITS.koko;
  const trousers = gender === "female" ? outfit : "#394958";
  const headwear = gender === "female" ? "hijab" : (profile.headwear || "peci");
  const scale = AGE_SCALE[profile.ageGroup] || 1;
  const walking = action === "walking";
  const sitting = action === "sitting" || action === "prayer_jalsa";
  const bowing = action === "prayer_ruku";
  const sujud = action === "prayer_sujud";
  const dua = action === "dua";
  const qiyam = action === "prayer_qiyam";
  const crying = emotion === "sad" || action === "crying";
  const cycle = Math.sin(frame / 5.2);
  const walk = walking ? cycle * 0.42 : 0;
  const bob = walking ? Math.abs(cycle) * 0.045 : Math.sin(frame / 24) * 0.012;
  const armUp = dua ? 2.45 : 0;
  const armFold = qiyam ? 1.05 : 0;
  const leftArm = dua ? -armUp : qiyam ? -armFold : walking ? -walk * 0.72 : crying ? -0.32 : 0;
  const rightArm = dua ? armUp : qiyam ? armFold : walking ? walk * 0.72 : crying ? 0.32 : 0;
  const torsoTilt = bowing ? -0.95 : sujud ? -1.35 : sitting ? 0.15 : 0;
  const headTilt = crying ? 0.28 : action === "looking_up" ? -0.24 : 0;
  const legLeft = sitting ? -1.05 : sujud ? -1.3 : walking ? walk : 0;
  const legRight = sitting ? -1.05 : sujud ? -1.3 : walking ? -walk : 0;
  const kneeLeft = sitting ? 1.35 : sujud ? 1.7 : 0;
  const kneeRight = sitting ? 1.35 : sujud ? 1.7 : 0;

  return (
    <group name={`character-${profile.id || "dynamic"}`} position={[position[0], position[1] + bob, position[2]]} rotation={[0, rotation, 0]} scale={scale}>
      <group name="spine" rotation={[torsoTilt, 0, 0]}>
        <mesh position={[0, 1.43, 0]} castShadow receiveShadow>
          <capsuleGeometry args={[0.39, 0.76, 7, 12]} />
          <meshStandardMaterial color={outfit} roughness={0.92} />
        </mesh>
        <mesh position={[0, 1.94, 0]} castShadow>
          <cylinderGeometry args={[0.16, 0.17, 0.2, 10]} />
          <meshStandardMaterial color={skin} roughness={0.9} />
        </mesh>
        <group name="neck-head" position={[0, headTilt, 0]}>
          <mesh position={[0, 2.36, 0.02]} castShadow>
            <sphereGeometry args={[0.39, 18, 14]} />
            <meshStandardMaterial color={skin} roughness={0.88} />
          </mesh>
          {gender === "male" && profile.beard && profile.beard !== "none" && (
            <mesh position={[0, 2.12, 0.27]} scale={[0.72, 0.55, 0.35]} castShadow>
              <sphereGeometry args={[0.23, 12, 9]} />
              <meshStandardMaterial color="#302b29" roughness={1} />
            </mesh>
          )}
          <mesh position={[-0.13, 2.39, 0.365]}>
            <sphereGeometry args={[0.027, 8, 8]} />
            <meshBasicMaterial color="#171717" />
          </mesh>
          <mesh position={[0.13, 2.39, 0.365]}>
            <sphereGeometry args={[0.027, 8, 8]} />
            <meshBasicMaterial color="#171717" />
          </mesh>
          <Headwear type={headwear} skin={skin} />
        </group>
        <Arm side={-1} skin={skin} sleeve={outfit} pose={leftArm} elbowPose={dua ? 0.5 : qiyam ? 1.1 : 0} />
        <Arm side={1} skin={skin} sleeve={outfit} pose={rightArm} elbowPose={dua ? -0.5 : qiyam ? -1.1 : 0} />
      </group>
      <Leg side={-1} skin={skin} trousers={trousers} pose={legLeft} kneePose={kneeLeft} />
      <Leg side={1} skin={skin} trousers={trousers} pose={legRight} kneePose={kneeRight} />
    </group>
  );
};
