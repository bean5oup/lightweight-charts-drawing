import type { IPrimitivePaneView, IPrimitivePaneRenderer } from 'lightweight-charts';
import type { CanvasRenderingTarget2D, BitmapCoordinatesRenderingScope } from 'fancy-canvas';

import type { Path } from './path';
import type { Point, Viewport } from '../../core/types';
import { applyStyle, drawControlPoints } from '../../rendering/canvas-utils';

export class PathPaneView implements IPrimitivePaneView {
  private _renderer: PathPaneRenderer;

  constructor(drawing: Path) {
    this._renderer = new PathPaneRenderer(drawing);
  }

  zOrder(): 'bottom' | 'normal' | 'top' {
    return 'normal';
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer;
  }
}

class PathPaneRenderer implements IPrimitivePaneRenderer {
  private _drawing: Path;

  constructor(drawing: Path) {
    this._drawing = drawing;
  }

  draw(target: CanvasRenderingTarget2D): void {
    target.useBitmapCoordinateSpace((scope: BitmapCoordinatesRenderingScope) => {
      this.drawImpl(scope);
    });
  }

  private drawImpl(scope: BitmapCoordinatesRenderingScope): void {
    const { context: ctx, horizontalPixelRatio } = scope;
    const pixelRatio = horizontalPixelRatio;

    const viewport = (this._drawing as any).getViewport() as Viewport | null;
    if (!viewport) return;
    if (!this._drawing.options.visible) return;
    if (!this._drawing.isValid()) return;

    const anchors = this._drawing.anchors;
    const points: Point[] = [];
    for (const anchor of anchors) {
      const p = this.anchorToPixel(anchor, viewport);
      if (p) points.push(p);
    }

    if (points.length < 2) return;

    const options = this._drawing.pathOptions;

    applyStyle(ctx, this._drawing.style, pixelRatio);

    // Draw fill if enabled and closed
    if (options.filled && options.closed && this._drawing.style.fillColor) {
      ctx.fillStyle = this._drawing.style.fillColor;
      ctx.beginPath();
      ctx.moveTo(points[0].x * pixelRatio, points[0].y * pixelRatio);
      for (let i = 1; i < points.length; i++) {
        ctx.lineTo(points[i].x * pixelRatio, points[i].y * pixelRatio);
      }
      ctx.closePath();
      ctx.fill();
    }

    // Draw the path
    ctx.beginPath();
    ctx.moveTo(points[0].x * pixelRatio, points[0].y * pixelRatio);

    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x * pixelRatio, points[i].y * pixelRatio);
    }

    if (options.closed) {
      ctx.closePath();
    }

    ctx.stroke();

    // Draw control points if selected
    const state = this._drawing.state;
    if (state === 'selected' || state === 'editing') {
      const controlPoints = points.map((p, i) => ({
        index: i,
        x: p.x,
        y: p.y,
        radius: 6,
      }));
      drawControlPoints(ctx, controlPoints, null, pixelRatio);
    }
  }

  private anchorToPixel(anchor: { time: any; price: number }, viewport: Viewport): Point | null {
    const x = viewport.timeScale.timeToCoordinate(anchor.time);
    const y = viewport.priceScale.priceToCoordinate(anchor.price);
    if (x === null || y === null) return null;
    return { x, y };
  }
}
