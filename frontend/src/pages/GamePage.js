import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import axios from 'axios';

// --- Postprocessing (ensure examples/jsm are available) ---
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
function makeAsphaltTexture({ width = 1024, height = 1024 } = {}) {
  const c = document.createElement('canvas');
  c.width = width; c.height = height;
  const g = c.getContext('2d');
  g.fillStyle = '#3b3b3b'; g.fillRect(0,0,width,height);
  for (let i = 0; i < 9000; i++) { // noise
    const a = Math.random() * 0.06; g.fillStyle = `rgba(255,255,255,${a})`;
    g.fillRect(Math.random()*width, Math.random()*height, 1, 1);
  }
  for (let i = 0; i < 9000; i++) {
    const a = Math.random() * 0.06; g.fillStyle = `rgba(0,0,0,${a})`;
    g.fillRect(Math.random()*width, Math.random()*height, 1, 1);
  }
  // rubber lines
  g.fillStyle = 'rgba(0,0,0,0.08)';
  for (let i = 0; i < 18; i++) g.fillRect(0, (i/18)*height, width, 3 + Math.random()*5);
  // side white
  g.fillStyle = '#dcdcdc'; g.fillRect(0, 40, width, 8); g.fillRect(0, height-48, width, 8);
  // dashed center
  g.strokeStyle = '#f7f7f7'; g.lineWidth = 6; g.setLineDash([50,40]); g.beginPath(); g.moveTo(0, height/2); g.lineTo(width, height/2); g.stroke();
  const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 8; return tex;
}

function makeKerbTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
  for (let i=0;i<8;i++){ g.fillStyle = i%2 ? '#ffffff' : '#e10600'; g.fillRect(i*32,0,32,64);} 
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(8,1); t.anisotropy = 8; return t;
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

  const [mobileControls, setMobileControls] = useState({ accelerate: false, brake: false, steerLeft: false, steerRight: false });

  const submitScore = async (lapTime) => {
    if (!user) return;
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_URL}/leaderboard/submit`, { lap_time: lapTime / 1000, track_name: 'Grand Prix Circuit' }, { headers: { Authorization: `Bearer ${token}` } });
    } catch (error) { console.error('Error submitting score:', error); }
  };

  useEffect(() => {
    if (!containerRef.current) return;

    // ===== SCENE & RENDERER =====
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x8ac6ff, 120, 520);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);
    camera.position.set(0, 6.5, 14);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    containerRef.current.appendChild(renderer.domElement);

    // sky
    const skyGeo = new THREE.SphereGeometry(1500, 32, 32);
    const skyMat = new THREE.ShaderMaterial({ side: THREE.BackSide, uniforms: { topColor: { value: new THREE.Color('#98d6ff') }, bottomColor: { value: new THREE.Color('#e6f4ff') } }, vertexShader: `varying vec3 vW;void main(){vec4 p=modelMatrix*vec4(position,1.0);vW=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}`, fragmentShader: `varying vec3 vW;uniform vec3 topColor;uniform vec3 bottomColor;void main(){float h=normalize(vW).y*0.5+0.5;gl_FragColor=vec4(mix(bottomColor,topColor,smoothstep(0.0,1.0,h)),1.0);}` });
    scene.add(new THREE.Mesh(skyGeo, skyMat));

    // ===== LIGHTING =====
    const hemi = new THREE.HemisphereLight(0xcfe9ff, 0x1b3a1a, 0.5); scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffffff, 1.25); sun.position.set(120, 220, 60); sun.castShadow = true; sun.shadow.mapSize.set(2048,2048); sun.shadow.camera.left=-250; sun.shadow.camera.right=250; sun.shadow.camera.top=250; sun.shadow.camera.bottom=-250; sun.shadow.normalBias=0.02; scene.add(sun);

    // ===== PHYSICS WORLD =====
    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -38, 0) });
    world.broadphase = new CANNON.SAPBroadphase(world);
    world.allowSleep = true;

    // Materials for realistic grip differences
    const matGrass = new CANNON.Material('grass');
    const matTarmac = new CANNON.Material('tarmac');
    world.addContactMaterial(new CANNON.ContactMaterial(matTarmac, matTarmac, { friction: 0.9, restitution: 0.0 }));
    world.addContactMaterial(new CANNON.ContactMaterial(matTarmac, matGrass, { friction: 0.4, restitution: 0.0 }));
    world.addContactMaterial(new CANNON.ContactMaterial(matGrass, matGrass, { friction: 0.25, restitution: 0.0 }));

    // ===== GROUND =====
    const groundGeo = new THREE.PlaneGeometry(2000, 2000);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x24501b, roughness: 1 });
    const ground = new THREE.Mesh(groundGeo, groundMat); ground.rotation.x = -Math.PI/2; ground.receiveShadow = true; scene.add(ground);
    const groundBody = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: matGrass }); groundBody.quaternion.setFromEuler(-Math.PI/2,0,0); world.addBody(groundBody);

    // ===== TRACK PATH =====
    const trackPath = []; const numPoints = 220; // smoother
    for (let i = 0; i <= numPoints; i++) {
      const t = (i / numPoints) * Math.PI * 2;
      let x = Math.sin(t) * 95; let z = Math.cos(t) * 65;
      x += Math.sin(t * 3.0) * 7.0; z += Math.cos(t * 2.4) * 5.0; // chicanes & sweepers
      trackPath.push(new THREE.Vector2(x, z));
    }
    const trackWidth = 16;

    // ===== TRACK SURFACE (visual mesh + physics strip for high grip) =====
    const asphalt = makeAsphaltTexture(); asphalt.repeat.set(12,1);
    const trackMatVis = new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.9 });

    const trackBodies = [];
    for (let i = 0; i < trackPath.length - 1; i++) {
      const p1 = trackPath[i]; const p2 = trackPath[i+1];
      const dx = p2.x - p1.x; const dy = p2.y - p1.y; const length = Math.hypot(dx,dy); const angle = Math.atan2(dy,dx);
      // visual
      const geo = new THREE.PlaneGeometry(length, trackWidth, 1, 1);
      const seg = new THREE.Mesh(geo, trackMatVis); seg.rotation.x = -Math.PI/2; seg.rotation.z = -angle; seg.position.set((p1.x+p2.x)/2, 0.02, (p1.y+p2.y)/2); seg.receiveShadow = true; scene.add(seg);
      // physics: thin box slightly above grass to ensure ray hits tarmac first
      const body = new CANNON.Body({ mass: 0, material: matTarmac });
      body.addShape(new CANNON.Box(new CANNON.Vec3(length/2, 0.1, trackWidth/2)));
      body.position.set((p1.x+p2.x)/2, 0.05, (p1.y+p2.y)/2);
      body.quaternion.setFromEuler(-Math.PI/2, 0, -angle, 'XYZ');
      world.addBody(body); trackBodies.push(body);
    }

    // ===== KERBS & BARRIERS (visual + physics) =====
    const kerbTex = makeKerbTexture(); const kerbMat = new THREE.MeshStandardMaterial({ map: kerbTex, roughness: 0.6 });
    const kerbGeo = new THREE.BoxGeometry(2.2, 0.4, 1.2);
    for (let i=0;i<trackPath.length;i+=4){
      const p = trackPath[i]; const prev = trackPath[(i-1+trackPath.length)%trackPath.length]; const next = trackPath[(i+1)%trackPath.length];
      const dir = new THREE.Vector2(next.x - prev.x, next.y - prev.y).normalize(); const n = new THREE.Vector2(-dir.y, dir.x);
      const inner = new THREE.Mesh(kerbGeo, kerbMat); inner.position.set(p.x + n.x*(trackWidth/2+0.8), 0.2, p.y + n.y*(trackWidth/2+0.8)); inner.rotation.y = Math.atan2(dir.x, dir.y); inner.castShadow=true; scene.add(inner);
      const outer = inner.clone(); outer.position.set(p.x - n.x*(trackWidth/2+0.8), 0.2, p.y - n.y*(trackWidth/2+0.8)); scene.add(outer);
    }
    // barriers
    const barrierGeo = new THREE.BoxGeometry(3.0, 1.1, 0.5);
    const barrierMat = new THREE.MeshStandardMaterial({ color: 0xbcbcbc, roughness: 0.7, metalness: 0.1 });
    for (let i=0;i<trackPath.length;i+=2){
      const p = trackPath[i]; const prev = trackPath[(i-1+trackPath.length)%trackPath.length]; const next = trackPath[(i+1)%trackPath.length];
      const dir = new THREE.Vector2(next.x - prev.x, next.y - prev.y).normalize(); const n = new THREE.Vector2(-dir.y, dir.x);
      const b = new THREE.Mesh(barrierGeo, barrierMat); b.position.set(p.x - n.x*(trackWidth/2+2.6), 0.55, p.y - n.y*(trackWidth/2+2.6)); b.rotation.y = Math.atan2(dir.x, dir.y); b.castShadow=true; scene.add(b);
      const bb = new CANNON.Body({ mass: 0, material: matTarmac }); bb.addShape(new CANNON.Box(new CANNON.Vec3(1.5,0.55,0.25))); bb.position.copy(b.position); bb.quaternion.setFromEuler(0,b.rotation.y,0); world.addBody(bb);
    }

    // ===== DECOR: simple crowd stands (visual only) =====
    const standMat = new THREE.MeshStandardMaterial({ color: 0x2f2f2f, roughness: 0.9 });
    for (let i=0;i<8;i++){
      const s = new THREE.Mesh(new THREE.BoxGeometry(12,3,6), standMat);
      const a = (i/8)*Math.PI*2; const r = 140; s.position.set(Math.cos(a)*r, 1.5, Math.sin(a)*r); s.rotation.y = -a + Math.PI/2; s.castShadow=true; s.receiveShadow=true; scene.add(s);
    }

    // ===== VEHICLE FACTORY (RaycastVehicle, realistic-ish) =====
    function createKartVehicle({ x, y, z, color = 0xff2a3a }) {
      // visual
      const group = new THREE.Group();
      const bodyMat = new THREE.MeshPhysicalMaterial({ color, roughness: 0.35, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08 });
      const blackMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 });
      const grayMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.4, metalness: 0.6 });
      const chassisMesh = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.5, 3.0), bodyMat); chassisMesh.position.y=0.35; chassisMesh.castShadow=true; group.add(chassisMesh);
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.2, 12), bodyMat); nose.rotation.x=Math.PI/2; nose.position.set(0,0.55,1.4); group.add(nose);
      const seat = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.5, 1.0), blackMat); seat.position.set(0,0.75,-0.2); group.add(seat);
      const wheelVisuals = []; const tireGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.36, 20); const tireMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
      for (let i=0;i<4;i++){ const w = new THREE.Mesh(tireGeo, tireMat); w.rotation.z=Math.PI/2; w.castShadow=true; group.add(w); wheelVisuals.push(w);} 
      scene.add(group);

      // physics chassis
      const chassisBody = new CANNON.Body({ mass: 160, material: matTarmac });
      const chassisShape = new CANNON.Box(new CANNON.Vec3(1.0, 0.35, 1.4));
      chassisBody.addShape(chassisShape);
      chassisBody.position.set(x, y, z);
      chassisBody.angularDamping = 0.6; chassisBody.linearDamping = 0.2;

      // raycast vehicle
      const vehicle = new CANNON.RaycastVehicle({ chassisBody, indexRightAxis: 0, indexUpAxis: 1, indexForwardAxis: 2 });
      const wheelOptions = {
        radius: 0.42,
        directionLocal: new CANNON.Vec3(0, -1, 0),
        suspensionStiffness: 55,
        suspensionRestLength: 0.28,
        frictionSlip: 4.5, // grip
        dampingRelaxation: 3.0,
        dampingCompression: 4.4,
        maxSuspensionForce: 6000,
        rollInfluence: 0.25,
        axleLocal: new CANNON.Vec3(1, 0, 0),
        chassisConnectionPointLocal: new CANNON.Vec3(),
        customSlidingRotationalSpeed: -0.1,
        useCustomSlidingRotationalSpeed: true
      };
      const halfW = 0.95; const halfL = 1.25;
      const wheelPositions = [
        new CANNON.Vec3(-halfW, 0.2,  halfL), // FL
        new CANNON.Vec3( halfW, 0.2,  halfL), // FR
        new CANNON.Vec3(-halfW, 0.2, -halfL), // RL
        new CANNON.Vec3( halfW, 0.2, -halfL), // RR
      ];
      wheelPositions.forEach((wp) => { const opts = { ...wheelOptions }; opts.chassisConnectionPointLocal = wp.clone(); vehicle.addWheel(opts); });
      vehicle.addToWorld(world);

      // wheel bodies for visual transform
      const wheelBodies = [];
      vehicle.wheelInfos.forEach((wheel) => {
        const cylinderShape = new CANNON.Cylinder(wheel.radius, wheel.radius, 0.36, 16);
        const body = new CANNON.Body({ mass: 1, material: matTarmac });
        const q = new CANNON.Quaternion(); q.setFromAxisAngle(new CANNON.Vec3(0,0,1), Math.PI/2);
        body.addShape(cylinderShape, new CANNON.Vec3(), q);
        wheelBodies.push(body);
      });

      world.addEventListener('postStep', () => {
        // keep wheels visual in sync
        for (let i=0; i<vehicle.wheelInfos.length; i++) {
          vehicle.updateWheelTransform(i);
          const t = vehicle.wheelInfos[i].worldTransform;
          wheelVisuals[i].position.copy(new THREE.Vector3(t.position.x, t.position.y, t.position.z));
          wheelVisuals[i].quaternion.copy(new THREE.Quaternion(t.quaternion.x, t.quaternion.y, t.quaternion.z, t.quaternion.w));
        }
        // sync chassis -> group
        group.position.copy(chassisBody.position);
        group.quaternion.copy(chassisBody.quaternion);
      });

      return { group, vehicle, chassisBody, wheelVisuals };
    }

    // ===== PLAYER VEHICLE =====
    const player = createKartVehicle({ x: trackPath[0].x, y: 2, z: trackPath[0].y, color: 0xff2a3a });

    // ===== AI VEHICLES (path following with lookahead + speed control) =====
    const aiColors = [0x1e90ff, 0x35ff2a, 0xffe12a];
    const aiVehicles = aiColors.map((c, i) => {
      const idx = ((i + 1) * 12) % trackPath.length;
      return { ...createKartVehicle({ x: trackPath[idx].x, y: 2, z: trackPath[idx].y, color: c }), progress: idx / trackPath.length, lookahead: 8 + i * 2 };
    });

    // ===== CHECKPOINTS & FINISH LINE =====
    const checkpoints = []; const cpInterval = 6;
    for (let i = 0; i < trackPath.length; i += cpInterval) {
      const p = trackPath[i];
      checkpoints.push({ position: new THREE.Vector3(p.x, 0, p.y), passed: false, isFinishLine: i === 0 });
      if (i === 0) {
        const poleGeo = new THREE.CylinderGeometry(0.2, 0.2, 6, 10);
        const poleMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
        const left = new THREE.Mesh(poleGeo, poleMat); left.position.set(p.x - trackWidth/2 - 1.5, 3, p.y); left.castShadow = true; scene.add(left);
        const right = left.clone(); right.position.x = p.x + trackWidth/2 + 1.5; scene.add(right);
        const bannerGeo = new THREE.PlaneGeometry(trackWidth + 4, 1.2);
        const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128; const g = canvas.getContext('2d');
        for (let y = 0; y < 8; y++) for (let x = 0; x < 32; x++) { g.fillStyle = (x + y) % 2 ? '#000' : '#fff'; g.fillRect(x * 16, y * 16, 16, 16); }
        const tex = new THREE.CanvasTexture(canvas); const bannerMat = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide });
        const banner = new THREE.Mesh(bannerGeo, bannerMat); banner.position.set(p.x, 4.6, p.y); banner.castShadow = true; scene.add(banner);
      }
    }

    // ===== INPUT =====
    const keys = {}; window.addEventListener('keydown', (e) => (keys[e.key.toLowerCase()] = true)); window.addEventListener('keyup', (e) => (keys[e.key.toLowerCase()] = false));

    // ===== RACE STATE =====
    let raceStarted = false; let raceStartTime = null; let lapStartTime = null; let countdown = 3; let currentLap = 1; const totalLaps = 5; let lapTimes = []; let bestLapTime = null; let lastCheckpoint = 0; let checkpointsPassed = 0;
    const countdownInterval = setInterval(() => { if (countdown > 0){ countdown--; setGameState((p)=>({ ...p, countdown })); } else { raceStarted = true; raceStartTime = Date.now(); lapStartTime = Date.now(); clearInterval(countdownInterval);} }, 1000);

    // ===== CAMERA (smoothed chase + FOV kick) =====
    const baseFov = 75; const camOffset = new THREE.Vector3(0, 5.5, 11.5); const camLook = new THREE.Vector3(0, 1.0, 0);
    function updateCamera(speedLen){ const pos = player.group.position; const rot = player.group.rotation; const target = camOffset.clone().applyEuler(rot).add(pos); camera.position.lerp(target, 0.1); camera.lookAt(pos.clone().add(camLook)); const targetFov = THREE.MathUtils.clamp(baseFov + speedLen*0.7, 75, 92); camera.fov += (targetFov - camera.fov)*0.05; camera.updateProjectionMatrix(); }

    // ===== POSTPROCESS =====
    const composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera)); composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.3, 0.8, 0.9)); composer.addPass(new SMAAPass(window.innerWidth*renderer.getPixelRatio(), window.innerHeight*renderer.getPixelRatio()));

    // ===== AI CONTROL =====
    function updateAI(dt){
      aiVehicles.forEach((ai)=>{
        // find target point ahead on path
        ai.progress += 0.0001; if (ai.progress>1) ai.progress-=1; // keep index advancing slowly
        const baseIdx = Math.floor(ai.progress * trackPath.length);
        const targetIdx = (baseIdx + ai.lookahead) % trackPath.length;
        const target = trackPath[targetIdx];
        const chassis = ai.chassisBody;
        // vector to target on XZ
        const toTarget = new THREE.Vector2(target.x - chassis.position.x, target.y - chassis.position.z);
        const heading = new THREE.Vector2(Math.sin(chassis.quaternion.toEuler(new CANNON.Vec3()).y), Math.cos(chassis.quaternion.toEuler(new CANNON.Vec3()).y));
        const cross = Math.sign(heading.x * toTarget.y - heading.y * toTarget.x); // left/right
        const angle = Math.atan2(Math.abs(heading.x*toTarget.y - heading.y*toTarget.x), heading.x*toTarget.x + heading.y*toTarget.y);
        const steer = THREE.MathUtils.clamp(cross * angle * 1.2, -0.5, 0.5);
        // speed target based on curvature
        const desiredSpeed = THREE.MathUtils.lerp(12, 33, 1 - Math.min(angle/1.2, 1));
        const currentSpeed = chassis.velocity.length();
        const engineForce = currentSpeed < desiredSpeed ? 2200 : -1200; // brake if too fast
        ai.vehicle.setSteeringValue(steer, 0); ai.vehicle.setSteeringValue(steer, 1);
        ai.vehicle.applyEngineForce(engineForce, 2); ai.vehicle.applyEngineForce(engineForce, 3);
        // slight downforce for stability
        const down = Math.min(currentSpeed*currentSpeed*0.6, 2200);
        chassis.applyForce(new CANNON.Vec3(0, -down, 0), chassis.position);
      });
    }

    // ===== PLAYER CONTROL =====
    const control = { engineForce: 0, steer: 0, brake: 0 };
    const MAX_ENGINE = 2600; const MAX_BRAKE = 2000; const MAX_STEER = 0.6; const MAX_SPEED = 38;

    function updatePlayerInput(){
      // throttle / brake
      const accel = keys['w'] || keys['arrowup'] || mobileControls.accelerate;
      const back = keys['s'] || keys['arrowdown'] || mobileControls.brake;
      // smooth engine force
      const targetEngine = accel ? MAX_ENGINE : 0;
      control.engineForce += (targetEngine - control.engineForce) * 0.2;
      control.brake = back ? MAX_BRAKE : 0;
      // steering with speed-based reduction
      const left = keys['a'] || keys['arrowleft'] || mobileControls.steerLeft;
      const right = keys['d'] || keys['arrowright'] || mobileControls.steerRight;
      const desiredSteer = left ? MAX_STEER : right ? -MAX_STEER : 0;
      // reduce steer at higher speeds for stability
      const speed = player.chassisBody.velocity.length();
      const steerScale = 1 - THREE.MathUtils.smoothstep(speed / MAX_SPEED, 0.2, 1.0);
      control.steer += ((desiredSteer * steerScale) - control.steer) * 0.3;

      // apply
      const currentSpeed = player.chassisBody.velocity.length();
      // simple traction control: reduce engine if wheels are slipping (approx by lateral velocity)
      const lateral = Math.abs(player.chassisBody.velocity.x * Math.cos(player.chassisBody.quaternion.y) - player.chassisBody.velocity.z * Math.sin(player.chassisBody.quaternion.y));
      const traction = THREE.MathUtils.clamp(1 - lateral * 0.05, 0.4, 1);
      const engine = control.engineForce * traction;

      player.vehicle.setSteeringValue(control.steer, 0);
      player.vehicle.setSteeringValue(control.steer, 1);
      player.vehicle.applyEngineForce(engine, 2);
      player.vehicle.applyEngineForce(engine, 3);
      player.vehicle.setBrake(control.brake, 2);
      player.vehicle.setBrake(control.brake, 3);

      // downforce for player
      const down = Math.min(currentSpeed*currentSpeed*0.7, 2600);
      player.chassisBody.applyForce(new CANNON.Vec3(0, -down, 0), player.chassisBody.position);

      // speed cap (drag)
      if (currentSpeed > MAX_SPEED) {
        const v = player.chassisBody.velocity; player.chassisBody.velocity.scale(0.98, v);
      }
    }

    // ===== LAPS =====
    function updateLaps(){
      const pos = player.group.position;
      for (let i=0;i<checkpoints.length;i++) {
        const cp = checkpoints[i];
        if (!cp.passed && pos.distanceTo(cp.position) < 10) {
          const nextOK = (i === (lastCheckpoint + 1) % checkpoints.length) || (lastCheckpoint === checkpoints.length - 1 && i === 0);
          if (nextOK) {
            cp.passed = true; lastCheckpoint = i; checkpointsPassed++;
            if (cp.isFinishLine && checkpointsPassed >= checkpoints.length) {
              const lapTime = Date.now() - lapStartTime; lapTimes.push(lapTime);
              if (!bestLapTime || lapTime < bestLapTime) { bestLapTime = lapTime; submitScore(lapTime); }
              currentLap++; lapStartTime = Date.now(); checkpointsPassed = 0; checkpoints.forEach((c)=>c.passed=false);
              if (currentLap > totalLaps) setGameState((p)=>({ ...p, raceFinished: true }));
            }
          }
        }
      }
    }

    // ===== MAIN LOOP =====
    let last = performance.now();
    function animate(now){
      const dt = Math.min((now - last)/1000, 1/30); last = now; requestAnimationFrame(animate);
      if (raceStarted){ updatePlayerInput(); updateAI(dt); world.step(1/60, dt, 3); updateLaps(); }
      // camera and HUD
      updateCamera(player.chassisBody.velocity.length());
      const speed = Math.round(player.chassisBody.velocity.length() * 10);
      const totalTime = raceStarted ? (Date.now() - raceStartTime) : 0;
      setGameState({ speed, currentLap: Math.min(currentLap, totalLaps), totalLaps, lapTimes, bestLapTime, totalTime, position: 1, totalRacers: 4, isRacing: currentLap <= totalLaps, raceFinished: currentLap > totalLaps, countdown });
      composer.render();
    }
    requestAnimationFrame(animate);

    // ===== RESIZE =====
    function onResize(){ camera.aspect = window.innerWidth/window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); composer.setSize(window.innerWidth, window.innerHeight); }
    window.addEventListener('resize', onResize);

    // ===== CLEANUP =====
    return () => { clearInterval(countdownInterval); window.removeEventListener('resize', onResize); if (containerRef.current && renderer.domElement) containerRef.current.removeChild(renderer.domElement); renderer.dispose(); composer.dispose(); };
  }, []);

  // Mobile controls
  const handleTouchStart = (c) => setMobileControls((p) => ({ ...p, [c]: true }));
  const handleTouchEnd = (c) => setMobileControls((p) => ({ ...p, [c]: false }));
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: '#000' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Countdown */}
      {gameState.countdown > 0 && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', fontSize: '180px', fontWeight: 'bold', color: '#00ff88', textShadow: '0 0 40px #00ff88, 0 0 80px #00ff88', animation: 'pulse 1s ease-in-out', zIndex: 1000 }}>{gameState.countdown}</div>
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
          <span style={{ color: '#888' }}>POSITION:</span>{' '}<span style={{ color: '#ffd700', fontWeight: 'bold' }}>{gameState.position}/{gameState.totalRacers}</span>
        </div>
        <div style={{ marginBottom: '8px' }}>
          <span style={{ color: '#888' }}>LAP:</span> {gameState.currentLap}/{gameState.totalLaps}
        </div>
        <div style={{ marginBottom: '8px', color: '#888', fontSize: '12px' }}>
          <strong>TIME:</strong> {formatTime(gameState.totalTime)}
        </div>
        {gameState.bestLapTime && (<div style={{ marginBottom: '8px', color: '#ffd700', fontWeight: 'bold', fontSize: '12px' }}>⭐ BEST: {formatTime(gameState.bestLapTime)}</div>)}
        {gameState.raceFinished && (<div style={{ marginTop: '10px', padding: '10px', background: 'linear-gradient(135deg, #00ff88 0%, #00cc66 100%)', color: '#000', borderRadius: '8px', textAlign: 'center', fontWeight: 'bold', fontSize: '16px' }}>🏆 VICTORY! 🏆</div>)}
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
