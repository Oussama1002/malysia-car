import React from 'react';
import { useIsFetching } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

/** Thin global line while React Query has in-flight fetches. */
export const QueryLoadingBar: React.FC = () => {
  const { t } = useTranslation();
  const n = useIsFetching();
  if (n === 0) {
    return null;
  }
  return (
    <div
      className="pointer-events-none fixed left-0 right-0 top-0 z-[90] h-0.5 overflow-hidden"
      role="status"
      aria-label={t('common.loading')}
    >
      <div className="h-full w-1/3 animate-[shimmer_1.2s_ease-in-out_infinite] bg-gradient-to-r from-indigo-500 via-violet-500 to-indigo-500" />
      <style>{`@keyframes shimmer { 0% { margin-left: -30%; } 100% { margin-left: 100%; } }`}</style>
    </div>
  );
};
