import React from 'react';
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuthSession } from '@/modules/auth/AuthContext';
import { SessionExpiredBanner } from '@/modules/auth/SessionExpiredBanner';
import { LoginPage } from '@/modules/auth/LoginPage';
import { ForgotPasswordPage } from '@/modules/auth/ForgotPasswordPage';
import { ResetPasswordPage } from '@/modules/auth/ResetPasswordPage';
import { AppLayout } from '@/modules/layout/AppLayout';
import { ExecutiveDashboardPage } from '@/modules/dashboard/ExecutiveDashboardPage';
import { FleetListPage } from '@/modules/fleet/FleetListPage';
import { FleetVehicleDetailPage } from '@/modules/fleet/FleetVehicleDetailPage';
import { FleetMaintenanceDashboardPage } from '@/modules/fleet/FleetMaintenanceDashboardPage';
import { FleetComplianceDashboardPage } from '@/modules/fleet/FleetComplianceDashboardPage';
import VehiclesList from '@/screens/VehiclesList';
import { CustomersPage } from '@/modules/customers/CustomersPage';
import { CustomerDetailPage } from '@/modules/customers/CustomerDetailPage';
import { ContractsPage } from '@/modules/contracts/ContractsPage';
import { ContractWizardPage } from '@/modules/contracts/ContractWizardPage';
import { ContractDetailPage } from '@/modules/contracts/ContractDetailPage';
import { ContractTemplatesPage } from '@/modules/contracts/ContractTemplatesPage';
import { CreditAnalysisPage } from '@/modules/credit/CreditAnalysisPage';
import { FinancePage } from '@/modules/finance/FinancePage';
import { InvoicesPage } from '@/modules/finance/InvoicesPage';
import { InvoiceDetailPage } from '@/modules/finance/InvoiceDetailPage';
import { PaymentsPage } from '@/modules/finance/PaymentsPage';
import { TreasuryPage } from '@/modules/finance/TreasuryPage';
import { CustomerStatementPage } from '@/modules/finance/CustomerStatementPage';
// Phase 11 — Accounting
import { AccountingPage } from '@/modules/accounting/AccountingPage';
import { ChartOfAccountsPage } from '@/modules/accounting/ChartOfAccountsPage';
import { JournalsPage } from '@/modules/accounting/JournalsPage';
import { EntriesPage } from '@/modules/accounting/EntriesPage';
import { EntryDetailPage } from '@/modules/accounting/EntryDetailPage';
import { JournalEntryForm } from '@/modules/accounting/JournalEntryForm';
import { FixedAssetsPage } from '@/modules/accounting/FixedAssetsPage';
import { FixedAssetDetailPage } from '@/modules/accounting/FixedAssetDetailPage';
import { TrialBalancePage } from '@/modules/accounting/reports/TrialBalancePage';
import { BalanceSheetPage } from '@/modules/accounting/reports/BalanceSheetPage';
import { IncomeStatementPage } from '@/modules/accounting/reports/IncomeStatementPage';
import { TaxReportPage } from '@/modules/accounting/reports/TaxReportPage';
import { AccountingSettingsPage } from '@/modules/accounting/AccountingSettingsPage';
// Phase 12 — Arrears / Legal
import { ArrearsDashboardPage } from '@/modules/arrears/ArrearsDashboardPage';
import { ArrearsCaseDetailPage } from '@/modules/arrears/ArrearsCaseDetailPage';
import { LegalCasesPage } from '@/modules/arrears/LegalCasesPage';
import { LegalCaseDetailPage } from '@/modules/arrears/LegalCaseDetailPage';
// Phase 13 — Electronic Signature
import { SignatureEnvelopesPage } from '@/modules/signature/SignatureEnvelopesPage';
import { SignatureEnvelopeDetailPage } from '@/modules/signature/SignatureEnvelopeDetailPage';
// Phase 14 — Dashboard sub-pages
import { DashboardFinancePage } from '@/modules/dashboard/DashboardFinancePage';
import { DashboardRiskPage } from '@/modules/dashboard/DashboardRiskPage';
import { DashboardFleetPage } from '@/modules/dashboard/DashboardFleetPage';
import { UsedCarsPage } from '@/modules/usedCars/UsedCarsPage';
import { UsedCarDetailPage } from '@/modules/usedCars/UsedCarDetailPage';
import { GpsDashboardPage } from '@/modules/gps/GpsDashboardPage';
import { GpsAlertsPage } from '@/modules/gps/GpsAlertsPage';
import { GeofencesPage } from '@/modules/gps/GeofencesPage';
import { VehicleLiveTrackingPage } from '@/modules/gps/VehicleLiveTrackingPage';
import { VehicleTripsPage } from '@/modules/gps/VehicleTripsPage';
import { AiHubPage } from '@/modules/ai/AiHubPage';
import { AiAssistantPage } from '@/modules/ai/AiAssistantPage';
import {
  AiAnomaliesPage,
  AiCashFlowPredictionPage,
  AiCreditRiskPredictionPage,
  AiMaintenancePredictionPage,
  AiVehiclePricingPredictionPage,
} from '@/modules/ai/AiPredictionPages';
import { MobileOpsPage } from '@/modules/mobileOps/MobileOpsPage';
import { NotificationsPage } from '@/modules/notifications/NotificationsPage';
import { SettingsPage } from '@/modules/settings/SettingsPage';
import { UserManagementPage } from '@/modules/settings/UserManagementPage';
import { RolesPermissionsPage } from '@/modules/settings/RolesPermissionsPage';
import { BranchManagementPage } from '@/modules/settings/BranchManagementPage';
import { AuditPage } from '@/modules/audit/AuditPage';
import { DocumentsCenterPage } from '@/modules/documents/DocumentsCenterPage';
import { RentalsPage } from '@/modules/rentals/RentalsPage';
// Sous-location
import { SubRentalsPage } from '@/modules/subRentals/SubRentalsPage';
import { SubRentalCreatePage } from '@/modules/subRentals/SubRentalCreatePage';
import { SubRentalDetailPage } from '@/modules/subRentals/SubRentalDetailPage';
import { SupplierAgenciesPage } from '@/modules/subRentals/SupplierAgenciesPage';
import { ProfilePage } from '@/modules/profile/ProfilePage';
import { AgencePage } from '@/modules/profile/AgencePage';
import { ModuleGate } from '@/routes/ModuleGate';
import { useSessionExpiryWatcher } from '@/modules/auth/AuthContext';

function SessionWatcher(): null {
  useSessionExpiryWatcher();
  return null;
}

function NotFoundPage(): React.ReactElement {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
      La page demandee est introuvable.
    </div>
  );
}

function RequireAuth(): React.ReactElement {
  const { session, loading } = useAuthSession();
  const location = useLocation();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm font-semibold text-slate-500">
        Chargement…
      </div>
    );
  }
  if (!session || session.expiresAt < Date.now()) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }
  return <Outlet />;
}

function AiRoleGate({ roles, children }: { roles: string[]; children: React.ReactNode }): React.ReactElement {
  const { session } = useAuthSession();
  if (!session) return <Navigate to="/login" replace />;
  if (!roles.includes(session.user.role)) return <Navigate to="/ai" replace />;
  return <>{children}</>;
}

function SettingsRoleGate({ children }: { children: React.ReactNode }): React.ReactElement {
  const { session } = useAuthSession();
  if (!session) return <Navigate to="/login" replace />;
  if (!['ADMIN', 'DIRECTEUR'].includes(session.user.role)) return <Navigate to="/dashboard" replace />;
  return <>{children}</>;
}

export default function AppRoutes(): React.ReactElement {
  return (
    <>
      <SessionWatcher />
      <SessionExpiredBanner />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        <Route element={<RequireAuth />}>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route
              path="/dashboard"
              element={
                <ModuleGate module="dashboard">
                  <ExecutiveDashboardPage />
                </ModuleGate>
              }
            />
            <Route
              path="/dashboard/finance"
              element={
                <ModuleGate module="dashboard">
                  <DashboardFinancePage />
                </ModuleGate>
              }
            />
            <Route
              path="/dashboard/risk"
              element={
                <ModuleGate module="dashboard">
                  <DashboardRiskPage />
                </ModuleGate>
              }
            />
            <Route
              path="/dashboard/fleet"
              element={
                <ModuleGate module="dashboard">
                  <DashboardFleetPage />
                </ModuleGate>
              }
            />

            <Route
              path="/fleet"
              element={
                <ModuleGate module="fleet">
                  <VehiclesList />
                </ModuleGate>
              }
            />
            <Route
              path="/fleet/:id"
              element={
                <ModuleGate module="fleet">
                  <FleetVehicleDetailPage />
                </ModuleGate>
              }
            />
            <Route
              path="/fleet/vehicles"
              element={
                <ModuleGate module="fleet">
                  <Navigate to="/fleet" replace />
                </ModuleGate>
              }
            />
            <Route
              path="/fleet/maintenance"
              element={
                <ModuleGate module="fleet">
                  <FleetMaintenanceDashboardPage />
                </ModuleGate>
              }
            />
            <Route
              path="/fleet/compliance"
              element={
                <ModuleGate module="fleet">
                  <FleetComplianceDashboardPage />
                </ModuleGate>
              }
            />

            <Route
              path="/customers"
              element={
                <ModuleGate module="customers">
                  <CustomersPage />
                </ModuleGate>
              }
            />
            <Route
              path="/customers/:id"
              element={
                <ModuleGate module="customers">
                  <CustomerDetailPage />
                </ModuleGate>
              }
            />

            <Route
              path="/contracts"
              element={
                <ModuleGate module="contracts">
                  <ContractsPage />
                </ModuleGate>
              }
            />
            <Route
              path="/contracts/new"
              element={
                <ModuleGate module="contracts">
                  <ContractWizardPage />
                </ModuleGate>
              }
            />
            <Route
              path="/contracts/templates"
              element={
                <ModuleGate module="contracts">
                  <ContractTemplatesPage />
                </ModuleGate>
              }
            />
            <Route
              path="/contracts/:id"
              element={
                <ModuleGate module="contracts">
                  <ContractDetailPage />
                </ModuleGate>
              }
            />

            <Route
              path="/credit"
              element={
                <ModuleGate module="credit">
                  <CreditAnalysisPage />
                </ModuleGate>
              }
            />

            <Route
              path="/finance"
              element={
                <ModuleGate module="finance">
                  <FinancePage />
                </ModuleGate>
              }
            />
            <Route
              path="/finance/invoices"
              element={
                <ModuleGate module="finance">
                  <InvoicesPage />
                </ModuleGate>
              }
            />
            <Route
              path="/finance/invoices/:id"
              element={
                <ModuleGate module="finance">
                  <InvoiceDetailPage />
                </ModuleGate>
              }
            />
            <Route
              path="/finance/payments"
              element={
                <ModuleGate module="finance">
                  <PaymentsPage />
                </ModuleGate>
              }
            />
            <Route
              path="/finance/treasury"
              element={
                <ModuleGate module="finance">
                  <TreasuryPage />
                </ModuleGate>
              }
            />
            <Route
              path="/customers/:id/statement"
              element={
                <ModuleGate module="customers">
                  <CustomerStatementPage />
                </ModuleGate>
              }
            />

            {/* Phase 11 — Accounting */}
            <Route
              path="/accounting"
              element={
                <ModuleGate module="accounting">
                  <AccountingPage />
                </ModuleGate>
              }
            />
            <Route
              path="/accounting/chart"
              element={
                <ModuleGate module="accounting">
                  <ChartOfAccountsPage />
                </ModuleGate>
              }
            />
            <Route
              path="/accounting/journals"
              element={
                <ModuleGate module="accounting">
                  <JournalsPage />
                </ModuleGate>
              }
            />
            <Route
              path="/accounting/entries"
              element={
                <ModuleGate module="accounting">
                  <EntriesPage />
                </ModuleGate>
              }
            />
            <Route
              path="/accounting/entries/new"
              element={
                <ModuleGate module="accounting">
                  <JournalEntryForm />
                </ModuleGate>
              }
            />
            <Route
              path="/accounting/entries/:id"
              element={
                <ModuleGate module="accounting">
                  <EntryDetailPage />
                </ModuleGate>
              }
            />
            <Route
              path="/accounting/fixed-assets"
              element={
                <ModuleGate module="accounting">
                  <FixedAssetsPage />
                </ModuleGate>
              }
            />
            <Route
              path="/accounting/fixed-assets/:id"
              element={
                <ModuleGate module="accounting">
                  <FixedAssetDetailPage />
                </ModuleGate>
              }
            />
            <Route
              path="/accounting/reports/trial-balance"
              element={
                <ModuleGate module="accounting">
                  <TrialBalancePage />
                </ModuleGate>
              }
            />
            <Route
              path="/accounting/reports/balance-sheet"
              element={
                <ModuleGate module="accounting">
                  <BalanceSheetPage />
                </ModuleGate>
              }
            />
            <Route
              path="/accounting/reports/income-statement"
              element={
                <ModuleGate module="accounting">
                  <IncomeStatementPage />
                </ModuleGate>
              }
            />
            <Route
              path="/accounting/reports/tax-report"
              element={
                <ModuleGate module="accounting">
                  <TaxReportPage />
                </ModuleGate>
              }
            />
            <Route
              path="/accounting/settings"
              element={
                <ModuleGate module="accounting">
                  <AccountingSettingsPage />
                </ModuleGate>
              }
            />

            {/* Phase 12 — Arrears / Contentieux */}
            <Route
              path="/arrears"
              element={
                <ModuleGate module="arrears">
                  <ArrearsDashboardPage />
                </ModuleGate>
              }
            />
            <Route
              path="/arrears/legal"
              element={
                <ModuleGate module="arrears">
                  <LegalCasesPage />
                </ModuleGate>
              }
            />
            <Route
              path="/arrears/legal/:id"
              element={
                <ModuleGate module="arrears">
                  <LegalCaseDetailPage />
                </ModuleGate>
              }
            />
            <Route
              path="/arrears/:id"
              element={
                <ModuleGate module="arrears">
                  <ArrearsCaseDetailPage />
                </ModuleGate>
              }
            />

            {/* Phase 13 — Electronic Signature */}
            <Route
              path="/signatures"
              element={
                <ModuleGate module="signatures">
                  <SignatureEnvelopesPage />
                </ModuleGate>
              }
            />
            <Route
              path="/signatures/:id"
              element={
                <ModuleGate module="signatures">
                  <SignatureEnvelopeDetailPage />
                </ModuleGate>
              }
            />

            <Route
              path="/used-cars"
              element={
                <ModuleGate module="usedCars">
                  <UsedCarsPage />
                </ModuleGate>
              }
            />
            <Route
              path="/used-cars/:id"
              element={
                <ModuleGate module="usedCars">
                  <UsedCarDetailPage />
                </ModuleGate>
              }
            />

            <Route
              path="/gps"
              element={
                <ModuleGate module="gps">
                  <GpsDashboardPage />
                </ModuleGate>
              }
            />
            <Route
              path="/gps/alerts"
              element={
                <ModuleGate module="gps">
                  <GpsAlertsPage />
                </ModuleGate>
              }
            />
            <Route
              path="/gps/geofences"
              element={
                <ModuleGate module="gps">
                  <GeofencesPage />
                </ModuleGate>
              }
            />
            <Route
              path="/gps/vehicles/:id/live"
              element={
                <ModuleGate module="gps">
                  <VehicleLiveTrackingPage />
                </ModuleGate>
              }
            />
            <Route
              path="/gps/vehicles/:id/trips"
              element={
                <ModuleGate module="gps">
                  <VehicleTripsPage />
                </ModuleGate>
              }
            />

            <Route
              path="/ai"
              element={
                <ModuleGate module="ai">
                  <AiHubPage />
                </ModuleGate>
              }
            />
            <Route
              path="/ai/assistant"
              element={
                <ModuleGate module="ai">
                  <AiRoleGate roles={['ADMIN', 'DIRECTEUR']}>
                    <AiAssistantPage />
                  </AiRoleGate>
                </ModuleGate>
              }
            />
            <Route
              path="/ai/predictions/maintenance"
              element={
                <ModuleGate module="ai">
                  <AiRoleGate roles={['ADMIN', 'DIRECTEUR', 'GESTIONNAIRE_FLOTTE']}>
                    <AiMaintenancePredictionPage />
                  </AiRoleGate>
                </ModuleGate>
              }
            />
            <Route
              path="/ai/predictions/credit-risk"
              element={
                <ModuleGate module="ai">
                  <AiRoleGate roles={['ADMIN', 'DIRECTEUR', 'ANALYSTE_CREDIT']}>
                    <AiCreditRiskPredictionPage />
                  </AiRoleGate>
                </ModuleGate>
              }
            />
            <Route
              path="/ai/predictions/cash-flow"
              element={
                <ModuleGate module="ai">
                  <AiRoleGate roles={['ADMIN', 'DIRECTEUR', 'COMPTABLE']}>
                    <AiCashFlowPredictionPage />
                  </AiRoleGate>
                </ModuleGate>
              }
            />
            <Route
              path="/ai/predictions/vehicle-pricing"
              element={
                <ModuleGate module="ai">
                  <AiRoleGate roles={['ADMIN', 'DIRECTEUR', 'GESTIONNAIRE_FLOTTE']}>
                    <AiVehiclePricingPredictionPage />
                  </AiRoleGate>
                </ModuleGate>
              }
            />
            <Route
              path="/ai/anomalies"
              element={
                <ModuleGate module="ai">
                  <AiRoleGate roles={['ADMIN', 'DIRECTEUR', 'CONTENTIEUX']}>
                    <AiAnomaliesPage />
                  </AiRoleGate>
                </ModuleGate>
              }
            />

            <Route
              path="/mobile-ops"
              element={
                <ModuleGate module="mobileOps">
                  <MobileOpsPage />
                </ModuleGate>
              }
            />

            <Route
              path="/notifications"
              element={
                <ModuleGate module="notifications">
                  <NotificationsPage />
                </ModuleGate>
              }
            />

            <Route
              path="/settings"
              element={
                <ModuleGate module="settings">
                  <SettingsRoleGate>
                    <SettingsPage />
                  </SettingsRoleGate>
                </ModuleGate>
              }
            />
            <Route
              path="/settings/users"
              element={
                <ModuleGate module="settings">
                  <SettingsRoleGate>
                    <UserManagementPage />
                  </SettingsRoleGate>
                </ModuleGate>
              }
            />
            <Route
              path="/settings/roles"
              element={
                <ModuleGate module="settings">
                  <SettingsRoleGate>
                    <RolesPermissionsPage />
                  </SettingsRoleGate>
                </ModuleGate>
              }
            />
            <Route
              path="/settings/branches"
              element={
                <ModuleGate module="settings">
                  <SettingsRoleGate>
                    <BranchManagementPage />
                  </SettingsRoleGate>
                </ModuleGate>
              }
            />

            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/agence" element={<AgencePage />} />

            <Route
              path="/audit"
              element={
                <ModuleGate module="audit">
                  <AuditPage />
                </ModuleGate>
              }
            />

            <Route
              path="/documents"
              element={
                <ModuleGate module="documents">
                  <DocumentsCenterPage />
                </ModuleGate>
              }
            />

            <Route
              path="/rentals"
              element={
                <ModuleGate module="rentals">
                  <RentalsPage />
                </ModuleGate>
              }
            />

            {/* Sous-location */}
            <Route
              path="/fleet/sub-rentals"
              element={
                <ModuleGate module="subRentals">
                  <SubRentalsPage />
                </ModuleGate>
              }
            />
            <Route
              path="/fleet/sub-rentals/new"
              element={
                <ModuleGate module="subRentals">
                  <SubRentalCreatePage />
                </ModuleGate>
              }
            />
            <Route
              path="/fleet/sub-rentals/:id"
              element={
                <ModuleGate module="subRentals">
                  <SubRentalDetailPage />
                </ModuleGate>
              }
            />
            <Route
              path="/fleet/supplier-agencies"
              element={
                <ModuleGate module="subRentals">
                  <SupplierAgenciesPage />
                </ModuleGate>
              }
            />

            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Route>
      </Routes>
    </>
  );
}
