import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AccountApp } from './screens/AccountApp';
import { AdminApp } from './screens/admin/AdminApp';
import { ParticipantApp, plainScreenClass } from './screens/ParticipantApp';
import { ReplayScreen } from './replay/ReplayScreen';
import { PromptsApp } from './screens/classes/prompts/PromptsApp';
import { JoinScreen } from './screens/landing/JoinScreen';
import { LandingScreen } from './screens/landing/LandingScreen';
import { SignInScreen } from './screens/landing/SignInScreen';
import { StartScreen } from './screens/landing/StartScreen';
import { WhoScreen } from './screens/landing/WhoScreen';
import { PupilJoinScreen } from './screens/pupil/JoinScreen';
import { PupilLoginScreen } from './screens/pupil/LoginScreen';
import { PupilScreen } from './screens/pupil/PupilScreen';
import { TestPupilBanner } from './screens/pupil/TestPupilBanner';
import { ReaderScreen } from './reader/ReaderScreen';

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<LandingScreen />} />
      <Route path="/start" element={<StartScreen />} />
      <Route path="/signin" element={<SignInScreen />} />
      <Route path="/signup" element={<WhoScreen mode="signup" />} />
      <Route path="/login" element={<WhoScreen mode="login" />} />
      <Route path="/r" element={<PupilScreen />} />
      <Route path="/r/join" element={<PupilJoinScreen />} />
      <Route path="/r/login" element={<PupilLoginScreen />} />
      <Route path="/r/readings/:readingId" element={<ReaderScreen />} />
      <Route path="/join/:code" element={<JoinScreen />} />
      <Route path="/s/:token" element={<ParticipantApp />} />
      <Route path="/s/:token/prompts" element={<PromptsApp />} />
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
      {/* Draws itself only on /r and /r/... for a teacher's test pupil (#215). */}
      <TestPupilBanner />
      <AppRoutes />
    </BrowserRouter>
  );
}
