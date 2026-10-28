import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Activity, ArrowDownLeft, ArrowUpRight, Bell, Bot, Check, ChevronDown, ChevronRight,
  AlertCircle, CheckCircle2, CircleHelp, Clock3, Command, Headphones, LayoutDashboard,
  LoaderCircle, MessageSquareText, Mic, MicOff, MoreHorizontal, Phone, PhoneCall,
  PhoneOff, RefreshCw, Save, Search, Settings, ShieldCheck, Sparkles, Volume2, VolumeX, X,
} from 'lucide-react'

type ChatLine = { speaker: 'AI assistant' | 'Caller'; text: string }
type ChatRole = 'assistant' | 'user'

function languageLocale(language: string) {
  if (language === 'Hindi') return 'hi-IN'
  if (language === 'Marathi') return 'mr-IN'
  return 'en-IN'
}

type Call = {
  id: number; name: string; number: string; initials: string; color: string;
  time: string; date: string; status: 'Completed' | 'Needs follow-up' | 'Missed'; duration: string;
  purpose: string; summary: string; transcript: { speaker: 'AI assistant' | 'Caller'; text: string }[]
}

const initialCalls: Call[] = [
  { id: 1, name: 'Rahul Sharma', number: '+91 98765 43210', initials: 'RS', color: 'lavender', time: '10:42 AM', date: 'Today', status: 'Needs follow-up', duration: '1m 24s', purpose: 'Pega job opportunity', summary: 'Rahul is calling about a Pega CDH developer opening. He asked for a callback this afternoon to discuss the role and project details.', transcript: [ { speaker: 'AI assistant', text: 'Hi! You’ve reached Pavan’s AI assistant. He’s unavailable at the moment. How can I help?' }, { speaker: 'Caller', text: 'Hi, I’m calling about a Pega CDH developer opportunity. Could he call me back today?' }, { speaker: 'AI assistant', text: 'Of course. I’ll pass along that you’re calling about a Pega CDH role and would appreciate a callback today.' } ] },
  { id: 2, name: 'Aditi Kulkarni', number: '+91 98220 11745', initials: 'AK', color: 'peach', time: '9:18 AM', date: 'Today', status: 'Completed', duration: '48s', purpose: 'Website project update', summary: 'Aditi wanted to confirm the latest website changes and asked to connect after 4 PM.', transcript: [ { speaker: 'AI assistant', text: 'Hello! Pavan is busy right now. What would you like me to let him know?' }, { speaker: 'Caller', text: 'I wanted to discuss the website update. Ask him to call after four.' }, { speaker: 'AI assistant', text: 'Got it. I’ll let him know you’d like to discuss the website update after 4 PM.' } ] },
  { id: 3, name: 'Unknown caller', number: '+91 90110 68422', initials: 'UC', color: 'mint', time: 'Yesterday', date: 'Yesterday', status: 'Completed', duration: '32s', purpose: 'General enquiry', summary: 'The caller asked whether Pavan was available. No specific reason for the call was provided.', transcript: [ { speaker: 'AI assistant', text: 'Hi, I’m Pavan’s AI assistant. He can’t come to the phone right now. What are you calling about?' }, { speaker: 'Caller', text: 'I just wanted to speak with him. I’ll try again later.' }, { speaker: 'AI assistant', text: 'No problem. I’ll let him know you called.' } ] },
  { id: 4, name: 'Sneha Patil', number: '+91 97654 22018', initials: 'SP', color: 'blue', time: 'Yesterday', date: 'Yesterday', status: 'Missed', duration: '—', purpose: 'No details captured', summary: 'The call was not connected to the AI assistant. No conversation details are available.', transcript: [] },
]

const navItems = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'calls', label: 'Call history', icon: Phone },
  { id: 'simulator', label: 'Conversation simulator', icon: MessageSquareText },
  { id: 'settings', label: 'Assistant settings', icon: Settings },
]

function App() {
  const [activePage, setActivePage] = useState('overview')
  const [calls, setCalls] = useState<Call[]>(initialCalls)
  const [apiStatus, setApiStatus] = useState<'connecting' | 'connected' | 'offline'>('connecting')
  const [apiError, setApiError] = useState('')
  const [selectedCall, setSelectedCall] = useState<Call | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('All calls')
  const [assistantOn, setAssistantOn] = useState(true)
  const [greeting, setGreeting] = useState('Hi! You’ve reached Pavan’s AI assistant. He’s unavailable at the moment. How can I help?')
  const [language, setLanguage] = useState('English')
  const [voice, setVoice] = useState('Warm and natural')
  const [testMessage, setTestMessage] = useState('Hi, I’m calling about a job opportunity. Can Pavan call me back?')
  const [simStarted, setSimStarted] = useState(false)
  const [simTranscript, setSimTranscript] = useState<ChatLine[]>([])
  const [aiStatus, setAiStatus] = useState<'checking' | 'ready' | 'offline'>('checking')
  const [aiStatusMessage, setAiStatusMessage] = useState('Checking local AI engine…')
  const [aiModel, setAiModel] = useState('qwen2.5:3b')
  const [simBusy, setSimBusy] = useState(false)
  const [simError, setSimError] = useState('')
  const [simNotice, setSimNotice] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [voiceOutput, setVoiceOutput] = useState(true)
  const [lastSavedCallId, setLastSavedCallId] = useState<number | null>(null)
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)
  const chatEndRef = useRef<HTMLDivElement | null>(null)
  const [savedSettings, setSavedSettings] = useState(false)

  useEffect(() => {
    let active = true
    Promise.all([fetch('/api/calls'), fetch('/api/settings')]).then(async ([callsResponse, settingsResponse]) => {
      if (!callsResponse.ok || !settingsResponse.ok) throw new Error('API request failed')
      const savedCalls = await callsResponse.json() as Call[]
      const settings = await settingsResponse.json() as { assistantOn: boolean; greeting: string; language: string; voice: string }
      if (!active) return
      setCalls(savedCalls)
      setAssistantOn(settings.assistantOn)
      setGreeting(settings.greeting)
      setLanguage(settings.language)
      setVoice(settings.voice)
      setApiStatus('connected')
      setApiError('')
    }).catch(() => { if (active) { setApiStatus('offline'); setApiError('Backend not connected. Start the API server in a second terminal using npm run dev:server.') } })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    const refreshStatus = async () => {
      try {
        const response = await fetch('/api/ai/status')
        const payload = await response.json() as { available?: boolean; modelAvailable?: boolean; model?: string; message?: string }
        if (!response.ok) throw new Error('Could not check local AI status.')
        if (!active) return
        setAiModel(payload.model || 'qwen2.5:3b')
        setAiStatus(payload.available && payload.modelAvailable ? 'ready' : 'offline')
        setAiStatusMessage(payload.message || 'AI engine status checked.')
      } catch {
        if (active) {
          setAiStatus('offline')
          setAiStatusMessage('AI status is unavailable. Make sure the backend is running.')
        }
      }
    }
    void refreshStatus()
    return () => { active = false }
  }, [])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [simTranscript, simBusy])

  useEffect(() => () => {
    recognitionRef.current?.abort()
    window.speechSynthesis?.cancel()
  }, [])

  const filteredCalls = useMemo(() => calls.filter((call) => {
    const matchQuery = `${call.name} ${call.number} ${call.purpose}`.toLowerCase().includes(query.toLowerCase())
    const matchFilter = filter === 'All calls' || call.status === filter
    return matchQuery && matchFilter
  }), [calls, query, filter])

  const speakText = (text: string) => {
    if (!voiceOutput || !('speechSynthesis' in window) || !text.trim()) return
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = languageLocale(language)
    utterance.rate = voice === 'Calm and concise' ? 0.9 : voice === 'Professional' ? 1.02 : 0.96
    utterance.pitch = voice === 'Warm and natural' ? 1.04 : 1
    const voices = window.speechSynthesis.getVoices()
    const preferredVoice = voices.find((item) => item.lang.toLowerCase() === utterance.lang.toLowerCase())
      || voices.find((item) => item.lang.toLowerCase().startsWith(utterance.lang.slice(0, 2).toLowerCase()))
    if (preferredVoice) utterance.voice = preferredVoice
    window.speechSynthesis.speak(utterance)
  }

  const beginConversation = () => {
    recognitionRef.current?.abort()
    window.speechSynthesis?.cancel()
    const opening = greeting.trim() || 'Hi, I’m Pavan’s AI assistant. He is unavailable right now. How can I help?'
    setSimTranscript([{ speaker: 'AI assistant', text: opening }])
    setSimStarted(true)
    setLastSavedCallId(null)
    setSimError('')
    setSimNotice('Conversation started. Use the microphone or type what the caller says.')
    speakText(opening)
  }

  const addSimMessage = async (voiceMessage?: string) => {
    const message = (voiceMessage ?? testMessage).trim()
    if (!message || simBusy) return
    let conversationBeforeMessage = simTranscript
    if (!simStarted || conversationBeforeMessage.length === 0) {
      conversationBeforeMessage = [{ speaker: 'AI assistant', text: greeting.trim() || 'Hi, I’m Pavan’s AI assistant. He is unavailable right now. How can I help?' }]
      setSimStarted(true)
      setLastSavedCallId(null)
    }
    const callerTranscript: ChatLine[] = [...conversationBeforeMessage, { speaker: 'Caller', text: message }]
    setSimTranscript(callerTranscript)
    setTestMessage('')
    setSimError('')
    setSimNotice('')
    setSimBusy(true)
    window.speechSynthesis?.cancel()
    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          language,
          history: conversationBeforeMessage.map((line) => ({ role: (line.speaker === 'AI assistant' ? 'assistant' : 'user') as ChatRole, content: line.text })),
        }),
      })
      const payload = await response.json() as { reply?: string; error?: string; detail?: string; model?: string }
      if (!response.ok || !payload.reply) throw new Error(payload.error || 'The AI could not generate a response.')
      const updatedTranscript: ChatLine[] = [...callerTranscript, { speaker: 'AI assistant', text: payload.reply }]
      setSimTranscript(updatedTranscript)
      setAiStatus('ready')
      setAiStatusMessage(`Connected to local model ${payload.model || aiModel}.`)
      if (voiceOutput) speakText(payload.reply)
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'AI response failed. Check the local AI setup.'
      setSimError(`${messageText}${messageText.includes('ollama pull') ? '' : ' Check that Ollama is running and the configured model is installed.'}`)
      setAiStatus('offline')
    } finally {
      setSimBusy(false)
    }
  }

  const startListening = () => {
    const SpeechRecognitionConstructor = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognitionConstructor) {
      setSimError('Speech recognition is not supported in this browser. Try current Chrome or Edge, or type the caller’s message instead.')
      return
    }
    if (simBusy) return
    if (!simStarted) {
      beginConversation()
      setSimNotice('The greeting has started. Tap the microphone again after it finishes to speak.')
      return
    }
    window.speechSynthesis?.cancel()
    setSimError('')
    setSimNotice('Listening… speak clearly, then pause so the browser can transcribe your message.')
    const recognition = new SpeechRecognitionConstructor()
    recognition.lang = languageLocale(language)
    recognition.continuous = false
    recognition.interimResults = false
    recognition.maxAlternatives = 1
    recognition.onresult = (event) => {
      const result = event.results[event.resultIndex]
      const transcript = result?.[0]?.transcript?.trim()
      if (transcript) {
        setSimNotice(`Recognized: “${transcript}”`)
        void addSimMessage(transcript)
      }
    }
    recognition.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') setSimError('Microphone access was blocked. Allow microphone access for this site in your browser settings.')
      else if (event.error !== 'no-speech' && event.error !== 'aborted') setSimError(`Speech recognition error: ${event.error}. You can still type a message.`)
      setIsListening(false)
    }
    recognition.onend = () => setIsListening(false)
    recognitionRef.current?.abort()
    recognitionRef.current = recognition
    setIsListening(true)
    try { recognition.start() } catch (error) {
      setIsListening(false)
      setSimError(error instanceof Error ? error.message : 'Could not start microphone recognition.')
    }
  }

  const stopListening = () => {
    recognitionRef.current?.stop()
    setIsListening(false)
    setSimNotice('Stopped listening.')
  }

  const endConversation = async () => {
    if (simBusy) return
    recognitionRef.current?.abort()
    setIsListening(false)
    window.speechSynthesis?.cancel()
    const callerLines = simTranscript.filter((line) => line.speaker === 'Caller')
    if (callerLines.length === 0) {
      setSimNotice('Say or type at least one caller message before saving the conversation.')
      setSimStarted(false)
      return
    }
    const firstCallerMessage = callerLines[0].text
    const lastAssistantMessage = [...simTranscript].reverse().find((line) => line.speaker === 'AI assistant')?.text || ''
    const purpose = /job|work|career|opportun|pega|interview/i.test(firstCallerMessage) ? 'Job opportunity'
      : /website|project|design|update|development/i.test(firstCallerMessage) ? 'Project update'
      : /urgent|emergency|hospital|danger/i.test(firstCallerMessage) ? 'Urgent message' : 'AI voice conversation'
    const summary = `Caller’s first message: ${firstCallerMessage}
Assistant’s last response: ${lastAssistantMessage}
Saved from the local AI voice simulator.`.slice(0, 1900)
    try {
      const response = await fetch('/api/calls', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Voice simulator caller', number: 'LOCAL-SIMULATOR', status: 'Needs follow-up', purpose, summary, transcript: simTranscript }),
      })
      const payload = await response.json() as Call & { error?: string }
      if (!response.ok) throw new Error(payload.error || 'Could not save the conversation.')
      setCalls((previous) => [payload, ...previous])
      setLastSavedCallId(payload.id)
      setSimStarted(false)
      setSimNotice(`Conversation saved to call history as record #${payload.id}. This was a local simulation, not a telephone call.`)
      setApiStatus('connected')
    } catch {
      setSimError('Could not save this conversation. Check that the backend is running, then try again.')
    }
  }

  const resetConversation = () => {
    recognitionRef.current?.abort()
    recognitionRef.current = null
    window.speechSynthesis?.cancel()
    setIsListening(false)
    setSimTranscript([])
    setSimStarted(false)
    setSimBusy(false)
    setLastSavedCallId(null)
    setSimError('')
    setSimNotice('')
    setTestMessage('')
  }

  const refreshAIStatus = async () => {
    setAiStatus('checking')
    setAiStatusMessage('Checking the local AI engine…')
    try {
      const response = await fetch('/api/ai/status')
      const payload = await response.json() as { available?: boolean; modelAvailable?: boolean; model?: string; message?: string }
      setAiModel(payload.model || 'qwen2.5:3b')
      setAiStatus(payload.available && payload.modelAvailable ? 'ready' : 'offline')
      setAiStatusMessage(payload.message || 'AI status checked.')
    } catch {
      setAiStatus('offline')
      setAiStatusMessage('Could not reach the backend. Start npm run dev:server first.')
    }
  }

  const saveSettings = async () => {
    try {
      const result = await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assistantOn, greeting, language, voice }) })
      if (!result.ok) throw new Error('Could not save settings')
      setSavedSettings(true)
      setApiError('')
      window.setTimeout(() => setSavedSettings(false), 2400)
    } catch {
      setSavedSettings(false)
      setApiError('Settings could not be saved. Check that the backend is running.')
    }
  }

  const markFollowedUp = async (call: Call) => {
    try {
      const result = await fetch(`/api/calls/${call.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'Completed' }) })
      if (!result.ok) throw new Error('Could not update call')
      const updated = await result.json() as Call
      setCalls((prev) => prev.map((item) => item.id === updated.id ? updated : item))
      setSelectedCall(updated)
    } catch { setApiError('Call status could not be updated. Check that the backend is running.') }
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand-row"><div className="brand-mark"><Bot size={22} strokeWidth={2.2} /></div><div><div className="brand-name">Personal AI Caller</div><div className="brand-subtitle">YOUR PRIVATE ASSISTANT</div></div></div>
      <div className="workspace-label">WORKSPACE</div>
      <nav className="main-nav" aria-label="Main navigation">
        {navItems.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-item ${activePage === id ? 'active' : ''}`} onClick={() => setActivePage(id)}><Icon size={18}/><span>{label}</span>{id === 'calls' && <span className="nav-count">{calls.length}</span>}</button>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="privacy-card"><div className="privacy-icon"><ShieldCheck size={17}/></div><div><strong>Private by design</strong><p>Your call records stay in your workspace.</p></div></div>
        <button className="nav-item help-link" onClick={() => alert('This is a UI prototype. Real call routing will be evaluated in a later phase.')}><CircleHelp size={18}/><span>Help & project status</span></button>
        <div className="profile-row"><div className="profile-avatar">P</div><div className="profile-info"><strong>Personal workspace</strong><span>Owner access</span></div><MoreHorizontal size={19} className="muted-icon"/></div>
      </div>
    </aside>

    <main className="main-area">
      <header className="topbar"><div className="breadcrumbs"><span>Workspace</span><ChevronRight size={14}/><strong>{navItems.find((item) => item.id === activePage)?.label}</strong></div><div className="topbar-actions"><div className="prototype-pill"><span className="pulse-dot"/> {apiStatus === 'connected' ? 'Database connected' : apiStatus === 'connecting' ? 'Connecting…' : 'API offline'}</div><button className="icon-button" aria-label="Notifications" onClick={() => alert('No new notifications in this prototype.')}><Bell size={18}/><i/></button><div className="top-avatar">P</div></div></header>

      <div className="page-content">
        {apiError && <div className="prototype-disclaimer" role="status"><span className="info-dot">!</span><p>{apiError}</p></div>}
        {activePage === 'overview' && <>
          <section className="welcome-row"><div><div className="eyebrow">WEDNESDAY, OCTOBER 28</div><h1>Your calls, taken care of.</h1><p className="page-description">A clear view of who reached out and what needs your attention.</p></div><button className={`assistant-status ${assistantOn ? 'online' : 'offline'}`} onClick={() => setAssistantOn(!assistantOn)}><span className="status-dot"/><span>Assistant {assistantOn ? 'enabled' : 'paused'}</span><ChevronDown size={15}/></button></section>
          <section className="hero-card"><div className="hero-content"><div className="hero-badge"><Sparkles size={14}/> YOUR PERSONAL ASSISTANT</div><h2>Never lose the reason<br className="desktop-break"/> someone called.</h2><p>When call routing is connected, your assistant can greet callers, take a message, and keep the important details ready for you.</p><div className="hero-actions"><button className="primary-button" onClick={() => setActivePage('simulator')}><Mic size={17}/> Try conversation simulator <ChevronRight size={16}/></button><span className="hero-note"><ShieldCheck size={14}/> Private workspace</span></div></div><div className="hero-art"><div className="orb orb-one"/><div className="orb orb-two"/><div className="assistant-orb"><div className="orb-core"><Bot size={42}/></div><div className="sound-bars"><i/><i/><i/><i/><i/><i/><i/></div></div><div className="floating-note note-top"><span className="mini-icon"><MessageSquareText size={14}/></span><div><b>Message captured</b><small>Callback requested</small></div><Check size={15} className="check-green"/></div><div className="floating-note note-bottom"><span className="wave-mini"><i/><i/><i/><i/><i/></span><div><b>Listening for details</b><small>Voice assistant preview</small></div></div></div></section>
          <section className="stats-grid"><StatCard icon={<PhoneCall size={18}/>} label="Total calls" value={String(calls.length).padStart(2, '0')} note="Sample records" tone="violet"/><StatCard icon={<Clock3 size={18}/>} label="Needs follow-up" value={String(calls.filter(c => c.status === 'Needs follow-up').length).padStart(2, '0')} note="Ready for your review" tone="amber"/><StatCard icon={<MessageSquareText size={18}/>} label="Messages captured" value={String(calls.filter(c => c.transcript.length > 0).length).padStart(2, '0')} note="With conversation details" tone="mint"/><StatCard icon={<Activity size={18}/>} label="Assistant status" value={assistantOn ? 'Ready' : 'Paused'} note={assistantOn ? 'Prototype mode' : 'Turn on when ready'} tone="blue"/></section>
          <section className="content-grid"><div className="panel recent-panel"><div className="panel-heading"><div><h3>Recent calls</h3><p>Your latest caller activity</p></div><button className="text-button" onClick={() => setActivePage('calls')}>View all <ChevronRight size={15}/></button></div><div className="call-list">{calls.slice(0, 4).map((call) => <CallRow key={call.id} call={call} onClick={() => setSelectedCall(call)}/>)}</div></div><div className="panel attention-panel"><div className="panel-heading"><div><h3>Needs your attention</h3><p>Follow up when you’re free</p></div><span className="attention-count">{calls.filter(c => c.status === 'Needs follow-up').length}</span></div>{calls.filter(c => c.status === 'Needs follow-up').map((call) => <div className="attention-item" key={call.id}><div className={`call-avatar ${call.color}`}>{call.initials}</div><div className="attention-copy"><strong>{call.name}</strong><span>{call.purpose}</span><small>{call.time}</small></div><button className="round-arrow" aria-label={`View ${call.name}`} onClick={() => setSelectedCall(call)}><ChevronRight size={17}/></button></div>)}{calls.filter(c => c.status === 'Needs follow-up').length === 0 && <div className="empty-state small-empty">You’re all caught up. Nice work!</div>}<div className="attention-footer"><span><Sparkles size={14}/> AI summaries are simulated for now</span></div></div></section>
          <div className="prototype-disclaimer"><span className="info-dot">i</span><p><strong>Prototype preview:</strong> These are sample calls and simulated AI summaries. Your real SIM calls are not being answered or recorded by this website.</p></div>
        </>}

        {activePage === 'calls' && <section className="subpage"><div className="subpage-heading"><div><div className="eyebrow">YOUR ACTIVITY</div><h1>Call history</h1><p className="page-description">Review caller details and follow-up notes.</p></div><div className="call-total-chip">{calls.length} saved calls</div></div><div className="panel history-panel"><div className="history-controls"><div className="search-field"><Search size={17}/><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, number or purpose"/></div><select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter calls"><option>All calls</option><option>Completed</option><option>Needs follow-up</option><option>Missed</option></select></div><div className="history-table-head"><span>CALLER</span><span>REASON</span><span>TIME</span><span>STATUS</span><span/></div><div className="call-list">{filteredCalls.map((call) => <CallRow key={call.id} call={call} onClick={() => setSelectedCall(call)} detailed/>)}{filteredCalls.length === 0 && <div className="empty-state">No calls match your search. Try a different name or filter.</div>}</div></div><div className="prototype-disclaimer"><span className="info-dot">i</span><p>Call records are stored in your local SQLite database. Simulator conversations are saved as demo records.</p></div></section>}

        {activePage === 'simulator' && <section className="subpage">
          <div className="subpage-heading">
            <div><div className="eyebrow">PHASE 4 · REAL AI + VOICE</div><h1>AI voice conversation</h1><p className="page-description">Talk or type as a caller. Your local AI generates a reply, and your browser can speak it aloud.</p></div>
            <div className={`simulator-label ai-state-${aiStatus}`}><span className="status-dot"/>{aiStatus === 'ready' ? 'Local AI ready' : aiStatus === 'checking' ? 'Checking AI…' : 'AI not ready'}</div>
          </div>
          <div className="sim-layout ai-sim-layout">
            <div className="panel simulator-panel ai-simulator-panel">
              <div className="sim-top ai-sim-top">
                <div className="sim-bot-icon"><Bot size={22}/></div>
                <div className="ai-sim-title"><strong>Pavan’s AI assistant</strong><span><i className={aiStatus === 'ready' ? 'green-dot' : 'status-dot'}/>{simBusy ? 'Thinking…' : isListening ? 'Listening to caller…' : simStarted ? 'Conversation active' : 'Ready to start'}</span></div>
                <div className="ai-top-actions">
                  <button className={`icon-button ${voiceOutput ? 'voice-enabled' : ''}`} onClick={() => { setVoiceOutput((current) => { if (current) window.speechSynthesis?.cancel(); return !current }) }} aria-label={voiceOutput ? 'Turn voice output off' : 'Turn voice output on'} title={voiceOutput ? 'Voice output on' : 'Voice output off'}>{voiceOutput ? <Volume2 size={17}/> : <VolumeX size={17}/>}</button>
                  <button className="icon-button sim-reset" onClick={resetConversation} aria-label="Reset conversation" title="New conversation"><RefreshCw size={16}/></button>
                </div>
              </div>
              <div className={`ai-engine-banner ${aiStatus === 'ready' ? 'engine-ready' : 'engine-not-ready'}`}>
                <span className="engine-icon">{aiStatus === 'ready' ? <CheckCircle2 size={17}/> : aiStatus === 'checking' ? <LoaderCircle className="spin-icon" size={17}/> : <AlertCircle size={17}/>}</span>
                <div><strong>{aiStatus === 'ready' ? `Connected · ${aiModel}` : aiStatus === 'checking' ? 'Checking local model' : 'Local AI needs setup'}</strong><p>{aiStatusMessage}</p></div>
                <button className="text-button engine-refresh" onClick={() => void refreshAIStatus()} disabled={aiStatus === 'checking'} aria-label="Refresh AI status"><RefreshCw size={14}/></button>
              </div>
              <div className="chat-area ai-chat-area" role="log" aria-live="polite" aria-label="Conversation transcript">
                {simTranscript.length === 0 && <div className="sim-welcome ai-welcome"><div className="sim-welcome-icon"><Mic size={23}/></div><h3>Start a voice conversation</h3><p>Your assistant will introduce itself transparently, listen to a caller message, and generate a response using your local language model.</p><div className="suggestion-chips"><button onClick={() => setTestMessage('Hi, I’m calling about a Pega job opportunity. Could Pavan call me back?')}>Job opportunity</button><button onClick={() => setTestMessage('I need to discuss the website project update.')}>Project update</button><button onClick={() => setTestMessage('Could you please ask Pavan to call me when he is free?')}>Callback request</button></div><button className="primary-button welcome-start-button" onClick={beginConversation}><Mic size={16}/> Start conversation</button></div>}
                {simTranscript.map((item, index) => <div key={`${index}-${item.speaker}`} className={`chat-message ${item.speaker === 'Caller' ? 'caller-message' : 'assistant-message'}`}><span className="chat-speaker">{item.speaker === 'Caller' ? 'Caller (you)' : 'AI assistant'}</span><div className="chat-bubble">{item.text}</div>{item.speaker === 'AI assistant' && <button className="replay-speech-button" onClick={() => speakText(item.text)} aria-label="Play this reply aloud" title="Play aloud"><Volume2 size={13}/></button>}</div>)}
                {simBusy && <div className="chat-message assistant-message"><span className="chat-speaker">AI assistant</span><div className="chat-bubble thinking-bubble"><LoaderCircle className="spin-icon" size={15}/> Thinking of a response…</div></div>}
                <div ref={chatEndRef}/>
              </div>
              {simError && <div className="ai-inline-error" role="alert"><AlertCircle size={15}/><span>{simError}</span></div>}
              {simNotice && !simError && <div className="ai-inline-notice" role="status"><CheckCircle2 size={14}/><span>{simNotice}</span></div>}
              <form className="sim-input-row ai-input-row" onSubmit={(event) => { event.preventDefault(); void addSimMessage() }}>
                <input value={testMessage} onChange={(event) => setTestMessage(event.target.value)} placeholder="Type what the caller says…" aria-label="Caller message" disabled={simBusy}/>
                <button type="button" className={`send-button mic-send-button ${isListening ? 'mic-listening' : ''}`} onClick={isListening ? stopListening : startListening} disabled={simBusy} aria-label={isListening ? 'Stop listening' : 'Speak a caller message'} title={isListening ? 'Stop listening' : 'Speak a caller message'}>{isListening ? <MicOff size={17}/> : <Mic size={17}/>}</button>
                <button className="send-button" type="submit" disabled={!testMessage.trim() || simBusy} aria-label="Send caller message" title="Send message">{simBusy ? <LoaderCircle className="spin-icon" size={17}/> : <ArrowUpRight size={18}/>}</button>
              </form>
              <div className="ai-conversation-actions">
                <div className="ai-footnote"><Sparkles size={13}/><span>AI replies use the local Ollama model. Voice output uses your browser’s speech engine.</span></div>
                {simStarted && <button className="primary-button end-save-button" onClick={() => void endConversation()} disabled={simBusy}><PhoneOff size={15}/> End & save</button>}
                {!simStarted && simTranscript.length > 0 && <button className="primary-button end-save-button" onClick={beginConversation}><Mic size={15}/> New conversation</button>}
                {lastSavedCallId !== null && <span className="saved-record-label"><CheckCircle2 size={14}/> Saved #{lastSavedCallId}</span>}
              </div>
            </div>
            <div className="sim-side ai-sim-side">
              <div className="panel ai-info-card"><div className="guide-icon"><Sparkles size={19}/></div><h3>What is working in Phase 4?</h3><ul><li><Check size={15}/> Local LLM creates responses</li><li><Check size={15}/> Microphone speech input (supported browsers)</li><li><Check size={15}/> Spoken replies through text-to-speech</li><li><Check size={15}/> Saved transcripts in SQLite</li></ul></div>
              <div className="panel ai-info-card"><div className="script-heading"><Bot size={16}/><strong>Set up the free local AI</strong></div><p>Install Ollama, open a terminal, and download the model used by this project:</p><code className="command-chip">ollama pull qwen2.5:3b</code><p>Then keep Ollama running and start both project terminals. The model download is about 1.9 GB; local inference has no per-message API charge.</p><button className="text-button" onClick={() => setActivePage('settings')}>Review language and voice settings <ChevronRight size={14}/></button></div>
              <div className="panel ai-privacy-card"><div className="privacy-large"><ShieldCheck size={22}/></div><h3>Voice privacy note</h3><p>The language model runs locally via Ollama. Browser speech recognition may send audio to the browser’s speech service depending on browser support and settings. Use typed input if you do not want to use microphone recognition.</p><div className="privacy-list"><span><Check size={14}/> No paid AI key required</span><span><Check size={14}/> No real phone calls are placed</span><span><Check size={14}/> Conversation saves only when you end & save</span></div></div>
            </div>
          </div>
          <div className="prototype-disclaimer"><span className="info-dot">i</span><p><strong>Phase 4 boundary:</strong> this is a real voice-enabled local AI simulator, not a telephone call. Incoming SIM call routing and live phone audio remain Phase 6.</p></div>
        </section>}

        {activePage === 'settings' && <section className="subpage"><div className="subpage-heading"><div><div className="eyebrow">MAKE IT YOURS</div><h1>Assistant settings</h1><p className="page-description">Set the tone and preferences for your personal assistant.</p></div><div className={`setting-state ${assistantOn ? 'state-on' : ''}`}><span className="status-dot"/>{assistantOn ? 'Enabled in prototype' : 'Paused'}</div></div><div className="settings-layout"><div className="panel settings-panel"><div className="settings-section-title"><div className="settings-icon"><Bot size={18}/></div><div><h3>Assistant availability</h3><p>Control whether the prototype assistant is enabled.</p></div></div><div className="setting-row"><div><strong>Assistant enabled</strong><p>This only changes the website preview; it does not control phone calls.</p></div><button className={`toggle ${assistantOn ? 'toggle-on' : ''}`} role="switch" aria-checked={assistantOn} onClick={() => setAssistantOn(!assistantOn)}><span/></button></div><div className="settings-divider"/><div className="settings-section-title"><div className="settings-icon"><MessageSquareText size={18}/></div><div><h3>Opening greeting</h3><p>What the assistant says at the start of a routed call.</p></div></div><label className="field-label" htmlFor="greeting">Greeting message</label><textarea id="greeting" value={greeting} onChange={(e) => setGreeting(e.target.value)} rows={4} maxLength={300}/><div className="field-meta"><span>Keep it friendly and clear.</span><span>{greeting.length}/300</span></div><div className="settings-divider"/><div className="settings-section-title"><div className="settings-icon"><Mic size={18}/></div><div><h3>Voice preferences</h3><p>These preferences are saved by the local backend.</p></div></div><div className="field-grid"><div><label className="field-label" htmlFor="language">Preferred language</label><select id="language" value={language} onChange={(e) => setLanguage(e.target.value)}><option>English</option><option>Hindi</option><option>Marathi</option><option>English + Hindi</option></select></div><div><label className="field-label" htmlFor="voice">Voice style</label><select id="voice" value={voice} onChange={(e) => setVoice(e.target.value)}><option>Warm and natural</option><option>Professional</option><option>Calm and concise</option></select></div></div><div className="settings-footer"><span className="save-message">{savedSettings ? <><Check size={15}/> Preferences saved to database</> : 'Save changes to store them in SQLite.'}</span><button className="primary-button" onClick={saveSettings}><Check size={16}/> Save preferences</button></div></div><div className="settings-side"><div className="panel privacy-panel"><div className="privacy-large"><ShieldCheck size={22}/></div><h3>Your privacy matters</h3><p>This local prototype combines sample records with saved simulator conversations. Real caller data will need secure storage and careful access controls.</p><div className="privacy-list"><span><Check size={15}/> No live calls connected</span><span><Check size={15}/> No audio recording</span><span><Check size={15}/> No AI API key in browser</span></div></div><div className="panel next-phase-card"><div className="next-phase-top"><Command size={17}/><span>PROJECT ROADMAP</span></div><h3>Next: Android integration</h3><p>The local AI voice simulator is in place. The next technical checkpoint is Android packaging and call-routing research.</p><div className="progress-track"><span style={{ width: '57%' }}/></div><div className="progress-meta"><span>Phase 4 of 7</span><span>AI + speech prototype</span></div></div></div></div></section>}
      </div>
    </main>
    {selectedCall && <div className="modal-backdrop" role="presentation" onClick={() => setSelectedCall(null)}><section className="call-detail-modal" role="dialog" aria-modal="true" aria-label="Call details" onClick={(e) => e.stopPropagation()}><div className="modal-header"><div><div className="eyebrow">CALL DETAILS</div><h2>Caller overview</h2></div><button className="icon-button" onClick={() => setSelectedCall(null)} aria-label="Close details"><X size={18}/></button></div><div className="detail-person"><div className={`call-avatar large ${selectedCall.color}`}>{selectedCall.initials}</div><div><h3>{selectedCall.name}</h3><p>{selectedCall.number}</p><span>{selectedCall.date} · {selectedCall.time} · {selectedCall.duration}</span></div></div><div className="detail-status-row"><StatusBadge status={selectedCall.status}/><span className="detail-purpose">{selectedCall.purpose}</span></div><div className="detail-summary"><div className="summary-heading"><Sparkles size={15}/><strong>Summary</strong></div><p>{selectedCall.summary}</p></div><div className="transcript-heading"><h3>Conversation</h3><span>{selectedCall.transcript.length} messages</span></div>{selectedCall.transcript.length ? <div className="transcript-list">{selectedCall.transcript.map((line, i) => <div className={`transcript-line ${line.speaker === 'Caller' ? 'transcript-caller' : ''}`} key={i}><span>{line.speaker}</span><p>{line.text}</p></div>)}</div> : <div className="empty-state">No transcript available for this call.</div>}<div className="modal-actions"><button className="secondary-button" onClick={() => { navigator.clipboard?.writeText(`${selectedCall.name} · ${selectedCall.number}\nPurpose: ${selectedCall.purpose}\nSummary: ${selectedCall.summary}`); }}><MessageSquareText size={16}/> Copy summary</button>{selectedCall.status === 'Needs follow-up' && <button className="primary-button" onClick={() => markFollowedUp(selectedCall)}><Check size={16}/> Mark reviewed</button>}</div><p className="modal-disclaimer">Sample information only. The prototype does not place calls or access your phone contacts.</p></section></div>}
  </div>
}

function StatCard({ icon, label, value, note, tone }: { icon: React.ReactNode; label: string; value: string; note: string; tone: string }) {
  return <div className="stat-card"><div className={`stat-icon ${tone}`}>{icon}</div><div className="stat-label">{label}</div><div className="stat-value">{value}</div><div className="stat-note">{note}</div></div>
}

function StatusBadge({ status }: { status: Call['status'] }) {
  const className = status === 'Needs follow-up' ? 'status-followup' : status === 'Missed' ? 'status-missed' : 'status-completed'
  return <span className={`status-badge ${className}`}><i/> {status}</span>
}

function CallRow({ call, onClick, detailed = false }: { call: Call; onClick: () => void; detailed?: boolean }) {
  return <button className={`call-row ${detailed ? 'detailed-row' : ''}`} onClick={onClick}><div className="caller-cell"><div className={`call-avatar ${call.color}`}>{call.initials}</div><div className="caller-copy"><strong>{call.name}</strong><span>{call.number}</span></div></div><div className="purpose-cell">{call.purpose}</div><div className="time-cell">{call.time}<small>{call.date}</small></div><div className="status-cell"><StatusBadge status={call.status}/></div><div className="row-arrow"><ChevronRight size={17}/></div></button>
}

export default App
