import type { Interaction, SceneGraph, SceneNode, Transition } from '@sigma/document';
import type { Rect, Vec2 } from '@sigma/geometry';
import { mat2d, pointInRect, rect as R } from '@sigma/geometry';
import type { NodeId } from '@sigma/shared';

export interface PrototypeState {
  screenId: NodeId | null;
  overlayId: NodeId | null;
  history: NodeId[];
}

export type PrototypeEffect =
  | { kind: 'navigate'; from: NodeId | null; to: NodeId; transition: Transition }
  | { kind: 'overlay'; to: NodeId; transition: Transition; closeOnOutsideClick: boolean }
  | { kind: 'closeOverlay'; transition: Transition }
  | { kind: 'scrollTo'; to: NodeId; transition: Transition }
  | { kind: 'openUrl'; url: string };

export interface Hotspot {
  id: NodeId;
  /** Bounds in the screen frame's local space. */
  bounds: Rect;
  interactions: Interaction[];
}

const INSTANT: Transition = { type: 'INSTANT', durationMs: 0, easing: 'LINEAR' };

/**
 * Headless prototype player: screens are the page's top-level frames; triggers are resolved by
 * hit-testing the nodes that carry interactions. The UI renders screens and animates effects.
 */
export class PrototypeRuntime {
  state: PrototypeState;

  constructor(
    private readonly graph: SceneGraph,
    start?: NodeId,
  ) {
    const first = start ?? this.flowStart() ?? this.screens()[0]?.id ?? null;
    this.state = { screenId: first, overlayId: null, history: [] };
  }

  flowStart(): NodeId | null {
    for (const page of this.graph.pages) {
      const id = (page.metadata as { flowStartId?: string }).flowStartId;
      if (id && this.graph.hasNode(id as NodeId)) return id as NodeId;
    }
    return null;
  }

  /** Top-level frames across pages, page by page. */
  screens(): SceneNode[] {
    return this.graph.pages.flatMap((p) =>
      this.graph.getChildren(p.id).filter((n) => 'layout' in n && n.visible),
    );
  }

  get canGoBack(): boolean {
    return this.state.history.length > 0;
  }

  /** Nodes with interactions inside the current screen (or the overlay when one is open). */
  hotspots(screenId: NodeId | null = this.state.overlayId ?? this.state.screenId): Hotspot[] {
    if (!screenId || !this.graph.hasNode(screenId)) return [];
    const inv = mat2d.invert(this.graph.getWorldMatrix(screenId));
    const out: Hotspot[] = [];
    const visit = (id: NodeId): void => {
      const n = this.graph.requireNode(id);
      if (!n.visible) return;
      if (n.interactions.length)
        out.push({
          id,
          bounds: R.transformBounds(
            this.graph.getLocalBounds(id),
            mat2d.multiply(inv, this.graph.getWorldMatrix(id)),
          ),
          interactions: n.interactions,
        });
      for (const c of n.childIds) visit(c);
    };
    const screen = this.graph.requireNode(screenId);
    if (screen.interactions.length)
      out.push({
        id: screenId,
        bounds: this.graph.getLocalBounds(screenId),
        interactions: screen.interactions,
      });
    for (const c of screen.childIds) visit(c);
    return out;
  }

  /** Resolves a trigger at a point in the current screen's local space. Returns the effect, if any. */
  trigger(trigger: Interaction['trigger'], point: Vec2, key?: string): PrototypeEffect | null {
    const spots = this.hotspots();
    for (let i = spots.length - 1; i >= 0; i--) {
      const h = spots[i] as Hotspot;
      if (!pointInRect(point, h.bounds)) continue;
      const inter = h.interactions.find(
        (it) => it.trigger === trigger && (trigger !== 'KEY' || !it.key || it.key === key),
      );
      if (inter) return this.apply(inter);
    }
    return null;
  }

  /** Fires interactions that do not need a pointer (AFTER_DELAY on the screen itself). */
  timed(): { effect: PrototypeEffect; delayMs: number }[] {
    const screen = this.state.screenId ? this.graph.getNode(this.state.screenId) : undefined;
    if (!screen) return [];
    return screen.interactions
      .filter((i) => i.trigger === 'AFTER_DELAY')
      .map((i) => ({ effect: this.apply(i) as PrototypeEffect, delayMs: i.delayMs }))
      .filter((x) => x.effect);
  }

  apply(interaction: Interaction): PrototypeEffect | null {
    const a = interaction.action;
    switch (a.type) {
      case 'NAVIGATE':
        return this.goTo(a.targetId as NodeId, a.transition);
      case 'OPEN_OVERLAY':
        if (!this.graph.hasNode(a.targetId as NodeId)) return null;
        this.state.overlayId = a.targetId as NodeId;
        return {
          kind: 'overlay',
          to: a.targetId as NodeId,
          transition: a.transition,
          closeOnOutsideClick: a.closeOnOutsideClick,
        };
      case 'CLOSE_OVERLAY':
        return this.closeOverlay(a.transition);
      case 'BACK':
        return this.back(a.transition);
      case 'SCROLL_TO':
        return { kind: 'scrollTo', to: a.targetId as NodeId, transition: a.transition };
      case 'OPEN_URL':
        return { kind: 'openUrl', url: a.url };
    }
  }

  goTo(screenId: NodeId, transition: Transition = INSTANT): PrototypeEffect | null {
    if (!this.graph.hasNode(screenId)) return null;
    const from = this.state.screenId;
    if (from && from !== screenId) this.state.history.push(from);
    this.state = { screenId, overlayId: null, history: this.state.history };
    return { kind: 'navigate', from, to: screenId, transition };
  }

  back(transition: Transition = INSTANT): PrototypeEffect | null {
    const to = this.state.history.pop();
    if (!to) return null;
    const from = this.state.screenId;
    this.state = { screenId: to, overlayId: null, history: this.state.history };
    return { kind: 'navigate', from, to, transition };
  }

  closeOverlay(transition: Transition = INSTANT): PrototypeEffect | null {
    if (!this.state.overlayId) return null;
    this.state.overlayId = null;
    return { kind: 'closeOverlay', transition };
  }
}
