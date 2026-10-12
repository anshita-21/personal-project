import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  ExamDetail,
  ExamQuery,
  ExamSummary,
  Paginated,
  TopicView,
} from '@examprep/shared';
import { API_BASE_URL, API_V1 } from '../api/api.config';

/**
 * Catalogue reads.
 *
 * Query parameters are built from the typed ExamQuery contract in the shared
 * package, so the frontend cannot ask for a sort column the backend would
 * reject - the two sides share one definition of what a valid query is.
 */
@Injectable({ providedIn: 'root' })
export class ExamService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL) + API_V1;

  listExams(query: Partial<ExamQuery>): Promise<Paginated<ExamSummary>> {
    return firstValueFrom(
      this.http.get<Paginated<ExamSummary>>(`${this.base}/exams`, {
        params: toParams(query),
      }),
    );
  }

  getExam(idOrSlug: string): Promise<ExamDetail> {
    return firstValueFrom(this.http.get<ExamDetail>(`${this.base}/exams/${idOrSlug}`));
  }

  listTopics(): Promise<TopicView[]> {
    return firstValueFrom(this.http.get<TopicView[]>(`${this.base}/topics`));
  }
}

/** Drops empty values so the URL never carries `?search=&topicId=`. */
export function toParams(query: Record<string, unknown>): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') {
      params[key] = String(value);
    }
  }
  return params;
}
