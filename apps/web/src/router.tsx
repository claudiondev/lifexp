import { Navigate, Route, Routes } from 'react-router';
import { GuestRoute } from './features/auth/GuestRoute';
import { LoginPage } from './features/auth/LoginPage';
import { ProtectedRoute } from './features/auth/ProtectedRoute';
import { RegisterPage } from './features/auth/RegisterPage';
import { AppShell } from './components/layout/AppShell';
import { AreasPage } from './pages/AreasPage';
import { HomePage } from './pages/HomePage';
import { TodayPage } from './pages/TodayPage';
import { ProfilePage } from './pages/ProfilePage';
import { WeekPage } from './pages/WeekPage';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<GuestRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
      </Route>
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/hoje" element={<TodayPage />} />
          <Route path="/semana" element={<WeekPage />} />
          <Route path="/areas" element={<AreasPage />} />
          <Route path="/perfil" element={<ProfilePage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
