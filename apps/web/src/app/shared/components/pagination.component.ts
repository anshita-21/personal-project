import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

/**
 * Pagination control.
 *
 * Shows a windowed set of page numbers rather than every page, so a catalogue
 * with 200 pages does not render 200 buttons. The current page is marked with
 * aria-current so assistive technology can report position.
 */
@Component({
  selector: 'app-pagination',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      nav {
        display: flex;
        flex-wrap: wrap;
        gap: var(--s-2);
        align-items: center;
        justify-content: space-between;
        margin-top: var(--s-4);
      }
      .pages {
        display: flex;
        gap: var(--s-1);
      }
      .page-btn[aria-current='page'] {
        background: var(--c-brand);
        border-color: var(--c-brand);
        color: #fff;
      }
    `,
  ],
  template: `
    @if (totalPages() > 1) {
      <nav [attr.aria-label]="label()">
        <p class="small muted nums">
          {{ rangeStart() }}-{{ rangeEnd() }} of {{ total() }}
        </p>
        <div class="pages">
          <button
            type="button"
            class="btn btn--secondary btn--sm"
            [disabled]="page() === 1"
            (click)="pageChange.emit(page() - 1)"
          >
            Previous
          </button>
          @for (candidate of windowPages(); track candidate) {
            <button
              type="button"
              class="btn btn--secondary btn--sm page-btn"
              [attr.aria-current]="candidate === page() ? 'page' : null"
              (click)="pageChange.emit(candidate)"
            >
              {{ candidate }}
            </button>
          }
          <button
            type="button"
            class="btn btn--secondary btn--sm"
            [disabled]="page() >= totalPages()"
            (click)="pageChange.emit(page() + 1)"
          >
            Next
          </button>
        </div>
      </nav>
    }
  `,
})
export class PaginationComponent {
  readonly page = input.required<number>();
  readonly pageSize = input.required<number>();
  readonly total = input.required<number>();
  readonly totalPages = input.required<number>();
  readonly label = input('Pagination');

  readonly pageChange = output<number>();

  readonly rangeStart = computed(() =>
    this.total() === 0 ? 0 : (this.page() - 1) * this.pageSize() + 1,
  );
  readonly rangeEnd = computed(() => Math.min(this.page() * this.pageSize(), this.total()));

  readonly windowPages = computed(() => {
    const total = this.totalPages();
    const current = this.page();
    const span = 2;
    const from = Math.max(1, Math.min(current - span, total - span * 2));
    const to = Math.min(total, Math.max(current + span, span * 2 + 1));
    const pages: number[] = [];
    for (let page = from; page <= to; page += 1) {
      pages.push(page);
    }
    return pages;
  });
}
