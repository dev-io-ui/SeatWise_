import { useEffect, useState } from 'react';
import { api } from '../api.js';

export const STUDENT_TITLES = {
  Overview: 'Student overview',
  'My Exams': 'My exams',
  Documents: 'My documents',
  'Study Resources': 'Study resources',
  'Exam Guide': 'Exam guide'
};

function examStart(exam) {
  return new Date(`${String(exam.date).slice(0, 10)}T${exam.start || '00:00'}:00`);
}

function formatExamDate(date) {
  return date.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

export default function StudentView({ user, tab, setTab }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api('/students/me/exams').then(setRows).catch((reason) => setError(reason.message));
  }, []);
  if (!rows) return <div className="skeleton-card" aria-label="Loading timetable" />;
  if (error) return <p role="alert" className="err">{error}</p>;
  const now = new Date();
  const sortedRows = [...rows].sort((a, b) => examStart(a) - examStart(b));
  const upcoming = sortedRows.filter((exam) => examStart(exam) >= now);
  const nextExam = upcoming[0];
  const cards = (exams) => exams.map((exam, index) => {
    const startsAt = examStart(exam);
    const past = startsAt < now;
    return (
      <article key={`${exam.code}-${exam.date}-${index}`} className={`ticket ${past ? 'past' : ''}`}>
        <div className="ticket-top"><span className="eyebrow">{exam.examType || 'Exam'} · {exam.code}</span><span className={`status ${past ? '' : 'published'}`}>{past ? 'Completed' : 'Upcoming'}</span></div>
        <h2>{exam.subject}</h2>
        <p>{formatExamDate(startsAt)}</p>
        <p>{exam.start} to {exam.end}</p>
        <p>{exam.building} · {exam.floor} · {exam.hall}</p>
        <div className="seat-number">Seat {exam.seat}</div>
        {exam.resources?.length > 0 && <p className="ticket-resources">{exam.resources.length} study {exam.resources.length === 1 ? 'resource' : 'resources'} available</p>}
      </article>
    );
  });
  const resourceExams = sortedRows.filter((exam) => exam.resources?.length);
  return (
    <div className="student-view">
      {tab === 'Overview' && <>
        <section className="student-welcome">
        <div><span className="eyebrow">STUDENT PORTAL</span><h2>Welcome, {user.name}</h2>
          <p>Your exams, assigned seats and important documents in one place.</p></div>
          <button className="primary" onClick={() => setTab('My Exams')}>View my exams</button>
        </section>
        <section className="student-stats">
          <article className="student-stat"><span>Upcoming exams</span><strong>{upcoming.length}</strong><small>Published and scheduled</small></article>
          <article className="student-stat"><span>Total published</span><strong>{rows.length}</strong><small>Your assigned exam seats</small></article>
          <article className="student-stat"><span>Next exam</span><strong>{nextExam ? formatExamDate(examStart(nextExam)).split(',')[0] : '—'}</strong><small>{nextExam ? nextExam.subject : 'No upcoming exams'}</small></article>
        </section>
        {nextExam ? <section className="panel next-exam">
          <div className="panel-heading"><h2>Coming up next</h2><button className="text-button" onClick={() => setTab('My Exams')}>All exams →</button></div>
          {cards([nextExam])}
        </section> : <div className="empty-state"><h2>You’re all caught up</h2><p>There are no upcoming published exams. Your schedule will appear here when your next exam is published.</p></div>}
        <section className="panel student-shortcuts">
          <div className="panel-heading"><h2>Quick access</h2><span>Student tools</span></div>
          <div className="student-shortcut-grid">
            <button onClick={() => setTab('My Exams')}><span>▦</span><strong>My exam schedule</strong><small>Dates, times and seat assignments</small></button>
            <button onClick={() => setTab('Documents')}><span>⇩</span><strong>Download documents</strong><small>Timetable and hall ticket PDFs</small></button>
            <button onClick={() => setTab('Study Resources')}><span>▤</span><strong>Study resources</strong><small>Notes, documents and learning links</small></button>
          </div>
        </section>
      </>}
      {tab === 'My Exams' && <section className="student-section">
        <div className="student-section-heading"><div><span className="eyebrow">PERSONAL SCHEDULE</span><h2>My exams</h2><p>Only your published exams and assigned seats are shown here.</p></div><button className="outline" onClick={() => setTab('Documents')}>Get documents</button></div>
        {sortedRows.length ? <div className="cards">{cards(sortedRows)}</div> :
          <div className="empty-state"><h2>No published exams yet</h2><p>Your timetable and assigned seat will appear here once published.</p></div>}
      </section>}
      {tab === 'Documents' && <section className="student-section">
        <div className="student-section-heading"><div><span className="eyebrow">DOWNLOADS</span><h2>My documents</h2><p>Personal PDFs generated from your published exam and seat assignments.</p></div></div>
        <div className="document-grid">
          <article className="document-card"><span className="document-icon">▤</span><div><h3>Exam timetable</h3><p>One printable list of your published exam dates, times and venues.</p></div><a className="button primary" href="/api/v1/reports/student-timetable.pdf">Download timetable</a></article>
          <article className="document-card"><span className="document-icon">⌖</span><div><h3>Hall ticket</h3><p>Your exam details with building, floor, hall and assigned seat for entry.</p></div><a className="button outline" href="/api/v1/reports/student-hall-ticket.pdf">Download hall ticket</a></article>
        </div>
        <p className="subtle">These files are private to your account. If a new exam is published, download an updated copy.</p>
      </section>}
      {tab === 'Study Resources' && <section className="student-section">
        <div className="student-section-heading"><div><span className="eyebrow">PREPARE FOR YOUR EXAMS</span><h2>Study resources</h2><p>Materials shared by your exam officer for your published exams.</p></div></div>
        {resourceExams.length ? <div className="study-exams">{resourceExams.map((exam, index) => (
          <section className="panel study-exam" key={`${exam.code}-${exam.date}-${index}`}>
            <div className="panel-heading"><div><h2>{exam.subject}</h2><span>{exam.examType || 'Exam'} · {exam.code} · {formatExamDate(examStart(exam))}</span></div><span>{exam.resources.length} {exam.resources.length === 1 ? 'resource' : 'resources'}</span></div>
            <ul className="study-resource-list">{exam.resources.map((resource) => (
              <li key={resource.id}><span className="document-icon">{resource.kind === 'link' ? '↗' : '▤'}</span>
                <span className="study-resource-info"><strong>{resource.title}</strong><small>{resource.description || (resource.kind === 'link' ? 'External learning link' : resource.fileName || 'Exam study material')}</small></span>
                {resource.kind === 'link'
                  ? <a className="button outline" href={resource.url} target="_blank" rel="noreferrer">Open link</a>
                  : <a className="button primary" href={resource.downloadUrl} download={resource.fileName}>Download</a>}
              </li>
            ))}</ul>
          </section>
        ))}</div> : <div className="empty-state"><h2>No study resources yet</h2><p>When resources are shared for your published exams, they’ll appear here.</p><button className="outline" onClick={() => setTab('My Exams')}>Review my exams</button></div>}
      </section>}
      {tab === 'Exam Guide' && <section className="student-section">
        <div className="student-section-heading"><div><span className="eyebrow">BE PREPARED</span><h2>Exam day guide</h2><p>A quick checklist to help you arrive ready and find your assigned seat.</p></div></div>
        <div className="guide-grid">
          <article className="guide-card"><span>01</span><h3>Before exam day</h3><p>Check the date, start time and venue on your timetable. Download your hall ticket and confirm the seat printed on it.</p></article>
          <article className="guide-card"><span>02</span><h3>Plan your arrival</h3><p>Allow time to reach the correct building and floor. Follow hall signs and listen to invigilator instructions.</p></article>
          <article className="guide-card"><span>03</span><h3>At the hall</h3><p>Bring your hall ticket and required student identification. Sit only in your assigned seat and keep aisles clear.</p></article>
        </div>
        <div className="panel guide-note"><strong>Find your seat</strong><p>Use the hall ticket to locate the building, floor, hall and seat label. Ask an invigilator if you need help.</p><button className="outline" onClick={() => setTab('Documents')}>Open my documents</button></div>
      </section>}
    </div>
  );
}
