<?php

/**
 * ERP / RBAC baseline.
 *
 * The authoritative source for permissions is the DB (permissions ↔ roles
 * via role_permissions, see RbacSeeder). The map below is only consulted by
 * EnsurePermission as a *fallback* — useful before the seeder has run or
 * when the permissions table is empty in dev environments.
 *
 * ADMIN bypasses every permission check.
 */
return [

    'app_roles' => [
        'ADMIN',
        'DIRECTEUR',
        'ANALYSTE_CREDIT',
        'AGENT_COMMERCIAL',
        'GESTIONNAIRE_FLOTTE',
        'COMPTABLE',
        'CONTENTIEUX',
        'AGENT_LIVRAISON',
        'CLIENT_PORTAL',
        'AGENT',
    ],

    /**
     * Fallback permission → roles map.
     * Keep the granular keys aligned with RbacSeeder so behaviour is identical
     * if the DB catalogue is missing.
     */
    'permission_roles' => [
        // Legacy module-level (still consulted by SPA gates)
        'view_dashboard'      => ['ADMIN', 'DIRECTEUR', 'ANALYSTE_CREDIT', 'AGENT_COMMERCIAL', 'GESTIONNAIRE_FLOTTE', 'COMPTABLE', 'CONTENTIEUX', 'AGENT_LIVRAISON', 'AGENT'],
        'view_fleet'          => ['ADMIN', 'DIRECTEUR', 'GESTIONNAIRE_FLOTTE', 'AGENT_COMMERCIAL', 'AGENT', 'AGENT_LIVRAISON'],
        'manage_fleet'        => ['ADMIN', 'DIRECTEUR', 'GESTIONNAIRE_FLOTTE'],
        'view_gps'            => ['ADMIN', 'DIRECTEUR', 'GESTIONNAIRE_FLOTTE'],
        'manage_gps'          => ['ADMIN', 'DIRECTEUR', 'GESTIONNAIRE_FLOTTE'],
        'view_customers'      => ['ADMIN', 'DIRECTEUR', 'AGENT_COMMERCIAL', 'ANALYSTE_CREDIT', 'CONTENTIEUX', 'AGENT'],
        'manage_customers'    => ['ADMIN', 'DIRECTEUR', 'AGENT_COMMERCIAL'],
        'manage_kyc'          => ['ADMIN', 'DIRECTEUR', 'ANALYSTE_CREDIT'],
        'manage_blacklist'    => ['ADMIN', 'DIRECTEUR', 'CONTENTIEUX'],
        'view_contracts'      => ['ADMIN', 'DIRECTEUR', 'AGENT_COMMERCIAL', 'COMPTABLE', 'CONTENTIEUX', 'CLIENT_PORTAL', 'AGENT'],
        'manage_contracts'    => ['ADMIN', 'DIRECTEUR', 'AGENT_COMMERCIAL'],
        'sign_contracts'      => ['ADMIN', 'DIRECTEUR', 'AGENT_COMMERCIAL', 'CLIENT_PORTAL'],
        'view_credit'         => ['ADMIN', 'DIRECTEUR', 'ANALYSTE_CREDIT'],
        'decide_credit'       => ['ADMIN', 'DIRECTEUR', 'ANALYSTE_CREDIT'],
        'view_finance'        => ['ADMIN', 'DIRECTEUR', 'COMPTABLE'],
        'manage_finance'      => ['ADMIN', 'DIRECTEUR', 'COMPTABLE'],
        'view_arrears'        => ['ADMIN', 'DIRECTEUR', 'CONTENTIEUX', 'COMPTABLE'],
        'manage_arrears'      => ['ADMIN', 'DIRECTEUR', 'CONTENTIEUX'],
        'view_used_cars'      => ['ADMIN', 'DIRECTEUR', 'AGENT_COMMERCIAL', 'GESTIONNAIRE_FLOTTE'],
        'manage_used_cars'    => ['ADMIN', 'DIRECTEUR', 'AGENT_COMMERCIAL'],
        'manage_users'        => ['ADMIN', 'DIRECTEUR'],
        'manage_roles'        => ['ADMIN'],
        'manage_branches'     => ['ADMIN', 'DIRECTEUR'],
        'view_audit'          => ['ADMIN', 'DIRECTEUR'],
        'manage_settings'     => ['ADMIN'],
        'view_ai'             => ['ADMIN', 'DIRECTEUR', 'ANALYSTE_CREDIT', 'GESTIONNAIRE_FLOTTE', 'COMPTABLE', 'CONTENTIEUX'],
        'ai.overview'         => ['ADMIN', 'DIRECTEUR'],
        'ai.assistant'        => ['ADMIN', 'DIRECTEUR'],
        'ai.predictions.maintenance' => ['ADMIN', 'DIRECTEUR', 'GESTIONNAIRE_FLOTTE'],
        'ai.predictions.credit_risk' => ['ADMIN', 'DIRECTEUR', 'ANALYSTE_CREDIT'],
        'ai.predictions.cash_flow' => ['ADMIN', 'DIRECTEUR', 'COMPTABLE'],
        'ai.predictions.vehicle_pricing' => ['ADMIN', 'DIRECTEUR', 'GESTIONNAIRE_FLOTTE'],
        'ai.anomalies'        => ['ADMIN', 'DIRECTEUR', 'CONTENTIEUX'],
        'view_mobile_ops'     => ['ADMIN', 'DIRECTEUR', 'AGENT_LIVRAISON'],
        'view_notifications'  => ['ADMIN', 'DIRECTEUR'],
        'notifications.view' => ['ADMIN', 'DIRECTEUR', 'ANALYSTE_CREDIT', 'AGENT_COMMERCIAL', 'GESTIONNAIRE_FLOTTE', 'COMPTABLE', 'CONTENTIEUX', 'AGENT_LIVRAISON', 'CLIENT_PORTAL', 'AGENT'],
        'notifications.manage' => ['ADMIN', 'DIRECTEUR'],
        'notifications.retry' => ['ADMIN', 'DIRECTEUR'],

        // Granular — Fleet
        'vehicles.view'                 => ['ADMIN', 'DIRECTEUR', 'GESTIONNAIRE_FLOTTE', 'AGENT_COMMERCIAL', 'AGENT_LIVRAISON', 'AGENT'],
        'vehicles.create'               => ['ADMIN', 'DIRECTEUR', 'GESTIONNAIRE_FLOTTE'],
        'vehicles.update'               => ['ADMIN', 'DIRECTEUR', 'GESTIONNAIRE_FLOTTE'],
        'vehicles.delete'               => ['ADMIN', 'DIRECTEUR'],
        'vehicles.upload_photo'         => ['ADMIN', 'DIRECTEUR', 'GESTIONNAIRE_FLOTTE'],
        'vehicles.upload_document'      => ['ADMIN', 'DIRECTEUR', 'GESTIONNAIRE_FLOTTE'],
        'vehicles.view_profitability'   => ['ADMIN', 'DIRECTEUR', 'COMPTABLE', 'GESTIONNAIRE_FLOTTE'],
        'vehicles.view_history'         => ['ADMIN', 'DIRECTEUR', 'GESTIONNAIRE_FLOTTE'],
        'maintenance.view'              => ['ADMIN', 'DIRECTEUR', 'GESTIONNAIRE_FLOTTE'],
        'maintenance.manage'            => ['ADMIN', 'DIRECTEUR', 'GESTIONNAIRE_FLOTTE'],
        'maintenance.event_create'      => ['ADMIN', 'DIRECTEUR', 'GESTIONNAIRE_FLOTTE'],
        'odometer.create'               => ['ADMIN', 'DIRECTEUR', 'GESTIONNAIRE_FLOTTE', 'AGENT_LIVRAISON'],
        'repairs.view'                  => ['ADMIN', 'DIRECTEUR', 'GESTIONNAIRE_FLOTTE'],
        'repairs.manage'                => ['ADMIN', 'DIRECTEUR', 'GESTIONNAIRE_FLOTTE'],
        'accidents.view'                => ['ADMIN', 'DIRECTEUR', 'GESTIONNAIRE_FLOTTE'],
        'accidents.manage'              => ['ADMIN', 'DIRECTEUR', 'GESTIONNAIRE_FLOTTE'],
        'accidents.transition'          => ['ADMIN', 'DIRECTEUR', 'GESTIONNAIRE_FLOTTE'],

        // Granular — GPS
        'gps.devices.view'      => ['ADMIN', 'DIRECTEUR', 'GESTIONNAIRE_FLOTTE'],
        'gps.devices.manage'    => ['ADMIN', 'DIRECTEUR', 'GESTIONNAIRE_FLOTTE'],
        'gps.devices.assign'    => ['ADMIN', 'DIRECTEUR', 'GESTIONNAIRE_FLOTTE'],
        'gps.positions.view'    => ['ADMIN', 'DIRECTEUR', 'GESTIONNAIRE_FLOTTE', 'AGENT_LIVRAISON'],
        'gps.positions.ingest'  => ['ADMIN', 'GESTIONNAIRE_FLOTTE'],
        'gps.alerts.view'       => ['ADMIN', 'DIRECTEUR', 'GESTIONNAIRE_FLOTTE'],
        'trips.view'            => ['ADMIN', 'DIRECTEUR', 'GESTIONNAIRE_FLOTTE'],
        'geofences.view'        => ['ADMIN', 'DIRECTEUR', 'GESTIONNAIRE_FLOTTE'],
        'geofences.create'      => ['ADMIN', 'DIRECTEUR', 'GESTIONNAIRE_FLOTTE'],
        'geofences.assign'      => ['ADMIN', 'DIRECTEUR', 'GESTIONNAIRE_FLOTTE'],

        // Granular — Customers
        'customers.view'                  => ['ADMIN', 'DIRECTEUR', 'AGENT_COMMERCIAL', 'ANALYSTE_CREDIT', 'CONTENTIEUX', 'COMPTABLE', 'AGENT'],
        'customers.create'                => ['ADMIN', 'DIRECTEUR', 'AGENT_COMMERCIAL'],
        'customers.update'                => ['ADMIN', 'DIRECTEUR', 'AGENT_COMMERCIAL', 'ANALYSTE_CREDIT'],
        'customers.delete'                => ['ADMIN', 'DIRECTEUR'],
        'customers.view_dossier'          => ['ADMIN', 'DIRECTEUR', 'AGENT_COMMERCIAL', 'ANALYSTE_CREDIT', 'CONTENTIEUX'],
        'customers.manage_addresses'      => ['ADMIN', 'DIRECTEUR', 'AGENT_COMMERCIAL'],
        'customers.manage_contacts'       => ['ADMIN', 'DIRECTEUR', 'AGENT_COMMERCIAL'],
        'customers.manage_bank_accounts'  => ['ADMIN', 'DIRECTEUR', 'AGENT_COMMERCIAL'],
        'customers.manage_notes'          => ['ADMIN', 'DIRECTEUR', 'AGENT_COMMERCIAL', 'CONTENTIEUX'],
        'customers.blacklist'             => ['ADMIN', 'DIRECTEUR', 'CONTENTIEUX'],

        // Granular — KYC
        'kyc.view'              => ['ADMIN', 'DIRECTEUR', 'AGENT_COMMERCIAL', 'ANALYSTE_CREDIT'],
        'kyc.create_case'       => ['ADMIN', 'DIRECTEUR', 'AGENT_COMMERCIAL', 'ANALYSTE_CREDIT'],
        'kyc.upload_document'   => ['ADMIN', 'DIRECTEUR', 'AGENT_COMMERCIAL', 'ANALYSTE_CREDIT'],
        'kyc.delete_document'   => ['ADMIN', 'DIRECTEUR', 'ANALYSTE_CREDIT'],
        'kyc.verify_document'   => ['ADMIN', 'DIRECTEUR', 'ANALYSTE_CREDIT'],
        'kyc.approve'           => ['ADMIN', 'DIRECTEUR', 'ANALYSTE_CREDIT'],
        'kyc.reject'            => ['ADMIN', 'DIRECTEUR', 'ANALYSTE_CREDIT'],

        // Granular — Contracts
        'contracts.view'                => ['ADMIN', 'DIRECTEUR', 'AGENT_COMMERCIAL', 'COMPTABLE', 'CONTENTIEUX', 'CLIENT_PORTAL', 'AGENT', 'ANALYSTE_CREDIT'],
        'contracts.create'              => ['ADMIN', 'DIRECTEUR', 'AGENT_COMMERCIAL'],
        'contracts.update'              => ['ADMIN', 'DIRECTEUR', 'AGENT_COMMERCIAL'],
        'contracts.approve'             => ['ADMIN', 'DIRECTEUR'],
        'contracts.activate'            => ['ADMIN', 'DIRECTEUR'],
        'contracts.terminate'           => ['ADMIN', 'DIRECTEUR'],
        'contracts.generate_schedule'   => ['ADMIN', 'DIRECTEUR', 'AGENT_COMMERCIAL'],
        'contracts.view_installments'   => ['ADMIN', 'DIRECTEUR', 'AGENT_COMMERCIAL', 'COMPTABLE', 'CLIENT_PORTAL'],
        'contract_templates.view'       => ['ADMIN', 'DIRECTEUR', 'AGENT_COMMERCIAL'],
        'contract_templates.manage'     => ['ADMIN', 'DIRECTEUR'],

        // Granular — Credit
        'credit.view'    => ['ADMIN', 'DIRECTEUR', 'ANALYSTE_CREDIT', 'AGENT_COMMERCIAL'],
        'credit.create'  => ['ADMIN', 'DIRECTEUR', 'AGENT_COMMERCIAL', 'ANALYSTE_CREDIT'],
        'credit.update'  => ['ADMIN', 'DIRECTEUR', 'ANALYSTE_CREDIT'],
        'credit.score'   => ['ADMIN', 'DIRECTEUR', 'ANALYSTE_CREDIT'],
        'credit.decide'  => ['ADMIN', 'DIRECTEUR', 'ANALYSTE_CREDIT'],

        // Granular — Used cars
        'usedcars.view'              => ['ADMIN', 'DIRECTEUR', 'AGENT_COMMERCIAL', 'GESTIONNAIRE_FLOTTE'],
        'usedcars.view_valuations'   => ['ADMIN', 'DIRECTEUR', 'AGENT_COMMERCIAL', 'GESTIONNAIRE_FLOTTE'],
        'usedcars.create'            => ['ADMIN', 'DIRECTEUR', 'AGENT_COMMERCIAL', 'GESTIONNAIRE_FLOTTE'],
        'usedcars.update'            => ['ADMIN', 'DIRECTEUR', 'AGENT_COMMERCIAL', 'GESTIONNAIRE_FLOTTE'],
        'usedcars.delete'            => ['ADMIN', 'DIRECTEUR'],
        'usedcars.evaluate'          => ['ADMIN', 'DIRECTEUR', 'AGENT_COMMERCIAL', 'GESTIONNAIRE_FLOTTE'],
        'usedcars.publish'           => ['ADMIN', 'DIRECTEUR', 'AGENT_COMMERCIAL'],
        'usedcars.reserve'           => ['ADMIN', 'DIRECTEUR', 'AGENT_COMMERCIAL'],
        'usedcars.sell'              => ['ADMIN', 'DIRECTEUR'],
        'usedcars.transfer'          => ['ADMIN', 'DIRECTEUR'],

        // Granular — Invoicing / Payments / Treasury
        'invoices.view'                  => ['ADMIN', 'DIRECTEUR', 'COMPTABLE', 'AGENT_COMMERCIAL', 'CONTENTIEUX', 'CLIENT_PORTAL'],
        'invoices.create'                => ['ADMIN', 'DIRECTEUR', 'COMPTABLE'],
        'invoices.update'                => ['ADMIN', 'DIRECTEUR', 'COMPTABLE'],
        'invoices.delete'                => ['ADMIN', 'DIRECTEUR', 'COMPTABLE'],
        'invoices.issue'                 => ['ADMIN', 'DIRECTEUR', 'COMPTABLE'],
        'invoices.cancel'                => ['ADMIN', 'DIRECTEUR', 'COMPTABLE'],
        'invoices.generate_from_contract'=> ['ADMIN', 'DIRECTEUR', 'COMPTABLE', 'AGENT_COMMERCIAL'],
        'payments.view'                  => ['ADMIN', 'DIRECTEUR', 'COMPTABLE', 'AGENT_COMMERCIAL', 'CONTENTIEUX', 'CLIENT_PORTAL'],
        'payments.create'                => ['ADMIN', 'DIRECTEUR', 'COMPTABLE'],
        'payments.allocate'              => ['ADMIN', 'DIRECTEUR', 'COMPTABLE'],
        'payments.unallocate'            => ['ADMIN', 'DIRECTEUR', 'COMPTABLE'],
        'customer_balance.view'          => ['ADMIN', 'DIRECTEUR', 'COMPTABLE', 'AGENT_COMMERCIAL', 'CONTENTIEUX', 'CLIENT_PORTAL'],
        'treasury.view'                  => ['ADMIN', 'DIRECTEUR', 'COMPTABLE'],
        'treasury.manage'                => ['ADMIN', 'DIRECTEUR', 'COMPTABLE'],
        'treasury.import'                => ['ADMIN', 'DIRECTEUR', 'COMPTABLE'],
        'treasury.match'                 => ['ADMIN', 'DIRECTEUR', 'COMPTABLE'],

        // Granular — Accounting
        'accounting.accounts.view'       => ['ADMIN', 'DIRECTEUR', 'COMPTABLE'],
        'accounting.accounts.manage'     => ['ADMIN', 'DIRECTEUR', 'COMPTABLE'],
        'accounting.journals.view'       => ['ADMIN', 'DIRECTEUR', 'COMPTABLE'],
        'accounting.journals.manage'     => ['ADMIN', 'DIRECTEUR', 'COMPTABLE'],
        'accounting.entries.view'        => ['ADMIN', 'DIRECTEUR', 'COMPTABLE'],
        'accounting.entries.manage'      => ['ADMIN', 'DIRECTEUR', 'COMPTABLE'],
        'accounting.entries.post'        => ['ADMIN', 'DIRECTEUR', 'COMPTABLE'],
        'accounting.entries.cancel'      => ['ADMIN', 'DIRECTEUR', 'COMPTABLE'],
        'accounting.reports.view'        => ['ADMIN', 'DIRECTEUR', 'COMPTABLE'],
        'accounting.bridge.run'          => ['ADMIN', 'DIRECTEUR', 'COMPTABLE'],
        'taxes.view'                     => ['ADMIN', 'DIRECTEUR', 'COMPTABLE'],
        'taxes.manage'                   => ['ADMIN', 'DIRECTEUR', 'COMPTABLE'],
        'fiscal_years.view'              => ['ADMIN', 'DIRECTEUR', 'COMPTABLE'],
        'fiscal_years.manage'            => ['ADMIN', 'DIRECTEUR', 'COMPTABLE'],
        'fiscal_years.close'             => ['ADMIN', 'DIRECTEUR', 'COMPTABLE'],
        'fixed_assets.view'              => ['ADMIN', 'DIRECTEUR', 'COMPTABLE'],
        'fixed_assets.manage'            => ['ADMIN', 'DIRECTEUR', 'COMPTABLE'],
        'fixed_assets.dispose'           => ['ADMIN', 'DIRECTEUR', 'COMPTABLE'],
        'fixed_assets.depreciate'        => ['ADMIN', 'DIRECTEUR', 'COMPTABLE'],

        // Granular — Arrears & Legal
        'arrears.view'      => ['ADMIN', 'DIRECTEUR', 'CONTENTIEUX', 'COMPTABLE'],
        'arrears.create'    => ['ADMIN', 'DIRECTEUR', 'CONTENTIEUX'],
        'arrears.update'    => ['ADMIN', 'DIRECTEUR', 'CONTENTIEUX'],
        'arrears.action'    => ['ADMIN', 'DIRECTEUR', 'CONTENTIEUX'],
        'arrears.escalate'  => ['ADMIN', 'DIRECTEUR', 'CONTENTIEUX'],
        'legal.view'        => ['ADMIN', 'DIRECTEUR', 'CONTENTIEUX'],
        'legal.manage'      => ['ADMIN', 'DIRECTEUR', 'CONTENTIEUX'],
        'legal.repossess'   => ['ADMIN', 'DIRECTEUR', 'CONTENTIEUX'],

        // Granular — Signatures
        'signatures.view'    => ['ADMIN', 'DIRECTEUR', 'AGENT_COMMERCIAL', 'CLIENT_PORTAL'],
        'signatures.create'  => ['ADMIN', 'DIRECTEUR', 'AGENT_COMMERCIAL'],
        'signatures.send'    => ['ADMIN', 'DIRECTEUR', 'AGENT_COMMERCIAL'],
        'signatures.void'    => ['ADMIN', 'DIRECTEUR'],
        'signatures.sign'    => ['ADMIN', 'DIRECTEUR', 'AGENT_COMMERCIAL', 'CLIENT_PORTAL'],
        'signatures.decline' => ['ADMIN', 'DIRECTEUR', 'AGENT_COMMERCIAL', 'CLIENT_PORTAL'],

        // Granular — Reservations / Missions
        'reservations.view'             => ['ADMIN', 'DIRECTEUR', 'AGENT_COMMERCIAL', 'GESTIONNAIRE_FLOTTE'],
        'reservations.create'           => ['ADMIN', 'DIRECTEUR', 'AGENT_COMMERCIAL', 'GESTIONNAIRE_FLOTTE'],
        'reservations.create_mission'   => ['ADMIN', 'DIRECTEUR', 'GESTIONNAIRE_FLOTTE', 'AGENT_COMMERCIAL'],
        'missions.view'                 => ['ADMIN', 'DIRECTEUR', 'GESTIONNAIRE_FLOTTE', 'AGENT_LIVRAISON'],
        'missions.start'                => ['ADMIN', 'AGENT_LIVRAISON'],
        'missions.complete'             => ['ADMIN', 'AGENT_LIVRAISON'],
        'missions.add_checklist'        => ['ADMIN', 'AGENT_LIVRAISON'],
        'missions.upload_photo'         => ['ADMIN', 'AGENT_LIVRAISON'],

        // Granular — Dashboard
        'dashboard.executive' => ['ADMIN', 'DIRECTEUR'],
        'dashboard.finance'   => ['ADMIN', 'DIRECTEUR', 'COMPTABLE'],
        'dashboard.risk'      => ['ADMIN', 'DIRECTEUR', 'ANALYSTE_CREDIT', 'CONTENTIEUX'],
        'dashboard.fleet'     => ['ADMIN', 'DIRECTEUR', 'GESTIONNAIRE_FLOTTE', 'AGENT_COMMERCIAL'],
        'dashboard.gps'       => ['ADMIN', 'DIRECTEUR', 'GESTIONNAIRE_FLOTTE'],

        // Granular — Admin
        'users.view'                 => ['ADMIN', 'DIRECTEUR'],
        'users.create'               => ['ADMIN', 'DIRECTEUR'],
        'users.update'               => ['ADMIN', 'DIRECTEUR'],
        'users.delete'               => ['ADMIN'],
        'users.activate'             => ['ADMIN', 'DIRECTEUR'],
        'users.assign_branches'      => ['ADMIN', 'DIRECTEUR'],
        'users.view_login_history'   => ['ADMIN', 'DIRECTEUR'],
        'roles.view'                 => ['ADMIN', 'DIRECTEUR'],
        'roles.manage'               => ['ADMIN'],
        'roles.sync_permissions'     => ['ADMIN'],
        'permissions.view'           => ['ADMIN', 'DIRECTEUR'],
        'branches.view'              => ['ADMIN', 'DIRECTEUR'],
        'branches.manage'            => ['ADMIN', 'DIRECTEUR'],
        'audit.view'                 => ['ADMIN', 'DIRECTEUR', 'COMPTABLE', 'CONTENTIEUX'],
        'audit.export'               => ['ADMIN', 'DIRECTEUR'],
        'documents.view'             => ['ADMIN', 'DIRECTEUR', 'GESTIONNAIRE_FLOTTE', 'AGENT_COMMERCIAL', 'COMPTABLE', 'ANALYSTE_CREDIT', 'AGENT_LIVRAISON', 'CONTENTIEUX', 'AGENT', 'CLIENT_PORTAL'],
        'documents.upload'           => ['ADMIN', 'DIRECTEUR', 'GESTIONNAIRE_FLOTTE', 'AGENT_COMMERCIAL', 'COMPTABLE', 'ANALYSTE_CREDIT', 'AGENT_LIVRAISON'],
        'documents.delete'           => ['ADMIN', 'DIRECTEUR', 'GESTIONNAIRE_FLOTTE', 'CONTENTIEUX'],
        'documents.generate'         => ['ADMIN', 'DIRECTEUR', 'AGENT_COMMERCIAL', 'COMPTABLE'],
    ],
];
