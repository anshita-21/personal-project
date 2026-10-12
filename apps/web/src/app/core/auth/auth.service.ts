import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  AuthResponse,
  ChangePasswordInput,
  LoginInput,
  RegisterInput,
  UpdateProfileInput,
  UserView,
} from '@examprep/shared';
import { API_BASE_URL, API_V1 } from '../api/api.config';

/**
 * Session state for the whole app.
 *
 * The browser never holds the token - it is in an httpOnly cookie it cannot
 * read - so "am I signed in?" is answered by asking the server once at startup
 * (`restoreSession`) and then by keeping the returned user in a signal. There
 * is no token in localStorage to steal, and no client-side expiry to get wrong.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL) + API_V1 + '/auth';

  private readonly currentUser = signal<UserView | null>(null);
  private readonly resolved = signal(false);

  readonly user = this.currentUser.asReadonly();
  /** False until the startup session probe has finished. Guards wait for this. */
  readonly sessionResolved = this.resolved.asReadonly();
  readonly isAuthenticated = computed(() => this.currentUser() !== null);
  readonly isAdmin = computed(() => this.currentUser()?.role === 'ADMIN');
  readonly displayName = computed(() => this.currentUser()?.name ?? '');

  /**
   * Called once during application bootstrap. A 401 here is the normal
   * "not signed in" case, not an error, so it resolves to null quietly.
   */
  async restoreSession(): Promise<void> {
    try {
      const response = await firstValueFrom(this.http.get<AuthResponse>(`${this.base}/me`));
      this.currentUser.set(response.user);
    } catch {
      this.currentUser.set(null);
    } finally {
      this.resolved.set(true);
    }
  }

  async login(input: LoginInput): Promise<UserView> {
    const response = await firstValueFrom(
      this.http.post<AuthResponse>(`${this.base}/login`, input),
    );
    this.currentUser.set(response.user);
    return response.user;
  }

  async register(input: RegisterInput): Promise<UserView> {
    const response = await firstValueFrom(
      this.http.post<AuthResponse>(`${this.base}/register`, input),
    );
    this.currentUser.set(response.user);
    return response.user;
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.http.post<void>(`${this.base}/logout`, {}));
    } finally {
      // Clear locally even if the request failed - the user asked to be signed
      // out, and leaving stale state on screen would be worse than a retry.
      this.currentUser.set(null);
    }
  }

  async updateProfile(input: UpdateProfileInput): Promise<UserView> {
    const response = await firstValueFrom(
      this.http.patch<AuthResponse>(`${this.base}/me`, input),
    );
    this.currentUser.set(response.user);
    return response.user;
  }

  async changePassword(input: ChangePasswordInput): Promise<void> {
    await firstValueFrom(this.http.post<void>(`${this.base}/me/password`, input));
  }

  async logoutEverywhere(): Promise<void> {
    await firstValueFrom(this.http.post<void>(`${this.base}/logout-all`, {}));
    this.currentUser.set(null);
  }

  /** Called by the HTTP interceptor when the server rejects our cookie. */
  clearSession(): void {
    this.currentUser.set(null);
  }
}
