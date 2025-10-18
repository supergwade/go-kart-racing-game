import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

function GamePage({ user }) {
  const containerRef = useRef(null);
  const navigate = useNavigate();
  
  const [gameState, setGameState] = useState({
    speed: 0,
    currentLap: 1,
    totalLaps: 3,
    lapTimes: [],
    bestLapTime: null,
    totalTime: 0,
    checkpointsPassed: 0,
    isRacing: true,
    raceFinished: false
  });

  // ✅ FIX 1: Added missing formatTime function
  const formatTime = (milliseconds) => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const ms = Math.floor((milliseconds % 1000) / 10);
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  // ✅ FIX 2: Added submitScore function to send results to backend
  const submitScore = async (lapTime) => {
    if (!user) {
      console.log('No user logged in, cannot submit score');
      return;
    }

    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${API_URL}/leaderboard/submit`,
        {
          lap_time: lapTime / 1000, // Convert to seconds
          track_name: 'Classic Circuit'
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      );
      console.log('Score submitted successfully!');
    } catch (error) {
      console.error('Error submitting score:', error);
    }
  };

  useEffect(() => {
    if (!containerRef.current) return;

    // Scene Setup
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x87ceeb, 50, 200);
    
    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    containerRef.current.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xfff5e6, 1);
    sunLight.position.set(100, 100, 50);
    sunLight.castShadow = true;
    sunLight.shadow.camera.left = -100;
    sunLight.shadow.camera.right = 100;
    sunLight.shadow.camera.top = 100;
    sunLight.shadow.camera.bottom = -100;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    scene.add(sunLight);

    // Sky
    const skyGeometry = new THREE.SphereGeometry(500, 32, 32);
    const skyMaterial = new THREE.MeshBasicMaterial({
      color: 0x87ceeb,
      side: THREE.BackSide
    });
    const sky = new THREE.Mesh(skyGeometry, skyMaterial);
    scene.add(sky);

    // Ground
    const groundGeometry = new THREE.PlaneGeometry(400, 400);
    const groundTexture = createGrassTexture();
    const groundMaterial = new THREE.MeshLambertMaterial({ 
      map: groundTexture,
      side: THREE.DoubleSide 
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    // Create Mountains in Background
    createMountains(scene);

    // Create Race Track
    const { track, checkpoints, startLine } = createRaceTrack(scene);

    // Load Kart Model
    let kart = null;
    let kartLoaded = false;
    
    const loader = new GLTFLoader();
    loader.load(
      '/racing_kart_concept.glb',
      (gltf) => {
        kart = gltf.scene;
        kart.scale.set(0.5, 0.5, 0.5);
        kart.position.set(0, 0.3, 0);
        kart.castShadow = true;
        kart.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
          }
        });
        scene.add(kart);
        kartLoaded = true;
        console.log('Kart loaded successfully!');
      },
      (progress) => {
        console.log('Loading kart...', (progress.loaded / progress.total * 100) + '%');
      },
      (error) => {
        console.error('Error loading kart:', error);
        // Fallback to simple kart if model fails
        kart = createFallbackKart();
        scene.add(kart);
        kartLoaded = true;
      }
    );

    // Game State
    let velocity = new THREE.Vector3();
    let kartRotation = 0;
    const maxSpeed = 0.5;
    const acceleration = 0.02;
    const friction = 0.98;
    const turnSpeed = 0.05;

    let currentCheckpoint = 0;
    let lapStartTime = Date.now();
    let raceStartTime = Date.now();
    let currentLap = 1;
    const totalLaps = 3;
    let lapTimes = [];
    let bestLapTime = null;

    // Controls
    const keys = {};
    window.addEventListener('keydown', (e) => keys[e.key.toLowerCase()] = true);
    window.addEventListener('keyup', (e) => keys[e.key.toLowerCase()] = false);

    // Camera Follow
    function updateCamera() {
      if (!kart) return;
      
      const cameraOffset = new THREE.Vector3(
        Math.sin(kartRotation) * 8,
        5,
        Math.cos(kartRotation) * 8
      );
      
      camera.position.copy(kart.position).add(cameraOffset);
      camera.lookAt(kart.position);
    }

    // Check Lap Progress
    function checkLapProgress() {
      if (!kart) return;

      const kartPos = kart.position;
      const nextCheckpoint = checkpoints[currentCheckpoint];
      
      const distance = kartPos.distanceTo(nextCheckpoint.position);
      
      if (distance < 5) {
        currentCheckpoint++;
        
        // Completed a lap
        if (currentCheckpoint >= checkpoints.length) {
          currentCheckpoint = 0;
          
          const lapTime = Date.now() - lapStartTime;
          lapTimes.push(lapTime);
          
          if (!bestLapTime || lapTime < bestLapTime) {
            bestLapTime = lapTime;
          }
          
          lapStartTime = Date.now();
          currentLap++;
          
          // Race finished
          if (currentLap > totalLaps) {
            finishRace();
          }
        }
        
        updateGameState();
      }
    }

    function updateGameState() {
      const speed = velocity.length() * 100;
      const totalTime = Date.now() - raceStartTime;
      
      setGameState({
        speed: Math.round(speed),
        currentLap: Math.min(currentLap, totalLaps),
        totalLaps: totalLaps,
        lapTimes: lapTimes,
        bestLapTime: bestLapTime,
        totalTime: totalTime,
        checkpointsPassed: currentCheckpoint,
        isRacing: currentLap <= totalLaps,
        raceFinished: currentLap > totalLaps
      });
    }

    // ✅ FIX 3: Enhanced finishRace to actually submit score
    function finishRace() {
      const totalTime = Date.now() - raceStartTime;
      console.log('Race finished!', {
        totalTime,
        lapTimes,
        bestLapTime
      });
      
      // Submit best lap time to leaderboard
      if (bestLapTime) {
        submitScore(bestLapTime);
      }
    }

    // Animation Loop
    function animate() {
      requestAnimationFrame(animate);

      if (kart && kartLoaded) {
        // Controls
        if (keys['w'] || keys['arrowup']) {
          velocity.x -= Math.sin(kartRotation) * acceleration;
          velocity.z -= Math.cos(kartRotation) * acceleration;
        }
        if (keys['s'] || keys['arrowdown']) {
          velocity.x += Math.sin(kartRotation) * acceleration * 0.5;
          velocity.z += Math.cos(kartRotation) * acceleration * 0.5;
        }
        if (keys['a'] || keys['arrowleft']) {
          kartRotation += turnSpeed;
        }
        if (keys['d'] || keys['arrowright']) {
          kartRotation -= turnSpeed;
        }

        // Apply friction
        velocity.multiplyScalar(friction);

        // Limit speed
        if (velocity.length() > maxSpeed) {
          velocity.setLength(maxSpeed);
        }

        // Update kart position
        kart.position.add(velocity);
        kart.rotation.y = kartRotation;

        // Keep kart on ground
        kart.position.y = 0.3;

        // Keep kart on ground boundaries (simple circular boundary)
        const distanceFromCenter = Math.sqrt(
          kart.position.x ** 2 + kart.position.z ** 2
        );
        if (distanceFromCenter > 45) {
          // Bounce back
          const angle = Math.atan2(kart.position.z, kart.position.x);
          kart.position.x = Math.cos(angle) * 45;
          kart.position.z = Math.sin(angle) * 45;
          velocity.multiplyScalar(-0.3);
        }

        updateCamera();
        checkLapProgress();
        updateGameState();
      }

      renderer.render(scene, camera);
    }

    animate();

    // Handle window resize
    function handleResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    }
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []); // ✅ FIX 4: Added proper dependency array

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      
      {/* HUD */}
      <div style={{
        position: 'absolute',
        top: 20,
        left: 20,
        background: 'rgba(0, 0, 0, 0.7)',
        color: 'white',
        padding: '20px',
        borderRadius: '10px',
        minWidth: '250px',
        fontFamily: 'Arial, sans-serif'
      }}>
        <h2 style={{ margin: '0 0 15px 0', color: '#ffd700' }}>🏎️ Race Stats</h2>
        
        <div style={{ marginBottom: '10px', fontSize: '20px' }}>
          <strong>Speed:</strong> <span style={{ color: '#00ff00' }}>{gameState.speed} km/h</span>
        </div>
        
        <div style={{ marginBottom: '10px', fontSize: '18px' }}>
          <strong>Lap:</strong> {gameState.currentLap} / {gameState.totalLaps}
        </div>
        
        <div style={{ marginBottom: '10px' }}>
          <strong>Total Time:</strong> {formatTime(gameState.totalTime)}
        </div>
        
        {gameState.bestLapTime && (
          <div style={{ marginBottom: '10px', color: '#ffd700' }}>
            <strong>Best Lap:</strong> {formatTime(gameState.bestLapTime)}
          </div>
        )}
        
        {gameState.lapTimes.length > 0 && (
          <div style={{ marginTop: '15px', borderTop: '1px solid #666', paddingTop: '10px' }}>
            <strong>Lap Times:</strong>
            {gameState.lapTimes.map((time, index) => (
              <div key={index} style={{ fontSize: '14px' }}>
                Lap {index + 1}: {formatTime(time)}
              </div>
            ))}
          </div>
        )}
        
        {gameState.raceFinished && (
          <div style={{ 
            marginTop: '15px', 
            padding: '10px', 
            background: '#ffd700',
            color: '#000',
            borderRadius: '5px',
            textAlign: 'center',
            fontWeight: 'bold'
          }}>
            🏁 RACE FINISHED! 🏁
            <div style={{ fontSize: '12px', marginTop: '5px' }}>
              Score submitted to leaderboard!
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div style={{
        position: 'absolute',
        bottom: 20,
        right: 20,
        background: 'rgba(0, 0, 0, 0.7)',
        color: 'white',
        padding: '15px',
        borderRadius: '10px',
        fontSize: '14px'
      }}>
        <div><strong>Controls:</strong></div>
        <div>↑/W - Accelerate</div>
        <div>↓/S - Brake</div>
        <div>←/A - Turn Left</div>
        <div>→/D - Turn Right</div>
      </div>

      {/* Back Button */}
      <button
        onClick={() => navigate('/dashboard')}
        style={{
          position: 'absolute',
          top: 20,
          right: 20,
          padding: '10px 20px',
          background: '#ff4444',
          color: 'white',
          border: 'none',
          borderRadius: '5px',
          cursor: 'pointer',
          fontSize: '16px',
          fontWeight: 'bold'
        }}
      >
        Exit Race
      </button>
    </div>
  );
}

// Helper Functions

function createGrassTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  
  // Base grass color
  ctx.fillStyle = '#4a7c4e';
  ctx.fillRect(0, 0, 512, 512);
  
  // Add some variation
  for (let i = 0; i < 5000; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const shade = Math.random() * 40 - 20;
    ctx.fillStyle = `rgb(${74 + shade}, ${124 + shade}, ${78 + shade})`;
    ctx.fillRect(x, y, 2, 2);
  }
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(20, 20);
  return texture;
}

function createMountains(scene) {
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const distance = 150 + Math.random() * 50;
    
    const geometry = new THREE.ConeGeometry(20 + Math.random() * 15, 40 + Math.random() * 30, 4);
    const material = new THREE.MeshLambertMaterial({ color: 0x8b7355 });
    const mountain = new THREE.Mesh(geometry, material);
    
    mountain.position.x = Math.cos(angle) * distance;
    mountain.position.z = Math.sin(angle) * distance;
    mountain.position.y = 20;
    mountain.rotation.y = Math.random() * Math.PI;
    
    scene.add(mountain);
  }
}

function createRaceTrack(scene) {
  const trackRadius = 40;
  const trackWidth = 10;
  const numSegments = 64;
  
  // Track surface
  const trackShape = new THREE.Shape();
  for (let i = 0; i <= numSegments; i++) {
    const angle = (i / numSegments) * Math.PI * 2;
    const x = Math.cos(angle) * (trackRadius + trackWidth / 2);
    const z = Math.sin(angle) * (trackRadius + trackWidth / 2);
    if (i === 0) trackShape.moveTo(x, z);
    else trackShape.lineTo(x, z);
  }
  
  const holePath = new THREE.Path();
  for (let i = 0; i <= numSegments; i++) {
    const angle = (i / numSegments) * Math.PI * 2;
    const x = Math.cos(angle) * (trackRadius - trackWidth / 2);
    const z = Math.sin(angle) * (trackRadius - trackWidth / 2);
    if (i === 0) holePath.moveTo(x, z);
    else holePath.lineTo(x, z);
  }
  trackShape.holes.push(holePath);
  
  const trackGeometry = new THREE.ShapeGeometry(trackShape);
  const trackMaterial = new THREE.MeshLambertMaterial({ color: 0x404040, side: THREE.DoubleSide });
  const track = new THREE.Mesh(trackGeometry, trackMaterial);
  track.rotation.x = -Math.PI / 2;
  track.position.y = 0.1;
  track.receiveShadow = true;
  scene.add(track);
  
  // Add track markings
  for (let i = 0; i < numSegments; i += 2) {
    const angle = (i / numSegments) * Math.PI * 2;
    const x = Math.cos(angle) * trackRadius;
    const z = Math.sin(angle) * trackRadius;
    
    const markingGeometry = new THREE.BoxGeometry(1, 0.05, 0.5);
    const markingMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const marking = new THREE.Mesh(markingGeometry, markingMaterial);
    marking.position.set(x, 0.2, z);
    marking.rotation.y = angle;
    scene.add(marking);
  }
  
  // Barriers
  for (let side = 0; side < 2; side++) {
    const radius = side === 0 ? trackRadius + trackWidth / 2 + 1 : trackRadius - trackWidth / 2 - 1;
    
    for (let i = 0; i < numSegments; i++) {
      const angle = (i / numSegments) * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      
      const barrierGeometry = new THREE.BoxGeometry(1, 2, 0.5);
      const barrierMaterial = new THREE.MeshLambertMaterial({ 
        color: i % 2 === 0 ? 0xff0000 : 0xffffff 
      });
      const barrier = new THREE.Mesh(barrierGeometry, barrierMaterial);
      barrier.position.set(x, 1, z);
      barrier.rotation.y = angle;
      barrier.castShadow = true;
      scene.add(barrier);
    }
  }
  
  // Checkpoints (invisible)
  const checkpoints = [];
  const numCheckpoints = 8;
  for (let i = 0; i < numCheckpoints; i++) {
    const angle = (i / numCheckpoints) * Math.PI * 2;
    const checkpoint = {
      position: new THREE.Vector3(
        Math.cos(angle) * trackRadius,
        0,
        Math.sin(angle) * trackRadius
      )
    };
    checkpoints.push(checkpoint);
  }
  
  // Start/Finish line
  const startLineGeometry = new THREE.PlaneGeometry(trackWidth, 1);
  const startLineMaterial = new THREE.MeshBasicMaterial({ 
    color: 0xffffff,
    side: THREE.DoubleSide
  });
  const startLine = new THREE.Mesh(startLineGeometry, startLineMaterial);
  startLine.rotation.x = -Math.PI / 2;
  startLine.position.set(0, 0.15, trackRadius);
  scene.add(startLine);
  
  return { track, checkpoints, startLine };
}

function createFallbackKart() {
  const kart = new THREE.Group();
  
  // Body
  const bodyGeometry = new THREE.BoxGeometry(2, 0.5, 3);
  const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0xff0000 });
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.castShadow = true;
  kart.add(body);
  
  // Seat
  const seatGeometry = new THREE.BoxGeometry(1.2, 0.8, 1.5);
  const seatMaterial = new THREE.MeshLambertMaterial({ color: 0x0000ff });
  const seat = new THREE.Mesh(seatGeometry, seatMaterial);
  seat.position.set(0, 0.4, -0.3);
  seat.castShadow = true;
  kart.add(seat);
  
  // Wheels
  const wheelGeometry = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 16);
  const wheelMaterial = new THREE.MeshLambertMaterial({ color: 0x222222 });
  
  const wheelPositions = [
    [-1, -0.3, 1.2],
    [1, -0.3, 1.2],
    [-1, -0.3, -1.2],
    [1, -0.3, -1.2]
  ];
  
  wheelPositions.forEach(pos => {
    const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(...pos);
    wheel.castShadow = true;
    kart.add(wheel);
  });
  
  return kart;
}

export default GamePage;
