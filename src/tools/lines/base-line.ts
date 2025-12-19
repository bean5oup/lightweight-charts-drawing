import type { IPrimitivePaneView } from 'lightweight-charts';

import { Drawing } from '../../core/drawing';
import type { Anchor, Point, Viewport, DrawingStyle, DrawingOptions } from '../../core/types';
import type { Geometry, LineGeometry } from '../../core/geometry';
import { distanceToLineSegment, distanceToLine } from '../../core/geometry';
import { DrawingPaneView } from '../../rendering/drawing-pane-view';

/**
 * Base class for two-point line drawings.
 * Provides common functionality for trend lines, rays, arrows, etc.
 */
export abstract class BaseLine extends Drawing {
  protected static readonly HIT_THRESHOLD = 5; // pixels
  protected static readonly REQUIRED_ANCHORS = 2;

  constructor(
    id: string,
    anchors: Anchor[] = [],
    style: Partial<DrawingStyle> = {},
    options: Partial<DrawingOptions> = {}
  ) {
    super(id, anchors, style, options);
  }

  // ============ Validation ============

  isValid(): boolean {
    return this._anchors.length >= BaseLine.REQUIRED_ANCHORS;
  }

  // ============ Pane Views ============

  paneViews(): IPrimitivePaneView[] {
    return [new DrawingPaneView(this)];
  }

  // ============ Geometry ============

  computeGeometry(viewport: Viewport): Geometry[] {
    if (!this.isValid()) return [];

    const start = this.anchorToPixel(this._anchors[0], viewport);
    const end = this.anchorToPixel(this._anchors[1], viewport);

    if (!start || !end) return [];

    const lineGeometry: LineGeometry = {
      type: 'line',
      start,
      end,
      extendLeft: this._options.extendLeft,
      extendRight: this._options.extendRight,
    };

    return [lineGeometry];
  }

  // ============ Hit Testing ============

  testHit(point: Point, viewport: Viewport): boolean {
    if (!this.isValid()) return false;

    const start = this.anchorToPixel(this._anchors[0], viewport);
    const end = this.anchorToPixel(this._anchors[1], viewport);

    if (!start || !end) return false;

    // Check if line is extended
    const isExtended = this._options.extendLeft || this._options.extendRight;

    let distance: number;
    if (isExtended) {
      // Use infinite line distance
      distance = distanceToLine(point, start, end);
    } else {
      // Use segment distance
      distance = distanceToLineSegment(point, start, end);
    }

    return distance <= BaseLine.HIT_THRESHOLD;
  }

  // ============ Utility Methods ============

  /**
   * Get the angle of the line in degrees
   */
  getAngle(): number {
    if (!this.isValid()) return 0;

    const dx = this._anchors[1].price - this._anchors[0].price;
    const dt = Number(this._anchors[1].time) - Number(this._anchors[0].time);

    return Math.atan2(dx, dt) * (180 / Math.PI);
  }

  /**
   * Get the price change between anchors
   */
  getPriceChange(): { absolute: number; percentage: number } {
    if (!this.isValid()) return { absolute: 0, percentage: 0 };

    const startPrice = this._anchors[0].price;
    const endPrice = this._anchors[1].price;
    const absolute = endPrice - startPrice;
    const percentage = startPrice !== 0 ? (absolute / startPrice) * 100 : 0;

    return { absolute, percentage };
  }

  /**
   * Get the time span between anchors in bars
   */
  getTimeSpan(): number {
    if (!this.isValid()) return 0;
    return Math.abs(Number(this._anchors[1].time) - Number(this._anchors[0].time));
  }
}
