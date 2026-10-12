import type { Routes } from '@angular/router';
import { adminGuard, authGuard, guestGuard } from './core/auth/auth.guards';

/**
 * Routing.
 *
 * Every page is lazily loaded with `loadComponent`, so the initial bundle is
 * the shell plus whatever the first route needs - a student never downloads the
 * admin authoring screens. Guards are UX only; the API enforces access.
 */
export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    loadComponent: () => import('./features/home/home.page').then((m) => m.HomePage),
    title: 'Exam Prep & Assessment Platform',
  },
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPage),
    title: 'Sign in - ExamPrep',
  },
  {
    path: 'register',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/register.page').then((m) => m.RegisterPage),
    title: 'Create account - ExamPrep',
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/dashboard/dashboard.page').then((m) => m.DashboardPage),
    title: 'Dashboard - ExamPrep',
  },
  {
    path: 'exams',
    loadComponent: () =>
      import('./features/catalogue/exam-list.page').then((m) => m.ExamListPage),
    title: 'Practice exams - ExamPrep',
  },
  {
    path: 'exams/:idOrSlug',
    loadComponent: () =>
      import('./features/catalogue/exam-detail.page').then((m) => m.ExamDetailPage),
    title: 'Exam - ExamPrep',
  },
  {
    path: 'attempts',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/results/attempt-history.page').then((m) => m.AttemptHistoryPage),
    title: 'My attempts - ExamPrep',
  },
  {
    path: 'attempts/:id/take',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/exam-runner/exam-runner.page').then((m) => m.ExamRunnerPage),
    title: 'Exam in progress - ExamPrep',
  },
  {
    path: 'attempts/:id/result',
    canActivate: [authGuard],
    loadComponent: () => import('./features/results/result.page').then((m) => m.ResultPage),
    title: 'Result - ExamPrep',
  },
  {
    path: 'profile',
    canActivate: [authGuard],
    loadComponent: () => import('./features/profile/profile.page').then((m) => m.ProfilePage),
    title: 'Profile - ExamPrep',
  },
  {
    path: 'admin',
    canActivate: [adminGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./features/admin/admin-overview.page').then((m) => m.AdminOverviewPage),
        title: 'Admin - ExamPrep',
      },
      {
        path: 'exams',
        loadComponent: () =>
          import('./features/admin/admin-exam-list.page').then((m) => m.AdminExamListPage),
        title: 'Manage exams - ExamPrep',
      },
      {
        path: 'exams/new',
        loadComponent: () =>
          import('./features/admin/admin-exam-edit.page').then((m) => m.AdminExamEditPage),
        title: 'New exam - ExamPrep',
      },
      {
        path: 'exams/:id',
        loadComponent: () =>
          import('./features/admin/admin-exam-edit.page').then((m) => m.AdminExamEditPage),
        title: 'Edit exam - ExamPrep',
      },
      {
        path: 'exams/:id/preview',
        loadComponent: () =>
          import('./features/admin/admin-exam-preview.page').then((m) => m.AdminExamPreviewPage),
        title: 'Preview exam - ExamPrep',
      },
    ],
  },
  {
    path: '**',
    loadComponent: () => import('./features/not-found.page').then((m) => m.NotFoundPage),
    title: 'Page not found - ExamPrep',
  },
];
