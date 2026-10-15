import { useState } from 'react';
import { api } from '../api.js';
import { Alert, Field, FormSteps, Loading, Pagination, useLoad, usePagination } from '../components/ui.jsx';

export function Programs({ role = 'superadmin' }) {
  const canManage = role !== 'officer';
  const programs = useLoad('/programs');
  const subjects = useLoad('/subjects');
  const departments = useLoad('/departments');
  const departmentCatalog = useLoad('/departments/catalog');
  const degreePage = usePagination(programs.data || [], 10);
  const subjectPage = usePagination(subjects.data || [], 10);
  const departmentPage = usePagination(departmentCatalog.data || [], 10);
  const [current, setCurrent] = useState(null);
  const [form, setForm] = useState({ name: '', years: '1, 2, 3, 4', semesters: '1, 2, 3, 4, 5, 6, 7, 8' });
  const [subjectForm, setSubjectForm] = useState({ name: '', code: '', program: '', year: '', semester: '' });
  const [departmentForm, setDepartmentForm] = useState({ name: '', code: '' });
  const [subjectEdit, setSubjectEdit] = useState(null);
  const [departmentEdit, setDepartmentEdit] = useState(null);
  const [section, setSection] = useState('Degrees');
  const [subjectStep, setSubjectStep] = useState(0);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const available = programs.data?.find((program) => program.name === subjectForm.program);
  function numbers(value) { return value.split(',').map((item) => Number(item.trim())).filter((item) => Number.isInteger(item) && item > 0); }
  async function saveProgram(event) {
    event.preventDefault(); setSaving(true); setError('');
    try {
      const body = { name: form.name, years: numbers(form.years), semesters: numbers(form.semesters) };
      await api(current ? `/programs/${current}` : '/programs', { method: current ? 'PUT' : 'POST', body });
      setCurrent(null); setForm({ name: '', years: '1, 2, 3, 4', semesters: '1, 2, 3, 4, 5, 6, 7, 8' }); await programs.load();
    } catch (reason) { setError(reason.message); } finally { setSaving(false); }
  }
  async function saveSubject(event) {
    event.preventDefault(); setSaving(true); setError('');
    try {
      await api(subjectEdit ? `/subjects/${subjectEdit}` : '/subjects', {
        method: subjectEdit ? 'PUT' : 'POST',
        body: { ...subjectForm, year: Number(subjectForm.year), semester: Number(subjectForm.semester) }
      });
      setSubjectEdit(null);
      setSubjectForm({ ...subjectForm, name: '', code: '' }); setSubjectStep(0); await subjects.load();
    } catch (reason) { setError(reason.message); } finally { setSaving(false); }
  }
  async function saveDepartment(event) {
    event.preventDefault(); setSaving(true); setError('');
    try {
      await api(departmentEdit ? `/departments/${departmentEdit}` : '/departments', {
        method: departmentEdit ? 'PUT' : 'POST', body: departmentForm
      });
      setDepartmentEdit(null); setDepartmentForm({ name: '', code: '' }); await Promise.all([departments.load(), departmentCatalog.load(), subjects.load()]);
    } catch (reason) { setError(reason.message); } finally { setSaving(false); }
  }
  if (programs.loading || subjects.loading || departments.loading || departmentCatalog.loading) return <Loading />;
  return (
    <div className="two-column-page">
      <section className="panel">
        <div className="panel-heading"><div><span className="eyebrow">ACADEMIC SETUP</span><h2>Degrees, departments & subjects</h2></div></div>
        <div className="section-tabs" role="tablist" aria-label="Academic setup">
          {['Degrees', 'Subjects', 'Departments'].map((item) => <button type="button" role="tab" aria-selected={section === item}
            className={section === item ? 'selected' : ''} key={item} onClick={() => setSection(item)}>{item}</button>)}
        </div>
        {section === 'Degrees' && <div className="table-scroll"><table><thead><tr><th>Degree / program</th><th>Years</th><th>Semesters</th>{canManage && <th />}</tr></thead><tbody>
          {degreePage.rows.map((program) => <tr key={program._id}><td>{program.name}</td><td>{program.years.join(', ')}</td>
            <td>{program.semesters.join(', ')}</td>{canManage && <td><button className="text-button" onClick={() => {
              setCurrent(program._id); setForm({ name: program.name, years: program.years.join(', '), semesters: program.semesters.join(', ') });
            }}>Edit</button></td>}</tr>)}
        </tbody></table>{!programs.data?.length && <div className="empty-state">Add a degree or program to get started.</div>}
          <Pagination {...degreePage} onPageChange={degreePage.setPage} /></div>}
        {section === 'Subjects' && <div className="table-scroll"><table><thead><tr><th>Code</th><th>Subject</th><th>Program</th><th>Year</th><th>Semester</th>{canManage && <th />}</tr></thead>
            <tbody>{subjectPage.rows.map((subject) => <tr key={subject._id}><td>{subject.code}</td><td>{subject.name}</td>
            <td>{subject.program}</td><td>{subject.year}</td><td>{subject.semester}</td>{canManage && <td><button type="button" className="text-button" onClick={() => {
              setSubjectEdit(subject._id); setSubjectForm({ name: subject.name, code: subject.code, program: subject.program, year: String(subject.year), semester: String(subject.semester) });
            }}>Edit</button></td>}</tr>)}</tbody></table>
            {!subjects.data?.length && <div className="empty-state">Subjects will appear here after you add them.</div>}
            <Pagination {...subjectPage} onPageChange={subjectPage.setPage} /></div>}
        {section === 'Departments' && <div className="table-scroll"><table><thead><tr><th>Department</th><th>Code</th><th>Setup</th></tr></thead>
          <tbody>{departmentPage.rows.map((department) => <tr key={department.name}><td>{department.name}</td><td>{department.code}</td>
            <td>{department.legacy ? 'Existing records' : <>{canManage && <button type="button" className="text-button" onClick={() => {
              setDepartmentEdit(department._id); setDepartmentForm({ name: department.name, code: department.code });
            }}>Edit</button>}</>}</td></tr>)}</tbody></table>
          {!departmentCatalog.data?.length && <div className="empty-state">Create departments for students and exam schedules.</div>}
          <Pagination {...departmentPage} onPageChange={departmentPage.setPage} /></div>}
      </section>
      {canManage ? <section className="panel form-panel">
        {section === 'Degrees' && <><h2>{current ? 'Edit degree' : 'Add degree'}</h2><p className="subtle">Set up a degree or program and its study years and semesters.</p><form onSubmit={saveProgram}>
        <Field label="Program name" value={form.name} setValue={(name) => setForm({ ...form, name })} />
        <Field label="Years (comma-separated, e.g. 1, 2, 3)" value={form.years} setValue={(years) => setForm({ ...form, years })} />
        <Field label="Semesters (comma-separated, e.g. 1–6)" value={form.semesters} setValue={(semesters) => setForm({ ...form, semesters })} />
        <div className="toolbar-actions"><button className="primary" disabled={saving}>{current ? 'Save changes' : 'Add program'}</button>
          {current && <button type="button" className="outline" onClick={() => { setCurrent(null); setForm({ name: '', years: '1, 2, 3, 4', semesters: '1, 2, 3, 4, 5, 6, 7, 8' }); }}>Cancel edit</button>}</div>
        </form></>}
        {section === 'Subjects' && <><h2>{subjectEdit ? 'Edit subject' : 'Add subject'}</h2><p className="subtle">Connect each subject to its degree, year and semester.</p>
        <FormSteps steps={['Subject', 'Cohort']} current={subjectStep} onStep={setSubjectStep} />
        <form onSubmit={subjectStep === 1 ? saveSubject : (event) => { event.preventDefault(); setError(''); setSubjectStep(1); }}>
        {subjectStep === 0 && <div className="setup-step">
        <Field label="Subject name" value={subjectForm.name} setValue={(name) => setSubjectForm({ ...subjectForm, name })} />
        <Field label="Subject code" value={subjectForm.code} setValue={(code) => setSubjectForm({ ...subjectForm, code })} />
        </div>}
        {subjectStep === 1 && <div className="setup-step">
        <label>Program<select required value={subjectForm.program} onChange={(event) => setSubjectForm({ ...subjectForm, program: event.target.value, year: '', semester: '' })}>
          <option value="">Choose a program</option>{programs.data?.map((program) => <option key={program._id}>{program.name}</option>)}</select></label>
        <label>Year<select required disabled={!available} value={subjectForm.year} onChange={(event) => setSubjectForm({ ...subjectForm, year: event.target.value })}>
          <option value="">Choose a year</option>{available?.years.map((year) => <option key={year}>{year}</option>)}</select></label>
        <label>Semester<select required disabled={!subjectForm.year} value={subjectForm.semester} onChange={(event) => setSubjectForm({ ...subjectForm, semester: event.target.value })}>
          <option value="">Choose a semester</option>{available?.semesters.map((semester) => <option key={semester}>{semester}</option>)}</select></label>
        </div>}
        <div className="wizard-actions">{subjectStep > 0 && <button type="button" className="outline" onClick={() => setSubjectStep(0)}>Back</button>}
          <button className="primary" disabled={saving}>{subjectStep === 1 ? (subjectEdit ? 'Save subject' : 'Add subject') : 'Continue'}</button>
          {subjectEdit && <button type="button" className="outline" onClick={() => { setSubjectEdit(null); setSubjectForm({ name: '', code: '', program: '', year: '', semester: '' }); setSubjectStep(0); }}>Cancel edit</button>}</div>
        </form></>}
        {section === 'Departments' && <><h2>{departmentEdit ? 'Edit department' : 'Add department'}</h2><p className="subtle">Create a department once, then assign it to students and officer access.</p><form onSubmit={saveDepartment}>
          <Field label="Department name" value={departmentForm.name} setValue={(name) => setDepartmentForm({ ...departmentForm, name })} />
          <Field label="Department code" value={departmentForm.code} setValue={(code) => setDepartmentForm({ ...departmentForm, code: code.toUpperCase() })} />
          <div className="toolbar-actions"><button className="primary" disabled={saving}>{departmentEdit ? 'Save department' : 'Add department'}</button>
            {departmentEdit && <button type="button" className="outline" onClick={() => { setDepartmentEdit(null); setDepartmentForm({ name: '', code: '' }); }}>Cancel edit</button>}</div>
        </form></>}
        <Alert error={error || programs.error || subjects.error || departments.error || departmentCatalog.error} /></section>
        : <section className="panel form-panel"><span className="eyebrow">OFFICER ACCESS</span><h2>Academic reference</h2>
          <p className="subtle">Degrees, departments and subjects are available for reference when scheduling exams. Ask a Super Admin to add or change academic records.</p>
          <Alert error={programs.error || subjects.error || departments.error || departmentCatalog.error} />
        </section>}
    </div>
  );
}
