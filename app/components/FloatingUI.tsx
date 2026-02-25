import React, { useRef, useEffect, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { GLView } from 'expo-gl';
import { Renderer } from 'expo-three';
import * as THREE from 'three';
import { HeadOrientation } from '@hooks/useGyroscope';
import { TrackedHand } from '@hooks/useHandTracking';

interface FloatingPanel {
  id: string;
  position: [number, number, number];
  size: [number, number];
  color: number;
  label?: string;
  isHovered?: boolean;
}

const PANELS: FloatingPanel[] = [
  { id: 'main',     position: [0, 0, -3],      size: [2, 1.5],   color: 0x1a1a3e },
  { id: 'left',     position: [-2.5, 0.2, -3], size: [1.2, 1.8], color: 0x0d1b2a },
  { id: 'right',    position: [2.5, 0.2, -3],  size: [1.2, 1.8], color: 0x0d1b2a },
  { id: 'top',      position: [0, 1.8, -3],    size: [1.5, 0.6], color: 0x1a0a2e },
  { id: 'bottom',   position: [0, -1.5, -3],   size: [2, 0.4],   color: 0x0a1a0a },
];

interface Props {
  width: number;
  height: number;
  orientation: HeadOrientation;
  hands: TrackedHand[];
  vrMode?: boolean;
}

export default function FloatingUI({ width, height, orientation, hands, vrMode = false }: Props) {
  const rendererRef = useRef<Renderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const panelMeshesRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const glRef = useRef<any>(null);
  const rafRef = useRef<number>(0);
  const particlesRef = useRef<THREE.Points | null>(null);
  const cursorRef = useRef<THREE.Mesh | null>(null);

  const onContextCreate = useCallback(async (gl: any) => {
    glRef.current = gl;
    const { drawingBufferWidth: w, drawingBufferHeight: h } = gl;

    const renderer = new Renderer({ gl });
    renderer.setSize(w, h);
    renderer.setClearColor(0x000000, 0);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Camera
    const camera = new THREE.PerspectiveCamera(75, w / h, 0.01, 100);
    camera.position.set(0, 0, 0);
    cameraRef.current = camera;

    // Ambient light
    scene.add(new THREE.AmbientLight(0xffffff, 0.4));

    // Point lights for glow effect
    const blueLight = new THREE.PointLight(0x6c63ff, 2, 10);
    blueLight.position.set(0, 2, -2);
    scene.add(blueLight);

    const purpleLight = new THREE.PointLight(0xa855f7, 1.5, 8);
    purpleLight.position.set(-3, -1, -3);
    scene.add(purpleLight);

    // Floating panels
    PANELS.forEach(panel => {
      const geo = new THREE.PlaneGeometry(panel.size[0], panel.size[1]);

      // Glass-like material
      const mat = new THREE.MeshPhongMaterial({
        color: panel.color,
        transparent: true,
        opacity: 0.75,
        side: THREE.DoubleSide,
        shininess: 100,
        emissive: new THREE.Color(panel.color).multiplyScalar(0.3),
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(...panel.position);

      // Add border glow
      const borderGeo = new THREE.EdgesGeometry(geo);
      const borderMat = new THREE.LineBasicMaterial({ color: 0x6c63ff, linewidth: 2 });
      const border = new THREE.LineSegments(borderGeo, borderMat);
      mesh.add(border);

      scene.add(mesh);
      panelMeshesRef.current.set(panel.id, mesh);
    });

    // Floating particles
    const particleCount = 200;
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      positions[i * 3]     = (Math.random() - 0.5) * 10;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 6;
      positions[i * 3 + 2] = -Math.random() * 8 - 1;
    }
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0x6c63ff, size: 0.02, transparent: true, opacity: 0.6,
    });
    particlesRef.current = new THREE.Points(particleGeo, particleMat);
    scene.add(particlesRef.current);

    // 3D Cursor sphere
    const cursorGeo = new THREE.SphereGeometry(0.04, 16, 16);
    const cursorMat = new THREE.MeshPhongMaterial({
      color: 0x00e5ff, emissive: 0x00e5ff, emissiveIntensity: 0.5,
      transparent: true, opacity: 0.9,
    });
    cursorRef.current = new THREE.Mesh(cursorGeo, cursorMat);
    scene.add(cursorRef.current);

    // Start render loop
    const render = () => {
      rafRef.current = requestAnimationFrame(render);

      // Animate particles
      if (particlesRef.current) {
        particlesRef.current.rotation.y += 0.0005;
        const pos = (particlesRef.current.geometry.attributes.position as THREE.BufferAttribute).array as Float32Array;
        for (let i = 0; i < particleCount; i++) {
          pos[i * 3 + 1] += 0.002;
          if (pos[i * 3 + 1] > 3) pos[i * 3 + 1] = -3;
        }
        particlesRef.current.geometry.attributes.position.needsUpdate = true;
      }

      renderer.render(scene, camera);
      gl.endFrameEXP();
    };
    render();
  }, []);

  // Update camera from gyroscope
  useEffect(() => {
    if (!cameraRef.current) return;
    const { pitch, yaw, roll } = orientation;
    cameraRef.current.rotation.order = 'YXZ';
    cameraRef.current.rotation.y = -yaw;
    cameraRef.current.rotation.x = -pitch;
    cameraRef.current.rotation.z = roll;
  }, [orientation]);

  // Update cursor from hand tracking
  useEffect(() => {
    if (!cursorRef.current || !cameraRef.current) return;

    const rightHand = hands.find(h => h.handedness === 'Right') || hands[0];
    if (!rightHand) {
      cursorRef.current.visible = false;
      return;
    }

    cursorRef.current.visible = true;

    // Map hand position to 3D space
    const { cursorX, cursorY } = rightHand.gestures;
    const x = (cursorX - 0.5) * 4;
    const y = -(cursorY - 0.5) * 3;
    const z = -3;

    cursorRef.current.position.set(x, y, z);

    // Scale on pinch
    const scale = rightHand.gestures.isPinching ? 1.5 : 1;
    cursorRef.current.scale.setScalar(scale);

    // Check panel hover
    panelMeshesRef.current.forEach((mesh, id) => {
      const dist = mesh.position.distanceTo(cursorRef.current!.position);
      const panel = PANELS.find(p => p.id === id);
      if (!panel) return;

      const isHovered = dist < Math.max(panel.size[0], panel.size[1]) * 0.6;
      const mat = mesh.material as THREE.MeshPhongMaterial;
      if (isHovered) {
        mat.emissive.setHex(0x6c63ff);
        mat.emissiveIntensity = 0.5;
      } else {
        mat.emissive.setHex(new THREE.Color(panel.color).multiplyScalar(0.3).getHex());
        mat.emissiveIntensity = 1;
      }
    });
  }, [hands]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      rendererRef.current?.dispose();
    };
  }, []);

  if (vrMode) {
    // Side-by-side stereo rendering
    return (
      <View style={[StyleSheet.absoluteFillObject, styles.stereoContainer]}>
        <GLView style={styles.stereoEye} onContextCreate={onContextCreate} />
        <GLView style={styles.stereoEye} onContextCreate={onContextCreate} />
      </View>
    );
  }

  return (
    <GLView
      style={StyleSheet.absoluteFillObject}
      onContextCreate={onContextCreate}
    />
  );
}

const styles = StyleSheet.create({
  stereoContainer: { flexDirection: 'row' },
  stereoEye: { flex: 1 },
});
