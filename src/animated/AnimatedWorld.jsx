import React from 'react';

const MOODS = {
  reflective: { sky: '#899eb5', ground: '#687a66', light: '#dce6f2' },
  sad: { sky: '#66778d', ground: '#596b60', light: '#c6d3e0' },
  hopeful: { sky: '#efbd8c', ground: '#82966a', light: '#fff0c9' },
  peaceful: { sky: '#a9c8df', ground: '#78966a', light: '#fff1d5' },
  night: { sky: '#25354f', ground: '#34483f', light: '#c3d7ff' }
};

const Building = ({ x, z, height, width, color, roofColor }) => (
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
      <sphereGeometry args={[0.85, 8, 7]} />
      <meshStandardMaterial color="#557b4d" roughness={1} />
    </mesh>
  </group>
};

const Character = ({ frame, action = 'standing' }) => {
  const walking = action === 'walking';
  const praying = action === 'dua';
  const lookingUp = action === 'looking_up';
  const walk = walking ? Math.sin(frame / 5) * 0.22 : 0;
  const bob = walking ? Math.abs(Math.sin(frame / 5)) * 0.08 : 0;
  const armPose = praying ? -1.15 : lookingUp ? -0.35 : walk;

  return (
    <group position={[0, bob, 1.5]}>
      {/* Original recurring story character: Indonesian Muslim adult, cream koko and black peci. */}
      <mesh position={[0, 1.35, 0]} castShadow>
        <capsuleGeometry args={[0.43, 0.82, 5, 10]} />
        <meshStandardMaterial color="#e8ddc9" roughness={1} />
      </mesh>
      <mesh position={[0, 2.25, 0.02]} castShadow>
        <sphereGeometry args={[0.58, 16, 12]} />
        <meshStandardMaterial color="#a96f4e" roughness={1} />
      </mesh>
      <mesh position={[0, 2.55, 0.04]}>
        <sphereGeometry args={[0.56, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.52]} />
        <meshStandardMaterial color="#211d20" roughness={1} />
      </mesh>
      <mesh position={[0, 2.79, 0.02]}>
        <cylinderGeometry args={[0.38, 0.4, 0.22, 12]} />
        <meshStandardMaterial color="#20232b" roughness={1} />
      </mesh>
      {[-0.19, 0.19].map((x) => (
        <mesh key={x} position={[x, 2.28, 0.53]}>
          <circleGeometry args={[0.045, 10]} />
          <meshBasicMaterial color="#211c1c" />
        </mesh>
      ))}
      <mesh position={[0, 2.04, 0.55]}>
        <sphereGeometry args={[0.2, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
        <meshStandardMaterial color="#342629" roughness={1} />
      </mesh>
      <mesh position={[-0.48, 1.48, 0]} rotation={[0, 0, armPose]}>
        <capsuleGeometry args={[0.12, 0.72, 3, 6]} />
        <meshStandardMaterial color="#e8ddc9" />
      </mesh>
      <mesh position={[0.48, 1.48, 0]} rotation={[0, 0, -armPose]}>
        <capsuleGeometry args={[0.12, 0.72, 3, 6]} />
        <meshStandardMaterial color="#e8ddc9" />
      </mesh>
      <mesh position={[-0.2, 0.42, 0]} rotation={[walking ? walk : 0, 0, 0]}>
        <capsuleGeometry args={[0.13, 0.65, 3, 6]} />
        <meshStandardMaterial color="#354b5b" />
      </mesh>
      <mesh position={[0.2, 0.42, 0]} rotation={[walking ? -walk : 0, 0, 0]}>
        <capsuleGeometry args={[0.13, 0.65, 3, 6]} />
        <meshStandardMaterial color="#354b5b" />
      </mesh>
    </group>
  );
};

export const AnimatedWorld = ({ frame, segment = {} }) => {
  const mood = MOODS[segment.mood] || MOODS.peaceful;
  const setting = segment.setting || 'street';
  const showBuildings = setting !== 'garden';
  const showTrees = setting === 'garden' || setting === 'courtyard' || setting === 'street';

  return (
    <>
      <color attach="background" args={[mood.sky]} />
      <fog attach="fog" args={[mood.sky, 18, 42]} />
      <ambientLight intensity={segment.mood === 'night' ? 0.7 : 1.35} color={mood.light} />
      <directionalLight position={[-5, 10, 7]} intensity={segment.mood === 'night' ? 0.8 : 2.2} castShadow />
      <pointLight position={[4, 6, 1]} intensity={0.45} color="#ffd9a1" />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.08, 0]} receiveShadow>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color={mood.ground} roughness={1} />
      </mesh>
      {setting === 'street' && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.045, -1]}>
          <planeGeometry args={[5.2, 70]} />
          <meshStandardMaterial color="#827c75" roughness={1} />
        </mesh>
      )}
      {showBuildings && (
        <>
          <Building x={-5.5} z={-3} height={5.4} width={3.2} color="#c88f70" roofColor="#754d46" />
          <Building x={5.4} z={-5} height={6.2} width={3.6} color="#d6b98d" roofColor="#765b50" />
          {setting !== 'home' && <Building x={-6.4} z={5} height={4.3} width={3.4} color="#e0c6a0" roofColor="#8a5e4c" />}
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
      <Character frame={frame} action={segment.action} />
    </>
  );
};
