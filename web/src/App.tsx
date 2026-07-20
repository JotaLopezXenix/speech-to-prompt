import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/shell/AppShell'
import { PATHS } from '@/routes/paths'
import Capture from '@/routes/Capture'
import Review from '@/routes/Review'
import Distill from '@/routes/Distill'
import Result from '@/routes/Result'
import History from '@/routes/History'
import Settings from '@/routes/Settings'
import Login from '@/routes/Login'

// Acopla el router a la ruta temporal /app (= vite `base`). En el cutover final,
// base pasa a '/' y esto se resuelve solo.
const BASENAME = import.meta.env.BASE_URL.replace(/\/$/, '') || '/'

export default function App() {
  return (
    <BrowserRouter basename={BASENAME}>
      <Routes>
        <Route path={PATHS.login} element={<Login />} />
        <Route element={<AppShell />}>
          <Route index element={<Navigate to={PATHS.capture} replace />} />
          <Route path={PATHS.capture} element={<Capture />} />
          <Route path={PATHS.review} element={<Review />} />
          <Route path={PATHS.distill} element={<Distill />} />
          <Route path={PATHS.result} element={<Result />} />
          <Route path={PATHS.history} element={<History />} />
          <Route path={PATHS.settings} element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to={PATHS.capture} replace />} />
      </Routes>
    </BrowserRouter>
  )
}
