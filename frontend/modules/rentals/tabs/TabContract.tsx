import React from 'react';
import { Link } from 'react-router-dom';

const STATUS_FR: Record<string, string> = {
  draft: 'Brouillon', active: 'Actif', signed: 'Signé', pending: 'En attente',
  pending_approval: 'En attente approbation', terminated: 'Résilié',
  completed: 'Terminé', cancelled: 'Annulé', suspended: 'Suspendu',
};

const STATUS_COLOR: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700',
  active: 'bg-emerald-100 text-emerald-700',
  signed: 'bg-blue-100 text-blue-700',
  pending: 'bg-amber-100 text-amber-700',
  pending_approval: 'bg-amber-100 text-amber-700',
  terminated: 'bg-rose-100 text-rose-700',
  completed: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-rose-100 text-rose-700',
  suspended: 'bg-orange-100 text-orange-700',
};

interface Props {
  reservation: any;
  detail?: any;
}

const TabContract: React.FC<Props> = ({ reservation, detail }) => {
  const hasContract = detail?.has_contract;
  const contractId = detail?.contract_id;
  const contractNumber = detail?.contract_number;
  const contractStatus = detail?.contract_status;

  return (
    <div className="space-y-6">
      {hasContract && contractId ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">Contrat associé</div>
              <div className="mt-1 text-lg font-black text-slate-800">{contractNumber ?? contractId.slice(0, 8).toUpperCase()}</div>
              <div className="mt-1">
                <span className={`inline-block rounded-full px-3 py-0.5 text-xs font-bold ${STATUS_COLOR[contractStatus] ?? 'bg-slate-100 text-slate-700'}`}>
                  {STATUS_FR[contractStatus] ?? contractStatus}
                </span>
              </div>
            </div>
            <Link
              to={`/contracts/${contractId}`}
              className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-black text-white hover:bg-emerald-700 transition-colors"
            >
              Voir le contrat
            </Link>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
          <h3 className="text-sm font-black text-amber-800 mb-2">Aucun contrat associé</h3>
          <p className="text-xs text-slate-500 mb-4">
            Générez un contrat depuis cette réservation. Les informations du client, véhicule et dates seront pré-remplies automatiquement.
          </p>
          <Link
            to={`/contracts/new?from_reservation=${reservation.id}`}
            className="inline-block rounded-xl bg-amber-600 px-5 py-2.5 text-sm font-black text-white hover:bg-amber-700"
          >
            Générer contrat
          </Link>
        </div>
      )}

      <div className="rounded-xl border border-dashed border-slate-200 p-6">
        <h3 className="mb-2 text-xs font-black uppercase tracking-widest text-slate-400">Actions contrat</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <ActionCard icon="📥" label="Télécharger PDF" disabled={!hasContract} />
          <ActionCard icon="📱" label="Envoyer WhatsApp" disabled={!hasContract} />
          <ActionCard icon="📧" label="Envoyer Email" disabled={!hasContract} />
          <ActionCard icon="🖨️" label="Imprimer" disabled={!hasContract} />
        </div>
        {!hasContract && (
          <p className="mt-3 text-[11px] text-slate-400">
            Ces actions seront disponibles une fois le contrat généré.
          </p>
        )}
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
