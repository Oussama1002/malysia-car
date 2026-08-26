import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { contractsApi } from '@/services/contractsApi';

interface Props {
  reservation: any;
}

const DEAD_STATUSES = new Set(['cancelled', 'terminated', 'rejected', 'expired']);

const TabContract: React.FC<Props> = ({ reservation }) => {
  const reservationId = String(reservation?.id ?? '');
  const customerId = String(reservation?.customer_id ?? '');
  const vehicleId  = String(reservation?.vehicle_id ?? '');

  // Match by reservation_id first (reliable when the contract was generated
  // via the wizard after the reservation-linkage change), then fall back to
  // customer+vehicle for older contracts that pre-date the column.
  const directQ = useQuery({
    queryKey: ['contracts', 'by-reservation', reservationId],
    queryFn: async () => contractsApi.list({ reservation_id: reservationId } as any),
    enabled: !!reservationId,
    staleTime: 60_000,
  });

  const legacyQ = useQuery({
    queryKey: ['contracts', 'by-customer-vehicle', customerId, vehicleId],
    queryFn: async () => contractsApi.list({ customer_id: customerId, vehicle_id: vehicleId }),
    enabled: !!customerId && !!vehicleId && (directQ.data ?? []).length === 0,
    staleTime: 60_000,
  });

  const activeContract = useMemo(() => {
    const pool = [...(directQ.data ?? []), ...(legacyQ.data ?? [])];
    return pool.find(
      (c: any) => !DEAD_STATUSES.has(String(c.status ?? '').toLowerCase()),
    );
  }, [directQ.data, legacyQ.data]);

  if (activeContract) {
    const ref = (activeContract as any).contract_number
      ?? (activeContract as any).contractNumber
      ?? (activeContract as any).reference
      ?? (activeContract as any).id;
    const status = String((activeContract as any).status ?? '').toLowerCase();
    return (
      <div className="space-y-6">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6">
          <div className="mb-2 text-4xl">✅</div>
          <h3 className="mb-1 text-sm font-black text-emerald-900">Contrat déjà généré</h3>
          <p className="mb-4 text-xs text-emerald-800">
            Un contrat lié à ce client et ce véhicule existe déjà — pas besoin d'en générer un autre.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-lg bg-white px-3 py-2 text-xs font-bold text-emerald-900 border border-emerald-200">
              Réf. <span className="font-black">{ref}</span> · <span className="uppercase">{status}</span>
            </div>
            <Link
              to={`/contracts/${(activeContract as any).id}`}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white hover:bg-emerald-700"
            >
              Ouvrir le contrat →
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-100 p-6 text-center">
        <div className="text-4xl mb-3">📄</div>
        <h3 className="text-sm font-black text-slate-800 mb-2">Contrat de location</h3>
        <p className="text-xs text-slate-500 mb-4">
          Générez un contrat depuis cette réservation. Les informations du client, véhicule et dates seront pré-remplies automatiquement.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            to={`/contracts/new?from_reservation=${reservation.id}`}
            className="rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-black text-white hover:bg-amber-700"
          >
            Générer contrat
          </Link>
        </div>
      </div>

      {/* Placeholder for future contract history display */}
      <div className="rounded-xl border border-dashed border-slate-200 p-6">
        <h3 className="mb-2 text-xs font-black uppercase tracking-widest text-slate-400">Actions contrat</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <ActionCard icon="📥" label="Télécharger PDF" disabled />
          <ActionCard icon="📱" label="Envoyer WhatsApp" disabled />
          <ActionCard icon="📧" label="Envoyer Email" disabled />
          <ActionCard icon="🖊️" label="Signature" disabled />
        </div>
        <p className="mt-3 text-[11px] text-slate-400">
          Ces actions seront disponibles une fois le contrat généré.
        </p>
      </div>
    </div>
  );
};

function ActionCard({ icon, label, disabled }: { icon: string; label: string; disabled?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 text-center ${disabled ? 'border-slate-100 opacity-50' : 'border-slate-200 hover:bg-slate-50 cursor-pointer'}`}>
      <div className="text-2xl mb-1">{icon}</div>
      <div className="text-[11px] font-bold text-slate-600">{label}</div>
    </div>
  );
}

export default TabContract;
