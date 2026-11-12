import { HashRouter } from 'react-router'
import { AppRoutes } from './app/router'
import { AuthProvider } from './auth/AuthProvider'

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    </AuthProvider>
  )
}
