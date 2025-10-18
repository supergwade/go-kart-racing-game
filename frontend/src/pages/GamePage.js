import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as THREE from 'three';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

function GamePage({ user }) {
  const containerRef = useRef(null);
  const navigate = useNavigate();
  const [gameState, setGameState] = useState({
    speed: 0,
    time: 0,
    lapTime: 0,
    isRacing: false
  });

  useEffect(() => {
    if (!containerRef.current) return;

    // Three.js Scene Setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb); // Sky blue
    
    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.set(0, 5, 10);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    containerRef.current.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(50, 50, 50);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 2048;
    directionalLight.shadow.mapSize.height = 2048;
    scene.add(directionalLight);

    // Create Track (Oval Shape)
    const trackGroup = new THREE.Group();
    
    // Outer track curve
    const outerCurve = new THREE.EllipseCurve(
      0, 0,
      20, 10,
      0, Math.PI * 2,
      false,
      0
    );
    
    const outerPoints = outerCurve.getPoints(200);
    const outerGeometry = new THREE.BufferGeometry().setFromPoints(outerPoints);

    // Track surface
    const trackShape = new THREE.Shape();
    trackShape.ellipse(20, 10, 20, 10);
    const holes = [];
    const holeShape = new THREE.Path();
    holeShape.ellipse(0, 0, 18, 8);
    holes.push(holeShape);
    trackShape.holes = holes;

    const extrudeSettings = {
      depth: 0.5,
      bevelEnabled: true,
      bevelThickness: 0.1,
      bevelSize: 0.1,
      bevelSegments: 3
    };

    const trackGeometry = new THREE.ExtrudeGeometry(trackShape, extrudeSettings);
    const trackMaterial = new THREE.MeshStandardMaterial({
      color: 0x333333,
      roughness: 0.7,
      metalness: 0.1
    });
    const trackMesh = new THREE.Mesh(trackGeometry, trackMaterial);
    trackMesh.receiveShadow = true;
    trackMesh.castShadow = true;
    trackGroup.add(trackMesh);

    // Track lines (dashed center line)
    const lineGeometry = new THREE.BufferGeometry();
    const linePoints = [];
    for (let i = 0; i < 200; i++) {
      const angle = (i / 200) * Math.PI * 2;
      const x = Math.cos(angle) * 19;
      const y = Math.sin(angle) * 9;
      linePoints.push(new THREE.Vector3(x, 0.3, y));
    }
    lineGeometry.setFromPoints(linePoints);
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0xffff00 });
    const centerLine = new THREE.Line(lineGeometry, lineMaterial);
    trackGroup.add(centerLine);

    // Finish line markers
    const finishMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    const finishGeometry = new THREE.BoxGeometry(3, 0.5, 0.5);
    const finishLine = new THREE.Mesh(finishGeometry, finishMaterial);
    finishLine.position.set(0, 0.3, 20);
    finishLine.receiveShadow = true;
    trackGroup.add(finishLine);

    scene.add(trackGroup);

    // Create Go-Kart
    const kartGroup = new THREE.Group();
    
    // Kart body
    const bodyGeometry = new THREE.BoxGeometry(1.2, 0.8, 2.5);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0xff0000,
      metalness: 0.6,
      roughness: 0.4
    });
    const kartBody = new THREE.Mesh(bodyGeometry, bodyMaterial);
    kartBody.position.y = 0.5;
    kartBody.castShadow = true;
    kartBody.receiveShadow = true;
    kartGroup.add(kartBody);

    // Wheels
    const wheelGeometry = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 16);
    const wheelMaterial = new THREE.MeshStandardMaterial({
      color: 0x222222,
      metalness: 0.3
    });

    const wheelPositions = [
      [-0.6, 0.4, 0.8],
      [0.6, 0.4, 0.8],
      [-0.6, 0.4, -0.8],
      [0.6, 0.4, -0.8]
    ];

    const wheels = [];
    wheelPositions.forEach(pos => {
      const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(...pos);
      wheel.castShadow = true;
      wheel.receiveShadow = true;
      kartGroup.add(wheel);
      wheels.push(wheel);
    });

    // Windshield
    const windshieldGeometry = new THREE.BoxGeometry(1, 0.6, 0.3);
    const windshieldMaterial = new THREE.MeshStandardMaterial({
      color: 0x4488ff,
      transparent: true,
      opacity: 0.6
    });
    const windshield = new THREE.Mesh(windshieldGeometry, windshieldMaterial);
    windshield.position.set(0, 1.2, 0);
    windshield.castShadow = true;
    kartGroup.add(windshield);

    kartGroup.position.set(0, 0, 15);
    scene.add(kartGroup);

    // Ground/Environment
    const groundGeometry = new THREE.PlaneGeometry(100, 100);
    const groundMaterial = new THREE.MeshStandardMaterial({
      color: 0x90ee90,
      roughness: 0.9
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1;
    ground.receiveShadow = true;
    scene.add(ground);

    // Game Variables
    let speed = 0;
    let angle = 0;
    let raceTime = 0;
    let lapStartTime = null;
    let hasStarted = false;
    let raceStarted = false;

    // Input handling
    const keys = {};
    window.addEventListener('keydown', (e) => {
      keys[e.key.toLowerCase()] = true;
      if (e.key === ' ' && !raceStarted) {
        raceStarted = true;
        lapStartTime = Date.now();
        setGameState(s => ({ ...s, isRacing: true }));
      }
    });
    window.addEventListener('keyup', (e) => {
      keys[e.key.toLowerCase()] = false;
    });

    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);

      // Game logic
      if (raceStarted) {
        // Acceleration/Deceleration
        if (keys['arrowup'] || keys['w']) {
          speed = Math.min(speed + 0.15, 1.5);
        } else {
          speed *= 0.95;
        }

        // Steering
        if (keys['arrowleft'] || keys['a']) {
          angle += 0.08;
        }
        if (keys['arrowright'] || keys['d']) {
          angle -= 0.08;
        }

        // Update position
        const radius = Math.sqrt(kartGroup.position.x ** 2 + kartGroup.position.z ** 2);
        const currentAngle = Math.atan2(kartGroup.position.z, kartGroup.position.x);
        const newAngle = currentAngle + speed * 0.01;
        
        const trackRadius = 20;
        kartGroup.position.x = Math.cos(newAngle) * (trackRadius - 3) * (1 - Math.abs(Math.sin(angle)) * 0.5);
        kartGroup.position.z = Math.sin(newAngle) * (trackRadius - 7) * (1 - Math.abs(Math.sin(angle)) * 0.5);

        kartGroup.rotation.y = angle;

        // Rotate wheels
        wheels.forEach(wheel => {
          wheel.rotation.x += speed * 0.05;
        });

        // Update time
        const currentTime = (Date.now() - lapStartTime) / 1000;
        setGameState(s => ({
          ...s,
          speed: (speed * 100).toFixed(0),
          lapTime: currentTime.toFixed(2)
        }));

        // Check finish line (simplified)
        if (kartGroup.position.z > 18 && raceTime === 0 && lapStartTime !== null) {
          raceTime = currentTime;
          handleRaceEnd(currentTime);
        }
      }

      // Camera follow kart
      const cameraDistance = 10;
      const cameraHeight = 5;
      camera.position.x = kartGroup.position.x + Math.cos(angle + Math.PI) * cameraDistance;
      camera.position.y = kartGroup.position.y + cameraHeight;
      camera.position.z = kartGroup.position.z + Math.sin(angle + Math.PI) * cameraDistance;
      camera.lookAt(kartGroup.position.x, kartGroup.position.y + 1, kartGroup.position.z);

      renderer.render(scene, camera);
    };

    const handleRaceEnd = async (finalTime) => {
      const token = localStorage.getItem('token');
      
      try {
        await axios.post(
          `${API_URL}/leaderboard/submit`,
          { lapTime: finalTime, trackName: 'Main Track' },
          { headers: { Authorization: `Bearer ${token}` } }
        );

        alert(`🏁 Race finished! Your time: ${finalTime.toFixed(2)}s`);
        navigate('/leaderboard');
      } catch (err) {
        console.error('Error submitting score:', err);
      }
    };

    animate();

    // Handle window resize
    const handleResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      containerRef.current?.removeChild(renderer.domElement);
    };
  }, [navigate]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100vh', overflow: 'hidden' }}>
      <div className="game-ui">
        <div>🏎️ Go-Kart Racing</div>
        <div style={{ fontSize: '14px', marginTop: '8px' }}>Player: {user?.username}</div>
      </div>

      <div className="game-timer">
        {gameState.isRacing ? gameState.lapTime : '0.00'} s
      </div>

      <div className="game-speed">
        Speed: {gameState.speed} %
      </div>

      <div className="game-controls">
        {!gameState.isRacing ? (
          <div style={{ background: '#ffff00', color: '#000', padding: '10px', borderRadius: '6px' }}>
            <strong>Press SPACE to Start!</strong>
          </div>
        ) : (
          <div>
            <div>↑/W - Accelerate</div>
            <div>↓/S - Brake</div>
            <div>←/A - Turn Left</div>
            <div>→/D - Turn Right</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default GamePage;
