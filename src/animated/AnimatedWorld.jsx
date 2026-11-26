import React from 'react';

const MOODS = {
  reflective: { sky: '#899eb5', ground: '#687a66', light: '#dce6f2' },
  sad: { sky: '#66778d', ground: '#596b60', light: '#c6d3e0' },
  hopeful: { sky: '#efbd8c', ground: '#82966a', light: '#fff0c9' },
  peaceful: { sky: '#a9c8df', ground: '#78966a', light: '#fff1d5' },
  night: { sky: '#25354f', ground: '#34483f', light: '#c3d7ff' }
};

const clamp01 = (value) => Math.max(0, Math.min(1, value));
const smooth = (value) => {
  const x = clamp01(value);
  return x * x * (3 - 2 * x);
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

const Tree = ({ x, z, scale = 1, frame = 0 }) => {
  const sway = Math.sin(frame / 42 + x) * 0.035;
  return (
    <group position={[x, 0, z]} scale={scale} rotation={[0, 0, sway]}>
      <mesh position={[0, 0.8, 0]}>
        <cylinderGeometry args={[0.12, 0.18, 1.6, 7]} />
        <meshStandardMaterial color="#75513a" />
      </mesh>
      <mesh position={[0, 2, 0]}>
        <sphereGeometry args={[0.85, 8, 7]} />
        <meshStandardMaterial color="#557b4d" roughness={1} />
      </mesh>
    </group>
  );
};

/**
 * Articulated procedural character rig. Each limb rotates around a shoulder/hip
 * pivot so motion reads as body acting instead of moving disconnected primitives.
 * Frame-driven animation keeps the scene deterministic during Remotion rendering.
 */
const Character = ({ frame, action = 'standing', mood = 'peaceful' }) => {
  const t = frame / 30;
  const walk = action === 'walking';
  const dua = action === 'dua';
  const lookUp = action === 'looking_up';
  const sitting = action === 'sitting';

  const gait = walk ? Math.sin(t * 7.2) : 0;
  const idle = Math.sin(t * 2.1);
  const breath = Math.sin(t * 2.4) * 0.025;
  const bob = walk ? Math.abs(Math.sin(t * 7.2)) * 0.075 : Math.sin(t * 2.4) * 0.018;
  const torsoLean = walk ? Math.sin(t * 7.2) * 0.035 : dua ? -0.08 : sitting ? 0.12 : 0;
  const armSwing = walk ? 0.62 : 0.06 * idle;
  const armRaise = dua ? -2.25 : lookUp ? -0.45 : 0;
  const headTilt = mood === 'sad' ? 0.13 : mood === 'hopeful' || lookUp ? -0.12 : 0;
  const blink = Math.pow(Math.max(0, Math.cos(t * 1.7 + 0.4)), 36);
  const legPose = sitting ? -0.9 : 0;

  return (
    <group position={[0, bob + (sitting ? -0.18 : 0), 1.5]} rotation={[0, torsoLean, 0]}>
      {/* Legs pivot at the hips, with matching trousers and shoes. */}
      <group position={[-0.22, 0.82, 0]} rotation={[sitting ? legPose : walk ? gait * 0.62 : 0, 0, 0]}>
        <mesh position={[0, -0.38, 0]} castShadow>
          <capsuleGeometry args={[0.145, 0.66, 4, 8]} />
          <meshStandardMaterial color="#354b5b" roughness={0.95} />
        </mesh>
        <mesh position={[0, -0.78, 0.13]} castShadow>
          <boxGeometry args={[0.29, 0.16, 0.48]} />
          <meshStandardMaterial color="#252a30" roughness={0.9} />
        </mesh>
      </group>
      <group position={[0.22, 0.82, 0]} rotation={[sitting ? legPose : walk ? -gait * 0.62 : 0, 0, 0]}>
        <mesh position={[0, -0.38, 0]} castShadow>
          <capsuleGeometry args={[0.145, 0.66, 4, 8]} />
          <meshStandardMaterial color="#354b5b" roughness={0.95} />
        </mesh>
        <mesh position={[0, -0.78, 0.13]} castShadow>
          <boxGeometry args={[0.29, 0.16, 0.48]} />
          <meshStandardMaterial color="#252a30" roughness={0.9} />
        </mesh>
      </group>

      {/* Torso and neck. */}
      <group position={[0, 1.25, 0]} scale={[1, 1 + breath, 1]}>
        <mesh castShadow>
          <capsuleGeometry args={[0.43, 0.82, 6, 12]} />
          <meshStandardMaterial color="#e8ddc9" roughness={0.96} />
        </mesh>
        <mesh position={[0, 0.53, 0]}>
          <cylinderGeometry args={[0.14, 0.17, 0.28, 10]} />
          <meshStandardMaterial color="#a96f4e" roughness={1} />
        </mesh>
        {/* Shirt placket and buttons add readable clothing detail. */}
        <mesh position={[0, 0.08, 0.426]}>
          <boxGeometry args={[0.035, 0.58, 0.018]} />
          <meshStandardMaterial color="#b8a88f" />
        </mesh>
        {[0.22, 0.08, -0.06].map((y) => (
          <mesh key={y} position={[0, y, 0.445]}>
            <sphereGeometry args={[0.025, 8, 6]} />
            <meshStandardMaterial color="#9e907b" />
          </mesh>
        ))}
      </group>

      {/* Arms rotate from shoulder joints; dua pose raises both forearms. */}
      <group position={[-0.43, 1.72, 0]} rotation={[0, 0, (walk ? armSwing * gait : 0.08 * idle) + armRaise]}>
        <mesh position={[0, -0.36, 0]} castShadow>
          <capsuleGeometry args={[0.125, 0.58, 4, 8]} />
          <meshStandardMaterial color="#e8ddc9" roughness={0.96} />
        </mesh>
        <group position={[0, -0.68, 0]} rotation={[0, 0, dua ? -0.45 : 0]}>
          <mesh position={[0, -0.18, 0]} castShadow>
            <capsuleGeometry args={[0.105, 0.34, 4, 8]} />
            <meshStandardMaterial color="#e8ddc9" roughness={0.96} />
          </mesh>
          <mesh position={[0, -0.4, 0.02]}>
            <sphereGeometry args={[0.105, 10, 8]} />
            <meshStandardMaterial color="#a96f4e" roughness={1} />
          </mesh>
        </group>
      </group>
      <group position={[0.43, 1.72, 0]} rotation={[0, 0, -(walk ? armSwing * gait : 0.08 * idle) - armRaise]}>
        <mesh position={[0, -0.36, 0]} castShadow>
          <capsuleGeometry args={[0.125, 0.58, 4, 8]} />
          <meshStandardMaterial color="#e8ddc9" roughness={0.96} />
        </mesh>
        <group position={[0, -0.68, 0]} rotation={[0, 0, dua ? 0.45 : 0]}>
          <mesh position={[0, -0.18, 0]} castShadow>
            <capsuleGeometry args={[0.105, 0.34, 4, 8]} />
            <meshStandardMaterial color="#e8ddc9" roughness={0.96} />
          </mesh>
          <mesh position={[0, -0.4, 0.02]}>
            <sphereGeometry args={[0.105, 10, 8]} />
            <meshStandardMaterial color="#a96f4e" roughness={1} />
          </mesh>
        </group>
      </group>

      {/* Head, peci, eyes and brows. */}
      <group position={[0, 2.28, 0.02]} rotation={[lookUp ? -0.25 : headTilt, 0, Math.sin(t * 0.8) * 0.025]}>
        <mesh castShadow>
          <sphereGeometry args={[0.55, 20, 16]} />
          <meshStandardMaterial color="#a96f4e" roughness={0.98} />
        </mesh>
        <mesh position={[0, 0.29, -0.01]}>
          <sphereGeometry args={[0.55, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.52]} />
          <meshStandardMaterial color="#211d20" roughness={1} />
        </mesh>
        <mesh position={[0, 0.51, -0.01]}>
          <cylinderGeometry args={[0.38, 0.4, 0.22, 14]} />
          <meshStandardMaterial color="#20232b" roughness={1} />
        </mesh>
        {[-0.19, 0.19].map((x) => (
          <group key={x} position={[x, -0.04, 0.49]}>
            <mesh scale={[1, Math.max(0.08, 1 - blink * 0.92), 1]}>
              <sphereGeometry args={[0.052, 10, 8]} />
              <meshBasicMaterial color="#211c1c" />
            </mesh>
            <mesh position={[0, 0.105, 0]} rotation={[0, 0, x < 0 ? 0.08 : -0.08]}>
              <boxGeometry args={[0.13, 0.025, 0.025]} />
              <meshStandardMaterial color="#49332e" />
            </mesh>
          </group>
        ))}
        <mesh position={[0, -0.29, 0.49]}>
          <sphereGeometry args={[0.18, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
          <meshStandardMaterial color="#342629" roughness={1} />
        </mesh>
      </group>
    </group>
  );
};

export const AnimatedWorld = ({ frame = 0, segment = {} }) => {
  const mood = MOODS[segment.mood] || MOODS.peaceful;
  const setting = segment.setting || 'street';
  const showBuildings = setting !== 'garden';
  const showTrees = setting === 'garden' || setting === 'courtyard' || setting === 'street';
  const night = segment.mood === 'night';

  return (
    <>
      <color attach="background" args={[mood.sky]} />
      <fog attach="fog" args={[mood.sky, 18, 42]} />
      <ambientLight intensity={night ? 0.55 : 1.15} color={mood.light} />
      <directionalLight position={[-5, 10, 7]} intensity={night ? 0.75 : 2.1} castShadow />
      <pointLight position={[4, 6, 1]} intensity={night ? 0.8 : 0.45} color="#ffd9a1" />

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
          <Tree x={-3.8} z={-1.5} scale={1.1} frame={frame} />
          <Tree x={4.0} z={-2.8} scale={0.9} frame={frame} />
          <Tree x={-4.4} z={4.2} scale={0.85} frame={frame} />
          <Tree x={4.7} z={5.2} scale={1.05} frame={frame} />
        </>
      )}
      <Character frame={frame} action={segment.action} mood={segment.mood} />
    </>
  );
};
