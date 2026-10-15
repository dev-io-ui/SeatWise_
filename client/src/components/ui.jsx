import { useEffect, useState } from 'react';
import { api } from '../api.js';

export function useLoad(path) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = async () => {
    setLoading(true);
    try { setData(await api(path)); setError(''); }
    catch (reason) { setError(reason.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [path]);
  return { data, error, loading, load };
}

export function Field({ label, value, setValue, type = 'text', required = true, min, minLength }) {
  return <label>{label}<input type={type} min={min} minLength={minLength} value={value} required={required} onChange={(event) => setValue(event.target.value)} /></label>;
}
export function Alert({ error }) { return error ? <p role="alert" className="err form-alert">{error}</p> : null; }
export function Loading() { return <div className="skeleton-card" aria-label="Loading" />; }
export function FormSteps({ steps, current, onStep }) {
  return <ol className="form-steps">{steps.map((step, index) => (
    <li key={step} className={index === current ? 'current' : index < current ? 'complete' : ''}>
      <button type="button" disabled={index > current} onClick={() => onStep(index)}>
        <span>{index < current ? '✓' : index + 1}</span><small>{step}</small>
      </button>
    </li>
  ))}</ol>;
}
export function usePagination(items, pageSize = 10) {
  const [page, setPage] = useState(1);
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  return { page, setPage, total, totalPages, pageSize, rows: items.slice((page - 1) * pageSize, page * pageSize) };
}
export function Pagination({ page, totalPages, total, pageSize = 10, onPageChange }) {
  if (total <= pageSize) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  return <div className="pagination">
    <span>Showing {first}–{last} of {total}</span>
    <div><button className="outline small-button" type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Previous</button>
      <span>Page {page} of {totalPages}</span>
      <button className="outline small-button" type="button" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>Next</button></div>
  </div>;
}
