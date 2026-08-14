import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { canAccessModule } from '@/domain/appRole';
import { useAuthSession } from '@/modules/auth/AuthContext';
import { Icon } from '@/modules/shared/components/Icon';
import { GROUPS, type NavItem } from '@/modules/layout/navConfig';
import { isExperimentalEnabled, isModuleHiddenInDemo } from '@/config/runtimeFlags';

/**
 * Départements hub — segments departments (groups) and their sub-departments
 * (modules), each iconised by meaning. Clicking a department or a
 * sub-department opens that module in a NEW browser tab, leaving this hub open
 * in the first tab.
 */
export const DepartmentsHubPage: React.FC = () => {
  const { t } = useTranslation();
  const { session } = useAuthSession();

  // Same visibility rules as the sidebar so users only see what they can reach.
  const departments = useMemo(() => {
    const role = session?.user.role ?? 'AGENT_COMMERCIAL';
    const showExperimental = isExperimentalEnabled();
    return GROUPS.map((g) => ({
      ...g,
      items: g.items.filter((it) => {
        if (it.module === 'ai' && !showExperimental) return false;
        if (isModuleHiddenInDemo(it.module)) return false;
        return canAccessModule(role, it.module);
      }),
    })).filter((g) => g.items.length > 0);
  }, [session?.user.role]);

  // Open a module route in a new browser tab; the hub stays in the first tab.
  const openInNewTab = (to: string) => {
    window.open(to, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-black text-[color:var(--df-text)]">Départements</h1>
        <p className="text-sm text-[color:var(--df-text-muted)]">
          Chaque département s'ouvre dans un nouvel onglet — cette vue reste ouverte ici.
        </p>
      </header>

      <div className="space-y-8">
        {departments.map((dep) => (
          <section key={dep.key} className="space-y-4">
            {/* Department header — clicking it opens the first sub-department. */}
            <button
              type="button"
              onClick={() => dep.items[0] && openInNewTab(dep.items[0].to)}
              className="group flex items-center gap-3 text-left"
              title={`Ouvrir ${t(dep.labelKey)} dans un nouvel onglet`}
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[color:var(--df-brand-500)]/[0.10] text-[color:var(--df-brand-500)] ring-1 ring-[color:var(--df-brand-500)]/20 transition group-hover:bg-[color:var(--df-brand-500)]/[0.18]">
                <Icon name={dep.icon} size={22} />
              </span>
              <div>
                <div className="flex items-center gap-1.5 text-lg font-black text-[color:var(--df-text)]">
                  {t(dep.labelKey)}
                  <Icon name="external" size={14} className="opacity-0 transition group-hover:opacity-60" />
                </div>
                <div className="text-[11px] font-semibold uppercase tracking-widest text-[color:var(--df-text-faint)]">
                  {dep.items.length} sous-département{dep.items.length > 1 ? 's' : ''}
                </div>
              </div>
            </button>

            {/* Sub-department tiles — each opens its module in a new tab. */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
              {dep.items.map((item: NavItem) => (
                <button
                  key={item.to}
                  type="button"
                  onClick={() => openInNewTab(item.to)}
                  title={`Ouvrir ${t(item.labelKey)} dans un nouvel onglet`}
                  className="group flex flex-col items-start gap-3 rounded-2xl border border-[color:var(--df-border)] bg-[color:var(--df-surface)] p-4 text-left transition hover:-translate-y-0.5 hover:border-[color:var(--df-brand-300)] hover:shadow-md"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[color:var(--df-surface-sunk)] text-[color:var(--df-text-muted)] transition group-hover:bg-[color:var(--df-brand-500)]/[0.12] group-hover:text-[color:var(--df-brand-500)]">
                    <Icon name={item.icon} size={20} />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-[color:var(--df-text)]">{t(item.labelKey)}</div>
                    <div className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-[color:var(--df-brand-500)]">
                      Ouvrir
                      <Icon name="external" size={11} />
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};
