import type { Editor, EditorTool } from '@sigma/engine';
import { HandTool } from './hand-tool';
import { ImageTool } from './image-tool';
import { SelectTool } from './select-tool';
import {
  EllipseTool,
  FrameTool,
  LineTool,
  PolygonTool,
  RectangleTool,
  StarTool,
} from './shape-tool';
import { TextTool } from './text-tool';
import { PenTool } from './pen-tool';
import { PencilTool } from './pencil-tool';
import { VectorEditTool } from './vector-edit-tool';

export * from './base-tool';
export * from './hand-tool';
export * from './select-tool';
export * from './shape-tool';
export * from './text-tool';
export * from './image-tool';
export * from './pen-tool';
export * from './pencil-tool';
export * from './vector-edit-tool';

export interface DefaultTools {
  select: SelectTool;
  hand: HandTool;
  frame: FrameTool;
  rectangle: RectangleTool;
  ellipse: EllipseTool;
  line: LineTool;
  polygon: PolygonTool;
  star: StarTool;
  text: TextTool;
  image: ImageTool;
  pen: PenTool;
  pencil: PencilTool;
  vectorEdit: VectorEditTool;
}

/** Registers the default tool set, binds their shortcuts, and activates the select tool. */
export function registerDefaultTools(editor: Editor): DefaultTools {
  const tools: DefaultTools = {
    select: new SelectTool(editor),
    hand: new HandTool(editor),
    frame: new FrameTool(editor),
    rectangle: new RectangleTool(editor),
    ellipse: new EllipseTool(editor),
    line: new LineTool(editor),
    polygon: new PolygonTool(editor),
    star: new StarTool(editor),
    text: new TextTool(editor),
    image: new ImageTool(editor),
    pen: new PenTool(editor),
    pencil: new PencilTool(editor),
    vectorEdit: new VectorEditTool(editor),
  };
  for (const tool of Object.values(tools) as EditorTool[]) {
    editor.tools.register(tool);
    if (tool.shortcut)
      editor.keymap.register(
        tool.shortcut,
        () => editor.tools.activate(tool.id),
        `${tool.name} tool`,
      );
  }
  editor.tools.activate('select');
  return tools;
}
