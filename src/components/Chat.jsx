import { useEffect, useRef, useState } from 'react'
import logo from '../assets/logo.png'
import Sidebar from './Sidebar'
import './Chat.css'

// Same-origin path: nginx proxies this to the RAG backend on the same
// server, so the browser never makes a cross-origin request (avoids CORS).
const ASK_URL = '/api/rag/ask'
const API_KEY = 'meu-ai-chatbox'

const SUGGESTIONS = [
  'Kütüphane çalışma saatleri nedir?',
  'Mezuniyet için gereken şartlar nelerdir?',
]

const STORAGE_KEY = 'meu-bilgi-sistemi-conversations'

const loadConversations = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

const saveConversations = (list) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    /* localStorage kullanılamıyor (gizli sekme vb.) — sessizce yoksay */
  }
}

const makeId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`

const makeTitle = (text) => (text.length > 42 ? `${text.slice(0, 42).trimEnd()}…` : text)

export default function Chat() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [conversations, setConversations] = useState(loadConversations)
  const [activeId, setActiveId] = useState(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const bottomRef = useRef(null)
  const textareaRef = useRef(null)

  const hasStarted = messages.length > 0

  // Aktif sohbetin mesajlarını, o sohbete ait kayda yansıt ve localStorage'a yaz.
  useEffect(() => {
    if (!activeId) return
    setConversations(prev => {
      const idx = prev.findIndex(c => c.id === activeId)
      if (idx === -1) return prev
      const updated = [...prev]
      updated[idx] = { ...updated[idx], messages, updatedAt: Date.now() }
      saveConversations(updated)
      return updated
    })
  }, [messages, activeId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [input])

  const pushUser = (text) => setMessages(prev => [...prev, { role: 'user', text }])
  const pushBot = (text) => setMessages(prev => [...prev, { role: 'bot', text }])
  const pushError = (text) => setMessages(prev => [...prev, { role: 'bot', text, error: true }])

  const ask = async (text) => {
    setLoading(true)
    try {
      const res = await fetch(ASK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
        body: JSON.stringify({ question: text }),
      })
      const raw = await res.text()

      if (res.ok) {
        pushBot(raw)
        return
      }

      let data = null
      try { data = JSON.parse(raw) } catch { /* not JSON */ }
      pushError(data?.error || raw || `Sunucu hatası (HTTP ${res.status}).`)
    } catch {
      pushError('Bağlantı hatası. Backend çalışıyor mu?')
    } finally {
      setLoading(false)
    }
  }

  const sendMessage = (text) => {
    const trimmed = (text ?? input).trim()
    if (!trimmed || loading) return

    if (!activeId) {
      const id = makeId()
      const newConversation = { id, title: makeTitle(trimmed), messages: [], updatedAt: Date.now() }
      setConversations(prev => {
        const updated = [newConversation, ...prev]
        saveConversations(updated)
        return updated
      })
      setActiveId(id)
    }

    pushUser(trimmed)
    setInput('')
    setSidebarOpen(false)
    ask(trimmed)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const newChat = () => {
    setMessages([])
    setInput('')
    setActiveId(null)
    setSidebarOpen(false)
  }

  const selectConversation = (id) => {
    const conv = conversations.find(c => c.id === id)
    if (!conv) return
    setActiveId(id)
    setMessages(conv.messages)
    setInput('')
    setSidebarOpen(false)
  }

  const deleteConversation = (id) => {
    setConversations(prev => {
      const updated = prev.filter(c => c.id !== id)
      saveConversations(updated)
      return updated
    })
    if (id === activeId) {
      newChat()
    }
  }

  const composer = (
    <form
      className="chat-input-form"
      onSubmit={(e) => { e.preventDefault(); sendMessage() }}
    >
      <textarea
        ref={textareaRef}
        className="chat-textarea"
        placeholder="Mersin Üniversitesi Bilgi Sistemi'ne bir soru sorun..."
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={1}
        disabled={loading}
      />
      <button
        type="submit"
        className="chat-send-btn"
        disabled={loading || !input.trim()}
        aria-label="Gönder"
      >
        <i className="bi bi-arrow-up"></i>
      </button>
    </form>
  )

  return (
    <div className="app-shell">
      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        onSelect={selectConversation}
        onNew={newChat}
        onDelete={deleteConversation}
        open={sidebarOpen}
      />

      <div className="chat-app">
      <header className="chat-topbar">
        <button
          className="chat-menu-btn"
          onClick={() => setSidebarOpen(prev => !prev)}
          aria-label="Sohbet geçmişi"
        >
          <i className="bi bi-list"></i>
        </button>
        <span className="chat-topbar-brand">
          <img src={logo} alt="Mersin Üniversitesi" className="chat-brand-logo" />
          Mersin Üniversitesi <span className="chat-brand-accent">Bilgi Sistemi</span>
        </span>
        {hasStarted && (
          <button className="chat-newchat-btn" onClick={newChat}>
            <i className="bi bi-plus-lg"></i>
            Yeni Sohbet
          </button>
        )}
      </header>

      <main className="chat-main">
        {!hasStarted ? (
          <div className="chat-empty-state">
            <img src={logo} alt="Mersin Üniversitesi" className="chat-empty-icon" />
            <h1>Bugün size nasıl yardımcı olabilirim?</h1>
            <p>Yönetmelikler, kayıt işlemleri ve üniversiteyle ilgili merak ettiğiniz her şeyi sorabilirsiniz.</p>

            {composer}

            <div className="chat-suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="chat-suggestion-chip" onClick={() => sendMessage(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="chat-thread">
            {messages.map((msg, i) => (
              <div key={i} className={`chat-msg-row ${msg.role === 'user' ? 'chat-msg-user' : 'chat-msg-bot'}`}>
                {msg.role === 'bot' && (
                  <div className="chat-msg-avatar">
                    <img src={logo} alt="" />
                  </div>
                )}
                <div className={`chat-msg-bubble ${msg.error ? 'chat-msg-error' : ''}`}>
                  {msg.text}
                </div>
              </div>
            ))}

            {loading && (
              <div className="chat-msg-row chat-msg-bot">
                <div className="chat-msg-avatar">
                  <img src={logo} alt="" />
                </div>
                <div className="chat-msg-bubble chat-typing">
                  <span className="chat-typing-text">Düşünüyor</span>
                  <span className="chat-typing-dot"></span>
                  <span className="chat-typing-dot"></span>
                  <span className="chat-typing-dot"></span>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        )}
      </main>

      {hasStarted && (
        <footer className="chat-composer">
          {composer}
          <small className="chat-disclaimer">
            Mersin Üniversitesi Bilgi Sistemi yanlış bilgi verebilir. Önemli işlemler için lütfen ilgili birimle teyit edin.
          </small>
        </footer>
      )}
      </div>
    </div>
  )
}
