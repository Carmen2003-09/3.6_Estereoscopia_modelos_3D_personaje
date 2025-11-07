import * as THREE from 'three';
import Stats from 'three/addons/libs/stats.module.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { Octree } from 'three/addons/math/Octree.js';
import { OctreeHelper } from 'three/addons/helpers/OctreeHelper.js';
import { Capsule } from 'three/addons/math/Capsule.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

// === Clock, Scene & Camera ===
const clock = new THREE.Clock();
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x88ccee);
scene.fog = new THREE.Fog(0x88ccee, 0, 50);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.rotation.order = 'YXZ';

// === Cámaras VR (estéreo side-by-side) ===
let isVRMode = false;
const eyeDistance = 0.05; // Distancia entre ojos (IPD - Interpupillary Distance)
const cameraLeft = new THREE.PerspectiveCamera(70, window.innerWidth / (2 * window.innerHeight), 0.1, 1000);
const cameraRight = new THREE.PerspectiveCamera(70, window.innerWidth / (2 * window.innerHeight), 0.1, 1000);
cameraLeft.rotation.order = 'YXZ';
cameraRight.rotation.order = 'YXZ';

// === Lights ===
const fillLight1 = new THREE.HemisphereLight(0x8dc1de, 0x00668d, 1.5);
fillLight1.position.set(2, 1, 1);
scene.add(fillLight1);

const directionalLight = new THREE.DirectionalLight(0xffffff, 2.5);
directionalLight.position.set(-5, 25, -1);
directionalLight.castShadow = true;
scene.add(directionalLight);

// === Renderer ===
const container = document.getElementById('container');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setAnimationLoop(animate);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
container.appendChild(renderer.domElement);

// === Stats ===
const stats = new Stats();
stats.domElement.style.position = 'absolute';
stats.domElement.style.top = '0px';
container.appendChild(stats.domElement);

// === Físicas ===
const GRAVITY = 30;
const STEPS_PER_FRAME = 5;

// === Player (más pequeño aún) ===
const worldOctree = new Octree();
const playerCollider = new Capsule(
  new THREE.Vector3(0, 0.0, 0), // Empezar desde el nivel de la malla amarilla
  new THREE.Vector3(0, 0.3, 0), // Altura normal
  0.07
);
const playerVelocity = new THREE.Vector3();
const playerDirection = new THREE.Vector3();
let playerOnFloor = false;

// === Personaje Ch22 ===
let playerModel = null;
let mixer = null;
let animations = {};
let currentAnimation = null;
const fbxLoader = new FBXLoader().setPath('./models/T-pose/');

// === Control de cámara en tercera persona (siempre de espaldas) ===
const cameraAngleX = 0.2; // Rotación vertical fija
const cameraAngleY = Math.PI; // Rotación horizontal fija (detrás del personaje)
const cameraDistance = 0.4; // Distancia de la cámara al personaje
const cameraHeight = 0.15; // Altura de la cámara
// Cargar el modelo del personaje
fbxLoader.load('Ch22_nonPBR.fbx', (fbx) => {
  playerModel = fbx;
  
  // Hacer el personaje EXTREMADAMENTE pequeño
  const scale = 0.001; // Mucho más pequeño que antes
  playerModel.scale.setScalar(scale);
  
  // Posicionar el personaje en el suelo
  playerModel.position.set(0, 0.15, 0); // Altura del centro del collider (0.3/2 = 0.15)
  
  // Configurar sombras
  playerModel.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  
  scene.add(playerModel);
  
  // Verificar el modelo y sus componentes
  console.log('Player model loaded:', playerModel);
  console.log('Model children:', playerModel.children);
  
  // Buscar el esqueleto en el modelo
  let skeleton = null;
  playerModel.traverse((child) => {
    if (child.isSkinnedMesh) {
      console.log('Found skinned mesh:', child);
      if (child.skeleton) {
        skeleton = child.skeleton;
        console.log('Found skeleton:', skeleton);
        console.log('Skeleton bones:', skeleton.bones.length);
      }
    }
  });
  
  if (!skeleton) {
    console.warn('No skeleton found in player model - animations may not work correctly');
  }
  
  // Configurar mixer para animaciones
  mixer = new THREE.AnimationMixer(playerModel);
  
  // Cargar todas las animaciones después de un pequeño delay
  setTimeout(() => {
    loadAnimations();
  }, 100);
});

// Función para cargar todas las animaciones
function loadAnimations() {
  const animationLoader = new FBXLoader().setPath('./models/T-pose/animations/');
  
  // Cargar Hip Hop Dancing (animación principal que se reproduce todo el tiempo)
  animationLoader.load('Hip Hop Dancing.fbx', (hipHopAnim) => {
    if (hipHopAnim.animations && hipHopAnim.animations.length > 0) {
      animations.hipHopDancing = mixer.clipAction(hipHopAnim.animations[0]);
      animations.hipHopDancing.setLoop(THREE.LoopRepeat);
      animations.hipHopDancing.setEffectiveWeight(1.0);
      configureAnimationForBonesOnly(animations.hipHopDancing);
      
      // Reproducir automáticamente la animación
      playAnimation('hipHopDancing');
      
      console.log('Hip Hop Dancing animation loaded and playing');
    } else {
      console.error('Hip Hop Dancing animation not found or invalid');
    }
  });
}

// Función para configurar animaciones para que solo afecten huesos
function configureAnimationForBonesOnly(animationAction) {
  if (!animationAction || !animationAction.getClip()) return;
  
  const clip = animationAction.getClip();
  
  // NO filtrar las pistas - dejar que todas las animaciones se reproduzcan
  // Solo asegurar que la posición del modelo se mantenga independiente
  console.log(`Animation configured: ${clip.name} (${clip.tracks.length} tracks)`);
}


// Función para cambiar animación (COMPLETAMENTE INDEPENDIENTE DE POSICIÓN)
function playAnimation(animationName) {
  if (!mixer || !animations[animationName]) {
    console.log(`Animation ${animationName} not available`);
    return;
  }
  
  // Para otras animaciones, solo cambiar si es una animación diferente
  if (currentAnimation === animations[animationName]) {
    return; // Ya está reproduciendo esta animación
  }
  
  // Detener animación actual
  if (currentAnimation) {
    currentAnimation.stop();
    currentAnimation.reset();
  }
  
  // Reproducir nueva animación
  currentAnimation = animations[animationName];
  currentAnimation.reset();
  currentAnimation.setEffectiveWeight(1.0);
  currentAnimation.setEffectiveTimeScale(1.0);
  currentAnimation.enabled = true;
  
  // Reproducir la animación
  currentAnimation.play();
  
  console.log(`Playing animation: ${animationName}`);
}

const vector1 = new THREE.Vector3();
const vector2 = new THREE.Vector3();
const vector3 = new THREE.Vector3();

// === Controles ===
// TODA la interacción de teclado ha sido eliminada

// === Botón VR ===
const vrButton = document.getElementById('vrButton');
const infoDiv = document.getElementById('info');
let guiInstance = null; // Se asignará cuando se cree el GUI

// Función para entrar en modo VR
function enterVRMode() {
  isVRMode = true;
  vrButton.classList.add('active');
  
  // Ocultar elementos de UI para vista limpia (incluyendo el botón)
  infoDiv.style.display = 'none';
  stats.domElement.style.display = 'none';
  vrButton.style.display = 'none';
  if (guiInstance) {
    guiInstance.domElement.style.display = 'none';
  }
  
  // Activar pantalla completa (compatible con móviles)
  const requestFullscreen = container.requestFullscreen || 
                           container.webkitRequestFullscreen || 
                           container.webkitEnterFullscreen || // iOS
                           container.mozRequestFullScreen || 
                           container.msRequestFullscreen;
  
  if (requestFullscreen) {
    try {
      // Para iOS, puede necesitar el elemento video/canvas directamente
      if (container.webkitEnterFullscreen && renderer.domElement.webkitEnterFullscreen) {
        renderer.domElement.webkitEnterFullscreen();
      } else {
        requestFullscreen.call(container);
      }
    } catch (error) {
      console.warn('Error al entrar en pantalla completa:', error);
      // Si falla, continuar sin pantalla completa pero en modo VR
    }
  }
  
  // Configurar para vista side-by-side después de un pequeño delay para móviles
  setTimeout(() => {
    const width = window.innerWidth || screen.width;
    const height = window.innerHeight || screen.height;
    renderer.setSize(width, height);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    
    // Ajustar cámaras VR
    const halfWidth = width / 2;
    cameraLeft.aspect = halfWidth / height;
    cameraRight.aspect = halfWidth / height;
    cameraLeft.updateProjectionMatrix();
    cameraRight.updateProjectionMatrix();
  }, 100);
  
  console.log('VR Mode: ON - Vista side-by-side activada en pantalla completa');
}

// Función para salir del modo VR
function exitVRMode() {
  isVRMode = false;
  vrButton.classList.remove('active');
  
  // Salir de pantalla completa (compatible con móviles)
  const exitFullscreen = document.exitFullscreen || 
                         document.webkitExitFullscreen || 
                         document.webkitCancelFullScreen ||
                         document.mozCancelFullScreen || 
                         document.msExitFullscreen;
  
  if (exitFullscreen) {
    try {
      exitFullscreen.call(document);
    } catch (error) {
      console.warn('Error al salir de pantalla completa:', error);
    }
  }
  
  // Mostrar elementos de UI nuevamente
  infoDiv.style.display = 'block';
  stats.domElement.style.display = 'block';
  vrButton.style.display = 'block';
  if (guiInstance) {
    guiInstance.domElement.style.display = 'block';
  }
  
  // Volver a vista normal después de un pequeño delay
  setTimeout(() => {
    const width = window.innerWidth || screen.width;
    const height = window.innerHeight || screen.height;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }, 100);
  
  console.log('VR Mode: OFF - Vista normal');
}

// Event listener para el botón VR (compatible con móviles)
vrButton.addEventListener('click', (event) => {
  event.preventDefault();
  event.stopPropagation();
  if (!isVRMode) {
    enterVRMode();
  }
});

// También agregar listener para touchstart para mejor respuesta en móviles
vrButton.addEventListener('touchstart', (event) => {
  event.preventDefault();
  event.stopPropagation();
  if (!isVRMode) {
    enterVRMode();
  }
}, { passive: false });

// Listener para ESC - salir del modo VR
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && isVRMode) {
    exitVRMode();
  }
});

// Función para manejar cambios de pantalla completa
function handleFullscreenChange() {
  const isFullscreen = document.fullscreenElement || 
                       document.webkitFullscreenElement || 
                       document.webkitCurrentFullScreenElement ||
                       document.mozFullScreenElement ||
                       document.msFullscreenElement;
  
  if (!isFullscreen && isVRMode) {
    // Si salimos de pantalla completa y estamos en modo VR, salir del modo VR
    exitVRMode();
  } else if (isFullscreen && isVRMode) {
    // Si entramos en pantalla completa y estamos en modo VR, ajustar tamaño
    setTimeout(() => {
      const width = window.innerWidth || screen.width;
      const height = window.innerHeight || screen.height;
      renderer.setSize(width, height);
      const halfWidth = width / 2;
      cameraLeft.aspect = halfWidth / height;
      cameraRight.aspect = halfWidth / height;
      cameraLeft.updateProjectionMatrix();
      cameraRight.updateProjectionMatrix();
    }, 100);
  }
}

// Listener para cuando se sale/entra de pantalla completa manualmente (compatible con móviles)
document.addEventListener('fullscreenchange', handleFullscreenChange);
document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
document.addEventListener('webkitendfullscreen', handleFullscreenChange); // iOS
document.addEventListener('mozfullscreenchange', handleFullscreenChange);
document.addEventListener('msfullscreenchange', handleFullscreenChange);

window.addEventListener('resize', onWindowResize);

function onWindowResize() {
  // Usar screen.width/height como fallback para móviles
  const width = window.innerWidth || screen.width;
  const height = window.innerHeight || screen.height;
  
  if (isVRMode) {
    // En modo VR, ajustar ambas cámaras
    const halfWidth = width / 2;
    cameraLeft.aspect = halfWidth / height;
    cameraRight.aspect = halfWidth / height;
    cameraLeft.updateProjectionMatrix();
    cameraRight.updateProjectionMatrix();
  } else {
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  renderer.setSize(width, height);
}





// === Movimiento del jugador ===
function playerCollisions() {
  const result = worldOctree.capsuleIntersect(playerCollider);
  playerOnFloor = false;
  if (result) {
    playerOnFloor = result.normal.y > 0;
    if (!playerOnFloor) {
      playerVelocity.addScaledVector(result.normal, -result.normal.dot(playerVelocity));
    }
    playerCollider.translate(result.normal.multiplyScalar(result.depth));
  }
}

function updatePlayer(deltaTime) {
  // El personaje ya no se mueve, solo aplicamos gravedad para mantenerlo en el suelo
  let damping = Math.exp(-4 * deltaTime) - 1;
  if (!playerOnFloor) {
    playerVelocity.y -= GRAVITY * deltaTime;
    damping *= 0.1;
  }
  playerVelocity.addScaledVector(playerVelocity, damping);
  const deltaPosition = playerVelocity.clone().multiplyScalar(deltaTime);
  playerCollider.translate(deltaPosition);
  playerCollisions();
  
  // === Sincronizar personaje con collider (INDEPENDIENTE DE ANIMACIONES) ===
  if (playerModel) {
    // FORZAR la posición del personaje basada en el collider
    const playerPosition = new THREE.Vector3().copy(playerCollider.end);
    playerPosition.y -= 0.15; // Ajustar para que esté en el centro del collider (0.3/2)
    
    // Establecer posición independientemente de las animaciones
    playerModel.position.set(playerPosition.x, playerPosition.y, playerPosition.z);
    
    // Mantener rotación fija (sin rotación basada en movimiento)
    playerModel.rotation.set(0, 0, 0);
  }
  
  // === Cámara en tercera persona con detección de colisiones ===
  updateThirdPersonCamera();
}

function updateThirdPersonCamera() {
  // CÁMARA SIEMPRE DE ESPALDAS EN TERCERA PERSONA
  // Usar SOLO la posición del collider (nunca del modelo animado)
  const playerPosition = new THREE.Vector3().copy(playerCollider.end);
  
  // Calcular posición ideal de la cámara siempre detrás del personaje
  const idealCameraPosition = new THREE.Vector3();
  idealCameraPosition.x = playerPosition.x + Math.sin(cameraAngleY) * Math.cos(cameraAngleX) * cameraDistance;
  idealCameraPosition.y = playerPosition.y + cameraHeight + Math.sin(cameraAngleX) * cameraDistance;
  idealCameraPosition.z = playerPosition.z + Math.cos(cameraAngleY) * Math.cos(cameraAngleX) * cameraDistance;
  
  // Detectar colisiones con el mundo
  const cameraCollider = new THREE.Sphere(idealCameraPosition, 0.05);
  const collision = worldOctree.sphereIntersect(cameraCollider);
  
  let finalCameraPosition;
  if (collision) {
    // Si hay colisión, mover la cámara hacia el personaje
    const direction = new THREE.Vector3().subVectors(playerPosition, idealCameraPosition).normalize();
    finalCameraPosition = new THREE.Vector3().copy(idealCameraPosition).addScaledVector(direction, collision.depth + 0.05);
  } else {
    finalCameraPosition = idealCameraPosition;
  }
  
  // Calcular dirección hacia el personaje
  const lookAtPosition = new THREE.Vector3().copy(playerPosition);
  lookAtPosition.y += 0.05;
  const lookDirection = new THREE.Vector3().subVectors(lookAtPosition, finalCameraPosition).normalize();
  const rightDirection = new THREE.Vector3().cross(lookDirection, new THREE.Vector3(0, 1, 0)).normalize();
  
  if (isVRMode) {
    // En modo VR, actualizar ambas cámaras con offset estéreo
    const eyeOffset = new THREE.Vector3().copy(rightDirection).multiplyScalar(eyeDistance);
    
    // Cámara izquierda
    cameraLeft.position.copy(finalCameraPosition).sub(eyeOffset);
    cameraLeft.lookAt(lookAtPosition);
    
    // Cámara derecha
    cameraRight.position.copy(finalCameraPosition).add(eyeOffset);
    cameraRight.lookAt(lookAtPosition);
  } else {
    // Suavizar el movimiento de la cámara normal
    camera.position.lerp(finalCameraPosition, 0.1);
    camera.lookAt(lookAtPosition);
  }
}

function controls(deltaTime) {
  // Sin controles de teclado - el personaje permanece estático
  // La animación Hip Hop Dancing se reproduce automáticamente
}

function teleportPlayerIfOob() {
  if (camera.position.y <= -25) {
    playerCollider.start.set(0, 0.0, 0); // Empezar desde el nivel de la malla amarilla
    playerCollider.end.set(0, 0.3, 0); // Altura normal
    playerCollider.radius = 0.07;
    camera.position.copy(playerCollider.end);
    playerVelocity.set(0, 0, 0);
  }
}

// === Escenario GLB ===
const loader = new GLTFLoader().setPath('./models/gltf/');
loader.load('beautiful_city.glb', (gltf) => {
  scene.add(gltf.scene);
  
  // Crear una copia del modelo para el octree y ajustar su posición
  const octreeScene = gltf.scene.clone();
  octreeScene.position.y -= 0.2; // Bajar el octree 0.2 unidades para que esté exactamente al nivel del asfalto
  
  worldOctree.fromGraphNode(octreeScene);
  
  gltf.scene.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      if (child.material.map) child.material.map.anisotropy = 4;
    }
  });
  const helper = new OctreeHelper(worldOctree);
  helper.visible = false;
  scene.add(helper);
  const gui = new GUI({ width: 100 });
  gui.add({ debug: false }, 'debug').onChange((value) => (helper.visible = value));
  guiInstance = gui; // Guardar referencia para poder ocultarlo en VR
});

// === Loop principal ===
function animate() {
  const deltaTime = Math.min(0.05, clock.getDelta()) / STEPS_PER_FRAME;
  for (let i = 0; i < STEPS_PER_FRAME; i++) {
    controls(deltaTime);
    updatePlayer(deltaTime);
    teleportPlayerIfOob();
  }
  
  // Actualizar animaciones (SOLO APARIENCIA VISUAL)
  if (mixer) {
    mixer.update(deltaTime * STEPS_PER_FRAME);
  }
  
  // FORZAR posición del modelo independientemente de las animaciones
  if (playerModel) {
    const playerPosition = new THREE.Vector3().copy(playerCollider.end);
    playerPosition.y -= 0.15;
    
    // Establecer posición y rotación forzadamente
    playerModel.position.set(playerPosition.x, playerPosition.y, playerPosition.z);
    
    // Mantener rotación fija (sin rotación basada en movimiento)
    playerModel.rotation.set(0, 0, 0);
  }
  
  // Renderizar según el modo
  if (isVRMode) {
    // Vista side-by-side para VR
    const halfWidth = window.innerWidth / 2;
    const fullHeight = window.innerHeight;
    
    // Renderizar vista izquierda
    renderer.setViewport(0, 0, halfWidth, fullHeight);
    renderer.setScissor(0, 0, halfWidth, fullHeight);
    renderer.setScissorTest(true);
    renderer.render(scene, cameraLeft);
    
    // Renderizar vista derecha
    renderer.setViewport(halfWidth, 0, halfWidth, fullHeight);
    renderer.setScissor(halfWidth, 0, halfWidth, fullHeight);
    renderer.render(scene, cameraRight);
    
    // Restaurar viewport completo
    renderer.setViewport(0, 0, window.innerWidth, window.innerHeight);
    renderer.setScissorTest(false);
  } else {
    // Vista normal
    renderer.render(scene, camera);
  }
  
  stats.update();
}
