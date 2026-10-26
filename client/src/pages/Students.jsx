import { useState } from 'react';
import { api } from '../api.js';
import { semestersForYear } from '../academic-cohort.js';
import { Alert, Field, FormSteps, Loading, Pagination, useLoad } from '../components/ui.jsx';

export function Students() {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const students = useLoad(`/students?page=${page}&limit=10&search=${encodeURIComponent(query)}`);
  const [pendingPageNumber, setPendingPageNumber] = useState(1);
  const pending = useLoad(`/students/registrations/pending?page=${pendingPageNumber}`);
  const programs = useLoad('/programs');
  const departments = useLoad('/departments');
  const [form, setForm] = useState({ studentId: '', name: '', rollNumber: '', email: '', password: '', program: '', department: '', year: '', semester: '', section: '' });
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(0);
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const cohort = programs.data?.find((program) => program.name === form.program);
  const formSemesters = semestersForYear(cohort, form.year);
  const editCohort = programs.data?.find((program) => program.name === editForm?.program);
  const editSemesters = semestersForYear(editCohort, editForm?.year);
  const shown = students.data?.items || [];
  const setField = (key, value) => setForm((old) => ({ ...old, [key]: value }));
  async function addStudent(event) {
    event.preventDefault(); setSaving(true); setError('');
    try { await api('/students', { method: 'POST', body: { ...form, year: Number(form.year), semester: Number(form.semester) } });     setForm({ ...form, studentId: '', name: '', rollNumber: '', email: '', password: '' }); setStep(0); await students.load(); }
    catch (reason) { setError(reason.message); } finally { setSaving(false); }
  }
  async function previewImport(event) {
    event.preventDefault();
    if (!file) return setError('Choose a CSV or XLSX file.');
    const body = new FormData(); body.append('file', file); setSaving(true); setError('');
    try { setPreview(await api('/students/import/preview', { method: 'POST', body })); }
    catch (reason) { setError(reason.message); } finally { setSaving(false); }
  }
  async function changePreviewPage(section, nextPage) {
    if (!preview?.batchId) return;
    const page = section === 'preview' ? nextPage : preview.preview.page;
    const errorPage = section === 'errors' ? nextPage : preview.errors.page;
    try {
      const result = await api(`/students/import/${preview.batchId}/preview?page=${page}&errorPage=${errorPage}`);
      setPreview((current) => ({ ...current, ...result }));
    } catch (reason) { setError(reason.message); }
  }
  async function commitImport() {
    if (!preview?.batchId || !window.confirm(`Import ${preview.validCount} valid student rows?`)) return;
    setSaving(true); setError('');
    try {
      const result = await api(`/students/import/${preview.batchId}/commit`, { method: 'POST' });
      setPreview(null); setFile(null); await students.load();
      setError(`${result.imported} imported; ${result.skipped} skipped due to row errors.`);
    } catch (reason) { setError(reason.message); } finally { setSaving(false); }
  }
  async function approveRegistration(student) {
    if (!window.confirm(`Approve ${student.name} (${student.rollNumber}) for student portal access?`)) return;
    setSaving(true);
    setError('');
    try {
      await api(`/students/registrations/${student._id}/approve`, { method: 'POST' });
      await Promise.all([students.load(), pending.load()]);
      setError(`${student.name}'s registration is approved. They can now sign in.`);
    } catch (reason) { setError(reason.message); }
    finally { setSaving(false); }
  }
  async function saveStudentEdit(event) {
    event.preventDefault(); setSaving(true); setError('');
    try {
      await api(`/students/${editing._id}`, { method: 'PUT', body: {
        ...editForm, year: Number(editForm.year), semester: Number(editForm.semester)
      } });
      setEditing(null); setEditForm(null); await students.load();
    } catch (reason) { setError(reason.message); } finally { setSaving(false); }
  }
  if (students.loading || pending.loading || programs.loading || departments.loading) return <Loading />;
  return (
    <div className="students-page">
      <section className="students-intro">
        <div><span className="eyebrow">PEOPLE & ACCESS</span><h2>Student management</h2>
          <p>Manage student records, review sign-ups and import cohorts.</p></div>
        <div className="student-metrics">
          <div><span>Active students</span><strong>{students.data?.total || 0}</strong></div>
          <div><span>Awaiting approval</span><strong>{pending.data?.total || 0}</strong></div>
        </div>
      </section>
      <Alert error={pending.error} />
      {!!pending.data?.total && <section className="panel pending-panel">
        <div className="panel-heading"><div><span className="eyebrow">REVIEW QUEUE</span><h2>Registrations awaiting approval</h2></div>
          <span className="pending-count">{pending.data.total} pending</span></div>
        {pending.data?.items?.length ? <>
          <div className="table-scroll"><table><thead><tr><th>Student</th><th>Academic details</th><th>Submitted</th><th aria-label="Actions"></th></tr></thead>
            <tbody>{pending.data.items.map((student) => <tr key={student._id}>
              <td><strong>{student.name}</strong><small>{student.rollNumber} · {student.email}</small></td>
              <td><strong>{student.program}</strong><small>{student.department} · Year {student.year}, semester {student.semester}{student.section ? ` · Section ${student.section}` : ''}</small></td>
              <td>{new Date(student.createdAt).toLocaleDateString()}</td>
              <td className="pending-action"><button className="success small-button" type="button" disabled={saving} onClick={() => approveRegistration(student)}>Approve</button></td>
            </tr>)}</tbody></table></div>
          <Pagination page={pending.data.page} totalPages={pending.data.totalPages} total={pending.data.total}
            pageSize={pending.data.pageSize} onPageChange={setPendingPageNumber} />
        </> : <div className="empty-state">No student sign-ups are waiting for approval.</div>}
      </section>}
      <div className="students-workspace">
        <section className="panel student-directory">
          <div className="panel-heading"><div><span className="eyebrow">DIRECTORY</span><h2>All students</h2></div>
            <span className="record-count">{students.data?.total || 0} records</span></div>
          <label className="student-search"><span>Search the directory</span>
            <input type="search" placeholder="Name, roll number or department" value={query}
              onChange={(event) => { setQuery(event.target.value); setPage(1); }} /></label>
          <div className="table-scroll"><table><thead><tr><th>Student</th><th>Department</th><th>Program</th><th>Year</th><th>Semester</th><th /></tr></thead>
            <tbody>{shown.map((student) => <tr key={student._id}>
              <td><strong>{student.name}</strong><small>{student.rollNumber} · {student.email}</small></td>
              <td>{student.department}</td><td>{student.program}</td><td>{student.year}</td><td>{student.semester}</td>
              <td><button className="text-button" type="button" onClick={() => {
                setEditing(student);
                setEditForm({
                  studentId: student.studentId, name: student.name, rollNumber: student.rollNumber, email: student.email,
                  program: student.program, department: student.department, year: String(student.year),
                  semester: String(student.semester), section: student.section || ''
                });
              }}>Edit</button></td></tr>)}</tbody></table></div>
          {editing && editForm && <form className="student-edit-form" onSubmit={saveStudentEdit}>
            <div className="panel-heading"><h3>Edit {editing.name}</h3><button className="text-button" type="button" onClick={() => { setEditing(null); setEditForm(null); }}>Cancel</button></div>
            <div className="form-row"><Field label="Student ID" value={editForm.studentId} setValue={(studentId) => setEditForm({ ...editForm, studentId })} />
              <Field label="Roll number" value={editForm.rollNumber} setValue={(rollNumber) => setEditForm({ ...editForm, rollNumber })} /></div>
            <div className="form-row"><Field label="Full name" value={editForm.name} setValue={(name) => setEditForm({ ...editForm, name })} />
              <Field label="Email" type="email" value={editForm.email} setValue={(email) => setEditForm({ ...editForm, email })} /></div>
            <div className="form-row"><label>Program<select required value={editForm.program} onChange={(event) => setEditForm({ ...editForm, program: event.target.value, year: '', semester: '' })}>
              <option value="">Choose a program</option>{programs.data?.map((program) => <option key={program._id}>{program.name}</option>)}</select></label>
              <label>Department<select required value={editForm.department} onChange={(event) => setEditForm({ ...editForm, department: event.target.value })}>
                {departments.data?.map((department) => <option key={department}>{department}</option>)}</select></label></div>
            <div className="form-row"><label>Year<select required value={editForm.year} onChange={(event) => setEditForm({ ...editForm, year: event.target.value, semester: '' })}>
              {(programs.data?.find((program) => program.name === editForm.program)?.years || []).map((year) => <option key={year}>{year}</option>)}</select></label>
              <label>Semester<select required value={editForm.semester} onChange={(event) => setEditForm({ ...editForm, semester: event.target.value })}>
                {editSemesters.map((semester) => <option key={semester}>{semester}</option>)}</select></label></div>
            <Field label="Section" required={false} value={editForm.section} setValue={(section) => setEditForm({ ...editForm, section })} />
            <button className="primary" disabled={saving}>{saving ? 'Saving…' : 'Save student changes'}</button>
          </form>}
          {!shown.length && <div className="empty-state">{query ? 'No students match your search.' : 'No active students yet. Add a student or import a cohort to get started.'}</div>}
          <Pagination page={students.data?.page || page} totalPages={students.data?.totalPages || 1}
            total={students.data?.total || 0} pageSize={students.data?.pageSize || 10} onPageChange={setPage} />
          <details className="student-import">
            <summary><span><strong>Bulk import</strong><small>Preview a CSV or Excel roster before saving</small></span><span className="import-chevron">+</span></summary>
            <div className="student-import-body">
              <a className="text-link" href="/api/v1/students/import/template.csv">Download CSV template</a>
              <form className="inline-form" onSubmit={previewImport}>
                <input type="file" accept=".csv,.xlsx" onChange={(event) => setFile(event.target.files[0])} />
                <button className="outline" disabled={saving}>{saving ? 'Preparing…' : 'Preview import'}</button>
              </form>
              {preview && <ImportPreview preview={preview} onCommit={commitImport} onPageChange={changePreviewPage} saving={saving} />}
            </div>
          </details>
          <Alert error={error || students.error || programs.error || departments.error} />
        </section>
        <section className="panel form-panel setup-panel student-create">
        <div><span className="eyebrow">NEW RECORD</span><h2>Add a student</h2><p className="subtle">Create an account and assign an academic cohort.</p></div>
        <FormSteps steps={['Identity', 'Account', 'Course']} current={step} onStep={setStep} />
        <form onSubmit={step === 2 ? addStudent : (event) => { event.preventDefault(); setError(''); setStep((current) => current + 1); }}>
        {step === 0 && <div className="setup-step"><h3>Student identity</h3>
          <Field label="Student ID" value={form.studentId} setValue={(value) => setField('studentId', value)} />
          <Field label="Full name" value={form.name} setValue={(value) => setField('name', value)} />
          <Field label="Roll number" value={form.rollNumber} setValue={(value) => setField('rollNumber', value)} />
        </div>}
        {step === 1 && <div className="setup-step"><h3>Login details</h3>
          <Field label="Email" type="email" value={form.email} setValue={(value) => setField('email', value)} />
          <Field label="Initial password (12+ characters)" type="password" minLength={12} value={form.password} setValue={(value) => setField('password', value)} />
        </div>}
        {step === 2 && <div className="setup-step"><h3>Degree and department</h3>
        <label>Degree / program<select required value={form.program} onChange={(event) => setForm({ ...form, program: event.target.value, year: '', semester: '' })}>
          <option value="">Choose a program</option>{programs.data?.map((program) => <option key={program._id}>{program.name}</option>)}
        </select></label>
        <label>Department<select required value={form.department} onChange={(event) => setField('department', event.target.value)}>
          <option value="">Choose a department</option>{departments.data?.map((department) => <option key={department}>{department}</option>)}
        </select></label>
        <label>Year<select required disabled={!cohort} value={form.year} onChange={(event) => setForm({ ...form, year: event.target.value, semester: '' })}>
          <option value="">Choose a year</option>{cohort?.years.map((year) => <option key={year}>{year}</option>)}</select></label>
        <label>Semester<select required disabled={!form.year} value={form.semester} onChange={(event) => setField('semester', event.target.value)}>
          <option value="">Choose a semester</option>{formSemesters.map((semester) => <option key={semester}>{semester}</option>)}</select></label>
        <Field label="Section" required={false} value={form.section} setValue={(value) => setField('section', value)} />
        </div>}
        <div className="wizard-actions">{step > 0 && <button type="button" className="outline" onClick={() => setStep((current) => current - 1)}>Back</button>}
          <button className="primary" disabled={saving}>{saving ? 'Saving…' : step === 2 ? 'Save student' : 'Continue'}</button></div>
        </form>
        </section>
      </div>
    </div>
  );
}

function ImportPreview({ preview, onCommit, onPageChange, saving }) {
  return <div className="import-preview"><div className="panel-heading"><strong>Preview: {preview.validCount} valid rows</strong>
    <button className="primary" onClick={onCommit} disabled={!preview.validCount || saving}>Import valid rows</button></div>
    {preview.errors.total > 0 && <div className="import-errors"><strong>{preview.errors.total} rows need attention</strong>
      <ul>{preview.errors.items.map((item) => <li key={item.row}>Row {item.row}: {item.messages.join('; ')}</li>)}</ul>
      <Pagination {...preview.errors} onPageChange={(page) => onPageChange('errors', page)} /></div>}
    <div className="table-scroll"><table><thead><tr><th>Roll</th><th>Name</th><th>Program</th><th>Department</th><th>Year / semester</th></tr></thead>
      <tbody>{preview.preview.items.map((student) => <tr key={`${student.studentId}-${student.rollNumber}`}><td>{student.rollNumber}</td>
        <td>{student.name}</td><td>{student.program}</td><td>{student.department}</td><td>{student.year} / {student.semester}</td></tr>)}</tbody></table></div>
    <Pagination {...preview.preview} onPageChange={(page) => onPageChange('preview', page)} />
  </div>;
}
