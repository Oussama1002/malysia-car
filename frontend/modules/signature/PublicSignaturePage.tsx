import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  contractSignatureApi,
  type PublicSignatureView,
} from '@/services/contractSignatureApi';
import { ApiError } from '@/services/apiClient';

/**
 * Public, login-free signing page reached via /sign/:token.
 * The signer reviews the contract summary + PDF, draws a signature on a
 * touch/mouse canvas, and confirms. Everything is gated by the opaque token.
 */
export const PublicSignaturePage: React.FC = () => {
  const { token = '' } = useParams();

  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<PublicSignatureView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [signerName, setSignerName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState<null | 'signed' | 'rejected'>(null);
  const [hasDrawn, setHasDrawn] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const lastPt = useRef<{ x: number; y: number } | null>(null);

  // ── Load the request ──
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await contractSignatureApi.publicView(token);
      setView(res.data);
      setSignerName(res.data.signer_name ?? '');
      if (res.data.status === 'signed') setDone('signed');
      if (res.data.status === 'rejected') setDone('rejected');
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : 'Lien de signature invalide.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  // ── Canvas setup (handles HiDPI + responsive width) ──
  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth || 600;
    const cssHeight = 200;
    canvas.width = cssWidth * ratio;
    canvas.height = cssHeight * ratio;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f172a';
  }, []);

  useEffect(() => {
    if (view?.is_signable) {
      // Defer so the canvas has its layout width.
      const id = window.setTimeout(setupCanvas, 0);
      window.addEventListener('resize', setupCanvas);
      return () => {
        window.clearTimeout(id);
        window.removeEventListener('resize', setupCanvas);
      };
    }
  }, [view?.is_signable, setupCanvas]);

  const pointFromEvent = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    canvasRef.current?.setPointerCapture(e.pointerId);
    drawing.current = true;
    lastPt.current = pointFromEvent(e);
  };

  const moveDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext('2d');
    const pt = pointFromEvent(e);
    if (ctx && lastPt.current) {
      ctx.beginPath();
      ctx.moveTo(lastPt.current.x, lastPt.current.y);
      ctx.lineTo(pt.x, pt.y);
      ctx.stroke();
      setHasDrawn(true);
    }
    lastPt.current = pt;
  };

  const endDraw = () => {
    drawing.current = false;
    lastPt.current = null;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setHasDrawn(false);
    }
  };

  const submit = async () => {
    if (!signerName.trim()) {
      setSubmitError('Veuillez saisir votre nom complet.');
      return;
    }
    if (!hasDrawn) {
      setSubmitError('Veuillez dessiner votre signature.');
      return;
    }
    const dataUrl = canvasRef.current?.toDataURL('image/png');
    if (!dataUrl) {
      setSubmitError('Impossible de capturer la signature.');
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      await contractSignatureApi.publicSign(token, { signer_name: signerName.trim(), signature_image: dataUrl });
      setDone('signed');
    } catch (e) {
      setSubmitError(e instanceof ApiError ? e.message : 'Échec de la signature. Réessayez.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render states ──
  if (loading) {
    return <Shell><p className="text-slate-500">Chargement…</p></Shell>;
  }

  if (loadError) {
    return (
      <Shell>
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-800">
          <div className="text-lg font-black">Lien indisponible</div>
          <p className="mt-1 text-sm">{loadError}</p>
        </div>
      </Shell>
    );
  }

  if (done === 'signed' || view?.status === 'signed') {
    return (
      <Shell>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-3xl">✓</div>
          <div className="text-xl font-black text-emerald-800">Contrat signé</div>
          <p className="mt-1 text-sm text-emerald-700">Merci. Votre signature a bien été enregistrée.</p>
        </div>
      </Shell>
    );
  }

  if (done === 'rejected' || view?.status === 'rejected') {
    return (
      <Shell>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center">
          <div className="text-xl font-black text-slate-800">Signature refusée</div>
          <p className="mt-1 text-sm text-slate-600">Vous avez refusé de signer ce contrat.</p>
        </div>
      </Shell>
    );
  }

  if (view && (view.is_expired || !view.is_signable)) {
    return (
      <Shell>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center">
          <div className="text-xl font-black text-amber-800">Lien expiré</div>
          <p className="mt-1 text-sm text-amber-700">Ce lien de signature n’est plus valide. Contactez l’agence.</p>
        </div>
      </Shell>
    );
  }

  const c = view?.contract;
  const amount = (v: number | string | null | undefined) =>
    v == null || v === '' ? null : `${Number(v).toLocaleString('fr-MA')} ${c?.currency_code ?? 'MAD'}`;

  return (
    <Shell>
      {/* Contract summary */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="text-[11px] font-black uppercase tracking-widest text-indigo-500">Contrat à signer</div>
        <h1 className="mt-1 text-xl font-black text-slate-900">{c?.contract_number ?? 'Contrat'}</h1>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <Field label="Type" value={c?.contract_type} />
          <Field label="Période" value={`${c?.start_date ?? '—'} → ${c?.end_date ?? '—'}`} />
          {c?.vehicle && (
            <Field
              label="Véhicule"
              value={`${[c.vehicle.brand, c.vehicle.model].filter(Boolean).join(' ') || '—'}${c.vehicle.registration ? ` · ${c.vehicle.registration}` : ''}`}
            />
          )}
          {amount(c?.base_amount) && <Field label="Montant" value={amount(c?.base_amount)} />}
          {amount(c?.monthly_payment) && <Field label="Mensualité" value={amount(c?.monthly_payment)} />}
        </dl>
        {view?.has_pdf && (
          <a
            href={contractSignatureApi.publicPdfUrl(token)}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100"
          >
            📄 Consulter le contrat (PDF)
          </a>
        )}
      </div>

      {/* Signature pad */}
      <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <label className="text-[11px] font-black uppercase tracking-widest text-slate-400">Nom complet</label>
        <input
          className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 font-semibold outline-none focus:ring-4 focus:ring-indigo-500/10"
          value={signerName}
          onChange={(e) => setSignerName(e.target.value)}
          placeholder="Votre nom et prénom"
        />

        <div className="mt-4 flex items-center justify-between">
          <label className="text-[11px] font-black uppercase tracking-widest text-slate-400">Votre signature</label>
          <button type="button" onClick={clearCanvas} className="text-xs font-bold text-indigo-600 hover:text-indigo-700">
            Effacer
          </button>
        </div>
        <div className="mt-1 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50">
          <canvas
            ref={canvasRef}
            className="h-[200px] w-full touch-none rounded-xl"
            style={{ touchAction: 'none' }}
            onPointerDown={startDraw}
            onPointerMove={moveDraw}
            onPointerUp={endDraw}
            onPointerLeave={endDraw}
          />
        </div>
        <p className="mt-1 text-[11px] text-slate-400">Signez avec le doigt (mobile) ou la souris.</p>

        {submitError && (
          <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
            {submitError}
          </div>
        )}

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="flex-1 rounded-2xl bg-indigo-600 px-5 py-3.5 text-sm font-black uppercase tracking-widest text-white shadow-lg shadow-indigo-600/20 transition hover:bg-indigo-700 disabled:opacity-60"
          >
            {submitting ? 'Enregistrement…' : 'Confirmer la signature'}
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={async () => {
              if (!window.confirm('Refuser de signer ce contrat ?')) return;
              try {
                await contractSignatureApi.publicReject(token);
                setDone('rejected');
              } catch {
                /* ignore */
              }
            }}
            className="rounded-2xl border border-slate-200 px-5 py-3.5 text-sm font-bold text-slate-600 hover:bg-slate-50"
          >
            Refuser
          </button>
        </div>
        <p className="mt-3 text-center text-[11px] text-slate-400">
          En signant, vous acceptez les termes du contrat. Votre IP et la date sont enregistrées à des fins légales.
        </p>
      </div>
    </Shell>
  );
};

const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen bg-gradient-to-b from-slate-100 to-slate-200 px-4 py-8">
    <div className="mx-auto w-full max-w-xl">
      <div className="mb-5 text-center">
        <div className="text-2xl font-black tracking-tight text-indigo-600">DriveFlow</div>
        <div className="text-xs font-semibold text-slate-500">Signature électronique sécurisée</div>
      </div>
      {children}
    </div>
  </div>
);

const Field: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <div>
    <dt className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</dt>
    <dd className="font-semibold text-slate-800">{value ?? '—'}</dd>
  </div>
);
