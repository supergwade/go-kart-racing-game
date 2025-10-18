import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

function GamePageImproved({ user }) {
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
    isRacing: false,
    raceFinished: false,
    countdown: 3
  });

  // Mobile controls
  const [mobileControls, setMobileControls] = useState({
    accelerate: false,
    brake: false,
    steerLeft: false,
    steerRight: false
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

    // ===== SCENE SETUP =====
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.Fog(0x87ceeb, 100, 300);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 8, 15);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    containerRef.current.appendChild(renderer.domElement);

    // ===== PHYSICS WORLD =====
    const world = new CANNON.World();
    world.gravity.set(0, -30, 0);
    world.broadphase = new CANNON.SAPBroadphase(world);
    world.allowSleep = true;
    world.defaultContactMaterial.friction = 0.4;

    // ===== LIGHTING =====
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 1.0);
    sunLight.position.set(50, 100, 50);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.left = -100;
    sunLight.shadow.camera.right = 100;
    sunLight.shadow.camera.top = 100;
    sunLight.shadow.camera.bottom = -100;
    scene.add(sunLight);

    // ===== GROUND =====
    const groundGeometry = new THREE.PlaneGeometry(300, 300);
    const groundMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x2d5016,
      roughness: 0.9
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const groundBody = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Plane()
    });
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    world.addBody(groundBody);

    // ===== TRACK CREATION =====
    const trackPath = [];
    const numPoints = 60;
    
    // Create a more interesting track layout - oval with chicanes
    for (let i = 0; i <= numPoints; i++) {
      const t = (i / numPoints) * Math.PI * 2;
      
      // Oval base
      let x = Math.sin(t) * 60;
      let z = Math.cos(t) * 40;
      
      // Add chicanes
      if (i % 15 === 0 && i > 0 && i < numPoints) {
        x += Math.sin(t * 5) * 8;
      }
      
      trackPath.push(new THREE.Vector2(x, z));
    }

    // Draw track surface
    const trackShape = new THREE.Shape();
    const trackWidth = 15;
    
    // Draw track using shape
    for (let i = 0; i < trackPath.length; i++) {
      const point = trackPath[i];
      const nextPoint = trackPath[(i + 1) % trackPath.length];
      const prevPoint = trackPath[(i - 1 + trackPath.length) % trackPath.length];
      
      const dx = nextPoint.x - prevPoint.x;
      const dy = nextPoint.y - prevPoint.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const nx = -dy / len;
      const ny = dx / len;
      
      const innerX = point.x + nx * trackWidth / 2;
      const innerY = point.y + ny * trackWidth / 2;
      const outerX = point.x - nx * trackWidth / 2;
      const outerY = point.y - ny * trackWidth / 2;
      
      if (i === 0) {
        trackShape.moveTo(innerX, innerY);
      }
    }

    // Simpler approach - just draw track segments
    const trackMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x444444,
      roughness: 0.7
    });

    for (let i = 0; i < trackPath.length - 1; i++) {
      const p1 = trackPath[i];
      const p2 = trackPath[i + 1];
      
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const length = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      
      const segmentGeo = new THREE.PlaneGeometry(length, trackWidth);
      const segment = new THREE.Mesh(segmentGeo, trackMaterial);
      segment.rotation.x = -Math.PI / 2;
      segment.rotation.z = -angle;
      segment.position.set((p1.x + p2.x) / 2, 0.02, (p1.y + p2.y) / 2);
      segment.receiveShadow = true;
      scene.add(segment);
    }

    // Add track boundaries (kerbs)
    const kerbMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    const kerbGeometry = new THREE.BoxGeometry(2, 0.3, 2);
    
    for (let i = 0; i < trackPath.length; i += 3) {
      const point = trackPath[i];
      const nextPoint = trackPath[(i + 1) % trackPath.length];
      const prevPoint = trackPath[(i - 1 + trackPath.length) % trackPath.length];
      
      const dx = nextPoint.x - prevPoint.x;
      const dy = nextPoint.y - prevPoint.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const nx = -dy / len;
      const ny = dx / len;
      
      // Inner kerbs
      const innerKerb = new THREE.Mesh(kerbGeometry, 
        i % 6 === 0 ? kerbMaterial : new THREE.MeshStandardMaterial({ color: 0xffffff }));
      innerKerb.position.set(point.x + nx * trackWidth / 2, 0.15, point.y + ny * trackWidth / 2);
      innerKerb.castShadow = true;
      scene.add(innerKerb);
      
      // Outer kerbs
      const outerKerb = new THREE.Mesh(kerbGeometry,
        i % 6 === 0 ? kerbMaterial : new THREE.MeshStandardMaterial({ color: 0xffffff }));
      outerKerb.position.set(point.x - nx * trackWidth / 2, 0.15, point.y - ny * trackWidth / 2);
      outerKerb.castShadow = true;
      scene.add(outerKerb);
    }

    // ===== CHECKPOINT SYSTEM =====
    const checkpoints = [];
    const checkpointInterval = 5;
    
    for (let i = 0; i < trackPath.length; i += checkpointInterval) {
      const point = trackPath[i];
      const nextPoint = trackPath[(i + 1) % trackPath.length];
      
      checkpoints.push({
        position: new THREE.Vector3(point.x, 0, point.y),
        passed: false,
        isFinishLine: i === 0
      });
      
      // Visual finish line
      if (i === 0) {
        const finishGeo = new THREE.PlaneGeometry(trackWidth, 1);
        const finishMat = new THREE.MeshStandardMaterial({ 
          color: 0xffffff,
          transparent: true,
          opacity: 0.8
        });
        const finishLine = new THREE.Mesh(finishGeo, finishMat);
        finishLine.rotation.x = -Math.PI / 2;
        finishLine.position.set(point.x, 0.05, point.y);
        scene.add(finishLine);
        
        // Checkered pattern
        for (let j = 0; j < 10; j++) {
          const checkGeo = new THREE.PlaneGeometry(trackWidth / 10, 0.5);
          const checkMat = new THREE.MeshStandardMaterial({ 
            color: j % 2 === 0 ? 0x000000 : 0xffffff
          });
          const check = new THREE.Mesh(checkGeo, checkMat);
          check.rotation.x = -Math.PI / 2;
          check.position.set(point.x - trackWidth / 2 + (j * trackWidth / 10) + trackWidth / 20, 0.06, point.y);
          scene.add(check);
        }
      }
    }

    // ===== KART CREATION =====
    // Kart chassis
    const kartGroup = new THREE.Group();
    
    const chassisGeo = new THREE.BoxGeometry(1.8, 0.6, 2.5);
    const chassisMat = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    const chassis = new THREE.Mesh(chassisGeo, chassisMat);
    chassis.position.y = 0.3;
    chassis.castShadow = true;
    kartGroup.add(chassis);
    
    // Kart seat
    const seatGeo = new THREE.BoxGeometry(1.2, 0.5, 1.2);
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const seat = new THREE.Mesh(seatGeo, seatMat);
    seat.position.set(0, 0.6, -0.2);
    seat.castShadow = true;
    kartGroup.add(seat);
    
    // Steering wheel
    const wheelGeo = new THREE.TorusGeometry(0.3, 0.05, 8, 16);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const steeringWheel = new THREE.Mesh(wheelGeo, wheelMat);
    steeringWheel.position.set(0, 0.9, 0.5);
    steeringWheel.rotation.x = Math.PI / 3;
    kartGroup.add(steeringWheel);
    
    // Wheels
    const tireGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.3, 16);
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    
    const wheels = [];
    const wheelPositions = [
      { x: -0.9, y: 0.4, z: 0.9 },   // FL
      { x: 0.9, y: 0.4, z: 0.9 },    // FR
      { x: -0.9, y: 0.4, z: -0.9 },  // RL
      { x: 0.9, y: 0.4, z: -0.9 }    // RR
    ];
    
    wheelPositions.forEach((pos, i) => {
      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.rotation.z = Math.PI / 2;
      tire.position.set(pos.x, pos.y, pos.z);
      tire.castShadow = true;
      kartGroup.add(tire);
      wheels.push(tire);
    });
    
    kartGroup.position.set(trackPath[0].x, 2, trackPath[0].y);
    scene.add(kartGroup);

    // Kart physics body
    const kartBody = new CANNON.Body({
      mass: 150,
      position: new CANNON.Vec3(trackPath[0].x, 2, trackPath[0].y),
      shape: new CANNON.Box(new CANNON.Vec3(0.9, 0.3, 1.25)),
      linearDamping: 0.3,
      angularDamping: 0.5
    });
    world.addBody(kartBody);

    // Add wheel bodies for better physics
    const wheelBodies = [];
    wheelPositions.forEach(pos => {
      const wheelBody = new CANNON.Body({
        mass: 5,
        position: new CANNON.Vec3(
          trackPath[0].x + pos.x,
          2 + pos.y,
          trackPath[0].y + pos.z
        ),
        shape: new CANNON.Sphere(0.4),
        material: new CANNON.Material({ friction: 0.8 })
      });
      world.addBody(wheelBody);
      wheelBodies.push(wheelBody);
    });

    // ===== AI KARTS =====
    const aiKarts = [];
    const aiKartColors = [0x0000ff, 0x00ff00, 0xffff00];
    
    for (let i = 0; i < 3; i++) {
      const aiGroup = new THREE.Group();
      
      const aiChassis = new THREE.Mesh(chassisGeo, 
        new THREE.MeshStandardMaterial({ color: aiKartColors[i] }));
      aiChassis.position.y = 0.3;
      aiChassis.castShadow = true;
      aiGroup.add(aiChassis);
      
      const aiSeat = new THREE.Mesh(seatGeo, seatMat);
      aiSeat.position.set(0, 0.6, -0.2);
      aiGroup.add(aiSeat);
      
      wheelPositions.forEach(pos => {
        const tire = new THREE.Mesh(tireGeo, tireMat);
        tire.rotation.z = Math.PI / 2;
        tire.position.set(pos.x, pos.y, pos.z);
        tire.castShadow = true;
        aiGroup.add(tire);
      });
      
      const startIndex = ((i + 1) * 5) % trackPath.length;
      aiGroup.position.set(trackPath[startIndex].x, 1, trackPath[startIndex].y);
      scene.add(aiGroup);
      
      aiKarts.push({
        mesh: aiGroup,
        trackProgress: startIndex / trackPath.length,
        speed: 0.002 + Math.random() * 0.001
      });
    }

    // ===== GAME STATE =====
    const keys = {};
    let raceStarted = false;
    let raceStartTime = null;
    let countdown = 3;
    let currentLap = 1;
    const totalLaps = 5;
    let lapTimes = [];
    let bestLapTime = null;
    let lapStartTime = null;
    let lastCheckpoint = 0;
    let checkpointsPassed = 0;

    // ===== CONTROLS =====
    window.addEventListener('keydown', (e) => {
      keys[e.key.toLowerCase()] = true;
    });
    
    window.addEventListener('keyup', (e) => {
      keys[e.key.toLowerCase()] = false;
    });

    // ===== COUNTDOWN =====
    const countdownInterval = setInterval(() => {
      if (countdown > 0) {
        countdown--;
        setGameState(prev => ({ ...prev, countdown }));
      } else {
        raceStarted = true;
        raceStartTime = Date.now();
        lapStartTime = Date.now();
        clearInterval(countdownInterval);
      }
    }, 1000);

    // ===== CAMERA SYSTEM =====
    const cameraOffset = new THREE.Vector3(0, 5, 12);
    const cameraLookOffset = new THREE.Vector3(0, 1, 0);
    
    function updateCamera() {
      const kartPos = kartGroup.position;
      const kartRot = kartGroup.rotation;
      
      const targetPos = new THREE.Vector3();
      targetPos.copy(cameraOffset);
      targetPos.applyEuler(kartRot);
      targetPos.add(kartPos);
      
      camera.position.lerp(targetPos, 0.1);
      
      const lookTarget = kartPos.clone().add(cameraLookOffset);
      camera.lookAt(lookTarget);
    }

    // ===== LAP DETECTION =====
    function checkLapProgress() {
      const kartPos = kartGroup.position;
      
      for (let i = 0; i < checkpoints.length; i++) {
        const cp = checkpoints[i];
        const dist = kartPos.distanceTo(cp.position);
        
        if (dist < 10 && !cp.passed) {
          if (i === (lastCheckpoint + 1) % checkpoints.length || 
              (lastCheckpoint === checkpoints.length - 1 && i === 0)) {
            cp.passed = true;
            lastCheckpoint = i;
            checkpointsPassed++;
            
            if (cp.isFinishLine && checkpointsPassed >= checkpoints.length) {
              // Lap completed
              const lapTime = Date.now() - lapStartTime;
              lapTimes.push(lapTime);
              
              if (!bestLapTime || lapTime < bestLapTime) {
                bestLapTime = lapTime;
                submitScore(lapTime);
              }
              
              currentLap++;
              lapStartTime = Date.now();
              checkpointsPassed = 0;
              
              // Reset checkpoints
              checkpoints.forEach(c => c.passed = false);
              
              if (currentLap > totalLaps) {
                setGameState(prev => ({ ...prev, raceFinished: true }));
              }
            }
          }
        }
      }
    }

    // ===== AI UPDATE =====
    function updateAI() {
      aiKarts.forEach(ai => {
        ai.trackProgress += ai.speed;
        if (ai.trackProgress > 1) ai.trackProgress -= 1;
        
        const index = Math.floor(ai.trackProgress * trackPath.length);
        const point = trackPath[index];
        const nextPoint = trackPath[(index + 1) % trackPath.length];
        
        ai.mesh.position.x = point.x;
        ai.mesh.position.z = point.y;
        
        const angle = Math.atan2(nextPoint.y - point.y, nextPoint.x - point.x);
        ai.mesh.rotation.y = angle - Math.PI / 2;
      });
    }

    // ===== MAIN LOOP =====
    const clock = new THREE.Clock();
    let lastTime = Date.now();
    
    function animate() {
      requestAnimationFrame(animate);
      
      const currentTime = Date.now();
      const deltaTime = (currentTime - lastTime) / 1000;
      lastTime = currentTime;
      
      if (raceStarted) {
        // Kart controls with physics
        const forceStrength = 1200;
        const turnForce = 15;
        const maxSpeed = 35;
        
        const forward = new CANNON.Vec3(
          Math.sin(kartBody.quaternion.toEuler().y),
          0,
          Math.cos(kartBody.quaternion.toEuler().y)
        );
        
        const right = new CANNON.Vec3(
          Math.cos(kartBody.quaternion.toEuler().y),
          0,
          -Math.sin(kartBody.quaternion.toEuler().y)
        );
        
        // Acceleration
        if (keys['w'] || keys['arrowup'] || mobileControls.accelerate) {
          const currentSpeed = kartBody.velocity.length();
          if (currentSpeed < maxSpeed) {
            kartBody.applyForce(
              new CANNON.Vec3(
                forward.x * forceStrength,
                0,
                forward.z * forceStrength
              ),
              kartBody.position
            );
          }
        }
        
        // Brake
        if (keys['s'] || keys['arrowdown'] || mobileControls.brake) {
          kartBody.applyForce(
            new CANNON.Vec3(
              -forward.x * forceStrength * 0.7,
              0,
              -forward.z * forceStrength * 0.7
            ),
            kartBody.position
          );
        }
        
        // Steering
        const steerStrength = kartBody.velocity.length() / maxSpeed;
        if (keys['a'] || keys['arrowleft'] || mobileControls.steerLeft) {
          kartBody.angularVelocity.y = turnForce * steerStrength;
          steeringWheel.rotation.z = -0.5;
        } else if (keys['d'] || keys['arrowright'] || mobileControls.steerRight) {
          kartBody.angularVelocity.y = -turnForce * steerStrength;
          steeringWheel.rotation.z = 0.5;
        } else {
          kartBody.angularVelocity.y *= 0.9;
          steeringWheel.rotation.z *= 0.8;
        }
        
        // Update physics
        world.step(1 / 60, deltaTime, 3);
        
        // Sync mesh with physics
        kartGroup.position.copy(kartBody.position);
        kartGroup.quaternion.copy(kartBody.quaternion);
        
        // Update wheel rotation based on speed
        const wheelRotation = kartBody.velocity.length() * 0.1;
        wheels.forEach((wheel, i) => {
          wheel.rotation.x += wheelRotation;
        });
        
        updateCamera();
        updateAI();
        checkLapProgress();
        
        // Update game state
        const speed = Math.round(kartBody.velocity.length() * 10);
        const totalTime = Date.now() - raceStartTime;
        
        setGameState({
          speed,
          currentLap: Math.min(currentLap, totalLaps),
          totalLaps,
          lapTimes,
          bestLapTime,
          totalTime,
          position: 1,
          totalRacers: 4,
          isRacing: currentLap <= totalLaps,
          raceFinished: currentLap > totalLaps,
          countdown
        });
      }
      
      renderer.render(scene, camera);
    }
    
    animate();

    // ===== RESIZE HANDLER =====
    function handleResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    }
    window.addEventListener('resize', handleResize);

    // ===== CLEANUP =====
    return () => {
      clearInterval(countdownInterval);
      window.removeEventListener('resize', handleResize);
      if (containerRef.current && renderer.domElement) {
        containerRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, []);

  // Mobile touch button handlers
  const handleTouchStart = (control) => {
    setMobileControls(prev => ({ ...prev, [control]: true }));
  };

  const handleTouchEnd = (control) => {
    setMobileControls(prev => ({ ...prev, [control]: false }));
  };

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

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
        background: 'linear-gradient(135deg, rgba(0,0,0,0.9) 0%, rgba(20,20,40,0.9) 100%)',
        color: 'white',
        padding: '15px',
        borderRadius: '12px',
        minWidth: '250px',
        fontFamily: 'Arial, sans-serif',
        border: '2px solid rgba(0,255,136,0.4)',
        boxShadow: '0 8px 32px rgba(0,255,136,0.3)',
        fontSize: '14px'
      }}>
        <h2 style={{ margin: '0 0 10px 0', color: '#00ff88', fontSize: '20px' }}>
          🏁 GRAND PRIX
        </h2>
        
        <div style={{ marginBottom: '10px', fontSize: '28px', fontWeight: 'bold' }}>
          <span style={{ color: '#888', fontSize: '14px' }}>SPEED:</span>{' '}
          <span style={{ 
            color: gameState.speed > 200 ? '#ff0055' : '#00ff88',
            textShadow: `0 0 10px ${gameState.speed > 200 ? '#ff0055' : '#00ff88'}`
          }}>
            {gameState.speed}
          </span>
          <span style={{ fontSize: '14px', color: '#888' }}> km/h</span>
        </div>
        
        <div style={{ marginBottom: '8px', fontSize: '16px' }}>
          <span style={{ color: '#888' }}>POSITION:</span>{' '}
          <span style={{ color: '#ffd700', fontWeight: 'bold' }}>
            {gameState.position}/{gameState.totalRacers}
          </span>
        </div>
        
        <div style={{ marginBottom: '8px' }}>
          <span style={{ color: '#888' }}>LAP:</span> {gameState.currentLap}/{gameState.totalLaps}
        </div>
        
        <div style={{ marginBottom: '8px', color: '#888', fontSize: '12px' }}>
          <strong>TIME:</strong> {formatTime(gameState.totalTime)}
        </div>
        
        {gameState.bestLapTime && (
          <div style={{ marginBottom: '8px', color: '#ffd700', fontWeight: 'bold', fontSize: '12px' }}>
            ⭐ BEST: {formatTime(gameState.bestLapTime)}
          </div>
        )}
        
        {gameState.raceFinished && (
          <div style={{ 
            marginTop: '10px', 
            padding: '10px', 
            background: 'linear-gradient(135deg, #00ff88 0%, #00cc66 100%)',
            color: '#000',
            borderRadius: '8px',
            textAlign: 'center',
            fontWeight: 'bold',
            fontSize: '16px'
          }}>
            🏆 VICTORY! 🏆
          </div>
        )}
      </div>

      {/* Mobile Controls */}
      {isMobile && (
        <>
          {/* Left side - Steering */}
          <div style={{
            position: 'absolute',
            bottom: 40,
            left: 40,
            display: 'flex',
            gap: '10px'
          }}>
            <button
              onTouchStart={() => handleTouchStart('steerLeft')}
              onTouchEnd={() => handleTouchEnd('steerLeft')}
              style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                background: mobileControls.steerLeft ? 
                  'linear-gradient(135deg, #00ff88 0%, #00cc66 100%)' : 
                  'linear-gradient(135deg, rgba(0,0,0,0.7) 0%, rgba(40,40,60,0.7) 100%)',
                border: '3px solid rgba(255,255,255,0.3)',
                color: 'white',
                fontSize: '32px',
                fontWeight: 'bold',
                cursor: 'pointer',
                touchAction: 'none',
                userSelect: 'none'
              }}
            >
              ←
            </button>
            <button
              onTouchStart={() => handleTouchStart('steerRight')}
              onTouchEnd={() => handleTouchEnd('steerRight')}
              style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                background: mobileControls.steerRight ? 
                  'linear-gradient(135deg, #00ff88 0%, #00cc66 100%)' : 
                  'linear-gradient(135deg, rgba(0,0,0,0.7) 0%, rgba(40,40,60,0.7) 100%)',
                border: '3px solid rgba(255,255,255,0.3)',
                color: 'white',
                fontSize: '32px',
                fontWeight: 'bold',
                cursor: 'pointer',
                touchAction: 'none',
                userSelect: 'none'
              }}
            >
              →
            </button>
          </div>

          {/* Right side - Accelerate/Brake */}
          <div style={{
            position: 'absolute',
            bottom: 40,
            right: 40,
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}>
            <button
              onTouchStart={() => handleTouchStart('accelerate')}
              onTouchEnd={() => handleTouchEnd('accelerate')}
              style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                background: mobileControls.accelerate ? 
                  'linear-gradient(135deg, #00ff88 0%, #00cc66 100%)' : 
                  'linear-gradient(135deg, rgba(0,0,0,0.7) 0%, rgba(40,40,60,0.7) 100%)',
                border: '3px solid rgba(255,255,255,0.3)',
                color: 'white',
                fontSize: '32px',
                fontWeight: 'bold',
                cursor: 'pointer',
                touchAction: 'none',
                userSelect: 'none'
              }}
            >
              ↑
            </button>
            <button
              onTouchStart={() => handleTouchStart('brake')}
              onTouchEnd={() => handleTouchEnd('brake')}
              style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                background: mobileControls.brake ? 
                  'linear-gradient(135deg, #ff0055 0%, #cc0044 100%)' : 
                  'linear-gradient(135deg, rgba(0,0,0,0.7) 0%, rgba(40,40,60,0.7) 100%)',
                border: '3px solid rgba(255,255,255,0.3)',
                color: 'white',
                fontSize: '32px',
                fontWeight: 'bold',
                cursor: 'pointer',
                touchAction: 'none',
                userSelect: 'none'
              }}
            >
              ↓
            </button>
          </div>
        </>
      )}

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

export default GamePageImproved;
