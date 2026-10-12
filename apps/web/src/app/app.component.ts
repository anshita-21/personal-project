import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth/auth.service';
import { ToastContainerComponent } from './shared/components/toast-container.component';

/**
 * Application shell: the header, the routed outlet and the notification stack.
 *
 * The admin area gets a `theme-admin` class on the shell, which re-points the
 * brand colour tokens. Learner and authoring screens then share every
 * component but are never visually confusable.
 */
@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, ToastContainerComponent],
  styles: [
    `
      .shell {
        min-height: 100vh;
        display: flex;
        flex-direction: column;
      }
      main {
        flex: 1 1 auto;
      }
      .user-chip {
        display: inline-flex;
        align-items: center;
        gap: var(--s-2);
        font-size: var(--fs-sm);
      }
      .avatar {
        display: grid;
        place-items: center;
        width: 28px;
        height: 28px;
        border-radius: var(--radius-pill);
        background: var(--c-brand-soft);
        color: var(--c-brand-text);
        font-weight: 700;
        font-size: var(--fs-xs);
      }
      .footer {
        border-top: 1px solid var(--c-border);
        padding: var(--s-4) 0;
        color: var(--c-text-subtle);
        font-size: var(--fs-xs);
        background: var(--c-surface);
      }
      @media (max-width: 640px) {
        .user-chip .name {
          display: none;
        }
      }
    `,
  ],
  template: `
    <div class="shell" [class.theme-admin]="isAdminArea()">
      <a class="skip-link" href="#main">Skip to main content</a>

      <header class="app-header">
        <div class="container app-header__inner">
          <a class="brand" [routerLink]="auth.isAuthenticated() ? '/dashboard' : '/'">
            <span class="brand__mark" aria-hidden="true">EP</span>
            <span>ExamPrep</span>
          </a>

          <nav class="nav" aria-label="Main">
            @if (auth.isAuthenticated()) {
              <a class="nav__link" routerLink="/dashboard" routerLinkActive="active">Dashboard</a>
              <a class="nav__link" routerLink="/exams" routerLinkActive="active">Exams</a>
              <a class="nav__link" routerLink="/attempts" routerLinkActive="active">My attempts</a>
              @if (auth.isAdmin()) {
                <a class="nav__link" routerLink="/admin" routerLinkActive="active">Admin</a>
              }
            } @else {
              <a class="nav__link" routerLink="/exams" routerLinkActive="active">Exams</a>
            }
          </nav>

          <span class="spacer"></span>

          @if (auth.isAuthenticated()) {
            <a class="user-chip" routerLink="/profile" aria-label="Profile and settings">
              <span class="avatar" aria-hidden="true">{{ initials() }}</span>
              <span class="name">{{ auth.displayName() }}</span>
            </a>
            <button type="button" class="btn btn--ghost btn--sm" (click)="signOut()">
              Sign out
            </button>
          } @else {
            <a class="btn btn--ghost btn--sm" routerLink="/login">Sign in</a>
            <a class="btn btn--primary btn--sm" routerLink="/register">Create account</a>
          }
        </div>
      </header>

      <main id="main" tabindex="-1">
        <router-outlet />
      </main>

      <footer class="footer">
        <div class="container">
          Exam Prep &amp; Assessment Platform - a portfolio project. Angular, Node.js, Express,
          PostgreSQL, Prisma, REST + GraphQL.
        </div>
      </footer>

      <app-toast-container />
    </div>
  `,
})
export class AppComponent {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly initials = computed(() => {
    // Only letters count: a display name like "Alex Morgan (Admin)" must not
    // produce "A(" in the avatar.
    const words = this.auth
      .displayName()
      .split(/\s+/)
      .map((word) => word.replace(/[^\p{L}]/gu, ''))
      .filter((word) => word.length > 0);

    if (words.length === 0) {
      return '?';
    }
    const first = words[0]?.[0] ?? '';
    const last = words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : '';
    return (first + last).toUpperCase();
  });

  protected isAdminArea(): boolean {
    return this.router.url.startsWith('/admin');
  }

  protected async signOut(): Promise<void> {
    await this.auth.logout();
    await this.router.navigate(['/login']);
  }
}
