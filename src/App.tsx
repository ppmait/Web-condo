import { BrowserRouter } from 'react-router'
import { AppRoutes } from './app/router'

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
