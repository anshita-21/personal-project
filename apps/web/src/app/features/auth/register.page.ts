import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { PASSWORD_RULES_HINT } from '@examprep/shared';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/notifications/toast.service';
import {
  applyApiErrorToForm,
  controlError,
  emailValidators,
  nameValidators,
  newPasswordValidators,
} from './auth-form.util';

@Component({
  selector: 'app-register',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink],
  styles: [
    `
      .auth-wrap {
        max-width: 440px;
        margin: var(--s-7) auto;
      }
    `,
  ],
  template: `
    <div class="container">
      <div class="auth-wrap card stack">
        <div>
          <h1>Create your account</h1>
          <p class="muted small mt-2">
            Free, and no payment details. You will be signed in straight away.
          </p>
        </div>

        @if (formError()) {
          <div class="alert alert--danger" role="alert" data-testid="register-error">
            {{ formError() }}
          </div>
        }

        <form class="stack" [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <div class="field">
            <label class="field__label" for="name">Full name</label>
            <input
              id="name"
              class="input"
              formControlName="name"
              autocomplete="name"
              [attr.aria-invalid]="error('name', 'Name') ? 'true' : null"
            />
            @if (error('name', 'Name')) {
              <span class="field__error">{{ error('name', 'Name') }}</span>
            }
          </div>

          <div class="field">
            <label class="field__label" for="email">Email</label>
            <input
              id="email"
              class="input"
              type="email"
              formControlName="email"
              autocomplete="email"
              [attr.aria-invalid]="error('email', 'Email') ? 'true' : null"
            />
            @if (error('email', 'Email')) {
              <span class="field__error">{{ error('email', 'Email') }}</span>
            }
          </div>

          <div class="field">
            <label class="field__label" for="password">Password</label>
            <input
              id="password"
              class="input"
              type="password"
              formControlName="password"
              autocomplete="new-password"
              aria-describedby="password-hint"
              [attr.aria-invalid]="error('password', 'Password') ? 'true' : null"
            />
            <span class="field__hint" id="password-hint">{{ passwordHint }}</span>
            @if (error('password', 'Password')) {
              <span class="field__error">{{ error('password', 'Password') }}</span>
            }
          </div>

          <button
            type="submit"
            class="btn btn--primary btn--block"
            [disabled]="submitting()"
            data-testid="register-submit"
          >
            {{ submitting() ? 'Creating account...' : 'Create account' }}
          </button>
        </form>

        <p class="small muted">Already registered? <a routerLink="/login">Sign in</a>.</p>
      </div>
    </div>
  `,
})
export class RegisterPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);

  protected readonly passwordHint = PASSWORD_RULES_HINT;
  protected readonly submitting = signal(false);
  protected readonly formError = signal('');

  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', nameValidators],
    email: ['', emailValidators],
    password: ['', newPasswordValidators],
  });

  protected error(field: 'name' | 'email' | 'password', label: string): string | null {
    const control = this.form.controls[field];
    return control.errors?.['server']
      ? String(control.errors['server'])
      : controlError(control, label);
  }

  protected async submit(): Promise<void> {
    this.formError.set('');
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    try {
      await this.auth.register(this.form.getRawValue());
      this.toasts.success('Account created. Pick an exam to get started.');
      await this.router.navigate(['/dashboard']);
    } catch (error) {
      this.formError.set(
        applyApiErrorToForm(error, {
          name: this.form.controls.name,
          email: this.form.controls.email,
          password: this.form.controls.password,
        }),
      );
    } finally {
      this.submitting.set(false);
    }
  }
}
