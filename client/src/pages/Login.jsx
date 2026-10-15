import { useState } from 'react';
import { api } from '../api.js';

export default function Login({ onLogin, onRegister }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [submitting, setSubmitting] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setSubmitting(true);
    setErr('');
    try {
      onLogin((await api('/auth/login', { method: 'POST', body: { email, password } })).user);
    } catch (error) {
      setErr(error.message);
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <main className="login">
      <form onSubmit={submit}>
        <span className="brand-mark">SW</span><h1>SeatWise</h1><p>Sign in to your SeatWise portal.</p>
        <label>Email<input value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="username" required /></label>
        <label>Password<input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" required /></label>
        {err && <p role="alert" className="err">{err}</p>}<button className="primary" disabled={submitting}>{submitting ? 'Signing in…' : 'Sign in'}</button>
        <p className="auth-switch">New student? <button type="button" className="text-button" onClick={onRegister}>Create an account</button></p>
      </form>
    </main>
  );
}
