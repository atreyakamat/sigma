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
