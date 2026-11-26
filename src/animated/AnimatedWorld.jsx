import React from "react";
import { CharacterRig } from "../../facebook-reels/src/CharacterRig.jsx";

const MOODS = {
  reflective: { sky: "#899eb5", ground: "#667b72", light: "#dce6f2", sun: "#e6cda8" },
  sad: { sky: "#5f7188", ground: "#4f625d", light: "#c3d0df", sun: "#9eb2c9" },
  hopeful: { sky: "#e9b985", ground: "#82966a", light: "#fff0cf", sun: "#ffe0a4" },
  peaceful: { sky: "#a9c8df", ground: "#78966a", light: "#fff1d5", sun: "#fff0c7" },
  night: { sky: "#1d2d48", ground: "#293f3b", light: "#b8cce9", sun: "#b8cce9" }
};

const Building = ({ x, z, height = 4.5, width = 3, color = "#c9b08e", roofColor = "#765b50" }) => (
  <group position={[x, 0, z]}>
    <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
      <boxGeometry args={[width, height, 2.4]} />
      <meshStandardMaterial color={color} roughness={0.92} />
    </mesh>
    <mesh position={[0, height + 0.12, 0]} castShadow>
      <coneGeometry args={[width * 0.78, 1.05, 4]} />
      <meshStandardMaterial color={roofColor} roughness={1} />
    </mesh>
    {[-0.32, 0.32].map((windowX) => (
      <mesh key={windowX} position={[windowX * width, height * 0.58, 1.215]}>
        <planeGeometry args={[0.42, 0.62]} />
        <meshBasicMaterial color="#f5dca7" />
      </mesh>
    ))}
    <mesh position={[0, 0.8, 1.225]}>
      <planeGeometry args={[0.62, 1.45]} />
      <meshBasicMaterial color="#513b35" />
    </mesh>
  </group>
);

const Tree = ({ x, z, scale = 1 }) => (
  <group position={[x, 0, z]} scale={scale}>
    <mesh position={[0, 0.8, 0]}>
      <cylinderGeometry args={[0.12, 0.18, 1.6, 7]} />
      <meshStandardMaterial color="#75513a" />
    </mesh>
    <mesh position={[0, 2, 0]}>
      <sphereGeometry args={[0.85, 10, 8]} />
      <meshStandardMaterial color="#557b4d" roughness={1} />
    </mesh>
  </group>
);

const Mosque = () => (
  <group position={[0, 0, -5]}>
    <mesh position={[0, 2.5, 0]} castShadow receiveShadow>
      <boxGeometry args={[9, 5, 4]} />
      <meshStandardMaterial color="#d8c9a9" roughness={0.9} />
    </mesh>
    <mesh position={[0, 5.15, 0]} castShadow>
      <sphereGeometry args={[2.05, 24, 14, 0, Math.PI * 2, 0, Math.PI / 2]} />
      <meshStandardMaterial color="#537e79" metalness={0.12} roughness={0.7} />
    </mesh>
    <mesh position={[0, 0.9, 2.02]}>
      <planeGeometry args={[1.45, 2.1]} />
      <meshBasicMaterial color="#4a3d34" />
    </mesh>
    {[-3.65, 3.65].map((x) => (
      <group key={x} position={[x, 0, 0]}>
        <mesh position={[0, 3.25, 0]} castShadow>
          <cylinderGeometry args={[0.42, 0.55, 6.5, 12]} />
          <meshStandardMaterial color="#d7c7a5" roughness={0.9} />
        </mesh>
        <mesh position={[0, 6.7, 0]}>
          <coneGeometry args={[0.48, 1.2, 12]} />
          <meshStandardMaterial color="#547c76" roughness={0.8} />
        </mesh>
        <mesh position={[0, 7.45, 0]}>
          <sphereGeometry args={[0.12, 10, 8]} />
          <meshStandardMaterial color="#d8b978" metalness={0.6} />
        </mesh>
      </group>
    ))}
  </group>
);

export const AnimatedWorld = ({ frame = 0, segment = {}, characterProfiles = [] }) => {
  const mood = MOODS[segment.mood] || MOODS.peaceful;
  const setting = segment.setting || "street";
  const showBuildings = ["street", "home", "hospital", "bedroom"].includes(setting);
  const showTrees = ["garden", "courtyard", "street"].includes(setting);
  const actions = Array.isArray(segment.characters) ? segment.characters : [];
  const profiles = new Map(characterProfiles.map((profile) => [profile.id, profile]));
  const fallbackProfile = characterProfiles[0] || {
    id: "lead", gender: "male", ageGroup: "adult", skinTone: "medium",
    outfit: "koko", headwear: "peci", beard: "short"
  };
  const cast = actions.length ? actions : [{ id: fallbackProfile.id, action: segment.action || "standing", position: "center" }];

  return (
    <>
      <color attach="background" args={[mood.sky]} />
      <fog attach="fog" args={[mood.sky, 18, 44]} />
      <ambientLight intensity={segment.mood === "night" ? 0.62 : 1.05} color={mood.light} />
      <directionalLight position={[-5, 10, 7]} intensity={segment.mood === "night" ? 1.0 : 2.25} color={mood.sun} castShadow />
      <pointLight position={[4, 6, 1]} intensity={0.55} color="#ffd9a1" />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.08, 0]} receiveShadow>
        <planeGeometry args={[90, 90]} />
        <meshStandardMaterial color={mood.ground} roughness={1} />
      </mesh>
      {setting === "street" && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.045, -1]}>
          <planeGeometry args={[5.2, 70]} />
          <meshStandardMaterial color="#827c75" roughness={1} />
        </mesh>
      )}
      {setting === "mosque" && <Mosque />}
      {showBuildings && (
        <>
          <Building x={-5.5} z={-3} height={5.4} width={3.2} color={setting === "hospital" ? "#d8e1e3" : "#c88f70"} roofColor="#754d46" />
          <Building x={5.4} z={-5} height={6.2} width={3.6} color={setting === "bedroom" ? "#b9a9a0" : "#d6b98d"} roofColor="#765b50" />
          {setting !== "home" && <Building x={-6.4} z={5} height={4.3} width={3.4} color="#e0c6a0" roofColor="#8a5e4c" />}
        </>
      )}
      {showTrees && (
        <>
          <Tree x={-3.8} z={-1.5} scale={1.1} />
          <Tree x={4.0} z={-2.8} scale={0.9} />
          <Tree x={-4.4} z={4.2} scale={0.85} />
          <Tree x={4.7} z={5.2} scale={1.05} />
        </>
      )}
      {cast.slice(0, 3).map((entry, index) => {
        const profile = profiles.get(entry.id) || fallbackProfile;
        const horizontal = entry.position === "left" ? -1.65 : entry.position === "right" ? 1.65 : cast.length > 1 ? (index - (cast.length - 1) / 2) * 1.65 : 0;
        return (
          <CharacterRig
            key={entry.id || index}
            profile={profile}
            action={entry.action || "standing"}
            emotion={entry.emotion || segment.mood || "calm"}
            frame={frame}
            position={[horizontal, 0, 1.8 + index * 0.15]}
            rotation={entry.facing === "away" ? Math.PI : entry.facing === "left" ? -0.25 : 0}
          />
        );
      })}
    </>
  );
};
