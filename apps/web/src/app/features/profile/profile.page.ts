import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { PASSWORD_RULES_HINT } from '@examprep/shared';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../core/notifications/toast.service';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog.component';
import {
  applyApiErrorToForm,
  controlError,
  nameValidators,
  newPasswordValidators,
} from '../auth/auth-form.util';
import { formatDate } from '../../shared/util/format';

/**
 * Profile and account settings.
 *
 * Two independent forms rather than one: a failed password change must not
 * discard an edited display name, and the two have different validation and
 * different consequences.
 */
@Component({
  selector: 'app-profile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ConfirmDialogComponent],
  styles: [
    `
      .layout {
        display: grid;
        gap: var(--s-4);
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 340px), 1fr));
        align-items: start;
      }
    `,
  ],
  template: `
    <div class="container page">
      <div class="page-head">
        <div>
          <h1>Profile and settings</h1>
          <p>Your account details, password and active sessions.</p>
        </div>
      </div>

      <div class="layout">
        <!-- Account ----------------------------------------------------- -->
        <section class="card stack">
          <div class="section-title"><h2>Your details</h2></div>

          <dl class="stack-sm small">
            <div class="row-between">
              <dt class="muted">Email</dt>
              <dd class="strong" style="margin: 0">{{ auth.user()?.email }}</dd>
            </div>
            <div class="row-between">
              <dt class="muted">Role</dt>
              <dd style="margin: 0">
                <span class="badge badge--brand">{{ auth.user()?.role }}</span>
              </dd>
            </div>
            <div class="row-between">
              <dt class="muted">Member since</dt>
              <dd style="margin: 0">{{ memberSince() }}</dd>
            </div>
          </dl>

          <form class="stack" [formGroup]="profileForm" (ngSubmit)="saveProfile()" novalidate>
            <div class="field">
              <label class="field__label" for="name">Display name</label>
              <input id="name" class="input" formControlName="name" autocomplete="name" />
              @if (profileError('name', 'Name')) {
                <span class="field__error">{{ profileError('name', 'Name') }}</span>
              }
            </div>
            <div>
              <button
                type="submit"
                class="btn btn--primary"
                [disabled]="savingProfile() || profileForm.pristine"
              >
                {{ savingProfile() ? 'Saving...' : 'Save name' }}
              </button>
            </div>
          </form>
        </section>

        <!-- Password --------------------------------------------------- -->
        <section class="card stack">
          <div class="section-title"><h2>Change password</h2></div>
          <p class="small muted">
            Changing your password signs you out of every other device. This one stays signed in.
          </p>

          @if (passwordError()) {
            <div class="alert alert--danger" role="alert">{{ passwordError() }}</div>
          }

          <form class="stack" [formGroup]="passwordForm" (ngSubmit)="savePassword()" novalidate>
            <div class="field">
              <label class="field__label" for="currentPassword">Current password</label>
              <input
                id="currentPassword"
                class="input"
                type="password"
                formControlName="currentPassword"
                autocomplete="current-password"
              />
              @if (fieldError('currentPassword', 'Current password')) {
                <span class="field__error">
                  {{ fieldError('currentPassword', 'Current password') }}
                </span>
              }
            </div>

            <div class="field">
              <label class="field__label" for="newPassword">New password</label>
              <input
                id="newPassword"
                class="input"
                type="password"
                formControlName="newPassword"
                autocomplete="new-password"
                aria-describedby="new-password-hint"
              />
              <span class="field__hint" id="new-password-hint">{{ passwordHint }}</span>
              @if (fieldError('newPassword', 'New password')) {
                <span class="field__error">{{ fieldError('newPassword', 'New password') }}</span>
              }
            </div>

            <div>
              <button type="submit" class="btn btn--primary" [disabled]="savingPassword()">
                {{ savingPassword() ? 'Updating...' : 'Update password' }}
              </button>
            </div>
          </form>
        </section>

        <!-- Sessions --------------------------------------------------- -->
        <section class="card stack">
          <div class="section-title"><h2>Sessions</h2></div>
          <p class="small muted">
            Signing out everywhere revokes every session, including this one. Use it if you have
            signed in on a device you no longer control.
          </p>
          <div>
            <button type="button" class="btn btn--danger" (click)="confirmingLogoutAll.set(true)">
              Sign out everywhere
            </button>
          </div>
        </section>
      </div>

      <app-confirm-dialog
        [open]="confirmingLogoutAll()"
        title="Sign out of every device?"
        message="All sessions will be revoked and you will need to sign in again here."
        confirmLabel="Sign out everywhere"
        (confirmed)="logoutEverywhere()"
        (cancelled)="confirmingLogoutAll.set(false)"
      />
    </div>
  `,
})
export class ProfilePage {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  protected readonly passwordHint = PASSWORD_RULES_HINT;
  protected readonly savingProfile = signal(false);
  protected readonly savingPassword = signal(false);
  protected readonly passwordError = signal('');
  protected readonly confirmingLogoutAll = signal(false);

  protected readonly profileForm = this.fb.nonNullable.group({
    name: [this.auth.user()?.name ?? '', nameValidators],
  });

  protected readonly passwordForm = this.fb.nonNullable.group({
    currentPassword: ['', [Validators.required]],
    newPassword: ['', newPasswordValidators],
  });

  protected memberSince(): string {
    return formatDate(this.auth.user()?.createdAt ?? null);
  }

  protected profileError(field: 'name', label: string): string | null {
    const control = this.profileForm.controls[field];
    return control.errors?.['server']
      ? String(control.errors['server'])
      : controlError(control, label);
  }

  protected fieldError(field: 'currentPassword' | 'newPassword', label: string): string | null {
    const control = this.passwordForm.controls[field];
    return control.errors?.['server']
      ? String(control.errors['server'])
      : controlError(control, label);
  }

  protected async saveProfile(): Promise<void> {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }
    this.savingProfile.set(true);
    try {
      await this.auth.updateProfile(this.profileForm.getRawValue());
      this.profileForm.markAsPristine();
      this.toasts.success('Your name has been updated.');
    } catch (error) {
      const message = applyApiErrorToForm(error, { name: this.profileForm.controls.name });
      if (message) {
        this.toasts.error(message);
      }
    } finally {
      this.savingProfile.set(false);
    }
  }

  protected async savePassword(): Promise<void> {
    this.passwordError.set('');
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }
    this.savingPassword.set(true);
    try {
      await this.auth.changePassword(this.passwordForm.getRawValue());
      this.passwordForm.reset({ currentPassword: '', newPassword: '' });
      this.toasts.success('Password updated. Other devices have been signed out.');
    } catch (error) {
      this.passwordError.set(
        applyApiErrorToForm(error, {
          currentPassword: this.passwordForm.controls.currentPassword,
          newPassword: this.passwordForm.controls.newPassword,
        }),
      );
    } finally {
      this.savingPassword.set(false);
    }
  }

  protected async logoutEverywhere(): Promise<void> {
    this.confirmingLogoutAll.set(false);
    try {
      await this.auth.logoutEverywhere();
      this.toasts.info('All sessions revoked.');
      await this.router.navigate(['/login']);
    } catch {
      this.toasts.error('Could not revoke the sessions. Please try again.');
    }
  }
}
