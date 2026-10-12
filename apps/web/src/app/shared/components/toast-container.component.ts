import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from '../../core/notifications/toast.service';

/**
 * Renders transient notifications into a polite live region, so a screen
 * reader announces "Answers saved" or an error without stealing focus.
 */
@Component({
  selector: 'app-toast-container',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      .toast-stack {
        position: fixed;
        right: var(--s-4);
        bottom: var(--s-4);
        z-index: 60;
        display: grid;
        gap: var(--s-2);
        width: min(380px, calc(100vw - 2 * var(--s-4)));
      }
      .toast {
        display: flex;
        gap: var(--s-3);
        align-items: flex-start;
        padding: var(--s-3);
        border-radius: var(--radius);
        box-shadow: var(--shadow-lg);
        border: 1px solid var(--c-border);
        background: var(--c-surface);
        font-size: var(--fs-sm);
      }
      .toast--success {
        border-color: #bfe3cb;
        background: var(--c-success-soft);
        color: #11602f;
      }
      .toast--error {
        border-color: #f3c6c2;
        background: var(--c-danger-soft);
        color: #7f1d16;
      }
      .toast--info {
        border-color: #c7d9f0;
        background: var(--c-info-soft);
        color: #17497f;
      }
      .toast button {
        margin-left: auto;
        background: none;
        border: 0;
        cursor: pointer;
        color: inherit;
        font-size: var(--fs-md);
        line-height: 1;
        padding: 0 var(--s-1);
      }
    `,
  ],
  template: `
    <div class="toast-stack" aria-live="polite" aria-atomic="false">
      @for (toast of toasts(); track toast.id) {
        <div class="toast toast--{{ toast.kind }}" [attr.data-testid]="'toast-' + toast.kind">
          <span>{{ toast.message }}</span>
          <button type="button" aria-label="Dismiss notification" (click)="dismiss(toast.id)">
            &times;
          </button>
        </div>
      }
    </div>
  `,
})
export class ToastContainerComponent {
  private readonly service = inject(ToastService);
  readonly toasts = this.service.toasts;

  dismiss(id: number): void {
    this.service.dismiss(id);
  }
}
