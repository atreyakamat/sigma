import { describe, expect, it } from 'vitest';
import { Editor } from '@sigma/engine';
import { registerDefaultTools } from '@sigma/tools';
import { buildCommands, FRAME_PRESETS, fuzzyScore } from '../commands';
import { CHECKLIST_STEPS, useOnboarding } from '../../onboarding/store';

function host(readOnly = false) {
  return {
    openExport() {},
    openShortcuts() {},
    openHistory() {},
    openVersions() {},
    saveCheckpoint() {},
    importSvg() {},
    openPreview() {},
    togglePrototypeMode() {},
    readOnly,
  };
}

describe('command palette registry', () => {
  it('lists tools, presets and operations; read-only keeps only safe commands', () => {
    const editor = new Editor();
    const tools = registerDefaultTools(editor);
    const all = buildCommands(editor, tools, host());
    expect(all.some((c) => c.id === 'tool:rectangle')).toBe(true);
    expect(all.filter((c) => c.id.startsWith('frame:'))).toHaveLength(FRAME_PRESETS.length);
    const ro = buildCommands(editor, tools, host(true));
    expect(ro.some((c) => c.id === 'tool:rectangle')).toBe(false);
    expect(ro.some((c) => c.id === 'tool:hand')).toBe(true);
    expect(ro.find((c) => c.id === 'delete')?.enabled?.()).toBe(false);
  });

  it('runs a preset command and creates a centered frame', () => {
    const editor = new Editor();
    editor.viewport.setSize(1000, 1000);
    const tools = registerDefaultTools(editor);
    const cmd = buildCommands(editor, tools, host()).find((c) => c.id === 'frame:Desktop')!;
    cmd.run();
    const frame = editor.graph.getChildren(editor.currentPageId!)[0]!;
    expect(frame.type).toBe('FRAME');
    expect(frame.size).toEqual({ width: 1440, height: 1024 });
    expect(editor.defaults.frameSize).toEqual({ width: 1440, height: 1024 });
  });

  it('boolean commands need two selected nodes and produce a vector', () => {
    const editor = new Editor();
    const tools = registerDefaultTools(editor);
    const cmds = buildCommands(editor, tools, host());
    const union = cmds.find((c) => c.id === 'bool-union')!;
    expect(union.enabled?.()).toBe(false);
    const a = editor.ops.createNode('RECTANGLE', { size: { width: 10, height: 10 } });
    const b = editor.ops.createNode('RECTANGLE', {
      transform: { x: 5, y: 5, rotation: 0, scaleX: 1, scaleY: 1 },
      size: { width: 10, height: 10 },
    });
    editor.selection.set([a, b]);
    expect(union.enabled?.()).toBe(true);
    union.run();
    expect(editor.graph.getNode(editor.selection.first!)?.type).toBe('VECTOR');
  });

  it('component commands create masters, instances can be detached', () => {
    const editor = new Editor();
    const tools = registerDefaultTools(editor);
    const cmds = buildCommands(editor, tools, host());
    const a = editor.ops.createNode('RECTANGLE', { size: { width: 10, height: 10 } });
    editor.selection.set([a]);
    cmds.find((c) => c.id === 'create-component')!.run();
    const master = editor.selection.first!;
    expect(editor.graph.getNode(master)?.type).toBe('COMPONENT');
    const inst = editor.ops.createInstance(master, editor.currentPageId, { x: 100, y: 100 });
    editor.selection.set([inst]);
    expect(cmds.find((c) => c.id === 'detach')!.enabled?.()).toBe(true);
    cmds.find((c) => c.id === 'detach')!.run();
    expect(editor.graph.hasNode(inst)).toBe(false);
    expect(editor.graph.getNode(editor.selection.first!)?.type).toBe('FRAME');
  });

  it('auto layout command toggles layout on frames', () => {
    const editor = new Editor();
    const tools = registerDefaultTools(editor);
    const cmd = buildCommands(editor, tools, host()).find((c) => c.id === 'auto-layout')!;
    const frame = editor.ops.createNode('FRAME', { size: { width: 100, height: 100 } });
    editor.ops.createNode('RECTANGLE', { size: { width: 10, height: 10 } }, frame);
    editor.selection.set([frame]);
    expect(cmd.enabled?.()).toBe(true);
    cmd.run();
    expect((editor.graph.getNode(frame) as { layout: { mode: string } }).layout.mode).toBe(
      'VERTICAL',
    );
    expect(editor.graph.getNode(frame)?.size).toEqual({ width: 10, height: 10 });
  });

  it('fuzzy matches substrings first, then subsequences', () => {
    expect(fuzzyScore('zoom', 'Zoom to fit')).toBe(0);
    expect(fuzzyScore('ztf', 'Zoom to fit')).toBeGreaterThanOrEqual(100);
    expect(fuzzyScore('xyz', 'Zoom to fit')).toBeNull();
    expect(fuzzyScore('', 'anything')).toBe(0);
  });
});

describe('onboarding store', () => {
  it('tracks steps per user, shows hints once and persists', () => {
    const s = useOnboarding.getState();
    s.load('user-1');
    s.complete('frame');
    s.complete('frame');
    expect(useOnboarding.getState().done.size).toBe(1);
    s.showHint('rotate');
    expect(useOnboarding.getState().activeHint?.id).toBe('rotate');
    s.closeHint();
    s.showHint('rotate');
    expect(useOnboarding.getState().activeHint).toBeNull();
    s.load('user-2');
    expect(useOnboarding.getState().done.size).toBe(0);
    s.load('user-1');
    expect(useOnboarding.getState().done.has('frame')).toBe(true);
    expect(useOnboarding.getState().seenHints.has('rotate')).toBe(true);
    expect(CHECKLIST_STEPS.length).toBe(6);
  });
});
