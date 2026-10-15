import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { HallGrid } from '../components/planner/HallGrid.jsx';
import { DEPT_CLASS, LETTER } from '../components/planner/seat-utils.js';

export function Planner({ role }) {
  const [exams, setExams] = useState([]);
  const [hallsCatalog, setHallsCatalog] = useState([]);
  const [examId, setExamId] = useState('');
  const [selectedHalls, setSelectedHalls] = useState([]);
  const [plan, setPlan] = useState(null);
  const [sel, setSel] = useState(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [department, setDepartment] = useState('');
  const [building, setBuilding] = useState('');
  const [floor, setFloor] = useState('');
  const [hallFilter, setHallFilter] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([api('/exams'), api('/halls')]).then(([examRows, hallRows]) => {
      setExams(examRows);
      setHallsCatalog(hallRows);
      if (examRows[0]) setExamId(examRows[0]._id);
      setSelectedHalls(hallRows.map((hall) => hall._id));
    }).catch((reason) => setError(reason.message));
  }, []);

  async function load() {
    if (!examId) { setPlan(null); return; }
    try {
      const result = await api(`/exams/${examId}/allocations`);
      setPlan(result);
      setSel(null);
    } catch (reason) {
      setError(reason.message);
    }
  }
  useEffect(() => { load(); }, [examId]);

  const depts = useMemo(() => [...new Set(plan?.seats.map((seat) => seat.student.dept) || [])].sort(), [plan]);
  const deptIndex = useMemo(() => new Map(depts.map((name, index) => [name, index])), [depts]);
  const issueIds = useMemo(() => new Set((plan?.issues || []).flatMap((issue) => [
    issue.a?.id, issue.b?.id, issue.seat?.id
  ].filter(Boolean))), [plan]);
  const list = useMemo(() => plan?.seats.filter((seat) =>
    (!department || seat.student.dept === department) &&
    (seat.student.name + seat.student.roll).toLowerCase().includes(query.toLowerCase())) || [], [plan, department, query]);
  const highlighted = useMemo(() => new Set(list.map((seat) => seat.id)), [list]);
  const selected = plan?.seats.find((seat) => seat.id === sel);
  const chosenExam = exams.find((exam) => exam._id === examId);
  const planHalls = plan?.halls || [];
  const floors = [...new Set(planHalls.filter((item) => !building || item.buildingId === building).map((item) => item.floorId))];
  const visibleHalls = planHalls.filter((item) => (!building || item.buildingId === building) &&
    (!floor || item.floorId === floor) && (!hallFilter || item.id === hallFilter));
  const selectedHallForReport = hallFilter || visibleHalls[0]?.id || planHalls[0]?.id;
  const editable = !!plan?.seats.length && !plan.readOnly && !plan.seats.some((seat) => seat.published);

  async function seatClick(seat, hall, row, column) {
    if (!sel) {
      if (seat) setSel(seat.id);
      return;
    }
    if (seat?.id === sel) { setSel(null); return; }
    setBusy(true); setError(''); setMsg('');
    try {
      if (seat) {
        await api(`/exams/${examId}/allocations/swap`, { method: 'POST', body: { a: sel, b: seat.id } });
        setMsg('Seats swapped.');
      } else {
        await api(`/exams/${examId}/allocations/move`, { method: 'POST', body: { allocationId: sel, hallId: hall.id, r: row, c: column } });
        setMsg('Student moved.');
      }
      await load();
    } catch (reason) {
      setError(reason.message + (reason.data?.diagnostics ? ` (${reason.data.diagnostics.length} rule conflict)` : ''));
      setSel(null);
    } finally {
      setBusy(false);
    }
  }

  async function generate() {
    if (!examId || !selectedHalls.length) return setError('Select an exam and at least one hall.');
    setBusy(true); setError(''); setMsg('');
    try {
      const result = await api(`/exams/${examId}/allocations/generate`, { method: 'POST', body: { hallIds: selectedHalls } });
      setMsg(`Generated version ${result.version} with ${result.count} seats.`);
      await load();
    } catch (reason) {
      const details = reason.data?.diagnostics?.map((item) => `${item.type}: ${item.suggestion || ''}`).join(' · ');
      setError(details ? `${reason.message}: ${details}` : reason.message);
    } finally {
      setBusy(false);
    }
  }
  async function createVersion() {
    setBusy(true); setError('');
    try {
      const result = await api(`/exams/${examId}/allocations/versions`, { method: 'POST' });
      setMsg(`Editable version ${result.version} created.`);
      await load();
    } catch (reason) { setError(reason.message); }
    finally { setBusy(false); }
  }
  async function publish() {
    setBusy(true); setError('');
    try {
      await api(`/exams/${examId}/allocations/publish`, { method: 'POST' });
      setMsg('Plan published. Student timetables are now available.');
      await Promise.all([load(), api('/exams').then(setExams)]);
    } catch (reason) { setError(reason.message); }
    finally { setBusy(false); }
  }

  if (error && !exams.length) return <p role="alert" className="err">{error}</p>;
  return (
    <div className="planner">
      <div className="planner-toolbar">
        <label>Exam<select value={examId} onChange={(event) => { setExamId(event.target.value); setError(''); }} aria-label="Exam">
          {exams.map((exam) => <option key={exam._id} value={exam._id}>{exam.examType || 'Exam'} · {exam.subject} · {exam.status}</option>)}
        </select></label>
        <label>Building<select value={building} onChange={(event) => { setBuilding(event.target.value); setFloor(''); setHallFilter(''); }}>
          <option value="">All buildings</option>{[...new Map(planHalls.map((item) => [item.buildingId, item.building])).entries()].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select></label>
        <label>Floor<select value={floor} onChange={(event) => { setFloor(event.target.value); setHallFilter(''); }}>
          <option value="">All floors</option>{floors.map((id) => <option key={id} value={id}>{planHalls.find((item) => item.floorId === id)?.floor}</option>)}
        </select></label>
        <label>Hall<select value={hallFilter} onChange={(event) => setHallFilter(event.target.value)}>
          <option value="">All halls</option>{visibleHalls.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        <div className="toolbar-actions">
          {!plan?.readOnly && <button className="primary" onClick={generate} disabled={busy || !examId || chosenExam?.status === 'published'}>Auto-allocate</button>}
          {!plan?.readOnly && chosenExam?.status === 'published' && <button className="outline" onClick={createVersion} disabled={busy}>Create editable version</button>}
          {!plan?.readOnly && <button className="success" onClick={publish} disabled={busy || !editable || !!plan?.issues.length}>Publish</button>}
          {!plan?.readOnly && selectedHallForReport && <a className="button outline" href={`/api/v1/reports/hall-chart.pdf?examId=${examId}&hallId=${selectedHallForReport}`}>Hall chart PDF</a>}
          {!plan?.readOnly && examId && <a className="button outline" href={`/api/v1/reports/attendance.pdf?examId=${examId}${hallFilter ? `&hallId=${hallFilter}` : ''}`}>Attendance PDF</a>}
        </div>
      </div>
      {!plan?.readOnly && <div className="hall-pick-list"><strong>Allocation halls</strong>{hallsCatalog.map((hall) => (
        <label key={hall._id} className="check-option"><input type="checkbox" checked={selectedHalls.includes(hall._id)}
          onChange={(event) => setSelectedHalls((current) => event.target.checked ? [...current, hall._id] : current.filter((id) => id !== hall._id))} />
          {hall.name} · {hall.building?.name}</label>
      ))}</div>}
      {plan?.readOnly && <p className="toast">This exam has students or halls outside your assigned scope. You can view your assigned students’ seats only; allocation changes and reports are restricted to the full plan.</p>}
      {(msg || error) && <p role={error ? 'alert' : 'status'} className={error ? 'err toast' : 'toast'}>{error || msg}</p>}
      {plan && !plan.seats.length && <div className="empty-state"><h3>No allocation yet</h3><p>Choose halls above and auto-allocate seats for this exam.</p></div>}
      <div className="planner-split">
        <section className="planner-halls">
          {visibleHalls.map((hall) => {
            const seatMap = new Map(plan.seats.filter((seat) => seat.hallId === hall.id).map((seat) => [
              `${seat.r},${seat.c}`, { ...seat, deptIndex: deptIndex.get(seat.student.dept) || 0 }
            ]));
            const restrictedSeats = new Set((plan.restrictedSeats || []).filter((seat) => seat.hallId === hall.id).map((seat) => `${seat.r},${seat.c}`));
            return <HallGrid key={hall.id} hall={hall} seatMap={seatMap} restrictedSeats={restrictedSeats} selectedId={sel} highlighted={highlighted}
              issues={issueIds} onSeatClick={seatClick} editable={editable} />;
          })}
          {plan?.seats.length > 0 && <ul className="legend">
            {depts.map((name, index) => <li key={name}><i className={`sw ${DEPT_CLASS[index % DEPT_CLASS.length]}`} />{name}</li>)}
            <li><i className="sw blocked" />Blocked ×</li><li><i className="sw conflict" />Conflict !</li>
            {plan?.restrictedSeats?.length > 0 && <li><i className="sw restricted" />Assigned, details restricted</li>}
          </ul>}
        </section>
        <aside className="student-list">
          <div><h3>Students <span className="count">{list.length}</span></h3><input placeholder="Search name or roll" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
          <label>Department<select value={department} onChange={(event) => setDepartment(event.target.value)}>
            <option value="">All departments</option>{depts.map((name) => <option key={name}>{name}</option>)}
          </select></label>
          {selected && <div className="detail"><strong>{selected.student.name}</strong><p>{selected.student.roll} · {selected.student.dept}</p>
            <p>Year {selected.student.year}, semester {selected.student.semester}</p>
            <p>{selected.student.subject || chosenExam?.subject} · {selected.student.dept}</p>
            <p>Seat {LETTER(selected.r)}{selected.c + 1}. {plan?.readOnly ? 'This shared plan is read-only outside your assigned scope.' : editable ? 'Choose another student to swap, or an empty seat to move.' : 'Published plan is locked.'}</p></div>}
          <ul className="people">{list.map((seat) => <li key={seat.id}>
            <button onClick={() => setSel(seat.id)} className={sel === seat.id ? 'person-selected' : ''}>
              <span>{seat.student.name}<small>{seat.student.roll} · {seat.student.dept}</small></span>
              <small>{LETTER(seat.r)}{seat.c + 1}</small>
            </button>
          </li>)}</ul>
        </aside>
      </div>
    </div>
  );
}
