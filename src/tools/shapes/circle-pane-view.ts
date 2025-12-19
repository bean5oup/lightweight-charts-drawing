import type { IPrimitivePaneView, IPrimitivePaneRenderer } from 'lightweight-charts';
import type { CanvasRenderingTarget2D, BitmapCoordinatesRenderingScope } from 'fancy-canvas';

import type { Circle } from './circle';
import type { Point, Viewport } from '../../core/types';
import { distanceBetweenPoints } from '../../core/geometry';
import { applyStyle, drawCircle, drawControlPoints } from '../../rendering/canvas-utils';

export class CirclePaneView implements IPrimitivePaneView {
  private _renderer: CirclePaneRenderer;

  constructor(drawing: Circle) {
    this._renderer = new CirclePaneRenderer(drawing);
  }

  zOrder(): 'bottom' | 'normal' | 'top' {
    return 'normal';
  }

  renderer(): IPrimitivePaneRenderer {
    return this._renderer;
  }
}

class CirclePaneRenderer implements IPrimitivePaneRenderer {
  private _drawing: Circle;

  constructor(drawing: Circle) {
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
    const center = this.anchorToPixel(anchors[0], viewport);
    const edge = this.anchorToPixel(anchors[1], viewport);

    if (!center || !edge) return;

    const radius = distanceBetweenPoints(center, edge);

    applyStyle(ctx, this._drawing.style, pixelRatio);

    // Draw fill if enabled
    if (this._drawing.circleOptions.filled && this._drawing.style.fillColor) {
      ctx.fillStyle = this._drawing.style.fillColor;
    }

    drawCircle(ctx, center, radius, this._drawing.circleOptions.filled ?? false, pixelRatio);

    // Draw control points if selected
    const state = this._drawing.state;
    if (state === 'selected' || state === 'editing') {
      const controlPoints = this._drawing.getControlPoints(viewport);
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
