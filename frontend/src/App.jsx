import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bot,
  Heart,
  LayoutDashboard,
  MessageSquareText,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  User,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const API_URL = '/api';

// -- design tokens -----------------------------------------------------------
const COLORS = {
  bg: '#f4f8f7',
  panel: '#ffffff',
  border: '#dbe6e3',
  ink: '#0b2b2a',
  sub: '#5b7370',
  teal: '#0d7d72',
  tealDark: '#0a5c54',
  tealSoft: '#e3f3f0',
  navy: '#123a5e',
  amber: '#b7791f',
  red: '#c0392b',
  redSoft: '#fbeae7',
  redBorder: '#f3c6bd',
};

const CHART_COLORS = ['#0d7d72', '#123a5e', '#b7791f', '#5b8c87', '#8fb8c9'];

function Card({ children, style }) {
  return (
    <div
      style={{
        background: COLORS.panel,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 16,
        padding: 18,
        boxShadow: '0 8px 24px rgba(11, 43, 42, 0.05)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function NavButton({ active, onClick, icon, label }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '11px 12px',
        borderRadius: 10,
        marginBottom: 8,
        cursor: 'pointer',
        textAlign: 'left',
        fontSize: 14,
        fontWeight: active ? 700 : 500,
        color: active ? COLORS.tealDark : COLORS.ink,
        background: active ? COLORS.tealSoft : 'transparent',
        border: active ? `1px solid ${COLORS.teal}33` : '1px solid transparent',
      }}
    >
      {icon} {label}
    </button>
  );
}

function KpiCard({ label, value, sub }) {
  return (
    <Card style={{ padding: 16 }}>
      <div style={{ color: COLORS.sub, fontSize: 12.5, fontWeight: 600, letterSpacing: 0.2 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, marginTop: 6, color: COLORS.ink }}>{value}</div>
      {sub && <div style={{ color: COLORS.teal, fontSize: 12, marginTop: 4 }}>{sub}</div>}
    </Card>
  );
}

function App() {
  const [view, setView] = useState('login');
  const [token, setToken] = useState(localStorage.getItem('careline-token') || '');
  const [user, setUser] = useState(null);
  const [loginForm, setLoginForm] = useState({ email: 'nurse@careline.health', password: 'careline123' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [categories, setCategories] = useState([]);
  const [category, setCategory] = useState('');

  const [chatId, setChatId] = useState(null);
  const [chats, setChats] = useState([]);
  const [messages, setMessages] = useState([]);
  const [question, setQuestion] = useState('');

  const [patientQuery, setPatientQuery] = useState('');
  const [patientResults, setPatientResults] = useState([]);
  const [activePatient, setActivePatient] = useState(null);
  const [patientSummary, setPatientSummary] = useState(null);

  const [stats, setStats] = useState(null);

  const authHeaders = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);

  // -- session bootstrap -----------------------------------------------------
  useEffect(() => {
    const loadSession = async () => {
      if (!token) return;
      try {
        const res = await fetch(`${API_URL}/me`, { headers: authHeaders });
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
          setView('dashboard');
          loadChats();
          loadCategories();
          loadStats();
        } else {
          localStorage.removeItem('careline-token');
          setToken('');
        }
      } catch {
        localStorage.removeItem('careline-token');
      }
    };
    loadSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const loadChats = async () => {
    try {
      const res = await fetch(`${API_URL}/chats`, { headers: authHeaders });
      if (res.ok) setChats(await res.json());
    } catch {
      // ignore
    }
  };

  const loadCategories = async () => {
    try {
      const res = await fetch(`${API_URL}/categories`);
      if (res.ok) {
        const data = await res.json();
        setCategories(data.categories || []);
      }
    } catch {
      // ignore
    }
  };

  const loadStats = async () => {
    try {
      const res = await fetch(`${API_URL}/stats`, { headers: authHeaders });
      if (res.ok) setStats(await res.json());
    } catch {
      // ignore
    }
  };

  // -- auth --------------------------------------------------------------------
  const handleLogin = async (event) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Login failed');
      localStorage.setItem('careline-token', data.token);
      setToken(data.token);
      setUser(data.user);
      setView('dashboard');
      await loadChats();
      await loadStats();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('careline-token');
    setToken('');
    setUser(null);
    setView('login');
  };

  // -- patients -----------------------------------------------------------------
  const searchPatients = async (q) => {
    setPatientQuery(q);
    if (!q || q.length < 2) {
      setPatientResults([]);
      return;
    }
    try {
      const res = await fetch(`${API_URL}/patients/search?q=${encodeURIComponent(q)}`, { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        setPatientResults(data.patients || []);
      }
    } catch {
      // ignore
    }
  };

  const selectPatient = async (patient) => {
    setActivePatient(patient);
    setPatientResults([]);
    setPatientQuery('');
    try {
      const res = await fetch(`${API_URL}/patients/${patient.patient_id}/summary`, { headers: authHeaders });
      if (res.ok) setPatientSummary(await res.json());
    } catch {
      setPatientSummary(null);
    }
  };

  // -- chat --------------------------------------------------------------------
  const createConversation = async () => {
    try {
      const res = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          title: activePatient ? `Case: ${activePatient.first_name} ${activePatient.last_name}` : 'General question',
          patient_id: activePatient?.patient_id || null,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setChatId(data.id);
        setMessages([]);
        setView('assistant');
        await loadChats();
      }
    } catch {
      setError('Unable to start a new conversation.');
    }
  };

  const openChat = async (chat) => {
    setChatId(chat.id);
    try {
      const res = await fetch(`${API_URL}/chat/${chat.id}/messages`, { headers: authHeaders });
      if (res.ok) {
        const data = await res.json();
        setMessages(
          data.map((msg) => ({
            role: msg.role,
            content: msg.content,
            escalated: !!msg.escalated,
            sources: msg.sources ? JSON.parse(msg.sources) : [],
          }))
        );
      }
    } catch {
      setMessages([]);
    }
    if (chat.patient_id) {
      selectPatient({ patient_id: chat.patient_id, first_name: '', last_name: '' });
    }
    setView('assistant');
  };

  const askQuestion = async () => {
    if (!question.trim() || !chatId) return;
    const userMessage = { role: 'user', content: question };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setLoading(true);
    setError('');
    const askedQuestion = question;
    setQuestion('');

    try {
      const res = await fetch(`${API_URL}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          question: askedQuestion,
          patient_id: activePatient?.patient_id || null,
          category: category || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'The assistant could not answer');
      const assistantMessage = {
        role: 'assistant',
        content: data.answer || 'No answer returned',
        escalated: !!data.escalate,
        sources: data.sources || [],
      };
      setMessages([...nextMessages, assistantMessage]);

      await fetch(`${API_URL}/chat/${chatId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ role: 'user', content: askedQuestion }),
      });
      await fetch(`${API_URL}/chat/${chatId}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({
          role: 'assistant',
          content: assistantMessage.content,
          escalated: assistantMessage.escalated,
          sources: assistantMessage.sources,
        }),
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // -- render --------------------------------------------------------------------
  return (
    <div style={{ minHeight: '100vh', background: COLORS.bg, color: COLORS.ink, fontFamily: 'Inter, system-ui, Arial, sans-serif' }}>
      <div style={{ maxWidth: 1480, margin: '0 auto', padding: 24 }}>
        {!user ? (
          <div style={{ maxWidth: 460, margin: '90px auto', padding: 32, borderRadius: 20, background: COLORS.panel, border: `1px solid ${COLORS.border}`, boxShadow: '0 18px 45px rgba(11, 43, 42, 0.08)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <Heart size={24} color={COLORS.teal} />
              <h2 style={{ margin: 0 }}>CareLine</h2>
            </div>
            <p style={{ color: COLORS.sub, marginBottom: 4 }}>Patient Support Knowledge Assistant</p>
            <p style={{ color: COLORS.sub, marginBottom: 24, fontSize: 13.5 }}>
              Grounded, cited answers for post-discharge questions - with built-in escalation for
              emergencies and clinical judgment calls.
            </p>
            <form onSubmit={handleLogin}>
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 600, fontSize: 13.5 }}>Email</label>
              <input
                value={loginForm.email}
                onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                style={{ width: '100%', padding: 12, borderRadius: 10, marginBottom: 12, border: `1px solid ${COLORS.border}`, background: '#fbfdfc', boxSizing: 'border-box' }}
              />
              <label style={{ display: 'block', marginBottom: 8, fontWeight: 600, fontSize: 13.5 }}>Password</label>
              <input
                type="password"
                value={loginForm.password}
                onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                style={{ width: '100%', padding: 12, borderRadius: 10, marginBottom: 16, border: `1px solid ${COLORS.border}`, background: '#fbfdfc', boxSizing: 'border-box' }}
              />
              {error && <div style={{ color: COLORS.red, marginBottom: 12, fontSize: 13.5 }}>{error}</div>}
              <button
                type="submit"
                disabled={loading}
                style={{ width: '100%', padding: 12, borderRadius: 10, background: `linear-gradient(90deg, ${COLORS.teal}, ${COLORS.tealDark})`, color: 'white', border: 'none', cursor: 'pointer', fontWeight: 600 }}
              >
                {loading ? 'Signing in...' : 'Sign in'}
              </button>
            </form>
            <div style={{ marginTop: 16, fontSize: 12, color: COLORS.sub }}>
              Demo login: nurse@careline.health / careline123
            </div>
          </div>
        ) : (
          <>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22, background: COLORS.panel, padding: '18px 22px', borderRadius: 18, border: `1px solid ${COLORS.border}` }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <Heart size={20} color={COLORS.teal} />
                  <h1 style={{ margin: 0, fontSize: 22 }}>CareLine Support Console</h1>
                </div>
                <p style={{ margin: 0, color: COLORS.sub, fontSize: 13.5 }}>
                  Grounded patient education, personalized with chart context, with automatic emergency escalation.
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 700 }}>{user.full_name}</div>
                <div style={{ color: COLORS.sub, fontSize: 12.5 }}>{user.role}</div>
                <button onClick={logout} style={{ marginTop: 8, padding: '7px 12px', borderRadius: 8, border: `1px solid ${COLORS.border}`, background: '#fbfdfc', cursor: 'pointer', fontSize: 13 }}>
                  Logout
                </button>
              </div>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: '270px 1fr', gap: 20 }}>
              <aside style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 16, minHeight: 760 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, color: COLORS.sub, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                  Workspace
                </div>
                <NavButton active={view === 'dashboard'} onClick={() => setView('dashboard')} icon={<LayoutDashboard size={16} />} label="Dashboard" />
                <NavButton active={view === 'assistant'} onClick={() => setView('assistant')} icon={<Bot size={16} />} label="Assistant" />
                <NavButton active={view === 'patients'} onClick={() => setView('patients')} icon={<User size={16} />} label="Patient Lookup" />
                <NavButton active={view === 'settings'} onClick={() => setView('settings')} icon={<Settings size={16} />} label="Settings" />

                <div style={{ marginTop: 20, marginBottom: 10, color: COLORS.sub, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                  Recent Conversations
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 260, overflowY: 'auto' }}>
                  {chats.length === 0 && <div style={{ fontSize: 12.5, color: COLORS.sub }}>No conversations yet.</div>}
                  {chats.map((chat) => (
                    <button
                      key={chat.id}
                      onClick={() => openChat(chat)}
                      style={{ textAlign: 'left', padding: 10, borderRadius: 10, background: '#fbfdfc', border: `1px solid ${COLORS.border}`, color: COLORS.ink, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}
                    >
                      <MessageSquareText size={14} color={COLORS.sub} /> {chat.title}
                    </button>
                  ))}
                </div>

                <div style={{ marginTop: 20, padding: 12, borderRadius: 12, background: COLORS.tealSoft, border: `1px solid ${COLORS.teal}33`, fontSize: 12, color: COLORS.tealDark }}>
                  <ShieldCheck size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
                  Emergency and out-of-scope clinical questions are auto-escalated to the care team.
                </div>
              </aside>

              <main style={{ background: COLORS.panel, border: `1px solid ${COLORS.border}`, borderRadius: 18, padding: 20, minHeight: 760 }}>
                {view === 'dashboard' && <Dashboard stats={stats} onNewConversation={createConversation} />}

                {view === 'assistant' && (
                  <AssistantView
                    categories={categories}
                    category={category}
                    setCategory={setCategory}
                    activePatient={activePatient}
                    patientQuery={patientQuery}
                    patientResults={patientResults}
                    searchPatients={searchPatients}
                    selectPatient={selectPatient}
                    clearPatient={() => {
                      setActivePatient(null);
                      setPatientSummary(null);
                    }}
                    messages={messages}
                    question={question}
                    setQuestion={setQuestion}
                    askQuestion={askQuestion}
                    loading={loading}
                    error={error}
                    chatId={chatId}
                    createConversation={createConversation}
                  />
                )}

                {view === 'patients' && (
                  <PatientLookupView
                    patientQuery={patientQuery}
                    patientResults={patientResults}
                    searchPatients={searchPatients}
                    selectPatient={selectPatient}
                    activePatient={activePatient}
                    patientSummary={patientSummary}
                  />
                )}

                {view === 'settings' && <SettingsView user={user} />}
              </main>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Dashboard({ stats, onNewConversation }) {
  if (!stats) {
    return (
      <div style={{ color: COLORS.sub }}>
        Loading dashboard metrics... (run <code>python scripts/build_stats.py</code> if this doesn't load)
      </div>
    );
  }

  const { kpis, conversation_trend, channel_distribution, intent_distribution, readmission_by_diagnosis, no_show_by_department } = stats;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h3 style={{ margin: 0 }}>Program Overview</h3>
          <p style={{ margin: '4px 0 0 0', color: COLORS.sub }}>
            Patient support chat volume, satisfaction, and clinical follow-up signals.
          </p>
        </div>
        <button
          onClick={onNewConversation}
          style={{ padding: '10px 14px', borderRadius: 10, background: `linear-gradient(90deg, ${COLORS.teal}, ${COLORS.tealDark})`, color: 'white', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}
        >
          <Sparkles size={16} /> New conversation
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 16, marginBottom: 20 }}>
        <KpiCard label="Total conversations" value={kpis.total_conversations.toLocaleString()} />
        <KpiCard label="Avg. CSAT (1-5)" value={kpis.avg_csat} />
        <KpiCard label="Escalation rate" value={`${kpis.escalation_rate_pct}%`} sub="to human / clinical review" />
        <KpiCard label="Resolved on first contact" value={`${kpis.resolved_first_contact_pct}%`} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16, marginBottom: 20 }}>
        <KpiCard label="Avg. bot-handled share" value={`${kpis.avg_bot_handled_pct}%`} />
        <KpiCard label="Avg. SLA met" value={`${kpis.avg_sla_met_pct}%`} />
        <KpiCard label="Avg. first response" value={`${kpis.avg_first_response_min} min`} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 0.9fr', gap: 16, marginBottom: 16 }}>
        <Card>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Conversation volume &amp; CSAT trend</div>
          <ResponsiveContainer width="100%" height={230}>
            <AreaChart data={conversation_trend}>
              <CartesianGrid stroke={COLORS.border} />
              <XAxis dataKey="month" fontSize={12} />
              <YAxis fontSize={12} />
              <Tooltip />
              <Area type="monotone" dataKey="conversations" stroke={COLORS.teal} fill={`${COLORS.teal}33`} />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
        <Card>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Channel mix</div>
          <ResponsiveContainer width="100%" height={230}>
            <PieChart>
              <Pie data={channel_distribution} dataKey="value" nameKey="name" innerRadius={52} outerRadius={80}>
                {channel_distribution.map((entry, index) => (
                  <Cell key={entry.name} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Top conversation intents</div>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={intent_distribution}>
              <CartesianGrid stroke={COLORS.border} />
              <XAxis dataKey="name" fontSize={11} interval={0} angle={-20} textAnchor="end" height={60} />
              <YAxis fontSize={12} />
              <Tooltip />
              <Bar dataKey="value" fill={COLORS.teal} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>30-day readmission rate by diagnosis group</div>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={readmission_by_diagnosis.slice(0, 8)}>
              <CartesianGrid stroke={COLORS.border} />
              <XAxis dataKey="diagnosis_group" fontSize={11} interval={0} angle={-20} textAnchor="end" height={60} />
              <YAxis fontSize={12} unit="%" />
              <Tooltip />
              <Bar dataKey="readmit_rate" fill={COLORS.navy} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Appointment no-show rate by department</div>
        <ResponsiveContainer width="100%" height={230}>
          <BarChart data={no_show_by_department}>
            <CartesianGrid stroke={COLORS.border} />
            <XAxis dataKey="department" fontSize={11} interval={0} angle={-20} textAnchor="end" height={60} />
            <YAxis fontSize={12} unit="%" />
            <Tooltip />
            <Bar dataKey="no_show_rate" fill={COLORS.amber} radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}

function AssistantView({
  categories,
  category,
  setCategory,
  activePatient,
  patientQuery,
  patientResults,
  searchPatients,
  selectPatient,
  clearPatient,
  messages,
  question,
  setQuestion,
  askQuestion,
  loading,
  error,
  chatId,
  createConversation,
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h3 style={{ margin: 0 }}>Patient Support Assistant</h3>
          <p style={{ margin: '4px 0 0 0', color: COLORS.sub, maxWidth: 520 }}>
            Answers are grounded in the approved knowledge base and cite article ids. Emergency
            symptoms and diagnosis requests are escalated automatically, not answered.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={category} onChange={(e) => setCategory(e.target.value)} style={{ padding: 10, borderRadius: 10, border: `1px solid ${COLORS.border}` }}>
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c.replace('_', ' ')}
              </option>
            ))}
          </select>
          {!chatId && (
            <button
              onClick={createConversation}
              style={{ padding: '10px 14px', borderRadius: 10, background: `linear-gradient(90deg, ${COLORS.teal}, ${COLORS.tealDark})`, color: 'white', border: 'none', cursor: 'pointer', fontWeight: 600 }}
            >
              Start conversation
            </button>
          )}
        </div>
      </div>

      <div style={{ marginBottom: 14, position: 'relative' }}>
        {activePatient ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, background: COLORS.tealSoft, border: `1px solid ${COLORS.teal}44`, fontSize: 13.5 }}>
            <User size={15} color={COLORS.tealDark} />
            Personalizing for patient <strong>{activePatient.patient_id}</strong>
            {activePatient.first_name && ` - ${activePatient.first_name} ${activePatient.last_name}`}
            <button onClick={clearPatient} style={{ marginLeft: 'auto', border: 'none', background: 'transparent', color: COLORS.tealDark, cursor: 'pointer', fontSize: 12.5 }}>
              Clear
            </button>
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, border: `1px solid ${COLORS.border}`, background: '#fbfdfc' }}>
              <Search size={15} color={COLORS.sub} />
              <input
                value={patientQuery}
                onChange={(e) => searchPatients(e.target.value)}
                placeholder="Optional: link a patient (search by ID or last name) to personalize the answer"
                style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13.5 }}
              />
            </div>
            {patientResults.length > 0 && (
              <div style={{ marginTop: 6, border: `1px solid ${COLORS.border}`, borderRadius: 10, overflow: 'hidden', background: 'white', position: 'absolute', zIndex: 10, width: '100%' }}>
                {patientResults.map((p) => (
                  <button
                    key={p.patient_id}
                    onClick={() => selectPatient(p)}
                    style={{ width: '100%', textAlign: 'left', padding: 10, border: 'none', borderBottom: `1px solid ${COLORS.border}`, background: 'white', cursor: 'pointer', fontSize: 13 }}
                  >
                    {p.patient_id} - {p.first_name} {p.last_name} ({p.age}, {p.gender})
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 12, minHeight: 320 }}>
        {messages.length === 0 && (
          <div style={{ color: COLORS.sub, fontSize: 13.5 }}>
            Start a conversation with a question about medications, symptom monitoring, appointments, or discharge instructions.
          </div>
        )}
        {messages.map((msg, index) => (
          <ChatBubble key={index} msg={msg} />
        ))}
        {loading && <div style={{ color: COLORS.sub, fontSize: 13.5 }}>Thinking...</div>}
      </div>

      {error && <div style={{ color: COLORS.red, marginBottom: 10, fontSize: 13.5 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 10 }}>
        <textarea
          rows={3}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              askQuestion();
            }
          }}
          placeholder="e.g. What should I do if I miss a dose of metformin?"
          style={{ flex: 1, padding: 12, borderRadius: 10, border: `1px solid ${COLORS.border}`, background: '#fbfdfc', resize: 'vertical' }}
        />
        <button
          onClick={askQuestion}
          disabled={loading || !chatId}
          style={{ padding: '12px 16px', borderRadius: 10, background: `linear-gradient(90deg, ${COLORS.teal}, ${COLORS.tealDark})`, color: 'white', border: 'none', cursor: 'pointer', fontWeight: 600, opacity: !chatId ? 0.6 : 1 }}
        >
          {loading ? 'Working...' : 'Ask'}
        </button>
      </div>
    </div>
  );
}

function ChatBubble({ msg }) {
  const isUser = msg.role === 'user';
  const isEscalated = msg.escalated;
  return (
    <div style={{ alignSelf: isUser ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
      <div
        style={{
          padding: '12px 14px',
          borderRadius: 14,
          background: isUser ? COLORS.teal : isEscalated ? COLORS.redSoft : '#f8fafc',
          color: isUser ? 'white' : COLORS.ink,
          border: !isUser ? `1px solid ${isEscalated ? COLORS.redBorder : COLORS.border}` : 'none',
          whiteSpace: 'pre-wrap',
          fontSize: 14,
        }}
      >
        {!isUser && isEscalated && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: COLORS.red, fontWeight: 700, fontSize: 12.5, marginBottom: 6 }}>
            <ShieldAlert size={14} /> Escalated - not a fully bot-answered response
          </div>
        )}
        {msg.content}
        {!isUser && msg.sources && msg.sources.length > 0 && (
          <div style={{ marginTop: 8, fontSize: 11.5, color: COLORS.sub }}>
            Sources: {msg.sources.join(', ')}
          </div>
        )}
      </div>
    </div>
  );
}

function PatientLookupView({ patientQuery, patientResults, searchPatients, selectPatient, activePatient, patientSummary }) {
  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Patient Lookup</h3>
      <p style={{ color: COLORS.sub, marginTop: 4 }}>
        Search the synthetic patient roster to preview the context the assistant uses to
        personalize answers - demographics, active medications, upcoming appointments, and the
        most recent admission. Only these fields are ever sent to the model.
      </p>

      <div style={{ position: 'relative', maxWidth: 420 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, border: `1px solid ${COLORS.border}`, background: '#fbfdfc' }}>
          <Search size={15} color={COLORS.sub} />
          <input
            value={patientQuery}
            onChange={(e) => searchPatients(e.target.value)}
            placeholder="Search by patient ID or last name"
            style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 13.5 }}
          />
        </div>
        {patientResults.length > 0 && (
          <div style={{ marginTop: 6, border: `1px solid ${COLORS.border}`, borderRadius: 10, overflow: 'hidden', background: 'white', position: 'absolute', zIndex: 10, width: '100%' }}>
            {patientResults.map((p) => (
              <button
                key={p.patient_id}
                onClick={() => selectPatient(p)}
                style={{ width: '100%', textAlign: 'left', padding: 10, border: 'none', borderBottom: `1px solid ${COLORS.border}`, background: 'white', cursor: 'pointer', fontSize: 13 }}
              >
                {p.patient_id} - {p.first_name} {p.last_name} ({p.age}, {p.gender})
              </button>
            ))}
          </div>
        )}
      </div>

      {activePatient && patientSummary && (
        <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Card>
            <div style={{ fontWeight: 700, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <User size={16} color={COLORS.teal} /> {patientSummary.patient_id}
            </div>
            <div style={{ fontSize: 13.5, lineHeight: 1.9 }}>
              <div>Age: {patientSummary.age}</div>
              <div>Gender: {patientSummary.gender}</div>
              <div>Chronic conditions on file: {patientSummary.num_chronic_conditions}</div>
              <div>Diabetes: {patientSummary.has_diabetes ? 'Yes' : 'No'}</div>
            </div>
          </Card>
          <Card>
            <div style={{ fontWeight: 700, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Stethoscope size={16} color={COLORS.teal} /> Most recent admission
            </div>
            {patientSummary.last_admission ? (
              <div style={{ fontSize: 13.5, lineHeight: 1.9 }}>
                <div>Diagnosis group: {patientSummary.last_admission.diagnosis_group}</div>
                <div>Type: {patientSummary.last_admission.admission_type}</div>
                <div>Discharged: {patientSummary.last_admission.discharge_date}</div>
                <div>Length of stay: {patientSummary.last_admission.length_of_stay} days</div>
                <div>Readmitted within 30 days: {patientSummary.last_admission.readmitted_30d ? 'Yes' : 'No'}</div>
              </div>
            ) : (
              <div style={{ color: COLORS.sub, fontSize: 13.5 }}>No admission history on file.</div>
            )}
          </Card>
          <Card>
            <div style={{ fontWeight: 700, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Activity size={16} color={COLORS.teal} /> Active medications
            </div>
            {patientSummary.active_prescriptions.length > 0 ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <tbody>
                  {patientSummary.active_prescriptions.map((rx, i) => (
                    <tr key={i}>
                      <td style={{ padding: '6px 0', borderBottom: `1px solid ${COLORS.border}` }}>{rx.drug_name}</td>
                      <td style={{ padding: '6px 0', borderBottom: `1px solid ${COLORS.border}` }}>{rx.dosage}</td>
                      <td style={{ padding: '6px 0', borderBottom: `1px solid ${COLORS.border}`, color: COLORS.sub }}>
                        refills: {rx.refills}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ color: COLORS.sub, fontSize: 13.5 }}>No active medications on file.</div>
            )}
          </Card>
          <Card>
            <div style={{ fontWeight: 700, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <BarChart3 size={16} color={COLORS.teal} /> Upcoming appointments
            </div>
            {patientSummary.upcoming_appointments.length > 0 ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <tbody>
                  {patientSummary.upcoming_appointments.map((appt, i) => (
                    <tr key={i}>
                      <td style={{ padding: '6px 0', borderBottom: `1px solid ${COLORS.border}` }}>{appt.department}</td>
                      <td style={{ padding: '6px 0', borderBottom: `1px solid ${COLORS.border}` }}>{appt.appointment_date}</td>
                      <td style={{ padding: '6px 0', borderBottom: `1px solid ${COLORS.border}`, color: COLORS.sub }}>{appt.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ color: COLORS.sub, fontSize: 13.5 }}>No upcoming appointments on file.</div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

function SettingsView({ user }) {
  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>Application Settings</h3>
        <p style={{ margin: '4px 0 0 0', color: COLORS.sub }}>Account details and guardrail configuration.</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <Card>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Profile</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.9 }}>
            <div><strong>Email:</strong> {user.email}</div>
            <div><strong>Full name:</strong> {user.full_name}</div>
            <div><strong>Role:</strong> {user.role}</div>
          </div>
        </Card>
        <Card>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Model configuration</div>
          <div style={{ color: COLORS.sub, marginBottom: 10, fontSize: 13.5 }}>
            The assistant uses the server-side OpenAI key for embeddings and generation.
          </div>
          <div style={{ padding: 12, borderRadius: 12, background: '#f8fafc', border: `1px solid ${COLORS.border}`, fontSize: 13 }}>
            Server-side env: <code>OPENAI_API_KEY</code>, <code>CHAT_MODEL</code>, <code>EMBEDDING_MODEL</code>
          </div>
        </Card>
      </div>
      <Card style={{ marginTop: 16 }}>
        <div style={{ fontWeight: 700, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={16} color={COLORS.amber} /> Safety guardrails
        </div>
        <div style={{ color: COLORS.sub, fontSize: 13.5, lineHeight: 1.8 }}>
          Every question is screened before retrieval. Messages describing possible medical
          emergencies (chest pain, breathing trouble, self-harm, severe bleeding, and similar) are
          never answered by the model - they're routed straight to an escalation message with
          emergency contact guidance. Questions asking for a diagnosis, prognosis, or a dosage
          change are also escalated to the care team rather than answered. All grounded answers
          must cite the knowledge base article ids they relied on.
        </div>
      </Card>
    </div>
  );
}

export default App;
