import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export interface ProgressPoint {
  label: string;
  value: number;
  caption?: string;
}

/**
 * Score-over-time line chart, drawn as inline SVG from real attempt data.
 *
 * The chart renders nothing rather than an empty axis frame when there are
 * fewer than two points - a placeholder chart implies data that does not exist.
 * The accompanying table (rendered by the caller) is the accessible
 * alternative; here the SVG is marked role="img" with a summarising label.
 */
@Component({
  selector: 'app-progress-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      svg {
        width: 100%;
        height: auto;
        overflow: visible;
      }
      .grid-line {
        stroke: var(--c-border);
        stroke-width: 1;
        stroke-dasharray: 3 4;
      }
      .pass-line {
        stroke: var(--c-success);
        stroke-width: 1;
        stroke-dasharray: 5 4;
        opacity: 0.7;
      }
      .area {
        fill: var(--c-brand-soft);
      }
      .line {
        fill: none;
        stroke: var(--c-brand);
        stroke-width: 2;
        stroke-linejoin: round;
        stroke-linecap: round;
      }
      .dot {
        fill: var(--c-surface);
        stroke: var(--c-brand);
        stroke-width: 2;
      }
      .axis-label {
        font-size: 9px;
        fill: var(--c-text-subtle);
      }
    `,
  ],
  template: `
    @if (points().length >= 2) {
      <svg
        [attr.viewBox]="'0 0 ' + width + ' ' + height"
        preserveAspectRatio="none"
        role="img"
        [attr.aria-label]="ariaLabel()"
      >
        @for (tick of yTicks; track tick) {
          <line
            class="grid-line"
            [attr.x1]="padding.left"
            [attr.x2]="width - padding.right"
            [attr.y1]="y(tick)"
            [attr.y2]="y(tick)"
          />
          <text class="axis-label" [attr.x]="0" [attr.y]="y(tick) + 3">{{ tick }}</text>
        }
        <line
          class="pass-line"
          [attr.x1]="padding.left"
          [attr.x2]="width - padding.right"
          [attr.y1]="y(passMark())"
          [attr.y2]="y(passMark())"
        />
        <path class="area" [attr.d]="areaPath()" />
        <path class="line" [attr.d]="linePath()" />
        @for (point of plotted(); track point.index) {
          <circle class="dot" [attr.cx]="point.x" [attr.cy]="point.y" r="3.5" />
        }
      </svg>
    }
  `,
})
export class ProgressChartComponent {
  readonly points = input.required<ProgressPoint[]>();
  readonly passMark = input(60);

  protected readonly width = 560;
  protected readonly height = 180;
  protected readonly padding = { top: 10, right: 6, bottom: 14, left: 22 };
  protected readonly yTicks = [0, 25, 50, 75, 100];

  protected y(value: number): number {
    const usable = this.height - this.padding.top - this.padding.bottom;
    return this.padding.top + usable * (1 - Math.min(100, Math.max(0, value)) / 100);
  }

  protected readonly plotted = computed(() => {
    const data = this.points();
    const usable = this.width - this.padding.left - this.padding.right;
    const step = data.length > 1 ? usable / (data.length - 1) : 0;

    return data.map((point, index) => ({
      index,
      x: this.padding.left + step * index,
      y: this.y(point.value),
      value: point.value,
    }));
  });

  protected readonly linePath = computed(() =>
    this.plotted()
      .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`)
      .join(' '),
  );

  protected readonly areaPath = computed(() => {
    const plotted = this.plotted();
    const first = plotted[0];
    const last = plotted[plotted.length - 1];
    if (!first || !last) {
      return '';
    }
    const baseline = this.y(0);
    return [
      `M${first.x.toFixed(1)},${baseline.toFixed(1)}`,
      ...plotted.map((point) => `L${point.x.toFixed(1)},${point.y.toFixed(1)}`),
      `L${last.x.toFixed(1)},${baseline.toFixed(1)}`,
      'Z',
    ].join(' ');
  });

  protected readonly ariaLabel = computed(() => {
    const values = this.points().map((point) => `${point.label}: ${point.value}%`);
    return `Score over time. ${values.join('. ')}`;
  });
}
