import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

/**
 * Landing page for a signed-out visitor. A signed-in user is sent straight to
 * their dashboard - there is nothing here they need.
 */
@Component({
  selector: 'app-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  styles: [
    `
      .hero {
        display: grid;
        gap: var(--s-5);
        align-items: center;
        grid-template-columns: 1.15fr 0.85fr;
        padding: var(--s-7) 0;
      }
      .hero h1 {
        font-size: clamp(1.9rem, 4vw, 2.6rem);
        letter-spacing: -0.03em;
      }
      .hero p.lead {
        color: var(--c-text-muted);
        font-size: var(--fs-md);
        margin-top: var(--s-3);
        max-width: 54ch;
      }
      .points {
        display: grid;
        gap: var(--s-3);
      }
      .point {
        display: grid;
        gap: var(--s-1);
        padding: var(--s-3) var(--s-4);
        background: var(--c-surface);
        border: 1px solid var(--c-border);
        border-radius: var(--radius);
      }
      .point strong {
        font-size: var(--fs-sm);
      }
      .point span {
        font-size: var(--fs-sm);
        color: var(--c-text-muted);
      }
      @media (max-width: 860px) {
        .hero {
          grid-template-columns: 1fr;
          padding: var(--s-5) 0;
        }
      }
    `,
  ],
  template: `
    <div class="container">
      <section class="hero">
        <div>
          <span class="badge badge--brand">Practice. Review. Improve.</span>
          <h1 class="mt-3">Timed practice exams with real feedback</h1>
          <p class="lead">
            Sit full-length papers under exam conditions, get a per-topic breakdown of where you
            lost marks, and watch your scores move over time. Your answers save as you go, so a
            closed tab never costs you an attempt.
          </p>
          <div class="row mt-5">
            <a class="btn btn--primary btn--lg" routerLink="/register">Create a free account</a>
            <a class="btn btn--secondary btn--lg" routerLink="/exams">Browse the catalogue</a>
          </div>
          <p class="small muted mt-4">
            Already have an account? <a routerLink="/login">Sign in</a>.
          </p>
        </div>

        <div class="points">
          <div class="point">
            <strong>Server-enforced timing</strong>
            <span>
              The countdown is anchored to a deadline recorded on the server when you start, so it
              cannot be paused or edited from the browser.
            </span>
          </div>
          <div class="point">
            <strong>Autosave and recovery</strong>
            <span>
              Every answer is saved as you pick it. Refresh, lose your connection or come back
              later - the attempt resumes exactly where you left it.
            </span>
          </div>
          <div class="point">
            <strong>Explanations for every question</strong>
            <span>
              After submitting, review each question with the correct answer and the reasoning,
              plus accuracy per topic so you know what to practise next.
            </span>
          </div>
        </div>
      </section>
    </div>
  `,
})
export class HomePage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  constructor() {
    if (this.auth.isAuthenticated()) {
      void this.router.navigate(['/dashboard'], { replaceUrl: true });
    }
  }
}
