"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Badge } from "@/components/ui/primitives";
import { FEATURE_LABELS, FT, STATUS_LABELS, type FeatureKind, type FeatureStatus, type PlacedRoom } from "@/lib/model";

export interface ViewerFeature {
  id: string;
  roomId: string;
  name: string;
  kind: FeatureKind;
  status: FeatureStatus;
  note: string;
  advertised: boolean;
  /** Fractions of the room's width and length. */
  x: number;
  y: number;
}

const FLOOR_H = 3.2;
const subscribe = (cb: () => void) => {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => obs.disconnect();
};
const readTheme = () => document.documentElement.dataset.theme ?? "dark";

const css = (name: string, fallback: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;

type Pick = { type: "room" | "feature"; id: string } | null;
interface Scene {
  rooms: Map<string, THREE.LineSegments>;
  features: Map<string, THREE.Mesh>;
  colors: { ink: string; edge: string; mint: string };
  render: () => void;
}

/** The property as boxes with its features pinned inside. Rotate, zoom, and click to inspect. */
export default function PropertyViewer({ rooms, features }: { rooms: PlacedRoom[]; features: ViewerFeature[] }) {
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<Scene | null>(null);
  const theme = useSyncExternalStore(subscribe, readTheme, () => "dark");
  const [selected, setSelected] = useState<Pick>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const el = host.current;
    if (!el || rooms.length === 0) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setFailed(true);
      return;
    }
    setFailed(false);

    const colors = {
      ink: css("--color-white", "#ffffff"),
      edge: css("--color-mute", "#8e98a5"),
      mint: css("--color-mint", "#66fcf1"),
      amber: css("--color-amber", "#f2b544"),
      flag: css("--color-flag", "#ff6b6b"),
    };
    const statusColor: Record<FeatureStatus, string> = { working: colors.mint, degraded: colors.amber, out_of_service: colors.flag };

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";

    const three = new THREE.Scene();
    const elev = (r: PlacedRoom) => r.floor * FLOOR_H;
    const minX = Math.min(...rooms.map((r) => r.x));
    const maxX = Math.max(...rooms.map((r) => r.x + r.w));
    const minZ = Math.min(...rooms.map((r) => r.y));
    const maxZ = Math.max(...rooms.map((r) => r.y + r.d));
    const maxY = Math.max(...rooms.map((r) => elev(r) + r.h));
    const minFloorY = Math.min(...rooms.map(elev));
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    const span = Math.max(maxX - minX, maxZ - minZ, 6);

    const grid = new THREE.GridHelper(span * 1.6, 16, colors.edge, colors.edge);
    grid.position.set(cx, minFloorY - 0.01, cz);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.25;
    three.add(grid);

    const roomEdges = new Map<string, THREE.LineSegments>();
    const pickables: THREE.Object3D[] = [];
    for (const r of rooms) {
      const box = new THREE.BoxGeometry(r.w, r.h, r.d);
      const body = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: colors.mint, transparent: true, opacity: 0.07, depthWrite: false }));
      body.position.set(r.x + r.w / 2, elev(r) + r.h / 2, r.y + r.d / 2);
      body.userData = { type: "room", id: r.id };
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box), new THREE.LineBasicMaterial({ color: colors.edge }));
      edges.position.copy(body.position);
      three.add(body, edges);
      pickables.push(body);
      roomEdges.set(r.id, edges);

      const canvas = document.createElement("canvas");
      canvas.width = 384;
      canvas.height = 80;
      const g = canvas.getContext("2d");
      if (g) {
        g.font = "600 34px sans-serif";
        g.fillStyle = colors.ink;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(r.name.length > 22 ? `${r.name.slice(0, 21)}…` : r.name, 192, 40);
      }
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
      label.scale.set(3.6, 0.75, 1);
      label.position.set(r.x + r.w / 2, elev(r) + r.h + 0.55, r.y + r.d / 2);
      three.add(label);
    }

    const byId = new Map(rooms.map((r) => [r.id, r]));
    const featureMeshes = new Map<string, THREE.Mesh>();
    for (const f of features) {
      const r = byId.get(f.roomId);
      if (!r) continue;
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 14), new THREE.MeshBasicMaterial({ color: statusColor[f.status] }));
      m.position.set(r.x + f.x * r.w, elev(r) + Math.min(0.9, r.h - 0.3), r.y + f.y * r.d);
      m.userData = { type: "feature", id: f.id };
      three.add(m);
      pickables.unshift(m);
      featureMeshes.set(f.id, m);
    }

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 500);
    camera.position.set(cx + span * 0.9, maxY + span * 0.8, cz + span * 1.15);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(cx, (minFloorY + maxY) / 2, cz);
    controls.maxPolarAngle = Math.PI / 2 - 0.04;
    controls.update();

    const render = () => renderer.render(three, camera);
    const resize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h, false);
      renderer.domElement.style.width = "100%";
      renderer.domElement.style.height = "100%";
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      render();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    controls.addEventListener("change", render);

    // A click, not a drag: only pick when the pointer barely moved.
    const ray = new THREE.Raycaster();
    let down = { x: 0, y: 0 };
    const onDown = (e: PointerEvent) => (down = { x: e.clientX, y: e.clientY });
    const onUp = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
      const b = renderer.domElement.getBoundingClientRect();
      ray.setFromCamera(new THREE.Vector2(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1), camera);
      const hit = ray.intersectObjects(pickables, false)[0];
      setSelected(hit ? { type: hit.object.userData.type, id: hit.object.userData.id } : null);
    };
    renderer.domElement.addEventListener("pointerdown", onDown);
    renderer.domElement.addEventListener("pointerup", onUp);

    scene.current = { rooms: roomEdges, features: featureMeshes, colors, render };
    el.dataset.ready = "true";
    resize();

    return () => {
      el.dataset.ready = "";
      scene.current = null;
      ro.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", onDown);
      renderer.domElement.removeEventListener("pointerup", onUp);
      three.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => {
          (x as THREE.SpriteMaterial).map?.dispose();
          x.dispose();
        });
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [rooms, features, theme]);

  // Highlight the selection without rebuilding the scene.
  useEffect(() => {
    const s = scene.current;
    if (!s) return;
    for (const [id, edges] of s.rooms) (edges.material as THREE.LineBasicMaterial).color.set(selected?.type === "room" && selected.id === id ? s.colors.mint : s.colors.edge);
    for (const [id, mesh] of s.features) mesh.scale.setScalar(selected?.type === "feature" && selected.id === id ? 1.7 : 1);
    s.render();
  }, [selected, rooms, features, theme]);

  const room = selected?.type === "room" ? rooms.find((r) => r.id === selected.id) : undefined;
  const feature = selected?.type === "feature" ? features.find((f) => f.id === selected.id) : undefined;
  const featureRoom = feature ? rooms.find((r) => r.id === feature.roomId) : undefined;
  const ft = (m: number) => `${Math.round((m / FT) * 10) / 10} ft`;

  return (
    <div>
      <div
        ref={host}
        data-testid="property-viewer"
        role="img"
        aria-label="3D model of the property: rooms as boxes with features pinned inside. Drag to rotate, scroll to zoom, click a room or feature for details. The same information is listed below."
        className="h-[380px] w-full touch-none overflow-hidden rounded-[14px] border border-edge bg-graphite sm:h-[440px]"
      />
      {failed && <p className="mt-2 text-sm text-amber">The 3D view needs WebGL, which this browser doesn&apos;t have. The lists below show the same information.</p>}
      <div className="mt-3 min-h-[3.25rem] rounded-xl border border-edge bg-graphite px-4 py-3 text-sm" aria-live="polite">
        {feature ? (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-medium text-white">{feature.name}</span>
            <span className="text-mute">
              {FEATURE_LABELS[feature.kind]} in {featureRoom?.name ?? "a room"}
            </span>
            <Badge tone={feature.status === "working" ? "mint" : feature.status === "degraded" ? "amber" : "red"}>{STATUS_LABELS[feature.status]}</Badge>
            {feature.note && <span className="text-ash">{feature.note}</span>}
          </p>
        ) : room ? (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-medium text-white">{room.name}</span>
            <span className="text-mute">
              {ft(room.w)} by {ft(room.d)}, {ft(room.h)} ceiling, floor {room.floor}
            </span>
            <span className="text-ash">{features.filter((f) => f.roomId === room.id).length === 1 ? "1 feature" : `${features.filter((f) => f.roomId === room.id).length} features`}</span>
          </p>
        ) : (
          <p className="text-mute">Click a room or a dot. Green is working, amber needs attention, red is out of service.</p>
        )}
      </div>
    </div>
  );
}
