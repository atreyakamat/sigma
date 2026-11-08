import type { NodeId } from '@sigma/shared';
import { createNodeId } from '@sigma/shared';
import type { NodeProps, NodePropsInputOf, NodePropsOf, NodeType } from './schema';
import { CONTAINER_TYPES, NodePropsSchema } from './schema';
import { COLORS } from './color';

/** A node as held in the scene graph: its props plus hierarchy links. */
export type SceneNode = NodeProps & {
  readonly id: NodeId;
  readonly parentId: NodeId | null;
  readonly childIds: readonly NodeId[];
};
export type SceneNodeOf<T extends NodeType> = Extract<SceneNode, { type: T }>;

export function isContainer(node: Pick<SceneNode, 'type'>): boolean {
  return CONTAINER_TYPES.has(node.type);
}

export type NodeDefaults<T extends NodeType> = Partial<Omit<NodePropsInputOf<T>, 'type' | 'id'>> & {
  id?: string;
};

const DEFAULT_NAMES: Record<NodeType, string> = {
  PAGE: 'Page',
  FRAME: 'Frame',
  GROUP: 'Group',
  RECTANGLE: 'Rectangle',
  ELLIPSE: 'Ellipse',
  LINE: 'Line',
  POLYGON: 'Polygon',
  STAR: 'Star',
  TEXT: 'Text',
  IMAGE: 'Image',
  VECTOR: 'Vector',
};

/**
 * Creates fully-defaulted node props of a given type. Validated through the schema so that every
 * node in the graph is guaranteed to satisfy it.
 */
export function createNodeProps<T extends NodeType>(
  type: T,
  props: NodeDefaults<T> = {},
): NodePropsOf<T> {
  const id = props.id ?? createNodeId();
  const base: Record<string, unknown> = {
    ...props,
    id,
    type,
    name: props.name ?? DEFAULT_NAMES[type],
  };

  if (!('style' in props)) {
    switch (type) {
      case 'FRAME':
        base.style = { fills: [{ type: 'SOLID', color: COLORS.defaultFrame }] };
        break;
      case 'RECTANGLE':
      case 'ELLIPSE':
      case 'POLYGON':
      case 'STAR':
        base.style = { fills: [{ type: 'SOLID', color: COLORS.defaultFill }] };
        break;
      case 'LINE':
      case 'VECTOR':
        base.style = {
          strokes: [{ paint: { type: 'SOLID', color: COLORS.black }, width: 1, align: 'CENTER' }],
        };
        break;
      case 'TEXT':
        base.style = { fills: [{ type: 'SOLID', color: COLORS.black }] };
        break;
      default:
        break;
    }
  }
  if (type === 'IMAGE' && !('image' in props)) {
    base.image = { type: 'IMAGE' };
  }
  return NodePropsSchema.parse(base) as NodePropsOf<T>;
}

export function defaultNodeName(type: NodeType): string {
  return DEFAULT_NAMES[type];
}
