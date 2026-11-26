import React, { Suspense } from 'react';
import { RiggedCharacter } from './RiggedCharacter.jsx';

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
  const ruku = action === 'ruku';
  const sujud = action === 'sujud';
  const prayerSitting = action === 'prayer_sitting';
  const dua = action === 'dua';
  const lookUp = action === 'looking_up';
  const sitting = action === 'sitting' || action === 'reading' || action === 'working' || prayerSitting;
  const washing = action === 'washing';
  const kneeling = action === 'kneeling';
  const crying = action === 'crying';
  const embracing = action === 'embracing';

  const gait = walk ? Math.sin(t * 7.2) : 0;
  const idle = Math.sin(t * 2.1);
  const breath = Math.sin(t * 2.4) * 0.025;
  const bob = walk ? Math.abs(Math.sin(t * 7.2)) * 0.075 : Math.sin(t * 2.4) * 0.018;
  const torsoLean = walk ? Math.sin(t * 7.2) * 0.035 : ruku ? 0.78 : sujud ? 1.25 : dua ? -0.04 : sitting ? 0.1 : 0;
  const armSwing = walk ? 0.62 : 0.06 * idle;
  const armRaise = dua ? -2.25 : lookUp ? -0.45 : washing ? -0.85 : crying ? -0.35 : 0;
  const leftArmAngle = action === 'working' ? -1.05
    : action === 'reading' ? -0.72
      : action === 'crying' ? -1.15
        : action === 'embracing' ? 0.8 : armRaise;
  const rightArmAngle = action === 'working' ? -0.9
    : action === 'reading' ? -0.68
      : action === 'crying' ? -1.15
        : action === 'embracing' ? -0.8 : armRaise;
  const leftForearmAngle = action === 'working' ? -0.45
    : action === 'reading' ? -0.95
      : action === 'crying' ? 0.35 : washing ? -0.6 : dua ? -0.45 : 0;
  const rightForearmAngle = action === 'working' ? 0.4
    : action === 'reading' ? -0.9
      : action === 'crying' ? -0.35 : washing ? 0.6 : dua ? 0.45 : 0;
  const headTilt = crying || mood === 'sad' ? 0.24 : mood === 'hopeful' || lookUp ? -0.12 : 0;
  const blink = Math.pow(Math.max(0, Math.cos(t * 1.7 + 0.4)), 36);
  const legPose = sitting ? -0.9 : kneeling || sujud || prayerSitting ? -1.35 : 0;

  return (
    <group position={[0, bob + (sitting ? -0.18 : sujud ? -0.65 : 0), 1.5]} rotation={[torsoLean, walk ? Math.sin(t * 7.2) * 0.035 : 0, 0]}>
      {/* Legs pivot at the hips, with matching trousers and shoes. */}
      {[-0.22, 0.22].map((x, index) => {
        const swing = index === 0 ? gait : -gait;
        const hip = sitting ? legPose : walk ? swing * 0.62 : kneeling || sujud ? 0.55 : 0;
        const knee = sitting ? 1.05 : walk ? Math.max(0, swing) * 0.72 : kneeling ? 1.35 : sujud ? 0.8 : 0;
        return (
          <group key={x} position={[x, 0.82, 0]} rotation={[hip, 0, 0]}>
            <mesh position={[0, -0.25, 0]} castShadow>
              <capsuleGeometry args={[0.155, 0.48, 5, 10]} />
              <meshStandardMaterial color="#354b5b" roughness={0.95} />
            </mesh>
            <group position={[0, -0.52, 0]} rotation={[knee, 0, 0]}>
              <mesh position={[0, -0.25, 0]} castShadow>
                <capsuleGeometry args={[0.125, 0.48, 5, 10]} />
                <meshStandardMaterial color="#354b5b" roughness={0.95} />
              </mesh>
              <mesh position={[0, -0.53, 0.13]} castShadow>
                <boxGeometry args={[0.3, 0.15, 0.5]} />
                <meshStandardMaterial color="#252a30" roughness={0.9} />
              </mesh>
            </group>
          </group>
        );
      })}

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
      <group position={[-0.43, 1.72, 0]} rotation={[0, 0, (walk ? armSwing * gait : 0.08 * idle) + leftArmAngle]}>
        <mesh position={[0, -0.36, 0]} castShadow>
          <capsuleGeometry args={[0.125, 0.58, 4, 8]} />
          <meshStandardMaterial color="#e8ddc9" roughness={0.96} />
        </mesh>
        <group position={[0, -0.68, 0]} rotation={[0, 0, leftForearmAngle]}>
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
      <group position={[0.43, 1.72, 0]} rotation={[0, 0, -(walk ? armSwing * gait : 0.08 * idle) - rightArmAngle]}>
        <mesh position={[0, -0.36, 0]} castShadow>
          <capsuleGeometry args={[0.125, 0.58, 4, 8]} />
          <meshStandardMaterial color="#e8ddc9" roughness={0.96} />
        </mesh>
        <group position={[0, -0.68, 0]} rotation={[0, 0, rightForearmAngle]}>
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
            <mesh position={[0, 0.105, 0]} rotation={[0, 0, (crying || mood === 'sad' ? (x < 0 ? -0.24 : 0.24) : x < 0 ? 0.08 : -0.08)]}>
              <boxGeometry args={[0.15, 0.032, 0.03]} />
              <meshStandardMaterial color="#49332e" />
            </mesh>
          </group>
        ))}
        {(crying || mood === 'sad') && (
          <mesh position={[-0.19, -0.19, 0.505]}>
            <sphereGeometry args={[0.035, 8, 8]} />
            <meshBasicMaterial color="#8ec8e8" transparent opacity={0.82} />
          </mesh>
        )}
        <mesh position={[0, -0.29, 0.49]}>
          <sphereGeometry args={[0.18, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.55]} />
          <meshStandardMaterial color="#342629" roughness={1} />
        </mesh>
      </group>
    </group>
  );
};


const Mosque = () => (
  <group position={[0, 0, -5]}>
    <mesh position={[0, 2.1, 0]}><boxGeometry args={[10, 4.2, 3]} /><meshStandardMaterial color="#d8c8a8" /></mesh>
    <mesh position={[0, 4.4, 0]}><sphereGeometry args={[2.15, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2]} /><meshStandardMaterial color="#3e806f" metalness={0.15} roughness={0.55} /></mesh>
    {[-3.7, 3.7].map(x => <group key={x} position={[x, 0, 0]}>
      <mesh position={[0, 3.1, 0]}><cylinderGeometry args={[0.34, 0.48, 6.2, 12]} /><meshStandardMaterial color="#e5d7bd" /></mesh>
      <mesh position={[0, 6.45, 0]}><coneGeometry args={[0.5, 1.1, 12]} /><meshStandardMaterial color="#b99452" /></mesh>
    </group>)}
    {[-2.2, 0, 2.2].map(x => <mesh key={x} position={[x, 1.7, 1.53]}><planeGeometry args={[1.05, 2.2]} /><meshBasicMaterial color="#345c62" /></mesh>)}
  </group>
);


const MosqueInterior = () => (
  <group position={[0, 0, -5]}>
    <mesh position={[0, 3, 0]}><boxGeometry args={[14, 6, 0.45]} /><meshStandardMaterial color="#d8c8a8" roughness={0.9} /></mesh>
    <mesh position={[0, 2.7, 0.27]}><boxGeometry args={[3.4, 4.7, 0.08]} /><meshStandardMaterial color="#2f7468" roughness={0.8} /></mesh>
    <mesh position={[0, 2.1, 0.34]}><boxGeometry args={[1.9, 2.7, 0.08]} /><meshStandardMaterial color="#b28c52" metalness={0.25} /></mesh>
    {[-5.2, 5.2].map(x => <group key={x} position={[x, 0, -0.2]}>
      <mesh position={[0, 2.5, 0]}><cylinderGeometry args={[0.32, 0.42, 5, 16]} /><meshStandardMaterial color="#e7d9bd" /></mesh>
      <mesh position={[0, 5.1, 0]}><cylinderGeometry args={[0.52, 0.52, 0.18, 16]} /><meshStandardMaterial color="#b99559" /></mesh>
    </group>)}
    {[-4, -2, 0, 2, 4].map(x => <mesh key={x} position={[x, 0.015, 1.5]}><boxGeometry args={[1.75, 0.025, 5.4]} /><meshStandardMaterial color="#315d53" roughness={1} /></mesh>)}
    {[-3, 3].map(x => <pointLight key={x} position={[x, 4.7, 1]} intensity={0.55} color="#ffd99b" distance={9} />)}
  </group>
);

const SceneProps = ({ setting, frame }) => {
  if (setting === 'mosque_interior') return <MosqueInterior />;
  if (setting === 'wudu') return <group position={[0, 0, -3]}>
    <mesh position={[0, 0.55, 0]}><boxGeometry args={[6, 1.1, 2.2]} /><meshStandardMaterial color="#b8c8c4" roughness={0.25} /></mesh>
    {[-2, 0, 2].map(x => <group key={x} position={[x, 0, 0]}>
      <mesh position={[0, 1.25, 0]}><cylinderGeometry args={[0.055, 0.055, 0.85, 10]} /><meshStandardMaterial color="#a8b8c2" metalness={0.85} roughness={0.2} /></mesh>
      <mesh position={[0, 0.83, 0.08]}><torusGeometry args={[0.13, 0.035, 8, 16, Math.PI]} /><meshStandardMaterial color="#8da7b0" metalness={0.8} /></mesh>
    </group>)}
    <mesh position={[0, 0.06, 1.5]} rotation={[-Math.PI / 2, 0, 0]}><planeGeometry args={[6, 1.2]} /><meshStandardMaterial color="#91b8c4" transparent opacity={0.55} roughness={0.1} /></mesh>
  </group>;
  return null;
};

const SceneEnvironment = ({ setting, frame }) => {
  if (setting === 'mosque' || setting === 'mosque_interior') return <Mosque />;
  if (setting === 'wudu') return <group position={[0, 0, -3]}>
    <mesh position={[0, 0.55, 0]}><boxGeometry args={[5, 1.1, 2]} /><meshStandardMaterial color="#b8c8c4" /></mesh>
    {[-1.7, 0, 1.7].map(x => <mesh key={x} position={[x, 1.2, 0]}><cylinderGeometry args={[0.07, 0.07, 0.8, 8]} /><meshStandardMaterial color="#a8b8c2" metalness={0.8} /></mesh>)}
  </group>;
  if (setting === 'home' || setting === 'kitchen') return <group position={[0, 0, -4]}>
    <mesh position={[0, 2.2, 0]}><boxGeometry args={[10, 4.4, 0.35]} /><meshStandardMaterial color="#d9c6aa" /></mesh>
    <mesh position={[0, 1.2, 0.5]}><boxGeometry args={[3.5, 0.18, 1.1]} /><meshStandardMaterial color="#795b48" /></mesh>
    <mesh position={[-3, 2.5, 0.22]}><planeGeometry args={[1.7, 2]} /><meshBasicMaterial color="#9fc8d6" /></mesh>
    {setting === 'kitchen' && <mesh position={[2.4, 0.8, 0.3]}><boxGeometry args={[1.8, 1.6, 0.9]} /><meshStandardMaterial color="#78868a" metalness={0.25} /></mesh>}
  </group>;
  if (setting === 'office') return <group position={[0, 0, -3]}>
    <mesh position={[0, 1.15, -0.4]}><boxGeometry args={[4.5, 0.18, 1.6]} /><meshStandardMaterial color="#684b38" /></mesh>
    <mesh position={[0, 2.1, -1.1]}><boxGeometry args={[2.3, 1.45, 0.12]} /><meshStandardMaterial color="#202c39" /></mesh>
    <mesh position={[0, 1.65, -0.98]}><planeGeometry args={[2.05, 1.1]} /><meshBasicMaterial color="#4e8192" /></mesh>
  </group>;
  if (setting === 'hospital') return <group position={[0, 0, -3]}>
    <mesh position={[0, 0.85, -0.5]}><boxGeometry args={[4.2, 0.3, 1.7]} /><meshStandardMaterial color="#e6e9e7" /></mesh>
    <mesh position={[0, 1.1, -1.15]}><boxGeometry args={[4.2, 0.65, 0.15]} /><meshStandardMaterial color="#c7d4d5" /></mesh>
    <mesh position={[-2.4, 1.5, -0.5]}><boxGeometry args={[0.12, 2.5, 0.12]} /><meshStandardMaterial color="#aab8bb" /></mesh>
  </group>;
  if (setting === 'school' || setting === 'market') return <group position={[0, 0, -5]}>
    <mesh position={[0, 2.1, 0]}><boxGeometry args={[10, 4.2, 2]} /><meshStandardMaterial color={setting === 'school' ? '#e7d2a8' : '#b8a28a'} /></mesh>
    {[-3, 0, 3].map(x => <mesh key={x} position={[x, 2.2, 1.03]}><planeGeometry args={[1.5, 1.6]} /><meshBasicMaterial color="#52778a" /></mesh>)}
  </group>;
  if (setting === 'beach') return <group position={[0, 0, -5]}>
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, -2]}><planeGeometry args={[80, 25]} /><meshStandardMaterial color="#d7c08d" /></mesh>
    <mesh position={[0, 0.35, -8]}><boxGeometry args={[80, 0.5, 5]} /><meshStandardMaterial color="#4f91a5" roughness={0.25} /></mesh>
  </group>;
  if (setting === 'mountain' || setting === 'nature' || setting === 'cemetery' || setting === 'garden' || setting === 'courtyard') return <group>
    {[[-8, 5, -12], [-3, 7, -15], [5, 6, -13], [10, 4, -11]].map(([x,y,z],i) => <mesh key={i} position={[x,y,z]}><coneGeometry args={[4, y*1.7, 5]} /><meshStandardMaterial color={setting === 'cemetery' ? '#596b60' : '#647d70'} /></mesh>)}
    {setting === 'cemetery' && [-2, 0, 2].map(x => <mesh key={x} position={[x, 0.45, -1]}><boxGeometry args={[0.45, 0.9, 0.18]} /><meshStandardMaterial color="#b7b5a9" /></mesh>)}
  </group>;
  if (setting === 'vehicle') return <group position={[0, 0, -3]}>
    <mesh position={[0, 0.85, -1]}><boxGeometry args={[4.5, 1.2, 2]} /><meshStandardMaterial color="#526b7d" metalness={0.35} /></mesh>
    <mesh position={[0, 1.55, -1]}><boxGeometry args={[2.4, 0.65, 1.7]} /><meshStandardMaterial color="#7eabb8" roughness={0.25} /></mesh>
    {[-1.4, 1.4].map(x => <mesh key={x} position={[x, 0.3, 0.05]} rotation={[Math.PI/2,0,0]}><cylinderGeometry args={[0.42,0.42,0.22,16]} /><meshStandardMaterial color="#24272b" /></mesh>)}
  </group>;
  return null;
};

export const AnimatedWorld = ({ frame = 0, segment = {} }) => {
  const mood = MOODS[segment.mood] || MOODS.peaceful;
  const setting = segment.setting || 'street';
  const showBuildings = ['street', 'courtyard', 'market', 'school'].includes(setting);
  const showTrees = ['garden', 'courtyard', 'street', 'nature', 'mountain', 'cemetery'].includes(setting);
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
      <SceneProps setting={setting} frame={frame} />
      <SceneEnvironment setting={setting} frame={frame} />
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
      <Suspense fallback={<Character frame={frame} action={segment.action} mood={segment.mood} />}>
        <RiggedCharacter frame={frame} action={segment.action} />
      </Suspense>
    </>
  );
};
