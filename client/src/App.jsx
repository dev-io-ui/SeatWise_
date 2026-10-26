import { useEffect, useState } from 'react';
import { api } from './api.js';
import Landing from './pages/Landing.jsx';
import Login from './pages/Login.jsx';
import StudentRegistration from './pages/StudentRegistration.jsx';
import StudentView, { STUDENT_TITLES } from './pages/StudentPortal.jsx';
import ProfileDialog from './components/ProfileDialog.jsx';
import { AuditLog, Dashboard, Exams, Halls, OfficerStudents, Officers, Programs, Students } from './pages/index.js';
import { Planner } from './pages/SeatPlanner.jsx';

const PAGES = {
  Dashboard, Exams, Planner, Halls, Students, Programs, Officers, AuditLog
};
const TITLES = { Programs: 'Academic setup', Planner: 'Seat planner', AuditLog: 'Audit log' };
const NAV = {
  superadmin: ['Dashboard', 'Planner', 'Exams', 'Halls', 'Students', 'Programs', 'Officers', 'AuditLog'],
  officer: ['Dashboard', 'Planner', 'Exams', 'Halls', 'Students', 'Programs'],
  student: ['Overview', 'My Exams', 'Study Resources', 'Documents', 'Exam Guide']
};

function sectionFromLocation(role) {
  const defaultSection = role === 'student' ? 'Overview' : 'Dashboard';
  const section = new URLSearchParams(window.location.search).get('section');
  return NAV[role]?.includes(section) ? section : defaultSection;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState('Dashboard');
  const [login, setLogin] = useState(false);
  const [register, setRegister] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  useEffect(() => {
    api('/auth/me').then((result) => {
      setUser(result.user);
      setTab(sectionFromLocation(result.user.role));
    }).catch(() => {}).finally(() => setReady(true));
  }, []);
  useEffect(() => {
    if (!user) return undefined;
    const restoreSection = () => setTab(sectionFromLocation(user.role));
    window.addEventListener('popstate', restoreSection);
    return () => window.removeEventListener('popstate', restoreSection);
  }, [user]);
  function navigateToSection(section) {
    setTab(section);
    const url = new URL(window.location.href);
    if (url.searchParams.get('section') === section) return;
    url.searchParams.set('section', section);
    window.history.pushState({ section }, '', `${url.pathname}${url.search}${url.hash}`);
  }
  if (!ready) return <main className="boot-loader"><span className="brand-mark">SW</span><span>SeatWise</span></main>;
  if (!user) {
    const showLogin = () => { setRegister(false); setLogin(true); };
    const showRegistration = () => { setRegister(true); setLogin(false); };
    if (register) return <StudentRegistration onLogin={showLogin} />;
    if (login) return <Login onLogin={(nextUser) => { setUser(nextUser); setTab(sectionFromLocation(nextUser.role)); }} onRegister={showRegistration} />;
    return <Landing onLogin={showLogin} onRegister={showRegistration} />;
  }
  const Page = user.role === 'officer' && tab === 'Students' ? OfficerStudents : PAGES[tab] || Dashboard;
  const links = NAV[user.role] || [];
  const titles = user.role === 'student' ? STUDENT_TITLES : TITLES;
  async function logout() {
    await api('/auth/logout', { method: 'POST' });
    setUser(null);
    setLogin(false);
  }
  return (
    <div className="portal-shell">
      <aside className="sidebar">
        <button className="brand-button" onClick={() => navigateToSection(user.role === 'student' ? 'Overview' : 'Dashboard')}><span className="brand-mark">SW</span><span>SeatWise</span></button>
        <small className="nav-label">{user.role === 'student' ? 'STUDENT TOOLS' : 'WORKSPACE'}</small>
        <nav>{links.map((name) => <button key={name} title={titles[name] || name} aria-label={titles[name] || name} className={tab === name ? 'active' : ''} onClick={() => navigateToSection(name)}>
          <span className="nav-icon">{name === 'Planner' || name === 'My Exams' ? '▦' : name === 'Dashboard' || name === 'Overview' ? '⌂' : name === 'AuditLog' || name === 'Exam Guide' ? '◷' : name === 'Documents' ? '⇩' : name === 'Study Resources' ? '↗' : name.slice(0, 1)}</span>
          {titles[name] || name}
        </button>)}</nav>
        <div className="sidebar-foot"><span className="user-avatar">{user.name.slice(0, 1).toUpperCase()}</span><span>{user.name}<small>{user.role === 'superadmin' ? 'Super Admin' : user.role}</small></span></div>
      </aside>
      <div className="workspace">
        <header className="topbar"><div><span className="eyebrow">{user.role === 'student' ? 'STUDENT PORTAL' : 'SEATWISE WORKSPACE'}</span>
          <h1>{titles[tab] || tab}</h1></div>
          <div className="top-actions"><button className="profile-trigger" onClick={() => setProfileOpen(true)} aria-label="View and edit profile">
            <span className="user-avatar">{user.name.slice(0, 1).toUpperCase()}</span><span className="welcome-user">{user.name}<small>View profile</small></span>
          </button><button className="logout-button" onClick={logout}>Log out</button></div>
        </header>
        <main className="workspace-content">{user.role === 'student' ? <StudentView user={user} tab={tab} setTab={navigateToSection} /> : <Page role={user.role} />}</main>
      </div>
      {profileOpen && <ProfileDialog user={user} onClose={() => setProfileOpen(false)} onUpdated={setUser} />}
    </div>
  );
}
