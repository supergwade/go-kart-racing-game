import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
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
    isRacing: false,
    raceFinished: false,
    countdown: 3
  });

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

    // ===== SCENE =====
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.Fog(0x87ceeb, 50, 250);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    containerRef.current.appendChild(renderer.domElement);

    // ===== PHYSICS =====
    const world = new CANNON.World();
    world.gravity.set(0, -20, 0);
    world.broadphase = new CANNON.SAPBroadphase(world);

    // ===== LIGHTS =====
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
    sunLight.position.set(100, 150, 100);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.left = -150;
    sunLight.shadow.camera.right = 150;
    sunLight.shadow.camera.top = 150;
    sunLight.shadow.camera.bottom = -150;
    scene.add(sunLight);

    // ===== GROUND =====
    const groundGeo = new THREE.PlaneGeometry(400, 400);
    const groundMat = new THREE.MeshStandardMaterial({ 
      color: 0x3a7d23,
      roughness: 0.95
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const groundBody = new CANNON.Body({
      mass: 0,
      shape: new CANNON.Plane(),
      material: new CANNON.Material({ friction: 0.4 })
    });
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    world.addBody(groundBody);

    // ===== TRACK =====
    const trackPoints = [];
    const segments = 80;
    
    for (let i = 0; i <= segments; i++) {
      const t = (i / segments) * Math.PI * 2;
      let x = Math.sin(t) * 50 + Math.sin(t * 2) * 15;
      let z = Math.cos(t) * 35;
      trackPoints.push(new THREE.Vector3(x, 0, z));
    }

    // Track surface
    const trackCurve = new THREE.CatmullRomCurve3(trackPoints, true);
    const trackShape = trackCurve.getPoints(200);
    
    for (let i = 0; i < trackShape.length; i++) {
      const p1 = trackShape[i];
      const p2 = trackShape[(i + 1) % trackShape.length];
      const prev = trackShape[(i - 1 + trackShape.length) % trackShape.length];
      
      const dx = p2.x - prev.x;
      const dz = p2.z - prev.z;
      const len = Math.sqrt(dx * dx + dz * dz);
      const nx = -dz / len;
      const nz = dx / len;
      
      const trackWidth = 18;
      const segGeo = new THREE.PlaneGeometry(5, trackWidth);
      const segMat = new THREE.MeshStandardMaterial({ 
        color: 0x333333,
        roughness: 0.8
      });
      const seg = new THREE.Mesh(segGeo, segMat);
      seg.rotation.x = -Math.PI / 2;
      seg.rotation.z = Math.atan2(dz, dx);
      seg.position.set(p1.x, 0.01, p1.z);
      seg.receiveShadow = true;
      scene.add(seg);
      
      // Kerbs
      if (i % 4 === 0) {
        const kerbGeo = new THREE.BoxGeometry(2, 0.2, 2);
        const kerbMat = new THREE.MeshStandardMaterial({ 
          color: i % 8 === 0 ? 0xff0000 : 0xffffff 
        });
        
        const innerKerb = new THREE.Mesh(kerbGeo, kerbMat);
        innerKerb.position.set(p1.x + nx * trackWidth/2, 0.1, p1.z + nz * trackWidth/2);
        innerKerb.castShadow = true;
        scene.add(innerKerb);
        
        const outerKerb = new THREE.Mesh(kerbGeo, kerbMat);
        outerKerb.position.set(p1.x - nx * trackWidth/2, 0.1, p1.z - nz * trackWidth/2);
        outerKerb.castShadow = true;
        scene.add(outerKerb);
      }
    }

    // Finish line
    const finishGeo = new THREE.PlaneGeometry(18, 3);
    const finishMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const finish = new THREE.Mesh(finishGeo, finishMat);
    finish.rotation.x = -Math.PI / 2;
    finish.position.set(trackPoints[0].x, 0.02, trackPoints[0].z);
    scene.add(finish);

    // Checkered pattern
    for (let i = 0; i < 12; i++) {
      const checkGeo = new THREE.PlaneGeometry(1.5, 3);
      const checkMat = new THREE.MeshStandardMaterial({ 
        color: i % 2 === 0 ? 0x000000 : 0xffffff 
      });
      const check = new THREE.Mesh(checkGeo, checkMat);
      check.rotation.x = -Math.PI / 2;
      check.position.set(trackPoints[0].x - 9 + i * 1.5, 0.03, trackPoints[0].z);
      scene.add(check);
    }

    // ===== CHECKPOINTS =====
    const checkpoints = [];
    for (let i = 0; i < trackShape.length; i += 25) {
      checkpoints.push({
        position: trackShape[i],
        passed: false,
        isFinish: i === 0
      });
    }

    // ===== KART =====
    const kartGroup = new THREE.Group();
    
    // Chassis - make it more visible
    const chassisGeo = new THREE.BoxGeometry(2.5, 0.8, 3.5);
    const chassisMat = new THREE.MeshStandardMaterial({ 
      color: 0xff1100,
      metalness: 0.3,
      roughness: 0.7
    });
    const chassis = new THREE.Mesh(chassisGeo, chassisMat);
    chassis.position.y = 0.8;
    chassis.castShadow = true;
    kartGroup.add(chassis);
    
    // Spoiler
    const spoilerGeo = new THREE.BoxGeometry(2, 0.6, 0.2);
    const spoiler = new THREE.Mesh(spoilerGeo, chassisMat);
    spoiler.position.set(0, 1.5, -1.6);
    spoiler.castShadow = true;
    kartGroup.add(spoiler);
    
    // Seat
    const seatGeo = new THREE.BoxGeometry(1.5, 0.8, 1.5);
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const seat = new THREE.Mesh(seatGeo, seatMat);
    seat.position.set(0, 1.2, -0.3);
    seat.castShadow = true;
    kartGroup.add(seat);
    
    // Steering wheel
    const wheelGeo = new THREE.TorusGeometry(0.4, 0.08, 12, 24);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x000000 });
    const steeringWheel = new THREE.Mesh(wheelGeo, wheelMat);
    steeringWheel.position.set(0, 1.4, 0.8);
    steeringWheel.rotation.x = Math.PI / 2.5;
    kartGroup.add(steeringWheel);
    
    // Wheels
    const tireGeo = new THREE.CylinderGeometry(0.5, 0.5, 0.4, 20);
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    
    const wheels = [];
    const wheelPositions = [
      { x: -1.2, y: 0.5, z: 1.2 },
      { x: 1.2, y: 0.5, z: 1.2 },
      { x: -1.2, y: 0.5, z: -1.2 },
      { x: 1.2, y: 0.5, z: -1.2 }
    ];
    
    wheelPositions.forEach(pos => {
      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.rotation.z = Math.PI / 2;
      tire.position.set(pos.x, pos.y, pos.z);
      tire.castShadow = true;
      kartGroup.add(tire);
      wheels.push(tire);
    });
    
    // Start position - clearly visible
    kartGroup.position.set(trackPoints[0].x, 1.5, trackPoints[0].z);
    scene.add(kartGroup);

    // Physics body for kart
    const kartBody = new CANNON.Body({
      mass: 200,
      position: new CANNON.Vec3(trackPoints[0].x, 1.5, trackPoints[0].z),
      shape: new CANNON.Box(new CANNON.Vec3(1.25, 0.4, 1.75)),
      linearDamping: 0.1,
      angularDamping: 0.3,
      material: new CANNON.Material({ friction: 0.1 })
    });
    world.addBody(kartBody);

    // ===== AI KARTS =====
    const aiKarts = [];
    const aiColors = [0x0044ff, 0x00ff00, 0xffff00];
    
    for (let i = 0; i < 3; i++) {
      const aiGroup = new THREE.Group();
      
      const aiChassis = new THREE.Mesh(chassisGeo, 
        new THREE.MeshStandardMaterial({ color: aiColors[i], metalness: 0.3, roughness: 0.7 }));
      aiChassis.position.y = 0.8;
      aiChassis.castShadow = true;
      aiGroup.add(aiChassis);
      
      const aiSeat = new THREE.Mesh(seatGeo, seatMat);
      aiSeat.position.set(0, 1.2, -0.3);
      aiGroup.add(aiSeat);
      
      wheelPositions.forEach(pos => {
        const tire = new THREE.Mesh(tireGeo, tireMat);
        tire.rotation.z = Math.PI / 2;
        tire.position.set(pos.x, pos.y, pos.z);
        tire.castShadow = true;
        aiGroup.add(tire);
      });
      
      const startIdx = ((i + 1) * 20) % trackShape.length;
      aiGroup.position.set(trackShape[startIdx].x, 1, trackShape[startIdx].z);
      scene.add(aiGroup);
      
      aiKarts.push({
        mesh: aiGroup,
        progress: startIdx / trackShape.length,
        speed: 0.0015 + Math.random() * 0.0005
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
    let lastCheckpoint = -1;

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

    // ===== CAMERA =====
    function updateCamera() {
      const idealOffset = new THREE.Vector3(0, 4, -10);
      idealOffset.applyQuaternion(kartGroup.quaternion);
      idealOffset.add(kartGroup.position);
      
      camera.position.lerp(idealOffset, 0.1);
      
      const lookAt = kartGroup.position.clone();
      lookAt.y += 1;
      camera.lookAt(lookAt);
    }

    // ===== LAP SYSTEM =====
    function checkLaps() {
      const kartPos = kartGroup.position;
      
      for (let i = 0; i < checkpoints.length; i++) {
        const cp = checkpoints[i];
        const dist = kartPos.distanceTo(cp.position);
        
        if (dist < 15 && !cp.passed) {
          if (i === (lastCheckpoint + 1) % checkpoints.length) {
            cp.passed = true;
            lastCheckpoint = i;
            
            if (cp.isFinish && lastCheckpoint === checkpoints.length - 1) {
              const lapTime = Date.now() - lapStartTime;
              lapTimes.push(lapTime);
              
              if (!bestLapTime || lapTime < bestLapTime) {
                bestLapTime = lapTime;
                submitScore(lapTime);
              }
              
              currentLap++;
              lapStartTime = Date.now();
              lastCheckpoint = -1;
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
        ai.progress += ai.speed;
        if (ai.progress > 1) ai.progress -= 1;
        
        const idx = Math.floor(ai.progress * trackShape.length);
        const p1 = trackShape[idx];
        const p2 = trackShape[(idx + 1) % trackShape.length];
        
        ai.mesh.position.set(p1.x, 1, p1.z);
        
        const angle = Math.atan2(p2.z - p1.z, p2.x - p1.x);
        ai.mesh.rotation.y = angle - Math.PI / 2;
      });
    }

    // ===== MAIN LOOP =====
    let lastTime = Date.now();
    
    function animate() {
      requestAnimationFrame(animate);
      
      const now = Date.now();
      const delta = (now - lastTime) / 1000;
      lastTime = now;
      
      if (raceStarted && delta < 0.1) {
        // Controls
        const force = 2500;
        const torque = 25;
        const maxSpeed = 40;
        
        const forward = new CANNON.Vec3(
          Math.sin(kartBody.quaternion.toEuler().y),
          0,
          Math.cos(kartBody.quaternion.toEuler().y)
        );
        
        const currentSpeed = kartBody.velocity.length();
        
        if (keys['w'] || keys['arrowup'] || mobileControls.accelerate) {
          if (currentSpeed < maxSpeed) {
            kartBody.applyForce(
              new CANNON.Vec3(forward.x * force, 0, forward.z * force),
              kartBody.position
            );
          }
        }
        
        if (keys['s'] || keys['arrowdown'] || mobileControls.brake) {
          kartBody.applyForce(
            new CANNON.Vec3(-forward.x * force * 0.8, 0, -forward.z * force * 0.8),
            kartBody.position
          );
        }
        
        const steerFactor = Math.min(currentSpeed / maxSpeed, 1);
        if (keys['a'] || keys['arrowleft'] || mobileControls.steerLeft) {
          kartBody.angularVelocity.y = torque * (0.3 + steerFactor * 0.7);
          steeringWheel.rotation.z = -0.6;
        } else if (keys['d'] || keys['arrowright'] || mobileControls.steerRight) {
          kartBody.angularVelocity.y = -torque * (0.3 + steerFactor * 0.7);
          steeringWheel.rotation.z = 0.6;
        } else {
          kartBody.angularVelocity.y *= 0.9;
          steeringWheel.rotation.z *= 0.85;
        }
        
        // Physics step
        world.step(1/60, delta, 3);
        
        // Sync visuals
        kartGroup.position.copy(kartBody.position);
        kartGroup.quaternion.copy(kartBody.quaternion);
        
        // Wheel rotation
        const wheelSpeed = currentSpeed * 0.15;
        wheels.forEach(w => {
          w.rotation.x += wheelSpeed;
        });
        
        updateCamera();
        updateAI();
        checkLaps();
        
        const speed = Math.round(currentSpeed * 12);
        const totalTime = raceStartTime ? now - raceStartTime : 0;
        
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

  const handleTouchStart = (control) => {
    setMobileControls(prev => ({ ...prev, [control]: true }));
  };

  const handleTouchEnd = (control) => {
    setMobileControls(prev => ({ ...prev, [control]: false }));
  };

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      
      {gameState.countdown > 0 && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          fontSize: '200px',
          fontWeight: 'bold',
          color: '#00ff00',
          textShadow: '0 0 50px #00ff00',
          zIndex: 1000,
          fontFamily: 'Arial Black'
        }}>
          {gameState.countdown}
        </div>
      )}
      
      <div style={{
        position: 'absolute',
        top: 20,
        left: 20,
        background: 'rgba(0,0,0,0.85)',
        color: 'white',
        padding: '20px',
        borderRadius: '15px',
        minWidth: '280px',
        fontFamily: 'Arial',
        border: '3px solid #00ff00',
        boxShadow: '0 0 30px rgba(0,255,0,0.5)'
      }}>
        <h2 style={{ margin: '0 0 15px 0', color: '#00ff00', fontSize: '24px' }}>
          🏁 GRAND PRIX
        </h2>
        
        <div style={{ marginBottom: '12px', fontSize: '36px', fontWeight: 'bold' }}>
          <span style={{ color: '#888', fontSize: '16px' }}>SPEED:</span>{' '}
          <span style={{ 
            color: gameState.speed > 250 ? '#ff0000' : '#00ff00',
            textShadow: `0 0 15px ${gameState.speed > 250 ? '#ff0000' : '#00ff00'}`
          }}>
            {gameState.speed}
          </span>
          <span style={{ fontSize: '18px', color: '#888' }}> km/h</span>
        </div>
        
        <div style={{ marginBottom: '10px', fontSize: '20px' }}>
          <span style={{ color: '#888' }}>POSITION:</span>{' '}
          <span style={{ color: '#ffd700', fontWeight: 'bold' }}>
            {gameState.position}/{gameState.totalRacers}
          </span>
        </div>
        
        <div style={{ marginBottom: '10px', fontSize: '18px' }}>
          <span style={{ color: '#888' }}>LAP:</span> {gameState.currentLap}/{gameState.totalLaps}
        </div>
        
        <div style={{ marginBottom: '10px', color: '#aaa' }}>
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
            padding: '15px', 
            background: 'linear-gradient(135deg, #00ff00 0%, #00aa00 100%)',
            color: '#000',
            borderRadius: '10px',
            textAlign: 'center',
            fontWeight: 'bold',
            fontSize: '20px'
          }}>
            🏆 VICTORY! 🏆
          </div>
        )}
      </div>

      {isMobile && (
        <>
          <div style={{
            position: 'absolute',
            bottom: 30,
            left: 30,
            display: 'flex',
            gap: '15px'
          }}>
            <button
              onTouchStart={() => handleTouchStart('steerLeft')}
              onTouchEnd={() => handleTouchEnd('steerLeft')}
              style={{
                width: '90px',
                height: '90px',
                borderRadius: '50%',
                background: mobileControls.steerLeft ? '#00ff00' : 'rgba(0,0,0,0.7)',
                border: '4px solid #00ff00',
                color: 'white',
                fontSize: '40px',
                fontWeight: 'bold',
                touchAction: 'none'
              }}
            >
              ←
            </button>
            <button
              onTouchStart={() => handleTouchStart('steerRight')}
              onTouchEnd={() => handleTouchEnd('steerRight')}
              style={{
                width: '90px',
                height: '90px',
                borderRadius: '50%',
                background: mobileControls.steerRight ? '#00ff00' : 'rgba(0,0,0,0.7)',
                border: '4px solid #00ff00',
                color: 'white',
                fontSize: '40px',
                fontWeight: 'bold',
                touchAction: 'none'
              }}
            >
              →
            </button>
          </div>

          <div style={{
            position: 'absolute',
            bottom: 30,
            right: 30,
            display: 'flex',
            flexDirection: 'column',
            gap: '15px'
          }}>
            <button
              onTouchStart={() => handleTouchStart('accelerate')}
              onTouchEnd={() => handleTouchEnd('accelerate')}
              style={{
                width: '90px',
                height: '90px',
                borderRadius: '50%',
                background: mobileControls.accelerate ? '#00ff00' : 'rgba(0,0,0,0.7)',
                border: '4px solid #00ff00',
                color: 'white',
                fontSize: '40px',
                fontWeight: 'bold',
                touchAction: 'none'
              }}
            >
              ↑
            </button>
            <button
              onTouchStart={() => handleTouchStart('brake')}
              onTouchEnd={() => handleTouchEnd('brake')}
              style={{
                width: '90px',
                height: '90px',
                borderRadius: '50%',
                background: mobileControls.brake ? '#ff0000' : 'rgba(0,0,0,0.7)',
                border: '4px solid #ff0000',
                color: 'white',
                fontSize: '40px',
                fontWeight: 'bold',
                touchAction: 'none'
              }}
            >
              ↓
            </button>
          </div>
        </>
      )}

      <button
        onClick={() => navigate('/dashboard')}
        style={{
          position: 'absolute',
          top: 20,
          right: 20,
          padding: '15px 30px',
          background: 'linear-gradient(135deg, #ff0000 0%, #cc0000 100%)',
          color: 'white',
          border: 'none',
          borderRadius: '12px',
          cursor: 'pointer',
          fontSize: '18px',
          fontWeight: 'bold',
          boxShadow: '0 6px 20px rgba(255,0,0,0.6)'
        }}
      >
        EXIT
      </button>
    </div>
  );
}

export default GamePage;
