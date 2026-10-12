import type { AbstractControl, ValidationErrors} from '@angular/forms';
import { Validators } from '@angular/forms';
import { PASSWORD_MIN_LENGTH, passwordSchema } from '@examprep/shared';
import { ApiError } from '../../core/api/api-error';

/**
 * Validators that reuse the shared Zod schema.
 *
 * The password policy is defined once, in packages/shared, and is enforced in
 * three places: the Angular form (instant feedback), the API (the real check)
 * and a unit test on the schema. A policy change is a one-line edit that cannot
 * leave the form and the server disagreeing.
 */
export function zodPasswordValidator(control: AbstractControl): ValidationErrors | null {
  const value = control.value;
  if (typeof value !== 'string' || value.length === 0) {
    return null;
  }
  const result = passwordSchema.safeParse(value);
  return result.success ? null : { password: result.error.issues[0]?.message ?? 'Invalid password.' };
}

export const emailValidators = [Validators.required, Validators.email, Validators.maxLength(255)];
export const nameValidators = [Validators.required, Validators.minLength(2), Validators.maxLength(80)];
export const newPasswordValidators = [
  Validators.required,
  Validators.minLength(PASSWORD_MIN_LENGTH),
  zodPasswordValidator,
];

/** First human-readable message for a control, or null when it is valid. */
export function controlError(control: AbstractControl | null, label: string): string | null {
  if (!control || !(control.touched || control.dirty) || !control.errors) {
    return null;
  }
  const errors = control.errors;
  if (errors['required']) {
    return `${label} is required.`;
  }
  if (errors['email']) {
    return 'Enter a valid email address.';
  }
  if (errors['password']) {
    return String(errors['password']);
  }
  if (errors['minlength']) {
    const requirement = errors['minlength'] as { requiredLength: number };
    return `${label} must be at least ${requirement.requiredLength} characters.`;
  }
  if (errors['maxlength']) {
    const requirement = errors['maxlength'] as { requiredLength: number };
    return `${label} must be at most ${requirement.requiredLength} characters.`;
  }
  if (errors['min']) {
    return `${label} is too small.`;
  }
  if (errors['max']) {
    return `${label} is too large.`;
  }
  return `${label} is invalid.`;
}

/**
 * Maps an API failure onto the form: field-level issues go to their controls,
 * and whatever is left becomes the form-level message.
 */
export function applyApiErrorToForm(
  error: unknown,
  controls: Record<string, AbstractControl | null>,
): string {
  if (!ApiError.isApiError(error)) {
    return 'Something went wrong. Please try again.';
  }

  let consumed = 0;
  for (const issue of error.details) {
    const control = controls[issue.path];
    if (control) {
      control.setErrors({ ...(control.errors ?? {}), server: issue.message });
      control.markAsTouched();
      consumed += 1;
    }
  }

  if (consumed > 0 && consumed === error.details.length) {
    return '';
  }
  return error.message;
}
