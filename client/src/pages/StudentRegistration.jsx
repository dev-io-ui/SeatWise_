import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { semestersForYear } from '../academic-cohort.js';

export default function StudentRegistration({ onLogin }) {
  const [options, setOptions] = useState(null);
  const [optionsError, setOptionsError] = useState('');
  const [form, setForm] = useState({
    studentId: '', name: '', rollNumber: '', email: '', password: '',
    program: '', department: '', year: '', semester: '', section: ''
  });
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let active = true;
    api('/auth/registration-options').then((result) => {
      if (active) setOptions(result);
    }).catch((reason) => {
      if (active) setOptionsError(reason.message);
    });
    return () => { active = false; };
  }, []);
  const program = options?.programs.find((item) => item.name === form.program);
  const availableSemesters = semestersForYear(program, form.year);
  const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  async function submit(event) {
    event.preventDefault();
    setError('');
    if (step < 2) {
      setStep((current) => current + 1);
      return;
    }
    setSaving(true);
    try {
      await api('/auth/register', {
        method: 'POST',
        body: { ...form, year: Number(form.year), semester: Number(form.semester) }
      });
      setSubmitted(true);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <main className="login registration-page">
      <form onSubmit={submit}>
        <span className="brand-mark">SW</span>
        {submitted ? <>
          <h1>Registration submitted</h1>
          <p role="status">Your details are waiting for Super Admin approval. You can sign in after your account is approved.</p>
          <button type="button" className="primary" onClick={onLogin}>Return to sign in</button>
        </> : <>
          <h1>Student registration</h1>
          <p>Use your official student details. Your institution must approve your account before sign-in.</p>
          <ol className="registration-steps">{['Identity', 'Academic details', 'Account'].map((label, index) =>
            <li key={label} className={index === step ? 'current' : index < step ? 'complete' : ''}>{index + 1}. {label}</li>)}</ol>
          {optionsError && <p role="alert" className="err">{optionsError}</p>}
          {!options && !optionsError && <p role="status">Loading programs and departments…</p>}
          {options && !optionsError && <div className="registration-fields">
            {step === 0 && <>
              <label>Student ID<input autoComplete="off" value={form.studentId} onChange={(event) => setField('studentId', event.target.value)} required maxLength={60} /></label>
              <label>Full name<input autoComplete="name" value={form.name} onChange={(event) => setField('name', event.target.value)} required minLength={2} maxLength={120} /></label>
              <label>Roll number<input autoComplete="off" value={form.rollNumber} onChange={(event) => setField('rollNumber', event.target.value)} required maxLength={60} /></label>
              <label>Section (optional)<input value={form.section} onChange={(event) => setField('section', event.target.value)} maxLength={40} /></label>
            </>}
            {step === 1 && <>
              <label>Degree / program<select value={form.program} onChange={(event) => setForm((current) => ({
                ...current, program: event.target.value, year: '', semester: ''
              }))} required>
                <option value="">Choose a program</option>{options.programs.map((item) =>
                  <option key={item.name} value={item.name}>{item.name} · {item.code}</option>)}
              </select></label>
              <label>Department<select value={form.department} onChange={(event) => setField('department', event.target.value)} required>
                <option value="">Choose a department</option>{options.departments.map((item) =>
                  <option key={item} value={item}>{item}</option>)}
              </select></label>
              <label>Year<select value={form.year} onChange={(event) => setForm((current) => ({
                ...current, year: event.target.value, semester: ''
              }))} required disabled={!program}>
                <option value="">Choose a year</option>{program?.years.map((year) =>
                  <option key={year} value={year}>{year}</option>)}
              </select></label>
              <label>Semester<select value={form.semester} onChange={(event) => setField('semester', event.target.value)} required disabled={!form.year}>
                <option value="">Choose a semester</option>{program?.semesters.map((semester) =>
                  <option key={semester} value={semester} disabled={!availableSemesters.includes(semester)}>{semester}</option>)}
              </select></label>
            </>}
            {step === 2 && <>
              <label>Email<input type="email" autoComplete="email" value={form.email} onChange={(event) => setField('email', event.target.value)} required maxLength={254} /></label>
              <label>Password (at least 12 characters)<input type="password" autoComplete="new-password" value={form.password}
                onChange={(event) => setField('password', event.target.value)} required minLength={12} maxLength={128} /></label>
              <p className="subtle">Your email and password create your private student login. Never share your password.</p>
            </>}
          </div>}
          {error && <p role="alert" className="err">{error}</p>}
          <div className="registration-actions">
            {step > 0 && <button type="button" className="outline" disabled={saving} onClick={() => { setError(''); setStep((current) => current - 1); }}>Back</button>}
            <button type="submit" className="primary" disabled={!options || !!optionsError || saving}>
              {saving ? 'Submitting…' : step === 2 ? 'Submit registration' : 'Continue'}
            </button>
          </div>
          <p className="auth-switch">Already registered? <button type="button" className="text-button" onClick={onLogin}>Sign in</button></p>
        </>}
      </form>
    </main>
  );
}
