import { Injectable, signal } from '@angular/core';

export type ToastKind = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

/**
 * Transient notifications.
 *
 * Deliberately tiny: a signal holding the current toasts and three helpers.
 * The container component renders them into an aria-live region so a screen
 * reader announces "Answers saved" without the user having to go looking.
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private nextId = 1;
  private readonly items = signal<Toast[]>([]);

  readonly toasts = this.items.asReadonly();

  success(message: string, timeoutMs = 3500): void {
    this.push('success', message, timeoutMs);
  }

  error(message: string, timeoutMs = 6000): void {
    // Errors stay on screen longer: they usually need reading, not glancing at.
    this.push('error', message, timeoutMs);
  }

  info(message: string, timeoutMs = 4000): void {
    this.push('info', message, timeoutMs);
  }

  dismiss(id: number): void {
    this.items.update((toasts) => toasts.filter((toast) => toast.id !== id));
  }

  clear(): void {
    this.items.set([]);
  }

  private push(kind: ToastKind, message: string, timeoutMs: number): void {
    const id = this.nextId++;
    this.items.update((toasts) => [...toasts, { id, kind, message }]);
    if (timeoutMs > 0) {
      setTimeout(() => this.dismiss(id), timeoutMs);
    }
  }
}
