import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  AnswerDraft,
  AttemptHistoryQuery,
  AttemptResultDetail,
  AttemptResultSummary,
  AttemptStateView,
  Paginated,
  SaveAnswersResult,
} from '@examprep/shared';
import { API_BASE_URL, API_V1 } from '../api/api.config';
import { toParams } from './exam.service';

/** Thin, typed transport for the attempt endpoints. No state lives here. */
@Injectable({ providedIn: 'root' })
export class AttemptService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL) + API_V1 + '/attempts';

  /** Idempotent on the server: resumes an existing attempt if there is one. */
  start(examId: string): Promise<AttemptStateView> {
    return firstValueFrom(this.http.post<AttemptStateView>(this.base, { examId }));
  }

  getState(attemptId: string): Promise<AttemptStateView> {
    return firstValueFrom(this.http.get<AttemptStateView>(`${this.base}/${attemptId}`));
  }

  saveAnswers(attemptId: string, answers: AnswerDraft[]): Promise<SaveAnswersResult> {
    return firstValueFrom(
      this.http.patch<SaveAnswersResult>(`${this.base}/${attemptId}/answers`, { answers }),
    );
  }

  submit(attemptId: string, answers?: AnswerDraft[]): Promise<AttemptResultSummary> {
    return firstValueFrom(
      this.http.post<AttemptResultSummary>(
        `${this.base}/${attemptId}/submit`,
        answers?.length ? { answers } : {},
      ),
    );
  }

  getResult(attemptId: string): Promise<AttemptResultDetail> {
    return firstValueFrom(
      this.http.get<AttemptResultDetail>(`${this.base}/${attemptId}/result`),
    );
  }

  listAttempts(query: Partial<AttemptHistoryQuery> = {}): Promise<Paginated<AttemptResultSummary>> {
    return firstValueFrom(
      this.http.get<Paginated<AttemptResultSummary>>(this.base, { params: toParams(query) }),
    );
  }
}
