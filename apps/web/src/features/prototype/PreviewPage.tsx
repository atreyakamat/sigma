import { ArrowLeft, ChevronLeft, ChevronRight, RotateCcw, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { SceneGraph, projectInstances } from '@sigma/document';
import type { Transition } from '@sigma/document';
import { exportPngDataUrl, PrototypeRuntime } from '@sigma/engine';
import type { PrototypeEffect } from '@sigma/engine';
import type { NodeId } from '@sigma/shared';
import { documentRepository } from '../../lib/api-document-repository';
import { errorText } from '../../lib/queries';

function easing(e: Transition['easing']): string {
  return { LINEAR: 'linear', EASE_IN: 'ease-in', EASE_OUT: 'ease-out', EASE_IN_OUT: 'ease-in-out' }[
    e
  ];
}

/** Interactive preview: renders screens as images and routes hotspot clicks through the runtime. */
export function PreviewPage() {
  const { documentId = '' } = useParams();
  const navigate = useNavigate();
  const [graph, setGraph] = useState<SceneGraph | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [anim, setAnim] = useState<{ effect: PrototypeEffect; prev: string | null } | null>(null);
  const rtRef = useRef<PrototypeRuntime | null>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const images = useRef(new Map<string, string>());

  useEffect(() => {
    void documentRepository
      .get(documentId)
      .then((doc) => {
        const g = SceneGraph.fromJSON(doc.content);
        projectInstances(g);
        setGraph(g);
        rtRef.current = new PrototypeRuntime(g);
      })
      .catch((e) => setError(errorText(e)));
  }, [documentId]);

  const rt = rtRef.current;
  const screenId = rt?.state.screenId ?? null;
  const overlayId = rt?.state.overlayId ?? null;
  const render = (id: NodeId | null): string | null => {
    if (!graph || !id) return null;
    const cached = images.current.get(id);
    if (cached) return cached;
    const url = exportPngDataUrl(graph, [id], {
      scale: Math.min(2, window.devicePixelRatio || 1),
      background: '#ffffff',
    });
    images.current.set(id, url);
    return url;
  };
  const screen = graph && screenId ? graph.getNode(screenId) : null;
  const scale = useMemo(() => {
    if (!screen) return 1;
    const availW = window.innerWidth - 48;
    const availH = window.innerHeight - 120;
    return Math.min(1, availW / screen.size.width, availH / screen.size.height);
  }, [screen]);

  useEffect(() => {
    if (!rt || !screenId) return;
    const timers = rt
      .timed()
      .map(({ effect, delayMs }) => setTimeout(() => apply(effect), delayMs));
    return () => timers.forEach(clearTimeout);
  }, [screenId]);

  const apply = (effect: PrototypeEffect | null) => {
    if (!effect) return;
    if (effect.kind === 'openUrl') {
      window.open(effect.url, '_blank', 'noopener');
      return;
    }
    if (
      'transition' in effect &&
      effect.transition.type !== 'INSTANT' &&
      effect.kind === 'navigate'
    ) {
      setAnim({ effect, prev: effect.from ? render(effect.from) : null });
      setTimeout(() => setAnim(null), effect.transition.durationMs + 50);
    }
    setTick((t) => t + 1);
  };

  const onPointer = (kind: 'CLICK' | 'HOVER') => (e: React.MouseEvent) => {
    if (!rt || !frameRef.current) return;
    const r = frameRef.current.getBoundingClientRect();
    const point = { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
    if (kind === 'CLICK' && overlayId) {
      // Click outside the overlay closes it when allowed.
      const ov = graph?.getNode(overlayId);
      const ovBounds = ov
        ? {
            x: (screen!.size.width - ov.size.width) / 2,
            y: (screen!.size.height - ov.size.height) / 2,
            w: ov.size.width,
            h: ov.size.height,
          }
        : null;
      const inside =
        ovBounds &&
        point.x >= ovBounds.x &&
        point.x <= ovBounds.x + ovBounds.w &&
        point.y >= ovBounds.y &&
        point.y <= ovBounds.y + ovBounds.h;
      if (!inside) {
        apply(rt.closeOverlay());
        return;
      }
      apply(rt.trigger('CLICK', { x: point.x - ovBounds!.x, y: point.y - ovBounds!.y }));
      return;
    }
    apply(rt.trigger(kind, point));
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!rt) return;
      if (e.key === 'Escape') void navigate(`/file/${documentId}`);
      else if (e.key === 'ArrowLeft') apply(rt.back());
      else apply(rt.trigger('KEY', { x: 1, y: 1 }, e.key));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rt, documentId]);

  if (error)
    return <div className="flex h-full items-center justify-center text-ink-300">{error}</div>;
  if (!graph || !rt)
    return (
      <div className="flex h-full items-center justify-center text-ink-400">Loading preview…</div>
    );
  const screens = rt.screens();
  const index = screens.findIndex((s) => s.id === screenId);
  const url = render(screenId);
  const hotspots = rt.hotspots(screenId);
  const overlayUrl = overlayId ? render(overlayId) : null;
  const overlay = overlayId ? graph.getNode(overlayId) : null;
  void tick;

  const slideFrom = anim && anim.effect.kind === 'navigate' ? anim.effect.transition : null;
  const animStyle: React.CSSProperties = slideFrom
    ? {
        animation: `${{ DISSOLVE: 'sigma-fade', SLIDE_LEFT: 'sigma-slide-left', PUSH_LEFT: 'sigma-slide-left', SLIDE_RIGHT: 'sigma-slide-right', PUSH_RIGHT: 'sigma-slide-right', SLIDE_UP: 'sigma-slide-up', SLIDE_DOWN: 'sigma-slide-down', SMART: 'sigma-fade', INSTANT: 'none' }[slideFrom.type]} ${slideFrom.durationMs}ms ${easing(slideFrom.easing)} both`,
      }
    : {};

  return (
    <div className="flex h-full flex-col bg-ink-950 text-ink-100">
      <style>{`@keyframes sigma-fade{from{opacity:0}to{opacity:1}}@keyframes sigma-slide-left{from{transform:translateX(100%)}to{transform:none}}@keyframes sigma-slide-right{from{transform:translateX(-100%)}to{transform:none}}@keyframes sigma-slide-up{from{transform:translateY(100%)}to{transform:none}}@keyframes sigma-slide-down{from{transform:translateY(-100%)}to{transform:none}}`}</style>
      <header className="flex h-12 items-center justify-between border-b border-ink-700 px-3 text-[12px]">
        <button
          className="flex items-center gap-1 rounded px-2 py-1 hover:bg-ink-700"
          onClick={() => void navigate(`/file/${documentId}`)}
        >
          <ArrowLeft size={14} /> Back to editor
        </button>
        <div className="flex items-center gap-1">
          <button
            className="icon-btn"
            title="Previous screen"
            onClick={() => screens[index - 1] && apply(rt.goTo(screens[index - 1]!.id))}
          >
            <ChevronLeft size={15} />
          </button>
          <span data-testid="preview-screen-name">
            {screen?.name ?? 'No frames'} {screens.length ? `(${index + 1}/${screens.length})` : ''}
          </span>
          <button
            className="icon-btn"
            title="Next screen"
            onClick={() => screens[index + 1] && apply(rt.goTo(screens[index + 1]!.id))}
          >
            <ChevronRight size={15} />
          </button>
          <button
            className="icon-btn"
            title="Restart flow"
            onClick={() => {
              rtRef.current = new PrototypeRuntime(graph);
              setTick((t) => t + 1);
            }}
          >
            <RotateCcw size={14} />
          </button>
        </div>
        <span className="text-ink-500">Esc to exit · ← back</span>
      </header>
      <main className="flex flex-1 items-center justify-center overflow-hidden p-6">
        {screen && url ? (
          <div
            ref={frameRef}
            className="relative overflow-hidden rounded-lg shadow-2xl ring-1 ring-ink-700"
            style={{
              width: screen.size.width * scale,
              height: screen.size.height * scale,
              background: '#fff',
            }}
            onClick={onPointer('CLICK')}
            onMouseMove={onPointer('HOVER')}
            data-testid="preview-frame"
          >
            {anim?.prev && (
              <img src={anim.prev} alt="" className="absolute inset-0 h-full w-full" />
            )}
            <img
              src={url}
              alt={screen.name}
              className="absolute inset-0 h-full w-full select-none"
              draggable={false}
              style={animStyle}
            />
            {hotspots.map((h) => (
              <div
                key={h.id}
                className="absolute rounded-sm"
                data-testid="hotspot"
                style={{
                  left: h.bounds.x * scale,
                  top: h.bounds.y * scale,
                  width: h.bounds.width * scale,
                  height: h.bounds.height * scale,
                  cursor: 'pointer',
                }}
              />
            ))}
            {overlay && overlayUrl && (
              <div className="absolute inset-0 bg-black/30" data-testid="preview-overlay">
                <img
                  src={overlayUrl}
                  alt={overlay.name}
                  className="absolute shadow-2xl"
                  draggable={false}
                  style={{
                    left: ((screen.size.width - overlay.size.width) / 2) * scale,
                    top: ((screen.size.height - overlay.size.height) / 2) * scale,
                    width: overlay.size.width * scale,
                    height: overlay.size.height * scale,
                  }}
                />
                <button
                  className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white"
                  onClick={(e) => {
                    e.stopPropagation();
                    apply(rt.closeOverlay());
                  }}
                >
                  <X size={14} />
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="text-ink-400">Add a frame to the page to preview it.</div>
        )}
      </main>
    </div>
  );
}
