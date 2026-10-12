import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * The three states every data-backed screen needs, as components rather than
 * copy-pasted markup: loading, empty, and failed.
 *
 * Having them here is what makes "every screen has a proper loading and empty
 * state" true rather than aspirational - a new page gets all three by using
 * these, and they look the same everywhere.
 */

@Component({
  selector: 'app-loading-block',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stack" role="status" [attr.aria-label]="label()">
      @for (row of rows(); track $index) {
        <div class="skeleton skeleton--card" [style.height.px]="height()"></div>
      }
      <span class="sr-only">{{ label() }}</span>
    </div>
  `,
})
export class LoadingBlockComponent {
  readonly count = input(3);
  readonly height = input(120);
  readonly label = input('Loading');

  rows(): number[] {
    return Array.from({ length: this.count() }, (_, index) => index);
  }
}

@Component({
  selector: 'app-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      .empty {
        display: grid;
        gap: var(--s-2);
        justify-items: center;
        text-align: center;
        padding: var(--s-6) var(--s-4);
        background: var(--c-surface);
        border: 1px dashed var(--c-border-strong);
        border-radius: var(--radius);
      }
      .empty p {
        color: var(--c-text-muted);
        max-width: 48ch;
      }
    `,
  ],
  template: `
    <div class="empty">
      <h3>{{ title() }}</h3>
      @if (message()) {
        <p>{{ message() }}</p>
      }
      <ng-content />
    </div>
  `,
})
export class EmptyStateComponent {
  readonly title = input.required<string>();
  readonly message = input('');
}

@Component({
  selector: 'app-error-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="alert alert--danger" role="alert">
      <div class="stack-sm">
        <span class="alert__title">{{ title() }}</span>
        <span>{{ message() }}</span>
        @if (retryable()) {
          <button type="button" class="btn btn--secondary btn--sm" (click)="retry.emit()">
            Try again
          </button>
        }
      </div>
    </div>
  `,
})
export class ErrorStateComponent {
  readonly title = input('Something went wrong');
  readonly message = input.required<string>();
  readonly retryable = input(true);
  readonly retry = output<void>();
}
