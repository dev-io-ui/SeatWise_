import { useState } from 'react';
import { api } from '../api.js';

const ROLE_LABELS = { superadmin: 'Super Admin', officer: 'Officer', student: 'Student' };

export default function ProfileDialog({ user, onClose, onUpdated }) {
  const [name, setName] = useState(user.name || '');
  const [email, setEmail] = useState(user.email || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError('');
    setSaved(false);
    setSaving(true);
    try {
      const result = await api('/auth/profile', {
        method: 'PATCH',
        body: { name, email, ...(newPassword ? { currentPassword, newPassword } : {}) }
      });
      onUpdated(result.user);
      setName(result.user.name);
      setEmail(result.user.email);
      setCurrentPassword('');
      setNewPassword('');
      setSaved(true);
    } catch (reason) {
      setError(reason.message);
    } finally {
      setSaving(false);
    }
  }

  return <div className="profile-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="profile-dialog" role="dialog" aria-modal="true" aria-labelledby="profile-title">
      <header className="profile-heading">
        <div><span className="eyebrow">ACCOUNT SETTINGS</span><h2 id="profile-title">Your profile</h2></div>
        <button className="icon-button" type="button" aria-label="Close profile" onClick={onClose}>×</button>
      </header>
      <div className="profile-identity"><span className="profile-avatar">{(user.name || '?').slice(0, 1).toUpperCase()}</span><div><strong>{user.name}</strong><small>{ROLE_LABELS[user.role] || user.role}</small></div></div>
      <form onSubmit={submit} className="profile-form">
        <label>Full name<input value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={120} autoComplete="name" required /></label>
        <label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} autoComplete="email" required /></label>
        {user.student && <section className="profile-academics" aria-label="Academic details">
          <h3>Academic details</h3>
          <dl>
            <div><dt>Student ID</dt><dd>{user.student.studentId}</dd></div>
            <div><dt>Roll number</dt><dd>{user.student.rollNumber}</dd></div>
            <div><dt>Program</dt><dd>{user.student.program}</dd></div>
            <div><dt>Department</dt><dd>{user.student.department}</dd></div>
            <div><dt>Year / semester</dt><dd>{user.student.year} / {user.student.semester}</dd></div>
            {user.student.section && <div><dt>Section</dt><dd>{user.student.section}</dd></div>}
          </dl>
          <p>For changes to academic details, contact your institution administrator.</p>
        </section>}
        <details className="profile-password">
          <summary>Change password</summary>
          <label>Current password<input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" required={Boolean(newPassword)} /></label>
          <label>New password<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={12} maxLength={128} autoComplete="new-password" required={Boolean(currentPassword)} /></label>
          <small>Use at least 12 characters. Your current password is required to change it.</small>
        </details>
        {error && <p role="alert" className="err form-alert">{error}</p>}
        {saved && <p role="status" className="profile-saved">Profile changes saved.</p>}
        <footer className="profile-actions"><button className="outline" type="button" onClick={onClose}>Close</button><button className="primary" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button></footer>
      </form>
    </section>
  </div>;
}
