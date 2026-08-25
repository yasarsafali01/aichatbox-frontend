import { useEffect, useRef, useState } from 'react'
import logo from '../assets/logo.png'
import './Chat.css'

// Same-origin path: nginx proxies this to the RAG backend on the same
// server, so the browser never makes a cross-origin request (avoids CORS).
const ASK_URL = '/api/rag/ask'
const API_KEY = 'meu-ai-chatbox'

const SUGGESTIONS = [
  'Kütüphane çalışma saatleri nedir?',
  'Mezuniyet için gereken şartlar nelerdir?',
]

export default function Chat() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef(null)
  const textareaRef = useRef(null)

  const hasStarted = messages.length > 0

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
    pushUser(trimmed)
    setInput('')
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
    <div className="chat-app">
      <header className="chat-topbar">
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
                  <span></span>
                  <span></span>
                  <span></span>
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
  )
}
