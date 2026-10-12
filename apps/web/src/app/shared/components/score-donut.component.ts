import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { scoreTone } from '../util/format';

/**
 * Score dial, drawn as inline SVG.
 *
 * No chart library: this is one circle with a stroke dash offset. A charting
 * dependency for three shapes (this, the topic bars and the progress line)
 * would be the largest thing in the bundle and would still need overriding to
 * match the design tokens.
 *
 * `role="img"` plus an aria-label means a screen reader gets "Scored 72
 * percent" rather than silence.
 */
@Component({
  selector: 'app-score-donut',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      .dial {
        display: grid;
        place-items: center;
        position: relative;
      }
      svg {
        transform: rotate(-90deg);
      }
      .dial__value {
        position: absolute;
        text-align: center;
        font-variant-numeric: tabular-nums;
      }
      .dial__pct {
        font-size: var(--fs-xl);
        font-weight: 680;
        letter-spacing: -0.03em;
        line-height: 1.1;
      }
      .dial__caption {
        font-size: var(--fs-xs);
        color: var(--c-text-muted);
      }
      .track {
        stroke: var(--c-surface-alt);
      }
      .value--success {
        stroke: var(--c-success);
      }
      .value--warning {
        stroke: var(--c-warning);
      }
      .value--danger {
        stroke: var(--c-danger);
      }
    `,
  ],
  template: `
    <div class="dial" [style.width.px]="size()" [style.height.px]="size()">
      <svg
        [attr.width]="size()"
        [attr.height]="size()"
        [attr.viewBox]="'0 0 ' + size() + ' ' + size()"
        role="img"
        [attr.aria-label]="ariaLabel()"
      >
        <circle
          class="track"
          [attr.cx]="centre()"
          [attr.cy]="centre()"
          [attr.r]="radius()"
          fill="none"
          [attr.stroke-width]="thickness()"
        />
        <circle
          [class]="'value--' + tone()"
          [attr.cx]="centre()"
          [attr.cy]="centre()"
          [attr.r]="radius()"
          fill="none"
          stroke-linecap="round"
          [attr.stroke-width]="thickness()"
          [attr.stroke-dasharray]="circumference()"
          [attr.stroke-dashoffset]="dashOffset()"
        />
      </svg>
      <div class="dial__value" aria-hidden="true">
        <div class="dial__pct">{{ percentage() }}%</div>
        @if (caption()) {
          <div class="dial__caption">{{ caption() }}</div>
        }
      </div>
    </div>
  `,
})
export class ScoreDonutComponent {
  readonly percentage = input.required<number>();
  readonly passMark = input(60);
  readonly size = input(132);
  readonly thickness = input(11);
  readonly caption = input('');

  readonly centre = computed(() => this.size() / 2);
  readonly radius = computed(() => this.centre() - this.thickness() / 2 - 1);
  readonly circumference = computed(() => 2 * Math.PI * this.radius());
  readonly tone = computed(() => scoreTone(this.percentage(), this.passMark()));

  readonly dashOffset = computed(() => {
    const clamped = Math.min(100, Math.max(0, this.percentage()));
    return this.circumference() * (1 - clamped / 100);
  });

  readonly ariaLabel = computed(
    () => `${this.caption() || 'Score'}: ${this.percentage()} percent`,
  );
}
