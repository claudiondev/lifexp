import { Navigate, Route, Routes } from 'react-router';
import { ForgotPasswordPage } from './features/auth/ForgotPasswordPage';
import { GuestRoute } from './features/auth/GuestRoute';
import { LoginPage } from './features/auth/LoginPage';
import { ProtectedRoute } from './features/auth/ProtectedRoute';
import { RegisterPage } from './features/auth/RegisterPage';
import { ResetPasswordPage } from './features/auth/ResetPasswordPage';
import { AppShell } from './components/layout/AppShell';
import { AreasPage } from './pages/AreasPage';
import { CalendarPage } from './pages/CalendarPage';
import { GoalDetailPage } from './pages/GoalDetailPage';
import { GoalsPage } from './pages/GoalsPage';
import { HomePage } from './pages/HomePage';
import { TodayPage } from './pages/TodayPage';
import { ProfilePage } from './pages/ProfilePage';
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
          <Route path="/metas" element={<GoalsPage />} />
          <Route path="/metas/:goalId" element={<GoalDetailPage />} />
          <Route path="/historico" element={<XpHistoryPage />} />
          <Route path="/areas" element={<AreasPage />} />
          <Route path="/perfil" element={<ProfilePage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
