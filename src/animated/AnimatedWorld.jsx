import React from 'react';

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
);

const Character = ({ frame }) => {
  const walk = Math.sin(frame / 5) * 0.22;
  const bob = Math.abs(Math.sin(frame / 5)) * 0.08;

  return (
    <group position={[0, bob, 1.5]}>
      {/* Flat, camera-facing storybook character built from simple 3D geometry. */}
      <mesh position={[0, 1.35, 0]} castShadow>
        <capsuleGeometry args={[0.43, 0.82, 5, 10]} />
        <meshStandardMaterial color="#d6a46d" roughness={1} />
      </mesh>
      <mesh position={[0, 2.25, 0.02]} castShadow>
        <sphereGeometry args={[0.58, 16, 12]} />
        <meshStandardMaterial color="#e8bd91" roughness={1} />
      </mesh>
      <mesh position={[0, 2.55, 0.04]}>
        <sphereGeometry args={[0.56, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.52]} />
        <meshStandardMaterial color="#302a2b" roughness={1} />
      </mesh>
      {[-0.19, 0.19].map((x) => (
        <mesh key={x} position={[x, 2.28, 0.53]}>
          <circleGeometry args={[0.045, 10]} />
          <meshBasicMaterial color="#211c1c" />
        </mesh>
      ))}
      <mesh position={[0, 2.08, 0.54]}>
        <boxGeometry args={[0.16, 0.025, 0.02]} />
        <meshBasicMaterial color="#8d4f43" />
      </mesh>
      <mesh position={[-0.48, 1.48, 0]} rotation={[0, 0, walk]}>
        <capsuleGeometry args={[0.12, 0.72, 3, 6]} />
        <meshStandardMaterial color="#e8bd91" />
      </mesh>
      <mesh position={[0.48, 1.48, 0]} rotation={[0, 0, -walk]}>
        <capsuleGeometry args={[0.12, 0.72, 3, 6]} />
        <meshStandardMaterial color="#e8bd91" />
      </mesh>
      <mesh position={[-0.2, 0.42, 0]} rotation={[walk, 0, 0]}>
        <capsuleGeometry args={[0.13, 0.65, 3, 6]} />
        <meshStandardMaterial color="#354b5b" />
      </mesh>
      <mesh position={[0.2, 0.42, 0]} rotation={[-walk, 0, 0]}>
        <capsuleGeometry args={[0.13, 0.65, 3, 6]} />
        <meshStandardMaterial color="#354b5b" />
      </mesh>
    </group>
  );
};

export const AnimatedWorld = ({ frame, progress }) => {
  const cameraX = Math.sin(progress * Math.PI * 1.2) * 0.7;
  const cameraY = 5.1 - progress * 0.55;
  const cameraZ = 14 - progress * 3.2;

  return (
    <>
      <color attach="background" args={['#a9c8df']} />
      <fog attach="fog" args={['#a9c8df', 18, 42]} />
      <ambientLight intensity={1.35} />
      <directionalLight position={[-5, 10, 7]} intensity={2.2} castShadow />
      <pointLight position={[4, 6, 1]} intensity={0.45} color="#ffd9a1" />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.08, 0]} receiveShadow>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color="#78966a" roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.045, -1]}>
        <planeGeometry args={[5.2, 70]} />
        <meshStandardMaterial color="#827c75" roughness={1} />
      </mesh>

      <Building x={-5.5} z={-3} height={5.4} width={3.2} color="#c88f70" roofColor="#754d46" />
      <Building x={5.4} z={-5} height={6.2} width={3.6} color="#d6b98d" roofColor="#765b50" />
      <Building x={-6.4} z={5} height={4.3} width={3.4} color="#e0c6a0" roofColor="#8a5e4c" />
      <Building x={6.6} z={4} height={5.1} width={3.1} color="#bd8a6c" roofColor="#674b47" />
      <Tree x={-3.8} z={-1.5} scale={1.1} />
      <Tree x={4.0} z={-2.8} scale={0.9} />
      <Tree x={-4.4} z={4.2} scale={0.85} />
      <Tree x={4.7} z={5.2} scale={1.05} />

      <Character frame={frame} />
    </>
  );
};
