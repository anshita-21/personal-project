import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="container page">
      <div class="card stack" style="max-width: 520px; margin: 0 auto; text-align: center">
        <h1>Page not found</h1>
        <p class="muted">
          The page you asked for does not exist. It may have been moved, or the link may be
          mistyped.
        </p>
        <div class="row" style="justify-content: center">
          <a class="btn btn--primary" routerLink="/exams">Browse exams</a>
          <a class="btn btn--secondary" routerLink="/dashboard">Go to dashboard</a>
        </div>
      </div>
    </div>
  `,
})
export class NotFoundPage {}
