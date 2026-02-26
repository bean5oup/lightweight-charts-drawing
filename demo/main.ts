import { createChart, IChartApi, ISeriesApi, CandlestickData, Time, CandlestickSeries } from 'lightweight-charts';
import {
  DrawingManager,
  getToolRegistry,
  type Anchor,
  type IDrawing,
  TextAnnotation,
  Callout,
  AnchoredText,
  Note,
  PriceNote,
  FlagMark,
  Pin,
  Comment,
  Signpost,
  Table,
} from '../src';

// Text-based drawing types that support editing
const TEXT_DRAWING_TYPES = [
  'text-annotation',
  'callout',
  'anchored-text',
  'note',
  'price-note',
  'flag-mark',
  'pin',
  'comment',
  'signpost',
  'table',
];

// Load SPY data from CSV
async function loadSPYData(): Promise<CandlestickData<Time>[]> {
  try {
    const response = await fetch('./SPY.csv');
    const text = await response.text();
    const lines = text.trim().split('\n');

    // Skip header
    const data: CandlestickData<Time>[] = [];
    for (let i = 1; i < lines.length; i++) {
      const [time, open, high, low, close] = lines[i].split(',');
      const timestamp = parseInt(time, 10);

      // Convert Unix timestamp to date string (YYYY-MM-DD)
      const date = new Date(timestamp * 1000);
      const dateStr = date.toISOString().split('T')[0];

      data.push({
        time: dateStr as Time,
        open: parseFloat(open),
        high: parseFloat(high),
        low: parseFloat(low),
        close: parseFloat(close),
      });
    }

    return data;
  } catch (error) {
    console.error('Failed to load SPY data:', error);
    return generateFallbackData();
  }
}

// Fallback data in case CSV fails to load
function generateFallbackData(days: number = 200): CandlestickData<Time>[] {
  const data: CandlestickData<Time>[] = [];
  let basePrice = 100;
  const baseDate = new Date('2024-01-01');

  for (let i = 0; i < days; i++) {
    const date = new Date(baseDate);
    date.setDate(baseDate.getDate() + i);

    const volatility = 0.02;
    const trend = Math.sin(i / 30) * 0.001;
    const change = (Math.random() - 0.5) * 2 * volatility + trend;

    const open = basePrice;
    const close = basePrice * (1 + change);
    const high = Math.max(open, close) * (1 + Math.random() * volatility * 0.5);
    const low = Math.min(open, close) * (1 - Math.random() * volatility * 0.5);

    data.push({
      time: date.toISOString().split('T')[0] as Time,
      open,
      high,
      low,
      close,
    });

    basePrice = close;
  }

  return data;
}

// Main demo class
class DrawingDemo {
  private chart: IChartApi;
  private series: ISeriesApi<'Candlestick'>;
  private drawingManager: DrawingManager;
  private currentTool: string | null = null;
  private pendingAnchors: Anchor[] = [];
  private drawingIdCounter = 0;

  // Preview drawing for rubber-band effect
  private previewDrawing: IDrawing | null = null;
  private previewId = '__preview__';

  // Text editor state
  private editingDrawing: IDrawing | null = null;

  constructor(container: HTMLElement, data: CandlestickData<Time>[]) {
    // Create chart with v5 API
    this.chart = createChart(container, {
      layout: {
        background: { color: '#1a1a2e' },
        textColor: '#d1d4dc',
      },
      grid: {
        vertLines: { color: '#2B2B43' },
        horzLines: { color: '#2B2B43' },
      },
      crosshair: {
        mode: 1,
      },
      rightPriceScale: {
        borderColor: '#2B2B43',
      },
      timeScale: {
        borderColor: '#2B2B43',
        timeVisible: true,
      },
    });

    // Add candlestick series using v5 API
    this.series = this.chart.addSeries(CandlestickSeries, {
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    // Set data
    this.series.setData(data);
    this.chart.timeScale().fitContent();

    // Create drawing manager
    this.drawingManager = new DrawingManager();
    this.drawingManager.attach(this.chart, this.series, container);

    // Setup event listeners
    this.setupToolbar();
    this.setupChartInteraction(container);
    this.setupKeyboardShortcuts();
    this.setupDrawingManagerEvents();
    this.setupTextEditor();

    // Handle resize
    window.addEventListener('resize', () => {
      this.chart.applyOptions({
        width: container.clientWidth,
        height: container.clientHeight,
      });
    });

    // Initial resize
    this.chart.applyOptions({
      width: container.clientWidth,
      height: container.clientHeight,
    });
  }

  private setupToolbar(): void {
    // Tool items in left panel
    const toolItems = document.querySelectorAll('.tool-item[data-tool]');
    toolItems.forEach((item) => {
      item.addEventListener('click', () => {
        const tool = (item as HTMLElement).dataset.tool!;
        this.selectTool(tool);
      });
    });

    // Category collapse/expand
    const categoryHeaders = document.querySelectorAll('.tool-category-header');
    categoryHeaders.forEach((header) => {
      header.addEventListener('click', () => {
        const category = header.parentElement;
        category?.classList.toggle('collapsed');
      });
    });

    // Clear all button
    document.getElementById('clear-all')?.addEventListener('click', () => {
      this.clearAllDrawings();
    });
  }

  private selectTool(toolType: string): void {
    // Deselect previous
    document.querySelectorAll('.tool-item').forEach((item) => item.classList.remove('active'));

    // Cancel any in-progress drawing
    this.cancelPreview();

    // If clicking same tool, deselect
    if (this.currentTool === toolType) {
      this.currentTool = null;
      this.updateStatus();
      return;
    }

    // Select new tool
    this.currentTool = toolType;
    document.querySelector(`.tool-item[data-tool="${toolType}"]`)?.classList.add('active');

    this.updateStatus();
  }

  private getRequiredAnchors(toolType: string): number {
    const registry = getToolRegistry();
    const toolDef = registry.get(toolType);
    return toolDef?.requiredAnchors ?? 2;
  }

  private getToolColor(toolType: string): string {
    const colors: Record<string, string> = {
      'trend-line': '#2962FF',
      'horizontal-line': '#FF6D00',
      'vertical-line': '#FF6D00',
      'ray': '#2962FF',
      'arrow': '#26A69A',
      'extended-line': '#2962FF',
      'cross-line': '#9C27B0',
      'info-line': '#00BCD4',
      'trend-angle': '#FF5722',
      'horizontal-ray': '#FF6D00',
      'rectangle': '#2962FF',
      'circle': '#E91E63',
      'triangle': '#FF9800',
      'price-range': '#4CAF50',
      'fib-retracement': '#FFD700',
      'fib-extension': '#FFD700',
      'fib-channel': '#FFD700',
      'fib-time-zone': '#FFD700',
      'fib-speed-fan': '#FFD700',
      'fib-time-extension': '#FFD700',
      'fib-circles': '#FFD700',
      'fib-spiral': '#FFD700',
      'fib-arcs': '#FFD700',
      'fib-wedge': '#FFD700',
      'pitchfan': '#FFD700',
      'parallel-channel': '#00BCD4',
      'regression-trend': '#00BCD4',
      'flat-top-bottom': '#00BCD4',
      'disjoint-channel': '#00BCD4',
      'andrews-pitchfork': '#9C27B0',
      'schiff-pitchfork': '#9C27B0',
      'modified-schiff-pitchfork': '#9C27B0',
      'inside-pitchfork': '#9C27B0',
      'gann-box': '#FF5722',
      'gann-fan': '#FF5722',
      'gann-square-fixed': '#FF5722',
      'gann-square': '#FF5722',
      'long-position': '#26A69A',
      'short-position': '#EF5350',
      'date-range': '#2196F3',
      'date-price-range': '#9C27B0',
      'projection': '#9C27B0',
      'text-annotation': '#FFFFFF',
      'callout': '#FFEB3B',
      'brush': '#E91E63',
      'highlighter': '#FFEB3B',
      'arrow-marker': '#2196F3',
      'arrow-mark-up': '#26A69A',
      'arrow-mark-down': '#EF5350',
      'ellipse': '#E91E63',
      'arc': '#9C27B0',
      'rotated-rectangle': '#2962FF',
      'path': '#E91E63',
      'polyline': '#00BCD4',
      'curve': '#9C27B0',
      'double-curve': '#FF5722',
      'anchored-text': '#FFFFFF',
      'note': '#FFEB3B',
      'price-note': '#26A69A',
      'price-label': '#2962FF',
      'flag-mark': '#EF5350',
      'pin': '#E91E63',
      'comment': '#2962FF',
      'signpost': '#FF9800',
      'table': '#607D8B',
      'forecast': '#26A69A',
      'bars-pattern': '#FF9800',
    };
    return colors[toolType] || '#2962FF';
  }

  private setupChartInteraction(container: HTMLElement): void {
    // Subscribe to crosshair move for mouse position
    this.chart.subscribeCrosshairMove((param) => {
      if (param.point && param.time) {
        const price = param.seriesData.get(this.series);
        if (price && 'close' in price) {
          document.getElementById('status-mouse')!.textContent =
            `${param.time} / $${(price as any).close.toFixed(2)}`;
        }
      }
    });

    // Handle clicks on the chart
    container.addEventListener('click', (event) => {
      if (!this.currentTool) return;

      const rect = container.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      // Convert pixel to chart coordinates
      const time = this.chart.timeScale().coordinateToTime(x);
      const price = this.series.coordinateToPrice(y);

      if (time === null || price === null) return;

      const anchor: Anchor = { time, price };
      this.pendingAnchors.push(anchor);

      const requiredAnchors = this.getRequiredAnchors(this.currentTool);
      this.updateStatus(`Placing ${this.pendingAnchors.length}/${requiredAnchors}`);

      // Check if drawing is complete
      if (this.pendingAnchors.length >= requiredAnchors) {
        // Remove preview
        this.removePreview();

        // Create final drawing
        this.createDrawing(this.currentTool, [...this.pendingAnchors]);
        this.pendingAnchors = [];
        this.updateStatus('Idle');
      } else {
        // Update preview with new anchor
        this.updatePreview(anchor);
      }
    });

    // Handle mouse move for rubber-band preview
    container.addEventListener('mousemove', (event) => {
      if (!this.currentTool || this.pendingAnchors.length === 0) return;

      const rect = container.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      const time = this.chart.timeScale().coordinateToTime(x);
      const price = this.series.coordinateToPrice(y);

      if (time === null || price === null) return;

      // Update preview with current mouse position
      this.updatePreviewWithMouse({ time, price });
    });

    // Handle escape to cancel
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        this.cancelPreview();
        this.updateStatus('Idle');
      }
    });

    // Handle double-click for text editing
    container.addEventListener('dblclick', (event) => {
      // Don't edit if we're in the middle of creating a drawing
      if (this.currentTool && this.pendingAnchors.length > 0) return;

      const rect = container.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      // Find drawing at this position
      const drawing = this.findDrawingAtPoint(x, y);

      if (drawing && TEXT_DRAWING_TYPES.includes(drawing.type)) {
        event.preventDefault();
        event.stopPropagation();
        this.openTextEditor(drawing);
      }
    });
  }

  private updatePreview(newAnchor: Anchor): void {
    if (!this.currentTool) return;

    const registry = getToolRegistry();
    const requiredAnchors = this.getRequiredAnchors(this.currentTool);
    const color = this.getToolColor(this.currentTool);

    // For the preview, we need at least the anchors we have plus a placeholder for mouse
    // If we only have 1 anchor and need 2, create preview with that anchor duplicated
    const previewAnchors = [...this.pendingAnchors];

    // Fill remaining anchors with the last anchor (will be updated on mouse move)
    while (previewAnchors.length < requiredAnchors) {
      previewAnchors.push({ ...newAnchor });
    }

    // Remove old preview
    this.removePreview();

    // Create new preview drawing
    const style = {
      lineColor: color,
      lineWidth: 2,
      fillColor: color + '33',
    };

    this.previewDrawing = registry.createDrawing(
      this.currentTool,
      this.previewId,
      previewAnchors,
      style
    );

    if (this.previewDrawing) {
      this.drawingManager.addDrawing(this.previewDrawing);
    }
  }

  private updatePreviewWithMouse(mouseAnchor: Anchor): void {
    if (!this.previewDrawing || !this.currentTool) return;

    const requiredAnchors = this.getRequiredAnchors(this.currentTool);

    // Update the last anchor(s) that are being placed
    // For 2-point tools: update anchor at index 1
    // For 3-point tools: update anchor at index pendingAnchors.length
    const updateIndex = this.pendingAnchors.length;

    if (updateIndex < requiredAnchors) {
      this.previewDrawing.updateAnchor(updateIndex, mouseAnchor);
    }
  }

  private removePreview(): void {
    if (this.previewDrawing) {
      this.drawingManager.removeDrawing(this.previewId);
      this.previewDrawing = null;
    }
  }

  private cancelPreview(): void {
    this.removePreview();
    this.pendingAnchors = [];
  }

  private createDrawing(toolType: string, anchors: Anchor[]): void {
    const id = `drawing-${++this.drawingIdCounter}`;
    const registry = getToolRegistry();
    const color = this.getToolColor(toolType);

    const style = {
      lineColor: color,
      lineWidth: 2,
      fillColor: color + '33',
    };

    const drawing = registry.createDrawing(toolType, id, anchors, style);

    if (drawing) {
      this.drawingManager.addDrawing(drawing);
      this.drawingManager.selectDrawing(drawing.id);
      this.updateDrawingList();
    }
  }

  private setupKeyboardShortcuts(): void {
    document.addEventListener('keydown', (event) => {
      // Delete selected drawing
      if (event.key === 'Delete' || event.key === 'Backspace') {
        const selected = this.drawingManager.getSelectedDrawing();
        if (selected) {
          this.drawingManager.removeDrawing(selected.id);
          this.updateDrawingList();
        }
      }
    });
  }

  private setupDrawingManagerEvents(): void {
    this.drawingManager.on('drawing:added', () => {
      this.updateDrawingList();
    });

    this.drawingManager.on('drawing:removed', () => {
      this.updateDrawingList();
    });

    this.drawingManager.on('drawing:selected', () => {
      this.updateDrawingList();
    });
  }

  private updateDrawingList(): void {
    const listEl = document.getElementById('drawing-list')!;
    // Filter out preview drawing from the list
    const drawings = this.drawingManager.getAllDrawings().filter(d => d.id !== this.previewId);

    if (drawings.length === 0) {
      listEl.innerHTML = '<div class="empty-state">No drawings yet</div>';
      document.getElementById('status-count')!.textContent = '0';
      return;
    }

    listEl.innerHTML = drawings
      .map((drawing) => {
        const selected = this.drawingManager.getSelectedDrawing();
        const isSelected = selected?.id === drawing.id;
        return `
        <div class="drawing-item ${isSelected ? 'selected' : ''}" data-id="${drawing.id}">
          <span>${drawing.type} #${drawing.id.split('-')[1]}</span>
          <button class="delete-btn" data-delete="${drawing.id}">×</button>
        </div>
      `;
      })
      .join('');

    // Add click handlers
    listEl.querySelectorAll('.drawing-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.classList.contains('delete-btn')) {
          const id = target.dataset.delete!;
          this.drawingManager.removeDrawing(id);
        } else {
          const id = (item as HTMLElement).dataset.id!;
          this.drawingManager.selectDrawing(id);
        }
        this.updateDrawingList();
      });
    });

    document.getElementById('status-count')!.textContent = String(drawings.length);
  }

  private clearAllDrawings(): void {
    this.cancelPreview();
    this.drawingManager.clearAll();
    this.updateDrawingList();
  }

  private updateStatus(state?: string): void {
    document.getElementById('status-tool')!.textContent = this.currentTool || 'None';
    document.getElementById('status-state')!.textContent = state || 'Idle';
  }

  private findDrawingAtPoint(x: number, y: number): IDrawing | null {
    const drawings = this.drawingManager.getAllDrawings().filter(d => d.id !== this.previewId);

    // Create a viewport object for hit testing
    const viewport = {
      width: this.chart.timeScale().width(),
      height: 500, // Approximate
      timeScale: {
        coordinateToTime: (coord: number) => this.chart.timeScale().coordinateToTime(coord),
        timeToCoordinate: (time: any) => this.chart.timeScale().timeToCoordinate(time),
        logicalToCoordinate: (logical: any) => this.chart.timeScale().logicalToCoordinate(logical),
      },
      priceScale: {
        coordinateToPrice: (coord: number) => this.series.coordinateToPrice(coord),
        priceToCoordinate: (price: number) => this.series.priceToCoordinate(price),
      },
    };

    // Check drawings in reverse order (top-most first)
    for (let i = drawings.length - 1; i >= 0; i--) {
      const drawing = drawings[i];
      if (drawing.testHit({ x, y }, viewport)) {
        return drawing;
      }
    }

    return null;
  }

  private setupTextEditor(): void {
    const overlay = document.getElementById('text-editor-overlay')!;
    const input = document.getElementById('text-editor-input') as HTMLTextAreaElement;
    const saveBtn = document.getElementById('text-editor-save')!;
    const cancelBtn = document.getElementById('text-editor-cancel')!;

    // Save button
    saveBtn.addEventListener('click', () => {
      this.saveTextEdit(input.value);
    });

    // Cancel button
    cancelBtn.addEventListener('click', () => {
      this.closeTextEditor();
    });

    // Click on overlay to close
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        this.closeTextEditor();
      }
    });

    // Keyboard shortcuts in textarea
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.saveTextEdit(input.value);
      } else if (e.key === 'Escape') {
        this.closeTextEditor();
      }
    });
  }

  private openTextEditor(drawing: IDrawing): void {
    this.editingDrawing = drawing;

    const overlay = document.getElementById('text-editor-overlay')!;
    const input = document.getElementById('text-editor-input') as HTMLTextAreaElement;
    const title = document.getElementById('text-editor-title')!;

    // Set title based on drawing type
    const typeNames: Record<string, string> = {
      'text-annotation': 'Edit Text',
      'callout': 'Edit Callout',
      'anchored-text': 'Edit Anchored Text',
      'note': 'Edit Note',
      'price-note': 'Edit Price Note',
      'flag-mark': 'Edit Flag Label',
      'pin': 'Edit Pin Label',
      'comment': 'Edit Comment',
      'signpost': 'Edit Signpost',
      'table': 'Edit Table (tab-separated)',
    };
    title.textContent = typeNames[drawing.type] || 'Edit Text';

    // Get current text
    input.value = this.getDrawingText(drawing);

    // Show overlay
    overlay.classList.add('active');

    // Focus and select text
    setTimeout(() => {
      input.focus();
      input.select();
    }, 50);
  }

  private closeTextEditor(): void {
    const overlay = document.getElementById('text-editor-overlay')!;
    overlay.classList.remove('active');
    this.editingDrawing = null;
  }

  private saveTextEdit(newText: string): void {
    if (!this.editingDrawing) return;

    this.setDrawingText(this.editingDrawing, newText);
    this.closeTextEditor();
    this.updateDrawingList();
  }

  private getDrawingText(drawing: IDrawing): string {
    switch (drawing.type) {
      case 'text-annotation':
        return (drawing as TextAnnotation).getText();
      case 'callout':
        return (drawing as Callout).getText();
      case 'anchored-text':
        return (drawing as AnchoredText).getText();
      case 'note':
        return (drawing as Note).getText();
      case 'price-note':
        return (drawing as PriceNote).getNote();
      case 'flag-mark':
        return (drawing as FlagMark).getLabel();
      case 'pin':
        return (drawing as Pin).getLabel();
      case 'comment':
        return (drawing as Comment).getText();
      case 'signpost':
        return (drawing as Signpost).getText();
      case 'table':
        return (drawing as Table).getRows().map(r => r.join('\t')).join('\n');
      default:
        return '';
    }
  }

  private setDrawingText(drawing: IDrawing, text: string): void {
    switch (drawing.type) {
      case 'text-annotation':
        (drawing as TextAnnotation).setText(text);
        break;
      case 'callout':
        (drawing as Callout).setText(text);
        break;
      case 'anchored-text':
        (drawing as AnchoredText).setText(text);
        break;
      case 'note':
        (drawing as Note).setText(text);
        break;
      case 'price-note':
        (drawing as PriceNote).setNote(text);
        break;
      case 'flag-mark':
        (drawing as FlagMark).setLabel(text);
        break;
      case 'pin':
        (drawing as Pin).setLabel(text);
        break;
      case 'comment':
        (drawing as Comment).setText(text);
        break;
      case 'signpost':
        (drawing as Signpost).setText(text);
        break;
      case 'table':
        (drawing as Table).setRows(text.split('\n').map(line => line.split('\t')));
        break;
    }
  }
}

// Initialize demo when DOM is ready
async function init() {
  const container = document.getElementById('chart')!;
  const data = await loadSPYData();
  new DrawingDemo(container, data);
}

document.addEventListener('DOMContentLoaded', init);
