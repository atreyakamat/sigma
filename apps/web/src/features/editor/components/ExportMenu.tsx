import { useEffect, useRef, useState } from 'react';
import { downloadBlob, exportPng } from '@sigma/engine';
import { exportSvg, serializeDocument } from '@sigma/import-export';
import type { NodeId } from '@sigma/shared';
import { useEditor, useEditorContext } from '../editor-context';
import { pdfExportPath } from '../../../lib/export-urls';
import { toast } from '../../../components/ui/toast';
import { useSelectionIds } from '../hooks';

export function ExportMenu({ onClose }: { onClose: () => void }) {
  const editor = useEditor();
  const { meta, shared = false } = useEditorContext();
  const selection = useSelectionIds();
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(2);
  const [busy, setBusy] = useState(false);
  const [scope, setScope] = useState<'selection' | 'page'>(selection.length ? 'selection' : 'page');

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [onClose]);

  const targetIds = (): NodeId[] =>
    scope === 'selection' && selection.length ? [...selection] : [editor.currentPageId as NodeId];
  const baseName = () => {
    const ids = targetIds();
    const node = ids.length === 1 ? editor.graph.getNode(ids[0] as NodeId) : null;
    return (
      (node && node.type !== 'PAGE' ? node.name : editor.graph.name).replace(/[^\w.-]+/g, '_') ||
      'export'
    );
  };

  const doPng = async () => {
    setBusy(true);
    try {
      const blob = await exportPng(editor.graph, targetIds(), {
        scale,
        background: scope === 'page' ? '#ffffff' : null,
        images: editor.images,
      });
      downloadBlob(blob, `${baseName()}@${scale}x.png`);
    } finally {
      setBusy(false);
      onClose();
    }
  };
  const doSvg = () => {
    const svg = exportSvg(editor.graph, targetIds(), { prolog: true });
    downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${baseName()}.svg`);
    onClose();
  };
  const doPdf = async () => {
    setBusy(true);
    try {
      const ids = targetIds();
      const single = ids.length === 1 ? editor.graph.getNode(ids[0] as NodeId) : null;
      const frame = single && single.type !== 'PAGE' ? single.id : null;
      const res = await fetch(pdfExportPath(meta.documentId, scale, frame), {
        credentials: 'include',
      });
      if (!res.ok)
        throw new Error((await res.json().catch(() => ({ message: res.statusText }))).message);
      downloadBlob(await res.blob(), `${baseName()}.pdf`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'PDF export failed');
    } finally {
      setBusy(false);
      onClose();
    }
  };
  const doJson = () => {
    downloadBlob(
      new Blob([serializeDocument(editor.toJSON())], { type: 'application/json' }),
      `${editor.graph.name.replace(/[^\w.-]+/g, '_')}.sigma.json`,
    );
    onClose();
  };

  return (
    <div
      ref={ref}
      className="absolute right-0 top-9 z-20 w-64 rounded-md border border-ink-600 bg-ink-800 p-3 shadow-2xl"
    >
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
        Export
      </div>
      <div className="mb-2 flex gap-1 rounded-md bg-ink-750 p-0.5">
        {(['selection', 'page'] as const).map((s) => (
          <button
            key={s}
            disabled={s === 'selection' && selection.length === 0}
            onClick={() => setScope(s)}
            className={`flex-1 rounded px-2 py-1 text-[11px] capitalize disabled:opacity-40 ${scope === s ? 'bg-ink-600 text-ink-100' : 'text-ink-300'}`}
          >
            {s}
          </button>
        ))}
      </div>
      <label className="mb-2 flex items-center justify-between text-[12px]">
        <span className="text-ink-300">PNG scale</span>
        <select
          className="field h-6 w-20"
          value={scale}
          onChange={(e) => setScale(Number(e.target.value))}
        >
          {[0.5, 1, 2, 3, 4].map((s) => (
            <option key={s} value={s}>
              {s}x
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-col gap-1">
        <button
          className="rounded-md bg-accent-500 px-2 py-1.5 text-[12px] font-medium text-white hover:bg-accent-400 disabled:opacity-50"
          disabled={busy}
          onClick={() => void doPng()}
        >
          Download PNG
        </button>
        <button
          className="rounded-md bg-ink-700 px-2 py-1.5 text-[12px] font-medium hover:bg-ink-600"
          onClick={doSvg}
        >
          Download SVG
        </button>
        {!shared && (
          <button
            className="rounded-md bg-ink-700 px-2 py-1.5 text-[12px] font-medium hover:bg-ink-600 disabled:opacity-50"
            disabled={busy}
            onClick={() => void doPdf()}
            data-testid="download-pdf"
          >
            Download PDF
          </button>
        )}
        <button
          className="rounded-md bg-ink-700 px-2 py-1.5 text-[12px] font-medium hover:bg-ink-600"
          onClick={doJson}
        >
          Download .sigma.json
        </button>
      </div>
    </div>
  );
}
