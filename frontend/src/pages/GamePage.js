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
    currentLap: 1,
    totalLaps: 3,
    lapTimes: [],
    bestLapTime: null,
    totalTime: 0,
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
    } catch (error) {
      console.error('Error submitting score:', error);
    }
  };

  useEffect(() => {
    if (!containerRef.current) return;

    console.log('🎮 Initializing game...');

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    scene.fog = new THREE.Fog(0x1a1a2e, 50, 150);
    
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 8, 15);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    containerRef.current.appendChild(renderer.domElement);

    console.log('✅ Renderer created');

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 1);
    mainLight.position.set(10, 20, 10);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 2048;
    mainLight.shadow.mapSize.height = 2048;
    scene.add(mainLight);

    // Multiple spot lights for indoor effect
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      const spotLight = new THREE.SpotLight(0xffffff, 0.8);
      spotLight.position.set(Math.cos(angle) * 25, 12, Math.sin(angle) * 25);
      spotLight.angle = Math.PI / 5;
      spotLight.penumbra = 0.3;
      scene.add(spotLight);
    }

    console.log('✅ Lighting setup complete');

    // FLOOR
    const floorGeometry = new THREE.PlaneGeometry(100, 100);
    const floorMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x2a2a2a,
      roughness: 0.9,
      metalness: 0.1
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    console.log('✅ Floor created');

    // WALLS
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
    const wallHeight = 10;
    
    // Back wall
    const backWall = new THREE.Mesh(
      new THREE.BoxGeometry(100, wallHeight, 1),
      wallMaterial
    );
    backWall.position.set(0, wallHeight/2, -50);
    backWall.receiveShadow = true;
    scene.add(backWall);

    // Front wall
    const frontWall = new THREE.Mesh(
      new THREE.BoxGeometry(100, wallHeight, 1),
      wallMaterial
    );
    frontWall.position.set(0, wallHeight/2, 50);
    frontWall.receiveShadow = true;
    scene.add(frontWall);

    // Left wall
    const leftWall = new THREE.Mesh(
      new THREE.BoxGeometry(1, wallHeight, 100),
      wallMaterial
    );
    leftWall.position.set(-50, wallHeight/2, 0);
    leftWall.receiveShadow = true;
    scene.add(leftWall);

    // Right wall
    const rightWall = new THREE.Mesh(
      new THREE.BoxGeometry(1, wallHeight, 100),
      wallMaterial
    );
    rightWall.position.set(50, wallHeight/2, 0);
    rightWall.receiveShadow = true;
    scene.add(rightWall);

    console.log('✅ Walls created');

    // TRACK
    const trackRadius = 30;
    const trackWidth = 10;
    const segments = 64;
    
    // Track surface
    const trackCurve = new THREE.EllipseCurve(
      0, 0,
      trackRadius, trackRadius,
      0, 2 * Math.PI,
      false,
      0
    );
    
    const trackPoints = trackCurve.getPoints(segments);
    const trackShape = new THREE.Shape(trackPoints);
    
    const trackGeometry = new THREE.ShapeGeometry(trackShape);
    const trackMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x333333,
      roughness: 0.8
    });
    const track = new THREE.Mesh(trackGeometry, trackMaterial);
    track.rotation.x = -Math.PI / 2;
    track.position.y = 0.01;
    track.receiveShadow = true;
    scene.add(track);

    console.log('✅ Track created');

    // KERBS (Red and white)
    const checkpoints = [];
    for (let i = 0; i < segments; i += 2) {
      const angle = (i / segments) * Math.PI * 2;
      const x = Math.cos(angle) * trackRadius;
      const z = Math.sin(angle) * trackRadius;
      
      const kerbGeometry = new THREE.BoxGeometry(1.2, 0.12, 0.6);
      const kerbMaterial = new THREE.MeshStandardMaterial({ 
        color: i % 4 === 0 ? 0xff0000 : 0xffffff
      });
      const kerb = new THREE.Mesh(kerbGeometry, kerbMaterial);
      kerb.position.set(x, 0.06, z);
      kerb.rotation.y = angle;
      kerb.castShadow = true;
      scene.add(kerb);

      if (i % 8 === 0) {
        checkpoints.push({ position: new THREE.Vector3(x, 0, z) });
      }
    }

    console.log('✅ Kerbs and checkpoints created');

    // KART (Simplified but good looking)
    const kart = new THREE.Group();
    
    // Main body
    const bodyGeometry = new THREE.BoxGeometry(1.8, 0.4, 2.8);
    const bodyMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xff3366,
      metalness: 0.7,
      roughness: 0.3
    });
    const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    body.castShadow = true;
    kart.add(body);
    
    // Cockpit
    const cockpitGeometry = new THREE.BoxGeometry(1.2, 0.5, 1.5);
    const cockpitMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x111111,
      metalness: 0.3,
      roughness: 0.7
    });
    const cockpit = new THREE.Mesh(cockpitGeometry, cockpitMaterial);
    cockpit.position.y = 0.25;
    cockpit.castShadow = true;
    kart.add(cockpit);
    
    // Wheels
    const wheelGeometry = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 16);
    const wheelMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x1a1a1a,
      metalness: 0.5,
      roughness: 0.8
    });
    
    const wheelPositions = [
      [-0.9, -0.15, 1.1],
      [0.9, -0.15, 1.1],
      [-0.9, -0.15, -1.1],
      [0.9, -0.15, -1.1]
    ];
    
    wheelPositions.forEach(pos => {
      const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(...pos);
      wheel.castShadow = true;
      kart.add(wheel);
    });
    
    // Rear wing
    const wingGeometry = new THREE.BoxGeometry(1.8, 0.08, 0.6);
    const wingMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x000000,
      metalness: 0.9,
      roughness: 0.1
    });
    const wing = new THREE.Mesh(wingGeometry, wingMaterial);
    wing.position.set(0, 0.7, -1.3);
    kart.add(wing);
    
    kart.position.set(0, 0.3, trackRadius);
    scene.add(kart);

    console.log('✅ Kart created');

    // ADVERTISING BOARDS
    const boardPositions = [
      { x: 0, z: -45, rot: 0, text: 'MIKHIS' },
      { x: 45, z: 0, rot: Math.PI/2, text: 'AIMOL' },
      { x: 0, z: 45, rot: Math.PI, text: 'RACING' },
      { x: -45, z: 0, rot: -Math.PI/2, text: 'LEAGUE' }
    ];

    boardPositions.forEach(board => {
      const boardGeometry = new THREE.BoxGeometry(15, 2.5, 0.3);
      const boardMaterial = new THREE.MeshStandardMaterial({ 
        color: 0xffffff,
        emissive: 0x333333
      });
      const boardMesh = new THREE.Mesh(boardGeometry, boardMaterial);
      boardMesh.position.set(board.x, 6, board.z);
      boardMesh.rotation.y = board.rot;
      scene.add(boardMesh);
    });

    console.log('✅ Advertising boards created');

    // Game state
    let velocity = new THREE.Vector3();
    let kartRotation = 0;
    const maxSpeed = 0.6;
    const acceleration = 0.025;
    const friction = 0.97;
    const turnSpeed = 0.035;

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
      const cameraOffset = new THREE.Vector3(
        Math.sin(kartRotation) * 12,
        7,
        Math.cos(kartRotation) * 12
      );
      camera.position.lerp(kart.position.clone().add(cameraOffset), 0.1);
      camera.lookAt(kart.position);
    }

    function checkLapProgress() {
      const kartPos = kart.position;
      const nextCheckpoint = checkpoints[currentCheckpoint];
      const distance = kartPos.distanceTo(nextCheckpoint.position);
      
      if (distance < 6) {
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
            if (bestLapTime) submitScore(bestLapTime);
          }
        }
        updateGameState();
      }
    }

    function updateGameState() {
      const speed = velocity.length() * 120;
      const totalTime = Date.now() - raceStartTime;
      
      setGameState({
        speed: Math.round(speed),
        currentLap: Math.min(currentLap, totalLaps),
        totalLaps: totalLaps,
        lapTimes: lapTimes,
        bestLapTime: bestLapTime,
        totalTime: totalTime,
        isRacing: currentLap <= totalLaps,
        raceFinished: currentLap > totalLaps
      });
    }

    function animate() {
      requestAnimationFrame(animate);

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

      velocity.multiplyScalar(friction);
      if (velocity.length() > maxSpeed) {
        velocity.setLength(maxSpeed);
      }

      kart.position.add(velocity);
      kart.rotation.y = kartRotation;
      kart.position.y = 0.3;

      // Boundaries
      const distanceFromCenter = Math.sqrt(kart.position.x ** 2 + kart.position.z ** 2);
      if (distanceFromCenter > 45) {
        const angle = Math.atan2(kart.position.z, kart.position.x);
        kart.position.x = Math.cos(angle) * 45;
        kart.position.z = Math.sin(angle) * 45;
        velocity.multiplyScalar(-0.3);
      }

      updateCamera();
      checkLapProgress();
      updateGameState();
      renderer.render(scene, camera);
    }

    animate();
    console.log('✅ Game loop started');

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
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: '#000' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      
      <div style={{
        position: 'absolute',
        top: 20,
        left: 20,
        background: 'linear-gradient(135deg, rgba(0,0,0,0.95) 0%, rgba(30,30,30,0.95) 100%)',
        color: 'white',
        padding: '20px',
        borderRadius: '15px',
        minWidth: '260px',
        fontFamily: 'Arial, sans-serif',
        border: '2px solid rgba(0,255,136,0.3)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
      }}>
        <h2 style={{ margin: '0 0 15px 0', color: '#00ff88', fontSize: '22px' }}>
          🏁 RACE DATA
        </h2>
        
        <div style={{ marginBottom: '12px', fontSize: '26px', fontWeight: 'bold' }}>
          <span style={{ color: '#888' }}>SPEED:</span>{' '}
          <span style={{ color: gameState.speed > 80 ? '#ff0055' : '#00ff88' }}>
            {gameState.speed}
          </span>
          <span style={{ fontSize: '16px', color: '#888' }}> km/h</span>
        </div>
        
        <div style={{ marginBottom: '10px', fontSize: '18px' }}>
          <span style={{ color: '#888' }}>LAP:</span> {gameState.currentLap} / {gameState.totalLaps}
        </div>
        
        <div style={{ marginBottom: '10px', color: '#888' }}>
          <strong>TIME:</strong> {formatTime(gameState.totalTime)}
        </div>
        
        {gameState.bestLapTime && (
          <div style={{ marginBottom: '10px', color: '#ffd700', fontWeight: 'bold' }}>
            ⭐ BEST: {formatTime(gameState.bestLapTime)}
          </div>
        )}
        
        {gameState.raceFinished && (
          <div style={{ 
            marginTop: '15px', 
            padding: '12px', 
            background: 'linear-gradient(135deg, #00ff88 0%, #00cc66 100%)',
            color: '#000',
            borderRadius: '8px',
            textAlign: 'center',
            fontWeight: 'bold'
          }}>
            🏁 RACE COMPLETE! 🏁
          </div>
        )}
      </div>

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
          boxShadow: '0 4px 15px rgba(255,0,85,0.4)'
        }}
      >
        EXIT
      </button>
    </div>
  );
}

export default GamePage;
