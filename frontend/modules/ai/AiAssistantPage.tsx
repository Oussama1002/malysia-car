import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { aiApi } from '@/services/aiApi';

export const AiAssistantPage: React.FC = () => {
  const [q, setQ] = useState('');
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [answer, setAnswer] = useState<string>('');
  const [refs, setRefs] = useState<Array<{ type: string; id: string; path: string }>>([]);

  const convoQuery = useQuery({
    queryKey: ['ai', 'assistant', 'conversations'],
    queryFn: aiApi.assistantConversations,
  });

  const askMutation = useMutation({
    mutationFn: (payload: { message: string; conversationId?: string }) =>
      aiApi.assistantMessages(payload.message, payload.conversationId),
    onSuccess: (data) => {
      setConversationId(data.conversation_id);
      setAnswer(data.answer);
      setRefs(data.references ?? []);
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-slate-900">Assistant IA</h1>
          <p className="text-sm text-slate-500">Reponses ERP deterministes; AI-assisted uniquement si provider externe configure.</p>
        </div>
        <Link className="text-sm font-bold text-indigo-600" to="/ai">
          ← Hub
        </Link>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
        <textarea
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="min-h-[120px] w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm"
          placeholder="Posez une question metier (fleet risk, overdue invoices, maintenance alerts, credit risk...)"
        />
        <div className="mt-4 flex flex-wrap gap-2">
          {['Fleet risk', 'Overdue invoices', 'Maintenance alerts', 'Credit risk', 'Cash-flow', 'Used-car pricing'].map((s) => (
            <button key={s} type="button" className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700" onClick={() => setQ(s)}>
              {s}
            </button>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
            onClick={() => q.trim() && askMutation.mutate({ message: q.trim(), conversationId })}
            disabled={askMutation.isPending || !q.trim()}
          >
            {askMutation.isPending ? 'Analyse...' : 'Interroger'}
          </button>
        </div>
        <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-600 space-y-3">
          <div className="text-xs text-slate-500">rule-based insight · AI-assisted if external provider enabled · requires human validation</div>
          <div>{answer || 'Les reponses apparaissent ici avec references ERP traçables.'}</div>
          {refs.length > 0 && (
            <div>
              <div className="mb-1 text-xs font-bold text-slate-500">Liens entites</div>
              <div className="flex flex-wrap gap-2">
                {refs.map((r, idx) => (
                  <Link key={`${r.type}-${r.id}-${idx}`} to={r.path} className="rounded bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700">
                    {r.type} #{r.id.slice(0, 8)}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-100 bg-white p-4 text-sm">
        <div className="mb-2 font-bold text-slate-900">Conversations recentes</div>
        {(convoQuery.data ?? []).slice(0, 6).map((c: any) => (
          <button
            key={c.conversation_id}
            type="button"
            className="mb-2 block w-full rounded border border-slate-100 p-2 text-left hover:bg-slate-50"
            onClick={() => setConversationId(c.conversation_id)}
          >
            <div className="font-semibold text-slate-800">{c.last_message ?? 'Conversation'}</div>
            <div className="text-xs text-slate-500">{c.last_intent} · {c.messages_count} messages</div>
          </button>
        ))}
      </div>
    </div>
  );
};
