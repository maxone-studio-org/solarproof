import { useState, useRef, useEffect, useCallback } from 'react'

const VECTOR_URL = 'https://agent.maxone.one/chat'
const SUPABASE_URL = 'https://panel.maxone.one'
const SUPABASE_ANON_KEY = 'eyJhbGciOiAiSFMyNTYiLCAidHlwIjogIkpXVCJ9.eyJyb2xlIjogImFub24iLCAiaXNzIjogInN1cGFiYXNlIiwgImlhdCI6IDE3Mjk3MjgwMDAsICJleHAiOiAxODg3NDk0NDAwfQ.bkbevdi1DwbqCos2hMTd3UnYAj5PogIBTqjZdOyTGiQ'

interface ChatMessage {
  role: 'user' | 'vector'
  text: string
  at: string
}

type FeedbackType = 'feedback' | 'bug' | 'idea'
type SubmitState = 'idle' | 'sending' | 'success' | 'error'
type Mode = 'chat' | 'feedback'

const TYPE_LABELS: Record<FeedbackType, { label: string; emoji: string }> = {
  feedback: { label: 'Feedback', emoji: '\u{1F4AC}' },
  bug: { label: 'Fehler melden', emoji: '\u{1F41B}' },
  idea: { label: 'Idee / Wunsch', emoji: '\u{1F4A1}' },
}

/** Vector's signature avatar — dark visor with glowing orange eyes */
function VectorAvatar({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const dims = { sm: 'h-6 w-6', md: 'h-9 w-9', lg: 'h-14 w-14' }
  const visor = { sm: 'h-4 w-5', md: 'h-6 w-7', lg: 'h-8 w-9' }
  const eye = { sm: 'h-1.5 w-1.5', md: 'h-2 w-2', lg: 'h-2.5 w-2.5' }
  const gap = { sm: 'gap-1', md: 'gap-1.5', lg: 'gap-1.5' }
  const glow = {
    sm: '0 0 3px rgba(232,99,10,0.6)',
    md: '0 0 4px rgba(232,99,10,0.6)',
    lg: '0 0 6px rgba(232,99,10,0.8)',
  }

  return (
    <div className={`flex ${dims[size]} items-center justify-center rounded-full bg-gradient-to-b from-gray-600 to-gray-800 border border-white/10 shadow-xl shadow-black/30 shrink-0`}>
      <div className={`flex ${visor[size]} items-center justify-center rounded-lg bg-black/60`}>
        <div className={`flex ${gap[size]}`}>
          <div className={`${eye[size]} rounded-full bg-amber-500`} style={{ boxShadow: glow[size] }} />
          <div className={`${eye[size]} rounded-full bg-amber-500`} style={{ boxShadow: glow[size] }} />
        </div>
      </div>
    </div>
  )
}

export function VectorChat() {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('chat')

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionId] = useState(() => crypto.randomUUID())
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Feedback state
  const [fbType, setFbType] = useState<FeedbackType>('feedback')
  const [fbMessage, setFbMessage] = useState('')
  const [fbEmail, setFbEmail] = useState('')
  const [fbState, setFbState] = useState<SubmitState>('idle')
  const [fbError, setFbError] = useState('')

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (open && mode === 'chat' && inputRef.current) inputRef.current.focus()
  }, [open, mode])

  const sendMessage = useCallback(async () => {
    const text = input.trim()
    if (!text || loading) return

    const userMsg: ChatMessage = { role: 'user', text, at: new Date().toISOString() }
    setMessages((prev) => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch(VECTOR_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          sessionId,
          instance: 'solarproof',
          currentPage: window.location.pathname,
        }),
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()

      const vectorMsg: ChatMessage = {
        role: 'vector',
        text: data.reply || 'Keine Antwort erhalten.',
        at: new Date().toISOString(),
      }
      setMessages((prev) => [...prev, vectorMsg])
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'vector', text: 'Verbindung fehlgeschlagen. Versuche es gleich nochmal.', at: new Date().toISOString() },
      ])
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [input, loading, sessionId])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const handleFeedbackSubmit = async () => {
    if (!fbMessage.trim()) return

    setFbState('sending')
    setFbError('')

    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/solarproof_feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          Accept: 'application/json',
          'Accept-Profile': 'maxone',
          'Content-Profile': 'maxone',
        },
        body: JSON.stringify({
          type: fbType,
          message: fbMessage.trim(),
          email: fbEmail.trim() || null,
          app_version: __APP_VERSION__,
          git_commit: __GIT_COMMIT__,
          user_agent: navigator.userAgent,
        }),
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      setFbState('success')
      setTimeout(() => {
        setFbState('idle')
        setFbMessage('')
        setFbEmail('')
        setMode('chat')
      }, 2000)
    } catch (e) {
      setFbState('error')
      setFbError(e instanceof Error ? e.message : 'Unbekannter Fehler')
    }
  }

  return (
    <>
      {/* Chat toggle button — Vector avatar with label */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2.5 bg-gradient-to-r from-gray-800 to-gray-900 hover:from-gray-700 hover:to-gray-800 text-white pl-4 pr-2 py-2 rounded-full shadow-lg hover:shadow-xl transition-all hover:scale-105 border border-white/10"
          aria-label="Chat mit Vector starten"
        >
          <span className="text-sm font-medium">Fragen? Chat mit Vector</span>
          <VectorAvatar size="md" />
        </button>
      )}

      {/* Chat/Feedback window */}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-[360px] max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden" style={{ minHeight: '280px', maxHeight: 'calc(100vh - 3rem)', height: messages.length > 2 ? 'calc(100vh - 3rem)' : '480px', transition: 'height 0.2s ease' }}>
          {/* Header */}
          <div className="bg-gradient-to-r from-gray-800 to-gray-900 text-white shrink-0">
            <div className="px-4 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <VectorAvatar size="md" />
                <div>
                  <p className="text-sm font-semibold">Vector</p>
                  <p className="text-xs text-gray-400">SolarProof Assistent</p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="p-1 hover:bg-white/10 rounded" aria-label="Schließen">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Mode tabs */}
            <div className="flex px-4 pb-3 gap-2">
              <button
                onClick={() => setMode('chat')}
                className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
                  mode === 'chat'
                    ? 'bg-amber-500 text-white shadow-md'
                    : 'bg-white/20 text-white border border-white/30 hover:bg-white/30'
                }`}
              >
                Chat
              </button>
              <button
                onClick={() => setMode('feedback')}
                className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${
                  mode === 'feedback'
                    ? 'bg-amber-500 text-white shadow-md'
                    : 'bg-white/20 text-white border border-white/30 hover:bg-white/30'
                }`}
              >
                Feedback
              </button>
            </div>
          </div>

          {/* Chat mode */}
          {mode === 'chat' && (
            <>
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                {messages.length === 0 && (
                  <div className="text-center py-8">
                    <div className="flex justify-center mb-3">
                      <VectorAvatar size="lg" />
                    </div>
                    <p className="text-sm text-gray-500">
                      Frag mich zu SolarProof — CSV-Import, Simulation, PDF-Export oder was du sonst wissen willst.
                    </p>
                  </div>
                )}

                {messages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start gap-2'}`}>
                    {msg.role === 'vector' && <VectorAvatar size="sm" />}
                    <div
                      className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${
                        msg.role === 'user'
                          ? 'bg-amber-500 text-white rounded-br-md'
                          : 'bg-gray-100 text-gray-800 rounded-bl-md'
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                    </div>
                  </div>
                ))}

                {loading && (
                  <div className="flex justify-start gap-2">
                    <VectorAvatar size="sm" />
                    <div className="bg-gray-100 rounded-2xl rounded-bl-md px-4 py-2.5">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              <div className="border-t border-gray-200 px-3 py-2.5 shrink-0">
                <div className="flex gap-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Nachricht schreiben..."
                    disabled={loading}
                    className="flex-1 rounded-full border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:border-amber-400 disabled:opacity-50"
                    aria-label="Nachricht an Vector"
                  />
                  <button
                    onClick={sendMessage}
                    disabled={!input.trim() || loading}
                    className="bg-amber-500 hover:bg-amber-600 disabled:bg-gray-300 text-white rounded-full p-2 transition-colors"
                    aria-label="Senden"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                    </svg>
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Feedback mode */}
          {mode === 'feedback' && (
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {fbState === 'success' ? (
                <div className="text-center py-8">
                  <svg className="w-12 h-12 text-green-500 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-gray-700 font-medium">Danke!</p>
                  <p className="text-sm text-gray-500 mt-1">Dein Feedback wurde gespeichert.</p>
                </div>
              ) : (
                <>
                  <p className="text-xs text-gray-500 mb-4">
                    Dein Feedback wird direkt gespeichert und an unser Team weitergeleitet.
                  </p>

                  <div className="flex gap-2 mb-4">
                    {(Object.entries(TYPE_LABELS) as [FeedbackType, { label: string; emoji: string }][]).map(([key, { label, emoji }]) => (
                      <button
                        key={key}
                        onClick={() => setFbType(key)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                          fbType === key
                            ? 'bg-amber-100 text-amber-800 border border-amber-300'
                            : 'bg-gray-50 text-gray-600 border border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        {emoji} {label}
                      </button>
                    ))}
                  </div>

                  <textarea
                    value={fbMessage}
                    onChange={(e) => setFbMessage(e.target.value)}
                    placeholder={
                      fbType === 'bug'
                        ? 'Beschreibe den Fehler: Was hast du gemacht, was ist passiert?'
                        : fbType === 'idea'
                        ? 'Was wünschst du dir? Welches Feature fehlt?'
                        : 'Was möchtest du uns mitteilen?'
                    }
                    rows={4}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm resize-none focus:outline-none focus:border-amber-400 mb-3"
                    aria-label="Nachricht"
                  />

                  <input
                    type="email"
                    value={fbEmail}
                    onChange={(e) => setFbEmail(e.target.value)}
                    placeholder="E-Mail (optional, für Rückfragen)"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm mb-4"
                    aria-label="E-Mail-Adresse"
                  />

                  {fbState === 'error' && (
                    <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-xs text-red-700">Fehler beim Senden: {fbError}. Bitte versuche es erneut.</p>
                    </div>
                  )}

                  <button
                    onClick={handleFeedbackSubmit}
                    disabled={!fbMessage.trim() || fbState === 'sending'}
                    className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-gray-300 text-white font-medium py-2.5 rounded-lg transition-colors text-sm"
                  >
                    {fbState === 'sending' ? 'Wird gesendet...' : 'Absenden'}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </>
  )
}
