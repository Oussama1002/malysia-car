
import React, { useEffect, useState, useMemo } from 'react';
import { api } from '../services/mockApi';
import { Reservation, ReservationStatus, Client, Vehicle, VehicleStatus } from '../types';

const ReservationsList: React.FC = () => {
  const [reservations, setReservations] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<string>('ALL');
  const [isPrintMode, setIsPrintMode] = useState(false);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedRes, setSelectedRes] = useState<any>(null);
  
  const [clients, setClients] = useState<Client[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  
  const [formData, setFormData] = useState({
    clientId: '',
    vehicleId: '',
    startDate: '',
    endDate: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    const res = await api.getReservations();
    setReservations(res);
    const c = await api.getClients();
    setClients(c);
    const v = await api.getVehicles();
    setVehicles(v);
  };

  const filteredReservations = useMemo(() => {
    return reservations
      .filter(r => {
        const matchesSearch = 
          r.clientName.toLowerCase().includes(search.toLowerCase()) || 
          r.vehicleName.toLowerCase().includes(search.toLowerCase()) ||
          r.vehicleReg.toLowerCase().includes(search.toLowerCase()) ||
          `#D-FLOW-${r.id}`.includes(search);
        
        const matchesFilter = activeFilter === 'ALL' || r.status === activeFilter;
        return matchesSearch && matchesFilter;
      })
      .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
  }, [search, activeFilter, reservations]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = vehicles.find(v => v.id === parseInt(formData.vehicleId));
    if (!v) return;

    const start = new Date(formData.startDate);
    const end = new Date(formData.endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) || 1;
    const total = days * v.pricePerDay;

    await api.createReservation({
      clientId: parseInt(formData.clientId),
      vehicleId: parseInt(formData.vehicleId),
      startDate: formData.startDate,
      endDate: formData.endDate,
      totalPrice: total,
      status: ReservationStatus.PENDING
    });

    setIsModalOpen(false);
    fetchData();
  };

  const handleUpdateStatus = async (id: number, newStatus: ReservationStatus) => {
    await api.updateReservationStatus(id, newStatus);
    if (selectedRes && selectedRes.id === id) {
      setSelectedRes({ ...selectedRes, status: newStatus });
    }
    fetchData();
  };

  const handleDelete = async (id: number) => {
    if (window.confirm("Êtes-vous sûr de vouloir supprimer ce contrat ?")) {
      await api.deleteReservation(id);
      setIsDetailOpen(false);
      fetchData();
    }
  };

  const getStatusBadge = (status: ReservationStatus) => {
    const colors: Record<string, string> = {
      [ReservationStatus.PENDING]: 'bg-slate-100 text-slate-600 border-slate-200',
      [ReservationStatus.CONFIRMED]: 'bg-blue-50 text-blue-600 border-blue-100',
      [ReservationStatus.ONGOING]: 'bg-indigo-100 text-indigo-700 border-indigo-200',
      [ReservationStatus.COMPLETED]: 'bg-emerald-50 text-emerald-700 border-emerald-100',
      [ReservationStatus.CANCELLED]: 'bg-rose-50 text-rose-700 border-rose-100',
    };
    return colors[status];
  };

  const getStatusLabel = (status: ReservationStatus) => {
    const labels: Record<string, string> = {
      [ReservationStatus.PENDING]: 'En attente',
      [ReservationStatus.CONFIRMED]: 'Confirmé',
      [ReservationStatus.ONGOING]: 'En cours',
      [ReservationStatus.COMPLETED]: 'Terminé',
      [ReservationStatus.CANCELLED]: 'Annulé',
    };
    return labels[status];
  };

  const isOverdue = (res: any) => {
    return res.status === ReservationStatus.ONGOING && new Date(res.endDate) < new Date();
  };

  const calculateProgress = (start: string, end: string) => {
    const startDate = new Date(start).getTime();
    const endDate = new Date(end).getTime();
    const now = new Date().getTime();
    
    if (now < startDate) return 0;
    if (now > endDate) return 100;
    
    const total = endDate - startDate;
    const elapsed = now - startDate;
    return Math.round((elapsed / total) * 100);
  };

  if (isPrintMode && selectedRes) {
    return (
      <div className="min-h-screen bg-white p-12 text-slate-900 animate-in fade-in duration-500">
        <div className="max-w-4xl mx-auto border-2 border-slate-100 p-16 rounded-[2rem] shadow-sm">
          <div className="flex justify-between items-start mb-16">
            <div>
              <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-white text-3xl font-black mb-4">D</div>
              <h1 className="text-3xl font-black tracking-tight">DriveFlow Morocco</h1>
              <p className="text-slate-500 font-medium">Contrat de Location de Véhicule</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-black text-slate-400 uppercase tracking-widest">Référence Contrat</p>
              <p className="text-2xl font-mono font-bold">#DF-{selectedRes.id}-{new Date(selectedRes.createdAt).getFullYear()}</p>
              <p className="text-slate-400 mt-2">Émis le {new Date(selectedRes.createdAt).toLocaleDateString()}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-16 mb-16">
            <div className="space-y-4">
              <h3 className="text-xs font-black text-indigo-500 uppercase tracking-[0.2em] border-b border-indigo-100 pb-2">Locataire</h3>
              <p className="text-xl font-bold">{selectedRes.clientName}</p>
              <p className="text-slate-600">CIN: {selectedRes.clientIdNumber}</p>
              <p className="text-slate-600">Tél: {selectedRes.clientPhone}</p>
            </div>
            <div className="space-y-4">
              <h3 className="text-xs font-black text-indigo-500 uppercase tracking-[0.2em] border-b border-indigo-100 pb-2">Véhicule</h3>
              <p className="text-xl font-bold">{selectedRes.vehicleName}</p>
              <p className="text-slate-600 font-mono">Immatriculation: {selectedRes.vehicleReg}</p>
              <p className="text-slate-600">Tarif journalier: {selectedRes.vehiclePrice} DH</p>
            </div>
          </div>

          <div className="bg-slate-50 rounded-3xl p-8 mb-16 space-y-6">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Période et Conditions</h3>
            <div className="flex justify-between items-center text-lg font-bold">
              <span>Date de prise en charge</span>
              <span className="text-indigo-600">{new Date(selectedRes.startDate).toLocaleDateString('fr-MA')}</span>
            </div>
            <div className="flex justify-between items-center text-lg font-bold">
              <span>Date de restitution prévue</span>
              <span className="text-indigo-600">{new Date(selectedRes.endDate).toLocaleDateString('fr-MA')}</span>
            </div>
            <div className="border-t border-slate-200 pt-6 flex justify-between items-center">
              <span className="text-2xl font-black">Total à Régler</span>
              <span className="text-3xl font-black text-indigo-600">{selectedRes.totalPrice.toLocaleString('fr-MA')} DH</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-16 pt-16 border-t border-slate-100">
            <div className="text-center h-48 border-2 border-dashed border-slate-200 rounded-3xl flex items-center justify-center text-slate-300 font-bold uppercase text-xs tracking-widest">
              Signature de l'Agence
            </div>
            <div className="text-center h-48 border-2 border-dashed border-slate-200 rounded-3xl flex items-center justify-center text-slate-300 font-bold uppercase text-xs tracking-widest">
              Signature du Locataire
            </div>
          </div>

          <div className="mt-16 flex justify-center gap-4 no-print">
            <button onClick={() => window.print()} className="px-8 py-4 bg-indigo-600 text-white rounded-2xl font-bold shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all">Imprimer maintenant</button>
            <button onClick={() => setIsPrintMode(false)} className="px-8 py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold hover:bg-slate-200 transition-all">Retour à la gestion</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in slide-in-from-bottom-4 duration-500 pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Suivi des Contrats</h1>
          <p className="text-slate-500 font-medium">Gérez et archivez le cycle de vie de vos locations.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <input 
              type="text" 
              placeholder="Client, Immat, Contrat..." 
              className="pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-2xl w-full md:w-64 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all font-medium text-sm shadow-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <svg className="w-5 h-5 absolute left-4 top-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 flex items-center justify-center gap-2 whitespace-nowrap"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" /></svg>
            Nouveau Contrat
          </button>
        </div>
      </div>

      {/* Barre de Filtres */}
      <div className="flex overflow-x-auto gap-2 p-1 bg-slate-200/50 rounded-2xl w-fit">
        {['ALL', 'PENDING', 'ONGOING', 'COMPLETED', 'CANCELLED'].map((filter) => (
          <button
            key={filter}
            onClick={() => setActiveFilter(filter)}
            className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
              activeFilter === filter 
                ? 'bg-white text-indigo-600 shadow-sm' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {filter === 'ALL' ? 'Tous les contrats' : getStatusLabel(filter as any)}
          </button>
        ))}
      </div>

      {/* Liste des Contrats */}
      <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Réf / Client</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Véhicule</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">Période</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Montant</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Statut</th>
              <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredReservations.length > 0 ? filteredReservations.map((res) => {
              const overdue = isOverdue(res);
              return (
                <tr key={res.id} className={`hover:bg-slate-50/50 transition-colors group ${overdue ? 'bg-rose-50/30' : ''}`}>
                  <td className="px-8 py-6">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-mono font-bold text-slate-400">#DF-{res.id}</span>
                      <span className="font-bold text-slate-900">{res.clientName}</span>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-slate-800">{res.vehicleName}</span>
                      <span className="text-[10px] text-slate-400 font-bold uppercase tracking-tight">{res.vehicleReg}</span>
                    </div>
                  </td>
                  <td className="px-8 py-6 text-sm text-slate-600">
                    <div className="flex items-center gap-2 font-bold">
                      <span className="text-slate-400 text-[10px] uppercase">Du</span>
                      <span>{new Date(res.startDate).toLocaleDateString('fr-MA')}</span>
                      <span className="text-slate-400 text-[10px] uppercase">Au</span>
                      <span className={overdue ? 'text-rose-600 font-black' : ''}>{new Date(res.endDate).toLocaleDateString('fr-MA')}</span>
                    </div>
                  </td>
                  <td className="px-8 py-6 text-right">
                    <span className="text-lg font-black text-indigo-600">{res.totalPrice.toLocaleString('fr-MA')} DH</span>
                  </td>
                  <td className="px-8 py-6 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <span className={`px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border ${getStatusBadge(res.status)}`}>
                        {getStatusLabel(res.status)}
                      </span>
                      {overdue && <span className="text-[9px] font-black text-rose-500 uppercase animate-pulse">Retard retour</span>}
                    </div>
                  </td>
                  <td className="px-8 py-6 text-right space-x-2">
                    <button 
                      onClick={() => { setSelectedRes(res); setIsDetailOpen(true); }}
                      className="p-3 bg-slate-100 text-slate-600 rounded-xl hover:bg-indigo-600 hover:text-white transition-all shadow-sm"
                      title="Gérer le contrat"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                    </button>
                  </td>
                </tr>
              );
            }) : (
              <tr>
                <td colSpan={6} className="px-8 py-20 text-center">
                  <div className="flex flex-col items-center gap-2">
                    <svg className="w-12 h-12 text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.172 9.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <p className="text-slate-400 font-bold">Aucun contrat ne correspond à votre recherche.</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal : Nouveau Contrat */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-300">
          <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-2xl p-10 animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">Nouveau Contrat</h2>
                <p className="text-slate-500 font-medium">Associez un locataire à un véhicule disponible.</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-2 bg-slate-100 rounded-full text-slate-400 hover:text-slate-900 transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <form onSubmit={handleCreate} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Client (CIN)</label>
                  <select required className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 outline-none font-bold" value={formData.clientId} onChange={e => setFormData({...formData, clientId: e.target.value})}>
                    <option value="">Sélectionner un client</option>
                    {clients.map(c => <option key={c.id} value={c.id}>{c.name} ({c.idNumber})</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Véhicule</label>
                  <select required className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 outline-none font-bold" value={formData.vehicleId} onChange={e => setFormData({...formData, vehicleId: e.target.value})}>
                    <option value="">Véhicule disponible</option>
                    {vehicles.filter(v => v.status === VehicleStatus.AVAILABLE).map(v => (
                      <option key={v.id} value={v.id}>{v.brand} {v.model} - {v.pricePerDay} DH/j</option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Date Début</label>
                  <input type="date" required className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold" value={formData.startDate} onChange={e => setFormData({...formData, startDate: e.target.value})} />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Date Fin</label>
                  <input type="date" required className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold" value={formData.endDate} onChange={e => setFormData({...formData, endDate: e.target.value})} />
                </div>
              </div>

              {formData.startDate && formData.endDate && (
                <div className="p-6 bg-indigo-50 rounded-3xl border border-indigo-100 flex justify-between items-center">
                  <div>
                    <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Récapitulatif financier</p>
                    <p className="text-sm font-bold text-indigo-900">
                      {(() => {
                        const start = new Date(formData.startDate);
                        const end = new Date(formData.endDate);
                        const days = Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) || 1;
                        return `${days} jour(s) de location`;
                      })()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-black text-indigo-600">
                      {(() => {
                        const v = vehicles.find(v => v.id === parseInt(formData.vehicleId));
                        const start = new Date(formData.startDate);
                        const end = new Date(formData.endDate);
                        const days = Math.ceil(Math.abs(end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) || 1;
                        return v ? (days * v.pricePerDay).toLocaleString('fr-MA') : '0';
                      })()} DH
                    </p>
                  </div>
                </div>
              )}

              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-4 text-slate-500 font-black uppercase text-xs tracking-widest hover:bg-slate-50 rounded-2xl transition-all">Annuler</button>
                <button type="submit" className="flex-1 py-4 bg-indigo-600 text-white font-black uppercase text-xs tracking-widest rounded-2xl shadow-2xl shadow-indigo-600/20 hover:scale-[1.02] active:scale-95 transition-all">Générer le contrat</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal : Dossier du Contrat (Détails) */}
      {isDetailOpen && selectedRes && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-2xl overflow-hidden animate-in slide-in-from-bottom-10 duration-500">
            {/* Header Detail */}
            <div className={`p-10 relative text-white ${isOverdue(selectedRes) ? 'bg-rose-900' : 'bg-slate-900'}`}>
              <button onClick={() => setIsDetailOpen(false)} className="absolute top-8 right-8 text-white/50 hover:text-white transition-colors">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
              <div className="flex items-center gap-4 mb-4">
                <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border border-white/20 ${getStatusBadge(selectedRes.status)}`}>
                  {getStatusLabel(selectedRes.status)}
                </span>
                <span className="text-white/40 font-mono text-xs uppercase tracking-widest font-black">Dossier #DF-{selectedRes.id}</span>
              </div>
              <h2 className="text-4xl font-black tracking-tight">{selectedRes.clientName}</h2>
              <p className="text-white/60 font-medium mt-1 uppercase text-xs tracking-[0.2em] font-black">{selectedRes.vehicleName} • {selectedRes.vehicleReg}</p>
              
              {selectedRes.status === ReservationStatus.ONGOING && (
                <div className="mt-8 space-y-2">
                  <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-white/50">
                    <span>Progression du séjour</span>
                    <span>{calculateProgress(selectedRes.startDate, selectedRes.endDate)}%</span>
                  </div>
                  <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-1000 ${isOverdue(selectedRes) ? 'bg-rose-500' : 'bg-indigo-400'}`} 
                      style={{ width: `${calculateProgress(selectedRes.startDate, selectedRes.endDate)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Content Detail */}
            <div className="p-10 space-y-8 max-h-[60vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-10">
                <div className="space-y-4">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Locataire</p>
                  <div className="space-y-2">
                    <p className="flex justify-between font-bold text-slate-800"><span>CIN :</span> <span className="font-mono text-xs">{selectedRes.clientIdNumber}</span></p>
                    <p className="flex justify-between font-bold text-slate-800"><span>Tél :</span> <span className="text-sm">{selectedRes.clientPhone}</span></p>
                  </div>
                </div>
                <div className="space-y-4">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Véhicule</p>
                  <div className="space-y-2">
                    <p className="flex justify-between font-bold text-slate-800"><span>Réf :</span> <span className="font-mono text-xs">{selectedRes.vehicleReg}</span></p>
                    <p className="flex justify-between font-bold text-slate-800"><span>Tarif :</span> <span className="text-sm">{selectedRes.vehiclePrice} DH/j</span></p>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 p-8 rounded-[2rem] border border-slate-100 flex justify-between items-center">
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Calendrier</p>
                  <p className="text-lg font-black text-slate-900 leading-tight">
                    Du {new Date(selectedRes.startDate).toLocaleDateString()} <br/>
                    Au {new Date(selectedRes.endDate).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Total du contrat</p>
                  <p className="text-3xl font-black text-indigo-600">{selectedRes.totalPrice.toLocaleString('fr-MA')} DH</p>
                </div>
              </div>

              {/* Actions de Statut */}
              <div className="space-y-4">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Gestion opérationnelle</p>
                <div className="grid grid-cols-2 gap-3">
                  {selectedRes.status === ReservationStatus.PENDING && (
                    <button onClick={() => handleUpdateStatus(selectedRes.id, ReservationStatus.ONGOING)} className="col-span-2 py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-indigo-600/20 hover:scale-[1.02] transition-all">Démarrer la location (Clés)</button>
                  )}
                  {selectedRes.status === ReservationStatus.ONGOING && (
                    <button onClick={() => handleUpdateStatus(selectedRes.id, ReservationStatus.COMPLETED)} className="col-span-2 py-4 bg-emerald-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-emerald-600/20 hover:scale-[1.02] transition-all">Réceptionner le véhicule (Retour)</button>
                  )}
                  
                  <button onClick={() => setIsPrintMode(true)} className="py-4 bg-slate-100 text-slate-600 rounded-2xl font-black text-xs uppercase tracking-widest border border-slate-200 hover:bg-slate-200 transition-all flex items-center justify-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                    Imprimer Contrat
                  </button>

                  {(selectedRes.status === ReservationStatus.PENDING || selectedRes.status === ReservationStatus.CONFIRMED) && (
                    <button onClick={() => handleUpdateStatus(selectedRes.id, ReservationStatus.CANCELLED)} className="py-4 bg-rose-50 text-rose-600 rounded-2xl font-black text-xs uppercase tracking-widest border border-rose-100 hover:bg-rose-100 transition-all">Annuler</button>
                  )}
                  
                  {(selectedRes.status === ReservationStatus.CANCELLED || selectedRes.status === ReservationStatus.COMPLETED) && (
                    <button onClick={() => handleDelete(selectedRes.id)} className="col-span-2 py-4 bg-rose-50 text-rose-500 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-rose-600 hover:text-white transition-all">Archiver le dossier</button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReservationsList;
