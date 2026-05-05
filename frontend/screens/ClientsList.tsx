
import React, { useEffect, useRef, useState } from 'react';
import { api } from '../services/mockApi';
import { Client } from '../types';

const inputCls = 'w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold';
const labelCls = 'text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1';

interface DocUploadProps {
  label: string;
  hint?: string;
  preview: string | null;
  onFile: (file: File) => void;
  onClear: () => void;
  accent?: string;
}

const DocUpload: React.FC<DocUploadProps> = ({ label, hint, preview, onFile, onClear, accent = 'indigo' }) => {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className={`text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1`}>{label}</label>
        {hint && <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest mr-1">{hint}</span>}
      </div>
      <input ref={ref} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
      {preview ? (
        <div className="relative rounded-2xl overflow-hidden border border-slate-100 bg-slate-50">
          <img src={preview} alt="" className="w-full h-36 object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent flex items-end justify-between p-3">
            <span className="text-white text-[10px] font-black uppercase tracking-widest">Aperçu</span>
            <div className="flex gap-2">
              <button type="button" onClick={() => ref.current?.click()}
                className="px-3 py-1.5 bg-white/90 text-slate-700 rounded-xl text-[10px] font-black hover:bg-white transition-all">
                Remplacer
              </button>
              <button type="button" onClick={onClear}
                className="px-3 py-1.5 bg-rose-500 text-white rounded-xl text-[10px] font-black hover:bg-rose-600 transition-all">
                Supprimer
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => ref.current?.click()}
          className={`w-full h-28 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-2xl text-slate-400 hover:border-${accent}-400 hover:text-${accent}-500 transition-all`}>
          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="text-[10px] font-black uppercase tracking-widest">Scanner / Photographier</span>
        </button>
      )}
    </div>
  );
};

const ClientsList: React.FC = () => {
  const [clients, setClients] = useState<any[]>([]);
  const [filteredClients, setFilteredClients] = useState<any[]>([]);
  const [search, setSearch] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    idNumber: '',
    licenseNumber: '',
    licenseExpiry: '',
  });

  // Photo state
  const [cinRecto, setCinRecto] = useState<string | null>(null);
  const [cinVerso, setCinVerso] = useState<string | null>(null);
  const [licensePhoto, setLicensePhoto] = useState<string | null>(null);

  useEffect(() => { fetchClients(); }, []);

  useEffect(() => {
    const result = clients.filter(c =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.idNumber.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search)
    );
    setFilteredClients(result);
  }, [search, clients]);

  const fetchClients = async () => { setClients(await api.getClients()); };

  const toPreview = (file: File) => URL.createObjectURL(file);

  const handleOpenModal = (c?: Client) => {
    if (c) {
      setEditingClient(c);
      setFormData({ name: c.name, email: c.email, phone: c.phone, idNumber: c.idNumber, licenseNumber: c.licenseNumber, licenseExpiry: c.licenseExpiry });
    } else {
      setEditingClient(null);
      setFormData({ name: '', email: '', phone: '', idNumber: '', licenseNumber: '', licenseExpiry: '' });
    }
    setCinRecto(null); setCinVerso(null); setLicensePhoto(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingClient) {
      await api.updateClient(editingClient.id, formData);
    } else {
      await api.addClient(formData);
    }
    setIsModalOpen(false);
    fetchClients();
  };

  const handleDelete = async (id: number) => {
    if (window.confirm('Supprimer ce client ? Cela archivera ses données.')) {
      await api.deleteClient(id);
      fetchClients();
    }
  };

  const isLicenseExpired = (date: string) => date ? new Date(date) < new Date() : false;
  const isLicenseExpiringSoon = (date: string) => {
    if (!date) return false;
    const diff = new Date(date).getTime() - Date.now();
    const days = Math.ceil(diff / 86400000);
    return days > 0 && days <= 30;
  };

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500 pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Base Clients</h1>
          <p className="text-slate-500 font-medium">Gestion CRM et conformité des locataires.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <input type="text" placeholder="Nom, CIN ou Téléphone..."
              className="pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-2xl w-full md:w-80 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all font-medium text-sm"
              value={search} onChange={e => setSearch(e.target.value)} />
            <svg className="w-5 h-5 absolute left-4 top-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
          <button onClick={() => handleOpenModal()}
            className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-600/20 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" /></svg>
            Nouveau
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Clients</p>
          <p className="text-2xl font-black text-slate-900">{clients.length}</p>
        </div>
        <div className="bg-rose-50 p-6 rounded-3xl border border-rose-100 shadow-sm">
          <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest mb-1">Permis Expirés</p>
          <p className="text-2xl font-black text-rose-600">{clients.filter(c => isLicenseExpired(c.licenseExpiry)).length}</p>
        </div>
        <div className="bg-indigo-50 p-6 rounded-3xl border border-indigo-100 shadow-sm">
          <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1">Chiffre d'Affaires Fidélité</p>
          <p className="text-2xl font-black text-indigo-600">{clients.reduce((s, c) => s + (c.totalSpent || 0), 0).toLocaleString('fr-MA')} DH</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Locataire</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Identité (CIN)</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Validité Permis</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Fidélité</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredClients.map(client => {
              const expired = isLicenseExpired(client.licenseExpiry);
              const warning = isLicenseExpiringSoon(client.licenseExpiry);
              return (
                <tr key={client.id} className="hover:bg-slate-50/50 transition-all group">
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-black text-white shadow-lg ${client.rentalCount > 5 ? 'bg-indigo-600 shadow-indigo-100' : 'bg-slate-300'}`}>
                        {client.name[0]}
                      </div>
                      <div>
                        <p className="font-black text-slate-900 leading-tight">{client.name}</p>
                        <p className="text-xs text-slate-400 font-medium">{client.phone}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="space-y-1">
                      <p className="text-sm font-bold text-slate-700 font-mono tracking-tight">{client.idNumber}</p>
                      <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">{client.licenseNumber}</p>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl border ${expired ? 'bg-rose-50 border-rose-100 text-rose-600' : warning ? 'bg-amber-50 border-amber-100 text-amber-600' : 'bg-emerald-50 border-emerald-100 text-emerald-600'}`}>
                      <div className={`w-1.5 h-1.5 rounded-full ${expired ? 'bg-rose-600' : warning ? 'bg-amber-600' : 'bg-emerald-600'}`} />
                      <span className="text-[10px] font-black uppercase tracking-widest">
                        {client.licenseExpiry ? new Date(client.licenseExpiry).toLocaleDateString('fr-MA') : '—'}
                      </span>
                    </div>
                  </td>
                  <td className="px-8 py-6 text-center">
                    <p className="text-sm font-black text-slate-900">{client.rentalCount} loc.</p>
                    <p className="text-[10px] text-indigo-600 font-bold uppercase tracking-widest">{(client.totalSpent || 0).toLocaleString('fr-MA')} DH</p>
                  </td>
                  <td className="px-8 py-6 text-right space-x-2">
                    <button onClick={() => handleOpenModal(client)} className="p-3 bg-slate-100 text-slate-500 rounded-xl hover:bg-indigo-600 hover:text-white transition-all shadow-sm">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                    <button onClick={() => handleDelete(client.id)} className="p-3 bg-rose-50 text-rose-500 rounded-xl hover:bg-rose-600 hover:text-white transition-all shadow-sm">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-300 df-overlay-backdrop">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-2xl p-10 animate-in zoom-in-95 duration-200 overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-center mb-10">
              <div>
                <h2 className="text-3xl font-black text-slate-900 tracking-tight">{editingClient ? 'Modifier Locataire' : 'Nouveau Client'}</h2>
                <p className="text-slate-500 font-medium tracking-tight">Vérifiez scrupuleusement les pièces d'identité.</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-3 bg-slate-100 rounded-full text-slate-400 hover:text-slate-900 transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-8">
              {/* ── Infos personnelles ── */}
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className={labelCls}>Nom Complet</label>
                    <input required className={inputCls} value={formData.name} onChange={e => setFormData(f => ({ ...f, name: e.target.value }))} placeholder="ex: Ahmed Mansouri" />
                  </div>
                  <div className="space-y-2">
                    <label className={labelCls}>Téléphone</label>
                    <input required className={inputCls} value={formData.phone} onChange={e => setFormData(f => ({ ...f, phone: e.target.value }))} placeholder="06 XX XX XX XX" />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className={labelCls}>Email Professionnel</label>
                  <input type="email" required className={inputCls} value={formData.email} onChange={e => setFormData(f => ({ ...f, email: e.target.value }))} placeholder="locataire@exemple.ma" />
                </div>

                {/* ── Documents d'identité ── */}
                <div className="pt-6 border-t border-slate-100 space-y-6">
                  <h3 className="text-xs font-black text-indigo-500 uppercase tracking-[0.2em]">Documents d'Identité</h3>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <label className={labelCls}>N° CIN</label>
                      <input required className={`${inputCls} font-mono`} value={formData.idNumber} onChange={e => setFormData(f => ({ ...f, idNumber: e.target.value }))} placeholder="ex: BJ123456" />
                    </div>
                    <div className="space-y-2">
                      <label className={labelCls}>N° Permis</label>
                      <input required className={`${inputCls} font-mono`} value={formData.licenseNumber} onChange={e => setFormData(f => ({ ...f, licenseNumber: e.target.value }))} placeholder="01/23456" />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-rose-500 uppercase tracking-widest ml-1">Expiration Permis</label>
                      <input type="date" required className="w-full px-5 py-4 bg-rose-50 border border-rose-100 rounded-2xl outline-none font-bold text-rose-700" value={formData.licenseExpiry} onChange={e => setFormData(f => ({ ...f, licenseExpiry: e.target.value }))} />
                    </div>
                  </div>

                  {/* ── Scans Documents ── */}
                  <div className="rounded-2xl bg-indigo-50/60 border border-indigo-100 p-5 space-y-5">
                    <div className="flex items-center gap-2">
                      <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                      <p className="text-xs font-black text-indigo-700 uppercase tracking-widest">Scan IA — remplissage automatique des champs</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <DocUpload
                        label="CIN Recto"
                        hint="Scan auto"
                        preview={cinRecto}
                        onFile={f => setCinRecto(toPreview(f))}
                        onClear={() => setCinRecto(null)}
                      />
                      <DocUpload
                        label="CIN Verso"
                        preview={cinVerso}
                        onFile={f => setCinVerso(toPreview(f))}
                        onClear={() => setCinVerso(null)}
                      />
                      <DocUpload
                        label="Permis de Conduire"
                        hint="Scan auto"
                        preview={licensePhoto}
                        onFile={f => setLicensePhoto(toPreview(f))}
                        onClear={() => setLicensePhoto(null)}
                      />
                    </div>

                    <p className="text-[10px] text-indigo-500 font-semibold flex items-center gap-1">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>
                      L'IA extraira automatiquement : Prénom, Nom, CIN, Date de naissance, N° Permis, Expiration.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-5 text-slate-500 font-black uppercase text-xs tracking-widest hover:bg-slate-50 rounded-2xl transition-all">Annuler</button>
                <button type="submit" className="flex-1 py-5 bg-indigo-600 text-white font-black uppercase text-xs tracking-widest rounded-2xl shadow-2xl shadow-indigo-600/20 hover:scale-[1.02] active:scale-95 transition-all">
                  {editingClient ? 'Sauvegarder les modifications' : 'Enregistrer le locataire'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientsList;
