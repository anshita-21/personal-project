import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { scoreTone } from '../util/format';

export interface TopicBarRow {
  label: string;
  value: number;
  /** Optional "7 / 10" style detail shown on the right. */
  detail?: string;
}

/**
 * Horizontal accuracy bars for topic strengths and weaknesses.
 *
 * Rendered as a definition list with meter elements rather than a canvas, so
 * the numbers are real text: selectable, searchable, and readable by assistive
 * technology without a parallel data table.
 */
@Component({
  selector: 'app-topic-bars',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      .rows {
        display: grid;
        gap: var(--s-3);
      }
      .row-head {
        display: flex;
        justify-content: space-between;
        gap: var(--s-3);
        font-size: var(--fs-sm);
        margin-bottom: var(--s-1);
      }
      .row-head .value {
        font-variant-numeric: tabular-nums;
        font-weight: 650;
      }
      .detail {
        color: var(--c-text-muted);
        font-size: var(--fs-xs);
      }
    `,
  ],
  template: `
    <div class="rows">
      @for (row of ordered(); track row.label) {
        <div>
          <div class="row-head">
            <span class="truncate">{{ row.label }}</span>
            <span>
              @if (row.detail) {
                <span class="detail">{{ row.detail }}&nbsp;&middot;&nbsp;</span>
              }
              <span class="value">{{ row.value }}%</span>
            </span>
          </div>
          <div
            class="meter"
            role="meter"
            [attr.aria-valuenow]="row.value"
            aria-valuemin="0"
            aria-valuemax="100"
            [attr.aria-label]="row.label + ' accuracy'"
          >
            <div
              class="meter__fill meter__fill--{{ toneFor(row.value) }}"
              [style.width.%]="row.value"
            ></div>
          </div>
        </div>
      }
    </div>
  `,
})
export class TopicBarsComponent {
  readonly rows = input.required<TopicBarRow[]>();
  readonly passMark = input(60);
  /** Weakest first by default - that is the actionable ordering. */
  readonly sort = input<'weakest' | 'strongest' | 'none'>('weakest');

  readonly ordered = computed(() => {
    const rows = [...this.rows()];
    if (this.sort() === 'weakest') {
      return rows.sort((a, b) => a.value - b.value);
    }
    if (this.sort() === 'strongest') {
      return rows.sort((a, b) => b.value - a.value);
    }
    return rows;
  });

  toneFor(value: number): string {
    return scoreTone(value, this.passMark());
  }
}
