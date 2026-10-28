import http from 'node:http'
import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const db = new DatabaseSync(path.join(__dirname, 'personal-ai-caller.sqlite'))
const PORT = Number(process.env.PORT || 3001)
const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434').replace(/\/$/, '')
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'qwen2.5:3b'

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL, number TEXT NOT NULL, initials TEXT NOT NULL DEFAULT 'UC', color TEXT NOT NULL DEFAULT 'mint',
    time TEXT NOT NULL, date TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('Completed','Needs follow-up','Missed')),
    duration TEXT NOT NULL DEFAULT '—', purpose TEXT NOT NULL DEFAULT 'No details captured', summary TEXT NOT NULL DEFAULT '',
    transcript TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK(id = 1), assistant_on INTEGER NOT NULL DEFAULT 1,
    greeting TEXT NOT NULL, language TEXT NOT NULL DEFAULT 'English', voice TEXT NOT NULL DEFAULT 'Warm and natural',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`)

const seedCalls = [
  { name:'Rahul Sharma', number:'+91 98765 43210', initials:'RS', color:'lavender', time:'10:42 AM', date:'Today', status:'Needs follow-up', duration:'1m 24s', purpose:'Pega job opportunity', summary:'Rahul is calling about a Pega CDH developer opening. He asked for a callback this afternoon to discuss the role and project details.', transcript:[{speaker:'AI assistant',text:'Hi! You’ve reached Pavan’s AI assistant. He’s unavailable at the moment. How can I help?'},{speaker:'Caller',text:'Hi, I’m calling about a Pega CDH developer opportunity. Could he call me back today?'},{speaker:'AI assistant',text:'Of course. I’ll pass along that you’re calling about a Pega CDH role and would appreciate a callback today.'}] },
  { name:'Aditi Kulkarni', number:'+91 98220 11745', initials:'AK', color:'peach', time:'9:18 AM', date:'Today', status:'Completed', duration:'48s', purpose:'Website project update', summary:'Aditi wanted to confirm the latest website changes and asked to connect after 4 PM.', transcript:[{speaker:'AI assistant',text:'Hello! Pavan is busy right now. What would you like me to let him know?'},{speaker:'Caller',text:'I wanted to discuss the website update. Ask him to call after four.'},{speaker:'AI assistant',text:'Got it. I’ll let him know you’d like to discuss the website update after 4 PM.'}] },
  { name:'Unknown caller', number:'+91 90110 68422', initials:'UC', color:'mint', time:'Yesterday', date:'Yesterday', status:'Completed', duration:'32s', purpose:'General enquiry', summary:'The caller asked whether Pavan was available. No specific reason for the call was provided.', transcript:[{speaker:'AI assistant',text:'Hi, I’m Pavan’s AI assistant. He can’t come to the phone right now. What are you calling about?'},{speaker:'Caller',text:'I just wanted to speak with him. I’ll try again later.'},{speaker:'AI assistant',text:'No problem. I’ll let him know you called.'}] },
  { name:'Sneha Patil', number:'+91 97654 22018', initials:'SP', color:'blue', time:'Yesterday', date:'Yesterday', status:'Missed', duration:'—', purpose:'No details captured', summary:'The call was not connected to the AI assistant. No conversation details are available.', transcript:[] },
]
if (db.prepare('SELECT COUNT(*) AS count FROM calls').get().count === 0) {
  const insert = db.prepare('INSERT INTO calls (name,number,initials,color,time,date,status,duration,purpose,summary,transcript) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
  for (const c of seedCalls) insert.run(c.name,c.number,c.initials,c.color,c.time,c.date,c.status,c.duration,c.purpose,c.summary,JSON.stringify(c.transcript))
}
if (!db.prepare('SELECT id FROM settings WHERE id=1').get()) {
  db.prepare('INSERT INTO settings (id, assistant_on, greeting, language, voice) VALUES (1,1,?,?,?)').run('Hi! You’ve reached Pavan’s AI assistant. He’s unavailable at the moment. How can I help?', 'English', 'Warm and natural')
}

function serializeCall(row) { return { ...row, transcript: JSON.parse(row.transcript) } }
function initialsFor(name) { return name.split(/\s+/).filter(Boolean).slice(0,2).map(p => p[0].toUpperCase()).join('') || 'UC' }
function settingsObject(s) { return { assistantOn:Boolean(s.assistant_on), greeting:s.greeting, language:s.language, voice:s.voice, updatedAt:s.updated_at } }
function send(res, status, data) { res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store' }); res.end(JSON.stringify(data)) }
async function readBody(req) {
  let raw = ''
  for await (const chunk of req) { raw += chunk; if (raw.length > 1_000_000) throw new Error('Request body too large') }
  if (!raw) return {}
  return JSON.parse(raw)
}
function currentClock() { const now = new Date(); return { time:now.toLocaleTimeString('en-IN',{hour:'numeric',minute:'2-digit'}), date:'Today' } }

const server = http.createServer(async (req,res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`)
  const method = req.method || 'GET'
  try {
    if (method === 'GET' && url.pathname === '/api/health') return send(res,200,{ok:true,service:'personal-ai-caller-api',database:'sqlite'})
    if (method === 'GET' && url.pathname === '/api/ai/status') {
      try {
        const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(2500) })
        if (!response.ok) throw new Error(`Ollama returned ${response.status}`)
        const payload = await response.json()
        const models = Array.isArray(payload.models) ? payload.models.map((item) => item.name).filter(Boolean) : []
        const modelAvailable = models.some((name) => name === OLLAMA_MODEL || name.startsWith(`${OLLAMA_MODEL}:`))
        return send(res,200,{provider:'ollama',available:true,model:OLLAMA_MODEL,modelAvailable,models,message:modelAvailable ? 'Local AI is ready.' : `Ollama is running, but ${OLLAMA_MODEL} is not installed yet.`})
      } catch {
        return send(res,200,{provider:'ollama',available:false,model:OLLAMA_MODEL,modelAvailable:false,models:[],message:'Ollama is not reachable. Install and start Ollama, then download the configured model.'})
      }
    }
    if (method === 'POST' && url.pathname === '/api/ai/chat') {
      const body = await readBody(req)
      const message = typeof body.message === 'string' ? body.message.trim().slice(0,2000) : ''
      if (!message) return send(res,400,{error:'A non-empty message is required.'})
      const requestedLanguage = ['English','Hindi','Marathi','English + Hindi'].includes(body.language) ? body.language : 'English'
      const rawHistory = Array.isArray(body.history) ? body.history.slice(-12) : []
      const history = rawHistory.map((item) => ({
        role: item?.role === 'assistant' ? 'assistant' : 'user',
        content: typeof item?.content === 'string' ? item.content.trim().slice(0,2000) : ''
      })).filter((item) => item.content)
      const languageInstruction = requestedLanguage === 'Hindi' ? 'Speak in natural Hindi.' : requestedLanguage === 'Marathi' ? 'Speak in natural Marathi.' : requestedLanguage === 'English + Hindi' ? 'Use natural, simple English and Hindi as the caller does; do not force a language switch.' : 'Speak in natural, simple English.'
      const systemMessage = `You are a concise, warm, professional AI phone assistant for Pavan. You are speaking to a caller on Pavan’s behalf. Be transparent that you are an AI assistant; never claim to be Pavan or a human. ${languageInstruction} Respond conversationally in one or two short sentences, usually under 45 words. Your main task is to understand why the person called, ask only useful follow-up questions, and capture the message, caller name or callback preference when relevant. Do not invent Pavan’s availability, commitments, contact details, or facts. Do not promise that Pavan has already received a message. If the caller says they are in immediate danger or describes a medical emergency, tell them to contact local emergency services. Do not ask for passwords, OTPs, bank details, or other sensitive information. Avoid repeating the same question; end politely when the caller has finished.`
      try {
        const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
          method:'POST', headers:{'Content-Type':'application/json'}, signal:AbortSignal.timeout(120000),
          body:JSON.stringify({model:OLLAMA_MODEL, messages:[{role:'system',content:systemMessage}, ...history, {role:'user',content:message}], stream:false, options:{temperature:0.55}, keep_alive:'5m'})
        })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          const detail = typeof payload.error === 'string' ? payload.error : `Ollama returned ${response.status}`
          const missing = /not found|pull model|model.*does not exist/i.test(detail)
          return send(res,503,{error:missing ? `Model ${OLLAMA_MODEL} is not installed. Run: ollama pull ${OLLAMA_MODEL}` : 'The local AI engine could not complete the response.', detail:detail.slice(0,300)})
        }
        const reply = typeof payload.message?.content === 'string' ? payload.message.content.trim() : ''
        if (!reply) return send(res,502,{error:'The AI engine returned an empty response. Please try again.'})
        return send(res,200,{reply,model:payload.model || OLLAMA_MODEL,provider:'ollama'})
      } catch (error) {
        const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError'
        return send(res,503,{error:timedOut ? 'The local AI response timed out. Try a smaller model or a shorter message.' : 'Cannot connect to Ollama. Start Ollama and make sure the model is installed.', detail:String(error?.message || '').slice(0,250)})
      }
    }
    if (method === 'GET' && url.pathname === '/api/calls') return send(res,200,db.prepare('SELECT * FROM calls ORDER BY id DESC').all().map(serializeCall))
    const callMatch = url.pathname.match(/^\/api\/calls\/(\d+)$/)
    if (callMatch && method === 'GET') {
      const row = db.prepare('SELECT * FROM calls WHERE id=?').get(Number(callMatch[1]))
      return row ? send(res,200,serializeCall(row)) : send(res,404,{error:'Call not found'})
    }
    if (callMatch && method === 'PATCH') {
      const body = await readBody(req); const status = body.status; const id = Number(callMatch[1])
      if (!db.prepare('SELECT id FROM calls WHERE id=?').get(id)) return send(res,404,{error:'Call not found'})
      if (!['Completed','Needs follow-up','Missed'].includes(status)) return send(res,400,{error:'A valid status is required'})
      db.prepare('UPDATE calls SET status=? WHERE id=?').run(status,id)
      return send(res,200,serializeCall(db.prepare('SELECT * FROM calls WHERE id=?').get(id)))
    }
    if (method === 'POST' && url.pathname === '/api/calls') {
      const body = await readBody(req)
      const name = typeof body.name === 'string' ? body.name.trim().slice(0,120) : ''
      const number = typeof body.number === 'string' ? body.number.trim().slice(0,40) : ''
      const purpose = typeof body.purpose === 'string' ? body.purpose.trim().slice(0,200) : 'General enquiry'
      const summary = typeof body.summary === 'string' ? body.summary.trim().slice(0,2000) : ''
      const transcript = Array.isArray(body.transcript) ? body.transcript.slice(-100).map(line => ({speaker:String(line.speaker || 'Caller').slice(0,40),text:String(line.text || '').slice(0,4000)})) : []
      const status = ['Completed','Needs follow-up','Missed'].includes(body.status) ? body.status : 'Needs follow-up'
      if (!name || !number) return send(res,400,{error:'name and number are required'})
      const {time,date} = currentClock(); const colors = ['lavender','peach','mint','blue']
      const result = db.prepare('INSERT INTO calls (name,number,initials,color,time,date,status,duration,purpose,summary,transcript) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(name,number,initialsFor(name),colors[Number(Date.now()%colors.length)],time,date,status,'—',purpose,summary,JSON.stringify(transcript))
      return send(res,201,serializeCall(db.prepare('SELECT * FROM calls WHERE id=?').get(Number(result.lastInsertRowid))))
    }
    if (method === 'GET' && url.pathname === '/api/settings') return send(res,200,settingsObject(db.prepare('SELECT * FROM settings WHERE id=1').get()))
    if (method === 'PUT' && url.pathname === '/api/settings') {
      const body = await readBody(req); const current = db.prepare('SELECT * FROM settings WHERE id=1').get()
      const assistantOn = typeof body.assistantOn === 'boolean' ? Number(body.assistantOn) : current.assistant_on
      const greeting = typeof body.greeting === 'string' ? body.greeting.trim().slice(0,300) : current.greeting
      const language = ['English','Hindi','Marathi','English + Hindi'].includes(body.language) ? body.language : current.language
      const voice = ['Warm and natural','Professional','Calm and concise'].includes(body.voice) ? body.voice : current.voice
      db.prepare('UPDATE settings SET assistant_on=?, greeting=?, language=?, voice=?, updated_at=CURRENT_TIMESTAMP WHERE id=1').run(assistantOn,greeting,language,voice)
      return send(res,200,settingsObject(db.prepare('SELECT * FROM settings WHERE id=1').get()))
    }
    return send(res,404,{error:'Not found'})
  } catch (error) {
    console.error(error)
    return send(res,400,{error:error instanceof SyntaxError ? 'Invalid JSON body' : 'Request failed'})
  }
})

server.listen(PORT, '127.0.0.1', () => console.log(`Personal AI Caller API running at http://127.0.0.1:${PORT}`))
