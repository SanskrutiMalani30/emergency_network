import React, { useState } from 'react';
import { Shield, Lock, Mail, User, CheckCircle2, AlertCircle, ArrowRight, Eye, EyeOff, Radio, HeartPulse, LifeBuoy } from 'lucide-react';
import { authService, validatePasswordStrength } from '../services/authService';

const AVAILABLE_SKILLS = [
  { id: 'first_aid', label: 'First Aid & CPR' },
  { id: 'watercraft_rescue', label: 'Watercraft / Boat Rescue' },
  { id: 'search_rescue', label: 'Search & Rescue' },
  { id: 'trauma_triage', label: 'Trauma & Medical Triage' },
  { id: 'amateur_radio_hf', label: 'Amateur Radio (HF/VHF)' },
  { id: 'heavy_machinery', label: 'Debris Removal & Tools' }
];

const DEMO_ACCOUNTS = [
  {
    name: 'Amulya Yadav (CERT Responder)',
    email: 'amulya@resqmesh.net',
    pass: 'ResqMesh2026!',
    role: 'Responder',
    skills: 'Radio, CERT, First Aid'
  },
  {
    name: 'Dr. Radhika Sharma (Trauma Doctor)',
    email: 'radhika@resqmesh.net',
    pass: 'DoctorAid2026!',
    role: 'Responder',
    skills: 'Trauma Triage, ACLS'
  },
  {
    name: 'Priya Sharma (Citizen in Flood Zone)',
    email: 'citizen@resqmesh.net',
    pass: 'CitizenHelp2026!',
    role: 'Citizen',
    skills: 'Local Guide, CPR'
  }
];

export default function AuthScreen({ onAuthenticated }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Registration Fields
  const [regEmail, setRegEmail] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regDisplayName, setRegDisplayName] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regRole, setRegRole] = useState('responder'); // 'responder' | 'citizen'
  const [selectedSkills, setSelectedSkills] = useState(['first_aid']);

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');
    setLoading(true);

    try {
      const res = await authService.login(identifier, password);
      if (onAuthenticated) {
        onAuthenticated(res.user);
      }
    } catch (err) {
      setErrorMsg(err.message || 'Authentication failed. Please verify credentials.');
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    const complexity = validatePasswordStrength(regPassword);
    if (complexity) {
      setErrorMsg(complexity);
      return;
    }

    setLoading(true);

    try {
      const res = await authService.register({
        email: regEmail,
        username: regUsername,
        password: regPassword,
        display_name: regDisplayName || regUsername,
        role: regRole,
        responder_status: regRole === 'responder' ? 'ACTIVE_RESPONDER' : 'CITIZEN',
        skills: selectedSkills
      });

      if (onAuthenticated) {
        onAuthenticated(res.user);
      }
    } catch (err) {
      setErrorMsg(err.message || 'Registration failed.');
      setLoading(false);
    }
  };

  const handleQuickDemo = (demo) => {
    setMode('login');
    setIdentifier(demo.email);
    setPassword(demo.pass);
    setErrorMsg('');
  };

  const handleDirectLogin = async (demo) => {
    setMode('login');
    setIdentifier(demo.email);
    setPassword(demo.pass);
    setErrorMsg('');
    setSuccessMsg('');
    setLoading(true);

    try {
      const res = await authService.login(demo.email, demo.pass);
      if (onAuthenticated) {
        onAuthenticated(res.user);
      }
    } catch (err) {
      setErrorMsg(err.message || 'Login failed. Please verify credentials.');
      setLoading(false);
    }
  };

  const toggleSkill = (skillId) => {
    setSelectedSkills(prev =>
      prev.includes(skillId) ? prev.filter(s => s !== skillId) : [...prev, skillId]
    );
  };

  return (
    <div className="min-h-screen bg-[#F4FAFF] flex flex-col justify-center items-center p-4 sm:p-6 font-sans">
      
      {/* Container Card */}
      <div className="w-full max-w-md bg-white border border-[#D0E6FC] rounded-2xl shadow-sm p-6 sm:p-8 space-y-6">
        
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[#168BFA] text-white shadow-md mb-1">
            <Shield className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-heading font-black text-[#102B4E] tracking-tight">
            RESQMesh
          </h1>
          <p className="text-xs text-[#627D98] font-sans max-w-xs mx-auto">
            The Human-Powered Emergency Network • CASCADE '26
          </p>
          <div className="pt-1">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#EAF5FF] text-[#168BFA] border border-[#D0E6FC]">
              AIR-GAPPED OFFLINE CAPABLE
            </span>
          </div>
        </div>

        {/* Tab Toggle: Login vs Register */}
        <div className="grid grid-cols-2 p-1 bg-[#EAF5FF] rounded-xl border border-[#D0E6FC] text-xs font-bold font-sans">
          <button
            type="button"
            onClick={() => { setMode('login'); setErrorMsg(''); }}
            className={`py-2 rounded-lg transition ${
              mode === 'login'
                ? 'bg-white text-[#168BFA] shadow-xs'
                : 'text-[#627D98] hover:text-[#102B4E]'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setMode('register'); setErrorMsg(''); }}
            className={`py-2 rounded-lg transition ${
              mode === 'register'
                ? 'bg-white text-[#168BFA] shadow-xs'
                : 'text-[#627D98] hover:text-[#102B4E]'
            }`}
          >
            Create Account
          </button>
        </div>

        {/* Alerts / Error Feedback */}
        {errorMsg && (
          <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-600" />
            <div className="leading-relaxed">{errorMsg}</div>
          </div>
        )}

        {successMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-start space-x-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-600" />
            <div className="leading-relaxed font-bold">{successMsg}</div>
          </div>
        )}

        {/* Mode 1: LOGIN FORM */}
        {mode === 'login' && (
          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-[#102B4E] mb-1">
                Email or Username
              </label>
              <div className="relative">
                <input
                  type="text"
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder="name@resqmesh.net or username"
                  className="w-full pl-9 pr-3 py-2.5 bg-white border border-[#D0E6FC] rounded-xl text-xs text-[#102B4E] placeholder-[#627D98] focus:outline-none focus:border-[#168BFA] focus:ring-2 focus:ring-[#168BFA]/10 transition"
                />
                <Mail className="w-4 h-4 text-[#627D98] absolute left-3 top-3" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-[#102B4E] mb-1">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-9 pr-10 py-2.5 bg-white border border-[#D0E6FC] rounded-xl text-xs text-[#102B4E] placeholder-[#627D98] focus:outline-none focus:border-[#168BFA] focus:ring-2 focus:ring-[#168BFA]/10 transition"
                />
                <Lock className="w-4 h-4 text-[#627D98] absolute left-3 top-3" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-[#627D98] hover:text-[#102B4E]"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-[#168BFA] hover:bg-[#0f77d9] text-white font-heading font-bold text-xs uppercase tracking-wider rounded-xl transition flex items-center justify-center space-x-1.5 shadow-sm disabled:opacity-50"
            >
              <span>{loading ? 'Authenticating...' : 'Sign In to Network'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* Mode 2: REGISTER FORM */}
        {mode === 'register' && (
          <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
            <div>
              <label className="block text-[11px] font-bold text-[#102B4E] mb-1">
                Full Display Name
              </label>
              <input
                type="text"
                required
                value={regDisplayName}
                onChange={(e) => setRegDisplayName(e.target.value)}
                placeholder="e.g. Maya Lin"
                className="w-full px-3 py-2 bg-white border border-[#D0E6FC] rounded-xl text-xs text-[#102B4E] focus:outline-none focus:border-[#168BFA]"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-bold text-[#102B4E] mb-1">
                  Username
                </label>
                <input
                  type="text"
                  required
                  value={regUsername}
                  onChange={(e) => setRegUsername(e.target.value)}
                  placeholder="mayalin"
                  className="w-full px-3 py-2 bg-white border border-[#D0E6FC] rounded-xl text-xs text-[#102B4E] focus:outline-none focus:border-[#168BFA]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-[#102B4E] mb-1">
                  Email
                </label>
                <input
                  type="email"
                  required
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  placeholder="maya@mesh.org"
                  className="w-full px-3 py-2 bg-white border border-[#D0E6FC] rounded-xl text-xs text-[#102B4E] focus:outline-none focus:border-[#168BFA]"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#102B4E] mb-1">
                Password (min 8 chars, Aa, 1/!)
              </label>
              <input
                type="password"
                required
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                placeholder="SecurePassword2026!"
                className="w-full px-3 py-2 bg-white border border-[#D0E6FC] rounded-xl text-xs text-[#102B4E] focus:outline-none focus:border-[#168BFA]"
              />
            </div>

            {/* Role Selection */}
            <div>
              <label className="block text-[11px] font-bold text-[#102B4E] mb-1">
                Account Role
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRegRole('responder')}
                  className={`p-2 rounded-xl border text-left text-xs transition ${
                    regRole === 'responder'
                      ? 'bg-[#EAF5FF] border-[#168BFA] text-[#168BFA] font-bold'
                      : 'bg-white border-[#D0E6FC] text-[#627D98]'
                  }`}
                >
                  <div className="flex items-center space-x-1.5">
                    <HeartPulse className="w-3.5 h-3.5" />
                    <span>Volunteer Responder</span>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setRegRole('citizen')}
                  className={`p-2 rounded-xl border text-left text-xs transition ${
                    regRole === 'citizen'
                      ? 'bg-[#EAF5FF] border-[#168BFA] text-[#168BFA] font-bold'
                      : 'bg-white border-[#D0E6FC] text-[#627D98]'
                  }`}
                >
                  <div className="flex items-center space-x-1.5">
                    <User className="w-3.5 h-3.5" />
                    <span>Community Citizen</span>
                  </div>
                </button>
              </div>
            </div>

            {/* Skills Checklist (if responder) */}
            {regRole === 'responder' && (
              <div>
                <label className="block text-[11px] font-bold text-[#627D98] mb-1">
                  Certified Rescue & Aid Skills:
                </label>
                <div className="grid grid-cols-2 gap-1.5 max-h-32 overflow-y-auto pr-1">
                  {AVAILABLE_SKILLS.map(skill => {
                    const active = selectedSkills.includes(skill.id);
                    return (
                      <button
                        key={skill.id}
                        type="button"
                        onClick={() => toggleSkill(skill.id)}
                        className={`p-1.5 rounded-lg border text-left text-[11px] transition ${
                          active
                            ? 'bg-[#EAF5FF] border-[#168BFA] text-[#168BFA] font-bold'
                            : 'bg-white border-[#D0E6FC] text-[#627D98]'
                        }`}
                      >
                        {active ? '✓ ' : '+ '}
                        {skill.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-[#168BFA] hover:bg-[#0f77d9] text-white font-heading font-bold text-xs uppercase tracking-wider rounded-xl transition flex items-center justify-center space-x-1.5 shadow-sm disabled:opacity-50"
            >
              <span>{loading ? 'Creating Account...' : 'Complete Registration'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        )}

        {/* Quick Demo Accounts for Hackathon Evaluators */}
        <div className="border-t border-[#EAF5FF] pt-4 space-y-2">
          <div className="flex items-center justify-between text-[11px] font-bold text-[#627D98]">
            <span>1-Tap Demo Credentials (CASCADE '26):</span>
            <span className="text-[10px] text-[#168BFA] font-mono">Instant Access</span>
          </div>
          <div className="space-y-2">
            {DEMO_ACCOUNTS.map((demo, idx) => (
              <div
                key={idx}
                className="w-full p-2.5 bg-[#F4FAFF] hover:bg-[#EAF5FF] border border-[#D0E6FC] rounded-xl text-left text-xs transition flex items-center justify-between gap-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-[#102B4E] truncate">{demo.name}</div>
                  <div className="text-[10px] text-[#627D98] truncate">{demo.email} • {demo.skills}</div>
                </div>
                <div className="flex items-center space-x-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleQuickDemo(demo)}
                    className="text-[10px] font-bold px-2 py-1 rounded-lg bg-white border border-[#D0E6FC] text-[#627D98] hover:text-[#102B4E] hover:border-[#168BFA] transition"
                  >
                    Fill
                  </button>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => handleDirectLogin(demo)}
                    className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-[#168BFA] hover:bg-[#0f77d9] text-white shadow-xs transition disabled:opacity-50"
                  >
                    1-Tap Login
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Security Policy Note */}
        <p className="text-[10px] text-[#627D98] text-center leading-relaxed">
          Sensitive session tokens are device-bound. Passwords are never stored in plaintext.
          Offline logins use Web Crypto PBKDF2 with 100,000 iterations.
        </p>

      </div>
    </div>
  );
}
