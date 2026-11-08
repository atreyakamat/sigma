import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { NodeId } from '@sigma/shared';
import { colorToCss } from '@sigma/document';
import { cssFont } from '@sigma/renderer';
import { useEditor } from '../editor-context';
import { useEditorValue } from '../hooks';

/**
 * Inline text editor: a textarea positioned over the text node in screen space. The node itself is
 * hidden from the renderer while editing; every keystroke updates the document (merged into one
 * undo step) so other UI stays in sync.
 */
export function TextEditOverlay({ nodeId, onClose }: { nodeId: NodeId; onClose: () => void }) {
  const editor = useEditor();
  const ref = useRef<HTMLTextAreaElement>(null);
  const mergeKey = useRef(`text:${nodeId}:${Date.now()}`);
  const node = useEditorValue((e) => e.graph.getNode(nodeId), ['change', 'document']);
  const zoomKey = useEditorValue(
    (e) => `${e.viewport.zoom}:${e.viewport.offsetX}:${e.viewport.offsetY}`,
    ['viewport'],
  );
  const [initial] = useState(() => (node?.type === 'TEXT' ? node.characters : ''));

  useEffect(() => {
    editor.hiddenNodeIds.add(nodeId);
    editor.requestRender();
    const ta = ref.current;
    ta?.focus();
    ta?.select();
    return () => {
      editor.hiddenNodeIds.delete(nodeId);
      editor.requestRender();
    };
  }, [editor, nodeId]);

  useLayoutEffect(() => {
    const ta = ref.current;
    if (ta) {
      ta.style.height = '0px';
      ta.style.height = `${ta.scrollHeight}px`;
    }
  });

  if (!node || node.type !== 'TEXT') return null;
  void zoomKey;

  const commit = () => {
    const text = ref.current?.value ?? '';
    if (text.trim() === '' && initial === '') {
      editor.history.undo();
      if (editor.graph.hasNode(nodeId)) editor.ops.deleteNodes([nodeId]);
    }
    editor.history.markBoundary();
    onClose();
  };

  const vp = editor.viewport;
  const wb = editor.graph.getWorldBounds(nodeId);
  const screen = vp.worldRectToScreen(wb);
  const s = node.textStyle;
  const zoom = vp.zoom;
  const fill = node.style.fills.find((f) => f.visible);
  const color = fill?.type === 'SOLID' ? colorToCss(fill.color, fill.opacity) : '#000';
  const autoWidth = node.autoResize === 'WIDTH_AND_HEIGHT';

  return (
    <textarea
      ref={ref}
      defaultValue={initial}
      spellCheck={false}
      className="absolute m-0 resize-none overflow-hidden border-0 bg-transparent p-0 outline-none"
      style={{
        left: screen.x,
        top: screen.y,
        width: autoWidth ? Math.max(screen.width, 20) + 40 : screen.width,
        minWidth: 20,
        font: cssFont(s, zoom),
        lineHeight: `${s.fontSize * s.lineHeight * zoom}px`,
        letterSpacing: `${s.letterSpacing * zoom}px`,
        color,
        textAlign: s.textAlign.toLowerCase() as 'left' | 'center' | 'right' | 'justify',
        textTransform:
          s.textTransform === 'NONE'
            ? 'none'
            : (s.textTransform.toLowerCase() as 'uppercase' | 'lowercase' | 'capitalize'),
        transform: `rotate(${node.transform.rotation}deg)`,
        transformOrigin: '0 0',
        whiteSpace: autoWidth ? 'pre' : 'pre-wrap',
        caretColor: '#2f6df6',
      }}
      onInput={(e) => editor.ops.setText(nodeId, e.currentTarget.value, mergeKey.current)}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          e.preventDefault();
          commit();
        }
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          commit();
        }
      }}
    />
  );
}
