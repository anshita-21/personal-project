import type { ComponentFixture} from '@angular/core/testing';
import { TestBed } from '@angular/core/testing';
import { PaginationComponent } from './pagination.component';

describe('PaginationComponent', () => {
  let fixture: ComponentFixture<PaginationComponent>;

  function render(page: number, pageSize: number, total: number): void {
    fixture = TestBed.createComponent(PaginationComponent);
    fixture.componentRef.setInput('page', page);
    fixture.componentRef.setInput('pageSize', pageSize);
    fixture.componentRef.setInput('total', total);
    fixture.componentRef.setInput('totalPages', Math.max(1, Math.ceil(total / pageSize)));
    fixture.detectChanges();
  }

  function text(): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  function pageButtons(): HTMLButtonElement[] {
    return Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('.page-btn'),
    ) as HTMLButtonElement[];
  }

  it('renders nothing when everything fits on one page', () => {
    render(1, 10, 7);
    expect(text().trim()).toBe('');
  });

  it('reports the visible range and the total', () => {
    render(2, 10, 45);
    expect(text()).toContain('11-20 of 45');
  });

  it('caps the range end at the total on the last page', () => {
    render(5, 10, 45);
    expect(text()).toContain('41-45 of 45');
  });

  it('marks the current page with aria-current', () => {
    render(3, 10, 100);
    const current = pageButtons().find((button) => button.getAttribute('aria-current') === 'page');
    expect(current?.textContent?.trim()).toBe('3');
  });

  it('windows the page numbers instead of rendering hundreds of buttons', () => {
    render(10, 10, 2000);
    expect(pageButtons().length).toBeLessThanOrEqual(5);
  });

  it('disables Previous on the first page and Next on the last', () => {
    render(1, 10, 45);
    const buttons = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ) as HTMLButtonElement[];
    expect(buttons[0]?.disabled).toBe(true);

    render(5, 10, 45);
    const last = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ) as HTMLButtonElement[];
    expect(last[last.length - 1]?.disabled).toBe(true);
  });

  it('emits the requested page number', () => {
    render(2, 10, 45);
    const emitted: number[] = [];
    fixture.componentInstance.pageChange.subscribe((page) => emitted.push(page));

    pageButtons()[0]?.click();
    fixture.detectChanges();

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toBeGreaterThanOrEqual(1);
  });
});
