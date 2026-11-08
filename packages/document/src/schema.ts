/**
 * SIGMA document schema (schemaVersion 1).
 *
 * Two shapes of the same data exist:
 *  - JSON (serialized): pages contain nested `children` arrays. This is the persisted format.
 *  - Scene (in memory): a flat map of nodes with `parentId` / `childIds`. See scene-graph.ts.
 *
 * Every schema here is strict: unknown keys are rejected so that silent data loss cannot occur.
 */
import { z } from 'zod';

export const SCHEMA_VERSION = 1;

/* ----------------------------------------------------------------------------------------------
 * Primitive building blocks
 * -------------------------------------------------------------------------------------------- */

export const ColorSchema = z
  .object({
    r: z.number().min(0).max(1),
    g: z.number().min(0).max(1),
    b: z.number().min(0).max(1),
    a: z.number().min(0).max(1).default(1),
  })
  .strict();
export type Color = z.infer<typeof ColorSchema>;

export const GradientStopSchema = z
  .object({ position: z.number().min(0).max(1), color: ColorSchema })
  .strict();
export type GradientStop = z.infer<typeof GradientStopSchema>;

export const SolidPaintSchema = z
  .object({
    type: z.literal('SOLID'),
    color: ColorSchema,
    opacity: z.number().min(0).max(1).default(1),
    visible: z.boolean().default(true),
  })
  .strict();

export const LinearGradientPaintSchema = z
  .object({
    type: z.literal('LINEAR_GRADIENT'),
    /** Start/end points in unit space (0..1 of the node's bounds). */
    start: z.object({ x: z.number(), y: z.number() }).strict(),
    end: z.object({ x: z.number(), y: z.number() }).strict(),
    stops: z.array(GradientStopSchema).min(2),
    opacity: z.number().min(0).max(1).default(1),
    visible: z.boolean().default(true),
  })
  .strict();

export const RadialGradientPaintSchema = z
  .object({
    type: z.literal('RADIAL_GRADIENT'),
    center: z.object({ x: z.number(), y: z.number() }).strict(),
    /** Radius in unit space relative to the larger side. */
    radius: z.number().min(0),
    stops: z.array(GradientStopSchema).min(2),
    opacity: z.number().min(0).max(1).default(1),
    visible: z.boolean().default(true),
  })
  .strict();

export const ImagePaintSchema = z
  .object({
    type: z.literal('IMAGE'),
    /** Reference to an asset (object-storage id) or an inline data URL for unsaved images. */
    assetId: z.string().nullable().default(null),
    src: z.string().nullable().default(null),
    scaleMode: z.enum(['FILL', 'FIT', 'STRETCH', 'TILE']).default('FILL'),
    opacity: z.number().min(0).max(1).default(1),
    visible: z.boolean().default(true),
  })
  .strict();

export const PaintSchema = z.discriminatedUnion('type', [
  SolidPaintSchema,
  LinearGradientPaintSchema,
  RadialGradientPaintSchema,
  ImagePaintSchema,
]);
export type Paint = z.infer<typeof PaintSchema>;
export type SolidPaint = z.infer<typeof SolidPaintSchema>;
export type LinearGradientPaint = z.infer<typeof LinearGradientPaintSchema>;
export type RadialGradientPaint = z.infer<typeof RadialGradientPaintSchema>;
export type ImagePaint = z.infer<typeof ImagePaintSchema>;

export const StrokeAlignSchema = z.enum(['INSIDE', 'CENTER', 'OUTSIDE']);
export type StrokeAlign = z.infer<typeof StrokeAlignSchema>;

export const StrokeSchema = z
  .object({
    paint: PaintSchema,
    width: z.number().min(0).default(1),
    align: StrokeAlignSchema.default('INSIDE'),
    cap: z.enum(['BUTT', 'ROUND', 'SQUARE']).default('BUTT'),
    join: z.enum(['MITER', 'ROUND', 'BEVEL']).default('MITER'),
    dashPattern: z.array(z.number().min(0)).default([]),
    visible: z.boolean().default(true),
  })
  .strict();
export type Stroke = z.infer<typeof StrokeSchema>;

export const DropShadowEffectSchema = z
  .object({
    type: z.literal('DROP_SHADOW'),
    color: ColorSchema,
    offset: z.object({ x: z.number(), y: z.number() }).strict(),
    blur: z.number().min(0),
    spread: z.number().default(0),
    visible: z.boolean().default(true),
  })
  .strict();

export const LayerBlurEffectSchema = z
  .object({
    type: z.literal('LAYER_BLUR'),
    radius: z.number().min(0),
    visible: z.boolean().default(true),
  })
  .strict();

export const EffectSchema = z.discriminatedUnion('type', [
  DropShadowEffectSchema,
  LayerBlurEffectSchema,
]);
export type Effect = z.infer<typeof EffectSchema>;

export const BlendModeSchema = z.enum([
  'NORMAL',
  'MULTIPLY',
  'SCREEN',
  'OVERLAY',
  'DARKEN',
  'LIGHTEN',
  'COLOR_DODGE',
  'COLOR_BURN',
  'HARD_LIGHT',
  'SOFT_LIGHT',
  'DIFFERENCE',
  'EXCLUSION',
  'HUE',
  'SATURATION',
  'COLOR',
  'LUMINOSITY',
]);
export type BlendMode = z.infer<typeof BlendModeSchema>;

/** Corner radius: a single value or [topLeft, topRight, bottomRight, bottomLeft]. */
export const CornerRadiusSchema = z.union([
  z.number().min(0),
  z.tuple([z.number().min(0), z.number().min(0), z.number().min(0), z.number().min(0)]),
]);
export type CornerRadius = z.infer<typeof CornerRadiusSchema>;

export const StyleSchema = z
  .object({
    fills: z.array(PaintSchema).default([]),
    strokes: z.array(StrokeSchema).default([]),
    effects: z.array(EffectSchema).default([]),
    opacity: z.number().min(0).max(1).default(1),
    blendMode: BlendModeSchema.default('NORMAL'),
    cornerRadius: CornerRadiusSchema.default(0),
  })
  .strict();
export type Style = z.infer<typeof StyleSchema>;

export const TransformSchema = z
  .object({
    x: z.number().default(0),
    y: z.number().default(0),
    /** Degrees, clockwise. */
    rotation: z.number().default(0),
    scaleX: z.number().default(1),
    scaleY: z.number().default(1),
  })
  .strict();
export type Transform = z.infer<typeof TransformSchema>;

export const SizeSchema = z
  .object({ width: z.number().min(0), height: z.number().min(0) })
  .strict();
export type Size = z.infer<typeof SizeSchema>;

export const TextStyleSchema = z
  .object({
    fontFamily: z.string().default('Inter'),
    fontSize: z.number().positive().default(16),
    fontWeight: z.number().int().min(100).max(900).default(400),
    fontStyle: z.enum(['NORMAL', 'ITALIC']).default('NORMAL'),
    /** Multiplier of font size (1.2 = 120%). */
    lineHeight: z.number().positive().default(1.2),
    /** In pixels. */
    letterSpacing: z.number().default(0),
    textAlign: z.enum(['LEFT', 'CENTER', 'RIGHT', 'JUSTIFY']).default('LEFT'),
    verticalAlign: z.enum(['TOP', 'MIDDLE', 'BOTTOM']).default('TOP'),
    textDecoration: z.enum(['NONE', 'UNDERLINE', 'STRIKETHROUGH']).default('NONE'),
    textTransform: z.enum(['NONE', 'UPPERCASE', 'LOWERCASE', 'CAPITALIZE']).default('NONE'),
  })
  .strict();
export type TextStyle = z.infer<typeof TextStyleSchema>;

export const PathCommandSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('M'), x: z.number(), y: z.number() }).strict(),
  z.object({ type: z.literal('L'), x: z.number(), y: z.number() }).strict(),
  z
    .object({
      type: z.literal('C'),
      x1: z.number(),
      y1: z.number(),
      x2: z.number(),
      y2: z.number(),
      x: z.number(),
      y: z.number(),
    })
    .strict(),
  z.object({ type: z.literal('Z') }).strict(),
]);
export type PathCommand = z.infer<typeof PathCommandSchema>;

export const ConstraintsSchema = z
  .object({
    horizontal: z.enum(['LEFT', 'RIGHT', 'CENTER', 'STRETCH', 'SCALE']).default('LEFT'),
    vertical: z.enum(['TOP', 'BOTTOM', 'CENTER', 'STRETCH', 'SCALE']).default('TOP'),
  })
  .strict();
export type Constraints = z.infer<typeof ConstraintsSchema>;

/* ----------------------------------------------------------------------------------------------
 * Nodes
 * -------------------------------------------------------------------------------------------- */

export const NODE_TYPES = [
  'PAGE',
  'FRAME',
  'GROUP',
  'RECTANGLE',
  'ELLIPSE',
  'LINE',
  'POLYGON',
  'STAR',
  'TEXT',
  'IMAGE',
  'VECTOR',
] as const;
export const NodeTypeSchema = z.enum(NODE_TYPES);
export type NodeType = z.infer<typeof NodeTypeSchema>;

/** Node types that may own children. */
export const CONTAINER_TYPES: ReadonlySet<NodeType> = new Set(['PAGE', 'FRAME', 'GROUP']);

const baseProps = {
  id: z.string().min(1),
  name: z.string().default(''),
  visible: z.boolean().default(true),
  locked: z.boolean().default(false),
  transform: TransformSchema.default({ x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1 }),
  size: SizeSchema.default({ width: 0, height: 0 }),
  style: StyleSchema.prefault({}),
  constraints: ConstraintsSchema.prefault({}),
  metadata: z.record(z.string(), z.unknown()).default({}),
};

/** Per-type properties, exclusive of hierarchy fields. */
export const PagePropsSchema = z
  .object({
    ...baseProps,
    type: z.literal('PAGE'),
    backgroundColor: ColorSchema.default({ r: 0.96, g: 0.96, b: 0.96, a: 1 }),
  })
  .strict();
export const FramePropsSchema = z
  .object({ ...baseProps, type: z.literal('FRAME'), clipsContent: z.boolean().default(true) })
  .strict();
export const GroupPropsSchema = z.object({ ...baseProps, type: z.literal('GROUP') }).strict();
export const RectanglePropsSchema = z
  .object({ ...baseProps, type: z.literal('RECTANGLE') })
  .strict();
export const EllipsePropsSchema = z.object({ ...baseProps, type: z.literal('ELLIPSE') }).strict();
export const LinePropsSchema = z.object({ ...baseProps, type: z.literal('LINE') }).strict();
export const PolygonPropsSchema = z
  .object({
    ...baseProps,
    type: z.literal('POLYGON'),
    pointCount: z.number().int().min(3).default(3),
  })
  .strict();
export const StarPropsSchema = z
  .object({
    ...baseProps,
    type: z.literal('STAR'),
    pointCount: z.number().int().min(3).default(5),
    innerRadius: z.number().min(0).max(1).default(0.382),
  })
  .strict();
export const TextPropsSchema = z
  .object({
    ...baseProps,
    type: z.literal('TEXT'),
    characters: z.string().default(''),
    textStyle: TextStyleSchema.prefault({}),
    autoResize: z.enum(['WIDTH_AND_HEIGHT', 'HEIGHT', 'NONE']).default('WIDTH_AND_HEIGHT'),
  })
  .strict();
export const ImagePropsSchema = z
  .object({
    ...baseProps,
    type: z.literal('IMAGE'),
    image: ImagePaintSchema,
  })
  .strict();
export const VectorPropsSchema = z
  .object({ ...baseProps, type: z.literal('VECTOR'), path: z.array(PathCommandSchema).default([]) })
  .strict();

export const NodePropsSchema = z.discriminatedUnion('type', [
  PagePropsSchema,
  FramePropsSchema,
  GroupPropsSchema,
  RectanglePropsSchema,
  EllipsePropsSchema,
  LinePropsSchema,
  PolygonPropsSchema,
  StarPropsSchema,
  TextPropsSchema,
  ImagePropsSchema,
  VectorPropsSchema,
]);

/** A node's own properties, independent of where it sits in the hierarchy. */
export type NodeProps = z.infer<typeof NodePropsSchema>;
/** Input shape accepted when creating nodes: defaulted fields are optional. */
export type NodePropsInput = z.input<typeof NodePropsSchema>;
export type NodePropsInputOf<T extends NodeType> = Extract<NodePropsInput, { type: T }>;
export type NodePropsOf<T extends NodeType> = Extract<NodeProps, { type: T }>;
export type PageProps = NodePropsOf<'PAGE'>;
export type FrameProps = NodePropsOf<'FRAME'>;
export type GroupProps = NodePropsOf<'GROUP'>;
export type RectangleProps = NodePropsOf<'RECTANGLE'>;
export type EllipseProps = NodePropsOf<'ELLIPSE'>;
export type LineProps = NodePropsOf<'LINE'>;
export type PolygonProps = NodePropsOf<'POLYGON'>;
export type StarProps = NodePropsOf<'STAR'>;
export type TextProps = NodePropsOf<'TEXT'>;
export type ImageProps = NodePropsOf<'IMAGE'>;
export type VectorProps = NodePropsOf<'VECTOR'>;

/* ----------------------------------------------------------------------------------------------
 * Serialized (nested) format
 * -------------------------------------------------------------------------------------------- */

export type NodeJSON = NodeProps & { children?: NodeJSON[] };

const NodeJSONSchema: z.ZodType<NodeJSON> = z.lazy(() =>
  z
    .discriminatedUnion('type', [
      PagePropsSchema.extend({ children: z.array(NodeJSONSchema).default([]) }).strict(),
      FramePropsSchema.extend({ children: z.array(NodeJSONSchema).default([]) }).strict(),
      GroupPropsSchema.extend({ children: z.array(NodeJSONSchema).default([]) }).strict(),
      RectanglePropsSchema,
      EllipsePropsSchema,
      LinePropsSchema,
      PolygonPropsSchema,
      StarPropsSchema,
      TextPropsSchema,
      ImagePropsSchema,
      VectorPropsSchema,
    ])
    .superRefine((node, ctx) => {
      if (!CONTAINER_TYPES.has(node.type) && 'children' in node) {
        ctx.addIssue({ code: 'custom', message: `${node.type} nodes cannot have children` });
      }
    }),
) as z.ZodType<NodeJSON>;

export { NodeJSONSchema };

export const DocumentJSONSchema = z
  .object({
    schemaVersion: z.number().int().positive(),
    id: z.string().min(1),
    name: z.string().default('Untitled'),
    pages: z.array(NodeJSONSchema).min(1),
    metadata: z.record(z.string(), z.unknown()).default({}),
  })
  .strict()
  .superRefine((doc, ctx) => {
    const ids = new Set<string>();
    const visit = (node: NodeJSON, path: (string | number)[]): void => {
      if (ids.has(node.id)) {
        ctx.addIssue({ code: 'custom', message: `Duplicate node id "${node.id}"`, path });
      }
      ids.add(node.id);
      node.children?.forEach((child, i) => visit(child, [...path, 'children', i]));
    };
    doc.pages.forEach((page, i) => {
      if (page.type !== 'PAGE') {
        ctx.addIssue({
          code: 'custom',
          message: 'Top-level nodes must be pages',
          path: ['pages', i],
        });
      }
      visit(page, ['pages', i]);
    });
  });

export type DocumentJSON = z.infer<typeof DocumentJSONSchema>;

/** Validates and normalizes (applies defaults to) a serialized document. Throws ZodError. */
export function parseDocumentJSON(input: unknown): DocumentJSON {
  return DocumentJSONSchema.parse(input);
}

export function safeParseDocumentJSON(
  input: unknown,
): ReturnType<typeof DocumentJSONSchema.safeParse> {
  return DocumentJSONSchema.safeParse(input);
}

/** Validates a single node's props (no hierarchy) and applies defaults. */
export function parseNodeProps(input: unknown): NodeProps {
  return NodePropsSchema.parse(input);
}
