import { useState, useRef, useEffect, useCallback } from 'react'

const VECTOR_URL = 'https://agent.maxone.studio/chat'

interface ChatMessage {
  role: 'user' | 'vector'
  text: string
  at: string
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
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionId] = useState(() => crypto.randomUUID())
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus()
  }, [open])

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
    }
  }, [input, loading, sessionId])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <>
      {/* Chat toggle button — Vector avatar */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-[4.5rem] z-40 hover:scale-110 transition-transform"
          aria-label="Chat mit Vector starten"
        >
          <VectorAvatar size="lg" />
        </button>
      )}

      {/* Chat window */}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-[360px] max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden" style={{ height: '480px' }}>
          {/* Header */}
          <div className="bg-gradient-to-r from-gray-800 to-gray-900 text-white px-4 py-3 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <VectorAvatar size="md" />
              <div>
                <p className="text-sm font-semibold">Vector</p>
                <p className="text-xs text-gray-400">SolarProof Assistent</p>
              </div>
            </div>
            <button onClick={() => setOpen(false)} className="p-1 hover:bg-white/10 rounded" aria-label="Chat schließen">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Messages */}
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

          {/* Input */}
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
        </div>
      )}
    </>
  )
}
