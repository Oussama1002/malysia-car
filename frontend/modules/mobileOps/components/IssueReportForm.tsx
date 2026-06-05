import React, { useState } from 'react';
import type { IssueType, IssueSeverity } from '@/services/mobileOpsApi';

interface IssueFormData {
  issue_type: IssueType;
  severity: IssueSeverity;
  description: string;
}

interface IssueReportFormProps {
  onSubmit: (data: IssueFormData) => void;
  isPending?: boolean;
}

const ISSUE_TYPES: { value: IssueType; label: string }[] = [
  { value: 'vehicle_damage', label: 'Dommage véhicule' },
  { value: 'customer_absent', label: 'Client absent' },
  { value: 'wrong_address', label: 'Mauvaise adresse' },
  { value: 'mechanical', label: 'Panne mécanique' },
  { value: 'other', label: 'Autre' },
];

const SEVERITIES: { value: IssueSeverity; label: string; color: string }[] = [
  { value: 'low', label: 'Faible', color: 'bg-slate-100 text-slate-700 border-slate-300' },
  { value: 'medium', label: 'Moyen', color: 'bg-amber-100 text-amber-800 border-amber-300' },
  { value: 'high', label: 'Élevé', color: 'bg-orange-100 text-orange-800 border-orange-300' },
  { value: 'critical', label: 'Critique', color: 'bg-rose-100 text-rose-800 border-rose-300' },
];

export const IssueReportForm: React.FC<IssueReportFormProps> = ({ onSubmit, isPending }) => {
  const [issueType, setIssueType] = useState<IssueType>('other');
  const [severity, setSeverity] = useState<IssueSeverity>('medium');
  const [description, setDescription] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;
    onSubmit({ issue_type: issueType, severity, description: description.trim() });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Issue type */}
      <div>
        <label className="mb-1 block text-xs font-bold text-slate-700">Type de problème</label>
        <div className="grid grid-cols-2 gap-2">
          {ISSUE_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setIssueType(t.value)}
              className={`rounded-lg border px-2 py-1.5 text-[11px] font-bold transition ${
                issueType === t.value ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Severity */}
      <div>
        <label className="mb-1 block text-xs font-bold text-slate-700">Gravité</label>
        <div className="flex gap-2">
          {SEVERITIES.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setSeverity(s.value)}
              className={`flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-bold transition ${
                severity === s.value ? s.color : 'border-slate-200 text-slate-500'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="mb-1 block text-xs font-bold text-slate-700">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="df-input w-full"
          rows={3}
          placeholder="Décrivez le problème rencontré..."
          required
        />
      </div>

      <button type="submit" className="df-btn df-btn--primary w-full" disabled={isPending || !description.trim()}>
        {isPending ? 'Envoi...' : 'Signaler le problème'}
      </button>
    </form>
  );
};
