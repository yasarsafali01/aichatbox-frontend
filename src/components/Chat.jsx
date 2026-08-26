import { useEffect, useRef, useState } from 'react'
import logo from '../assets/logo.png'
import Sidebar from './Sidebar'
import './Chat.css'

// Same-origin path: nginx proxies this to the RAG backend on the same
// server, so the browser never makes a cross-origin request (avoids CORS).
const ASK_URL = '/api/rag/ask'
const API_KEY = 'meu-ai-chatbox'

// Sadece Chrome/Edge gibi Chromium tabanlı tarayıcılarda mevcut; yoksa mikrofon
// butonu hiç gösterilmez (Firefox/Safari'de sessiz şekilde gizlenir).
const SpeechRecognitionAPI =
  typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)

const SUGGESTIONS = [
  'Kütüphane çalışma saatleri nedir?',
  'Mezuniyet için gereken şartlar nelerdir?',
]

const MODEL_GROUPS = [
  {
    group: 'Hızlı Cevap',
    models: [
      { id: 'mistral:7b', label: 'Mistral' },
      { id: 'qwen2.5:latest', label: 'Qwen 2.5' },
      { id: 'gemma2:9b', label: 'Gemma 2' },
    ],
  },
  {
    group: 'Orta Düzey Model',
    models: [
      { id: 'gpt-oss:20b', label: 'GPT-OSS' },
    ],
  },
  {
    group: 'Daha fazla düşünme',
    models: [
      { id: 'qwen3:32b', label: 'Qwen 3' },
      { id: 'deepseek-r1:32b', label: 'DeepSeek R1' },
      { id: 'llama3.3:70b', label: 'Llama 3.3' },
    ],
  },
]

const ALL_MODELS = MODEL_GROUPS.flatMap(g => g.models.map(m => ({ ...m, group: g.group })))
const DEFAULT_MODEL_ID = 'qwen2.5:latest'

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
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL_ID)
  const [listening, setListening] = useState(false)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const bottomRef = useRef(null)
  const textareaRef = useRef(null)
  const abortRef = useRef(null)
  const recognitionRef = useRef(null)
  const modelMenuRef = useRef(null)

  const hasStarted = messages.length > 0
  const currentModel = ALL_MODELS.find(m => m.id === selectedModel) ?? ALL_MODELS.find(m => m.id === DEFAULT_MODEL_ID)

  useEffect(() => {
    if (!modelMenuOpen) return
    const handleClickOutside = (e) => {
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target)) {
        setModelMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [modelMenuOpen])

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

  // Boş (hoş geldin) ekrana dönüldüğünde imleci otomatik input'a odakla.
  useEffect(() => {
    if (!hasStarted) {
      textareaRef.current?.focus()
    }
  }, [hasStarted])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }, [input])

  const toggleVoiceInput = () => {
    if (!SpeechRecognitionAPI) return

    if (listening) {
      recognitionRef.current?.stop()
      return
    }

    const recognition = new SpeechRecognitionAPI()
    recognition.lang = 'tr-TR'
    recognition.interimResults = true
    recognition.continuous = false

    recognition.onresult = (e) => {
      let transcript = ''
      for (let i = 0; i < e.results.length; i++) {
        transcript += e.results[i][0].transcript
      }
      setInput(transcript)
    }
    recognition.onerror = () => setListening(false)
    recognition.onend = () => setListening(false)

    recognitionRef.current = recognition
    recognition.start()
    setListening(true)
  }

  const stopGenerating = () => {
    abortRef.current?.abort()
  }

  const pushUser = (text) => setMessages(prev => [...prev, { role: 'user', text }])
  const pushBot = (text) => setMessages(prev => [...prev, { role: 'bot', text }])
  const pushError = (text) => setMessages(prev => [...prev, { role: 'bot', text, error: true }])

  const ask = async (text) => {
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    try {
      const res = await fetch(ASK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-API-Key': API_KEY },
        body: JSON.stringify({ question: text, model: selectedModel }),
        signal: controller.signal,
      })
      if (res.ok) {
        pushBot(await res.text())
        return
      }

      // Backend'in ham hata gövdesi (stack trace, HTML hata sayfası vb.)
      // kullanıcıya hiç gösterilmez — sadece durum koduna göre sabit,
      // kullanıcı dostu tek bir mesaj gösterilir.
      pushError(
        res.status >= 500
          ? 'Sunucu şu anda yanıt veremiyor. Lütfen daha sonra tekrar deneyin.'
          : 'İsteğiniz işlenemedi. Lütfen sorunuzu kontrol edip tekrar deneyin.'
      )
    } catch (err) {
      if (err.name === 'AbortError') return // sohbet terk edildi, sessizce çık
      pushError('Bağlantı hatası. Backend çalışıyor mu?')
    } finally {
      setLoading(false)
    }
  }

  const sendMessage = (text) => {
    const trimmed = (text ?? input).trim()
    if (!trimmed || loading) return

    recognitionRef.current?.stop()

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
    abortRef.current?.abort()
    recognitionRef.current?.stop()
    setMessages([])
    setInput('')
    setActiveId(null)
    setSidebarOpen(false)
    textareaRef.current?.focus()
  }

  const selectConversation = (id) => {
    const conv = conversations.find(c => c.id === id)
    if (!conv) return
    abortRef.current?.abort()
    recognitionRef.current?.stop()
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
      <div className="chat-input-toolbar">
        <div className="chat-model-picker" ref={modelMenuRef}>
          <button
            type="button"
            className="chat-model-trigger"
            onClick={() => setModelMenuOpen(o => !o)}
            aria-haspopup="listbox"
            aria-expanded={modelMenuOpen}
          >
            <span className="chat-model-trigger-text">
              <span className="chat-model-trigger-label">{currentModel.label}</span>
              <span className="chat-model-trigger-desc">{currentModel.group}</span>
            </span>
            <i className={`bi bi-chevron-down chat-model-chevron ${modelMenuOpen ? 'chat-model-chevron-open' : ''}`}></i>
          </button>

          {modelMenuOpen && (
            <div className="chat-model-menu" role="listbox">
              {MODEL_GROUPS.map((g) => (
                <div key={g.group} className="chat-model-group">
                  <div className="chat-model-group-label">{g.group}</div>
                  {g.models.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className={`chat-model-option ${m.id === selectedModel ? 'chat-model-option-active' : ''}`}
                      role="option"
                      aria-selected={m.id === selectedModel}
                      onClick={() => { setSelectedModel(m.id); setModelMenuOpen(false) }}
                    >
                      <span className="chat-model-option-label">{m.label}</span>
                      {m.id === selectedModel && <i className="bi bi-check-lg"></i>}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
        {SpeechRecognitionAPI && (
          <button
            type="button"
            className={`chat-mic-btn ${listening ? 'chat-mic-btn-active' : ''}`}
            onClick={toggleVoiceInput}
            aria-label={listening ? 'Sesli girişi durdur' : 'Sesli giriş başlat'}
          >
            <i className={`bi ${listening ? 'bi-mic-fill' : 'bi-mic'}`}></i>
          </button>
        )}
        {loading ? (
          <button
            type="button"
            className="chat-send-btn chat-stop-btn"
            onClick={stopGenerating}
            aria-label="Durdur"
          >
            <i className="bi bi-stop-fill"></i>
          </button>
        ) : (
          <button
            type="submit"
            className="chat-send-btn"
            disabled={!input.trim()}
            aria-label="Gönder"
          >
            <i className="bi bi-arrow-up"></i>
          </button>
        )}
      </div>
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
