<?php

namespace Database\Seeders;

use App\Models\Permission;
use App\Models\Role;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Schema;

class RbacSeeder extends Seeder
{
    /**
     * Seed the canonical permissions catalogue and sync permissions to system roles.
     *
     * Two naming conventions coexist:
     *   - Module-level (legacy): view_fleet, manage_fleet, ...
     *   - Granular dot-notation: vehicles.update, kyc.approve, ...
     *
     * Both are kept so older middleware and the SPA's permission checks keep
     * working while the granular keys take over enforcement on the API.
     */
    public function run(): void
    {
        if (! Schema::hasTable('permissions') || ! Schema::hasTable('roles') || ! Schema::hasTable('role_permissions')) {
            $this->command?->warn('RbacSeeder: permissions/roles tables missing, run migrations first.');

            return;
        }

        $permissions = [
            // === Legacy module-level (kept for SPA navigation gates) ===
            ['view_dashboard', 'dashboard', 'Consulter le tableau de bord direction'],
            ['view_fleet', 'fleet', 'Consulter la flotte'],
            ['manage_fleet', 'fleet', 'Gérer la flotte'],
            ['view_gps', 'gps', 'Consulter le suivi GPS'],
            ['manage_gps', 'gps', 'Gérer GPS / géofences'],
            ['view_customers', 'customers', 'Consulter les clients'],
            ['manage_customers', 'customers', 'Gérer les clients'],
            ['manage_kyc', 'customers', 'Valider les dossiers KYC'],
            ['manage_blacklist', 'customers', 'Gérer la liste noire'],
            ['view_contracts', 'contracts', 'Consulter les contrats'],
            ['manage_contracts', 'contracts', 'Gérer les contrats'],
            ['sign_contracts', 'contracts', 'Signer électroniquement les contrats'],
            ['view_credit', 'credit', 'Consulter les dossiers crédit'],
            ['decide_credit', 'credit', 'Décider les dossiers crédit'],
            ['view_finance', 'finance', 'Consulter la finance & comptabilité'],
            ['manage_finance', 'finance', 'Gérer écritures et clôtures'],
            ['view_arrears', 'arrears', 'Consulter les impayés'],
            ['manage_arrears', 'arrears', 'Traiter les impayés'],
            ['view_used_cars', 'used_cars', 'Consulter les VO'],
            ['manage_used_cars', 'used_cars', 'Gérer les VO'],
            ['manage_users', 'admin', 'Gérer les utilisateurs'],
            ['manage_roles', 'admin', 'Gérer les rôles'],
            ['manage_branches', 'admin', 'Gérer les agences'],
            ['view_audit', 'admin', 'Consulter les journaux'],
            ['manage_settings', 'admin', 'Paramètres système'],
            ['view_ai', 'ai', 'Consulter les insights IA'],
            ['ai.overview', 'ai', 'Consulter la vue globale IA'],
            ['ai.assistant', 'ai', 'Utiliser l assistant IA'],
            ['ai.predictions.maintenance', 'ai', 'Voir les predictions maintenance'],
            ['ai.predictions.credit_risk', 'ai', 'Voir les predictions risque credit'],
            ['ai.predictions.cash_flow', 'ai', 'Voir les predictions de tresorerie'],
            ['ai.predictions.vehicle_pricing', 'ai', 'Voir les predictions pricing VO'],
            ['ai.anomalies', 'ai', 'Voir les anomalies detectees'],
            ['view_mobile_ops', 'mobile_ops', 'Consulter les opérations terrain'],
            ['view_notifications', 'notifications', 'Consulter les notifications (legacy)'],
            ['notifications.view', 'notifications', 'Centre de notifications'],
            ['notifications.manage', 'notifications', 'Gérer les modèles de notification'],
            ['notifications.retry', 'notifications', 'Relancer les livraisons échouées'],

            // === Granular — Fleet ===
            ['vehicles.view', 'fleet', 'Voir les véhicules'],
            ['vehicles.create', 'fleet', 'Créer un véhicule'],
            ['vehicles.update', 'fleet', 'Modifier un véhicule'],
            ['vehicles.delete', 'fleet', 'Supprimer un véhicule'],
            ['vehicles.upload_photo', 'fleet', 'Téléverser photo véhicule'],
            ['vehicles.upload_document', 'fleet', 'Téléverser document véhicule'],
            ['vehicles.view_profitability', 'fleet', 'Voir la rentabilité d\'un véhicule'],
            ['vehicles.view_history', 'fleet', 'Voir l\'historique complet véhicule'],
            ['maintenance.view', 'fleet', 'Voir les plans de maintenance'],
            ['maintenance.manage', 'fleet', 'Gérer les plans de maintenance'],
            ['maintenance.event_create', 'fleet', 'Enregistrer un événement maintenance'],
            ['odometer.create', 'fleet', 'Saisir relevé compteur'],
            ['repairs.view', 'fleet', 'Voir les réparations'],
            ['repairs.manage', 'fleet', 'Gérer les réparations'],
            ['accidents.view', 'fleet', 'Voir les sinistres'],
            ['accidents.manage', 'fleet', 'Gérer les sinistres'],
            ['accidents.transition', 'fleet', 'Transitionner un sinistre'],

            // === Granular — GPS ===
            ['gps.devices.view', 'gps', 'Voir les boîtiers GPS'],
            ['gps.devices.manage', 'gps', 'Gérer les boîtiers GPS'],
            ['gps.devices.assign', 'gps', 'Affecter un boîtier'],
            ['gps.positions.view', 'gps', 'Voir les positions GPS'],
            ['gps.positions.ingest', 'gps', 'Ingestion positions GPS (système)'],
            ['gps.alerts.view', 'gps', 'Voir les alertes GPS'],
            ['trips.view', 'gps', 'Voir les trajets'],
            ['geofences.view', 'gps', 'Voir les géofences'],
            ['geofences.create', 'gps', 'Créer une géofence'],
            ['geofences.assign', 'gps', 'Affecter une géofence'],

            // === Granular — Customers ===
            ['customers.view', 'customers', 'Voir les clients'],
            ['customers.create', 'customers', 'Créer un client'],
            ['customers.update', 'customers', 'Modifier un client'],
            ['customers.delete', 'customers', 'Supprimer un client'],
            ['customers.view_dossier', 'customers', 'Voir le dossier client complet'],
            ['customers.manage_addresses', 'customers', 'Gérer les adresses client'],
            ['customers.manage_contacts', 'customers', 'Gérer les contacts client'],
            ['customers.manage_bank_accounts', 'customers', 'Gérer les comptes bancaires client'],
            ['customers.manage_notes', 'customers', 'Gérer les notes client'],
            ['customers.blacklist', 'customers', 'Mettre / sortir de liste noire'],

            // === Granular — KYC ===
            ['kyc.view', 'customers', 'Voir les dossiers KYC'],
            ['kyc.create_case', 'customers', 'Créer un dossier KYC'],
            ['kyc.upload_document', 'customers', 'Téléverser document KYC'],
            ['kyc.delete_document', 'customers', 'Supprimer document KYC'],
            ['kyc.verify_document', 'customers', 'Vérifier un document KYC'],
            ['kyc.approve', 'customers', 'Approuver un dossier KYC'],
            ['kyc.reject', 'customers', 'Rejeter un dossier KYC'],

            // === Granular — Contracts ===
            ['contracts.view', 'contracts', 'Voir les contrats'],
            ['contracts.create', 'contracts', 'Créer un contrat'],
            ['contracts.update', 'contracts', 'Modifier un contrat'],
            ['contracts.approve', 'contracts', 'Approuver un contrat'],
            ['contracts.activate', 'contracts', 'Activer un contrat'],
            ['contracts.terminate', 'contracts', 'Résilier un contrat'],
            ['contracts.generate_schedule', 'contracts', 'Générer l\'échéancier'],
            ['contracts.view_installments', 'contracts', 'Voir les échéances'],
            ['contract_templates.view', 'contracts', 'Voir les modèles de contrat'],
            ['contract_templates.manage', 'contracts', 'Gérer les modèles de contrat'],

            // === Granular — Credit ===
            ['credit.view', 'credit', 'Voir les dossiers crédit'],
            ['credit.create', 'credit', 'Créer un dossier crédit'],
            ['credit.update', 'credit', 'Modifier un dossier crédit'],
            ['credit.score', 'credit', 'Scorer un dossier crédit'],
            ['credit.decide', 'credit', 'Décider un dossier crédit'],

            // === Granular — Used cars (VO) ===
            ['usedcars.view', 'used_cars', 'Voir les VO'],
            ['usedcars.create', 'used_cars', 'Créer une annonce VO'],
            ['usedcars.update', 'used_cars', 'Modifier une annonce VO'],
            ['usedcars.delete', 'used_cars', 'Supprimer une annonce VO'],
            ['usedcars.evaluate', 'used_cars', 'Évaluer un VO'],
            ['usedcars.publish', 'used_cars', 'Publier un VO'],
            ['usedcars.reserve', 'used_cars', 'Réserver un VO'],
            ['usedcars.sell', 'used_cars', 'Vendre un VO'],
            ['usedcars.transfer', 'used_cars', 'Gérer transfert de propriété'],
            ['usedcars.view_valuations', 'used_cars', 'Voir les évaluations VO'],

            // === Granular — Invoicing / Payments / Treasury ===
            ['invoices.view', 'finance', 'Voir les factures'],
            ['invoices.create', 'finance', 'Créer une facture'],
            ['invoices.update', 'finance', 'Modifier une facture'],
            ['invoices.delete', 'finance', 'Supprimer une facture'],
            ['invoices.issue', 'finance', 'Émettre une facture'],
            ['invoices.cancel', 'finance', 'Annuler une facture'],
            ['invoices.generate_from_contract', 'finance', 'Générer facture depuis contrat'],
            ['payments.view', 'finance', 'Voir les paiements'],
            ['payments.create', 'finance', 'Saisir un paiement'],
            ['payments.allocate', 'finance', 'Affecter un paiement'],
            ['payments.unallocate', 'finance', 'Retirer une affectation'],
            ['customer_balance.view', 'finance', 'Voir solde client'],
            ['treasury.view', 'finance', 'Voir trésorerie'],
            ['treasury.manage', 'finance', 'Gérer comptes bancaires'],
            ['treasury.import', 'finance', 'Importer transactions bancaires'],
            ['treasury.match', 'finance', 'Rapprochement bancaire'],

            // === Granular — Accounting ===
            ['accounting.accounts.view', 'finance', 'Voir le plan comptable'],
            ['accounting.accounts.manage', 'finance', 'Gérer le plan comptable'],
            ['accounting.journals.view', 'finance', 'Voir les journaux'],
            ['accounting.journals.manage', 'finance', 'Gérer les journaux'],
            ['accounting.entries.view', 'finance', 'Voir les écritures'],
            ['accounting.entries.manage', 'finance', 'Gérer les écritures'],
            ['accounting.entries.post', 'finance', 'Comptabiliser une écriture'],
            ['accounting.entries.cancel', 'finance', 'Annuler une écriture'],
            ['accounting.reports.view', 'finance', 'Voir les rapports comptables'],
            ['accounting.bridge.run', 'finance', 'Lancer ponts comptables'],
            ['taxes.view', 'finance', 'Voir taxes'],
            ['taxes.manage', 'finance', 'Gérer taxes'],
            ['fiscal_years.view', 'finance', 'Voir exercices'],
            ['fiscal_years.manage', 'finance', 'Gérer exercices'],
            ['fiscal_years.close', 'finance', 'Clôturer un exercice'],
            ['fixed_assets.view', 'finance', 'Voir immobilisations'],
            ['fixed_assets.manage', 'finance', 'Gérer immobilisations'],
            ['fixed_assets.dispose', 'finance', 'Sortir une immobilisation'],
            ['fixed_assets.depreciate', 'finance', 'Amortir une immobilisation'],

            // === Granular — Arrears / Legal ===
            ['arrears.view', 'arrears', 'Voir les dossiers impayés'],
            ['arrears.create', 'arrears', 'Créer un dossier impayé'],
            ['arrears.update', 'arrears', 'Modifier un dossier impayé'],
            ['arrears.action', 'arrears', 'Action sur dossier impayé'],
            ['arrears.escalate', 'arrears', 'Escalader un dossier impayé'],
            ['legal.view', 'arrears', 'Voir les dossiers contentieux'],
            ['legal.manage', 'arrears', 'Gérer les dossiers contentieux'],
            ['legal.repossess', 'arrears', 'Ordres de reprise véhicule'],

            // === Granular — Signatures ===
            ['signatures.view', 'contracts', 'Voir les enveloppes signature'],
            ['signatures.create', 'contracts', 'Créer une enveloppe signature'],
            ['signatures.send', 'contracts', 'Envoyer une enveloppe signature'],
            ['signatures.void', 'contracts', 'Annuler une enveloppe signature'],
            ['signatures.sign', 'contracts', 'Signer (OTP / signature)'],
            ['signatures.decline', 'contracts', 'Refuser de signer'],

            // === Granular — Reservations / Missions ===
            ['reservations.view', 'fleet', 'Voir les réservations'],
            ['reservations.create', 'fleet', 'Créer une réservation'],
            ['reservations.create_mission', 'fleet', 'Convertir réservation en mission'],
            ['missions.view', 'mobile_ops', 'Voir les missions'],
            ['missions.start', 'mobile_ops', 'Démarrer une mission'],
            ['missions.complete', 'mobile_ops', 'Clôturer une mission'],
            ['missions.add_checklist', 'mobile_ops', 'Ajouter check-list mission'],
            ['missions.upload_photo', 'mobile_ops', 'Téléverser photo mission'],
            ['missions.customer_signature', 'mobile_ops', 'Capturer la signature client sur mission'],
            ['mobile_ops.customer_tracking', 'mobile_ops', 'Suivi client de ses propres livraisons'],
            ['reservations.confirm', 'fleet', 'Confirmer une réservation'],
            ['reservations.cancel', 'fleet', 'Annuler une réservation'],
            ['rentals.availability', 'fleet', 'Consulter disponibilité location'],
            ['rentals.handover_pickup', 'mobile_ops', 'Effectuer handover pickup'],
            ['rentals.handover_return', 'mobile_ops', 'Effectuer handover return'],
            ['rentals.extension', 'fleet', 'Gérer extensions de location'],
            ['rentals.damage_report', 'fleet', 'Déclarer dommage location'],
            ['rentals.close_billing', 'finance', 'Clôturer facturation location'],

            // === Granular — Dashboard ===
            ['dashboard.executive', 'dashboard', 'KPI exécutif'],
            ['dashboard.finance', 'dashboard', 'KPI finance'],
            ['dashboard.risk', 'dashboard', 'KPI risque'],
            ['dashboard.fleet', 'dashboard', 'KPI flotte'],
            ['dashboard.gps', 'dashboard', 'KPI GPS'],

            // === Granular — Admin ===
            ['users.view', 'admin', 'Voir les utilisateurs'],
            ['users.create', 'admin', 'Créer un utilisateur'],
            ['users.update', 'admin', 'Modifier un utilisateur'],
            ['users.delete', 'admin', 'Supprimer un utilisateur'],
            ['users.activate', 'admin', 'Activer / désactiver un utilisateur'],
            ['users.assign_branches', 'admin', 'Affecter des agences à un utilisateur'],
            ['users.view_login_history', 'admin', 'Voir l\'historique de connexion'],
            ['roles.view', 'admin', 'Voir les rôles'],
            ['roles.manage', 'admin', 'Gérer les rôles'],
            ['roles.sync_permissions', 'admin', 'Modifier les permissions d\'un rôle'],
            ['permissions.view', 'admin', 'Voir le catalogue de permissions'],
            ['branches.view', 'admin', 'Voir les agences'],
            ['branches.manage', 'admin', 'Gérer les agences'],
            ['audit.view', 'admin', 'Consulter les journaux d\'audit (granulaire)'],
            ['audit.export', 'admin', 'Exporter les journaux d\'audit en CSV'],
            ['documents.view', 'documents', 'Consulter le centre documentaire'],
            ['documents.upload', 'documents', 'Téléverser / rattacher des documents'],
            ['documents.delete', 'documents', 'Supprimer des documents du centre'],
            ['documents.generate', 'documents', 'Générer un PDF (contrat / facture)'],
        ];

        foreach ($permissions as [$code, $module, $desc]) {
            Permission::query()->updateOrCreate(
                ['code' => $code],
                ['module_name' => $module, 'action_name' => ucfirst(str_replace(['_', '.'], [' ', ' '], $code)), 'description' => $desc]
            );
        }

        // Granular permission bundles per role
        $finance_read = ['invoices.view', 'payments.view', 'customer_balance.view', 'treasury.view', 'accounting.accounts.view', 'accounting.journals.view', 'accounting.entries.view', 'accounting.reports.view', 'taxes.view', 'fiscal_years.view', 'fixed_assets.view'];
        $finance_write = ['invoices.create', 'invoices.update', 'invoices.delete', 'invoices.issue', 'invoices.cancel', 'invoices.generate_from_contract', 'payments.create', 'payments.allocate', 'payments.unallocate', 'treasury.manage', 'treasury.import', 'treasury.match', 'accounting.accounts.manage', 'accounting.journals.manage', 'accounting.entries.manage', 'accounting.entries.post', 'accounting.entries.cancel', 'accounting.bridge.run', 'taxes.manage', 'fiscal_years.manage', 'fiscal_years.close', 'fixed_assets.manage', 'fixed_assets.dispose', 'fixed_assets.depreciate'];

        $fleet_read = ['vehicles.view', 'vehicles.view_history', 'vehicles.view_profitability', 'maintenance.view', 'repairs.view', 'accidents.view', 'reservations.view'];
        $fleet_write = ['vehicles.create', 'vehicles.update', 'vehicles.delete', 'vehicles.upload_photo', 'vehicles.upload_document', 'documents.upload', 'documents.delete', 'maintenance.manage', 'maintenance.event_create', 'odometer.create', 'repairs.manage', 'accidents.manage', 'accidents.transition', 'reservations.create', 'reservations.create_mission'];

        $gps_read = ['gps.devices.view', 'gps.positions.view', 'gps.alerts.view', 'trips.view', 'geofences.view'];
        $gps_write = ['gps.devices.manage', 'gps.devices.assign', 'gps.positions.ingest', 'geofences.create', 'geofences.assign'];

        $customers_read = ['customers.view', 'customers.view_dossier', 'kyc.view'];
        $customers_write = ['customers.create', 'customers.update', 'customers.delete', 'customers.manage_addresses', 'customers.manage_contacts', 'customers.manage_bank_accounts', 'customers.manage_notes', 'kyc.create_case', 'kyc.upload_document', 'kyc.delete_document', 'documents.upload'];

        $contracts_read = ['contracts.view', 'contracts.view_installments', 'contract_templates.view', 'signatures.view'];
        $contracts_write = ['contracts.create', 'contracts.update', 'contracts.generate_schedule', 'contract_templates.manage', 'signatures.create', 'signatures.send', 'documents.upload'];

        $usedcars_read = ['usedcars.view', 'usedcars.view_valuations'];
        $usedcars_write = ['usedcars.create', 'usedcars.update', 'usedcars.delete', 'usedcars.evaluate', 'usedcars.publish', 'usedcars.reserve'];

        $arrears_read = ['arrears.view', 'legal.view'];
        $arrears_write = ['arrears.create', 'arrears.update', 'arrears.action', 'arrears.escalate', 'legal.manage', 'legal.repossess'];

        $missions_field = ['missions.view', 'missions.start', 'missions.complete', 'missions.add_checklist', 'missions.upload_photo', 'missions.customer_signature', 'documents.upload', 'documents.view'];

        $admin_full = ['users.view', 'users.create', 'users.update', 'users.delete', 'users.activate', 'users.assign_branches', 'users.view_login_history', 'roles.view', 'roles.manage', 'roles.sync_permissions', 'permissions.view', 'branches.view', 'branches.manage', 'audit.view', 'documents.view', 'documents.upload', 'documents.delete', 'documents.generate'];

        $roleMatrix = [
            'ADMIN' => ['Administrateur système', '*'],

            'DIRECTEUR' => ['Directeur général', array_merge(
                ['view_dashboard', 'view_fleet', 'view_gps', 'view_customers', 'view_contracts', 'view_credit', 'view_finance', 'view_arrears', 'view_used_cars', 'view_audit', 'view_ai', 'view_mobile_ops', 'view_notifications', 'notifications.view', 'notifications.manage', 'notifications.retry', 'manage_customers', 'manage_fleet', 'manage_contracts', 'decide_credit', 'manage_finance', 'manage_arrears'],
                ['ai.overview', 'ai.assistant', 'ai.predictions.maintenance', 'ai.predictions.credit_risk', 'ai.predictions.cash_flow', 'ai.predictions.vehicle_pricing', 'ai.anomalies'],
                $fleet_read, $fleet_write,
                $gps_read,
                $customers_read, $customers_write,
                ['kyc.verify_document', 'kyc.approve', 'kyc.reject', 'customers.blacklist'],
                $contracts_read, $contracts_write,
                ['contracts.approve', 'contracts.activate', 'contracts.terminate', 'signatures.void'],
                ['credit.view', 'credit.create', 'credit.update', 'credit.score', 'credit.decide'],
                $usedcars_read, $usedcars_write, ['usedcars.sell', 'usedcars.transfer'],
                $finance_read, $finance_write,
                $arrears_read, $arrears_write,
                ['reservations.view', 'reservations.create', 'missions.view', 'missions.customer_signature', 'mobile_ops.customer_tracking'],
                ['reservations.confirm', 'reservations.cancel', 'rentals.availability', 'rentals.handover_pickup', 'rentals.handover_return', 'rentals.extension', 'rentals.damage_report', 'rentals.close_billing'],
                ['dashboard.executive', 'dashboard.finance', 'dashboard.risk', 'dashboard.fleet', 'dashboard.gps'],
                ['users.view', 'users.create', 'users.update', 'users.activate', 'users.assign_branches', 'users.view_login_history', 'roles.view', 'permissions.view', 'branches.view', 'branches.manage', 'audit.view', 'documents.view', 'documents.upload', 'documents.delete', 'documents.generate']
            )],

            'ANALYSTE_CREDIT' => ['Analyste crédit', array_merge(
                ['view_dashboard', 'view_customers', 'view_credit', 'decide_credit', 'view_contracts', 'view_ai', 'notifications.view'],
                ['ai.predictions.credit_risk'],
                $customers_read, ['customers.update'],
                ['kyc.view', 'kyc.create_case', 'kyc.upload_document', 'kyc.verify_document', 'kyc.approve', 'kyc.reject'],
                ['documents.view', 'documents.upload'],
                $contracts_read,
                ['credit.view', 'credit.create', 'credit.update', 'credit.score', 'credit.decide'],
                ['dashboard.risk']
            )],

            'AGENT_COMMERCIAL' => ['Agent commercial', array_merge(
                ['view_dashboard', 'view_fleet', 'view_customers', 'manage_customers', 'view_contracts', 'manage_contracts', 'sign_contracts', 'view_used_cars', 'manage_used_cars', 'notifications.view'],
                $fleet_read,
                $customers_read, $customers_write,
                $contracts_read, $contracts_write,
                ['signatures.sign', 'signatures.decline'],
                ['documents.view', 'documents.upload'],
                $usedcars_read, $usedcars_write,
                ['reservations.view', 'reservations.create', 'reservations.create_mission'],
                ['reservations.confirm', 'reservations.cancel', 'rentals.availability', 'rentals.extension', 'rentals.damage_report'],
                ['credit.view', 'credit.create'],
                ['invoices.view', 'invoices.generate_from_contract', 'customer_balance.view', 'payments.view'],
                ['dashboard.fleet']
            )],

            'GESTIONNAIRE_FLOTTE' => ['Gestionnaire de flotte', array_merge(
                ['view_dashboard', 'view_fleet', 'manage_fleet', 'view_gps', 'manage_gps', 'view_used_cars'],
                ['ai.predictions.maintenance', 'ai.predictions.vehicle_pricing'],
                $fleet_read, $fleet_write,
                ['documents.view'],
                $gps_read, $gps_write,
                $usedcars_read, ['usedcars.create', 'usedcars.update', 'usedcars.evaluate'],
                ['reservations.view', 'reservations.create', 'reservations.create_mission'],
                ['reservations.confirm', 'reservations.cancel', 'rentals.availability', 'rentals.extension', 'rentals.damage_report'],
                ['missions.view'],
                ['dashboard.fleet', 'dashboard.gps']
            )],

            'COMPTABLE' => ['Comptable', array_merge(
                ['view_dashboard', 'view_contracts', 'view_finance', 'manage_finance', 'view_arrears'],
                ['ai.predictions.cash_flow'],
                $contracts_read, ['contracts.view_installments'],
                ['customers.view', 'customer_balance.view'],
                ['documents.view', 'documents.upload', 'documents.generate'],
                $finance_read, $finance_write,
                ['arrears.view'],
                ['signatures.view'],
                ['dashboard.finance']
            )],

            'CONTENTIEUX' => ['Contentieux', array_merge(
                ['view_dashboard', 'view_customers', 'view_contracts', 'view_arrears', 'manage_arrears', 'notifications.view'],
                ['ai.anomalies'],
                ['customers.view', 'customers.view_dossier', 'customers.blacklist', 'customers.manage_notes'],
                ['documents.view', 'documents.upload', 'documents.delete'],
                $contracts_read,
                $arrears_read, $arrears_write,
                ['invoices.view', 'payments.view', 'customer_balance.view'],
                ['signatures.view'],
                ['dashboard.risk']
            )],

            'AGENT_LIVRAISON' => ['Agent de livraison', array_merge(
                ['view_dashboard', 'view_fleet', 'view_mobile_ops', 'notifications.view'],
                ['vehicles.view', 'odometer.create'],
                ['documents.view'],
                $missions_field,
                ['rentals.handover_pickup', 'rentals.handover_return'],
                ['gps.positions.view']
            )],

            'CLIENT_PORTAL' => ['Portail client', [
                'view_contracts',
                'contracts.view', 'contracts.view_installments',
                'invoices.view', 'payments.view', 'customer_balance.view',
                'signatures.view', 'signatures.sign', 'signatures.decline',
                'notifications.view',
                'documents.view',
                // Phase 3: Mobile Ops customer-safe tracking only — no internal
                // mission detail, no checklist/photo access, no agent identity.
                'mobile_ops.customer_tracking',
            ]],

            'AGENT' => ['Agent', array_merge(
                ['view_dashboard', 'view_customers', 'view_contracts', 'notifications.view'],
                ['customers.view', 'contracts.view', 'vehicles.view', 'documents.view']
            )],
        ];

        foreach ($roleMatrix as $code => [$name, $codes]) {
            $role = Role::query()->updateOrCreate(
                ['code' => $code],
                ['name' => $name, 'is_system_role' => true]
            );
            $grantCodes = $codes === '*'
                ? Permission::query()->pluck('code')->all()
                : $codes;
            $ids = Permission::query()->whereIn('code', $grantCodes)->pluck('id')->all();
            $role->permissions()->sync($ids);
        }
    }
}
