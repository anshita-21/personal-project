import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  AdminExamQuery,
  AdminExamSummary,
  ExamDetail,
  ExamInput,
  ExamPublishCheck,
  ExamQuestionsInput,
  Paginated,
  TopicInput,
  TopicView,
} from '@examprep/shared';
import { API_BASE_URL, API_V1 } from '../api/api.config';
import { toParams } from './exam.service';

/** The authoring view of a question, including the answer key. Admin only. */
export interface AdminQuestionView {
  id: string;
  prompt: string;
  explanation: string | null;
  position: number;
  points: number;
  topic: TopicView;
  options: { id: string; text: string; isCorrect: boolean; position: number }[];
}

@Injectable({ providedIn: 'root' })
export class AdminService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(API_BASE_URL) + API_V1 + '/admin';

  listExams(query: Partial<AdminExamQuery>): Promise<Paginated<AdminExamSummary>> {
    return firstValueFrom(
      this.http.get<Paginated<AdminExamSummary>>(`${this.base}/exams`, {
        params: toParams(query),
      }),
    );
  }

  getExam(id: string): Promise<ExamDetail> {
    return firstValueFrom(this.http.get<ExamDetail>(`${this.base}/exams/${id}`));
  }

  getQuestions(id: string): Promise<AdminQuestionView[]> {
    return firstValueFrom(
      this.http.get<AdminQuestionView[]>(`${this.base}/exams/${id}/questions`),
    );
  }

  createExam(input: ExamInput): Promise<ExamDetail> {
    return firstValueFrom(this.http.post<ExamDetail>(`${this.base}/exams`, input));
  }

  updateExam(id: string, input: ExamInput): Promise<ExamDetail> {
    return firstValueFrom(this.http.patch<ExamDetail>(`${this.base}/exams/${id}`, input));
  }

  replaceQuestions(id: string, input: ExamQuestionsInput): Promise<ExamDetail> {
    return firstValueFrom(
      this.http.put<ExamDetail>(`${this.base}/exams/${id}/questions`, input),
    );
  }

  publishCheck(id: string): Promise<ExamPublishCheck> {
    return firstValueFrom(
      this.http.get<ExamPublishCheck>(`${this.base}/exams/${id}/publish-check`),
    );
  }

  publish(id: string): Promise<ExamDetail> {
    return firstValueFrom(this.http.post<ExamDetail>(`${this.base}/exams/${id}/publish`, {}));
  }

  archive(id: string): Promise<ExamDetail> {
    return firstValueFrom(this.http.post<ExamDetail>(`${this.base}/exams/${id}/archive`, {}));
  }

  unpublish(id: string): Promise<ExamDetail> {
    return firstValueFrom(this.http.post<ExamDetail>(`${this.base}/exams/${id}/unpublish`, {}));
  }

  deleteExam(id: string): Promise<void> {
    return firstValueFrom(this.http.delete<void>(`${this.base}/exams/${id}`));
  }

  createTopic(input: TopicInput): Promise<TopicView> {
    return firstValueFrom(this.http.post<TopicView>(`${this.base}/topics`, input));
  }
}
