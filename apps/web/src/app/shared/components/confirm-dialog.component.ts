import type { ElementRef} from '@angular/core';
import { ChangeDetectionStrategy, Component, effect, input, output, viewChild } from '@angular/core';

/**
 * Confirmation dialog for destructive or irreversible actions.
 *
 * Built on the native <dialog> element: the browser then provides the modal
 * focus trap, the Escape-to-close behaviour and the backdrop, none of which is
 * worth hand-rolling (and all of which are easy to get subtly wrong).
 */
@Component({
  selector: 'app-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      dialog {
        border: 1px solid var(--c-border);
        border-radius: var(--radius-lg);
        padding: var(--s-5);
        max-width: min(460px, calc(100vw - 2rem));
        box-shadow: var(--shadow-lg);
        color: var(--c-text);
        background: var(--c-surface);
      }
      dialog::backdrop {
        background: rgba(16, 24, 40, 0.45);
      }
      .actions {
        display: flex;
        gap: var(--s-2);
        justify-content: flex-end;
        margin-top: var(--s-5);
      }
      p {
        color: var(--c-text-muted);
        margin-top: var(--s-2);
      }
    `,
  ],
  template: `
    <dialog #dialog (cancel)="onCancel($event)" (close)="cancelled.emit()">
      <h3>{{ title() }}</h3>
      <p>{{ message() }}</p>
      <div class="actions">
        <button type="button" class="btn btn--secondary" (click)="close()">
          {{ cancelLabel() }}
        </button>
        <button
          type="button"
          class="btn"
          [class.btn--danger]="destructive()"
          [class.btn--primary]="!destructive()"
          data-testid="confirm-accept"
          (click)="accept()"
        >
          {{ confirmLabel() }}
        </button>
      </div>
    </dialog>
  `,
})
export class ConfirmDialogComponent {
  readonly open = input(false);
  readonly title = input.required<string>();
  readonly message = input('');
  readonly confirmLabel = input('Confirm');
  readonly cancelLabel = input('Cancel');
  readonly destructive = input(true);

  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  private readonly dialogRef = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    effect(() => {
      const element = this.dialogRef().nativeElement;
      if (this.open() && !element.open) {
        element.showModal();
      } else if (!this.open() && element.open) {
        element.close();
      }
    });
  }

  accept(): void {
    this.dialogRef().nativeElement.close();
    this.confirmed.emit();
  }

  close(): void {
    this.dialogRef().nativeElement.close();
  }

  onCancel(event: Event): void {
    // Escape closes the dialog; make sure the parent's `open` input is reset.
    event.preventDefault();
    this.close();
  }
}
