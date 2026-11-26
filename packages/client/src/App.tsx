import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AccountApp } from './screens/AccountApp';
import { AdminApp } from './screens/admin/AdminApp';
import { ParticipantApp, plainScreenClass } from './screens/ParticipantApp';
import { ReplayScreen } from './replay/ReplayScreen';
import { JoinScreen } from './screens/landing/JoinScreen';
import { LandingScreen } from './screens/landing/LandingScreen';
import { SignInScreen } from './screens/landing/SignInScreen';
import { StartScreen } from './screens/landing/StartScreen';
import { WhoScreen } from './screens/landing/WhoScreen';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingScreen />} />
      <Route path="/start" element={<StartScreen />} />
      <Route path="/signin" element={<SignInScreen />} />
      <Route path="/signup" element={<WhoScreen mode="signup" />} />
      <Route path="/login" element={<WhoScreen mode="login" />} />
      <Route path="/join/:code" element={<JoinScreen />} />
      <Route path="/s/:token" element={<ParticipantApp />} />
      <Route path="/w" element={<AccountApp />} />
      <Route path="/admin" element={<AdminApp />} />
      <Route path="/admin/replay" element={<ReplayScreen />} />
      <Route path="/console" element={<Navigate to="/admin" replace />} />
      <Route
        path="*"
        element={
          <main className={plainScreenClass}>
            <p className="mt-4">Please use the link you were given.</p>
          </main>
        }
      />
    </Routes>
  );
}

export function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppRoutes />
    </BrowserRouter>
  );
}
