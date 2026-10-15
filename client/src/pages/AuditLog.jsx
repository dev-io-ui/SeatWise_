import { useState } from 'react';
import { Alert, Loading, Pagination, useLoad } from '../components/ui.jsx';

export function AuditLog() {
  const [page, setPage] = useState(1);
  const logs = useLoad(`/audit-logs?page=${page}`);
  if (logs.loading) return <Loading />;
  if (logs.error) return <Alert error={logs.error} />;
  return <section className="panel"><div className="panel-heading"><h2>Audit log</h2><span>All admin and allocation actions</span></div>
    <div className="table-scroll"><table><thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Target</th><th>Details</th></tr></thead>
      <tbody>{logs.data?.items?.map((entry) => <tr key={entry._id}><td>{new Date(entry.createdAt).toLocaleString()}</td>
        <td>{entry.actor?.name || 'System'}<small>{entry.actor?.email}</small></td><td>{entry.action}</td><td>{entry.target}</td>
        <td><code>{JSON.stringify(entry.meta || {})}</code></td></tr>)}</tbody></table></div>
    {!logs.data?.items?.length && <div className="empty-state">Audit actions will appear here.</div>}
    <Pagination page={logs.data?.page || page} totalPages={logs.data?.totalPages || 1} total={logs.data?.total || 0} pageSize={logs.data?.pageSize || 10} onPageChange={setPage} />
  </section>;
}
