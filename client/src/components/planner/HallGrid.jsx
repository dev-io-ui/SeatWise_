import { memo } from 'react';
import { DEPT_CLASS, LETTER } from './seat-utils.js';

export const HallGrid = memo(function HallGrid({ hall, seatMap, restrictedSeats, selectedId, highlighted, issues, onSeatClick, editable }) {
  return (
    <article className="hall">
      <div className="hall-heading"><div><h3>{hall.name}</h3><p>{hall.building} · {hall.floor}</p></div><span>{hall.rows * hall.cols - hall.blocked.length} seats</span></div>
      <div className="front">Front / invigilator</div>
      <div className="grid-scroll">
        <div className="grid" style={{ gridTemplateColumns: `2rem repeat(${hall.cols}, clamp(1.8rem, 4vw, 3rem))` }}>
          {Array.from({ length: hall.rows }).flatMap((_, row) => [
            <span key={`label-${row}`} className="rowlabel">{LETTER(row)}</span>,
            ...Array.from({ length: hall.cols }).map((__, column) => {
              const seat = seatMap.get(`${row},${column}`);
              const blocked = hall.blocked.some((item) => item.r === row && item.c === column);
              if (blocked) return <div key={`${row}-${column}`} className="seat blocked" aria-label={`Blocked seat ${LETTER(row)}${column + 1}`}>×</div>;
              if (restrictedSeats.has(`${row},${column}`)) return <div key={`${row}-${column}`} className="seat restricted" aria-label={`Assigned seat ${LETTER(row)}${column + 1}; student details are outside your scope`}>R</div>;
              if (!seat) return (
                <button key={`${row}-${column}`} className="seat free" onClick={() => editable && onSeatClick(null, hall, row, column)}
                  disabled={!editable} aria-label={`Empty seat ${LETTER(row)}${column + 1}`}>{column + 1}</button>
              );
              const conflicting = issues.has(seat.id);
              const highlight = highlighted.has(seat.id);
              return (
                <button key={`${row}-${column}`} className={`seat ${DEPT_CLASS[seat.deptIndex % DEPT_CLASS.length]} ${selectedId === seat.id ? 'sel' : ''} ${conflicting ? 'conflict' : ''} ${highlight ? 'hit' : ''}`}
                  onClick={() => onSeatClick(seat, hall, row, column)}
                  aria-label={`${LETTER(row)}${column + 1} ${seat.student.name}, ${seat.student.dept}${conflicting ? ', conflict' : ''}`}
                  title={`${seat.student.name} · ${seat.student.roll} · ${seat.student.dept}`}>
                  {seat.student.dept.slice(0, 3)}
                </button>
              );
            })
          ])}
        </div>
      </div>
    </article>
  );
});
