import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Chat from './components/Chat'
import FileLocator from './components/FileLocator'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Chat />} />
        <Route path="/dosya-arama" element={<FileLocator />} />
      </Routes>
    </BrowserRouter>
  )
}
