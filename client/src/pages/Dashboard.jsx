import { Alert, Loading, useLoad } from '../components/ui.jsx';

export function Dashboard() {
  const { data, error, loading } = useLoad('/dashboard');
  if (loading) return <Loading />;
  if (error) return <Alert error={error} />;
  const max = Math.max(1, ...data.byDept.map((item) => item.n));
  return (
    <div className="dashboard-page">
      <div className="stats">{[
        ['Students', data.students], ['Officers', data.officers], ['Buildings', data.buildings], ['Halls', data.halls],
        ['Seat capacity', data.capacity], ['Exams', data.exams], ['Published plans', data.published], ['Awaiting allocation', data.pending]
      ].map(([label, value]) => <article key={label} className="stat"><span>{label}</span><b>{value}</b></article>)}</div>
      <div className="dashboard-grid">
        <section className="panel"><div className="panel-heading"><h2>Students by department</h2><span>Active students</span></div>
          {data.byDept.length ? <div className="bars">{data.byDept.map((item) => <div key={item._id}>
            <span>{item._id}</span><div className="bar-track"><i style={{ width: `${(item.n / max) * 100}%` }} /></div><em>{item.n}</em>
          </div>)}</div> : <div className="empty-state">No student records yet.</div>}
        </section>
        <section className="panel"><div className="panel-heading"><h2>Upcoming examinations</h2><span>{data.upcoming.length} upcoming</span></div>
          {data.upcoming.length ? <div className="table-scroll"><table><thead><tr><th>Subject</th><th>Date</th><th>Time</th><th>Status</th></tr></thead>
            <tbody>{data.upcoming.map((exam) => <tr key={exam._id}><td>{exam.subject}</td><td>{new Date(exam.date).toLocaleDateString()}</td>
              <td>{exam.startTime}–{exam.endTime}</td><td><span className={`status ${exam.status}`}>{exam.status}</span></td></tr>)}</tbody></table></div>
            : <div className="empty-state">No upcoming examinations.</div>}
        </section>
      </div>
    </div>
  );
}
