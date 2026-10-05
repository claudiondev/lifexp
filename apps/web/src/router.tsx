import { Navigate, Route, Routes } from 'react-router';
import { ForgotPasswordPage } from './features/auth/ForgotPasswordPage';
import { GuestRoute } from './features/auth/GuestRoute';
import { LoginPage } from './features/auth/LoginPage';
import { ProtectedRoute } from './features/auth/ProtectedRoute';
import { RegisterPage } from './features/auth/RegisterPage';
import { ResetPasswordPage } from './features/auth/ResetPasswordPage';
import { AppShell } from './components/layout/AppShell';
import { AchievementsPage } from './pages/AchievementsPage';
import { AreasPage } from './pages/AreasPage';
import { CalendarPage } from './pages/CalendarPage';
import { GoalDetailPage } from './pages/GoalDetailPage';
import { GoalsPage } from './pages/GoalsPage';
import { PendingPage } from './pages/PendingPage';
import { HomePage } from './pages/HomePage';
import { NoteEditorPage } from './pages/NoteEditorPage';
import { NotesPage } from './pages/NotesPage';
import { TodayPage } from './pages/TodayPage';
import { RewardsPage } from './pages/RewardsPage';
import { ReviewPage } from './pages/ReviewPage';
import { SettingsPage } from './pages/SettingsPage';
import { WeekPage } from './pages/WeekPage';
import { XpHistoryPage } from './pages/XpHistoryPage';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<GuestRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/esqueci-senha" element={<ForgotPasswordPage />} />
      </Route>
      {/* Fora do GuestRoute: o link do e-mail precisa abrir mesmo com uma sessão ativa no navegador. */}
      <Route path="/redefinir-senha" element={<ResetPasswordPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/hoje" element={<TodayPage />} />
          <Route path="/semana" element={<WeekPage />} />
          <Route path="/calendario" element={<CalendarPage />} />
          <Route path="/revisao" element={<ReviewPage />} />
          <Route path="/notas" element={<NotesPage />} />
          <Route path="/notas/nova" element={<NoteEditorPage />} />
          <Route path="/notas/:noteId" element={<NoteEditorPage />} />
          <Route path="/pendentes" element={<PendingPage />} />
          <Route path="/metas" element={<GoalsPage />} />
          <Route path="/metas/:goalId" element={<GoalDetailPage />} />
          <Route path="/historico" element={<XpHistoryPage />} />
          <Route path="/conquistas" element={<AchievementsPage />} />
          <Route path="/recompensas" element={<RewardsPage />} />
          <Route path="/areas" element={<AreasPage />} />
          <Route path="/configuracoes" element={<SettingsPage />} />
          {/* o endereço antigo continua funcionando (favoritos, PWA instalado) */}
          <Route path="/perfil" element={<Navigate to="/configuracoes" replace />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
