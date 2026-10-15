import { useState } from 'react';
import { api } from '../api.js';
import { Alert, Field, FormSteps, Loading, Pagination, useLoad, usePagination } from '../components/ui.jsx';

export function Officers() {
  const officers = useLoad('/officers');
  const officerPage = usePagination(officers.data || [], 10);
  const buildings = useLoad('/buildings');
  const departments = useLoad('/departments');
  const [form, setForm] = useState({ name: '', email: '', password: '', buildings: [], departments: [] });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(0);
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', email: '' });
  async function addOfficer(event) {
    event.preventDefault(); setSaving(true); setError('');
    try {
      await api('/officers', { method: 'POST', body: form });
      setForm({ name: '', email: '', password: '', buildings: [], departments: [] }); setStep(0); await officers.load();
    } catch (reason) { setError(reason.message); } finally { setSaving(false); }
  }
  async function toggleActive(user) {
    try { await api(`/officers/${user._id}`, { method: 'PATCH', body: { active: !user.active } }); await officers.load(); }
    catch (reason) { setError(reason.message); }
  }
  async function updateScope(user, key, value) {
    try {
      const next = [...(user.scope?.[key] || []).map(String)];
      const values = next.includes(value) ? next.filter((item) => item !== value) : [...next, value];
      await api(`/officers/${user._id}`, { method: 'PATCH', body: { [key]: values } }); await officers.load();
    } catch (reason) { setError(reason.message); }
  }
  async function saveOfficer(event) {
    event.preventDefault();
    try {
      await api(`/officers/${editing._id}`, { method: 'PATCH', body: editForm });
      setEditing(null); await officers.load();
    } catch (reason) { setError(reason.message); }
  }
  if (officers.loading || buildings.loading || departments.loading) return <Loading />;
  return <div className="two-column-page">
    <section className="panel"><div className="panel-heading"><h2>Officers</h2><span>Officer accounts cannot manage Super Admins.</span></div>
      {editing && <form className="inline-form" onSubmit={saveOfficer}>
        <Field label="Officer name" value={editForm.name} setValue={(name) => setEditForm({ ...editForm, name })} />
        <Field label="Officer email" type="email" value={editForm.email} setValue={(email) => setEditForm({ ...editForm, email })} />
        <button className="primary">Save officer</button><button type="button" className="outline" onClick={() => setEditing(null)}>Cancel</button>
      </form>}
      <div className="table-scroll"><table><thead><tr><th>Officer</th><th>Status</th><th>Assigned buildings</th><th>Departments</th><th /></tr></thead>
        <tbody>{officerPage.rows.map((user) => <tr key={user._id}><td><strong>{user.name}</strong><small>{user.email}</small></td>
          <td><span className={`status ${user.active ? 'published' : 'draft'}`}>{user.active ? 'Active' : 'Disabled'}</span></td>
          <td><div className="scope-list">{buildings.data?.map((building) => <label key={building._id}>
            <input type="checkbox" checked={(user.scope?.buildings || []).some((id) => String(id) === building._id)} onChange={() => updateScope(user, 'buildings', building._id)} />
            {building.name}</label>)}</div></td>
          <td><div className="scope-list">{departments.data?.map((department) => <label key={department}>
            <input type="checkbox" checked={(user.scope?.departments || []).includes(department)} onChange={() => updateScope(user, 'departments', department)} />
            {department}</label>)}</div></td>
          <td><div className="toolbar-actions">
            <button className="text-button" onClick={() => { setEditing(user); setEditForm({ name: user.name, email: user.email }); }}>Edit</button>
            <button className="outline small-button" onClick={() => toggleActive(user)}>{user.active ? 'Disable' : 'Enable'}</button>
          </div></td>
        </tr>)}</tbody></table></div>
      <Pagination {...officerPage} onPageChange={officerPage.setPage} />
      <Alert error={officers.error || buildings.error || departments.error || error} />
    </section>
    <section className="panel form-panel setup-panel"><div><span className="eyebrow">STAFF ACCESS</span><h2>Create officer</h2><p className="subtle">Set up account details, then choose optional access limits.</p></div>
      <FormSteps steps={['Account', 'Access']} current={step} onStep={setStep} />
      <form onSubmit={step === 1 ? addOfficer : (event) => { event.preventDefault(); setError(''); setStep(1); }}>
        {step === 0 ? <div className="setup-step">
          <Field label="Full name" value={form.name} setValue={(name) => setForm({ ...form, name })} />
          <Field label="Email" type="email" value={form.email} setValue={(email) => setForm({ ...form, email })} />
          <Field label="Initial password (12+ characters)" type="password" minLength={12} value={form.password} setValue={(password) => setForm({ ...form, password })} />
        </div> : <div className="setup-step">
          <p className="subtle">Leave a list empty for unrestricted access. Hold Ctrl (Windows) or Command (Mac) to select multiple options.</p>
          <label>Buildings<select multiple value={form.buildings} onChange={(event) => setForm({ ...form, buildings: [...event.target.selectedOptions].map((option) => option.value) })}>
            {buildings.data?.map((building) => <option key={building._id} value={building._id}>{building.name}</option>)}</select></label>
          <label>Departments<select multiple value={form.departments} onChange={(event) => setForm({ ...form, departments: [...event.target.selectedOptions].map((option) => option.value) })}>
            {departments.data?.map((department) => <option key={department}>{department}</option>)}</select></label>
        </div>}
        <div className="wizard-actions">{step > 0 && <button type="button" className="outline" onClick={() => setStep(0)}>Back</button>}
          <button className="primary" disabled={saving}>{step === 1 ? 'Create officer' : 'Continue'}</button></div>
        <Alert error={error} />
      </form>
    </section>
  </div>;
}
