import { Minus, Plus } from 'lucide-react';
import type { GradientStop, LinearGradientPaint, RadialGradientPaint } from '@sigma/document';
import { ColorField, NumberField } from './fields';

type Gradient = LinearGradientPaint | RadialGradientPaint;

/** Angle in degrees of a linear gradient from its start/end points. */
export function gradientAngle(p: LinearGradientPaint): number {
  return Math.round(
    ((Math.atan2(p.end.y - p.start.y, p.end.x - p.start.x) * 180) / Math.PI + 360) % 360,
  );
}

/** Start/end points on the unit square for an angle (0° = left→right, 90° = top→bottom). */
export function pointsForAngle(deg: number): {
  start: { x: number; y: number };
  end: { x: number; y: number };
} {
  const rad = (deg * Math.PI) / 180;
  const dx = Math.cos(rad) / 2;
  const dy = Math.sin(rad) / 2;
  return { start: { x: 0.5 - dx, y: 0.5 - dy }, end: { x: 0.5 + dx, y: 0.5 + dy } };
}

export function GradientEditor({
  paint,
  onChange,
}: {
  paint: Gradient;
  onChange: (p: Gradient, mergeKey?: string) => void;
}) {
  const stops = [...paint.stops].sort((a, b) => a.position - b.position);
  const setStops = (next: GradientStop[], mergeKey?: string) =>
    onChange({ ...paint, stops: next } as Gradient, mergeKey);
  const addStop = () => {
    const a = stops[0]!;
    const b = stops[stops.length - 1]!;
    const mid: GradientStop = {
      position: (a.position + b.position) / 2,
      color: {
        r: (a.color.r + b.color.r) / 2,
        g: (a.color.g + b.color.g) / 2,
        b: (a.color.b + b.color.b) / 2,
        a: (a.color.a + b.color.a) / 2,
      },
    };
    setStops([...stops, mid]);
  };
  return (
    <div className="mt-1 rounded-md bg-ink-800 p-2" data-testid="gradient-editor">
      <div
        className="mb-2 h-3 rounded-sm"
        style={{
          background: `linear-gradient(90deg, ${stops.map((s) => `rgba(${Math.round(s.color.r * 255)},${Math.round(s.color.g * 255)},${Math.round(s.color.b * 255)},${s.color.a}) ${s.position * 100}%`).join(', ')})`,
        }}
      />
      {paint.type === 'LINEAR_GRADIENT' ? (
        <NumberField
          label="∠"
          value={gradientAngle(paint)}
          suffix="°"
          className="mb-1"
          onChange={(v) => onChange({ ...paint, ...pointsForAngle(v) }, 'gradient:angle')}
        />
      ) : (
        <div className="mb-1 grid grid-cols-3 gap-1">
          <NumberField
            label="X"
            value={Math.round(paint.center.x * 100)}
            suffix="%"
            onChange={(v) =>
              onChange({ ...paint, center: { ...paint.center, x: v / 100 } }, 'gradient:cx')
            }
          />
          <NumberField
            label="Y"
            value={Math.round(paint.center.y * 100)}
            suffix="%"
            onChange={(v) =>
              onChange({ ...paint, center: { ...paint.center, y: v / 100 } }, 'gradient:cy')
            }
          />
          <NumberField
            label="R"
            value={Math.round(paint.radius * 100)}
            suffix="%"
            min={1}
            onChange={(v) => onChange({ ...paint, radius: v / 100 }, 'gradient:r')}
          />
        </div>
      )}
      {stops.map((stop, i) => (
        <div key={i} className="mb-1 flex items-center gap-1">
          <NumberField
            label=""
            value={Math.round(stop.position * 100)}
            min={0}
            max={100}
            suffix="%"
            className="w-[4.2rem]"
            onChange={(v) =>
              setStops(
                stops.map((s, j) => (j === i ? { ...s, position: v / 100 } : s)),
                'gradient:pos',
              )
            }
          />
          <ColorField
            color={stop.color}
            opacity={stop.color.a}
            onChange={(c, a) =>
              setStops(
                stops.map((s, j) => (j === i ? { ...s, color: { ...c, a } } : s)),
                'gradient:color',
              )
            }
          />
          <button
            className="icon-btn h-6 w-6"
            title="Remove stop"
            disabled={stops.length <= 2}
            onClick={() => setStops(stops.filter((_, j) => j !== i))}
          >
            <Minus size={12} />
          </button>
        </div>
      ))}
      <button
        className="mt-1 flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-ink-300 hover:bg-ink-700"
        onClick={addStop}
      >
        <Plus size={11} /> Add stop
      </button>
    </div>
  );
}
