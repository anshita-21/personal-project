import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import type {
  FormArray,
  FormGroup} from '@angular/forms';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
  type FormControl,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  DIFFICULTIES,
  type ExamDetail,
  type ExamPublishCheck,
  type QuestionInput,
  type TopicView,
} from '@examprep/shared';
import { ApiError } from '../../core/api/api-error';
import { AdminService, type AdminQuestionView } from '../../core/data/admin.service';
import { ExamService } from '../../core/data/exam.service';
import { ToastService } from '../../core/notifications/toast.service';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog.component';
import {
  ErrorStateComponent,
  LoadingBlockComponent,
} from '../../shared/components/state-blocks.component';
import { controlError } from '../auth/auth-form.util';
import { difficultyLabel } from '../../shared/util/format';

type OptionGroup = FormGroup<{ text: FormControl<string> }>;
type QuestionGroup = FormGroup<{
  prompt: FormControl<string>;
  explanation: FormControl<string>;
  topicId: FormControl<string>;
  points: FormControl<number>;
  correctIndex: FormControl<number>;
  options: FormArray<OptionGroup>;
}>;

/**
 * Exam authoring.
 *
 * Two saves, deliberately separate: metadata (PATCH) and the question set
 * (PUT, replace-all in one transaction). An author can fix a typo in the title
 * without the 40-question body being re-sent and re-validated.
 *
 * The correct answer is modelled as a `correctIndex` radio rather than a
 * checkbox per option, because "exactly one correct option" is the rule the
 * API enforces - a radio group makes the invalid state unreachable in the UI
 * instead of catching it on submit.
 */
@Component({
  selector: 'app-admin-exam-edit',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    LoadingBlockComponent,
    ErrorStateComponent,
    ConfirmDialogComponent,
  ],
  styles: [
    `
      .columns {
        display: grid;
        gap: var(--s-4);
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
      }
      .question-card {
        border: 1px solid var(--c-border);
        border-radius: var(--radius);
        padding: var(--s-4);
        background: var(--c-surface);
      }
      .question-card + .question-card {
        margin-top: var(--s-3);
      }
      .option-row {
        display: grid;
        grid-template-columns: auto 1fr auto;
        gap: var(--s-3);
        align-items: center;
        margin-top: var(--s-2);
      }
      .sticky-actions {
        position: sticky;
        bottom: 0;
        display: flex;
        flex-wrap: wrap;
        gap: var(--s-3);
        align-items: center;
        justify-content: space-between;
        padding: var(--s-3) var(--s-4);
        margin-top: var(--s-4);
        background: var(--c-surface);
        border: 1px solid var(--c-border);
        border-radius: var(--radius);
        box-shadow: var(--shadow);
      }
    `,
  ],
  template: `
    <div class="container page">
      @if (loading()) {
        <app-loading-block [count]="2" [height]="200" label="Loading the exam" />
      } @else if (loadError()) {
        <app-error-state [message]="loadError()!" (retry)="reload()" />
        <p class="mt-3"><a routerLink="/admin/exams">Back to exams</a></p>
      } @else {
        <div class="page-head">
          <div>
            <nav class="small muted mb-2" aria-label="Breadcrumb">
              <a routerLink="/admin/exams">Exams</a> / <span>{{ isNew() ? 'New' : 'Edit' }}</span>
            </nav>
            <h1>{{ isNew() ? 'Create an exam' : exam()?.title }}</h1>
            @if (exam(); as detail) {
              <p class="small muted mt-2">
                <span class="badge" [class]="statusClass(detail.status)">{{ detail.status }}</span>
                &middot; {{ detail.questionCount }} questions &middot;
                {{ detail.totalPoints }} marks
              </p>
            }
          </div>
          @if (!isNew()) {
            <div class="row">
              <a
                class="btn btn--secondary"
                [routerLink]="['/admin/exams', examId(), 'preview']"
              >
                Preview
              </a>
              <button
                type="button"
                class="btn btn--primary"
                [disabled]="publishing()"
                data-testid="publish-exam"
                (click)="confirmPublish.set(true)"
              >
                {{ publishing() ? 'Publishing...' : 'Publish' }}
              </button>
            </div>
          }
        </div>

        <!-- Publish readiness ----------------------------------------- -->
        @if (!isNew() && publishCheck(); as check) {
          @if (check.publishable) {
            <div class="alert alert--success mb-4" role="status">
              <div>
                <span class="alert__title">Ready to publish</span>
                <div>Every publish check passes for this exam.</div>
              </div>
            </div>
          } @else {
            <div class="alert alert--warning mb-4" role="status" data-testid="publish-problems">
              <div>
                <span class="alert__title">Not ready to publish</span>
                <ul class="mt-2">
                  @for (problem of check.problems; track problem) {
                    <li>&middot; {{ problem }}</li>
                  }
                </ul>
              </div>
            </div>
          }
        }

        <!-- Metadata --------------------------------------------------- -->
        <section class="card stack mb-4">
          <div class="section-title"><h2>Exam details</h2></div>

          <form class="stack" [formGroup]="metaForm" (ngSubmit)="saveMeta()" novalidate>
            <div class="field">
              <label class="field__label" for="title">Title</label>
              <input id="title" class="input" formControlName="title" data-testid="exam-title" />
              @if (metaError('title', 'Title')) {
                <span class="field__error">{{ metaError('title', 'Title') }}</span>
              }
            </div>

            <div class="field">
              <label class="field__label" for="description">Description</label>
              <textarea
                id="description"
                class="textarea"
                formControlName="description"
                data-testid="exam-description"
              ></textarea>
              <span class="field__hint">
                Shown on the catalogue card and the exam detail page. At least 10 characters.
              </span>
              @if (metaError('description', 'Description')) {
                <span class="field__error">{{ metaError('description', 'Description') }}</span>
              }
            </div>

            <div class="columns">
              <div class="field">
                <label class="field__label" for="topicId">Primary topic</label>
                <select id="topicId" class="select" formControlName="topicId" data-testid="exam-topic">
                  <option value="">Choose a topic</option>
                  @for (topic of topics(); track topic.id) {
                    <option [value]="topic.id">{{ topic.name }}</option>
                  }
                </select>
                @if (metaError('topicId', 'Topic')) {
                  <span class="field__error">{{ metaError('topicId', 'Topic') }}</span>
                }
              </div>

              <div class="field">
                <label class="field__label" for="difficulty">Difficulty</label>
                <select id="difficulty" class="select" formControlName="difficulty">
                  @for (level of difficulties; track level) {
                    <option [value]="level">{{ label(level) }}</option>
                  }
                </select>
              </div>

              <div class="field">
                <label class="field__label" for="durationMinutes">Duration (minutes)</label>
                <input
                  id="durationMinutes"
                  class="input"
                  type="number"
                  min="1"
                  max="300"
                  formControlName="durationMinutes"
                />
                @if (metaError('durationMinutes', 'Duration')) {
                  <span class="field__error">{{ metaError('durationMinutes', 'Duration') }}</span>
                }
              </div>

              <div class="field">
                <label class="field__label" for="passPercentage">Pass mark (%)</label>
                <input
                  id="passPercentage"
                  class="input"
                  type="number"
                  min="1"
                  max="100"
                  formControlName="passPercentage"
                />
                @if (metaError('passPercentage', 'Pass mark')) {
                  <span class="field__error">{{ metaError('passPercentage', 'Pass mark') }}</span>
                }
              </div>
            </div>

            <div class="row">
              <button
                type="submit"
                class="btn btn--primary"
                [disabled]="savingMeta()"
                data-testid="save-exam"
              >
                {{ savingMeta() ? 'Saving...' : isNew() ? 'Create exam' : 'Save details' }}
              </button>
              <a class="btn btn--ghost" routerLink="/admin/exams">Cancel</a>
            </div>
          </form>
        </section>

        <!-- Topic creation -------------------------------------------- -->
        <section class="card stack mb-4">
          <div class="section-title"><h2>Topics</h2></div>
          <p class="small muted">
            Questions are tagged by topic, which is what drives the per-topic accuracy learners
            see. Add one here if the topic you need does not exist yet.
          </p>
          <form class="row" [formGroup]="topicForm" (ngSubmit)="addTopic()" novalidate>
            <div class="field" style="flex: 1 1 220px">
              <label class="field__label" for="newTopic">New topic name</label>
              <input id="newTopic" class="input" formControlName="name" />
            </div>
            <button type="submit" class="btn btn--secondary" [disabled]="addingTopic()">
              {{ addingTopic() ? 'Adding...' : 'Add topic' }}
            </button>
          </form>
        </section>

        <!-- Questions -------------------------------------------------- -->
        @if (isNew()) {
          <section class="card">
            <p class="small muted">
              Save the exam details first - questions are attached to a saved exam.
            </p>
          </section>
        } @else {
          <section class="card">
            <div class="section-title">
              <h2>Questions ({{ questions.length }})</h2>
              <button
                type="button"
                class="btn btn--secondary btn--sm"
                data-testid="add-question"
                (click)="addQuestion()"
              >
                Add question
              </button>
            </div>

            @if (questions.length === 0) {
              <p class="small muted">
                No questions yet. Add at least one before publishing.
              </p>
            }

            @for (question of questions.controls; track $index; let qi = $index) {
              <article class="question-card" [formGroup]="question">
                <div class="row-between mb-3">
                  <strong class="small">Question {{ qi + 1 }}</strong>
                  <div class="row">
                    <button
                      type="button"
                      class="btn btn--ghost btn--sm"
                      [disabled]="qi === 0"
                      aria-label="Move question up"
                      (click)="move(qi, -1)"
                    >
                      Up
                    </button>
                    <button
                      type="button"
                      class="btn btn--ghost btn--sm"
                      [disabled]="qi === questions.length - 1"
                      aria-label="Move question down"
                      (click)="move(qi, 1)"
                    >
                      Down
                    </button>
                    <button
                      type="button"
                      class="btn btn--ghost btn--sm"
                      (click)="removeQuestion(qi)"
                    >
                      Remove
                    </button>
                  </div>
                </div>

                <div class="field">
                  <label class="field__label" [attr.for]="'prompt-' + qi">Prompt</label>
                  <textarea
                    [id]="'prompt-' + qi"
                    class="textarea"
                    formControlName="prompt"
                    [attr.data-testid]="'question-prompt-' + qi"
                  ></textarea>
                </div>

                <div class="columns mt-3">
                  <div class="field">
                    <label class="field__label" [attr.for]="'qtopic-' + qi">Topic</label>
                    <select [id]="'qtopic-' + qi" class="select" formControlName="topicId">
                      @for (topic of topics(); track topic.id) {
                        <option [value]="topic.id">{{ topic.name }}</option>
                      }
                    </select>
                  </div>
                  <div class="field">
                    <label class="field__label" [attr.for]="'points-' + qi">Marks</label>
                    <input
                      [id]="'points-' + qi"
                      class="input"
                      type="number"
                      min="1"
                      max="10"
                      formControlName="points"
                    />
                  </div>
                </div>

                <fieldset class="mt-3" style="border: 0; padding: 0; margin: 0">
                  <legend class="field__label">Options (pick the correct one)</legend>
                  @for (option of optionsOf(question).controls; track $index; let oi = $index) {
                    <div class="option-row" [formGroup]="option">
                      <input
                        type="radio"
                        [attr.name]="'correct-' + qi"
                        [checked]="question.controls.correctIndex.value === oi"
                        [attr.aria-label]="'Mark option ' + (oi + 1) + ' correct'"
                        [attr.data-testid]="'correct-' + qi + '-' + oi"
                        (change)="question.controls.correctIndex.setValue(oi)"
                      />
                      <input
                        class="input"
                        formControlName="text"
                        [attr.aria-label]="'Option ' + (oi + 1) + ' text'"
                        [attr.data-testid]="'option-text-' + qi + '-' + oi"
                      />
                      <button
                        type="button"
                        class="btn btn--ghost btn--sm"
                        [disabled]="optionsOf(question).length <= 2"
                        (click)="removeOption(question, oi)"
                      >
                        Remove
                      </button>
                    </div>
                  }
                  @if (optionsOf(question).length < 6) {
                    <button
                      type="button"
                      class="btn btn--ghost btn--sm mt-2"
                      (click)="addOption(question)"
                    >
                      Add option
                    </button>
                  }
                </fieldset>

                <div class="field mt-3">
                  <label class="field__label" [attr.for]="'explanation-' + qi">
                    Explanation (shown after submission)
                  </label>
                  <textarea
                    [id]="'explanation-' + qi"
                    class="textarea"
                    formControlName="explanation"
                  ></textarea>
                </div>
              </article>
            }

            <div class="sticky-actions">
              <span class="small muted">
                Saving replaces the whole question set in one transaction.
              </span>
              <div class="row">
                <button
                  type="button"
                  class="btn btn--secondary"
                  [disabled]="savingQuestions()"
                  (click)="reload()"
                >
                  Discard changes
                </button>
                <button
                  type="button"
                  class="btn btn--primary"
                  [disabled]="savingQuestions() || questions.length === 0"
                  data-testid="save-questions"
                  (click)="saveQuestions()"
                >
                  {{ savingQuestions() ? 'Saving...' : 'Save questions' }}
                </button>
              </div>
            </div>
          </section>
        }
      }

      <app-confirm-dialog
        [open]="confirmPublish()"
        title="Publish this exam?"
        message="It becomes visible to every learner immediately. Save any pending question changes first."
        confirmLabel="Publish"
        [destructive]="false"
        (confirmed)="publish()"
        (cancelled)="confirmPublish.set(false)"
      />
    </div>
  `,
})
export class AdminExamEditPage {
  /** Absent on the "new exam" route. */
  readonly id = input<string>();

  private readonly admin = inject(AdminService);
  private readonly exams = inject(ExamService);
  private readonly router = inject(Router);
  private readonly toasts = inject(ToastService);
  private readonly fb = inject(FormBuilder);

  protected readonly difficulties = DIFFICULTIES;
  protected readonly topics = signal<TopicView[]>([]);
  protected readonly exam = signal<ExamDetail | null>(null);
  protected readonly publishCheck = signal<ExamPublishCheck | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly savingMeta = signal(false);
  protected readonly savingQuestions = signal(false);
  protected readonly publishing = signal(false);
  protected readonly addingTopic = signal(false);
  protected readonly confirmPublish = signal(false);

  protected readonly examId = computed(() => this.id() ?? this.exam()?.id ?? '');
  protected readonly isNew = computed(() => !this.examId());

  protected readonly metaForm = this.fb.nonNullable.group({
    title: ['', [Validators.required, Validators.minLength(4), Validators.maxLength(160)]],
    description: [
      '',
      [Validators.required, Validators.minLength(10), Validators.maxLength(2000)],
    ],
    topicId: ['', [Validators.required]],
    difficulty: ['MEDIUM' as 'EASY' | 'MEDIUM' | 'HARD', [Validators.required]],
    durationMinutes: [30, [Validators.required, Validators.min(1), Validators.max(300)]],
    passPercentage: [60, [Validators.required, Validators.min(1), Validators.max(100)]],
  });

  protected readonly topicForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(60)]],
  });

  protected readonly questions = this.fb.array<QuestionGroup>([]);

  constructor() {
    effect(() => {
      // Re-runs when the route switches between /new and /:id.
      const examId = this.id();
      void this.initialise(examId);
    });
  }

  // ---- loading ------------------------------------------------------------

  private async initialise(examId: string | undefined): Promise<void> {
    this.loading.set(true);
    this.loadError.set(null);
    try {
      this.topics.set(await this.exams.listTopics());
      if (examId) {
        await this.loadExam(examId);
      } else {
        this.exam.set(null);
        this.publishCheck.set(null);
        this.questions.clear();
      }
    } catch (error) {
      this.loadError.set(
        ApiError.isApiError(error) ? error.message : 'Could not load the editor.',
      );
    } finally {
      this.loading.set(false);
    }
  }

  private async loadExam(examId: string): Promise<void> {
    const [detail, questions, check] = await Promise.all([
      this.admin.getExam(examId),
      this.admin.getQuestions(examId),
      this.admin.publishCheck(examId),
    ]);

    this.exam.set(detail);
    this.publishCheck.set(check);
    this.metaForm.setValue({
      title: detail.title,
      description: detail.description,
      topicId: detail.topic.id,
      difficulty: detail.difficulty,
      durationMinutes: detail.durationMinutes,
      passPercentage: detail.passPercentage,
    });
    this.metaForm.markAsPristine();

    this.questions.clear();
    for (const question of questions) {
      this.questions.push(this.questionGroup(question));
    }
  }

  protected async reload(): Promise<void> {
    await this.initialise(this.examId() || undefined);
  }

  // ---- form plumbing ------------------------------------------------------

  private questionGroup(source?: AdminQuestionView): QuestionGroup {
    const defaultTopic = this.metaForm.controls.topicId.value || this.topics()[0]?.id || '';
    const options = source?.options ?? [
      { id: '', text: '', isCorrect: true, position: 1 },
      { id: '', text: '', isCorrect: false, position: 2 },
      { id: '', text: '', isCorrect: false, position: 3 },
      { id: '', text: '', isCorrect: false, position: 4 },
    ];
    const correctIndex = Math.max(
      0,
      options.findIndex((option) => option.isCorrect),
    );

    return this.fb.nonNullable.group({
      prompt: [
        source?.prompt ?? '',
        [Validators.required, Validators.minLength(5), Validators.maxLength(2000)],
      ],
      explanation: [source?.explanation ?? '', [Validators.maxLength(2000)]],
      topicId: [source?.topic.id ?? defaultTopic, [Validators.required]],
      points: [source?.points ?? 1, [Validators.required, Validators.min(1), Validators.max(10)]],
      correctIndex: [correctIndex, [Validators.required]],
      options: this.fb.array<OptionGroup>(
        options.map((option) =>
          this.fb.nonNullable.group({
            text: [
              option.text,
              [Validators.required, Validators.minLength(1), Validators.maxLength(500)],
            ],
          }),
        ),
      ),
    });
  }

  protected optionsOf(question: QuestionGroup): FormArray<OptionGroup> {
    return question.controls.options;
  }

  protected addQuestion(): void {
    this.questions.push(this.questionGroup());
  }

  protected removeQuestion(index: number): void {
    this.questions.removeAt(index);
  }

  protected move(index: number, delta: number): void {
    const target = index + delta;
    if (target < 0 || target >= this.questions.length) {
      return;
    }
    const control = this.questions.at(index);
    this.questions.removeAt(index);
    this.questions.insert(target, control);
  }

  protected addOption(question: QuestionGroup): void {
    if (this.optionsOf(question).length >= 6) {
      return;
    }
    this.optionsOf(question).push(
      this.fb.nonNullable.group({
        text: ['', [Validators.required, Validators.maxLength(500)]],
      }),
    );
  }

  protected removeOption(question: QuestionGroup, index: number): void {
    const options = this.optionsOf(question);
    if (options.length <= 2) {
      return;
    }
    options.removeAt(index);

    // Keep `correctIndex` pointing at the option the author actually chose.
    const correct = question.controls.correctIndex;
    if (correct.value === index) {
      correct.setValue(0);
    } else if (correct.value > index) {
      correct.setValue(correct.value - 1);
    }
  }

  // ---- saving -------------------------------------------------------------

  protected async saveMeta(): Promise<void> {
    if (this.metaForm.invalid) {
      this.metaForm.markAllAsTouched();
      return;
    }

    this.savingMeta.set(true);
    try {
      const input = this.metaForm.getRawValue();
      if (this.isNew()) {
        const created = await this.admin.createExam(input);
        this.toasts.success('Exam created as a draft. Now add its questions.');
        await this.router.navigate(['/admin/exams', created.id], { replaceUrl: true });
      } else {
        await this.admin.updateExam(this.examId(), input);
        this.metaForm.markAsPristine();
        this.toasts.success('Exam details saved.');
        await this.loadExam(this.examId());
      }
    } catch (error) {
      this.toasts.error(
        ApiError.isApiError(error) ? error.message : 'Could not save the exam details.',
      );
    } finally {
      this.savingMeta.set(false);
    }
  }

  protected async saveQuestions(): Promise<void> {
    if (this.questions.invalid) {
      this.questions.markAllAsTouched();
      this.toasts.error('Some questions are incomplete. Every prompt and option needs text.');
      return;
    }

    this.savingQuestions.set(true);
    try {
      await this.admin.replaceQuestions(this.examId(), { questions: this.toQuestionInputs() });
      this.toasts.success('Questions saved.');
      await this.loadExam(this.examId());
    } catch (error) {
      if (ApiError.isApiError(error) && error.details.length > 0) {
        this.toasts.error(error.details.map((issue) => issue.message).join(' '));
      } else {
        this.toasts.error(
          ApiError.isApiError(error) ? error.message : 'Could not save the questions.',
        );
      }
    } finally {
      this.savingQuestions.set(false);
    }
  }

  /** Maps the radio-based form shape onto the API's isCorrect-per-option shape. */
  private toQuestionInputs(): QuestionInput[] {
    return this.questions.controls.map((question) => {
      const value = question.getRawValue();
      return {
        prompt: value.prompt,
        topicId: value.topicId,
        points: value.points,
        ...(value.explanation ? { explanation: value.explanation } : {}),
        options: value.options.map((option, index) => ({
          text: option.text,
          isCorrect: index === value.correctIndex,
        })),
      };
    });
  }

  protected async publish(): Promise<void> {
    this.confirmPublish.set(false);
    this.publishing.set(true);
    try {
      await this.admin.publish(this.examId());
      this.toasts.success('Exam published.');
      await this.loadExam(this.examId());
    } catch (error) {
      if (ApiError.isApiError(error) && error.code === 'EXAM_NOT_PUBLISHABLE') {
        this.publishCheck.set({
          publishable: false,
          problems: error.details.map((issue) => issue.message),
        });
        this.toasts.error('This exam is not ready to publish. See the list above.');
      } else {
        this.toasts.error(
          ApiError.isApiError(error) ? error.message : 'Could not publish the exam.',
        );
      }
    } finally {
      this.publishing.set(false);
    }
  }

  protected async addTopic(): Promise<void> {
    if (this.topicForm.invalid) {
      this.topicForm.markAllAsTouched();
      return;
    }
    this.addingTopic.set(true);
    try {
      const topic = await this.admin.createTopic(this.topicForm.getRawValue());
      this.topics.update((topics) => [...topics, topic].sort((a, b) => a.name.localeCompare(b.name)));
      this.topicForm.reset({ name: '' });
      this.toasts.success(`Topic "${topic.name}" added.`);
    } catch (error) {
      this.toasts.error(
        ApiError.isApiError(error) ? error.message : 'Could not create the topic.',
      );
    } finally {
      this.addingTopic.set(false);
    }
  }

  // ---- view helpers -------------------------------------------------------

  protected metaError(
    field: 'title' | 'description' | 'topicId' | 'durationMinutes' | 'passPercentage',
    label: string,
  ): string | null {
    return controlError(this.metaForm.controls[field], label);
  }

  protected label(value: 'EASY' | 'MEDIUM' | 'HARD'): string {
    return difficultyLabel(value);
  }

  protected statusClass(status: string): string {
    return (
      { PUBLISHED: 'badge--success', DRAFT: 'badge--warning', ARCHIVED: 'badge--danger' }[
        status
      ] ?? ''
    );
  }
}
