import { useEditor } from '../editor/editor-context';
import { useDocumentRevision, useEditorValue } from '../editor/hooks';

/** Arrows between hotspots and their target frames, drawn as SVG over the canvas. */
export function ConnectionsLayer() {
  const editor = useEditor();
  const rev = useDocumentRevision();
  const vp = useEditorValue(
    (e) => `${e.viewport.zoom}:${e.viewport.offsetX}:${e.viewport.offsetY}`,
    ['viewport'],
  );
  void rev;
  void vp;
  const conns = editor.ops.prototypeConnections();
  if (conns.length === 0) return null;
  const start = editor.ops.flowStart();
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      aria-hidden
      data-testid="connections-layer"
    >
      <defs>
        <marker
          id="sigma-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="8"
          markerHeight="8"
          orient="auto-start-reverse"
        >
          <path d="M0 0L10 5L0 10z" fill="#8b5cf6" />
        </marker>
      </defs>
      {conns.map((c, i) => {
        const a = editor.viewport.worldRectToScreen(editor.graph.getWorldBounds(c.sourceId));
        const b = editor.viewport.worldRectToScreen(editor.graph.getWorldBounds(c.targetId));
        const x1 = a.x + a.width;
        const y1 = a.y + a.height / 2;
        const x2 = b.x;
        const y2 = b.y + Math.min(b.height / 2, 40);
        const dx = Math.max(40, Math.abs(x2 - x1) / 2);
        return (
          <path
            key={i}
            d={`M${x1} ${y1} C${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`}
            fill="none"
            stroke="#8b5cf6"
            strokeWidth="2"
            markerEnd="url(#sigma-arrow)"
          />
        );
      })}
      {start &&
        (() => {
          const s = editor.viewport.worldRectToScreen(editor.graph.getWorldBounds(start));
          return (
            <g>
              <circle cx={s.x - 14} cy={s.y + 20} r="8" fill="#8b5cf6" />
              <path
                d={`M${s.x - 17} ${s.y + 15} L${s.x - 9} ${s.y + 20} L${s.x - 17} ${s.y + 25} Z`}
                fill="#fff"
              />
            </g>
          );
        })()}
    </svg>
  );
}
