
import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/mockApi';
import { apiClient, getApiBase } from '@/services/apiClient';
import { Vehicle, VehicleStatus } from '../types';

interface VehicleModelOption { id: string; name: string; }
interface VehicleBrandOption { id: string; name: string; models: VehicleModelOption[]; }

const PLATE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWY'.split('');
const PLATE_REGIONS = Array.from({ length: 99 }, (_, i) => i + 1);
const FUEL_OPTIONS = ['Diesel', 'Essence', 'Hybride', 'Électrique', 'GPL'];
const GAMME_OPTIONS = ['CLASS', 'SPORT', 'MINI', 'UTL', 'AUTO MINI', 'SPORT 4x4', 'V.Citadines', 'V.Berlines', 'V.Compactes', 'V. 4x4', 'V.Luxe'];
const CATEGORIE_OPTIONS = ['Particulier', 'Utilitaire', 'Commercial', 'Tourisme', 'Moto'];
const VEHICLE_TYPE_OPTIONS = ['Berline', 'SUV', 'Citadine', 'Break', 'Coupé', 'Cabriolet', 'Monospace', 'Pick-up', 'Van', 'Camion'];

const DocPhotoUpload: React.FC<{
  preview: string | null;
  onFile: (f: File) => void;
  onClear: () => void;
}> = ({ preview, onFile, onClear }) => {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <input ref={ref} type="file" accept="image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); }} />
      {preview ? (
        <div className="relative rounded-xl overflow-hidden border border-slate-100 group mt-1">
          <img src={preview} alt="doc" className="w-full h-20 object-cover" />
          <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 bg-black/40 transition-opacity">
            <button type="button" onClick={() => ref.current?.click()}
              className="px-2 py-1 bg-white text-slate-700 rounded-lg text-[10px] font-black">Changer</button>
            <button type="button" onClick={onClear}
              className="px-2 py-1 bg-rose-500 text-white rounded-lg text-[10px] font-black">✕</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => ref.current?.click()}
          className="mt-1 w-full flex items-center justify-center gap-2 py-2.5 border border-dashed border-slate-200 rounded-xl text-slate-400 hover:border-rose-300 hover:text-rose-400 transition-all text-[10px] font-black uppercase tracking-widest">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Photo du doc.
        </button>
      )}
    </div>
  );
};

function parsePlate(reg: string) {
  const m = reg.match(/^(\d+)-([A-Z])-(\d+)$/);
  if (m) return { platNum: m[1], platLetter: m[2], platRegion: Number(m[3]) };
  return { platNum: reg, platLetter: 'A', platRegion: 1 };
}

const emptyForm = () => ({
  brand_id: null as string | null,
  model_id: null as string | null,
  brand: '',
  model: '',
  year: new Date().getFullYear(),
  platNum: '',
  platLetter: 'A',
  platRegion: 1,
  registration: '',
  registrationCard: '',
  insuranceExpiry: '',
  techControlExpiry: '',
  vignetteExpiry: '',
  status: VehicleStatus.AVAILABLE,
  pricePerDay: 0,
  cv: '' as string | number,
  mileageKm: '' as string | number,
  fuel: 'Diesel',
  // new fields
  vehicleType: '',
  numeroPolice: '',
  nombreCylindres: '' as string | number,
  gamme: '',
  acquisitionDate: '',
  miseEnCirculation: '',
  dateImmatriculation: '',
  categorie: '',
  chassis: '',
  immatOnline: '',
  montant: '' as string | number,
  // document photo previews
  docPhotos: {
    carteGrise: null as string | null,
    assurance: null as string | null,
    visiteTech: null as string | null,
    vignette: null as string | null,
  },
  photoPreviews: [] as string[],
  videoPreview: '' as string,
  photoUrl: null as string | null,
});

type FormState = ReturnType<typeof emptyForm>;

const VehiclesList: React.FC = () => {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [filteredVehicles, setFilteredVehicles] = useState<Vehicle[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<'ALL' | 'AVAILABLE' | 'RENTED' | 'MAINTENANCE'>('ALL');

  const [brands, setBrands] = useState<VehicleBrandOption[]>([]);
  const [newBrandName, setNewBrandName] = useState('');
  const [newModelName, setNewModelName] = useState('');
  const [addingBrand, setAddingBrand] = useState(false);
  const [addingModel, setAddingModel] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [formData, setFormData] = useState<FormState>(emptyForm());
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');

  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const selectedPhotoFiles = useRef<File[]>([]);

  useEffect(() => {
    fetchVehicles();
    if (getApiBase()) {
      apiClient<{ data: VehicleBrandOption[] }>('/v1/vehicle-brands')
        .then(res => setBrands(res.data))
        .catch(() => setBrands([]));
    }
  }, []);

  useEffect(() => {
    let result = vehicles;
    if (search) {
      result = result.filter(v =>
        v.registration.toLowerCase().includes(search.toLowerCase()) ||
        v.brand.toLowerCase().includes(search.toLowerCase()) ||
        v.model.toLowerCase().includes(search.toLowerCase())
      );
    }
    if (activeTab !== 'ALL') {
      result = result.filter(v => v.status === activeTab);
    }
    setFilteredVehicles(result);
  }, [search, activeTab, vehicles]);

  const fetchVehicles = async () => {
    if (getApiBase()) {
      try {
        const res = await apiClient<{ data: any[] }>('/v1/vehicles?per_page=200');
        setLoadError(null);
        setVehicles(res.data.map((v: any): Vehicle => ({
          id: v.id,
          brand_id: v.brand_id ?? null,
          model_id: v.model_id ?? null,
          brand: v.brand ?? '',
          model: v.model ?? '',
          year: v.year ?? new Date().getFullYear(),
          registration: v.registration ?? '',
          registrationCard: v.registrationCard ?? '',
          insuranceExpiry: v.insuranceExpiry ?? '',
          techControlExpiry: v.techControlExpiry ?? '',
          vignetteExpiry: v.vignetteExpiry ?? '',
          status: (v.status ?? 'AVAILABLE') as VehicleStatus,
          pricePerDay: v.pricePerDay ?? 0,
          photoUrl: v.photoUrl ?? null,
          ...(v as any),
        })));
        return;
      } catch (err: any) {
        setVehicles([]);
        setLoadError(err?.message ?? 'Impossible de charger les véhicules depuis le backend.');
        return;
      }
    }
    const data = await api.getVehicles();
    setLoadError(null);
    setVehicles(data);
  };

  const handleOpenModal = (v?: Vehicle) => {
    if (v) {
      setEditingVehicle(v);
      const matchedBrand = brands.find(b => b.name === v.brand);
      const matchedModel = matchedBrand?.models.find(m => m.name === v.model);
      const plate = parsePlate(v.registration);
      setFormData({
        ...emptyForm(),
        ...v,
        brand_id: v.brand_id ?? matchedBrand?.id ?? null,
        model_id: v.model_id ?? matchedModel?.id ?? null,
        platNum: plate.platNum,
        platLetter: plate.platLetter,
        platRegion: plate.platRegion,
        cv: (v as any).cv ?? '',
        mileageKm: (v as any).mileageKm ?? '',
        fuel: (v as any).fuel ?? 'Diesel',
        vehicleType: (v as any).vehicleType ?? '',
        numeroPolice: (v as any).numeroPolice ?? '',
        nombreCylindres: (v as any).nombreCylindres ?? '',
        gamme: (v as any).gamme ?? '',
        acquisitionDate: (v as any).acquisitionDate ?? '',
        miseEnCirculation: (v as any).miseEnCirculation ?? '',
        dateImmatriculation: (v as any).dateImmatriculation ?? '',
        categorie: (v as any).categorie ?? '',
        chassis: (v as any).chassisNumber ?? '',
        immatOnline: (v as any).immatOnline ?? '',
        montant: (v as any).purchaseCostMad ?? '',
        docPhotos: emptyForm().docPhotos,
        photoPreviews: [],
        videoPreview: '',
      });
    } else {
      setEditingVehicle(null);
      setFormData(emptyForm());
    }
    selectedPhotoFiles.current = [];
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const registration = `${formData.platNum}-${formData.platLetter}-${formData.platRegion}`;
    if (getApiBase()) {
      const body: Record<string, unknown> = {
        registration,
        year: formData.year,
        fuel_type: formData.fuel,
        fiscal_power: formData.cv !== '' ? Number(formData.cv) : undefined,
        mileage_km: formData.mileageKm !== '' ? Number(formData.mileageKm) : undefined,
        registration_card_number: formData.registrationCard || undefined,
        insurance_expiry: formData.insuranceExpiry || undefined,
        tech_control_expiry: formData.techControlExpiry || undefined,
        vignette_expiry: formData.vignetteExpiry || undefined,
        daily_rental_price: formData.pricePerDay || undefined,
        status: formData.status,
        vehicle_type: formData.vehicleType || undefined,
        numero_police: formData.numeroPolice || undefined,
        nombre_cylindres: formData.nombreCylindres !== '' ? Number(formData.nombreCylindres) : undefined,
        gamme: formData.gamme || undefined,
        acquisition_date: formData.acquisitionDate || undefined,
        mise_en_circulation: formData.miseEnCirculation || undefined,
        date_immatriculation: formData.dateImmatriculation || undefined,
        categorie: formData.categorie || undefined,
        chassis: formData.chassis || undefined,
        immat_online: formData.immatOnline || undefined,
        purchase_price: formData.montant !== '' ? Number(formData.montant) : undefined,
      };
      if (formData.brand_id) body.brand_id = formData.brand_id;
      if (formData.model_id) body.model_id = formData.model_id;
      try {
        let vehicleId: string;
        if (editingVehicle) {
          await apiClient(`/v1/vehicles/${editingVehicle.id}`, { method: 'PUT', body: JSON.stringify(body) });
          vehicleId = String(editingVehicle.id);
        } else {
          const res = await apiClient<{ data: { id: string } }>('/v1/vehicles', { method: 'POST', body: JSON.stringify(body) });
          vehicleId = (res as any).data?.id ?? '';
        }
        // Upload main photo if selected
        if (selectedPhotoFiles.current.length > 0 && vehicleId) {
          const fd = new FormData();
          fd.append('photo', selectedPhotoFiles.current[0]);
          const token = JSON.parse(localStorage.getItem('df_session') ?? '{}').token ?? '';
          const photoRes = await fetch(`${getApiBase()}/v1/vehicles/${vehicleId}/photo`, {
            method: 'POST',
            headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
            body: fd,
          });
          if (!photoRes.ok) {
            const err = await photoRes.json().catch(() => ({}));
            throw new Error((err as any)?.message ?? `Photo upload failed (${photoRes.status})`);
          }
          selectedPhotoFiles.current = [];
        }
        setIsModalOpen(false);
        fetchVehicles();
        return;
      } catch (err: any) {
        alert(err?.message ?? 'Erreur lors de la sauvegarde');
        return;
      }
    }
    // fallback mock
    const payload = { ...formData, registration };
    if (editingVehicle) {
      await api.updateVehicle(editingVehicle.id as number, payload);
    } else {
      await api.addVehicle(payload);
    }
    setIsModalOpen(false);
    fetchVehicles();
  };

  const handleAddBrand = async () => {
    const name = newBrandName.trim();
    if (!name) return;
    if (!getApiBase()) return;
    try {
      const res = await apiClient<{ data: { id: string; name: string } }>('/v1/vehicle-brands', {
        method: 'POST',
        body: JSON.stringify({ name }),
      });
      const created = res.data;
      setBrands((prev) => {
        const exists = prev.some((b) => b.id === created.id);
        const next = exists ? prev : [...prev, { id: created.id, name: created.name, models: [] }];
        return [...next].sort((a, b) => a.name.localeCompare(b.name));
      });
      setFormData((fd) => ({ ...fd, brand_id: created.id, brand: created.name, model_id: null, model: '' }));
      setNewBrandName('');
      setAddingBrand(false);
    } catch (err: any) {
      alert(err?.message ?? "Impossible d'ajouter la marque");
    }
  };

  const handleAddModel = async () => {
    const name = newModelName.trim();
    const brandId = formData.brand_id;
    if (!name || !brandId) return;
    if (!getApiBase()) return;
    try {
      const res = await apiClient<{ data: { id: string; name: string; brand_id: string } }>('/v1/vehicle-models', {
        method: 'POST',
        body: JSON.stringify({ name, brand_id: brandId }),
      });
      const created = res.data;
      setBrands((prev) =>
        prev.map((b) =>
          b.id !== brandId
            ? b
            : {
                ...b,
                models: [...b.models, { id: created.id, name: created.name }].sort((m1, m2) =>
                  m1.name.localeCompare(m2.name),
                ),
              },
        ),
      );
      setFormData((fd) => ({ ...fd, model_id: created.id, model: created.name }));
      setNewModelName('');
      setAddingModel(false);
    } catch (err: any) {
      alert(err?.message ?? "Impossible d'ajouter le modèle");
    }
  };

  const handleDelete = async (id: number | string) => {
    if (!window.confirm('Supprimer définitivement ce véhicule du parc ?')) return;
    if (getApiBase()) {
      try {
        await apiClient(`/v1/vehicles/${id}`, { method: 'DELETE' });
        fetchVehicles();
        return;
      } catch (err: any) { alert(err?.message ?? 'Erreur'); return; }
    }
    await api.deleteVehicle(id as number);
    fetchVehicles();
  };

  const handleDocPhoto = (key: keyof FormState['docPhotos'], file: File) => {
    const url = URL.createObjectURL(file);
    setFormData(fd => ({ ...fd, docPhotos: { ...fd.docPhotos, [key]: url } }));
  };

  const handlePhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    selectedPhotoFiles.current = [...selectedPhotoFiles.current, ...files];
    const previews = files.map((f: File) => URL.createObjectURL(f));
    setFormData(fd => ({ ...fd, photoPreviews: [...fd.photoPreviews, ...previews] }));
  };

  const handleVideo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setFormData(fd => ({ ...fd, videoPreview: url }));
  };

  const getStatusColor = (status: VehicleStatus) => {
    switch (status) {
      case VehicleStatus.AVAILABLE: return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      case VehicleStatus.RENTED: return 'bg-amber-100 text-amber-700 border-amber-200';
      case VehicleStatus.MAINTENANCE: return 'bg-rose-100 text-rose-700 border-rose-200';
    }
  };

  const isExpired = (date: string) => date ? new Date(date) < new Date() : false;
  const isExpiringSoon = (date: string) => {
    if (!date) return false;
    const diff = new Date(date).getTime() - Date.now();
    const days = Math.ceil(diff / 86400000);
    return days > 0 && days <= 15;
  };

  const alerts = vehicles.filter(v =>
    isExpired(v.insuranceExpiry) || isExpired(v.techControlExpiry) || isExpired(v.vignetteExpiry) ||
    isExpiringSoon(v.insuranceExpiry) || isExpiringSoon(v.techControlExpiry) || isExpiringSoon(v.vignetteExpiry)
  );

  const downloadParcPDF = () => {
    const rows = filteredVehicles.map(v => [
      v.registration,
      (v as any).immatOnline || '—',
      v.brand || '—',
      v.model || '—',
      (v as any).miseEnCirculation ? new Date((v as any).miseEnCirculation).toLocaleDateString('fr-MA') : '—',
      (v as any).cv ?? '—',
      (v as any).fuel || '—',
      v.status === 'AVAILABLE' ? 'Disponible' : v.status === 'RENTED' ? 'Louée' : 'Maintenance',
    ]);

    const tableRows = rows.map(r =>
      `<tr>${r.map((cell, i) => `<td style="padding:7px 12px;border-bottom:1px solid #e2e8f0;font-family:monospace;${i === 0 ? 'font-weight:700;' : ''}${i === 7 ? 'color:#4f46e5;font-weight:700;' : ''}">${cell}</td>`).join('')}</tr>`
    ).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Parc Automobile — DriveFlow</title>
<style>
  body{margin:0;padding:24px;font-family:Arial,sans-serif;font-size:12px;color:#1e293b}
  h1{font-size:18px;font-weight:900;margin:0 0 4px}
  p{margin:0 0 16px;color:#64748b;font-size:11px}
  table{width:100%;border-collapse:collapse}
  thead tr{background:#f8fafc;border-bottom:2px solid #e2e8f0}
  th{padding:8px 12px;text-align:left;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8}
  tr:last-child td{border-bottom:none}
  @media print{body{padding:12px}@page{margin:15mm}}
</style></head><body>
<h1>Parc Automobile</h1>
<p>DriveFlow — Édité le ${new Date().toLocaleDateString('fr-MA', { day:'2-digit', month:'long', year:'numeric' })} · ${rows.length} véhicule${rows.length !== 1 ? 's' : ''}</p>
<table>
  <thead><tr>
    <th>Immatriculation</th><th>Immat. www</th><th>Marque</th><th>Modèle</th>
    <th>Mise en circulation</th><th>Puissance (CV)</th><th>Carburant</th><th>Statut</th>
  </tr></thead>
  <tbody>${tableRows}</tbody>
</table>
<script>window.onload=function(){window.print();}<\/script>
</body></html>`;

    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); }
  };

  const inputCls = 'w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-bold';
  const selectCls = inputCls;
  const labelCls = 'text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1';
  const totalVehicles = vehicles.length;
  const availableVehicles = vehicles.filter((v: any) => {
    const status = String(v.status ?? '').toUpperCase();
    const availability = String(v.availability_status ?? '').toLowerCase();
    return status === 'AVAILABLE' || availability === 'available';
  }).length;
  const rentedVehicles = vehicles.filter((v: any) => {
    const status = String(v.status ?? '').toUpperCase();
    return status === 'RENTED' || status === 'UNDER_LOA' || status === 'UNDER_CREDIT';
  }).length;
  const maintenanceVehicles = vehicles.filter((v: any) => {
    const status = String(v.status ?? '').toUpperCase();
    const physical = String(v.physical_status ?? '').toLowerCase();
    const availability = String(v.availability_status ?? '').toLowerCase();
    return status === 'MAINTENANCE' || physical === 'maintenance' || availability === 'maintenance';
  }).length;
  const repairVehicles = vehicles.filter((v: any) => {
    const status = String(v.status ?? '').toUpperCase();
    const physical = String(v.physical_status ?? '').toLowerCase();
    return status === 'IN_REPAIR' || physical === 'repair';
  }).length;
  const accidentVehicles = vehicles.filter((v: any) => {
    const physical = String(v.physical_status ?? '').toLowerCase();
    return physical === 'accident';
  }).length;
  const unavailableVehicles = vehicles.filter((v: any) => {
    const status = String(v.status ?? '').toUpperCase();
    const availability = String(v.availability_status ?? '').toLowerCase();
    const physical = String(v.physical_status ?? '').toLowerCase();
    return ['BLOCKED', 'UNAVAILABLE', 'SOLD', 'SCRAPPED'].includes(status)
      || ['unavailable', 'immobilized', 'repair', 'maintenance', 'accident'].includes(availability)
      || ['immobilized', 'repair', 'maintenance', 'accident'].includes(physical);
  }).length;
  const utilizationPct = totalVehicles > 0 ? Math.round((rentedVehicles / totalVehicles) * 100) : 0;

  return (
    <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500 pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Parc Automobile</h1>
          <p className="text-slate-500 font-medium">Suivi temps réel de la flotte et conformité.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative group">
            <input type="text" placeholder="Rechercher (Immat, Modèle...)"
              className="pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-2xl w-full md:w-64 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all font-medium text-sm"
              value={search} onChange={e => setSearch(e.target.value)} />
            <svg className="w-5 h-5 absolute left-4 top-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
          {/* PDF download */}
          <button onClick={downloadParcPDF}
            className="flex items-center gap-2 px-4 py-2.5 bg-rose-600 text-white rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-rose-700 transition-all shadow-lg shadow-rose-600/20 whitespace-nowrap">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            PDF
          </button>

          {/* View toggle */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-2xl">
            <button onClick={() => setViewMode('cards')}
              className={`p-2.5 rounded-xl transition-all ${viewMode === 'cards' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
              title="Vue cartes">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
            </button>
            <button onClick={() => setViewMode('table')}
              className={`p-2.5 rounded-xl transition-all ${viewMode === 'table' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-400 hover:text-slate-600'}`}
              title="Vue liste">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
            </button>
          </div>
          <button onClick={() => handleOpenModal()}
            className="bg-indigo-600 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-600/20 flex items-center gap-2 whitespace-nowrap">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" /></svg>
            Ajouter
          </button>
        </div>
      </div>

      {loadError && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {loadError}
        </div>
      )}

      {/* Fleet analysis KPIs on main fleet page */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8">
        {[
          ['Total', totalVehicles],
          ['Disponibles', availableVehicles],
          ['En location', rentedVehicles],
          ['Maintenance', maintenanceVehicles],
          ['Réparation', repairVehicles],
          ['Sinistre', accidentVehicles],
          ['Indisponibles', unavailableVehicles],
          ['Utilisation %', utilizationPct],
        ].map(([label, val]) => (
          <div key={String(label)} className="rounded-2xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
            <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">{String(label)}</div>
            <div className="mt-1 text-xl font-black text-slate-900">{Number(val).toLocaleString('fr-MA')}</div>
          </div>
        ))}
      </div>

      {/* Compliance alerts */}
      {alerts.length > 0 && (
        <div className="bg-rose-50 border border-rose-100 rounded-[2rem] p-6 animate-in fade-in zoom-in-95">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-rose-100 text-rose-600 rounded-xl flex items-center justify-center animate-pulse">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
            </div>
            <div>
              <h2 className="text-lg font-black text-rose-900 tracking-tight">Alertes de Conformité</h2>
              <p className="text-xs text-rose-700 font-bold uppercase tracking-widest opacity-70">Action requise sur {alerts.length} véhicule(s)</p>
            </div>
          </div>
          <div className="flex overflow-x-auto gap-4 pb-2">
            {alerts.map(v => (
              <div key={v.id} className="min-w-[240px] bg-white p-4 rounded-2xl border border-rose-200 shadow-sm flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 bg-slate-100">
                  {(v as any).photoUrl
                    ? <img src={(v as any).photoUrl} className="w-full h-full object-cover" alt="" />
                    : <div className="w-full h-full flex items-center justify-center text-slate-400"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M4 14v4h3m13-4v4h-3M4 14l1.8-5.2A2 2 0 0 1 7.7 7.4h8.6a2 2 0 0 1 1.9 1.4L20 14M4 14h16" /></svg></div>
                  }
                </div>
                <div>
                  <p className="text-xs font-black text-slate-800">{v.brand} {v.model}</p>
                  <p className="text-[10px] font-bold text-rose-500 uppercase tracking-tighter">{v.registration}</p>
                </div>
                <button onClick={() => handleOpenModal(v)} className="ml-auto p-2 text-rose-400 hover:text-rose-600 transition-colors">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 p-1 bg-slate-200/50 rounded-2xl w-fit">
        {(['ALL', 'AVAILABLE', 'RENTED', 'MAINTENANCE'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {tab === 'ALL' ? 'Tous' : tab === 'AVAILABLE' ? 'Dispos' : tab === 'RENTED' ? 'Loués' : 'Maintenance'}
          </button>
        ))}
      </div>

      {/* Table view */}
      {viewMode === 'table' && (
        <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                {['Immatriculation', 'Immat. www', 'Marque', 'Modèle', 'Mise en circulation', 'Puissance (CV)', 'Carburant', 'Statut', ''].map(h => (
                  <th key={h} className="px-5 py-4 text-left text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredVehicles.length === 0 && (
                <tr><td colSpan={9} className="px-5 py-10 text-center text-slate-400 font-medium">Aucun véhicule</td></tr>
              )}
              {filteredVehicles.map((v, idx) => (
                <tr key={v.id} className={`border-b border-slate-50 hover:bg-slate-50 transition-colors ${idx % 2 === 0 ? '' : 'bg-slate-50/40'}`}>
                  <td className="px-5 py-3 font-mono font-black text-slate-800 whitespace-nowrap">{v.registration}</td>
                  <td className="px-5 py-3 text-slate-600 whitespace-nowrap">{(v as any).immatOnline || '—'}</td>
                  <td className="px-5 py-3 font-semibold text-slate-800 whitespace-nowrap">{v.brand || '—'}</td>
                  <td className="px-5 py-3 text-slate-600 whitespace-nowrap">{v.model || '—'}</td>
                  <td className="px-5 py-3 text-slate-600 whitespace-nowrap">
                    {(v as any).miseEnCirculation ? new Date((v as any).miseEnCirculation).toLocaleDateString('fr-MA') : '—'}
                  </td>
                  <td className="px-5 py-3 text-slate-600 text-center whitespace-nowrap">{(v as any).cv ?? '—'}</td>
                  <td className="px-5 py-3 text-slate-600 whitespace-nowrap">{(v as any).fuel || '—'}</td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    <span className={`px-3 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider border ${getStatusColor(v.status)}`}>
                      {v.status === 'AVAILABLE' ? 'Disponible' : v.status === 'RENTED' ? 'Louée' : 'Maintenance'}
                    </span>
                  </td>
                  <td className="px-5 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      <Link to={`/fleet/${v.id}`} className="px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-indigo-100 transition-all">Fiche</Link>
                      <button onClick={() => handleOpenModal(v)} className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-slate-200 transition-all">Éditer</button>
                      <button onClick={() => handleDelete(v.id)} className="p-1.5 bg-rose-50 text-rose-500 rounded-xl hover:bg-rose-500 hover:text-white transition-all">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Grid */}
      {viewMode === 'cards' && <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
        {filteredVehicles.map(v => (
          <div key={v.id} className="bg-white rounded-[2.5rem] overflow-hidden shadow-sm border border-slate-200/60 group hover:shadow-2xl hover:shadow-indigo-500/10 transition-all duration-500 flex flex-col">
            <div className="relative h-64 overflow-hidden">
              {(v as any).photoUrl
                ? <img src={(v as any).photoUrl} alt={v.model} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                : <div className="w-full h-full bg-gradient-to-br from-slate-100 to-slate-200 flex flex-col items-center justify-center gap-2 group-hover:from-indigo-50 group-hover:to-slate-100 transition-all duration-700">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" className="w-16 h-16 text-slate-300"><path strokeLinecap="round" strokeLinejoin="round" d="M4 14v4h3m13-4v4h-3M4 14l1.8-5.2A2 2 0 0 1 7.7 7.4h8.6a2 2 0 0 1 1.9 1.4L20 14M4 14h16M7.5 17.5h.01m9 0h.01" /></svg>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-300">Pas de photo</span>
                  </div>
              }
              <div className="absolute top-6 right-6">
                <span className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest border shadow-lg ${getStatusColor(v.status)}`}>
                  {v.status === 'AVAILABLE' ? 'Disponible' : v.status === 'RENTED' ? 'Louée' : 'Maintenance'}
                </span>
              </div>
              <div className="absolute bottom-6 left-6 bg-white/90 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/50 shadow-lg">
                <p className="text-xs font-black text-slate-900 tracking-tighter font-mono">{v.registration}</p>
              </div>
            </div>
            <div className="p-8 space-y-6 flex-1 flex flex-col">
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight">{v.brand} {v.model}</h3>
                  <p className="text-sm text-slate-400 font-bold uppercase tracking-widest">{v.year} · {(v as any).fuel ?? ''}</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-black text-indigo-600 leading-none">{v.pricePerDay} DH</p>
                  <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">/ jour</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Assurance', date: v.insuranceExpiry },
                  { label: 'Visite Tech', date: v.techControlExpiry },
                  { label: 'Vignette', date: v.vignetteExpiry },
                  { label: 'Carte Grise', value: v.registrationCard },
                ].map((doc, idx) => (
                  <div key={idx} className={`p-3 rounded-2xl border transition-colors ${doc.date && isExpired(doc.date) ? 'bg-rose-50 border-rose-100' : doc.date && isExpiringSoon(doc.date) ? 'bg-amber-50 border-amber-100' : 'bg-slate-50 border-slate-100'}`}>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">{doc.label}</p>
                    <p className={`text-xs font-bold ${doc.date && isExpired(doc.date) ? 'text-rose-600' : doc.date && isExpiringSoon(doc.date) ? 'text-amber-600' : 'text-slate-700'}`}>
                      {doc.date ? new Date(doc.date).toLocaleDateString('fr-MA') : doc.value}
                    </p>
                  </div>
                ))}
              </div>
              <div className="pt-6 border-t border-slate-100 mt-auto flex gap-3">
                <Link to={`/fleet/${v.id}`} className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all text-center">Voir fiche</Link>
                <button onClick={() => handleOpenModal(v)} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-slate-200 transition-all">Éditer</button>
                <button onClick={() => handleDelete(v.id)} className="w-14 py-4 bg-rose-50 text-rose-500 rounded-2xl flex items-center justify-center hover:bg-rose-500 hover:text-white transition-all">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>}

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-300 df-overlay-backdrop">
          <div className="bg-white rounded-[3rem] shadow-2xl w-full max-w-4xl p-10 animate-in zoom-in-95 duration-200 overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-center mb-10">
              <div>
                <h2 className="text-3xl font-black text-slate-900 tracking-tight">{editingVehicle ? 'Éditer le Véhicule' : 'Nouveau Véhicule'}</h2>
                <p className="text-slate-500 font-medium">Renseignez les informations techniques et administratives.</p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-3 bg-slate-100 rounded-full text-slate-400 hover:text-slate-900 transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-10">

              {/* ── Fiche Technique ── */}
              <div className="space-y-6">
                <h3 className="text-xs font-black text-indigo-500 uppercase tracking-[0.2em]">Fiche Technique</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

                  {/* Immatriculation — 3 parts (col-span-2) */}
                  <div className="space-y-2 md:col-span-2">
                    <label className={labelCls}>Immat.</label>
                    <div className="flex items-center gap-2">
                      <input
                        required
                        type="text"
                        pattern="\d{1,5}"
                        maxLength={5}
                        className="flex-1 px-5 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-black font-mono text-center text-lg"
                        placeholder="12345"
                        value={formData.platNum}
                        onChange={e => setFormData(fd => ({ ...fd, platNum: e.target.value.replace(/\D/g, '') }))}
                      />
                      <span className="text-slate-300 font-black text-xl">–</span>
                      <select
                        required
                        className="w-20 px-3 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-black font-mono text-center text-lg"
                        value={formData.platLetter}
                        onChange={e => setFormData(fd => ({ ...fd, platLetter: e.target.value }))}>
                        {PLATE_LETTERS.map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                      <span className="text-slate-300 font-black text-xl">–</span>
                      <select
                        required
                        className="w-24 px-3 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none font-black font-mono text-center text-lg"
                        value={formData.platRegion}
                        onChange={e => setFormData(fd => ({ ...fd, platRegion: Number(e.target.value) }))}>
                        {PLATE_REGIONS.map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                    <p className="text-[10px] text-slate-400 ml-1">Format : <span className="font-mono font-bold">{formData.platNum || 'XXXXX'}-{formData.platLetter}-{formData.platRegion}</span></p>
                  </div>

                  {/* Type */}
                  <div className="space-y-2">
                    <label className={labelCls}>Type</label>
                    <select className={selectCls} value={formData.vehicleType}
                      onChange={e => setFormData(fd => ({ ...fd, vehicleType: e.target.value }))}>
                      <option value="">— Choix type —</option>
                      {VEHICLE_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>

                  {/* Type de carburant */}
                  <div className="space-y-2">
                    <label className={labelCls}>Type de carburant</label>
                    <select className={selectCls} value={formData.fuel}
                      onChange={e => setFormData(fd => ({ ...fd, fuel: e.target.value }))}>
                      <option value="">— Choix carburant —</option>
                      {FUEL_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </div>

                  {/* N° police */}
                  <div className="space-y-2">
                    <label className={labelCls}>N° police</label>
                    <input className={inputCls} placeholder="ex: POL-2024-001" value={formData.numeroPolice}
                      onChange={e => setFormData(fd => ({ ...fd, numeroPolice: e.target.value }))} />
                  </div>

                  {/* Nombre de cylindres */}
                  <div className="space-y-2">
                    <label className={labelCls}>Nombre de cylindre</label>
                    <input type="number" min="1" max="16" className={inputCls} placeholder="ex: 4"
                      value={formData.nombreCylindres}
                      onChange={e => setFormData(fd => ({ ...fd, nombreCylindres: e.target.value }))} />
                  </div>


                  {/* Gamme */}
                  <div className="space-y-2">
                    <label className={labelCls}>Gamme</label>
                    <select className={selectCls} value={formData.gamme}
                      onChange={e => setFormData(fd => ({ ...fd, gamme: e.target.value }))}>
                      <option value="">— Choix gamme —</option>
                      {GAMME_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </div>

                  {/* Date d'acquisition */}
                  <div className="space-y-2">
                    <label className={labelCls}>Date d'acquisition</label>
                    <input type="date" className={inputCls} value={formData.acquisitionDate}
                      onChange={e => setFormData(fd => ({ ...fd, acquisitionDate: e.target.value }))} />
                  </div>

                  {/* Marque */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className={labelCls}>Marque</label>
                      {getApiBase() && (
                        <button type="button" onClick={() => setAddingBrand((v) => !v)}
                          className="text-[10px] font-black uppercase tracking-widest text-indigo-600 hover:text-indigo-700">
                          + Ajouter
                        </button>
                      )}
                    </div>
                    <select required className={selectCls} value={formData.brand_id ?? ''}
                      onChange={e => {
                        const bid = e.target.value ? String(e.target.value) : null;
                        const bObj = brands.find(b => b.id === bid);
                        setFormData(fd => ({ ...fd, brand_id: bid, brand: bObj?.name ?? '', model_id: null, model: '' }));
                      }}>
                      <option value="">— Choix marque —</option>
                      {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    {addingBrand && (
                      <div className="flex items-center gap-2">
                        <input className={inputCls} placeholder="Nouvelle marque" value={newBrandName}
                          onChange={(e) => setNewBrandName(e.target.value)} />
                        <button type="button" onClick={handleAddBrand}
                          className="px-4 py-3 rounded-xl bg-indigo-600 text-white text-xs font-black">OK</button>
                      </div>
                    )}
                  </div>

                  {/* N° Carte grise */}
                  <div className="space-y-2">
                    <label className={labelCls}>N° de la carte grise</label>
                    <input required className={inputCls} value={formData.registrationCard}
                      onChange={e => setFormData(fd => ({ ...fd, registrationCard: e.target.value }))} />
                  </div>

                  {/* Puissance */}
                  <div className="space-y-2">
                    <label className={labelCls}>Puissance (CV)</label>
                    <input type="number" min="1" className={inputCls} placeholder="ex: 90"
                      value={formData.cv}
                      onChange={e => setFormData(fd => ({ ...fd, cv: e.target.value }))} />
                  </div>

                  {/* Mise en circulation */}
                  <div className="space-y-2">
                    <label className={labelCls}>Mise en circulation</label>
                    <input type="date" className={inputCls} value={formData.miseEnCirculation}
                      onChange={e => setFormData(fd => ({ ...fd, miseEnCirculation: e.target.value }))} />
                  </div>

                  {/* Date immatriculation */}
                  <div className="space-y-2">
                    <label className={labelCls}>Date immatriculation</label>
                    <input type="date" className={inputCls} value={formData.dateImmatriculation}
                      onChange={e => setFormData(fd => ({ ...fd, dateImmatriculation: e.target.value }))} />
                  </div>

                  {/* Catégorie */}
                  <div className="space-y-2">
                    <label className={labelCls}>Catégorie</label>
                    <select className={selectCls} value={formData.categorie}
                      onChange={e => setFormData(fd => ({ ...fd, categorie: e.target.value }))}>
                      <option value="">— Choix catégorie —</option>
                      {CATEGORIE_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>

                  {/* Modèle */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className={labelCls}>Modèle</label>
                      {getApiBase() && formData.brand_id && (
                        <button type="button" onClick={() => setAddingModel((v) => !v)}
                          className="text-[10px] font-black uppercase tracking-widest text-indigo-600 hover:text-indigo-700">
                          + Ajouter
                        </button>
                      )}
                    </div>
                    <select required className={selectCls} value={formData.model_id ?? ''} disabled={!formData.brand_id}
                      onChange={e => {
                        const mid = e.target.value ? String(e.target.value) : null;
                        const mObj = brands.find(b => b.id === formData.brand_id)?.models.find(m => m.id === mid);
                        setFormData(fd => ({ ...fd, model_id: mid, model: mObj?.name ?? '' }));
                      }}>
                      <option value="">— Choix modèle —</option>
                      {(brands.find(b => b.id === formData.brand_id)?.models ?? []).map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                    {addingModel && formData.brand_id && (
                      <div className="flex items-center gap-2">
                        <input className={inputCls} placeholder="Nouveau modèle"
                          value={newModelName} onChange={(e) => setNewModelName(e.target.value)} />
                        <button type="button" onClick={handleAddModel}
                          className="px-4 py-3 rounded-xl bg-indigo-600 text-white text-xs font-black">OK</button>
                      </div>
                    )}
                  </div>

                  {/* Châssis */}
                  <div className="space-y-2">
                    <label className={labelCls}>Chassis</label>
                    <input className={inputCls} placeholder="ex: VF1AA000..." value={formData.chassis}
                      onChange={e => setFormData(fd => ({ ...fd, chassis: e.target.value }))} />
                  </div>

                  {/* Immat. en ligne */}
                  <div className="space-y-2">
                    <label className={labelCls}>Immat. www</label>
                    <input className={inputCls} placeholder="Immatriculation en ligne" value={formData.immatOnline}
                      onChange={e => setFormData(fd => ({ ...fd, immatOnline: e.target.value }))} />
                  </div>

                  {/* Index conteur / Km */}
                  <div className="space-y-2">
                    <label className={labelCls}>Index conteur (Km)</label>
                    <input type="number" min="0" className={inputCls} placeholder="ex: 45000"
                      value={formData.mileageKm}
                      onChange={e => setFormData(fd => ({ ...fd, mileageKm: e.target.value }))} />
                  </div>

                  {/* Montant (prix d'acquisition) */}
                  <div className="space-y-2">
                    <label className={labelCls}>Montant (DH)</label>
                    <input type="number" min="0" className={inputCls} placeholder="ex: 150000"
                      value={formData.montant}
                      onChange={e => setFormData(fd => ({ ...fd, montant: e.target.value }))} />
                  </div>

                  {/* Année */}
                  <div className="space-y-2">
                    <label className={labelCls}>Année</label>
                    <input type="number" required className={inputCls} value={formData.year}
                      onChange={e => setFormData(fd => ({ ...fd, year: parseInt(e.target.value) }))} />
                  </div>

                </div>
              </div>

              {/* ── Conformité Administrative ── */}
              <div className="space-y-6 pt-6 border-t border-slate-100">
                <h3 className="text-xs font-black text-rose-500 uppercase tracking-[0.2em]">Conformité Administrative</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  {/* Carte Grise — photo only (number entered in Fiche Technique) */}
                  <div className="space-y-2">
                    <label className={labelCls}>Photo Carte Grise</label>
                    <DocPhotoUpload
                      preview={formData.docPhotos.carteGrise}
                      onFile={f => handleDocPhoto('carteGrise', f)}
                      onClear={() => setFormData(fd => ({ ...fd, docPhotos: { ...fd.docPhotos, carteGrise: null } }))}
                    />
                  </div>
                  {/* Assurance */}
                  <div className="space-y-2">
                    <label className={labelCls}>Exp. Assurance</label>
                    <input type="date" required className={inputCls} value={formData.insuranceExpiry}
                      onChange={e => setFormData(fd => ({ ...fd, insuranceExpiry: e.target.value }))} />
                    <DocPhotoUpload
                      preview={formData.docPhotos.assurance}
                      onFile={f => handleDocPhoto('assurance', f)}
                      onClear={() => setFormData(fd => ({ ...fd, docPhotos: { ...fd.docPhotos, assurance: null } }))}
                    />
                  </div>
                  {/* Visite Tech */}
                  <div className="space-y-2">
                    <label className={labelCls}>Exp. Visite Tech.</label>
                    <input type="date" required className={inputCls} value={formData.techControlExpiry}
                      onChange={e => setFormData(fd => ({ ...fd, techControlExpiry: e.target.value }))} />
                    <DocPhotoUpload
                      preview={formData.docPhotos.visiteTech}
                      onFile={f => handleDocPhoto('visiteTech', f)}
                      onClear={() => setFormData(fd => ({ ...fd, docPhotos: { ...fd.docPhotos, visiteTech: null } }))}
                    />
                  </div>
                  {/* Vignette */}
                  <div className="space-y-2">
                    <label className={labelCls}>Exp. Vignette</label>
                    <input type="date" required className={inputCls} value={formData.vignetteExpiry}
                      onChange={e => setFormData(fd => ({ ...fd, vignetteExpiry: e.target.value }))} />
                    <DocPhotoUpload
                      preview={formData.docPhotos.vignette}
                      onFile={f => handleDocPhoto('vignette', f)}
                      onClear={() => setFormData(fd => ({ ...fd, docPhotos: { ...fd.docPhotos, vignette: null } }))}
                    />
                  </div>
                </div>
              </div>

              {/* ── Photos & Vidéo ── */}
              <div className="space-y-6 pt-6 border-t border-slate-100">
                <h3 className="text-xs font-black text-emerald-500 uppercase tracking-[0.2em]">Photos & Vidéo</h3>

                {/* Photos */}
                <div className="space-y-3">
                  <label className={labelCls}>Photos du véhicule</label>
                  <input ref={photoInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotos} />
                  <button type="button" onClick={() => photoInputRef.current?.click()}
                    className="flex items-center gap-3 px-6 py-4 border-2 border-dashed border-slate-200 rounded-2xl text-slate-500 hover:border-indigo-400 hover:text-indigo-600 transition-all w-full justify-center font-bold text-sm">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                    Ajouter des photos
                  </button>
                  {formData.photoPreviews.length > 0 && (
                    <div className="grid grid-cols-4 gap-3">
                      {formData.photoPreviews.map((src, i) => (
                        <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-slate-100 group">
                          <img src={src} alt="" className="w-full h-full object-cover" />
                          <button type="button"
                            onClick={() => setFormData(fd => ({ ...fd, photoPreviews: fd.photoPreviews.filter((_, j) => j !== i) }))}
                            className="absolute top-1 right-1 w-6 h-6 bg-rose-500 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Vidéo */}
                <div className="space-y-3">
                  <label className={labelCls}>Vidéo du véhicule (optionnel)</label>
                  <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={handleVideo} />
                  <button type="button" onClick={() => videoInputRef.current?.click()}
                    className="flex items-center gap-3 px-6 py-4 border-2 border-dashed border-slate-200 rounded-2xl text-slate-500 hover:border-indigo-400 hover:text-indigo-600 transition-all w-full justify-center font-bold text-sm">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                    {formData.videoPreview ? 'Remplacer la vidéo' : 'Ajouter une vidéo'}
                  </button>
                  {formData.videoPreview && (
                    <video src={formData.videoPreview} controls className="w-full rounded-2xl border border-slate-100 max-h-48" />
                  )}
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 py-5 text-slate-500 font-black uppercase text-xs tracking-widest hover:bg-slate-50 rounded-2xl transition-all">Annuler</button>
                <button type="submit" className="flex-1 py-5 bg-indigo-600 text-white font-black uppercase text-xs tracking-widest rounded-2xl shadow-2xl shadow-indigo-600/20 hover:scale-[1.02] active:scale-95 transition-all">
                  {editingVehicle ? 'Mettre à jour la flotte' : 'Enregistrer le véhicule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default VehiclesList;
