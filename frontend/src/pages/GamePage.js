import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import axios from 'axios';

// --- Postprocessing (make sure three/examples are available in your build) ---
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// ===== helper: time formatter =====
const formatTime = (milliseconds) => {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const ms = Math.floor((milliseconds % 1000) / 10);
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
};

// ===== helper: procedural textures (no external assets) =====
function makeAsphaltTexture({ width = 1024, height = 1024, lanes = 2 } = {}) {
  const c = document.createElement('canvas');
  c.width = width; c.height = height;
  const g = c.getContext('2d');

  // base asphalt
  g.fillStyle = '#3f3f3f';
  g.fillRect(0, 0, width, height);
  // subtle noise
  for (let i = 0; i < 5000; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const a = 0.06 + Math.random() * 0.06;
    g.fillStyle = `rgba(255,255,255,${a})`;
    g.fillRect(x, y, 1, 1);
  }
  for (let i = 0; i < 5000; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const a = 0.06 + Math.random() * 0.06;
    g.fillStyle = `rgba(0,0,0,${a})`;
    g.fillRect(x, y, 1, 1);
  }

  // tire rubber dark streaks
  g.fillStyle = 'rgba(0,0,0,0.08)';
  for (let i = 0; i < 12; i++) {
    const y = (i / 12) * height;
    g.fillRect(0, y, width, 4 + Math.random() * 6);
  }

  // edge white lines
  g.fillStyle = '#d9d9d9';
  g.fillRect(0, 36, width, 8);
  g.fillRect(0, height - 44, width, 8);

  // dashed center lines
  const centerY = height / 2;
  g.strokeStyle = '#f7f7f7';
  g.lineWidth = 6;
  g.setLineDash([50, 40]);
  g.beginPath();
  g.moveTo(0, centerY);
  g.lineTo(width, centerY);
  g.stroke();

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

function makeKerbTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  for (let i = 0; i < 8; i++) {
    g.fillStyle = i % 2 ? '#ffffff' : '#e10600';
    g.fillRect(i * 32, 0, 32, 64);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(8, 1);
  tex.anisotropy = 8;
  return tex;
}

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
    countdown: 3,
  });

  const [mobileControls, setMobileControls] = useState({
    accelerate: false,
    brake: false,
    steerLeft: false,
    steerRight: false,
  });

  // ===== submit score =====
  const submitScore = async (lapTime) => {
    if (!user) return;
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `${API_URL}/leaderboard/submit`,
        { lap_time: lapTime / 1000, track_name: 'Grand Prix Circuit' },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (error) {
      console.error('Error submitting score:', error);
    }
  };

  useEffect(() => {
    if (!containerRef.current) return;

    // ===== SCENE & RENDERER =====
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x8ac6ff, 120, 420);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1500);
    camera.position.set(0, 8, 15);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    containerRef.current.appendChild(renderer.domElement);

    // Gradient sky (procedural)
    const skyGeo = new THREE.SphereGeometry(1000, 32, 32);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        topColor: { value: new THREE.Color('#98d6ff') },
        bottomColor: { value: new THREE.Color('#e6f4ff') },
      },
      vertexShader: `varying vec3 vWorldPosition; void main(){ vec4 p = modelMatrix * vec4(position,1.0); vWorldPosition = p.xyz; gl_Position = projectionMatrix*viewMatrix*p; }`,
      fragmentShader: `varying vec3 vWorldPosition; uniform vec3 topColor; uniform vec3 bottomColor; void main(){ float h = normalize(vWorldPosition).y*0.5+0.5; gl_FragColor = vec4(mix(bottomColor, topColor, smoothstep(0.0,1.0,h)), 1.0); }`,
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    scene.add(sky);

    // ===== LIGHTING =====
    const hemi = new THREE.HemisphereLight(0xc9e7ff, 0x1b3a1a, 0.5);
    scene.add(hemi);

    const sunLight = new THREE.DirectionalLight(0xffffff, 1.2);
    sunLight.position.set(120, 200, 60);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.set(2048, 2048);
    sunLight.shadow.camera.left = -200;
    sunLight.shadow.camera.right = 200;
    sunLight.shadow.camera.top = 200;
    sunLight.shadow.camera.bottom = -200;
    sunLight.shadow.normalBias = 0.02;
    scene.add(sunLight);

    // ===== PHYSICS WORLD =====
    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -32, 0) });
    world.broadphase = new CANNON.SAPBroadphase(world);
    world.allowSleep = true;
    world.defaultContactMaterial.friction = 0.5;

    // ===== GROUND =====
    const groundGeo = new THREE.PlaneGeometry(1200, 1200);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x24501b, roughness: 1 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const groundBody = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    world.addBody(groundBody);

    // ===== TRACK PATH (oval + chicanes, smoothed) =====
    const trackPath = [];
    const numPoints = 160;
    for (let i = 0; i <= numPoints; i++) {
      const t = (i / numPoints) * Math.PI * 2;
      let x = Math.sin(t) * 90;
      let z = Math.cos(t) * 60;
      // chicanes & variation
      x += Math.sin(t * 3.0) * 8.0 * (Math.cos(t * 0.5) * 0.5 + 0.5);
      z += Math.cos(t * 2.0) * 5.0 * (Math.sin(t * 0.8) * 0.5 + 0.5);
      trackPath.push(new THREE.Vector2(x, z));
    }

    const trackWidth = 16;

    // ===== TRACK SURFACE (segment strips with shared asphalt texture) =====
    const asphaltTex = makeAsphaltTexture();
    asphaltTex.repeat.set(8, 1);

    const trackMat = new THREE.MeshStandardMaterial({ map: asphaltTex, roughness: 0.85, metalness: 0.0 });

    for (let i = 0; i < trackPath.length - 1; i++) {
      const p1 = trackPath[i];
      const p2 = trackPath[i + 1];
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const length = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      const segmentGeo = new THREE.PlaneGeometry(length, trackWidth, 1, 1);
      // orient uvs so texture flows along the segment
      segmentGeo.computeBoundingBox();
      const segment = new THREE.Mesh(segmentGeo, trackMat);
      segment.rotation.x = -Math.PI / 2;
      segment.rotation.z = -angle;
      segment.position.set((p1.x + p2.x) / 2, 0.02, (p1.y + p2.y) / 2);
      segment.receiveShadow = true;
      scene.add(segment);
    }

    // ===== KERBS (instanced, striped texture) =====
    const kerbTex = makeKerbTexture();
    const kerbMat = new THREE.MeshStandardMaterial({ map: kerbTex, roughness: 0.6 });
    const kerbGeo = new THREE.BoxGeometry(2.2, 0.4, 1.2);
    const kerbCount = Math.floor(trackPath.length * 0.66);
    const kerbs = new THREE.InstancedMesh(kerbGeo, kerbMat, kerbCount * 2);
    kerbs.castShadow = true;
    kerbs.receiveShadow = true;
    let kerbIndex = 0;
    for (let i = 0; i < kerbCount; i += 1) {
      const idx = (i * 2) % trackPath.length;
      const p = trackPath[idx];
      const prev = trackPath[(idx - 1 + trackPath.length) % trackPath.length];
      const next = trackPath[(idx + 1) % trackPath.length];
      const dir = new THREE.Vector2(next.x - prev.x, next.y - prev.y).normalize();
      const normal = new THREE.Vector2(-dir.y, dir.x);

      const inner = new THREE.Matrix4()
        .makeRotationY(Math.atan2(dir.x, dir.y))
        .multiply(new THREE.Matrix4().makeTranslation(p.x + normal.x * (trackWidth / 2 + 0.8), 0.22, p.y + normal.y * (trackWidth / 2 + 0.8)));

      const outer = new THREE.Matrix4()
        .makeRotationY(Math.atan2(dir.x, dir.y))
        .multiply(new THREE.Matrix4().makeTranslation(p.x - normal.x * (trackWidth / 2 + 0.8), 0.22, p.y - normal.y * (trackWidth / 2 + 0.8)));

      kerbs.setMatrixAt(kerbIndex++, inner);
      kerbs.setMatrixAt(kerbIndex++, outer);
    }
    kerbs.instanceMatrix.needsUpdate = true;
    scene.add(kerbs);

    // ===== BARRIERS (instanced) =====
    const barrierGeo = new THREE.BoxGeometry(2.5, 1.0, 0.4);
    const barrierMat = new THREE.MeshStandardMaterial({ color: 0xbbbbbb, metalness: 0.1, roughness: 0.7 });
    const barrierCount = Math.floor(trackPath.length * 0.9);
    const barriers = new THREE.InstancedMesh(barrierGeo, barrierMat, barrierCount);
    barriers.castShadow = true;
    let bIndex = 0;
    for (let i = 0; i < barrierCount; i++) {
      const idx = i % trackPath.length;
      const p = trackPath[idx];
      const prev = trackPath[(idx - 1 + trackPath.length) % trackPath.length];
      const next = trackPath[(idx + 1) % trackPath.length];
      const dir = new THREE.Vector2(next.x - prev.x, next.y - prev.y).normalize();
      const normal = new THREE.Vector2(-dir.y, dir.x);
      const mat = new THREE.Matrix4()
        .makeRotationY(Math.atan2(dir.x, dir.y))
        .multiply(new THREE.Matrix4().makeTranslation(p.x - normal.x * (trackWidth / 2 + 3.5), 0.5, p.y - normal.y * (trackWidth / 2 + 3.5)));
      barriers.setMatrixAt(bIndex++, mat);
    }
    barriers.instanceMatrix.needsUpdate = true;
    scene.add(barriers);

    // ===== DECOR: low‑poly trees (instanced) =====
    const treeTrunk = new THREE.CylinderGeometry(0.25, 0.25, 2, 6);
    const treeLeaves = new THREE.ConeGeometry(1.5, 3, 6);
    const treeMat1 = new THREE.MeshStandardMaterial({ color: 0x3a2a19, roughness: 1 });
    const treeMat2 = new THREE.MeshStandardMaterial({ color: 0x1e7a2e, roughness: 0.8 });
    const tree = new THREE.Group();
    const t1 = new THREE.Mesh(treeTrunk, treeMat1); t1.position.y = 1; t1.castShadow = true; t1.receiveShadow = true;
    const t2 = new THREE.Mesh(treeLeaves, treeMat2); t2.position.y = 3; t2.castShadow = true; t2.receiveShadow = true;
    tree.add(t1); tree.add(t2);

    const trees = new THREE.InstancedMesh(new THREE.BoxGeometry(0.001,0.001,0.001), new THREE.MeshBasicMaterial(), 1); // dummy holder
    scene.add(trees); // keep reference so GC doesn't remove

    const forest = new THREE.Group();
    for (let i = 0; i < 220; i++) {
      const clone = tree.clone();
      const radius = 140 + Math.random() * 180;
      const angle = Math.random() * Math.PI * 2;
      clone.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
      clone.rotation.y = Math.random() * Math.PI * 2;
      forest.add(clone);
    }
    scene.add(forest);

    // ===== KART (cleaner proportions, glossy body, wheels with hubs) =====
    function buildKart(color = 0xff1a1a) {
      const group = new THREE.Group();

      const bodyMat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.1, envMapIntensity: 1.2 });
      const blackMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 });
      const grayMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.4, metalness: 0.6 });

      // chassis (bevelled box feel)
      const chassis = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 3.0), bodyMat);
      chassis.position.y = 0.35;
      chassis.castShadow = true;
      group.add(chassis);

      // nose cone
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.2, 12), bodyMat);
      nose.rotation.x = Math.PI / 2;
      nose.position.set(0, 0.55, 1.4);
      nose.castShadow = true;
      group.add(nose);

      // side pods
      const podGeo = new THREE.BoxGeometry(0.4, 0.35, 1.8);
      const podL = new THREE.Mesh(podGeo, bodyMat); podL.position.set(-1.2, 0.45, -0.1); podL.castShadow = true;
      const podR = podL.clone(); podR.position.x *= -1;
      group.add(podL, podR);

      // seat
      const seat = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 1.0), blackMat);
      seat.position.set(0, 0.75, -0.2);
      seat.castShadow = true; group.add(seat);

      // steering wheel
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.06, 10, 20), blackMat);
      wheel.position.set(0, 1.0, 0.5); wheel.rotation.x = Math.PI / 3; group.add(wheel);

      // wheels (tire + rim + brake disc)
      const tireGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.36, 20);
      const rimGeo = new THREE.CylinderGeometry(0.26, 0.26, 0.12, 10);
      const discGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.02, 16);
      const tireMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });

      const wheelOffsets = [
        new THREE.Vector3(-0.95, 0.47, 1.1),
        new THREE.Vector3(0.95, 0.47, 1.1),
        new THREE.Vector3(-0.95, 0.47, -1.1),
        new THREE.Vector3(0.95, 0.47, -1.1),
      ];

      const wheelMeshes = [];
      for (const off of wheelOffsets) {
        const tire = new THREE.Mesh(tireGeo, tireMat);
        tire.rotation.z = Math.PI / 2;
        tire.position.copy(off);
        tire.castShadow = true;

        const rim = new THREE.Mesh(rimGeo, grayMat); rim.rotation.z = Math.PI / 2; rim.position.copy(off);
        const disc = new THREE.Mesh(discGeo, grayMat); disc.rotation.z = Math.PI / 2; disc.position.copy(off).add(new THREE.Vector3(0, 0, 0.08));

        group.add(tire, rim, disc);
        wheelMeshes.push(tire);
      }

      return { group, wheelMeshes, steeringWheel: wheel };
    }

    const playerKart = buildKart(0xff2a3a);
    playerKart.group.position.set(trackPath[0].x, 2, trackPath[0].y);
    scene.add(playerKart.group);

    // physics body
    const kartBody = new CANNON.Body({
      mass: 140,
      position: new CANNON.Vec3(trackPath[0].x, 2, trackPath[0].y),
      shape: new CANNON.Box(new CANNON.Vec3(1.0, 0.35, 1.4)),
      linearDamping: 0.25,
      angularDamping: 0.55,
    });
    world.addBody(kartBody);

    // ===== AI KARTS =====
    const aiColors = [0x1e90ff, 0x3aff2a, 0xffe52a];
    const aiKarts = [];
    for (let i = 0; i < 3; i++) {
      const ai = buildKart(aiColors[i]);
      const startIndex = ((i + 1) * 10) % trackPath.length;
      ai.group.position.set(trackPath[startIndex].x, 1, trackPath[startIndex].y);
      scene.add(ai.group);
      aiKarts.push({ mesh: ai.group, speed: 0.0022 + Math.random() * 0.001, progress: startIndex / trackPath.length });
    }

    // ===== CHECKPOINTS & FINISH LINE =====
    const checkpoints = [];
    const checkpointInterval = 5;
    for (let i = 0; i < trackPath.length; i += checkpointInterval) {
      const p = trackPath[i];
      checkpoints.push({ position: new THREE.Vector3(p.x, 0, p.y), passed: false, isFinishLine: i === 0 });
      if (i === 0) {
        // finish line banner
        const poleGeo = new THREE.CylinderGeometry(0.2, 0.2, 6, 10);
        const poleMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
        const poleL = new THREE.Mesh(poleGeo, poleMat); poleL.position.set(p.x - trackWidth / 2 - 1.5, 3, p.y); poleL.castShadow = true; scene.add(poleL);
        const poleR = poleL.clone(); poleR.position.x = p.x + trackWidth / 2 + 1.5; scene.add(poleR);
        const bannerGeo = new THREE.PlaneGeometry(trackWidth + 4, 1.2);
        // checkered banner texture
        const bn = document.createElement('canvas'); bn.width = 512; bn.height = 128; const bg = bn.getContext('2d');
        for (let y = 0; y < 8; y++) {
          for (let x = 0; x < 32; x++) {
            bg.fillStyle = (x + y) % 2 ? '#000' : '#fff';
            bg.fillRect(x * 16, y * 16, 16, 16);
          }
        }
        const bnt = new THREE.CanvasTexture(bn); bnt.wrapS = bnt.wrapT = THREE.RepeatWrapping; bnt.repeat.set(1, 1);
        const bannerMat = new THREE.MeshStandardMaterial({ map: bnt, side: THREE.DoubleSide });
        const banner = new THREE.Mesh(bannerGeo, bannerMat); banner.position.set(p.x, 4.6, p.y); banner.castShadow = true; scene.add(banner);
      }
    }

    // ===== INPUT =====
    const keys = {};
    window.addEventListener('keydown', (e) => (keys[e.key.toLowerCase()] = true));
    window.addEventListener('keyup', (e) => (keys[e.key.toLowerCase()] = false));

    // ===== COUNTDOWN / LAPS =====
    let raceStarted = false;
    let raceStartTime = null;
    let lapStartTime = null;
    let countdown = 3;
    let currentLap = 1;
    const totalLaps = 5;
    let lapTimes = [];
    let bestLapTime = null;
    let lastCheckpoint = 0;
    let checkpointsPassed = 0;

    const countdownInterval = setInterval(() => {
      if (countdown > 0) {
        countdown--;
        setGameState((prev) => ({ ...prev, countdown }));
      } else {
        raceStarted = true;
        raceStartTime = Date.now();
        lapStartTime = Date.now();
        clearInterval(countdownInterval);
      }
    }, 1000);

    // ===== CAMERA (smoothed chase + FOV kick) =====
    const baseFov = 75;
    const cameraOffset = new THREE.Vector3(0, 5, 12);
    const cameraLookOffset = new THREE.Vector3(0, 1.0, 0);
    function updateCamera(speedLen) {
      const pos = playerKart.group.position;
      const rot = playerKart.group.rotation;
      const targetPos = cameraOffset.clone().applyEuler(rot).add(pos);
      camera.position.lerp(targetPos, 0.08);
      camera.lookAt(pos.clone().add(cameraLookOffset));
      // FOV kick
      const targetFov = THREE.MathUtils.clamp(baseFov + speedLen * 0.8, 75, 92);
      camera.fov += (targetFov - camera.fov) * 0.05;
      camera.updateProjectionMatrix();
    }

    // ===== AI UPDATE =====
    function updateAI() {
      aiKarts.forEach((ai) => {
        ai.progress += ai.speed;
        if (ai.progress > 1) ai.progress -= 1;
        const idx = Math.floor(ai.progress * trackPath.length);
        const p = trackPath[idx];
        const n = trackPath[(idx + 1) % trackPath.length];
        ai.mesh.position.set(p.x, 0.9, p.y);
        const angle = Math.atan2(n.y - p.y, n.x - p.x);
        ai.mesh.rotation.y = angle - Math.PI / 2;
      });
    }

    // ===== POSTPROCESS =====
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.45, 0.8, 0.85);
    composer.addPass(bloom);
    const smaa = new SMAAPass(window.innerWidth * renderer.getPixelRatio(), window.innerHeight * renderer.getPixelRatio());
    composer.addPass(smaa);

    // ===== MAIN LOOP =====
    let lastTime = performance.now();
    function animate(now) {
      const dt = Math.min((now - lastTime) / 1000, 0.033);
      lastTime = now;
      requestAnimationFrame(animate);

      if (raceStarted) {
        const forceStrength = 1350;
        const maxSpeed = 38;
        const steerStrengthBase = 15;

        // forward / right from quaternion
        const euler = new CANNON.Vec3();
        kartBody.quaternion.toEuler(euler);
        const fy = euler.y;
        const forward = new CANNON.Vec3(Math.sin(fy), 0, Math.cos(fy));

        // accelerate/brake
        if (keys['w'] || keys['arrowup'] || mobileControls.accelerate) {
          if (kartBody.velocity.length() < maxSpeed)
            kartBody.applyForce(new CANNON.Vec3(forward.x * forceStrength, 0, forward.z * forceStrength), kartBody.position);
        }
        if (keys['s'] || keys['arrowdown'] || mobileControls.brake) {
          kartBody.applyForce(new CANNON.Vec3(-forward.x * forceStrength * 0.7, 0, -forward.z * forceStrength * 0.7), kartBody.position);
        }

        // steering scales down at higher speeds for stability
        const steerStrength = (1 - THREE.MathUtils.smoothstep(kartBody.velocity.length() / maxSpeed, 0.0, 1.0)) * steerStrengthBase;
        if (keys['a'] || keys['arrowleft'] || mobileControls.steerLeft) {
          kartBody.angularVelocity.y = steerStrength;
        } else if (keys['d'] || keys['arrowright'] || mobileControls.steerRight) {
          kartBody.angularVelocity.y = -steerStrength;
        } else {
          kartBody.angularVelocity.y *= 0.9;
        }

        world.step(1 / 60, dt, 3);

        // sync mesh
        playerKart.group.position.copy(kartBody.position);
        playerKart.group.quaternion.copy(kartBody.quaternion);

        // wheel roll
        const wheelRot = kartBody.velocity.length() * 0.12;
        for (const w of playerKart.wheelMeshes) w.rotation.x += wheelRot;

        // camera
        updateCamera(kartBody.velocity.length());

        // checkpoints / laps
        const kpos = playerKart.group.position;
        for (let i = 0; i < checkpoints.length; i++) {
          const cp = checkpoints[i];
          if (!cp.passed && kpos.distanceTo(cp.position) < 9.5) {
            if (i === (lastCheckpoint + 1) % checkpoints.length || (lastCheckpoint === checkpoints.length - 1 && i === 0)) {
              cp.passed = true; lastCheckpoint = i; checkpointsPassed++;
              if (cp.isFinishLine && checkpointsPassed >= checkpoints.length) {
                const lapTime = Date.now() - lapStartTime; lapTimes.push(lapTime);
                if (!bestLapTime || lapTime < bestLapTime) { bestLapTime = lapTime; submitScore(lapTime); }
                currentLap++; lapStartTime = Date.now(); checkpointsPassed = 0; checkpoints.forEach((c) => (c.passed = false));
                if (currentLap > totalLaps) setGameState((prev) => ({ ...prev, raceFinished: true }));
              }
            }
          }
        }

        // HUD state
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
          countdown,
        });

        // AI
        updateAI();
      }

      // render with post
      composer.render();
    }
    requestAnimationFrame(animate);

    // resize
    function onResize() {
      camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      composer.setSize(window.innerWidth, window.innerHeight);
    }
    window.addEventListener('resize', onResize);

    // cleanup
    return () => {
      clearInterval(countdownInterval);
      window.removeEventListener('resize', onResize);
      if (containerRef.current && renderer.domElement) containerRef.current.removeChild(renderer.domElement);
      renderer.dispose(); composer.dispose();
    };
  }, []);

  // Mobile controls
  const handleTouchStart = (control) => setMobileControls((p) => ({ ...p, [control]: true }));
  const handleTouchEnd = (control) => setMobileControls((p) => ({ ...p, [control]: false }));
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: '#000' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Countdown */}
      {gameState.countdown > 0 && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', fontSize: '180px', fontWeight: 'bold', color: '#00ff88', textShadow: '0 0 40px #00ff88, 0 0 80px #00ff88', animation: 'pulse 1s ease-in-out', zIndex: 1000 }}>
          {gameState.countdown}
        </div>
      )}

      {/* HUD */}
      <div style={{ position: 'absolute', top: 20, left: 20, background: 'linear-gradient(135deg, rgba(0,0,0,0.9) 0%, rgba(20,20,40,0.9) 100%)', color: 'white', padding: '15px', borderRadius: '12px', minWidth: '250px', fontFamily: 'Arial, sans-serif', border: '2px solid rgba(0,255,136,0.4)', boxShadow: '0 8px 32px rgba(0,255,136,0.3)', fontSize: '14px' }}>
        <h2 style={{ margin: '0 0 10px 0', color: '#00ff88', fontSize: '20px' }}>🏁 GRAND PRIX</h2>
        <div style={{ marginBottom: '10px', fontSize: '28px', fontWeight: 'bold' }}>
          <span style={{ color: '#888', fontSize: '14px' }}>SPEED:</span>{' '}
          <span style={{ color: gameState.speed > 200 ? '#ff0055' : '#00ff88', textShadow: `0 0 10px ${gameState.speed > 200 ? '#ff0055' : '#00ff88'}` }}>{gameState.speed}</span>
          <span style={{ fontSize: '14px', color: '#888' }}> km/h</span>
        </div>
        <div style={{ marginBottom: '8px', fontSize: '16px' }}>
          <span style={{ color: '#888' }}>POSITION:</span>{' '}
          <span style={{ color: '#ffd700', fontWeight: 'bold' }}>{gameState.position}/{gameState.totalRacers}</span>
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
          <div style={{ marginTop: '10px', padding: '10px', background: 'linear-gradient(135deg, #00ff88 0%, #00cc66 100%)', color: '#000', borderRadius: '8px', textAlign: 'center', fontWeight: 'bold', fontSize: '16px' }}>🏆 VICTORY! 🏆</div>
        )}
      </div>

      {/* Mobile Controls */}
      {isMobile && (
        <>
          <div style={{ position: 'absolute', bottom: 40, left: 40, display: 'flex', gap: '10px' }}>
            <button onTouchStart={() => handleTouchStart('steerLeft')} onTouchEnd={() => handleTouchEnd('steerLeft')} style={{ width: '80px', height: '80px', borderRadius: '50%', background: mobileControls.steerLeft ? 'linear-gradient(135deg, #00ff88 0%, #00cc66 100%)' : 'linear-gradient(135deg, rgba(0,0,0,0.7) 0%, rgba(40,40,60,0.7) 100%)', border: '3px solid rgba(255,255,255,0.3)', color: 'white', fontSize: '32px', fontWeight: 'bold', cursor: 'pointer', touchAction: 'none', userSelect: 'none' }}>←</button>
            <button onTouchStart={() => handleTouchStart('steerRight')} onTouchEnd={() => handleTouchEnd('steerRight')} style={{ width: '80px', height: '80px', borderRadius: '50%', background: mobileControls.steerRight ? 'linear-gradient(135deg, #00ff88 0%, #00cc66 100%)' : 'linear-gradient(135deg, rgba(0,0,0,0.7) 0%, rgba(40,40,60,0.7) 100%)', border: '3px solid rgba(255,255,255,0.3)', color: 'white', fontSize: '32px', fontWeight: 'bold', cursor: 'pointer', touchAction: 'none', userSelect: 'none' }}>→</button>
          </div>
          <div style={{ position: 'absolute', bottom: 40, right: 40, display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button onTouchStart={() => handleTouchStart('accelerate')} onTouchEnd={() => handleTouchEnd('accelerate')} style={{ width: '80px', height: '80px', borderRadius: '50%', background: mobileControls.accelerate ? 'linear-gradient(135deg, #00ff88 0%, #00cc66 100%)' : 'linear-gradient(135deg, rgba(0,0,0,0.7) 0%, rgba(40,40,60,0.7) 100%)', border: '3px solid rgba(255,255,255,0.3)', color: 'white', fontSize: '32px', fontWeight: 'bold', cursor: 'pointer', touchAction: 'none', userSelect: 'none' }}>↑</button>
            <button onTouchStart={() => handleTouchStart('brake')} onTouchEnd={() => handleTouchEnd('brake')} style={{ width: '80px', height: '80px', borderRadius: '50%', background: mobileControls.brake ? 'linear-gradient(135deg, #ff0055 0%, #cc0044 100%)' : 'linear-gradient(135deg, rgba(0,0,0,0.7) 0%, rgba(40,40,60,0.7) 100%)', border: '3px solid rgba(255,255,255,0.3)', color: 'white', fontSize: '32px', fontWeight: 'bold', cursor: 'pointer', touchAction: 'none', userSelect: 'none' }}>↓</button>
          </div>
        </>
      )}

      {/* Exit Button */}
      <button onClick={() => navigate('/dashboard')} style={{ position: 'absolute', top: 20, right: 20, padding: '12px 24px', background: 'linear-gradient(135deg, #ff0055 0%, #cc0044 100%)', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontSize: '16px', fontWeight: 'bold', textTransform: 'uppercase', boxShadow: '0 6px 20px rgba(255,0,85,0.5)', transition: 'all 0.3s' }} onMouseOver={(e) => (e.target.style.transform = 'scale(1.05)')} onMouseOut={(e) => (e.target.style.transform = 'scale(1)')}>EXIT</button>
    </div>
  );
}

export default GamePageImproved;
