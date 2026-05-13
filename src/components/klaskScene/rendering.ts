import * as THREE from 'three';
import {
  BISCUIT_HOME,
  BOARD,
  MAGNETICS,
  PIECES,
  goalZFor,
  type GameSettings,
  type Side,
} from '../../game/constants';
import type { GameState } from '../../game/simulation';
import type { CameraPreset } from './types';

export interface BallRollState {
  axis: THREE.Vector3;
  delta: THREE.Quaternion;
  initialized: boolean;
  lastX: number;
  lastZ: number;
  orientation: THREE.Quaternion;
}

export interface CameraOrbit {
  pitch: number;
  yaw: number;
}

export interface ChargePair {
  north: THREE.Mesh;
  south: THREE.Mesh;
}

export interface MagneticDebugMeshes {
  root: THREE.Group;
  biscuits: ChargePair[];
  steerers: Record<Side, ChargePair>;
  strikers: Record<Side, ChargePair>;
}

export interface PieceMeshes {
  ball: THREE.Mesh;
  ballRoll: BallRollState;
  strikers: Record<Side, THREE.Group>;
  steerers: Record<Side, THREE.Group>;
  biscuits: THREE.Group[];
  scoreChips: Record<Side, THREE.Mesh>;
  magneticDebug: MagneticDebugMeshes;
}

export interface ViewportSize {
  height: number;
  width: number;
}

interface TextPlaneOptions {
  align?: CanvasTextAlign;
  color?: string;
  font?: string;
  textureHeight?: number;
  textureWidth?: number;
}

export type SceneCamera = THREE.PerspectiveCamera | THREE.OrthographicCamera;
type BiscuitState = GameState['biscuits'][number];

export const FIELD_Y = 0;

const SURFACE_Y = 0.02;
const SIDES: Side[] = ['player', 'opponent'];
const SCORE_CHIP_HEIGHT = 0.0234;
const SCORE_CHIP_RADIUS = 0.074;
const SCORE_RAIL_TOP_Y = BOARD.wallHeight + 0.006;
const SCORE_LABEL_X = BOARD.width / 2 - 0.002;
const SCORE_LABEL_Y = BOARD.wallHeight * 0.64;
const SCORE_SLOT_X = BOARD.width / 2 + BOARD.wallThickness * 0.5;
const GOAL_DEPTH = PIECES.ballRadius * 1.5;
const CONTROLLER_MAGNET_RADIUS = PIECES.strikerRadius * 0.92;
const SURFACE_DECAL_Y = SURFACE_Y + 0.0025;
const SURFACE_LINE_Y = SURFACE_Y + 0.0045;
const BOARD_FONT_FAMILY = 'Gaegu, cursive';

export async function loadBoardFont(): Promise<void> {
  if (!('fonts' in document)) {
    return;
  }

  const fontLoad = document.fonts.load(`400 128px ${BOARD_FONT_FAMILY}`).then(() => undefined);
  const timeout = new Promise<void>((resolve) => {
    window.setTimeout(resolve, 1200);
  });

  try {
    await Promise.race([fontLoad, timeout]);
  } catch {
    // Canvas text will fall back if the network font is unavailable.
  }
}

function makeMat(color: string, options: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.72,
    metalness: 0.04,
    ...options,
  });
}

function makeWoodTexture(base = '#ecd8b5'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return new THREE.CanvasTexture(canvas);
  }

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < canvas.height; y += 4) {
    const wave = Math.sin(y * 0.19) * 10 + Math.sin(y * 0.047) * 26;
    ctx.strokeStyle = y % 12 === 0 ? 'rgba(128, 88, 44, 0.12)' : 'rgba(255, 252, 238, 0.2)';
    ctx.lineWidth = y % 12 === 0 ? 1.4 : 0.8;
    ctx.beginPath();
    ctx.moveTo(0, y + wave * 0.08);

    for (let x = 0; x <= canvas.width; x += 28) {
      ctx.lineTo(x, y + Math.sin((x + y) * 0.035) * 2 + wave * 0.04);
    }

    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(3, 1);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeWoodMat(color = '#ecd8b5'): THREE.MeshStandardMaterial {
  return makeMat(color, {
    map: makeWoodTexture(color),
    roughness: 0.58,
    metalness: 0,
  });
}

function makeBallTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return new THREE.CanvasTexture(canvas);
  }

  ctx.fillStyle = '#ffd329';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const gradient = ctx.createRadialGradient(178, 82, 12, 222, 112, 260);
  gradient.addColorStop(0, 'rgba(255, 247, 129, 0.34)');
  gradient.addColorStop(1, 'rgba(177, 114, 0, 0.16)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  let seed = 42;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  ctx.lineCap = 'round';
  for (let i = 0; i < 64; i += 1) {
    const x = rand() * canvas.width;
    const y = rand() * canvas.height;
    const length = 10 + rand() * 38;
    const angle = rand() * Math.PI * 2;
    ctx.strokeStyle = i % 4 === 0 ? 'rgba(255, 255, 214, 0.32)' : 'rgba(125, 83, 0, 0.18)';
    ctx.lineWidth = 0.8 + rand() * 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(
      x + Math.cos(angle + 0.8) * length * 0.42,
      y + Math.sin(angle + 0.8) * length * 0.42,
      x + Math.cos(angle) * length,
      y + Math.sin(angle) * length,
    );
    ctx.stroke();
  }

  for (let i = 0; i < 34; i += 1) {
    ctx.fillStyle = i % 3 === 0 ? 'rgba(255, 252, 194, 0.24)' : 'rgba(123, 81, 0, 0.14)';
    ctx.beginPath();
    ctx.arc(rand() * canvas.width, rand() * canvas.height, 0.8 + rand() * 2.4, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 4;
  return texture;
}

function makeCylinder(
  radius: number,
  height: number,
  material: THREE.Material,
  segments = 48,
): THREE.Mesh {
  const geometry = new THREE.CylinderGeometry(radius, radius, height, segments);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function makeTextPlane(
  text: string,
  width: number,
  height: number,
  options: TextPlaneOptions = {},
): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = options.textureWidth ?? 512;
  canvas.height = options.textureHeight ?? 192;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = options.color ?? '#ffffff';
    ctx.font = options.font ?? `400 112px ${BOARD_FONT_FAMILY}`;
    ctx.textAlign = options.align ?? 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.DoubleSide,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  mesh.renderOrder = 3;
  return mesh;
}

export function disposeObject(root: THREE.Object3D): void {
  root.traverse((object) => {
    const mesh = object as THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>;

    if (mesh.geometry) {
      mesh.geometry.dispose();
    }

    if (mesh.material) {
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        const mappedMaterial = material as THREE.Material & { map?: THREE.Texture };

        if (mappedMaterial.map) {
          mappedMaterial.map.dispose();
        }

        material.dispose();
      }
    }
  });
}

export function updateOrthographicFrustum(
  camera: THREE.OrthographicCamera,
  viewport: ViewportSize,
): void {
  const aspect = Math.max(0.1, viewport.width / Math.max(1, viewport.height));
  const fitWidth = BOARD.width + BOARD.wallThickness * 4.2;
  const fitHeight = BOARD.length + BOARD.wallThickness * 4.2;
  const viewHeight = Math.max(fitHeight, fitWidth / aspect) * 1.04;
  const viewWidth = viewHeight * aspect;

  camera.left = -viewWidth / 2;
  camera.right = viewWidth / 2;
  camera.top = viewHeight / 2;
  camera.bottom = -viewHeight / 2;
  camera.updateProjectionMatrix();
}

export function positionCamera(
  camera: SceneCamera,
  preset: CameraPreset,
  orbit: CameraOrbit = { pitch: 0, yaw: 0 },
  viewport: ViewportSize = { height: 1, width: 1 },
): void {
  if (preset === 'orthographic') {
    const aspect = Math.max(0.1, viewport.width / Math.max(1, viewport.height));
    const targetX = Math.max(0, 0.7 - aspect) * 0.22;
    camera.position.set(targetX, 8, 0);
    camera.up.set(Math.sin(orbit.yaw), 0, -Math.cos(orbit.yaw));
    camera.lookAt(targetX, FIELD_Y, 0);
    return;
  }

  if (!(camera instanceof THREE.PerspectiveCamera)) {
    return;
  }

  const basePosition = new THREE.Vector3();

  if (preset === 'table') {
    basePosition.set(0, 5.8, 0.08);
  } else if (preset === 'low') {
    basePosition.set(0, 2.25, 3.85);
  } else {
    basePosition.set(0, 4.15, 4.65);
  }

  const spherical = new THREE.Spherical().setFromVector3(basePosition);
  const minPhi = preset === 'table' ? 0.02 : 0.16;
  const aspect = Math.max(0.1, viewport.width / Math.max(1, viewport.height));
  const narrowFitScale = Math.min(2.95, 1 + Math.max(0, 0.82 - aspect) * 4.5);
  const targetX = Math.max(0, 0.7 - aspect) * 0.95;

  spherical.theta += orbit.yaw;
  spherical.phi = Math.max(minPhi, Math.min(1.36, spherical.phi + orbit.pitch));
  spherical.radius *= narrowFitScale;
  camera.position.setFromSpherical(spherical);
  camera.lookAt(targetX, 0, 0);
}

function addServiceArc(scene: THREE.Scene, xSign: number, zSign: number): void {
  const radius = 0.58;
  const points: THREE.Vector3[] = [];

  for (let step = 0; step <= 28; step += 1) {
    const t = (step / 28) * Math.PI * 0.5;
    points.push(new THREE.Vector3(
      xSign * (BOARD.width / 2 - Math.cos(t) * radius),
      SURFACE_LINE_Y,
      zSign * (BOARD.length / 2 - Math.sin(t) * radius),
    ));
  }

  const curve = new THREE.CatmullRomCurve3(points);
  const arc = new THREE.Mesh(
    new THREE.TubeGeometry(curve, 36, 0.004, 8, false),
    makeMat('#ffffff', { roughness: 0.42, emissive: '#111111' }),
  );
  arc.renderOrder = 3;
  scene.add(arc);
}

function addKlaskLogos(scene: THREE.Scene): void {
  const logoA = makeTextPlane('KLASK', 1.08, 0.36, {
    font: `400 144px ${BOARD_FONT_FAMILY}`,
  });
  logoA.rotation.x = -Math.PI / 2;
  logoA.position.set(0, SURFACE_DECAL_Y, BOARD.length / 4);
  scene.add(logoA);

  const logoB = makeTextPlane('KLASK', 1.08, 0.36, {
    font: `400 144px ${BOARD_FONT_FAMILY}`,
  });
  logoB.rotation.x = -Math.PI / 2;
  logoB.rotation.z = Math.PI;
  logoB.position.set(0, SURFACE_DECAL_Y, -BOARD.length / 4);
  scene.add(logoB);
}

function scoreSlotZ(side: Side, score: number): number {
  const clampedScore = Math.max(0, Math.min(6, score));
  const spacing = 0.255;
  return side === 'player'
    ? 0.18 + clampedScore * spacing
    : -0.18 - clampedScore * spacing;
}

function addScoreRailMarks(scene: THREE.Scene): void {
  const slotMat = makeMat('#8b6230', { roughness: 0.84 });

  for (const side of SIDES) {
    for (let score = 0; score <= 6; score += 1) {
      const z = scoreSlotZ(side, score);
      const number = makeTextPlane(String(score), 0.13, 0.16, {
        color: '#17130d',
        font: score === 6 ? `400 112px ${BOARD_FONT_FAMILY}` : `400 106px ${BOARD_FONT_FAMILY}`,
        textureHeight: 128,
        textureWidth: 128,
      });
      number.rotation.y = -Math.PI / 2;
      number.position.set(SCORE_LABEL_X, SCORE_LABEL_Y, z);
      scene.add(number);

      const slot = new THREE.Mesh(
        new THREE.BoxGeometry(SCORE_CHIP_HEIGHT * 1.05, 0.006, SCORE_CHIP_RADIUS * 2.08),
        slotMat,
      );
      slot.position.set(SCORE_SLOT_X, SCORE_RAIL_TOP_Y, z);
      slot.receiveShadow = true;
      scene.add(slot);
    }
  }
}

function makeBoardShape(width: number, length: number, holeRadius: number): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(-width / 2, -length / 2);
  shape.lineTo(width / 2, -length / 2);
  shape.lineTo(width / 2, length / 2);
  shape.lineTo(-width / 2, length / 2);
  shape.lineTo(-width / 2, -length / 2);

  for (const side of SIDES) {
    const hole = new THREE.Path();
    hole.absarc(0, -goalZFor(side), holeRadius, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }

  return shape;
}

function makeFieldGeometry(): THREE.ShapeGeometry {
  const geometry = new THREE.ShapeGeometry(
    makeBoardShape(BOARD.width, BOARD.length, BOARD.goalRadius * 1.05),
    24,
  );
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function makeBaseGeometry(): THREE.ExtrudeGeometry {
  const geometry = new THREE.ExtrudeGeometry(
    makeBoardShape(
      BOARD.width + BOARD.wallThickness * 3.2,
      BOARD.length + BOARD.wallThickness * 3.2,
      BOARD.goalRadius * 1.12,
    ),
    {
      bevelEnabled: false,
      curveSegments: 32,
      depth: BOARD.baseHeight,
    },
  );
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

export function createBoard(scene: THREE.Scene): void {
  const wood = makeWoodMat('#ecd8b5');
  const railMat = makeWoodMat('#efdcbc');
  const field = makeMat('#1053bd', { roughness: 0.78 });
  const lineMat = makeMat('#fff8e8', { emissive: '#202020', roughness: 0.42 });
  const goalWater = makeMat('#25bce8', { roughness: 0.52, metalness: 0.02 });
  const goalWallMat = makeWoodMat('#e8d0a9');
  goalWallMat.side = THREE.DoubleSide;

  const base = new THREE.Mesh(
    makeBaseGeometry(),
    wood,
  );
  base.position.y = -BOARD.baseHeight - 0.02;
  base.receiveShadow = true;
  scene.add(base);

  const surface = new THREE.Mesh(
    makeFieldGeometry(),
    field,
  );
  surface.position.y = SURFACE_Y;
  surface.receiveShadow = true;
  scene.add(surface);

  const underboardDivider = new THREE.Mesh(
    new THREE.BoxGeometry(BOARD.width + BOARD.wallThickness * 1.6, 0.14, 0.035),
    railMat,
  );
  underboardDivider.position.set(0, -0.11, 0);
  underboardDivider.castShadow = true;
  underboardDivider.receiveShadow = true;
  scene.add(underboardDivider);

  const railNorth = new THREE.Mesh(
    new THREE.BoxGeometry(BOARD.width + BOARD.wallThickness * 2, BOARD.wallHeight, BOARD.wallThickness),
    railMat,
  );
  railNorth.position.set(0, BOARD.wallHeight / 2, BOARD.length / 2 + BOARD.wallThickness / 2);
  railNorth.castShadow = true;
  scene.add(railNorth);

  const railSouth = railNorth.clone();
  railSouth.position.z = -BOARD.length / 2 - BOARD.wallThickness / 2;
  scene.add(railSouth);

  const railEast = new THREE.Mesh(
    new THREE.BoxGeometry(BOARD.wallThickness, BOARD.wallHeight, BOARD.length + BOARD.wallThickness * 2),
    railMat,
  );
  railEast.position.set(BOARD.width / 2 + BOARD.wallThickness / 2, BOARD.wallHeight / 2, 0);
  railEast.castShadow = true;
  scene.add(railEast);

  const railWest = railEast.clone();
  railWest.position.x = -BOARD.width / 2 - BOARD.wallThickness / 2;
  scene.add(railWest);

  for (const side of SIDES) {
    const goalBottom = new THREE.Mesh(new THREE.CircleGeometry(BOARD.goalRadius * 0.94, 72), goalWater);
    goalBottom.rotation.x = -Math.PI / 2;
    goalBottom.position.set(0, SURFACE_Y - GOAL_DEPTH + 0.002, goalZFor(side));
    goalBottom.receiveShadow = true;
    scene.add(goalBottom);

    const goalWall = new THREE.Mesh(
      new THREE.CylinderGeometry(BOARD.goalRadius * 1.05, BOARD.goalRadius * 1.05, GOAL_DEPTH, 72, 1, true),
      goalWallMat,
    );
    goalWall.position.set(0, SURFACE_Y - GOAL_DEPTH / 2, goalZFor(side));
    goalWall.receiveShadow = true;
    scene.add(goalWall);
  }

  for (const home of BISCUIT_HOME) {
    const mark = new THREE.Mesh(
      new THREE.RingGeometry(PIECES.biscuitRadius * 1.15, PIECES.biscuitRadius * 1.42, 40),
      lineMat,
    );
    mark.rotation.x = -Math.PI / 2;
    mark.position.set(home.x, SURFACE_DECAL_Y, home.z);
    mark.renderOrder = 3;
    scene.add(mark);
  }

  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) {
      addServiceArc(scene, x, z);
    }
  }

  addKlaskLogos(scene);
  addScoreRailMarks(scene);
}

function createStrikerMesh(material: THREE.Material): THREE.Group {
  const group = new THREE.Group();
  const baseRadius = PIECES.strikerRadius;
  const neckRadius = 0.043;
  const tipRadius = 0.024;

  const base = makeCylinder(baseRadius, 0.11, material, 64);
  base.position.y = 0.055;

  const shoulder = new THREE.Mesh(
    new THREE.CylinderGeometry(neckRadius, baseRadius * 0.88, 0.07, 64),
    material,
  );
  shoulder.position.y = 0.145;
  shoulder.castShadow = true;
  shoulder.receiveShadow = true;

  const stem = new THREE.Mesh(
    new THREE.CylinderGeometry(tipRadius, neckRadius * 0.92, 0.34, 48),
    material,
  );
  stem.position.y = 0.35;
  stem.castShadow = true;
  stem.receiveShadow = true;

  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.036, 32, 18), material);
  knob.position.y = 0.545;
  knob.castShadow = true;

  group.add(base, shoulder, stem, knob);
  return group;
}

function createUnderBoardMagnet(): THREE.Group {
  const group = new THREE.Group();
  const bodyMat = makeMat('#f8fbff', {
    transparent: true,
    opacity: 0.075,
    roughness: 0.28,
    metalness: 0.1,
    depthTest: false,
    depthWrite: false,
  });
  const bluePole = makeMat('#147dd8', {
    transparent: true,
    opacity: 0.075,
    roughness: 0.3,
    metalness: 0.18,
    depthTest: false,
    depthWrite: false,
  });
  const redPole = makeMat('#e2503f', {
    transparent: true,
    opacity: 0.07,
    roughness: 0.3,
    metalness: 0.18,
    depthTest: false,
    depthWrite: false,
  });
  const collarMat = makeMat('#20252b', {
    transparent: true,
    opacity: 0.06,
    roughness: 0.42,
    depthTest: false,
    depthWrite: false,
  });

  const body = makeCylinder(CONTROLLER_MAGNET_RADIUS, MAGNETICS.controllerHeight, bodyMat, 44);
  const north = makeCylinder(CONTROLLER_MAGNET_RADIUS * 1.04, 0.045, bluePole, 44);
  north.position.y = MAGNETICS.controllerPoleSpread;
  const south = makeCylinder(CONTROLLER_MAGNET_RADIUS * 1.04, 0.045, redPole, 44);
  south.position.y = -MAGNETICS.controllerPoleSpread;
  const collar = makeCylinder(CONTROLLER_MAGNET_RADIUS * 1.08, 0.018, collarMat, 44);

  group.renderOrder = 2;
  body.renderOrder = 2;
  north.renderOrder = 2;
  south.renderOrder = 2;
  collar.renderOrder = 2;
  group.add(body, north, south, collar);
  return group;
}

function makeChargeMesh(color: string, radius: number): THREE.Mesh {
  const material = makeMat(color, {
    transparent: true,
    opacity: 0.82,
    roughness: 0.34,
    emissive: color,
    emissiveIntensity: 0.26,
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 18, 10), material);
  mesh.renderOrder = 5;
  return mesh;
}

function makeSideRecord<T>(factory: (side: Side) => T): Record<Side, T> {
  return {
    player: factory('player'),
    opponent: factory('opponent'),
  };
}

function createChargePair(root: THREE.Group, radius: number): ChargePair {
  const north = makeChargeMesh('#2f9cff', radius);
  const south = makeChargeMesh('#ff5b46', radius);
  root.add(north, south);
  return { north, south };
}

function createMagneticDebug(scene: THREE.Scene): MagneticDebugMeshes {
  const root = new THREE.Group();
  root.visible = false;
  scene.add(root);

  const strikers = makeSideRecord(() => createChargePair(root, 0.026));
  const steerers = makeSideRecord(() => createChargePair(root, 0.022));

  const biscuits = BISCUIT_HOME.map(() => createChargePair(root, 0.018));

  return { root, biscuits, steerers, strikers };
}

export function createPieceMeshes(scene: THREE.Scene): PieceMeshes {
  const magneticDebug = createMagneticDebug(scene);
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(PIECES.ballRadius, 32, 18),
    makeMat('#ffffff', {
      map: makeBallTexture(),
      roughness: 0.56,
    }),
  );
  const ballRoll: BallRollState = {
    axis: new THREE.Vector3(),
    delta: new THREE.Quaternion(),
    initialized: false,
    lastX: 0,
    lastZ: 0,
    orientation: new THREE.Quaternion(),
  };
  ball.castShadow = true;
  scene.add(ball);

  const strikerMaterial = makeMat('#08090a', { roughness: 0.5 });
  const biscuitMaterial = makeMat('#f6f0e6', { roughness: 0.58 });
  const chipMaterial = makeMat('#1596df', { roughness: 0.35, metalness: 0.06 });

  const strikers = makeSideRecord(() => {
    const striker = createStrikerMesh(strikerMaterial);
    scene.add(striker);
    return striker;
  });

  const steerers = makeSideRecord(() => {
    const steerer = createUnderBoardMagnet();
    scene.add(steerer);
    return steerer;
  });

  const biscuits: THREE.Group[] = [];
  for (let index = 0; index < 3; index += 1) {
    const group = new THREE.Group();
    const body = makeCylinder(PIECES.biscuitRadius, PIECES.biscuitHeight, biscuitMaterial, 48);
    body.position.y = 0;
    group.add(body);
    scene.add(group);
    biscuits.push(group);
  }

  const scoreChips = makeSideRecord(() => {
    const chip = makeCylinder(SCORE_CHIP_RADIUS, SCORE_CHIP_HEIGHT, chipMaterial, 54);
    chip.rotation.z = Math.PI / 2;
    chip.position.y = SCORE_RAIL_TOP_Y + SCORE_CHIP_RADIUS * 0.4;
    scene.add(chip);
    return chip;
  });

  return { ball, ballRoll, strikers, steerers, biscuits, scoreChips, magneticDebug };
}

function biscuitSupportHeight(biscuit: BiscuitState): number {
  const axisY = Math.abs(Math.cos(biscuit.tiltX) * Math.cos(biscuit.tiltZ));
  const radialY = Math.sqrt(Math.max(0, 1 - axisY * axisY));
  return (PIECES.biscuitHeight * 0.5 * axisY) + (PIECES.biscuitRadius * radialY);
}

function biscuitCenterY(biscuit: BiscuitState): number {
  return SURFACE_Y + biscuit.lift + biscuitSupportHeight(biscuit) + 0.001;
}

function biscuitRotation(biscuit: BiscuitState): THREE.Euler {
  return new THREE.Euler(biscuit.tiltX, -biscuit.angle, biscuit.tiltZ);
}

function strikerRotation(striker: GameState['strikers'][Side]): THREE.Euler {
  return new THREE.Euler(striker.tiltX, striker.yaw, striker.tiltZ);
}

function controllerCenterY(steerer: GameState['steerers'][Side]): number {
  return MAGNETICS.controllerCenterY - (steerer.drop ?? 0);
}

function syncMagneticDebug(meshes: MagneticDebugMeshes, state: GameState, settings: GameSettings): void {
  meshes.root.visible = settings.debugMagnetics;

  if (!settings.debugMagnetics) {
    return;
  }

  for (const side of SIDES) {
    const striker = state.strikers[side];
    const strikerY = SURFACE_Y + striker.y - striker.sink * GOAL_DEPTH;
    const strikerAxis = new THREE.Vector3(0, 1, 0).applyEuler(strikerRotation(striker));
    meshes.strikers[side].north.position.set(
      striker.pos.x + strikerAxis.x * MAGNETICS.strikerPoleTopY,
      strikerY + strikerAxis.y * MAGNETICS.strikerPoleTopY,
      striker.pos.z + strikerAxis.z * MAGNETICS.strikerPoleTopY,
    );
    meshes.strikers[side].south.position.set(
      striker.pos.x + strikerAxis.x * MAGNETICS.strikerPoleBottomY,
      strikerY + strikerAxis.y * MAGNETICS.strikerPoleBottomY,
      striker.pos.z + strikerAxis.z * MAGNETICS.strikerPoleBottomY,
    );

    const steerer = state.steerers[side];
    const steererY = controllerCenterY(steerer);
    meshes.steerers[side].north.position.set(
      steerer.x,
      steererY + MAGNETICS.controllerPoleSpread,
      steerer.z,
    );
    meshes.steerers[side].south.position.set(
      steerer.x,
      steererY - MAGNETICS.controllerPoleSpread,
      steerer.z,
    );
  }

  state.biscuits.forEach((biscuit, index) => {
    const pair = meshes.biscuits[index];

    if (!pair) {
      return;
    }

    const axis = new THREE.Vector3(0, 1, 0).applyEuler(biscuitRotation(biscuit));
    const centerY = biscuitCenterY(biscuit);
    const offset = PIECES.biscuitHeight * 0.5 + 0.018;
    pair.south.position.set(
      biscuit.pos.x + axis.x * offset,
      centerY + axis.y * offset,
      biscuit.pos.z + axis.z * offset,
    );
    pair.north.position.set(
      biscuit.pos.x - axis.x * offset,
      centerY - axis.y * offset,
      biscuit.pos.z - axis.z * offset,
    );
  });
}

function syncBallRoll(meshes: PieceMeshes, state: GameState): void {
  const roll = meshes.ballRoll;
  const dx = state.ball.pos.x - roll.lastX;
  const dz = state.ball.pos.z - roll.lastZ;
  const distance = Math.hypot(dx, dz);

  if (!roll.initialized || distance > 0.8) {
    roll.orientation.identity();
    roll.initialized = true;
  } else if (distance > 0.00001) {
    roll.axis.set(dz, 0, -dx).normalize();
    roll.delta.setFromAxisAngle(roll.axis, distance / PIECES.ballRadius);
    roll.orientation.premultiply(roll.delta).normalize();
  }

  meshes.ball.quaternion.copy(roll.orientation);
  roll.lastX = state.ball.pos.x;
  roll.lastZ = state.ball.pos.z;
}

export function syncMeshes(meshes: PieceMeshes, state: GameState, settings: GameSettings): void {
  syncBallRoll(meshes, state);

  meshes.ball.position.set(
    state.ball.pos.x,
    PIECES.ballRadius + SURFACE_Y + state.ball.y - state.ball.sink * GOAL_DEPTH,
    state.ball.pos.z,
  );
  meshes.ball.scale.setScalar(1);

  for (const side of SIDES) {
    const striker = state.strikers[side];
    meshes.strikers[side].position.set(striker.pos.x, SURFACE_Y + striker.y - striker.sink * GOAL_DEPTH, striker.pos.z);
    meshes.strikers[side].rotation.copy(strikerRotation(striker));
    meshes.steerers[side].position.set(
      state.steerers[side].x,
      controllerCenterY(state.steerers[side]),
      state.steerers[side].z,
    );
    meshes.steerers[side].visible = true;

    const score = state.score[side];
    meshes.scoreChips[side].position.set(
      SCORE_SLOT_X,
      SCORE_RAIL_TOP_Y + SCORE_CHIP_RADIUS * 0.4,
      scoreSlotZ(side, score),
    );
    meshes.scoreChips[side].rotation.set(0, 0, Math.PI / 2);
  }

  state.biscuits.forEach((biscuit, index) => {
    const mesh = meshes.biscuits[index];

    if (!mesh) {
      return;
    }

    mesh.position.set(
      biscuit.pos.x,
      biscuitCenterY(biscuit),
      biscuit.pos.z,
    );
    mesh.rotation.copy(biscuitRotation(biscuit));
  });

  syncMagneticDebug(meshes.magneticDebug, state, settings);
}
