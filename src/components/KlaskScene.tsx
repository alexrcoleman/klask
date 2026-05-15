import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';
import * as THREE from 'three';
import {
  DEFAULT_SETTINGS,
  PHYSICS,
  type GameSettings,
} from '../game/constants';
import {
  createInitialState,
  getSnapshot,
  resetMatch,
  setPlayerSteerer,
  setPlayerSteererLowered,
  stepSimulation,
  tryServeFromPointer,
  type GameSnapshot,
  type GameState,
} from '../game/simulation';
import {
  createBoard,
  createPieceMeshes,
  disposeObject,
  FIELD_Y,
  loadBoardFont,
  positionCamera,
  syncMeshes,
  updateOrthographicFrustum,
  type CameraOrbit,
  type SceneCamera,
  type ViewportSize,
} from './klaskScene/rendering';
import type { CameraPreset, KlaskSceneHandle } from './klaskScene/types';

export type { CameraPreset, KlaskSceneHandle } from './klaskScene/types';

const CAMERA_PITCH_MIN = -0.62;
const CAMERA_PITCH_MAX = 0.52;
const CAMERA_ZOOM_MIN = 0.72;
const CAMERA_ZOOM_MAX = 1.85;

interface TouchPoint {
  x: number;
  y: number;
}

interface TouchCameraGesture {
  centerX: number;
  centerY: number;
  distance: number;
  angle: number;
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function shortestAngleDelta(from: number, to: number): number {
  let delta = to - from;

  while (delta > Math.PI) {
    delta -= Math.PI * 2;
  }

  while (delta < -Math.PI) {
    delta += Math.PI * 2;
  }

  return delta;
}

interface KlaskSceneProps {
  cameraPreset: CameraPreset;
  onSnapshot?: (snapshot: GameSnapshot) => void;
  settings?: GameSettings;
}

const KlaskScene = forwardRef<KlaskSceneHandle, KlaskSceneProps>(function KlaskScene({
  cameraPreset,
  onSnapshot,
  settings = DEFAULT_SETTINGS,
}, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stateRef = useRef<GameState | null>(null);
  const settingsRef = useRef<GameSettings>(settings);
  const cameraPresetRef = useRef<CameraPreset>(cameraPreset);
  const onSnapshotRef = useRef<typeof onSnapshot>(onSnapshot);

  if (stateRef.current === null) {
    stateRef.current = createInitialState();
  }

  const getState = (): GameState => {
    if (stateRef.current === null) {
      stateRef.current = createInitialState();
    }

    return stateRef.current;
  };

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useEffect(() => {
    cameraPresetRef.current = cameraPreset;
  }, [cameraPreset]);

  useEffect(() => {
    onSnapshotRef.current = onSnapshot;
  }, [onSnapshot]);

  useImperativeHandle(ref, () => ({
    resetMatch() {
      resetMatch(getState());
      onSnapshotRef.current?.(getSnapshot(getState()));
    },
  }), []);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return undefined;
    }

    let cancelled = false;
    let cleanupScene: (() => void) | undefined;

    void (async () => {
      await loadBoardFont();

      if (cancelled || !container.isConnected) {
        return;
      }

      const scene = new THREE.Scene();
      scene.background = new THREE.Color('#191813');
      scene.fog = new THREE.Fog('#191813', 12, 24);

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      container.appendChild(renderer.domElement);

      const perspectiveCamera = new THREE.PerspectiveCamera(42, 1, 0.1, 40);
      const orthographicCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 40);
      const cameraOrbit: CameraOrbit = { pitch: 0, yaw: 0, zoom: 1 };
      const viewportSize: ViewportSize = { width: 1, height: 1 };
      positionCamera(perspectiveCamera, cameraPresetRef.current, cameraOrbit, viewportSize);
      updateOrthographicFrustum(orthographicCamera, viewportSize);
      positionCamera(orthographicCamera, 'orthographic', cameraOrbit, viewportSize);
      const getActiveCamera = (): SceneCamera => (
        cameraPresetRef.current === 'orthographic'
          ? orthographicCamera
          : perspectiveCamera
      );

      const ambient = new THREE.HemisphereLight('#fff8e8', '#28406b', 2.2);
      scene.add(ambient);

      const key = new THREE.DirectionalLight('#ffe3b7', 2.6);
      key.position.set(-2.6, 5.2, 3.25);
      key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      scene.add(key);

      const rim = new THREE.DirectionalLight('#a7d4ff', 1.1);
      rim.position.set(3.2, 3.4, -2.4);
      scene.add(rim);

      createBoard(scene);
      const meshes = createPieceMeshes(scene);

      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();
      const boardPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -FIELD_Y);
      const hit = new THREE.Vector3();
      let orbitPointerId: number | null = null;
      let lowerMagnetPointerId: number | null = null;
      const activeTouchPointers = new Map<number, TouchPoint>();
      let touchCameraGesture: TouchCameraGesture | null = null;
      let lastOrbitX = 0;
      let lastOrbitY = 0;

      const resize = () => {
        const width = container.clientWidth;
        const height = container.clientHeight;
        renderer.setSize(width, height, false);
        viewportSize.width = width;
        viewportSize.height = height;
        perspectiveCamera.aspect = width / height;
        perspectiveCamera.updateProjectionMatrix();
        updateOrthographicFrustum(orthographicCamera, viewportSize);
      };

      const resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(container);
      resize();

      const handleBoardPointer = (event: PointerEvent) => {
        event.preventDefault();

        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
        raycaster.setFromCamera(pointer, getActiveCamera());

        if (raycaster.ray.intersectPlane(boardPlane, hit)) {
          if (
            !settingsRef.current.aiControlsPlayer
            && event.type === 'pointerdown'
            && event.button === 0
            && tryServeFromPointer(getState(), hit.x, hit.z)
          ) {
            onSnapshotRef.current?.(getSnapshot(getState()));
            return;
          }

          if (!settingsRef.current.aiControlsPlayer) {
            setPlayerSteerer(getState(), hit.x, hit.z);
          }
        }
      };

      const setPlayerMagnetLowered = (lowered: boolean) => {
        if (!settingsRef.current.aiControlsPlayer) {
          setPlayerSteererLowered(getState(), lowered);
        }
      };

      if (window.matchMedia('(pointer: coarse)').matches) {
        setPlayerMagnetLowered(true);
      }

      const activeTouchPair = (): [TouchPoint, TouchPoint] | null => {
        const entries = Array.from(activeTouchPointers.values());
        const first = entries[0];
        const second = entries[1];

        if (!first || !second) {
          return null;
        }

        return [first, second];
      };

      const describeTouchGesture = (first: TouchPoint, second: TouchPoint): TouchCameraGesture => {
        const dx = second.x - first.x;
        const dy = second.y - first.y;

        return {
          angle: Math.atan2(dy, dx),
          centerX: (first.x + second.x) * 0.5,
          centerY: (first.y + second.y) * 0.5,
          distance: Math.max(24, Math.hypot(dx, dy)),
        };
      };

      const beginTouchCameraGesture = () => {
        const pair = activeTouchPair();
        touchCameraGesture = pair ? describeTouchGesture(pair[0], pair[1]) : null;
      };

      const updateTouchCameraGesture = () => {
        const pair = activeTouchPair();

        if (!pair) {
          touchCameraGesture = null;
          return;
        }

        const nextGesture = describeTouchGesture(pair[0], pair[1]);

        if (!touchCameraGesture) {
          touchCameraGesture = nextGesture;
          return;
        }

        const dx = nextGesture.centerX - touchCameraGesture.centerX;
        const dy = nextGesture.centerY - touchCameraGesture.centerY;
        const twist = shortestAngleDelta(touchCameraGesture.angle, nextGesture.angle);
        const pinchScale = nextGesture.distance / touchCameraGesture.distance;

        cameraOrbit.yaw -= dx * 0.006 + twist * 0.48;
        cameraOrbit.pitch = clampNumber(
          cameraOrbit.pitch + dy * 0.0048,
          CAMERA_PITCH_MIN,
          CAMERA_PITCH_MAX,
        );
        cameraOrbit.zoom = clampNumber(
          cameraOrbit.zoom * pinchScale,
          CAMERA_ZOOM_MIN,
          CAMERA_ZOOM_MAX,
        );
        touchCameraGesture = nextGesture;
      };

      const handlePointerDown = (event: PointerEvent) => {
        if (event.pointerType === 'touch') {
          event.preventDefault();
          activeTouchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
          renderer.domElement.setPointerCapture(event.pointerId);

          if (activeTouchPointers.size >= 2) {
            setPlayerMagnetLowered(true);
            beginTouchCameraGesture();
            return;
          }

          setPlayerMagnetLowered(false);
          handleBoardPointer(event);
          return;
        }

        if (event.button === 1) {
          event.preventDefault();
          orbitPointerId = event.pointerId;
          lastOrbitX = event.clientX;
          lastOrbitY = event.clientY;
          renderer.domElement.setPointerCapture(event.pointerId);
          return;
        }

        if (event.button === 2) {
          event.preventDefault();
          lowerMagnetPointerId = event.pointerId;
          setPlayerMagnetLowered(true);
          handleBoardPointer(event);
          renderer.domElement.setPointerCapture(event.pointerId);
          return;
        }

        handleBoardPointer(event);
      };

      const handlePointerMove = (event: PointerEvent) => {
        if (event.pointerType === 'touch') {
          event.preventDefault();
          activeTouchPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

          if (activeTouchPointers.size >= 2) {
            setPlayerMagnetLowered(true);
            updateTouchCameraGesture();
            return;
          }

          touchCameraGesture = null;
          setPlayerMagnetLowered(false);
          handleBoardPointer(event);
          return;
        }

        if (orbitPointerId === event.pointerId) {
          event.preventDefault();

          const dx = event.clientX - lastOrbitX;
          const dy = event.clientY - lastOrbitY;
          cameraOrbit.yaw -= dx * 0.008;
          cameraOrbit.pitch = clampNumber(
            cameraOrbit.pitch + dy * 0.006,
            CAMERA_PITCH_MIN,
            CAMERA_PITCH_MAX,
          );
          lastOrbitX = event.clientX;
          lastOrbitY = event.clientY;
          return;
        }

        if ((event.buttons & 4) !== 0) {
          event.preventDefault();
          return;
        }

        handleBoardPointer(event);
      };

      const handlePointerUp = (event: PointerEvent) => {
        if (event.pointerType === 'touch') {
          event.preventDefault();
          activeTouchPointers.delete(event.pointerId);

          if (activeTouchPointers.size >= 2) {
            setPlayerMagnetLowered(true);
            beginTouchCameraGesture();
          } else if (activeTouchPointers.size === 1) {
            touchCameraGesture = null;
            setPlayerMagnetLowered(false);
          } else {
            touchCameraGesture = null;
            setPlayerMagnetLowered(true);
          }

          if (renderer.domElement.hasPointerCapture(event.pointerId)) {
            renderer.domElement.releasePointerCapture(event.pointerId);
          }

          return;
        }

        if (lowerMagnetPointerId === event.pointerId && (event.button === 2 || event.type === 'pointercancel')) {
          lowerMagnetPointerId = null;
          setPlayerMagnetLowered(false);

          if (renderer.domElement.hasPointerCapture(event.pointerId)) {
            renderer.domElement.releasePointerCapture(event.pointerId);
          }
        }

        if (orbitPointerId === event.pointerId) {
          orbitPointerId = null;

          if (renderer.domElement.hasPointerCapture(event.pointerId)) {
            renderer.domElement.releasePointerCapture(event.pointerId);
          }
        }
      };

      const handleMouseDown = (event: MouseEvent) => {
        if (event.button === 1 || event.button === 2) {
          event.preventDefault();
        }
      };

      const handleAuxClick = (event: MouseEvent) => {
        if (event.button === 1) {
          event.preventDefault();
        }
      };

      const handleContextMenu = (event: MouseEvent) => {
        event.preventDefault();
      };

      const handleWindowBlur = () => {
        activeTouchPointers.clear();
        touchCameraGesture = null;
        lowerMagnetPointerId = null;
        setPlayerMagnetLowered(window.matchMedia('(pointer: coarse)').matches);
      };

      const handleKey = (event: KeyboardEvent) => {
        if (event.key.toLowerCase() === 'r') {
          resetMatch(getState());
        }
      };

      renderer.domElement.addEventListener('pointerdown', handlePointerDown);
      renderer.domElement.addEventListener('pointermove', handlePointerMove);
      renderer.domElement.addEventListener('pointerup', handlePointerUp);
      renderer.domElement.addEventListener('pointercancel', handlePointerUp);
      renderer.domElement.addEventListener('mousedown', handleMouseDown);
      renderer.domElement.addEventListener('auxclick', handleAuxClick);
      renderer.domElement.addEventListener('contextmenu', handleContextMenu);
      window.addEventListener('blur', handleWindowBlur);
      window.addEventListener('keydown', handleKey);

      let animationFrame = 0;
      let lastTime = performance.now();
      let accumulator = 0;
      let lastHud = 0;

      const animate = (time: number) => {
        const rawDt = Math.min(0.08, (time - lastTime) / 1000);
        lastTime = time;
        accumulator += rawDt;

        while (accumulator >= PHYSICS.fixedTimeStep) {
          stepSimulation(getState(), PHYSICS.fixedTimeStep, settingsRef.current);
          accumulator -= PHYSICS.fixedTimeStep;
        }

        positionCamera(perspectiveCamera, cameraPresetRef.current, cameraOrbit, viewportSize);
        positionCamera(orthographicCamera, 'orthographic', cameraOrbit, viewportSize);
        syncMeshes(meshes, getState(), settingsRef.current);
        renderer.render(scene, getActiveCamera());

        if (time - lastHud > 120) {
          onSnapshotRef.current?.(getSnapshot(getState()));
          lastHud = time;
        }

        animationFrame = requestAnimationFrame(animate);
      };

      onSnapshotRef.current?.(getSnapshot(getState()));
      animationFrame = requestAnimationFrame(animate);

      cleanupScene = () => {
        cancelAnimationFrame(animationFrame);
        resizeObserver.disconnect();
        renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
        renderer.domElement.removeEventListener('pointermove', handlePointerMove);
        renderer.domElement.removeEventListener('pointerup', handlePointerUp);
        renderer.domElement.removeEventListener('pointercancel', handlePointerUp);
        renderer.domElement.removeEventListener('mousedown', handleMouseDown);
        renderer.domElement.removeEventListener('auxclick', handleAuxClick);
        renderer.domElement.removeEventListener('contextmenu', handleContextMenu);
        window.removeEventListener('blur', handleWindowBlur);
        window.removeEventListener('keydown', handleKey);
        disposeObject(scene);
        renderer.dispose();
        renderer.domElement.remove();
      };
    })();

    return () => {
      cancelled = true;
      cleanupScene?.();
    };
  }, []);

  return <div className="sceneHost" ref={containerRef} />;
});

export default KlaskScene;
