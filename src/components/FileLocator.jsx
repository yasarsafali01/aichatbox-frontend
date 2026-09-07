import { useEffect, useRef, useState } from 'react'
import logo from '../assets/logo.png'
import Sidebar from './Sidebar'
import './Chat.css'
import './FileLocator.css'

// Same-origin path: nginx proxies this to the locate backend on the same
// server, so the browser never makes a cross-origin request (avoids CORS).
const LOCATE_URL = '/api/locate'
const API_KEY = 'meu-ai-chatbox'

const STORAGE_KEY = 'meu-dosya-arama-gecmisi'

const loadSearches = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

const saveSearches = (list) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    /* localStorage kullanılamıyor (gizli sekme vb.) — sessizce yoksay */
  }
}

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
const makeTitle = (text) => (text.length > 42 ? `${text.slice(0, 42).trimEnd()}…` : text)

export default function FileLocator() {
  useEffect(() => {
    document.title = 'Mersin Üniversitesi — Doküman Arama'
    return () => { document.title = 'Mersin Üniversitesi — Bilgi Sistemi' }
  }, [])

  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [results, setResults] = useState([])
  const [error, setError] = useState(null)
  const [searches, setSearches] = useState(loadSearches)
  const [activeId, setActiveId] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const abortRef = useRef(null)

  const search = async (text) => {
    const trimmed = text.trim()
    if (!trimmed || loading) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    setSearched(true)
    setError(null)
    setActiveId(null)
    setSidebarOpen(false)

    try {
      const res = await fetch(LOCATE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
        body: JSON.stringify({ question: trimmed }),
        signal: controller.signal,
      })

      if (!res.ok) {
        setResults([])
        setError(
          res.status >= 500
            ? 'Sunucu şu anda yanıt veremiyor. Lütfen daha sonra tekrar deneyin.'
            : 'Aramanız işlenemedi. Lütfen sorgunuzu kontrol edip tekrar deneyin.'
        )
        return
      }

      const data = await res.json()
      const list = Array.isArray(data) ? data : []
      setResults(list)

      // Sadece başarılı (sonuç dönen) aramalar geçmişe kaydedilir.
      const id = makeId()
      const entry = { id, title: makeTitle(trimmed), query: trimmed, results: list, updatedAt: Date.now() }
      setSearches(prev => {
        const updated = [entry, ...prev]
        saveSearches(updated)
        return updated
      })
      setActiveId(id)
    } catch (err) {
      if (err.name === 'AbortError') return
      setResults([])
      setError('Bağlantı hatası. Backend çalışıyor mu?')
    } finally {
      setLoading(false)
    }
  }

  const newSearch = () => {
    abortRef.current?.abort()
    setQuery('')
    setSearched(false)
    setResults([])
    setError(null)
    setActiveId(null)
    setSidebarOpen(false)
  }

  const selectSearch = (id) => {
    const entry = searches.find(s => s.id === id)
    if (!entry) return
    abortRef.current?.abort()
    setActiveId(id)
    setQuery(entry.query)
    setResults(entry.results)
    setSearched(true)
    setError(null)
    setSidebarOpen(false)
  }

  const deleteSearch = (id) => {
    setSearches(prev => {
      const updated = prev.filter(s => s.id !== id)
      saveSearches(updated)
      return updated
    })
    if (id === activeId) {
      newSearch()
    }
  }

  // Ana sayfadaki (Chat) sohbet kutusuyla aynı görünüm için chat-input-form
  // ve chat-send-btn sınıfları doğrudan yeniden kullanılıyor.
  const searchForm = (
    <form className="chat-input-form" onSubmit={(e) => { e.preventDefault(); search(query) }}>
      <div className="locator-search-row">
        <input
          type="text"
          className="chat-textarea"
          placeholder="Örn: bilgi işlem daire başkanlığı personelleri"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={loading}
          autoFocus
        />
        <button
          type="submit"
          className="chat-send-btn"
          disabled={loading || !query.trim()}
          aria-label="Ara"
        >
          <i className="bi bi-arrow-up"></i>
        </button>
      </div>
    </form>
  )

  return (
    <div className="app-shell">
      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}
      <Sidebar
        conversations={searches}
        activeId={activeId}
        onSelect={selectSearch}
        onNew={newSearch}
        onDelete={deleteSearch}
        open={sidebarOpen}
        newLabel="Yeni Arama"
        emptyLabel="Henüz arama geçmişi yok"
        deleteLabel="Aramayı sil"
      />

      <div className="chat-app">
        <header className="chat-topbar">
          <button
            className="chat-menu-btn"
            onClick={() => setSidebarOpen(prev => !prev)}
            aria-label="Arama geçmişi"
          >
            <i className="bi bi-list"></i>
          </button>
          <span className="chat-topbar-brand">
            <img src={logo} alt="Mersin Üniversitesi" className="chat-brand-logo" />
            Mersin Üniversitesi <span className="chat-brand-accent">Doküman Arama</span>
          </span>
          {searched && (
            <button className="chat-newchat-btn" onClick={newSearch}>
              <i className="bi bi-plus-lg"></i>
              Yeni Arama
            </button>
          )}
        </header>

        <main className="chat-main">
          {!searched ? (
            <div className="chat-empty-state">
              <img src={logo} alt="Mersin Üniversitesi" className="chat-empty-icon" />
              <h1>Hangi belgeyi arıyorsunuz?</h1>
              <p>Aradığınız konuyu yazın, ilgili dokümanları ve konumlarını bulalım.</p>
              {searchForm}
            </div>
          ) : (
            <div className="locator-results-wrap">
              {searchForm}

              <div className="locator-results">
                {loading && (
                  <div className="locator-status">
                    <span className="locator-spinner"></span>
                    Aranıyor…
                  </div>
                )}

                {!loading && error && (
                  <div className="locator-status locator-status-error">{error}</div>
                )}

                {!loading && !error && results.length === 0 && (
                  <div className="locator-status">Sonuç bulunamadı.</div>
                )}

                {!loading && !error && results.map((r, i) => (
                  <a
                    key={`${r.url}-${i}`}
                    className="locator-result-card"
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <div className="locator-result-icon">
                      <i className="bi bi-file-earmark-text"></i>
                    </div>
                    <div className="locator-result-text">
                      <div className="locator-result-name">{r.fileName || r.title}</div>
                      {r.location && <div className="locator-result-meta">{r.location}</div>}
                    </div>
                    <i className="bi bi-box-arrow-up-right locator-result-arrow"></i>
                  </a>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
