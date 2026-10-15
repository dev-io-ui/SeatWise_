import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Alert, Field, FormSteps, Loading, Pagination, useLoad, usePagination } from '../components/ui.jsx';

export function Exams({ role }) {
  const exams = useLoad('/exams');
  const examPage = usePagination(exams.data || [], 10);
  const subjects = useLoad('/subjects');
  const programs = useLoad('/programs');
  const departments = useLoad('/departments');
  const [form, setForm] = useState({ name: '', examType: 'Mid-semester', program: '', year: '', semester: '', subjectId: '', date: '', startTime: '09:00', endTime: '12:00', departments: [] });
  const [allDepartments, setAllDepartments] = useState(role !== 'officer');
  const [eligibility, setEligibility] = useState(null);
  const [eligibilityError, setEligibilityError] = useState('');
  const [eligibilityLoading, setEligibilityLoading] = useState(false);
  const [resourceDraft, setResourceDraft] = useState({ title: '', description: '', url: '' });
  const [resources, setResources] = useState([]);
  const [files, setFiles] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState(0);
  const [editingExam, setEditingExam] = useState(null);
  const setField = (key, value, resets = []) => setForm((old) => ({ ...old, [key]: value, ...Object.fromEntries(resets.map((item) => [item, ''])) }));
  const program = programs.data?.find((item) => item.name === form.program);
  const subjectsFiltered = (subjects.data || []).filter((subject) =>
    subject.program === form.program && String(subject.year) === form.year && String(subject.semester) === form.semester);
  const departmentsKey = form.departments.join(',');
  useEffect(() => {
    if (!form.subjectId) {
      setEligibility(null);
      setEligibilityError('');
      setEligibilityLoading(false);
      return undefined;
    }
    let active = true;
    setEligibilityLoading(true);
    setEligibilityError('');
    const params = new URLSearchParams({ subjectId: form.subjectId });
    if (!allDepartments) params.set('departments', departmentsKey);
    api(`/exams/eligibility?${params}`).then((result) => {
      if (active) {
        setEligibility(result);
        if (!result.allDepartmentsAllowed) setAllDepartments(false);
      }
    }).catch((reason) => {
      if (active) { setEligibility(null); setEligibilityError(reason.message); }
    }).finally(() => {
      if (active) setEligibilityLoading(false);
    });
    return () => { active = false; };
  }, [form.subjectId, allDepartments, departmentsKey]);
  const downloadPath = role === 'officer' ? '/api/v1/reports/timetable.pdf' : '/api/v1/reports/timetable.pdf';
  function addResourceLink() {
    setError('');
    try {
      const link = new URL(resourceDraft.url);
      if (link.protocol !== 'https:') throw new Error('Resource links must use HTTPS.');
      if (!resourceDraft.title.trim()) throw new Error('Enter a title for the learning link.');
      if (resources.length + files.length >= 10) throw new Error('An exam can have at most 10 learning resources.');
      setResources((current) => [...current, { ...resourceDraft, title: resourceDraft.title.trim(), url: link.href }]);
      setResourceDraft({ title: '', description: '', url: '' });
    } catch (reason) {
      setError(reason.message === 'Invalid URL' ? 'Enter a valid HTTPS learning link.' : reason.message);
    }
  }
  function selectFiles(selected) {
    const next = [...files, ...Array.from(selected)];
    if (next.length > 5) return setError('Choose at most 5 learning files.');
    if (next.some((file) => file.size > 8 * 1024 * 1024)) return setError('Each learning file must be 8 MB or smaller.');
    if (resources.length + next.length > 10) return setError('An exam can have at most 10 learning resources.');
    setError('');
    setFiles(next);
  }
  async function createExam(event) {
    event.preventDefault(); setSaving(true); setError('');
    try {
      if (!allDepartments && !form.departments.length) throw new Error('Choose at least one department, or select all eligible departments.');
      if (!eligibility?.total) throw new Error('There are no eligible students for this subject and department selection.');
      if (editingExam) {
        await api(`/exams/${editingExam._id}`, { method: 'PUT', body: {
          name: form.name || `${form.examType} · ${subjectsFiltered.find((subject) => subject._id === form.subjectId)?.name || ''}`,
          examType: form.examType, date: form.date, startTime: form.startTime, endTime: form.endTime,
          departments: allDepartments ? [] : form.departments
        } });
        setEditingExam(null);
        setStep(0);
        await exams.load();
        return;
      }
      const body = new FormData();
      body.append('name', form.name);
      body.append('examType', form.examType);
      body.append('subjectId', form.subjectId);
      body.append('date', form.date);
      body.append('startTime', form.startTime);
      body.append('endTime', form.endTime);
      body.append('departments', JSON.stringify(allDepartments ? [] : form.departments));
      body.append('resources', JSON.stringify(resources));
      files.forEach((file) => body.append('files', file));
      await api('/exams', { method: 'POST', body });
      setForm({ ...form, name: '', subjectId: '', date: '', departments: [] });
      setResources([]); setFiles([]); setStep(0);
      await exams.load();
    } catch (reason) {
      const details = reason.data?.diagnostics?.flatMap((item) => item.students || []).length;
      setError(details ? `${reason.message} (${details} affected students)` : reason.message);
    } finally { setSaving(false); }
  }
  if (exams.loading || subjects.loading || programs.loading || departments.loading) return <Loading />;
  return (
    <div className="two-column-page">
      <section className="panel"><div className="panel-heading"><h2>Examinations</h2><a className="button outline" href={downloadPath}>Download full timetable PDF</a></div>
        <div className="table-scroll"><table><thead><tr><th>Subject</th><th>Exam type</th><th>Cohort</th><th>Date</th><th>Time</th><th>Status</th><th>Allocation</th>{role !== 'officer' && <th />}</tr></thead>
          <tbody>{examPage.rows.map((exam) => <tr key={exam._id}><td><strong>{exam.subject}</strong><small>{exam.subjectCode}</small></td>
            <td>{exam.examType || 'Other'}</td>
            <td>{exam.program} · Y{exam.year} S{exam.semester}<small>{exam.cohortDepartments?.length
              ? exam.cohortDepartments.join(', ')
              : 'No eligible department details'}</small></td>
            <td>{new Date(exam.date).toLocaleDateString()}</td><td>{exam.startTime}–{exam.endTime}</td>
            <td><span className={`status ${exam.status}`}>{exam.status}</span></td>
            <td>{exam.status !== 'draft' && !(role === 'officer' && exam.officerReadOnly)
              ? <a href={`/api/v1/reports/allocation.csv?examId=${exam._id}`}>CSV</a>
              : role === 'officer' && exam.officerReadOnly ? 'Scoped view' : '—'}</td>
            {role !== 'officer' && <td>{exam.status === 'draft' && <button className="text-button" type="button" onClick={() => {
              const subject = subjects.data?.find((item) => item.code === exam.subjectCode && item.program === exam.program &&
                item.year === exam.year && item.semester === exam.semester);
              const selectedDepartments = exam.departments || [];
              setEditingExam(exam);
              setForm({
                name: exam.name, examType: exam.examType || 'Other', program: exam.program,
                year: String(exam.year), semester: String(exam.semester), subjectId: subject?._id || '',
                date: new Date(exam.date).toISOString().slice(0, 10), startTime: exam.startTime, endTime: exam.endTime,
                departments: selectedDepartments
              });
              setAllDepartments(selectedDepartments.length === 0); setStep(0); setError('');
            }}>Edit</button>}</td>}
          </tr>)}</tbody></table></div>
        <Pagination {...examPage} onPageChange={examPage.setPage} />
        {!exams.data?.length && <div className="empty-state">{role === 'officer'
          ? 'No examinations are available within your department access. Ask a Super Admin to review your department assignments.'
          : 'No examinations created yet.'}</div>}
        <Alert error={exams.error || subjects.error || programs.error || departments.error} />
      </section>
      <section className="panel form-panel setup-panel">
        <div><span className="eyebrow">EXAM SETUP</span><h2>{editingExam ? 'Edit draft examination' : 'Create an examination'}</h2>
          <p className="subtle">{editingExam ? 'Schedule and eligible departments can be changed while the exam remains a draft.' : 'Add the details in a few short steps.'}</p>
          {editingExam && <button type="button" className="text-button" onClick={() => { setEditingExam(null); setStep(0); setError(''); }}>Cancel edit</button>}</div>
        <FormSteps steps={['Course', 'Schedule', 'Resources', 'Review']} current={step} onStep={setStep} />
        <form onSubmit={step === 3 ? createExam : (event) => { event.preventDefault(); setError(''); setStep((current) => Math.min(current + 1, 3)); }}>
          {step === 0 && <div className="setup-step">
          <h3>Which course is this for?</h3>
          <label>Degree / program<select required value={form.program} onChange={(event) => setForm((old) => ({
            ...old, program: event.target.value, year: '', semester: '', subjectId: '', departments: []
          }))}>
            <option value="">Choose a program</option>{programs.data?.map((item) => <option key={item._id}>{item.name}</option>)}</select></label>
          <label>Year<select required disabled={!program} value={form.year} onChange={(event) => setForm((old) => ({
            ...old, year: event.target.value, semester: '', subjectId: '', departments: []
          }))}>
            <option value="">Choose a year</option>{program?.years.map((year) => <option key={year}>{year}</option>)}</select></label>
          <label>Semester<select required disabled={!form.year} value={form.semester} onChange={(event) => setForm((old) => ({
            ...old, semester: event.target.value, subjectId: '', departments: []
          }))}>
            <option value="">Choose a semester</option>{program?.semesters.map((semester) => <option key={semester}>{semester}</option>)}</select></label>
          <label>Subject<select required disabled={!form.semester} value={form.subjectId} onChange={(event) => {
            setField('subjectId', event.target.value); setForm((old) => ({ ...old, subjectId: event.target.value, departments: [] }));
          }}>
            <option value="">Choose a subject</option>{subjectsFiltered.map((subject) => <option key={subject._id} value={subject._id}>{subject.name} · {subject.code}</option>)}</select></label>
          {form.subjectId && <div className="cohort-preview" aria-live="polite">
            <label className="check-option"><input type="checkbox" checked={allDepartments} disabled={eligibility && !eligibility.allDepartmentsAllowed}
              onChange={(event) => setAllDepartments(event.target.checked)} />
              All eligible departments</label>
            {!allDepartments && <fieldset className="department-options">
              <legend>Include departments for this shared exam</legend>
              {eligibility?.departments?.length ? eligibility.departments.map(({ name, count }) =>
                <label key={name} className="check-option"><input type="checkbox" disabled={!count} checked={form.departments.includes(name)}
                  onChange={() => setForm((old) => ({
                    ...old,
                    departments: old.departments.includes(name)
                      ? old.departments.filter((item) => item !== name)
                      : [...old.departments, name]
                  }))} />{name} <span>{count} students</span></label>) : !eligibilityLoading && <p className="subtle">No active departments have students in this subject cohort.</p>}
            </fieldset>}
            {eligibilityLoading ? <p className="subtle" role="status">Checking eligible students…</p> :
              eligibilityError ? <p className="err" role="alert">{eligibilityError}</p> :
                eligibility?.total ? <p className="subtle" role="status">{eligibility.total} eligible students for this selection.</p> :
                  <p className="err" role="alert">
                    No active students match {form.program}, year {form.year}, semester {form.semester}
                    {!allDepartments && form.departments.length ? ` in ${form.departments.join(', ')}` : ''}.
                    Add or import students into this cohort before creating its exam.
                  </p>}
          </div>}
          </div>}
          {step === 1 && <div className="setup-step">
          <h3>When is the exam?</h3>
          <Field label="Exam name (optional)" required={false} value={form.name} setValue={(value) => setField('name', value)} />
          <label>Exam type<select required value={form.examType} onChange={(event) => setField('examType', event.target.value)}>
            {['Mid-semester', 'End-semester', 'Class Test (CL)', 'Quiz', 'Practical', 'Other'].map((type) => <option key={type}>{type}</option>)}
          </select></label>
          <Field label="Date" type="date" value={form.date} setValue={(value) => setField('date', value)} />
          <div className="form-row"><Field label="Start time" type="time" value={form.startTime} setValue={(value) => setField('startTime', value)} />
            <Field label="End time" type="time" value={form.endTime} setValue={(value) => setField('endTime', value)} /></div>
          </div>}
          {step === 2 && <>
          <section className="exam-resources">
            <div><h3>Learning resources <span className="subtle">(optional)</span></h3>
              <p className="subtle">Attach study notes or trusted links. Students can access them from their portal after the exam is published.</p></div>
            <Field label="Link title" required={false} value={resourceDraft.title} setValue={(value) => setResourceDraft({ ...resourceDraft, title: value })} />
            <Field label="Learning link (HTTPS)" type="url" required={false} value={resourceDraft.url} setValue={(value) => setResourceDraft({ ...resourceDraft, url: value })} />
            <Field label="Short description" required={false} value={resourceDraft.description} setValue={(value) => setResourceDraft({ ...resourceDraft, description: value })} />
            <button type="button" className="outline" disabled={!resourceDraft.title.trim() || !resourceDraft.url.trim() || resources.length + files.length >= 10} onClick={addResourceLink}>Add learning link</button>
            <label>Attach PDF or Word documents (up to 5 files, 8 MB each)
              <input type="file" accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                multiple onChange={(event) => { selectFiles(event.target.files); event.target.value = ''; }} />
            </label>
            {(resources.length > 0 || files.length > 0) && <ul className="resource-draft-list">
              {resources.map((resource, index) => <li key={`link-${index}`}><span><strong>{resource.title}</strong><small>Learning link</small></span>
                <button type="button" className="text-button" aria-label={`Remove ${resource.title}`} onClick={() => setResources((current) => current.filter((_, item) => item !== index))}>Remove</button></li>)}
              {files.map((file, index) => <li key={`${file.name}-${index}`}><span><strong>{file.name}</strong><small>{(file.size / 1024 / 1024).toFixed(1)} MB · File</small></span>
                <button type="button" className="text-button" aria-label={`Remove ${file.name}`} onClick={() => setFiles((current) => current.filter((_, item) => item !== index))}>Remove</button></li>)}
            </ul>}
          </section>
          </>}
          {step === 3 && <div className="setup-step review-card">
            <h3>Review exam details</h3>
            <dl><div><dt>Exam</dt><dd>{form.name || `${form.examType} · ${subjectsFiltered.find((subject) => subject._id === form.subjectId)?.name || ''}`}</dd></div>
              <div><dt>Course</dt><dd>{subjectsFiltered.find((subject) => subject._id === form.subjectId)?.name || 'Not selected'} · {form.program}, Year {form.year}, Semester {form.semester}</dd></div>
              <div><dt>Schedule</dt><dd>{form.date} · {form.startTime}–{form.endTime}</dd></div>
              <div><dt>Departments</dt><dd>{allDepartments ? 'All eligible departments' : form.departments.join(', ') || 'Choose at least one department'}</dd></div>
              <div><dt>Eligible students</dt><dd>{eligibilityLoading ? 'Checking…' : eligibilityError || eligibility?.total || 0}</dd></div>
              <div><dt>Study resources</dt><dd>{resources.length + files.length} attached</dd></div></dl>
            <p className="subtle">{editingExam ? 'Existing learning resources are retained. Allocated or published exams cannot be edited.' : 'The exam is created as a draft. You can allocate seats and publish it when ready.'}</p>
          </div>}
          <div className="wizard-actions">
            {step > 0 && <button type="button" className="outline" onClick={() => { setError(''); setStep((current) => current - 1); }}>Back</button>}
            <button className="primary" disabled={saving ||
              (step === 0 && (eligibilityLoading || eligibilityError || !eligibility?.total || (!allDepartments && !form.departments.length))) ||
              (step === 3 && (eligibilityLoading || eligibilityError || !eligibility?.total))}>
              {step === 3 ? (editingExam ? 'Save exam changes' : 'Create draft exam') : step === 2 ? 'Review exam' : 'Continue'}
            </button>
          </div>
          <Alert error={error} />
        </form>
      </section>
    </div>
  );
}
