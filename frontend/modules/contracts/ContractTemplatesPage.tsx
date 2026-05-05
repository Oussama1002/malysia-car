import React from 'react';
import { Link } from 'react-router-dom';
import { UploadZone } from '@/modules/shared/components/UploadZone';

export const ContractTemplatesPage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Templates de contrats</h1>
          <p className="text-sm text-slate-500">Variables type {'{{client.name}}'} — moteur côté serveur.</p>
        </div>
        <Link className="text-sm font-bold text-indigo-600" to="/contracts">
          ← Contrats
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="text-sm font-black">Importer un modèle</div>
          <div className="mt-4">
            <UploadZone label="DOCX / HTML template" />
          </div>
        </div>
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <div className="text-sm font-black">Mapping variables</div>
          <pre className="mt-4 overflow-auto rounded-xl bg-slate-900 p-4 text-xs text-slate-100">
            {`{
  "client.name": "string",
  "vehicle.registration": "string",
  "contract.payment": "money"
}`}
          </pre>
        </div>
      </div>
    </div>
  );
};
