import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/notifications/toast.service';
import { applyApiErrorToForm, controlError, emailValidators } from './auth-form.util';

@Component({
  selector: 'app-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink],
  styles: [
    `
      .auth-wrap {
        max-width: 420px;
        margin: var(--s-7) auto;
      }
      .demo {
        margin-top: var(--s-4);
        font-size: var(--fs-sm);
      }
      .demo button {
        font: inherit;
      }
    `,
  ],
  template: `
    <div class="container">
      <div class="auth-wrap">
        <div class="card stack">
          <div>
            <h1>Sign in</h1>
            <p class="muted small mt-2">Continue your practice where you left off.</p>
          </div>

          @if (formError()) {
            <div class="alert alert--danger" role="alert" data-testid="login-error">
              {{ formError() }}
            </div>
          }

          <form class="stack" [formGroup]="form" (ngSubmit)="submit()" novalidate>
            <div class="field">
              <label class="field__label" for="email">Email</label>
              <input
                id="email"
                class="input"
                type="email"
                formControlName="email"
                autocomplete="email"
                [attr.aria-invalid]="emailError() ? 'true' : null"
                [attr.aria-describedby]="emailError() ? 'email-error' : null"
              />
              @if (emailError()) {
                <span class="field__error" id="email-error">{{ emailError() }}</span>
              }
            </div>

            <div class="field">
              <label class="field__label" for="password">Password</label>
              <input
                id="password"
                class="input"
                type="password"
                formControlName="password"
                autocomplete="current-password"
                [attr.aria-invalid]="passwordError() ? 'true' : null"
                [attr.aria-describedby]="passwordError() ? 'password-error' : null"
              />
              @if (passwordError()) {
                <span class="field__error" id="password-error">{{ passwordError() }}</span>
              }
            </div>

            <button
              type="submit"
              class="btn btn--primary btn--block"
              [disabled]="submitting()"
              data-testid="login-submit"
            >
              {{ submitting() ? 'Signing in...' : 'Sign in' }}
            </button>
          </form>

          <p class="small muted">
            New here? <a routerLink="/register">Create an account</a>.
          </p>
        </div>

        <!--
          Demo credentials for reviewers. These are the accounts created by the
          seed script and documented in the README - not production secrets. A
          real deployment seeds different values from the environment (see
          docs/deployment.md).
        -->
        <div class="card demo stack-sm">
          <strong>Demo accounts</strong>
          <div class="row">
            <button type="button" class="btn btn--secondary btn--sm" (click)="useDemo('student')">
              Student
            </button>
            <button type="button" class="btn btn--secondary btn--sm" (click)="useDemo('admin')">
              Administrator
            </button>
          </div>
          <span class="xs muted">Fills the form with the seeded demo credentials.</span>
        </div>
      </div>
    </div>
  `,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);

  protected readonly submitting = signal(false);
  protected readonly formError = signal('');

  protected readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', emailValidators],
    password: ['', [Validators.required]],
  });

  protected emailError(): string | null {
    const control = this.form.controls.email;
    return control.errors?.['server']
      ? String(control.errors['server'])
      : controlError(control, 'Email');
  }

  protected passwordError(): string | null {
    const control = this.form.controls.password;
    return control.errors?.['server']
      ? String(control.errors['server'])
      : controlError(control, 'Password');
  }

  protected useDemo(kind: 'student' | 'admin'): void {
    this.form.setValue(
      kind === 'admin'
        ? { email: 'admin@examprep.dev', password: 'Admin123!' }
        : { email: 'student@examprep.dev', password: 'Student123!' },
    );
  }

  protected async submit(): Promise<void> {
    this.formError.set('');
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    try {
      const user = await this.auth.login(this.form.getRawValue());
      this.toasts.success(`Welcome back, ${user.name.split(' ')[0]}.`);
      await this.router.navigateByUrl(this.returnUrl());
    } catch (error) {
      this.formError.set(
        applyApiErrorToForm(error, {
          email: this.form.controls.email,
          password: this.form.controls.password,
        }),
      );
    } finally {
      this.submitting.set(false);
    }
  }

  /**
   * Honours ?returnUrl so a user bounced off a protected page lands back on it,
   * but only for same-site paths - an absolute URL here would be an open
   * redirect.
   */
  private returnUrl(): string {
    const requested = this.router.parseUrl(this.router.url).queryParams['returnUrl'];
    if (typeof requested === 'string' && requested.startsWith('/') && !requested.startsWith('//')) {
      return requested;
    }
    return '/dashboard';
  }
}
