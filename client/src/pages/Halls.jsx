import { useState } from 'react';
import { api } from '../api.js';
import { Alert, Field, FormSteps, Loading, Pagination, useLoad, usePagination } from '../components/ui.jsx';

export function Halls({ role }) {
  const buildings = useLoad('/buildings');
  const [buildingId, setBuildingId] = useState('');
  const floors = useLoad(`/floors${buildingId ? `?buildingId=${buildingId}` : ''}`);
  const halls = useLoad('/halls');
  const hallPage = usePagination(halls.data || [], 10);
  const [buildingForm, setBuildingForm] = useState({ name: '', code: '' });
  const [floorForm, setFloorForm] = useState({ name: '', code: '' });
  const [form, setForm] = useState({ name: '', code: '', building: '', floor: '', rows: 8, cols: 10, blocked: '' });
  const [setupStep, setSetupStep] = useState(0);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [buildingEdit, setBuildingEdit] = useState(null);
  const [floorEdit, setFloorEdit] = useState(null);
  const [hallEdit, setHallEdit] = useState(null);
  const currentFloors = floors.data?.filter((floor) => !form.building || String(floor.building?._id || floor.building) === form.building) || [];
  async function addBuilding(event) {
    event.preventDefault(); setSaving(true); setError('');
    try {
      const wasEditing = Boolean(buildingEdit);
      const result = await api(buildingEdit ? `/buildings/${buildingEdit}` : '/buildings', {
        method: buildingEdit ? 'PUT' : 'POST', body: buildingForm
      });
      setBuildingEdit(null);
      setBuildingForm({ name: '', code: '' }); setBuildingId(result._id);
      setForm((old) => ({ ...old, building: result._id, floor: '' }));
      if (!wasEditing) setSetupStep(1);
      await Promise.all([buildings.load(), floors.load(), halls.load()]);
    }
    catch (reason) { setError(reason.message); } finally { setSaving(false); }
  }
  async function addFloor(event) {
    event.preventDefault(); setSaving(true); setError('');
    try {
      const wasEditing = Boolean(floorEdit);
      const result = await api(floorEdit ? `/floors/${floorEdit}` : '/floors', {
        method: floorEdit ? 'PUT' : 'POST', body: { ...floorForm, building: buildingId }
      });
      setFloorEdit(null);
      setFloorForm({ name: '', code: '' });
      setForm((old) => ({ ...old, building: buildingId, floor: result._id }));
      if (!wasEditing) setSetupStep(2);
      await Promise.all([floors.load(), halls.load()]);
    } catch (reason) { setError(reason.message); } finally { setSaving(false); }
  }
  async function addHall(event) {
    event.preventDefault(); setSaving(true); setError('');
    try {
      const blocked = form.blocked.split(',').map((value) => value.trim()).filter(Boolean).map((value) => {
        const match = value.match(/^([A-Z]+)(\d+)$/i);
        if (!match) throw new Error(`Invalid blocked seat "${value}". Use a row letter and seat number, such as A1.`);
        let row = 0;
        for (const letter of match[1].toUpperCase()) row = row * 26 + letter.charCodeAt(0) - 64;
        return { r: row - 1, c: Number(match[2]) - 1 };
      });
      await api(hallEdit ? `/halls/${hallEdit}` : '/halls', { method: hallEdit ? 'PATCH' : 'POST', body: {
        name: form.name, code: form.code, building: form.building, floor: form.floor,
        rows: Number(form.rows), cols: Number(form.cols), blocked
      } });
      setHallEdit(null);
      setForm({ ...form, name: '', code: '', blocked: '' }); await halls.load();
    } catch (reason) { setError(reason.message); } finally { setSaving(false); }
  }
  if (buildings.loading || floors.loading || halls.loading) return <Loading />;
  return (
    <div className="two-column-page">
      <section className="panel"><div className="panel-heading"><h2>Location hierarchy</h2><span>Building → Floor → Hall</span></div>
        {role !== 'officer' && <div className="location-records">
          <div className="table-scroll"><table><thead><tr><th>Buildings</th><th>Code</th><th /></tr></thead><tbody>
            {buildings.data?.map((building) => <tr key={building._id}><td>{building.name}</td><td>{building.code}</td><td><button type="button" className="text-button" onClick={() => {
              setBuildingId(building._id); setBuildingEdit(building._id); setBuildingForm({ name: building.name, code: building.code }); setSetupStep(0);
            }}>Edit</button></td></tr>)}</tbody></table></div>
          <div className="table-scroll"><table><thead><tr><th>Floors</th><th>Building</th><th>Code</th><th /></tr></thead><tbody>
            {floors.data?.map((floor) => <tr key={floor._id}><td>{floor.name}</td><td>{floor.building?.name}</td><td>{floor.code}</td><td><button type="button" className="text-button" onClick={() => {
              setBuildingId(String(floor.building?._id || floor.building)); setForm((old) => ({ ...old, building: String(floor.building?._id || floor.building) }));
              setFloorEdit(floor._id); setFloorForm({ name: floor.name, code: floor.code }); setSetupStep(1);
            }}>Edit</button></td></tr>)}</tbody></table></div>
        </div>}
        <div className="table-scroll"><table><thead><tr><th>Hall</th><th>Building</th><th>Floor</th><th>Layout</th><th>Usable</th>{role !== 'officer' && <th />}</tr></thead>
          <tbody>{hallPage.rows.map((hall) => <tr key={hall._id}><td><strong>{hall.name}</strong><small>{hall.code}</small></td>
            <td>{hall.building?.name}</td><td>{hall.floor?.name}</td><td>{hall.rows} × {hall.cols}</td>
            <td>{hall.rows * hall.cols - hall.blocked.length}</td>{role !== 'officer' && <td><button type="button" className="text-button" onClick={() => {
              const blocked = (hall.blocked || []).map(({ r, c }) => {
                let row = r + 1, letters = '';
                while (row) { const remainder = (row - 1) % 26; letters = String.fromCharCode(65 + remainder) + letters; row = Math.floor((row - 1) / 26); }
                return `${letters}${c + 1}`;
              }).join(', ');
              setHallEdit(hall._id); setBuildingId(String(hall.building?._id)); setSetupStep(2);
              setForm({ name: hall.name, code: hall.code, building: String(hall.building?._id), floor: String(hall.floor?._id), rows: hall.rows, cols: hall.cols, blocked });
            }}>Edit</button></td>}</tr>)}</tbody></table></div>
        <Pagination {...hallPage} onPageChange={hallPage.setPage} />
        {!halls.data?.length && <div className="empty-state">{role === 'officer'
          ? 'No halls are available within your building access. Ask a Super Admin to review your building assignments.'
          : 'No halls yet. Create a building, floor and hall to get started.'}</div>}
        <Alert error={buildings.error || floors.error || halls.error} />
      </section>
      <section className="panel form-panel setup-panel">
        <div><span className="eyebrow">LOCATION SETUP</span><h2>{hallEdit ? 'Edit hall' : 'Add a hall'}</h2><p className="subtle">Set up its building and floor first.</p>
          {(buildingEdit || floorEdit || hallEdit) && <button className="text-button" type="button" onClick={() => {
            setBuildingEdit(null); setFloorEdit(null); setHallEdit(null); setBuildingForm({ name: '', code: '' });
            setFloorForm({ name: '', code: '' }); setSetupStep(0);
          }}>Cancel edit</button>}</div>
        <FormSteps steps={['Building', 'Floor', 'Hall']} current={setupStep} onStep={setSetupStep} />
        {setupStep === 0 && <div className="setup-step">
          <label>Use an existing building<select value={buildingId} onChange={(event) => {
            setBuildingId(event.target.value);
            setForm((old) => ({ ...old, building: event.target.value, floor: '' }));
          }}><option value="">Choose a building</option>{buildings.data?.map((building) => <option key={building._id} value={building._id}>{building.name} · {building.code}</option>)}</select></label>
          {buildingId && <button type="button" className="primary" onClick={() => setSetupStep(1)}>Continue with building</button>}
          <div className="step-divider"><span>or add a new building</span></div>
          <form onSubmit={addBuilding}>
            <Field label="Building name" value={buildingForm.name} setValue={(name) => setBuildingForm({ ...buildingForm, name })} />
            <Field label="Building code" value={buildingForm.code} setValue={(code) => setBuildingForm({ ...buildingForm, code })} />
            <button className="outline" disabled={saving}>{buildingEdit ? 'Save building changes' : 'Save and continue to floors'}</button>
          </form>
        </div>}
        {setupStep === 1 && <div className="setup-step">
          <div className="step-context">Building selected: <strong>{buildings.data?.find((item) => item._id === buildingId)?.name}</strong></div>
          <label>Use an existing floor<select value={form.floor} onChange={(event) => setForm((old) => ({ ...old, floor: event.target.value }))}>
            <option value="">Choose a floor</option>{currentFloors.map((floor) => <option key={floor._id} value={floor._id}>{floor.name} · {floor.code}</option>)}</select></label>
          {form.floor && <button type="button" className="primary" onClick={() => setSetupStep(2)}>Continue with floor</button>}
          <div className="step-divider"><span>or add a new floor</span></div>
          <form onSubmit={addFloor}>
            <Field label="Floor name" value={floorForm.name} setValue={(name) => setFloorForm({ ...floorForm, name })} />
            <Field label="Floor code" value={floorForm.code} setValue={(code) => setFloorForm({ ...floorForm, code })} />
            <div className="toolbar-actions"><button type="button" className="outline" onClick={() => setSetupStep(0)}>Back</button><button className="outline" disabled={saving || !buildingId}>{floorEdit ? 'Save floor changes' : 'Save and continue to hall'}</button></div>
          </form>
        </div>}
        {setupStep === 2 && <div className="setup-step">
          <div className="step-context">{buildings.data?.find((item) => item._id === buildingId)?.name} · {currentFloors.find((item) => item._id === form.floor)?.name}</div>
          <form onSubmit={addHall}>
            <Field label="Hall name" value={form.name} setValue={(name) => setForm({ ...form, name })} />
            <Field label="Hall code" value={form.code} setValue={(code) => setForm({ ...form, code })} />
            <div className="form-row"><Field label="Rows" type="number" min="1" value={form.rows} setValue={(rows) => setForm({ ...form, rows })} />
              <Field label="Columns" type="number" min="1" value={form.cols} setValue={(cols) => setForm({ ...form, cols })} /></div>
            <Field label="Blocked seats (e.g. A1, B3)" required={false} value={form.blocked} setValue={(blocked) => setForm({ ...form, blocked })} />
            <div className="toolbar-actions"><button type="button" className="outline" onClick={() => setSetupStep(1)}>Back</button><button className="primary" disabled={saving}>{hallEdit ? 'Save hall changes' : 'Save hall'}</button></div>
          </form>
        </div>}
        <Alert error={error || buildings.error || floors.error || halls.error} />
      </section>
    </div>
  );
}
