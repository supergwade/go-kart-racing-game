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

  const formatTime = (milliseconds) => {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const ms = Math.floor((milliseconds % 1000) / 10);
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  const submitScore = async (lapTime) => {
    if (!user) return;
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${API_URL}/leaderboard/submit`,
        { lap_time: lapTime / 1000, track_name: 'Indoor Arena' },
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
      console.log('Score submitted!');
    } catch (error) {
      console.error('Error submitting score:', error);
    }
  };

  useEffect(() => {
    if (!containerRef.current) return;

    // Scene Setup with better settings
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a1a);
    scene.fog = new THREE.Fog(0x1a1a1a, 80, 200);
    
    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );

    const renderer = new THREE.WebGLRenderer({ 
      antialias: true,
      powerPreference: "high-performance"
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    containerRef.current.appendChild(renderer.domElement);

    // REALISTIC LIGHTING
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
    scene.add(ambientLight);

    // Main overhead lights (like in indoor arena)
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const spotLight = new THREE.SpotLight(0xffffff, 1.5);
      spotLight.position.set(
        Math.cos(angle) * 30,
        15,
        Math.sin(angle) * 30
      );
      spotLight.castShadow = true;
      spotLight.shadow.mapSize.width = 1024;
      spotLight.shadow.mapSize.height = 1024;
      spotLight.angle = Math.PI / 6;
      spotLight.penumbra = 0.3;
      spotLight.decay = 2;
      scene.add(spotLight);
    }

    // INDOOR KARTING ARENA FLOOR
    const floorGeometry = new THREE.PlaneGeometry(120, 120);
    const floorTexture = createAsphaltTexture();
    const floorMaterial = new THREE.MeshStandardMaterial({ 
      map: floorTexture,
      roughness: 0.8,
      metalness: 0.1
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // ARENA WALLS
    createArenaWalls(scene);

    // INDOOR TRACK with realistic kerbs
    const { track, checkpoints } = createIndoorTrack(scene);

    // COLUMNS (like in indoor arenas)
    createArenaColumns(scene);

    // ADVERTISING BOARDS
    createAdvertisingBoards(scene);

    // Load Kart Model
    let kart = null;
    let kartLoaded = false;
    
    const loader = new GLTFLoader();
    loader.load(
      '/racing_kart_concept.glb',
      (gltf) => {
        kart = gltf.scene;
        kart.scale.set(0.8, 0.8, 0.8);
        kart.position.set(0, 0.2, 40);
        kart.castShadow = true;
        kart.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            // Add metallic look
            if (child.material) {
              child.material.metalness = 0.7;
              child.material.roughness = 0.3;
            }
          }
        });
        scene.add(kart);
        kartLoaded = true;
        console.log('Kart loaded!');
      },
      undefined,
      (error) => {
        console.error('Error loading kart:', error);
        kart = createRealisticKart();
        scene.add(kart);
        kartLoaded = true;
      }
    );

    // Game Physics
    let velocity = new THREE.Vector3();
    let kartRotation = 0;
    const maxSpeed = 0.8;
    const acceleration = 0.03;
    const friction = 0.97;
    const turnSpeed = 0.04;

    let currentCheckpoint = 0;
    let lapStartTime = Date.now();
    let raceStartTime = Date.now();
    let currentLap = 1;
    const totalLaps = 3;
    let lapTimes = [];
    let bestLapTime = null;

    const keys = {};
    window.addEventListener('keydown', (e) => keys[e.key.toLowerCase()] = true);
    window.addEventListener('keyup', (e) => keys[e.key.toLowerCase()] = false);

    function updateCamera() {
      if (!kart) return;
      
      const cameraOffset = new THREE.Vector3(
        Math.sin(kartRotation) * 10,
        6,
        Math.cos(kartRotation) * 10
      );
      
      camera.position.lerp(
        kart.position.clone().add(cameraOffset),
        0.1
      );
      camera.lookAt(kart.position);
    }

    function checkLapProgress() {
      if (!kart) return;
      const kartPos = kart.position;
      const nextCheckpoint = checkpoints[currentCheckpoint];
      const distance = kartPos.distanceTo(nextCheckpoint.position);
      
      if (distance < 8) {
        currentCheckpoint++;
        
        if (currentCheckpoint >= checkpoints.length) {
          currentCheckpoint = 0;
          const lapTime = Date.now() - lapStartTime;
          lapTimes.push(lapTime);
          
          if (!bestLapTime || lapTime < bestLapTime) {
            bestLapTime = lapTime;
          }
          
          lapStartTime = Date.now();
          currentLap++;
          
          if (currentLap > totalLaps) {
            finishRace();
          }
        }
        updateGameState();
      }
    }

    function updateGameState() {
      const speed = velocity.length() * 150;
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

    function finishRace() {
      if (bestLapTime) {
        submitScore(bestLapTime);
      }
    }

    function animate() {
      requestAnimationFrame(animate);

      if (kart && kartLoaded) {
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

        velocity.multiplyScalar(friction);

        if (velocity.length() > maxSpeed) {
          velocity.setLength(maxSpeed);
        }

        kart.position.add(velocity);
        kart.rotation.y = kartRotation;
        kart.position.y = 0.2;

        // Boundary check
        const distanceFromCenter = Math.sqrt(
          kart.position.x ** 2 + kart.position.z ** 2
        );
        if (distanceFromCenter > 50) {
          const angle = Math.atan2(kart.position.z, kart.position.x);
          kart.position.x = Math.cos(angle) * 50;
          kart.position.z = Math.sin(angle) * 50;
          velocity.multiplyScalar(-0.3);
        }

        updateCamera();
        checkLapProgress();
        updateGameState();
      }

      renderer.render(scene, camera);
    }

    animate();

    function handleResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    }
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      
      {/* Modern HUD */}
      <div style={{
        position: 'absolute',
        top: 20,
        left: 20,
        background: 'linear-gradient(135deg, rgba(0,0,0,0.9) 0%, rgba(30,30,30,0.9) 100%)',
        color: 'white',
        padding: '20px',
        borderRadius: '15px',
        minWidth: '280px',
        fontFamily: '"Orbitron", "Arial", sans-serif',
        border: '2px solid rgba(255,255,255,0.1)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
      }}>
        <h2 style={{ margin: '0 0 15px 0', color: '#00ff88', fontSize: '24px', textShadow: '0 0 10px #00ff88' }}>
          🏁 RACE DATA
        </h2>
        
        <div style={{ marginBottom: '15px', fontSize: '28px', fontWeight: 'bold' }}>
          <span style={{ color: '#888' }}>SPEED:</span>{' '}
          <span style={{ 
            color: gameState.speed > 100 ? '#ff0055' : '#00ff88',
            textShadow: `0 0 15px ${gameState.speed > 100 ? '#ff0055' : '#00ff88'}`
          }}>
            {gameState.speed}
          </span>
          <span style={{ fontSize: '18px', color: '#888' }}> km/h</span>
        </div>
        
        <div style={{ marginBottom: '12px', fontSize: '20px' }}>
          <span style={{ color: '#888' }}>LAP:</span> {gameState.currentLap} / {gameState.totalLaps}
        </div>
        
        <div style={{ marginBottom: '12px', color: '#888' }}>
          <strong>TIME:</strong> {formatTime(gameState.totalTime)}
        </div>
        
        {gameState.bestLapTime && (
          <div style={{ marginBottom: '12px', color: '#ffd700', fontWeight: 'bold' }}>
            ⭐ BEST: {formatTime(gameState.bestLapTime)}
          </div>
        )}
        
        {gameState.raceFinished && (
          <div style={{ 
            marginTop: '15px', 
            padding: '15px', 
            background: 'linear-gradient(135deg, #00ff88 0%, #00cc66 100%)',
            color: '#000',
            borderRadius: '10px',
            textAlign: 'center',
            fontWeight: 'bold',
            fontSize: '18px',
            animation: 'pulse 1s infinite'
          }}>
            🏁 RACE COMPLETE! 🏁
            <div style={{ fontSize: '12px', marginTop: '5px', fontWeight: 'normal' }}>
              Score saved!
            </div>
          </div>
        )}
      </div>

      {/* Exit Button */}
      <button
        onClick={() => navigate('/dashboard')}
        style={{
          position: 'absolute',
          top: 20,
          right: 20,
          padding: '12px 24px',
          background: 'linear-gradient(135deg, #ff0055 0%, #cc0044 100%)',
          color: 'white',
          border: 'none',
          borderRadius: '10px',
          cursor: 'pointer',
          fontSize: '16px',
          fontWeight: 'bold',
          fontFamily: '"Orbitron", "Arial", sans-serif',
          boxShadow: '0 4px 15px rgba(255,0,85,0.4)',
          transition: 'all 0.3s'
        }}
        onMouseOver={(e) => e.target.style.transform = 'scale(1.05)'}
        onMouseOut={(e) => e.target.style.transform = 'scale(1)'}
      >
        EXIT
      </button>
    </div>
  );
}

// REALISTIC TEXTURES
function createAsphaltTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  
  ctx.fillStyle = '#3a3a3a';
  ctx.fillRect(0, 0, 512, 512);
  
  for (let i = 0; i < 10000; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const shade = Math.random() * 30 - 15;
    ctx.fillStyle = `rgb(${58 + shade}, ${58 + shade}, ${58 + shade})`;
    ctx.fillRect(x, y, 2, 2);
  }
  
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(40, 40);
  return texture;
}

// ARENA WALLS
function createArenaWalls(scene) {
  const wallHeight = 8;
  const wallMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x2a2a2a,
    roughness: 0.9,
    metalness: 0.1
  });

  // 4 walls
  const positions = [
    { x: 0, z: -60, rx: 0, w: 120, h: wallHeight, d: 1 },
    { x: 0, z: 60, rx: 0, w: 120, h: wallHeight, d: 1 },
    { x: -60, z: 0, rx: Math.PI/2, w: 120, h: wallHeight, d: 1 },
    { x: 60, z: 0, rx: Math.PI/2, w: 120, h: wallHeight, d: 1 }
  ];

  positions.forEach(pos => {
    const wallGeometry = new THREE.BoxGeometry(pos.w, pos.h, pos.d);
    const wall = new THREE.Mesh(wallGeometry, wallMaterial);
    wall.position.set(pos.x, pos.h/2, pos.z);
    wall.rotation.y = pos.rx;
    wall.receiveShadow = true;
    scene.add(wall);
  });
}

// INDOOR TRACK
function createIndoorTrack(scene) {
  const trackWidth = 12;
  const trackMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x1a1a1a,
    roughness: 0.7
  });

  // Oval track path
  const trackShape = new THREE.Shape();
  const segments = 64;
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2;
    const x = Math.cos(angle) * 40;
    const z = Math.sin(angle) * 40;
    if (i === 0) trackShape.moveTo(x, z);
    else trackShape.lineTo(x, z);
  }

  const trackGeometry = new THREE.ShapeGeometry(trackShape);
  const track = new THREE.Mesh(trackGeometry, trackMaterial);
  track.rotation.x = -Math.PI / 2;
  track.position.y = 0.05;
  track.receiveShadow = true;
  scene.add(track);

  // REALISTIC KERBS (red-white)
  const checkpoints = [];
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    const x = Math.cos(angle) * 40;
    const z = Math.sin(angle) * 40;
    
    // Kerb blocks
    const kerbGeometry = new THREE.BoxGeometry(1.5, 0.15, 0.8);
    const kerbMaterial = new THREE.MeshStandardMaterial({ 
      color: i % 2 === 0 ? 0xff0000 : 0xffffff 
    });
    const kerb = new THREE.Mesh(kerbGeometry, kerbMaterial);
    kerb.position.set(x, 0.08, z);
    kerb.rotation.y = angle;
    kerb.receiveShadow = true;
    kerb.castShadow = true;
    scene.add(kerb);

    // Checkpoints every 8 segments
    if (i % 8 === 0) {
      checkpoints.push({
        position: new THREE.Vector3(x, 0, z)
      });
    }
  }

  return { track, checkpoints };
}

// ARENA COLUMNS
function createArenaColumns(scene) {
  const columnMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x404040,
    roughness: 0.8
  });

  const positions = [
    [-45, 0, -45], [45, 0, -45],
    [-45, 0, 45], [45, 0, 45],
    [-45, 0, 0], [45, 0, 0],
    [0, 0, -45], [0, 0, 45]
  ];

  positions.forEach(pos => {
    const columnGeometry = new THREE.CylinderGeometry(1.5, 1.5, 8, 16);
    const column = new THREE.Mesh(columnGeometry, columnMaterial);
    column.position.set(pos[0], 4, pos[2]);
    column.castShadow = true;
    column.receiveShadow = true;
    scene.add(column);
  });
}

// ADVERTISING BOARDS
function createAdvertisingBoards(scene) {
  const boardMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xffffff,
    emissive: 0x444444
  });

  const boards = [
    { x: 0, z: -58, text: 'MIKHIS MOTORS' },
    { x: 50, z: 0, text: 'AIMOL OIL' },
    { x: 0, z: 58, text: 'RACE LEAGUE' },
    { x: -50, z: 0, text: 'SPEED ZONE' }
  ];

  boards.forEach((board, i) => {
    const boardGeometry = new THREE.BoxGeometry(20, 3, 0.5);
    const boardMesh = new THREE.Mesh(boardGeometry, boardMaterial);
    boardMesh.position.set(board.x, 5, board.z);
    if (i === 1 || i === 3) boardMesh.rotation.y = Math.PI / 2;
    scene.add(boardMesh);
  });
}

// REALISTIC KART FALLBACK
function createRealisticKart() {
  const kart = new THREE.Group();
  
  // Body with metallic material
  const bodyGeometry = new THREE.BoxGeometry(2, 0.4, 3);
  const bodyMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xff3366,
    metalness: 0.8,
    roughness: 0.2
  });
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.castShadow = true;
  kart.add(body);
  
  // Cockpit
  const cockpitGeometry = new THREE.BoxGeometry(1.5, 0.6, 1.8);
  const cockpitMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x111111,
    metalness: 0.3,
    roughness: 0.7
  });
  const cockpit = new THREE.Mesh(cockpitGeometry, cockpitMaterial);
  cockpit.position.set(0, 0.3, -0.2);
  cockpit.castShadow = true;
  kart.add(cockpit);
  
  // Wheels
  const wheelGeometry = new THREE.CylinderGeometry(0.35, 0.35, 0.25, 16);
  const wheelMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x1a1a1a,
    metalness: 0.5,
    roughness: 0.8
  });
  
  const wheelPositions = [
    [-1.1, -0.2, 1.3],
    [1.1, -0.2, 1.3],
    [-1.1, -0.2, -1.3],
    [1.1, -0.2, -1.3]
  ];
  
  wheelPositions.forEach(pos => {
    const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(...pos);
    wheel.castShadow = true;
    kart.add(wheel);
  });
  
  // Rear wing
  const wingGeometry = new THREE.BoxGeometry(2, 0.1, 0.8);
  const wingMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x000000,
    metalness: 0.9,
    roughness: 0.1
  });
  const wing = new THREE.Mesh(wingGeometry, wingMaterial);
  wing.position.set(0, 0.8, -1.5);
  kart.add(wing);
  
  return kart;
}

export default GamePage;
