import { useState } from 'react';
import { Alert, Loading, Pagination, useLoad } from '../components/ui.jsx';

export function OfficerStudents() {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const students = useLoad(`/officer/students?page=${page}&limit=10&search=${encodeURIComponent(query)}`);
  if (students.loading) return <Loading />;

  return <div className="students-page">
    <section className="students-intro">
      <div><span className="eyebrow">PEOPLE & ACCESS</span><h2>Students</h2>
        <p>Active students in the departments assigned to your officer account.</p></div>
      <div className="student-metrics"><div><span>Students in your scope</span><strong>{students.data?.total || 0}</strong></div></div>
    </section>
    <section className="panel student-directory">
      <div className="panel-heading"><div><span className="eyebrow">DIRECTORY</span><h2>Assigned students</h2></div>
        <span className="record-count">{students.data?.total || 0} records</span></div>
      <label className="student-search"><span>Search students</span>
        <input type="search" placeholder="Name, roll number or department" value={query}
          onChange={(event) => { setQuery(event.target.value); setPage(1); }} /></label>
      <div className="table-scroll"><table><thead><tr><th>Student</th><th>Department</th><th>Program</th><th>Year</th><th>Semester</th></tr></thead>
        <tbody>{students.data?.items?.map((student) => <tr key={student._id}>
          <td><strong>{student.name}</strong><small>{student.rollNumber}</small></td>
          <td>{student.department}</td><td>{student.program}</td><td>{student.year}</td><td>{student.semester}</td>
        </tr>)}</tbody></table></div>
      {!students.data?.items?.length && <div className="empty-state">{query
        ? 'No students match your search.'
        : 'No active students are available in your assigned departments.'}</div>}
      {students.data && <Pagination page={students.data.page} totalPages={students.data.totalPages} total={students.data.total}
        pageSize={students.data.pageSize} onPageChange={setPage} />}
      <Alert error={students.error} />
    </section>
  </div>;
}
