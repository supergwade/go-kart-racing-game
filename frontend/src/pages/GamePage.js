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
    totalLaps: 5,
    lapTimes: [],
    bestLapTime: null,
    totalTime: 0,
    position: 1,
    totalRacers: 4,
    isRacing: true,
    raceFinished: false,
    countdown: 3
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
        { lap_time: lapTime / 1000, track_name: 'Grand Prix Circuit' },
        { headers: { 'Authorization': `Bearer ${token}` } }
      );
    } catch (error) {
      console.error('Error submitting score:', error);
    }
  };

  useEffect(() => {
    if (!containerRef.current) return;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a15);
    scene.fog = new THREE.Fog(0x0a0a15, 60, 180);
    
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 10, 20);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    containerRef.current.appendChild(renderer.domElement);

    // PROFESSIONAL LIGHTING
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffffff, 1.2);
    mainLight.position.set(30, 40, 30);
    mainLight.castShadow = true;
    mainLight.shadow.mapSize.width = 2048;
    mainLight.shadow.mapSize.height = 2048;
    mainLight.shadow.camera.left = -80;
    mainLight.shadow.camera.right = 80;
    mainLight.shadow.camera.top = 80;
    mainLight.shadow.camera.bottom = -80;
    scene.add(mainLight);

    // Rim lights for depth
    const rimLight1 = new THREE.DirectionalLight(0x4488ff, 0.5);
    rimLight1.position.set(-30, 20, -30);
    scene.add(rimLight1);

    const rimLight2 = new THREE.DirectionalLight(0xff4488, 0.3);
    rimLight2.position.set(30, 15, -30);
    scene.add(rimLight2);

    // Indoor ceiling lights
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const spotLight = new THREE.SpotLight(0xffffff, 1.5);
      spotLight.position.set(Math.cos(angle) * 35, 18, Math.sin(angle) * 35);
      spotLight.angle = Math.PI / 6;
      spotLight.penumbra = 0.4;
      spotLight.decay = 2;
      spotLight.distance = 80;
      scene.add(spotLight);
    }

    // ARENA FLOOR with texture
    const floorGeometry = new THREE.PlaneGeometry(150, 150);
    const floorCanvas = document.createElement('canvas');
    floorCanvas.width = 512;
    floorCanvas.height = 512;
    const ctx = floorCanvas.getContext('2d');
    
    // Create asphalt texture
    ctx.fillStyle = '#2a2a2a';
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 15000; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const shade = Math.random() * 40 - 20;
      ctx.fillStyle = `rgb(${42 + shade}, ${42 + shade}, ${42 + shade})`;
      ctx.fillRect(x, y, 2, 2);
    }
    
    const floorTexture = new THREE.CanvasTexture(floorCanvas);
    floorTexture.wrapS = THREE.RepeatWrapping;
    floorTexture.wrapT = THREE.RepeatWrapping;
    floorTexture.repeat.set(50, 50);
    
    const floorMaterial = new THREE.MeshStandardMaterial({ 
      map: floorTexture,
      roughness: 0.85,
      metalness: 0.05
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // ARENA WALLS with details
    const wallHeight = 12;
    const wallMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x1a1a1a,
      roughness: 0.9
    });

    const walls = [
      { x: 0, z: -75, rx: 0, w: 150, h: wallHeight, d: 2 },
      { x: 0, z: 75, rx: 0, w: 150, h: wallHeight, d: 2 },
      { x: -75, z: 0, rx: Math.PI/2, w: 150, h: wallHeight, d: 2 },
      { x: 75, z: 0, rx: Math.PI/2, w: 150, h: wallHeight, d: 2 }
    ];

    walls.forEach(w => {
      const wallGeometry = new THREE.BoxGeometry(w.w, w.h, w.d);
      const wall = new THREE.Mesh(wallGeometry, wallMaterial);
      wall.position.set(w.x, w.h/2, w.z);
      wall.rotation.y = w.rx;
      wall.receiveShadow = true;
      wall.castShadow = true;
      scene.add(wall);
    });

    // CEILING
    const ceilingGeometry = new THREE.PlaneGeometry(150, 150);
    const ceilingMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x0a0a0a,
      roughness: 0.95,
      side: THREE.DoubleSide
    });
    const ceiling = new THREE.Mesh(ceilingGeometry, ceilingMaterial);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = wallHeight;
    scene.add(ceiling);

    // COMPLEX TRACK - Figure 8 / Complex layout
    const trackPoints = [];
    const segments = 120;
    
    // Create complex track path
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const angle = t * Math.PI * 2;
      
      // Figure-8 shape with variations
      let x = Math.sin(angle * 2) * 35;
      let z = Math.sin(angle) * 45;
      
      // Add chicanes
      if (i % 30 < 5) {
        x += Math.sin(i * 2) * 5;
      }
      
      trackPoints.push(new THREE.Vector3(x, 0, z));
    }

    // Draw track surface
    const trackCurve = new THREE.CatmullRomCurve3(trackPoints, true);
    const trackWidth = 12;
    
    const trackGeometry = new THREE.TubeGeometry(trackCurve, segments, trackWidth / 2, 8, true);
    const trackMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x333333,
      roughness: 0.75,
      metalness: 0.05
    });
    const track = new THREE.Mesh(trackGeometry, trackMaterial);
    track.rotation.x = Math.PI / 2;
    track.receiveShadow = true;
    scene.add(track);

    // RACING LINE (white dashed)
    const linePoints = trackCurve.getPoints(200);
    const lineMaterial = new THREE.LineDashedMaterial({ 
      color: 0xffffff, 
      dashSize: 2, 
      gapSize: 1,
      opacity: 0.6,
      transparent: true
    });
    const lineGeometry = new THREE.BufferGeometry().setFromPoints(linePoints);
    const racingLine = new THREE.Line(lineGeometry, lineMaterial);
    racingLine.computeLineDistances();
    racingLine.position.y = 0.05;
    scene.add(racingLine);

    // KERBS (Red-White) with proper spacing
    const checkpoints = [];
    const kerbInterval = 3;
    
    for (let i = 0; i < segments; i += kerbInterval) {
      const t = i / segments;
      const point = trackCurve.getPointAt(t);
      const tangent = trackCurve.getTangentAt(t);
      const angle = Math.atan2(tangent.z, tangent.x);
      
      // Outer kerbs
      const outerX = point.x + Math.cos(angle + Math.PI/2) * (trackWidth/2 + 0.5);
      const outerZ = point.z + Math.sin(angle + Math.PI/2) * (trackWidth/2 + 0.5);
      
      const kerbGeometry = new THREE.BoxGeometry(1.5, 0.15, 0.8);
      const kerbMaterial = new THREE.MeshStandardMaterial({ 
        color: i % 6 === 0 ? 0xff0000 : 0xffffff,
        roughness: 0.6
      });
      const kerb = new THREE.Mesh(kerbGeometry, kerbMaterial);
      kerb.position.set(outerX, 0.08, outerZ);
      kerb.rotation.y = angle;
      kerb.castShadow = true;
      kerb.receiveShadow = true;
      scene.add(kerb);

      // Checkpoints every 15 segments
      if (i % 15 === 0) {
        checkpoints.push({
          position: new THREE.Vector3(point.x, 0, point.z),
          angle: angle
        });
      }
    }

    // START/FINISH LINE
    const startPos = trackCurve.getPointAt(0);
    const startGeometry = new THREE.PlaneGeometry(trackWidth, 2);
    const startMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xffffff,
      emissive: 0x444444,
      side: THREE.DoubleSide
    });
    const startLine = new THREE.Mesh(startGeometry, startMaterial);
    startLine.rotation.x = -Math.PI / 2;
    startLine.position.set(startPos.x, 0.02, startPos.z);
    scene.add(startLine);

    // COLUMNS around track
    const columnMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x404040,
      roughness: 0.7,
      metalness: 0.3
    });

    const columnPositions = [
      [-60, 0, -60], [60, 0, -60], [-60, 0, 60], [60, 0, 60],
      [-60, 0, 0], [60, 0, 0], [0, 0, -60], [0, 0, 60],
      [-40, 0, -40], [40, 0, -40], [-40, 0, 40], [40, 0, 40]
    ];

    columnPositions.forEach(pos => {
      const columnGeometry = new THREE.CylinderGeometry(2, 2, wallHeight, 16);
      const column = new THREE.Mesh(columnGeometry, columnMaterial);
      column.position.set(pos[0], wallHeight/2, pos[2]);
      column.castShadow = true;
      column.receiveShadow = true;
      scene.add(column);
    });

    // ADVERTISING BOARDS with lights
    const boardData = [
      { x: 0, z: -70, rot: 0, color: 0xff3366, text: 'MIKHIS MOTORS' },
      { x: 70, z: 0, rot: Math.PI/2, color: 0x3366ff, text: 'AIMOL RACING' },
      { x: 0, z: 70, rot: Math.PI, color: 0x33ff66, text: 'SPEED LEAGUE' },
      { x: -70, z: 0, rot: -Math.PI/2, color: 0xffcc33, text: 'TURBO ZONE' }
    ];

    boardData.forEach(board => {
      const boardGroup = new THREE.Group();
      
      // Board frame
      const frameGeometry = new THREE.BoxGeometry(25, 4, 0.5);
      const frameMaterial = new THREE.MeshStandardMaterial({ 
        color: 0x1a1a1a,
        roughness: 0.4,
        metalness: 0.6
      });
      const frame = new THREE.Mesh(frameGeometry, frameMaterial);
      boardGroup.add(frame);
      
      // LED screen
      const screenGeometry = new THREE.BoxGeometry(23, 3.5, 0.3);
      const screenMaterial = new THREE.MeshStandardMaterial({ 
        color: board.color,
        emissive: board.color,
        emissiveIntensity: 0.5,
        roughness: 0.3
      });
      const screen = new THREE.Mesh(screenGeometry, screenMaterial);
      screen.position.z = 0.3;
      boardGroup.add(screen);
      
      // Spotlights on boards
      const boardSpot = new THREE.SpotLight(board.color, 0.8);
      boardSpot.position.set(0, -2, 2);
      boardSpot.angle = Math.PI / 4;
      boardGroup.add(boardSpot);
      
      boardGroup.position.set(board.x, 8, board.z);
      boardGroup.rotation.y = board.rot;
      scene.add(boardGroup);
    });

    // PLAYER KART - Detailed F1 style
    const kart = new THREE.Group();
    
    // Main chassis
    const chassisGeometry = new THREE.BoxGeometry(2, 0.35, 3.2);
    const chassisMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xff1744,
      metalness: 0.8,
      roughness: 0.2,
      emissive: 0x330000,
      emissiveIntensity: 0.1
    });
    const chassis = new THREE.Mesh(chassisGeometry, chassisMaterial);
    chassis.castShadow = true;
    kart.add(chassis);
    
    // Cockpit
    const cockpitGeometry = new THREE.BoxGeometry(1.4, 0.6, 1.8);
    const cockpitMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x0a0a0a,
      metalness: 0.4,
      roughness: 0.6
    });
    const cockpit = new THREE.Mesh(cockpitGeometry, cockpitMaterial);
    cockpit.position.set(0, 0.35, -0.2);
    cockpit.castShadow = true;
    kart.add(cockpit);
    
    // Front nose
    const noseGeometry = new THREE.ConeGeometry(0.3, 0.8, 8);
    const noseMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x000000,
      metalness: 0.9,
      roughness: 0.1
    });
    const nose = new THREE.Mesh(noseGeometry, noseMaterial);
    nose.rotation.x = -Math.PI / 2;
    nose.position.set(0, 0.15, 1.9);
    kart.add(nose);
    
    // Wheels with rim details
    const wheelGeometry = new THREE.CylinderGeometry(0.35, 0.35, 0.25, 16);
    const wheelMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x0a0a0a,
      metalness: 0.6,
      roughness: 0.7
    });
    
    const rimGeometry = new THREE.CylinderGeometry(0.25, 0.25, 0.3, 16);
    const rimMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xcccccc,
      metalness: 0.9,
      roughness: 0.1
    });
    
    const wheelPositions = [
      [-1, -0.15, 1.2],
      [1, -0.15, 1.2],
      [-1, -0.15, -1.2],
      [1, -0.15, -1.2]
    ];
    
    wheelPositions.forEach(pos => {
      const wheelGroup = new THREE.Group();
      
      const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
      wheel.rotation.z = Math.PI / 2;
      wheel.castShadow = true;
      wheelGroup.add(wheel);
      
      const rim = new THREE.Mesh(rimGeometry, rimMaterial);
      rim.rotation.z = Math.PI / 2;
      wheelGroup.add(rim);
      
      wheelGroup.position.set(...pos);
      kart.add(wheelGroup);
    });
    
    // Rear wing
    const wingGeometry = new THREE.BoxGeometry(2.2, 0.1, 0.8);
    const wingMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x000000,
      metalness: 0.95,
      roughness: 0.05
    });
    const wing = new THREE.Mesh(wingGeometry, wingMaterial);
    wing.position.set(0, 0.8, -1.5);
    wing.castShadow = true;
    kart.add(wing);
    
    // Wing supports
    const supportGeometry = new THREE.CylinderGeometry(0.05, 0.05, 0.6, 8);
    const supportMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x1a1a1a,
      metalness: 0.8
    });
    [-0.8, 0.8].forEach(x => {
      const support = new THREE.Mesh(supportGeometry, supportMaterial);
      support.position.set(x, 0.5, -1.5);
      kart.add(support);
    });
    
    // LED lights
    const ledGeometry = new THREE.SphereGeometry(0.08, 8, 8);
    const ledMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xff0000,
      emissive: 0xff0000,
      emissiveIntensity: 1
    });
    [-0.7, 0.7].forEach(x => {
      const led = new THREE.Mesh(ledGeometry, ledMaterial);
      led.position.set(x, 0.15, -1.7);
      kart.add(led);
    });
    
    kart.position.set(startPos.x, 0.4, startPos.z);
    scene.add(kart);

    // AI OPPONENTS
    const opponents = [];
    const opponentColors = [0x3366ff, 0x33ff66, 0xffcc33];
    
    for (let i = 0; i < 3; i++) {
      const aiKart = kart.clone();
      aiKart.traverse((child) => {
        if (child.isMesh && child.material.color.r > 0.9) {
          child.material = chassisMaterial.clone();
          child.material.color.setHex(opponentColors[i]);
        }
      });
      
      const startT = (i + 1) * 0.05;
      const aiPos = trackCurve.getPointAt(startT);
      aiKart.position.set(aiPos.x, 0.4, aiPos.z);
      scene.add(aiKart);
      
      opponents.push({
        kart: aiKart,
        t: startT,
        speed: 0.0008 + Math.random() * 0.0002,
        checkpoint: 0
      });
    }

    // GAME PHYSICS
    let velocity = new THREE.Vector3();
    let kartRotation = 0;
    let currentT = 0;
    const maxSpeed = 0.001;
    const acceleration = 0.00003;
    const friction = 0.97;
    const turnSpeed = 0.03;

    let currentCheckpoint = 0;
    let lapStartTime = null;
    let raceStartTime = null;
    let currentLap = 0;
    const totalLaps = 5;
    let lapTimes = [];
    let bestLapTime = null;
    let raceStarted = false;
    let countdown = 3;

    const keys = {};
    window.addEventListener('keydown', (e) => keys[e.key.toLowerCase()] = true);
    window.addEventListener('keyup', (e) => keys[e.key.toLowerCase()] = false);

    // COUNTDOWN
    const countdownInterval = setInterval(() => {
      countdown--;
      setGameState(prev => ({ ...prev, countdown }));
      
      if (countdown === 0) {
        clearInterval(countdownInterval);
        raceStarted = true;
        raceStartTime = Date.now();
        lapStartTime = Date.now();
        currentLap = 1;
      }
    }, 1000);

    function updateCamera() {
      const tangent = trackCurve.getTangentAt(currentT);
      const angle = Math.atan2(tangent.z, tangent.x);
      
      const cameraOffset = new THREE.Vector3(
        Math.sin(angle + Math.PI) * 14,
        8,
        Math.cos(angle + Math.PI) * 14
      );
      
      camera.position.lerp(kart.position.clone().add(cameraOffset), 0.08);
      camera.lookAt(kart.position);
    }

    function updateAI() {
      opponents.forEach(opponent => {
        opponent.t += opponent.speed;
        if (opponent.t > 1) opponent.t -= 1;
        
        const pos = trackCurve.getPointAt(opponent.t);
        const tangent = trackCurve.getTangentAt(opponent.t);
        const angle = Math.atan2(tangent.z, tangent.x);
        
        opponent.kart.position.set(pos.x, 0.4, pos.z);
        opponent.kart.rotation.y = angle + Math.PI / 2;
      });
    }

    function checkLapProgress() {
      const kartPos = kart.position;
      const nextCheckpoint = checkpoints[currentCheckpoint];
      const distance = kartPos.distanceTo(nextCheckpoint.position);
      
      if (distance < 10) {
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
      const speed = velocity.length() * 50000;
      const totalTime = raceStartTime ? Date.now() - raceStartTime : 0;
      
      setGameState({
        speed: Math.round(speed),
        currentLap: Math.min(currentLap, totalLaps),
        totalLaps: totalLaps,
        lapTimes: lapTimes,
        bestLapTime: bestLapTime,
        totalTime: totalTime,
        position: 1,
        totalRacers: 4,
        isRacing: currentLap <= totalLaps && raceStarted,
        raceFinished: currentLap > totalLaps,
        countdown: countdown
      });
    }

    function animate() {
      requestAnimationFrame(animate);

      if (raceStarted) {
        // Player controls
        if (keys['w'] || keys['arrowup']) {
          const tangent = trackCurve.getTangentAt(currentT);
          velocity.x += tangent.x * acceleration;
          velocity.z += tangent.z * acceleration;
        }
        if (keys['s'] || keys['arrowdown']) {
          const tangent = trackCurve.getTangentAt(currentT);
          velocity.x -= tangent.x * acceleration * 0.5;
          velocity.z -= tangent.z * acceleration * 0.5;
        }
        if (keys['a'] || keys['arrowleft']) {
          currentT -= turnSpeed * 0.0005;
        }
        if (keys['d'] || keys['arrowright']) {
          currentT += turnSpeed * 0.0005;
        }

        velocity.multiplyScalar(friction);
        if (velocity.length() > maxSpeed) {
          velocity.setLength(maxSpeed);
        }

        currentT += velocity.length();
        if (currentT > 1) currentT -= 1;
        if (currentT < 0) currentT += 1;

        const pos = trackCurve.getPointAt(currentT);
        const tangent = trackCurve.getTangentAt(currentT);
        const angle = Math.atan2(tangent.z, tangent.x);

        kart.position.set(pos.x, 0.4, pos.z);
        kart.rotation.y = angle + Math.PI / 2;

        updateCamera();
        updateAI();
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
      clearInterval(countdownInterval);
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
      
      {/* Countdown */}
      {gameState.countdown > 0 && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          fontSize: '180px',
          fontWeight: 'bold',
          color: '#00ff88',
          textShadow: '0 0 40px #00ff88, 0 0 80px #00ff88',
          animation: 'pulse 1s ease-in-out',
          zIndex: 1000
        }}>
          {gameState.countdown}
        </div>
      )}
      
      {/* HUD */}
      <div style={{
        position: 'absolute',
        top: 20,
        left: 20,
        background: 'linear-gradient(135deg, rgba(0,0,0,0.95) 0%, rgba(20,20,40,0.95) 100%)',
        color: 'white',
        padding: '20px',
        borderRadius: '15px',
        minWidth: '280px',
        fontFamily: 'Arial, sans-serif',
        border: '2px solid rgba(0,255,136,0.4)',
        boxShadow: '0 8px 32px rgba(0,255,136,0.3)'
      }}>
        <h2 style={{ margin: '0 0 15px 0', color: '#00ff88', fontSize: '24px', textTransform: 'uppercase' }}>
          🏁 GRAND PRIX
        </h2>
        
        <div style={{ marginBottom: '15px', fontSize: '32px', fontWeight: 'bold' }}>
          <span style={{ color: '#888' }}>SPEED:</span>{' '}
          <span style={{ 
            color: gameState.speed > 100 ? '#ff0055' : '#00ff88',
            textShadow: `0 0 10px ${gameState.speed > 100 ? '#ff0055' : '#00ff88'}`
          }}>
            {gameState.speed}
          </span>
          <span style={{ fontSize: '18px', color: '#888' }}> km/h</span>
        </div>
        
        <div style={{ marginBottom: '12px', fontSize: '22px' }}>
          <span style={{ color: '#888' }}>POSITION:</span>{' '}
          <span style={{ color: '#ffd700', fontWeight: 'bold' }}>
            {gameState.position}/{gameState.totalRacers}
          </span>
        </div>
        
        <div style={{ marginBottom: '12px', fontSize: '20px' }}>
          <span style={{ color: '#888' }}>LAP:</span> {gameState.currentLap}/{gameState.totalLaps}
        </div>
        
        <div style={{ marginBottom: '12px', color: '#888' }}>
          <strong>TIME:</strong> {formatTime(gameState.totalTime)}
        </div>
        
        {gameState.bestLapTime && (
          <div style={{ marginBottom: '12px', color: '#ffd700', fontWeight: 'bold' }}>
            ⭐ BEST LAP: {formatTime(gameState.bestLapTime)}
          </div>
        )}
        
        {gameState.lapTimes.length > 0 && (
          <div style={{ marginTop: '15px', borderTop: '1px solid rgba(255,255,255,0.2)', paddingTop: '10px' }}>
            <strong style={{ color: '#888' }}>LAP TIMES:</strong>
            {gameState.lapTimes.slice(-3).map((time, index) => (
              <div key={index} style={{ fontSize: '14px', color: '#aaa', fontFamily: 'monospace' }}>
                L{gameState.lapTimes.length - gameState.lapTimes.slice(-3).length + index + 1}: {formatTime(time)}
              </div>
            ))}
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
            boxShadow: '0 4px 20px rgba(0,255,136,0.5)'
          }}>
            🏆 VICTORY! 🏆
            <div style={{ fontSize: '12px', marginTop: '5px', fontWeight: 'normal' }}>
              Race Complete!
            </div>
          </div>
        )}
      </div>

      {/* Position indicator */}
      <div style={{
        position: 'absolute',
        top: '50%',
        right: 40,
        transform: 'translateY(-50%)',
        fontSize: '140px',
        fontWeight: 'bold',
        color: 'rgba(255,215,0,0.15)',
        textShadow: '0 0 30px rgba(255,215,0,0.3)',
        fontFamily: 'Arial Black, sans-serif'
      }}>
        {gameState.position}
      </div>

      <button
        onClick={() => navigate('/dashboard')}
        style={{
          position: 'absolute',
          top: 20,
          right: 20,
          padding: '14px 28px',
          background: 'linear-gradient(135deg, #ff0055 0%, #cc0044 100%)',
          color: 'white',
          border: 'none',
          borderRadius: '12px',
          cursor: 'pointer',
          fontSize: '18px',
          fontWeight: 'bold',
          textTransform: 'uppercase',
          boxShadow: '0 6px 20px rgba(255,0,85,0.5)',
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

export default GamePage;
