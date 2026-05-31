import { useState, useEffect, FormEvent } from 'react';
import { AlertCircle, Plus, Edit, Edit3, Trash2, RefreshCcw, Save, X, CarFront, Battery, Activity, ShieldAlert, Zap, CloudSun, ThermometerSun, ThermometerSnowflake, Search } from 'lucide-react';


interface Vehicle {
  id?: number;
  vin: string;
  model_masina: string;
  an_fabricatie: number | string;
  kilometraj: number | string;
  nivel_baterie: number | string;
  autonomie_estimata_km: number | string;
  cicluri_incarcare: number | string;
  sanatate_baterie: number | string;
  tensiune?: number;
  temperatura_baterie?: number;
  schimbare_baterie?: string;
  data_ultima_verificare?: string;
}

const emptyForm: Vehicle = {
  vin: '',
  model_masina: '',
  an_fabricatie: '',
  kilometraj: '',
  nivel_baterie: '',
  autonomie_estimata_km: '',
  cicluri_incarcare: '',
  sanatate_baterie: ''
};

export default function App() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<Vehicle>(emptyForm);
  const [apiUrl, setApiUrl] = useState('https://tesla-vehicle-manager-production.up.railway.app/vehicule');
  const [errorMsg, setErrorMsg] = useState('');
  const [temperature, setTemperature] = useState<number | null>(null);
  const [isDecodingVin, setIsDecodingVin] = useState(false);
  const [locationQuery, setLocationQuery] = useState('');
  const [locationName, setLocationName] = useState('Iași, România');
  const [locationError, setLocationError] = useState('');
  const [diagnostics, setDiagnostics] = useState<{type: string, text: string, action: string}[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  
  const selectedVehicle = vehicles.find((v) => v.id === selectedId);

  const filteredVehicles = vehicles.filter(v => 
    v.model_masina.toLowerCase().includes(searchQuery.toLowerCase()) || 
    v.vin.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const fetchWeather = async (lat = 47.1585, lon = 27.6014) => {
    try {
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code`);
      const data = await res.json();
      if (data && data.current) {
        setTemperature(Math.round(data.current.temperature_2m));
      }
    } catch (err) {
      console.error("Nu am putut prelua vremea", err);
    }
  };

  const handleLocationSearch = async (e: FormEvent) => {
    e.preventDefault();
    if (!locationQuery.trim()) return;
    setLocationError('');
    try {
      const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(locationQuery)}&count=1&language=ro&format=json`);
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        const { latitude, longitude, name, country } = data.results[0];
        setLocationName(`${name}, ${country || ''}`);
        fetchWeather(latitude, longitude);
        setLocationQuery('');
      } else {
        setLocationError("Locația nu a fost găsită.");
      }
    } catch (err) {
      console.error("Eroare la geocoding", err);
      setLocationError("Eroare la căutare.");
    }
  };

  const fetchVehicles = async () => {
    try {
      setErrorMsg('');
      
      let finalUrl = apiUrl;
      if (!finalUrl.startsWith('http')) {
        finalUrl = 'https://' + finalUrl;
      }

      const response = await fetch(finalUrl);
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Eroare de la server (${response.status}): Serverul nu returnează date valide.`);
      }
      
      const textData = await response.text();
      if (!textData) {
         throw new Error('Serverul a returnat un răspuns complet gol.');
      }

      let data;
      try {
        data = JSON.parse(textData);
      } catch (e) {
        throw new Error(`Răspunsul de la server are un format invalid. (Nu este JSON). Verificați link-ul API.`);
      }

      setVehicles(data);
      if (selectedId) {
        const veh = data.find((v: Vehicle) => v.id === selectedId);
        evaluateAlerts(veh, temperature);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Nu s-a putut conecta la server. Asigură-te că API-ul rulează corect pe Railway și nu returnează erori HTML.');
    }
  };

  useEffect(() => {
    fetchVehicles();
    fetchWeather();
  }, [apiUrl]);

  const evaluateAlerts = (veh: Vehicle | undefined, currentTemp: number | null) => {
    if (!veh) {
      setDiagnostics([]);
      return;
    }
    const diags: {type: string, text: string, action: string}[] = [];

    if (veh.temperatura_baterie && veh.tensiune) {
       if (veh.temperatura_baterie > 45 && currentTemp !== null && currentTemp < 20) {
           diags.push({ 
               type: 'critical', 
               text: `Supraîncălzire anormală! Bateria are ${veh.temperatura_baterie}°C deși afară sunt doar ${currentTemp}°C. Posibilă defecțiune majoră a pompei de răcire cu lichid.`, 
               action: 'Trage pe dreapta și oprește sistemul. Risc de degradare ireversibilă.' 
           });
       } 
       else if (veh.temperatura_baterie < 0) {
           diags.push({ 
               type: 'warning', 
               text: `Bateria este aproape înghețată (${veh.temperatura_baterie}°C). Componentele chimice reacționează lent.`, 
               action: 'Frânarea regenerativă și încărcarea rapidă DC au fost dezactivate temporar automat. Precondiționează bateria înainte de stația de încărcare.'
           });
       }

       if (veh.tensiune < 330 && Number(veh.nivel_baterie) > 50) {
           diags.push({ 
               type: 'critical', 
               text: `Dezechilibru sever de tensiune. Tensiunea totală e de ${veh.tensiune}V, deși bateria e încărcată la ${veh.nivel_baterie}%. Un grup de celule cedează în sarcină.`, 
               action: 'Intervenție service imediată. Probabilitate mare de pană de motor iminentă.'
           });
       }
    }

    if (veh.schimbare_baterie === 'Da' && Number(veh.sanatate_baterie) >= 70) {
        diags.push({
            type: 'error',
            text: `BMS-ul a marcat pachetul de baterii pentru înlocuire (posibil depășire număr maxim de cicluri).`,
            action: 'Inițiază cererea de înlocuire a pachetului de baterii pe garanție.'
        });
    }

    if (Number(veh.sanatate_baterie) < 70) {
        diags.push({
            type: 'error',
            text: `Uzura bateriei a atins ${veh.sanatate_baterie}%. Capacitatea netă de stocare este mult sub limita normală.`,
            action: 'Inițiază cererea de înlocuire a pachetului de baterii pe garanție.'
        });
    }

    setDiagnostics(diags);
  };

  const handleSelect = (veh: Vehicle) => {
    setSelectedId(veh.id!);
    evaluateAlerts(veh, temperature);
    if (isEditing) {
      setFormData(veh);
    }
  };

  const handleDecodeVIN = async () => {
    if (!formData.vin || formData.vin.length < 5) {
        alert("Introduceți un VIN valid înainte de decodare.");
        return;
    }
    
    setIsDecodingVin(true);
    try {
      const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${formData.vin}?format=json`);
      const data = await res.json();
      
      let make = "Necunoscut";
      let model = "";
      let year = "";

      if (data.Results) {
          data.Results.forEach((item: any) => {
              if (item.Variable === "Make" && item.Value) make = item.Value;
              if (item.Variable === "Model" && item.Value) model = item.Value;
              if (item.Variable === "Model Year" && item.Value) year = item.Value;
          });
      }
      
      setFormData(prev => ({
          ...prev,
          model_masina: `${make} ${model}`.trim(),
          an_fabricatie: parseInt(year) || prev.an_fabricatie
      }));
    } catch (err) {
      alert("A apărut o eroare la decodarea VIN-ului.");
    } finally {
      setIsDecodingVin(false);
    }
  };

  const handleEditClick = () => {
    if (!selectedVehicle) return;
    setFormData(selectedVehicle);
    setIsEditing(true);
  };

  const handleCancelClick = () => {
    setIsEditing(false);
    setFormData(emptyForm);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData({ ...formData, [name]: value });
  };

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    try {
      setErrorMsg('');
      const endpoint = isEditing && selectedId ? `${apiUrl}/${selectedId}` : apiUrl;
      const method = isEditing && selectedId ? 'PUT' : 'POST';

      const now = new Date();
      const updatedDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

      const payload = {
        ...formData,
        an_fabricatie: Number(formData.an_fabricatie),
        kilometraj: Number(formData.kilometraj),
        nivel_baterie: Number(formData.nivel_baterie),
        autonomie_estimata_km: Number(formData.autonomie_estimata_km),
        cicluri_incarcare: Number(formData.cicluri_incarcare),
        sanatate_baterie: Number(formData.sanatate_baterie),
        data_ultima_verificare: updatedDate
      };

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.eroare || 'Eroare la salvare');
      }

      await fetchVehicles();
      setIsEditing(false);
      setFormData(emptyForm);
    } catch (err: any) {
      setErrorMsg(err.message);
    }
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    
    try {
      await fetch(`${apiUrl}/${selectedId}`, { method: 'DELETE' });
      setSelectedId(null);
      await fetchVehicles();
    } catch (err: any) {
      setErrorMsg('Eroare la ștergere.');
    }
  };

  const handleDeleteAll = async () => {
    try {
      await fetch(apiUrl, { method: 'DELETE' });
      setSelectedId(null);
      await fetchVehicles();
    } catch (err: any) {
      setErrorMsg('Eroare la ștergerea totală.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans flex flex-col">
      <header className="bg-slate-900 border-b border-slate-800 p-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <CarFront className="w-8 h-8 text-blue-500" />
          <h1 className="text-xl font-bold tracking-tight text-white">Tesla Vehicle Manager</h1>
        </div>

      </header>

      {errorMsg && (
        <div className="bg-red-900/50 border-l-4 border-red-500 text-red-200 p-3 m-4 mb-0 rounded flex items-center gap-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm">{errorMsg}</p>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden p-4 gap-4">
        
        <div className="w-2/3 flex flex-col gap-4">
            
          {temperature !== null && (
              <div className={`p-4 rounded-xl flex items-center justify-between shadow-sm border ${
                  temperature > 35 ? 'bg-orange-950/40 border-orange-900/50 text-orange-200' : 
                  temperature < 5 ? 'bg-blue-950/40 border-blue-900/50 text-blue-200' : 
                  'bg-slate-900 border-slate-800 text-slate-300'
              }`}>
                  <div className="flex items-center gap-3">
                      {temperature > 35 ? <ThermometerSun className="w-8 h-8 text-orange-500" /> : 
                       temperature < 5 ? <ThermometerSnowflake className="w-8 h-8 text-blue-400" /> : 
                       <CloudSun className="w-8 h-8 text-slate-400" />}
                      <div>
                          <p className="font-semibold text-white">Vremea Curentă ({locationName}): {temperature}°C</p>
                          <p className="text-sm opacity-90">
                              {temperature > 35 ? "Caniculă detectată! Pentru a proteja sănătatea bateriei se recomandă limitarea încărcării DC la maxim 80%." :
                               temperature < 5 ? "Temperaturi scăzute. Autonomia estimată va fi redusă cu ~15-20%. Se recomandă precondiționarea bateriei." :
                               "Condiții optime de funcționare pentru flotele electrice."}
                          </p>
                      </div>
                  </div>
                  <div className="flex flex-col ml-4">
                      <form onSubmit={handleLocationSearch} className="flex gap-2 items-center">
                          <input 
                             type="text" 
                             value={locationQuery}
                             onChange={(e) => {
                                 setLocationQuery(e.target.value);
                                 if (locationError) setLocationError('');
                             }}
                             placeholder="Caută oraș (ex: Budapesta, Viena)"
                             className="bg-slate-800/50 border border-slate-700/80 rounded-md px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-blue-500 placeholder-slate-500 w-64 shadow-inner"
                          />
                          <button type="submit" className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700/80 rounded-md text-sm text-white transition-colors flex items-center gap-1 whitespace-nowrap shadow-sm">
                              <Search className="w-3.5 h-3.5 text-slate-400" /> Caută
                          </button>
                      </form>
                      {locationError && (
                          <div className="text-red-400 text-xs font-medium mt-1.5">
                              {locationError}
                          </div>
                      )}
                  </div>
              </div>
          )}

          <div className="bg-slate-900 border border-slate-800 rounded-xl flex flex-col shadow-lg overflow-hidden flex-1">
          <div className="p-3 border-b border-slate-800 flex justify-between items-center bg-slate-800/50">
            <h2 className="font-semibold text-slate-200 flex items-center gap-2">
              <Activity className="w-4 h-4 text-slate-400" />
              Flotă Vehicule
            </h2>
            <div className="flex gap-2 items-center">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2 top-2 text-slate-400" />
                <input 
                  type="text" 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Caută model sau VIN..."
                  className="bg-slate-950 border border-slate-700/80 rounded px-2 py-1.5 pl-7 text-xs text-slate-200 focus:outline-none focus:border-blue-500 placeholder-slate-500 w-48 shadow-inner"
                />
              </div>
              <button onClick={() => fetchVehicles()} className="flex items-center gap-1 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 rounded text-xs transition-colors">
                <RefreshCcw className="w-3.5 h-3.5" /> Reîncarcă
              </button>
              <button onClick={() => { setIsEditing(true); setFormData(emptyForm); setSelectedId(null); }} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs transition-colors">
                <Plus className="w-3.5 h-3.5" /> Adaugă Vehicul
              </button>
              <button onClick={handleDeleteAll} className="flex items-center gap-1 px-3 py-1.5 bg-red-900/40 text-red-400 border border-red-900/50 hover:bg-red-900/60 hover:text-red-300 rounded text-xs transition-colors">
                <Trash2 className="w-3.5 h-3.5" /> Șterge Tot
              </button>
            </div>
          </div>
          
          <div className="flex-1 overflow-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-400 uppercase bg-slate-900 border-b border-slate-800 sticky top-0">
                <tr>
                  <th className="px-4 py-3">ID</th>
                  <th className="px-4 py-3">Model</th>
                  <th className="px-4 py-3">An</th>
                  <th className="px-4 py-3">Km</th>
                  <th className="px-4 py-3">Cicluri</th>
                  <th className="px-4 py-3">Sănătate</th>
                  <th className="px-4 py-3">Schimb Baterie</th>
                </tr>
              </thead>
              <tbody>
                {filteredVehicles.map((v) => (
                  <tr 
                    key={v.id} 
                    onClick={() => handleSelect(v)}
                    className={`border-b border-slate-800 cursor-pointer transition-colors ${selectedId === v.id ? 'bg-blue-900/30' : 'hover:bg-slate-800/60'}`}
                  >
                    <td className="px-4 py-3 text-slate-400">#{v.id}</td>
                    <td className="px-4 py-3 font-medium text-slate-200">{v.model_masina}</td>
                    <td className="px-4 py-3">{v.an_fabricatie}</td>
                    <td className="px-4 py-3">{v.kilometraj} km</td>
                    <td className="px-4 py-3">{v.cicluri_incarcare}</td>
                    <td className="px-4 py-3 flex items-center gap-1">
                      <Battery className={`w-4 h-4 ${Number(v.sanatate_baterie) < 70 ? 'text-red-500' : 'text-green-500'}`} />
                      {v.sanatate_baterie}%
                    </td>
                    <td className="px-4 py-3">
                      {v.schimbare_baterie === 'Da' ? (
                        <span className="px-2 py-1 bg-red-900/50 text-red-400 text-xs rounded border border-red-800/50">Urgent</span>
                      ) : (
                        <span className="px-2 py-1 bg-green-900/30 text-green-400 text-xs rounded border border-green-800/30">Nu</span>
                      )}
                    </td>
                  </tr>
                ))}
                {vehicles.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-slate-500">Niciun vehicul în bază. Adugă unul nou.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        </div>

        <div className="w-1/3 flex flex-col gap-4">
          
          {selectedVehicle && !isEditing && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-xl font-bold text-white">{selectedVehicle.model_masina}</h3>
                  <p className="text-sm text-slate-400 font-mono mt-1">VIN: {selectedVehicle.vin}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={handleEditClick} className="p-2 bg-slate-800 hover:bg-slate-700 rounded transition-colors text-slate-300">
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button onClick={handleDelete} className="p-2 bg-red-900/30 hover:bg-red-900/50 border border-transparent hover:border-red-800 text-red-400 rounded transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {diagnostics.length > 0 && (
                <div className="mb-4 flex flex-col gap-3">
                  <h4 className="text-xs uppercase tracking-wider text-slate-400 flex items-center gap-1 font-semibold">
                    <Activity className="w-3.5 h-3.5" /> Diagnostic Inteligent BMS
                  </h4>
                  {diagnostics.map((diag, i) => (
                    <div key={i} className={`p-3 rounded border text-sm flex flex-col gap-2 ${
                        diag.type === 'critical' ? 'bg-red-950/30 border-red-900/50' : 
                        diag.type === 'warning' ? 'bg-yellow-950/30 border-yellow-900/50 font-normal' : 
                        'bg-slate-800/80 border-slate-700/80'
                    }`}>
                      <div className={`font-medium ${diag.type === 'critical' ? 'text-red-400' : diag.type === 'warning' ? 'text-yellow-400' : 'text-slate-300'}`}>
                        {diag.text}
                      </div>
                      <div className="bg-black/30 p-2 rounded text-slate-300 relative pl-4 mt-1">
                        <span className="absolute left-0 top-0 bottom-0 w-1 bg-slate-600 rounded-l"></span>
                        <span className="font-semibold text-slate-200">Acțiune sistem:</span> {diag.action}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 text-sm mt-2">
                <div>
                  <p className="text-slate-500 text-xs uppercase tracking-wider mb-1">An</p>
                  <p className="text-slate-200 font-medium">{selectedVehicle.an_fabricatie}</p>
                </div>
                <div>
                  <p className="text-slate-500 text-xs uppercase tracking-wider mb-1">Kilometraj</p>
                  <p className="text-slate-200 font-medium">{selectedVehicle.kilometraj} km</p>
                </div>
                <div>
                  <p className="text-slate-500 text-xs uppercase tracking-wider mb-1">Nivel Baterie</p>
                  <p className="text-slate-200 font-medium">{selectedVehicle.nivel_baterie}%</p>
                </div>
                <div>
                  <p className="text-slate-500 text-xs uppercase tracking-wider mb-1">Cicluri Încărcare</p>
                  <p className="text-slate-200 font-medium">{selectedVehicle.cicluri_incarcare}</p>
                </div>
                <div>
                  <p className="text-slate-500 text-xs uppercase tracking-wider mb-1">Autonomie Ideală</p>
                  <p className="text-slate-200 font-medium relative inline-block">
                     {selectedVehicle.autonomie_estimata_km} km
                  </p>
                </div>
                <div className="col-span-2 bg-slate-800/50 p-3 rounded border border-slate-700/50">
                  <p className="text-slate-500 text-xs uppercase tracking-wider mb-1 flex items-center gap-1">
                    <CloudSun className="w-3.5 h-3.5" /> Autonomie Reală Estimată (Vreme Curentă)
                  </p>
                  <p className={`text-lg font-bold ${
                    temperature !== null && temperature < 5 ? 'text-blue-400' : 
                    temperature !== null && temperature > 35 ? 'text-orange-400' : 'text-green-400'
                  }`}>
                    {temperature !== null && temperature < 5 ? Math.round(Number(selectedVehicle.autonomie_estimata_km) * 0.8) :
                     temperature !== null && temperature > 35 ? Math.round(Number(selectedVehicle.autonomie_estimata_km) * 0.9) :
                     selectedVehicle.autonomie_estimata_km} km
                     
                     <span className="text-sm font-normal ml-2 opacity-80">
                       {temperature !== null && temperature < 5 && "(-20% pierdere din cauza temperaturilor scăzute)"}
                       {temperature !== null && temperature > 35 && "(-10% pierdere din cauza răcirii bateriei)"}
                       {temperature !== null && temperature >= 5 && temperature <= 35 && "(Condiții optime de temperatură)"}
                     </span>
                  </p>
                </div>
                <div className="col-span-2">
                  <p className="text-slate-500 text-xs uppercase tracking-wider mb-1">Sănătate Baterie</p>
                  <p className={`font-medium ${Number(selectedVehicle.sanatate_baterie) < 70 ? 'text-red-400' : 'text-green-400'}`}>
                    {selectedVehicle.sanatate_baterie}%
                  </p>
                </div>
              </div>

              <hr className="border-slate-800 my-4" />
              
              <h4 className="text-xs uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1">
                <Zap className="w-3.5 h-3.5" /> Date Telemetrie Live
              </h4>
              <div className="space-y-3">
                <div className="flex justify-between items-center p-2 rounded bg-slate-800/50">
                  <span className="text-sm text-slate-300">Tensiune Baterie</span>
                  <span className="font-mono text-slate-200">{selectedVehicle.tensiune} V</span>
                </div>
                <div className="flex justify-between items-center p-2 rounded bg-slate-800/50">
                  <span className="text-sm text-slate-300">Temp. Baterie</span>
                  <span className="font-mono text-slate-200">{selectedVehicle.temperatura_baterie} °C</span>
                </div>
                <div className="flex justify-between items-center p-2 rounded bg-slate-800/50">
                  <span className="text-sm text-slate-300">Ultimul check</span>
                  <span className="text-sm text-slate-400">{selectedVehicle.data_ultima_verificare}</span>
                </div>
              </div>
            </div>
          )}

          {isEditing && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg flex flex-col flex-1 overflow-auto">
              <div className="flex justify-between items-center mb-5">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  {selectedId ? <Edit className="w-5 h-5 text-blue-500" /> : <Plus className="w-5 h-5 text-green-500" />}
                  {selectedId ? 'Editați Vehiculul' : 'Vehicul Nou'}
                </h3>
                <button onClick={handleCancelClick} className="text-slate-400 hover:text-white">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSave} className="flex flex-col gap-3 text-sm">
                <div>
                  <label className="block text-slate-400 text-xs mb-1">VIN Number</label>
                  <div className="flex gap-2">
                    <input required name="vin" value={formData.vin} onChange={handleChange} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200 focus:outline-none focus:border-blue-500" />
                    <button type="button" onClick={handleDecodeVIN} disabled={isDecodingVin} className="px-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded font-medium flex items-center gap-1 transition-colors disabled:opacity-50 whitespace-nowrap">
                        <Search className="w-4 h-4" />
                        {isDecodingVin ? 'Caută...' : 'Decodare'}
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1">Folosește API-ul NHTSA pentru a completa automat Marca și Anul.</p>
                </div>
                <div>
                  <label className="block text-slate-400 text-xs mb-1">Model Mașină</label>
                  <input required name="model_masina" value={formData.model_masina} onChange={handleChange} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200 focus:outline-none focus:border-blue-500" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 text-xs mb-1">An Fabricație</label>
                    <input required type="number" name="an_fabricatie" value={formData.an_fabricatie} onChange={handleChange} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200 focus:outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-xs mb-1">Kilometraj (km)</label>
                    <input required type="number" name="kilometraj" value={formData.kilometraj} onChange={handleChange} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200 focus:outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-xs mb-1">Nivel Baterie (%)</label>
                    <input required type="number" name="nivel_baterie" max={100} value={formData.nivel_baterie} onChange={handleChange} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200 focus:outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-xs mb-1">Autonomie Est.</label>
                    <input required type="number" name="autonomie_estimata_km" value={formData.autonomie_estimata_km} onChange={handleChange} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200 focus:outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-xs mb-1">Cicluri Încărcare</label>
                    <input required type="number" name="cicluri_incarcare" value={formData.cicluri_incarcare} onChange={handleChange} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200 focus:outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="block text-slate-400 text-xs mb-1">Sănătate Baterie (%)</label>
                    <input required type="number" name="sanatate_baterie" max={100} value={formData.sanatate_baterie} onChange={handleChange} className="w-full bg-slate-800 border border-slate-700 rounded p-2 text-slate-200 focus:outline-none focus:border-blue-500" />
                  </div>
                </div>

                <div className="mt-4 flex gap-2 pt-4 border-t border-slate-800">
                  <button type="button" onClick={handleCancelClick} className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-medium transition-colors">
                    Anulează
                  </button>
                  <button type="submit" className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded font-medium flex justify-center items-center gap-2 transition-colors">
                    <Save className="w-4 h-4" />
                    Salvează
                  </button>
                </div>
              </form>
            </div>
          )}

          {!selectedVehicle && !isEditing && (
            <div className="bg-slate-900/50 border border-slate-800 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center text-slate-500 flex-1">
              <CarFront className="w-12 h-12 mb-3 text-slate-700" />
              <p>Selectează un vehicul din flotă pentru a vizualiza datele telemetrice live și posibilele alerte.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
