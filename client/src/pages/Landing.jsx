import { useState } from 'react';
import { api } from '../api.js';
export default function Landing({ onLogin, onRegister }) {
  const [roll, setRoll] = useState(''); const [res, setRes] = useState(null); const [err, setErr] = useState('');
  async function find(e) { e.preventDefault(); setErr(''); try { setRes(await api('/public/seat?roll=' + encodeURIComponent(roll))); } catch (x) { setErr(x.message); } }
  return (<div className="landing"><header className="top"><b>SeatWise</b><nav><a href="#find">Find my seat</a><button onClick={onRegister}>Student registration</button><button onClick={onLogin}>Sign in</button></nav></header>
    <section className="hero"><h1>Know your exam hall before exam day</h1><p>Check your published exam, building, floor, hall and seat. Sign in to download your private hall ticket. Staff can manage exams and seating from their portal.</p>
      <form id="find" onSubmit={find}><input placeholder="Enter your roll number" value={roll} onChange={e => setRoll(e.target.value)} required /><button>Find my seat</button></form>
      {err && <p role="alert" className="err">{err}</p>}</section>
    {res && <section className="results">{res.length === 0 ? <p>No published seating for this roll number yet.</p> : <>
      <div className="cards">{res.map((x, i) => <article key={i} className="ticket"><h2>{x.subject} <small>{x.code}</small></h2><p>{new Date(x.date).toDateString()}, {x.start} to {x.end}</p><p>{x.building}, {x.floor}, {x.hall}</p><strong>Seat {x.seat}</strong></article>)}</div>
      <button className="noprint outline" onClick={onLogin}>Sign in to download your hall ticket</button></>}</section>}
    <section className="steps"><div><h3>Students</h3><p>Register with your academic details, then sign in after your institution approves your account.</p><button className="outline" onClick={onRegister}>Register as a student</button></div><div><h3>Officers</h3><p>Add exams and halls, auto-allocate seats, review the visual plan.</p></div><div><h3>Super admin</h3><p>Manage officers, structure and every allocation.</p></div></section></div>);
}
