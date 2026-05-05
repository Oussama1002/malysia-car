-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Apr 23, 2026 at 03:09 AM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `driveflow_db`
--

-- --------------------------------------------------------

--
-- Table structure for table `accounting_journals`
--

CREATE TABLE `accounting_journals` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `company_id` char(36) NOT NULL,
  `journal_code` varchar(30) NOT NULL,
  `journal_name` varchar(120) NOT NULL,
  `journal_type` varchar(50) NOT NULL,
  `default_account_id` bigint(20) UNSIGNED DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `ai_models`
--

CREATE TABLE `ai_models` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `company_id` char(36) DEFAULT NULL,
  `model_code` varchar(80) NOT NULL,
  `model_name` varchar(120) NOT NULL,
  `model_type` varchar(80) NOT NULL,
  `version` varchar(50) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `ai_predictions`
--

CREATE TABLE `ai_predictions` (
  `id` char(36) NOT NULL,
  `model_id` bigint(20) UNSIGNED NOT NULL,
  `entity_type` varchar(80) NOT NULL,
  `entity_id` char(36) NOT NULL,
  `prediction_type` varchar(80) NOT NULL,
  `prediction_value` decimal(18,6) DEFAULT NULL,
  `prediction_label` varchar(120) DEFAULT NULL,
  `confidence_score` decimal(8,4) DEFAULT NULL,
  `features_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`features_json`)),
  `explanation_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`explanation_json`)),
  `generated_at` datetime NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `arrears_actions`
--

CREATE TABLE `arrears_actions` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `arrears_case_id` char(36) NOT NULL,
  `action_type` varchar(50) NOT NULL,
  `action_status` varchar(30) NOT NULL DEFAULT 'done',
  `action_date` datetime NOT NULL,
  `performed_by` char(36) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `arrears_cases`
--

CREATE TABLE `arrears_cases` (
  `id` char(36) NOT NULL,
  `contract_id` char(36) NOT NULL,
  `customer_id` char(36) NOT NULL,
  `current_stage` varchar(30) NOT NULL DEFAULT 'reminder_1',
  `overdue_amount` decimal(18,2) NOT NULL DEFAULT 0.00,
  `overdue_days` int(11) NOT NULL DEFAULT 0,
  `risk_level` varchar(30) NOT NULL DEFAULT 'medium',
  `assigned_to` char(36) DEFAULT NULL,
  `opened_at` datetime NOT NULL,
  `closed_at` datetime DEFAULT NULL,
  `closure_reason` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `asset_depreciation_schedule`
--

CREATE TABLE `asset_depreciation_schedule` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `asset_id` char(36) NOT NULL,
  `fiscal_period_id` bigint(20) UNSIGNED DEFAULT NULL,
  `depreciation_date` date NOT NULL,
  `depreciation_amount` decimal(18,2) NOT NULL,
  `accumulated_depreciation` decimal(18,2) NOT NULL,
  `net_book_value` decimal(18,2) NOT NULL,
  `journal_entry_id` char(36) DEFAULT NULL,
  `status` varchar(30) NOT NULL DEFAULT 'planned',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `assistant_conversations`
--

CREATE TABLE `assistant_conversations` (
  `id` char(36) NOT NULL,
  `company_id` char(36) NOT NULL,
  `user_id` char(36) DEFAULT NULL,
  `customer_id` char(36) DEFAULT NULL,
  `conversation_type` varchar(30) NOT NULL DEFAULT 'internal',
  `started_at` datetime NOT NULL,
  `ended_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `assistant_messages`
--

CREATE TABLE `assistant_messages` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `conversation_id` char(36) NOT NULL,
  `sender_type` varchar(30) NOT NULL,
  `message_text` longtext NOT NULL,
  `message_metadata` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`message_metadata`)),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `audit_logs`
--

CREATE TABLE `audit_logs` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `company_id` char(36) NOT NULL,
  `branch_id` char(36) DEFAULT NULL,
  `user_id` char(36) DEFAULT NULL,
  `entity_type` varchar(80) NOT NULL,
  `entity_id` char(36) DEFAULT NULL,
  `action_type` varchar(50) NOT NULL,
  `module_name` varchar(80) NOT NULL,
  `ip_address` varchar(64) DEFAULT NULL,
  `user_agent` text DEFAULT NULL,
  `before_data` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`before_data`)),
  `after_data` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`after_data`)),
  `legal_significance` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `bank_accounts`
--

CREATE TABLE `bank_accounts` (
  `id` char(36) NOT NULL,
  `company_id` char(36) NOT NULL,
  `branch_id` char(36) DEFAULT NULL,
  `account_name` varchar(255) NOT NULL,
  `bank_name` varchar(255) NOT NULL,
  `iban` varchar(100) DEFAULT NULL,
  `rib` varchar(100) DEFAULT NULL,
  `swift_code` varchar(50) DEFAULT NULL,
  `currency_code` char(3) NOT NULL DEFAULT 'MAD',
  `account_type` varchar(50) NOT NULL DEFAULT 'bank',
  `opening_balance` decimal(18,2) NOT NULL DEFAULT 0.00,
  `current_balance` decimal(18,2) NOT NULL DEFAULT 0.00,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `bank_transactions`
--

CREATE TABLE `bank_transactions` (
  `id` char(36) NOT NULL,
  `bank_account_id` char(36) NOT NULL,
  `transaction_date` date NOT NULL,
  `value_date` date DEFAULT NULL,
  `description` varchar(500) NOT NULL,
  `transaction_type` varchar(30) NOT NULL,
  `amount` decimal(18,2) NOT NULL,
  `balance_after` decimal(18,2) DEFAULT NULL,
  `payment_id` char(36) DEFAULT NULL,
  `reconciled` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `branches`
--

CREATE TABLE `branches` (
  `id` char(36) NOT NULL,
  `company_id` char(36) NOT NULL,
  `code` varchar(50) NOT NULL,
  `name` varchar(255) NOT NULL,
  `phone` varchar(50) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `address_line_1` varchar(255) DEFAULT NULL,
  `address_line_2` varchar(255) DEFAULT NULL,
  `city` varchar(120) DEFAULT NULL,
  `country_code` char(2) NOT NULL DEFAULT 'MA',
  `manager_user_id` char(36) DEFAULT NULL,
  `is_head_office` tinyint(1) NOT NULL DEFAULT 0,
  `status` varchar(30) NOT NULL DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `chart_of_accounts`
--

CREATE TABLE `chart_of_accounts` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `company_id` char(36) NOT NULL,
  `account_code` varchar(50) NOT NULL,
  `account_name` varchar(255) NOT NULL,
  `account_type` varchar(50) NOT NULL,
  `account_group` varchar(100) DEFAULT NULL,
  `parent_account_id` bigint(20) UNSIGNED DEFAULT NULL,
  `is_postable` tinyint(1) NOT NULL DEFAULT 1,
  `currency_code` char(3) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `companies`
--

CREATE TABLE `companies` (
  `id` char(36) NOT NULL,
  `code` varchar(50) NOT NULL,
  `legal_name` varchar(255) NOT NULL,
  `trade_name` varchar(255) DEFAULT NULL,
  `ice` varchar(50) DEFAULT NULL,
  `rc` varchar(50) DEFAULT NULL,
  `tax_identifier` varchar(50) DEFAULT NULL,
  `cnss_number` varchar(50) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `phone` varchar(50) DEFAULT NULL,
  `website` varchar(255) DEFAULT NULL,
  `address_line_1` varchar(255) DEFAULT NULL,
  `address_line_2` varchar(255) DEFAULT NULL,
  `city` varchar(120) DEFAULT NULL,
  `country_code` char(2) NOT NULL DEFAULT 'MA',
  `default_currency_code` char(3) NOT NULL DEFAULT 'MAD',
  `status` varchar(30) NOT NULL DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `contracts`
--

CREATE TABLE `contracts` (
  `id` char(36) NOT NULL,
  `company_id` char(36) NOT NULL,
  `branch_id` char(36) DEFAULT NULL,
  `contract_number` varchar(80) NOT NULL,
  `contract_type` varchar(30) NOT NULL,
  `customer_id` char(36) NOT NULL,
  `vehicle_id` char(36) NOT NULL,
  `template_id` char(36) DEFAULT NULL,
  `credit_application_id` char(36) DEFAULT NULL,
  `status` varchar(30) NOT NULL DEFAULT 'draft',
  `legal_status` varchar(30) NOT NULL DEFAULT 'pending',
  `signature_status` varchar(30) NOT NULL DEFAULT 'pending',
  `start_date` date DEFAULT NULL,
  `end_date` date DEFAULT NULL,
  `duration_months` int(11) DEFAULT NULL,
  `currency_code` char(3) NOT NULL DEFAULT 'MAD',
  `base_amount` decimal(18,2) DEFAULT NULL,
  `monthly_payment` decimal(18,2) DEFAULT NULL,
  `down_payment_amount` decimal(18,2) DEFAULT NULL,
  `buyout_option_amount` decimal(18,2) DEFAULT NULL,
  `allowed_km` decimal(18,2) DEFAULT NULL,
  `excess_km_rate` decimal(18,2) DEFAULT NULL,
  `deposit_amount` decimal(18,2) DEFAULT NULL,
  `insurance_included` tinyint(1) NOT NULL DEFAULT 0,
  `maintenance_included` tinyint(1) NOT NULL DEFAULT 0,
  `activation_date` datetime DEFAULT NULL,
  `closure_date` datetime DEFAULT NULL,
  `signed_at` datetime DEFAULT NULL,
  `terminated_reason` varchar(255) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_by` char(36) DEFAULT NULL,
  `approved_by` char(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `deleted_at` timestamp NULL DEFAULT NULL
) ;

-- --------------------------------------------------------

--
-- Table structure for table `contract_clauses`
--

CREATE TABLE `contract_clauses` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `contract_id` char(36) NOT NULL,
  `clause_code` varchar(80) DEFAULT NULL,
  `clause_title` varchar(255) NOT NULL,
  `clause_text` longtext NOT NULL,
  `display_order` int(11) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `contract_installments`
--

CREATE TABLE `contract_installments` (
  `id` char(36) NOT NULL,
  `contract_id` char(36) NOT NULL,
  `installment_number` int(11) NOT NULL,
  `due_date` date NOT NULL,
  `principal_amount` decimal(18,2) NOT NULL DEFAULT 0.00,
  `interest_amount` decimal(18,2) NOT NULL DEFAULT 0.00,
  `tax_amount` decimal(18,2) NOT NULL DEFAULT 0.00,
  `penalty_amount` decimal(18,2) NOT NULL DEFAULT 0.00,
  `total_due_amount` decimal(18,2) NOT NULL,
  `total_paid_amount` decimal(18,2) NOT NULL DEFAULT 0.00,
  `balance_amount` decimal(18,2) NOT NULL DEFAULT 0.00,
  `installment_status` varchar(30) NOT NULL DEFAULT 'pending',
  `invoiced_at` datetime DEFAULT NULL,
  `paid_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `contract_mileage_logs`
--

CREATE TABLE `contract_mileage_logs` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `contract_id` char(36) NOT NULL,
  `vehicle_id` char(36) NOT NULL,
  `source_type` varchar(50) NOT NULL,
  `logged_at` datetime NOT NULL,
  `mileage_value` decimal(18,2) NOT NULL,
  `excess_km` decimal(18,2) NOT NULL DEFAULT 0.00,
  `excess_charge_amount` decimal(18,2) NOT NULL DEFAULT 0.00,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `contract_status_history`
--

CREATE TABLE `contract_status_history` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `contract_id` char(36) NOT NULL,
  `old_status` varchar(30) DEFAULT NULL,
  `new_status` varchar(30) NOT NULL,
  `changed_by` char(36) DEFAULT NULL,
  `change_reason` varchar(255) DEFAULT NULL,
  `changed_at` datetime NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `contract_templates`
--

CREATE TABLE `contract_templates` (
  `id` char(36) NOT NULL,
  `company_id` char(36) NOT NULL,
  `code` varchar(80) NOT NULL,
  `contract_type` varchar(30) NOT NULL,
  `title` varchar(255) NOT NULL,
  `template_html` longtext DEFAULT NULL,
  `template_version` varchar(50) NOT NULL DEFAULT '1.0',
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_by` char(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `credit_applications`
--

CREATE TABLE `credit_applications` (
  `id` char(36) NOT NULL,
  `company_id` char(36) NOT NULL,
  `branch_id` char(36) DEFAULT NULL,
  `customer_id` char(36) NOT NULL,
  `vehicle_id` char(36) DEFAULT NULL,
  `application_type` varchar(30) NOT NULL,
  `requested_amount` decimal(18,2) NOT NULL,
  `down_payment_amount` decimal(18,2) DEFAULT NULL,
  `requested_duration_months` int(11) DEFAULT NULL,
  `monthly_income` decimal(18,2) DEFAULT NULL,
  `monthly_debt` decimal(18,2) DEFAULT NULL,
  `debt_ratio` decimal(8,2) DEFAULT NULL,
  `scoring_status` varchar(30) NOT NULL DEFAULT 'pending',
  `decision_status` varchar(30) NOT NULL DEFAULT 'draft',
  `submitted_at` datetime DEFAULT NULL,
  `decided_at` datetime DEFAULT NULL,
  `decided_by` char(36) DEFAULT NULL,
  `rejection_reason` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ;

-- --------------------------------------------------------

--
-- Table structure for table `credit_decisions`
--

CREATE TABLE `credit_decisions` (
  `id` char(36) NOT NULL,
  `application_id` char(36) NOT NULL,
  `decision` varchar(30) NOT NULL,
  `approved_amount` decimal(18,2) DEFAULT NULL,
  `approved_duration_months` int(11) DEFAULT NULL,
  `approved_rate` decimal(8,4) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `decided_by` char(36) DEFAULT NULL,
  `decided_at` datetime NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `credit_scores`
--

CREATE TABLE `credit_scores` (
  `id` char(36) NOT NULL,
  `application_id` char(36) NOT NULL,
  `model_name` varchar(120) NOT NULL,
  `model_version` varchar(50) DEFAULT NULL,
  `score_value` decimal(8,2) NOT NULL,
  `risk_band` varchar(30) NOT NULL,
  `recommendation` varchar(50) NOT NULL,
  `details_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`details_json`)),
  `computed_at` datetime NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `currencies`
--

CREATE TABLE `currencies` (
  `code` char(3) NOT NULL,
  `name` varchar(100) NOT NULL,
  `symbol` varchar(10) DEFAULT NULL,
  `decimal_places` int(11) NOT NULL DEFAULT 2,
  `is_active` tinyint(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `customers`
--

CREATE TABLE `customers` (
  `id` char(36) NOT NULL,
  `company_id` char(36) NOT NULL,
  `branch_id` char(36) DEFAULT NULL,
  `customer_code` varchar(50) NOT NULL,
  `customer_type` varchar(30) NOT NULL,
  `status` varchar(30) NOT NULL DEFAULT 'active',
  `risk_level` varchar(30) NOT NULL DEFAULT 'normal',
  `is_blacklisted` tinyint(1) NOT NULL DEFAULT 0,
  `preferred_language` varchar(10) NOT NULL DEFAULT 'fr',
  `source_channel` varchar(100) DEFAULT NULL,
  `assigned_to_user_id` char(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `deleted_at` timestamp NULL DEFAULT NULL
) ;

-- --------------------------------------------------------

--
-- Table structure for table `customer_addresses`
--

CREATE TABLE `customer_addresses` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `customer_id` char(36) NOT NULL,
  `address_type` varchar(50) NOT NULL,
  `address_line_1` varchar(255) NOT NULL,
  `address_line_2` varchar(255) DEFAULT NULL,
  `city` varchar(120) DEFAULT NULL,
  `region` varchar(120) DEFAULT NULL,
  `postal_code` varchar(30) DEFAULT NULL,
  `country_code` char(2) NOT NULL DEFAULT 'MA',
  `is_primary` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `customer_bank_accounts`
--

CREATE TABLE `customer_bank_accounts` (
  `id` char(36) NOT NULL,
  `customer_id` char(36) NOT NULL,
  `bank_name` varchar(255) NOT NULL,
  `iban` varchar(100) DEFAULT NULL,
  `rib` varchar(100) DEFAULT NULL,
  `swift_code` varchar(50) DEFAULT NULL,
  `account_holder_name` varchar(255) DEFAULT NULL,
  `is_default` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `customer_blacklist_entries`
--

CREATE TABLE `customer_blacklist_entries` (
  `id` char(36) NOT NULL,
  `customer_id` char(36) NOT NULL,
  `reason` varchar(255) NOT NULL,
  `severity` varchar(30) NOT NULL DEFAULT 'high',
  `source_module` varchar(100) DEFAULT NULL,
  `added_by` char(36) DEFAULT NULL,
  `added_at` datetime NOT NULL,
  `removed_at` datetime DEFAULT NULL,
  `removed_by` char(36) DEFAULT NULL,
  `removal_reason` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `customer_company_profiles`
--

CREATE TABLE `customer_company_profiles` (
  `customer_id` char(36) NOT NULL,
  `legal_name` varchar(255) NOT NULL,
  `trade_name` varchar(255) DEFAULT NULL,
  `registration_number` varchar(100) DEFAULT NULL,
  `ice` varchar(100) DEFAULT NULL,
  `tax_identifier` varchar(100) DEFAULT NULL,
  `cnss_number` varchar(100) DEFAULT NULL,
  `incorporation_date` date DEFAULT NULL,
  `business_activity` varchar(255) DEFAULT NULL,
  `annual_turnover` decimal(18,2) DEFAULT NULL,
  `employee_count` int(11) DEFAULT NULL,
  `legal_representative_name` varchar(255) DEFAULT NULL,
  `legal_representative_id_number` varchar(100) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `customer_contacts`
--

CREATE TABLE `customer_contacts` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `customer_id` char(36) NOT NULL,
  `contact_type` varchar(50) NOT NULL,
  `value` varchar(255) NOT NULL,
  `is_primary` tinyint(1) NOT NULL DEFAULT 0,
  `verified_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `customer_employment_profiles`
--

CREATE TABLE `customer_employment_profiles` (
  `id` char(36) NOT NULL,
  `customer_id` char(36) NOT NULL,
  `employer_name` varchar(255) DEFAULT NULL,
  `employment_type` varchar(80) DEFAULT NULL,
  `job_title` varchar(120) DEFAULT NULL,
  `contract_type` varchar(80) DEFAULT NULL,
  `employment_start_date` date DEFAULT NULL,
  `cnss_registered` tinyint(1) NOT NULL DEFAULT 0,
  `cnss_number` varchar(100) DEFAULT NULL,
  `salary_net` decimal(18,2) DEFAULT NULL,
  `salary_gross` decimal(18,2) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `customer_individual_profiles`
--

CREATE TABLE `customer_individual_profiles` (
  `customer_id` char(36) NOT NULL,
  `first_name` varchar(120) NOT NULL,
  `last_name` varchar(120) NOT NULL,
  `gender` varchar(20) DEFAULT NULL,
  `date_of_birth` date DEFAULT NULL,
  `place_of_birth` varchar(120) DEFAULT NULL,
  `nationality` varchar(100) DEFAULT NULL,
  `marital_status` varchar(50) DEFAULT NULL,
  `national_id_number` varchar(100) DEFAULT NULL,
  `passport_number` varchar(100) DEFAULT NULL,
  `driving_license_number` varchar(100) DEFAULT NULL,
  `driving_license_expiry` date DEFAULT NULL,
  `profession` varchar(120) DEFAULT NULL,
  `employer_name` varchar(255) DEFAULT NULL,
  `monthly_income` decimal(18,2) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `customer_kyc_cases`
--

CREATE TABLE `customer_kyc_cases` (
  `id` char(36) NOT NULL,
  `customer_id` char(36) NOT NULL,
  `kyc_status` varchar(30) NOT NULL DEFAULT 'pending',
  `risk_score` decimal(8,2) DEFAULT NULL,
  `verification_level` varchar(30) NOT NULL DEFAULT 'basic',
  `reviewed_by` char(36) DEFAULT NULL,
  `reviewed_at` datetime DEFAULT NULL,
  `rejection_reason` text DEFAULT NULL,
  `expires_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `customer_kyc_documents`
--

CREATE TABLE `customer_kyc_documents` (
  `id` char(36) NOT NULL,
  `kyc_case_id` char(36) NOT NULL,
  `document_type` varchar(80) NOT NULL,
  `file_id` char(36) NOT NULL,
  `document_number` varchar(120) DEFAULT NULL,
  `issued_at` date DEFAULT NULL,
  `expires_at` date DEFAULT NULL,
  `verification_status` varchar(30) NOT NULL DEFAULT 'pending',
  `verified_by` char(36) DEFAULT NULL,
  `verified_at` datetime DEFAULT NULL,
  `notes` varchar(500) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `customer_notes`
--

CREATE TABLE `customer_notes` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `customer_id` char(36) NOT NULL,
  `note_type` varchar(50) NOT NULL DEFAULT 'general',
  `note_text` text NOT NULL,
  `created_by` char(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `electronic_certificates`
--

CREATE TABLE `electronic_certificates` (
  `id` char(36) NOT NULL,
  `user_id` char(36) DEFAULT NULL,
  `certificate_name` varchar(255) NOT NULL,
  `issuer_name` varchar(255) DEFAULT NULL,
  `serial_number` varchar(255) DEFAULT NULL,
  `valid_from` datetime DEFAULT NULL,
  `valid_to` datetime DEFAULT NULL,
  `public_key` text DEFAULT NULL,
  `certificate_path` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `entity_attachments`
--

CREATE TABLE `entity_attachments` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `entity_type` varchar(80) NOT NULL,
  `entity_id` char(36) NOT NULL,
  `file_id` char(36) NOT NULL,
  `category` varchar(80) NOT NULL,
  `title` varchar(255) DEFAULT NULL,
  `notes` varchar(500) DEFAULT NULL,
  `visibility` varchar(30) NOT NULL DEFAULT 'internal',
  `uploaded_by` char(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `files`
--

CREATE TABLE `files` (
  `id` char(36) NOT NULL,
  `company_id` char(36) NOT NULL,
  `branch_id` char(36) DEFAULT NULL,
  `original_name` varchar(255) NOT NULL,
  `stored_name` varchar(255) NOT NULL,
  `storage_disk` varchar(50) NOT NULL DEFAULT 'local',
  `storage_path` varchar(500) NOT NULL,
  `mime_type` varchar(120) NOT NULL,
  `extension` varchar(20) DEFAULT NULL,
  `file_size` bigint(20) UNSIGNED NOT NULL,
  `checksum_sha256` varchar(128) DEFAULT NULL,
  `uploaded_by` char(36) DEFAULT NULL,
  `is_public` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `fiscal_periods`
--

CREATE TABLE `fiscal_periods` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `fiscal_year_id` bigint(20) UNSIGNED NOT NULL,
  `period_label` varchar(20) NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `period_number` int(11) NOT NULL,
  `status` varchar(30) NOT NULL DEFAULT 'open',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `fiscal_years`
--

CREATE TABLE `fiscal_years` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `company_id` char(36) NOT NULL,
  `year_label` varchar(20) NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `status` varchar(30) NOT NULL DEFAULT 'open',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `fixed_assets`
--

CREATE TABLE `fixed_assets` (
  `id` char(36) NOT NULL,
  `company_id` char(36) NOT NULL,
  `asset_code` varchar(80) NOT NULL,
  `asset_name` varchar(255) NOT NULL,
  `asset_category` varchar(100) NOT NULL,
  `source_type` varchar(50) NOT NULL DEFAULT 'vehicle',
  `source_vehicle_id` char(36) DEFAULT NULL,
  `acquisition_date` date NOT NULL,
  `acquisition_cost` decimal(18,2) NOT NULL,
  `useful_life_months` int(11) NOT NULL,
  `residual_value` decimal(18,2) NOT NULL DEFAULT 0.00,
  `depreciation_method` varchar(50) NOT NULL DEFAULT 'straight_line',
  `asset_account_id` bigint(20) UNSIGNED DEFAULT NULL,
  `accumulated_depreciation_account_id` bigint(20) UNSIGNED DEFAULT NULL,
  `depreciation_expense_account_id` bigint(20) UNSIGNED DEFAULT NULL,
  `status` varchar(30) NOT NULL DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `geofences`
--

CREATE TABLE `geofences` (
  `id` char(36) NOT NULL,
  `company_id` char(36) NOT NULL,
  `name` varchar(255) NOT NULL,
  `geofence_type` varchar(30) NOT NULL DEFAULT 'circle',
  `center_latitude` decimal(10,7) DEFAULT NULL,
  `center_longitude` decimal(10,7) DEFAULT NULL,
  `radius_meters` decimal(12,2) DEFAULT NULL,
  `polygon_geojson` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`polygon_geojson`)),
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_by` char(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `gps_alerts`
--

CREATE TABLE `gps_alerts` (
  `id` char(36) NOT NULL,
  `vehicle_id` char(36) NOT NULL,
  `gps_device_id` char(36) DEFAULT NULL,
  `alert_type` varchar(80) NOT NULL,
  `severity` varchar(30) NOT NULL DEFAULT 'medium',
  `title` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `triggered_at` datetime NOT NULL,
  `resolved_at` datetime DEFAULT NULL,
  `resolved_by` char(36) DEFAULT NULL,
  `status` varchar(30) NOT NULL DEFAULT 'open',
  `metadata_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`metadata_json`)),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `gps_devices`
--

CREATE TABLE `gps_devices` (
  `id` char(36) NOT NULL,
  `company_id` char(36) NOT NULL,
  `device_imei` varchar(100) NOT NULL,
  `serial_number` varchar(100) DEFAULT NULL,
  `sim_number` varchar(100) DEFAULT NULL,
  `provider_name` varchar(255) DEFAULT NULL,
  `status` varchar(30) NOT NULL DEFAULT 'active',
  `last_seen_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `gps_device_assignments`
--

CREATE TABLE `gps_device_assignments` (
  `id` char(36) NOT NULL,
  `gps_device_id` char(36) NOT NULL,
  `vehicle_id` char(36) NOT NULL,
  `assigned_from` datetime NOT NULL,
  `assigned_to` datetime DEFAULT NULL,
  `status` varchar(30) NOT NULL DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `gps_positions`
--

CREATE TABLE `gps_positions` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `gps_device_id` char(36) NOT NULL,
  `vehicle_id` char(36) NOT NULL,
  `recorded_at` datetime NOT NULL,
  `latitude` decimal(10,7) NOT NULL,
  `longitude` decimal(10,7) NOT NULL,
  `speed_kmh` decimal(10,2) DEFAULT NULL,
  `heading_degrees` decimal(10,2) DEFAULT NULL,
  `altitude_meters` decimal(10,2) DEFAULT NULL,
  `odometer_km` decimal(18,2) DEFAULT NULL,
  `ignition_on` tinyint(1) NOT NULL DEFAULT 0,
  `battery_level` decimal(8,2) DEFAULT NULL,
  `raw_payload` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`raw_payload`)),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `gps_trips`
--

CREATE TABLE `gps_trips` (
  `id` char(36) NOT NULL,
  `vehicle_id` char(36) NOT NULL,
  `gps_device_id` char(36) DEFAULT NULL,
  `started_at` datetime NOT NULL,
  `ended_at` datetime DEFAULT NULL,
  `start_latitude` decimal(10,7) DEFAULT NULL,
  `start_longitude` decimal(10,7) DEFAULT NULL,
  `end_latitude` decimal(10,7) DEFAULT NULL,
  `end_longitude` decimal(10,7) DEFAULT NULL,
  `distance_km` decimal(18,2) DEFAULT NULL,
  `duration_minutes` int(11) DEFAULT NULL,
  `average_speed_kmh` decimal(10,2) DEFAULT NULL,
  `max_speed_kmh` decimal(10,2) DEFAULT NULL,
  `contract_id` char(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `invoices`
--

CREATE TABLE `invoices` (
  `id` char(36) NOT NULL,
  `company_id` char(36) NOT NULL,
  `branch_id` char(36) DEFAULT NULL,
  `invoice_number` varchar(80) NOT NULL,
  `invoice_type` varchar(30) NOT NULL,
  `contract_id` char(36) DEFAULT NULL,
  `customer_id` char(36) NOT NULL,
  `issue_date` date NOT NULL,
  `due_date` date DEFAULT NULL,
  `currency_code` char(3) NOT NULL DEFAULT 'MAD',
  `subtotal_amount` decimal(18,2) NOT NULL DEFAULT 0.00,
  `tax_amount` decimal(18,2) NOT NULL DEFAULT 0.00,
  `total_amount` decimal(18,2) NOT NULL DEFAULT 0.00,
  `amount_paid` decimal(18,2) NOT NULL DEFAULT 0.00,
  `balance_due` decimal(18,2) NOT NULL DEFAULT 0.00,
  `status` varchar(30) NOT NULL DEFAULT 'draft',
  `pdf_file_id` char(36) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_by` char(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `invoice_lines`
--

CREATE TABLE `invoice_lines` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `invoice_id` char(36) NOT NULL,
  `line_number` int(11) NOT NULL,
  `item_type` varchar(50) NOT NULL,
  `description` varchar(500) NOT NULL,
  `quantity` decimal(18,4) NOT NULL DEFAULT 1.0000,
  `unit_price` decimal(18,2) NOT NULL DEFAULT 0.00,
  `tax_rate` decimal(8,4) NOT NULL DEFAULT 0.0000,
  `tax_amount` decimal(18,2) NOT NULL DEFAULT 0.00,
  `line_total` decimal(18,2) NOT NULL DEFAULT 0.00,
  `contract_installment_id` char(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `journal_entries`
--

CREATE TABLE `journal_entries` (
  `id` char(36) NOT NULL,
  `company_id` char(36) NOT NULL,
  `branch_id` char(36) DEFAULT NULL,
  `journal_id` bigint(20) UNSIGNED NOT NULL,
  `entry_number` varchar(80) NOT NULL,
  `entry_date` date NOT NULL,
  `posting_date` date NOT NULL,
  `reference_type` varchar(80) DEFAULT NULL,
  `reference_id` char(36) DEFAULT NULL,
  `description` varchar(500) NOT NULL,
  `currency_code` char(3) NOT NULL DEFAULT 'MAD',
  `total_debit` decimal(18,2) NOT NULL DEFAULT 0.00,
  `total_credit` decimal(18,2) NOT NULL DEFAULT 0.00,
  `status` varchar(30) NOT NULL DEFAULT 'draft',
  `posted_by` char(36) DEFAULT NULL,
  `posted_at` datetime DEFAULT NULL,
  `created_by` char(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `journal_entry_lines`
--

CREATE TABLE `journal_entry_lines` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `journal_entry_id` char(36) NOT NULL,
  `line_number` int(11) NOT NULL,
  `account_id` bigint(20) UNSIGNED NOT NULL,
  `description` varchar(500) DEFAULT NULL,
  `debit_amount` decimal(18,2) NOT NULL DEFAULT 0.00,
  `credit_amount` decimal(18,2) NOT NULL DEFAULT 0.00,
  `tax_id` bigint(20) UNSIGNED DEFAULT NULL,
  `customer_id` char(36) DEFAULT NULL,
  `vehicle_id` char(36) DEFAULT NULL,
  `contract_id` char(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `languages`
--

CREATE TABLE `languages` (
  `code` varchar(10) NOT NULL,
  `name` varchar(100) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `legal_cases`
--

CREATE TABLE `legal_cases` (
  `id` char(36) NOT NULL,
  `arrears_case_id` char(36) DEFAULT NULL,
  `contract_id` char(36) NOT NULL,
  `customer_id` char(36) NOT NULL,
  `case_number` varchar(100) DEFAULT NULL,
  `case_type` varchar(50) NOT NULL,
  `court_name` varchar(255) DEFAULT NULL,
  `lawyer_name` varchar(255) DEFAULT NULL,
  `status` varchar(30) NOT NULL DEFAULT 'open',
  `filing_date` date DEFAULT NULL,
  `hearing_date` date DEFAULT NULL,
  `judgment_date` date DEFAULT NULL,
  `amount_claimed` decimal(18,2) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_by` char(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `missions`
--

CREATE TABLE `missions` (
  `id` char(36) NOT NULL,
  `company_id` char(36) NOT NULL,
  `branch_id` char(36) DEFAULT NULL,
  `reservation_id` char(36) DEFAULT NULL,
  `contract_id` char(36) DEFAULT NULL,
  `vehicle_id` char(36) DEFAULT NULL,
  `assigned_user_id` char(36) DEFAULT NULL,
  `mission_type` varchar(30) NOT NULL,
  `status` varchar(30) NOT NULL DEFAULT 'planned',
  `scheduled_start_at` datetime DEFAULT NULL,
  `scheduled_end_at` datetime DEFAULT NULL,
  `actual_start_at` datetime DEFAULT NULL,
  `actual_end_at` datetime DEFAULT NULL,
  `origin_address` varchar(500) DEFAULT NULL,
  `destination_address` varchar(500) DEFAULT NULL,
  `customer_signature_file_id` char(36) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_by` char(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `mission_checklist_items`
--

CREATE TABLE `mission_checklist_items` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `mission_id` char(36) NOT NULL,
  `checklist_phase` varchar(30) NOT NULL,
  `item_label` varchar(255) NOT NULL,
  `item_value` varchar(255) DEFAULT NULL,
  `item_status` varchar(30) NOT NULL DEFAULT 'pending',
  `notes` varchar(500) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `notifications`
--

CREATE TABLE `notifications` (
  `id` char(36) NOT NULL,
  `company_id` char(36) NOT NULL,
  `user_id` char(36) DEFAULT NULL,
  `customer_id` char(36) DEFAULT NULL,
  `template_id` bigint(20) UNSIGNED DEFAULT NULL,
  `channel` varchar(30) NOT NULL,
  `subject` varchar(255) DEFAULT NULL,
  `message` text NOT NULL,
  `status` varchar(30) NOT NULL DEFAULT 'pending',
  `scheduled_at` datetime DEFAULT NULL,
  `sent_at` datetime DEFAULT NULL,
  `failed_at` datetime DEFAULT NULL,
  `error_message` varchar(500) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `notification_templates`
--

CREATE TABLE `notification_templates` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `company_id` char(36) NOT NULL,
  `code` varchar(80) NOT NULL,
  `channel` varchar(30) NOT NULL,
  `subject_template` varchar(255) DEFAULT NULL,
  `body_template` longtext NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `number_sequences`
--

CREATE TABLE `number_sequences` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `company_id` char(36) NOT NULL,
  `branch_id` char(36) DEFAULT NULL,
  `entity_name` varchar(100) NOT NULL,
  `prefix` varchar(30) DEFAULT NULL,
  `suffix` varchar(30) DEFAULT NULL,
  `current_value` bigint(20) NOT NULL DEFAULT 0,
  `padding_length` int(11) NOT NULL DEFAULT 6,
  `reset_policy` varchar(30) NOT NULL DEFAULT 'never',
  `last_reset_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `password_reset_tokens`
--

CREATE TABLE `password_reset_tokens` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `user_id` char(36) NOT NULL,
  `token_hash` varchar(255) NOT NULL,
  `expires_at` datetime NOT NULL,
  `used_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `payments`
--

CREATE TABLE `payments` (
  `id` char(36) NOT NULL,
  `company_id` char(36) NOT NULL,
  `branch_id` char(36) DEFAULT NULL,
  `payment_reference` varchar(80) NOT NULL,
  `customer_id` char(36) DEFAULT NULL,
  `contract_id` char(36) DEFAULT NULL,
  `bank_account_id` char(36) DEFAULT NULL,
  `payment_method_id` bigint(20) UNSIGNED DEFAULT NULL,
  `payment_direction` varchar(20) NOT NULL DEFAULT 'inbound',
  `payment_date` date NOT NULL,
  `amount` decimal(18,2) NOT NULL,
  `currency_code` char(3) NOT NULL DEFAULT 'MAD',
  `external_reference` varchar(120) DEFAULT NULL,
  `status` varchar(30) NOT NULL DEFAULT 'confirmed',
  `notes` text DEFAULT NULL,
  `created_by` char(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `payment_allocations`
--

CREATE TABLE `payment_allocations` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `payment_id` char(36) NOT NULL,
  `invoice_id` char(36) DEFAULT NULL,
  `contract_installment_id` char(36) DEFAULT NULL,
  `allocated_amount` decimal(18,2) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `payment_methods`
--

CREATE TABLE `payment_methods` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `code` varchar(50) NOT NULL,
  `name` varchar(120) NOT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `permissions`
--

CREATE TABLE `permissions` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `code` varchar(120) NOT NULL,
  `module_name` varchar(100) NOT NULL,
  `action_name` varchar(100) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `reservations`
--

CREATE TABLE `reservations` (
  `id` char(36) NOT NULL,
  `company_id` char(36) NOT NULL,
  `branch_id` char(36) DEFAULT NULL,
  `reservation_number` varchar(80) NOT NULL,
  `customer_id` char(36) NOT NULL,
  `vehicle_id` char(36) NOT NULL,
  `reservation_type` varchar(30) NOT NULL DEFAULT 'delivery',
  `status` varchar(30) NOT NULL DEFAULT 'pending',
  `desired_start_at` datetime NOT NULL,
  `desired_end_at` datetime DEFAULT NULL,
  `pickup_address` varchar(500) DEFAULT NULL,
  `delivery_address` varchar(500) DEFAULT NULL,
  `delivery_latitude` decimal(10,7) DEFAULT NULL,
  `delivery_longitude` decimal(10,7) DEFAULT NULL,
  `estimated_price` decimal(18,2) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_by` char(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `roles`
--

CREATE TABLE `roles` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `company_id` char(36) NOT NULL,
  `code` varchar(80) NOT NULL,
  `name` varchar(120) NOT NULL,
  `description` varchar(255) DEFAULT NULL,
  `is_system_role` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `role_permissions`
--

CREATE TABLE `role_permissions` (
  `role_id` bigint(20) UNSIGNED NOT NULL,
  `permission_id` bigint(20) UNSIGNED NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `signature_envelopes`
--

CREATE TABLE `signature_envelopes` (
  `id` char(36) NOT NULL,
  `company_id` char(36) NOT NULL,
  `provider_id` bigint(20) UNSIGNED DEFAULT NULL,
  `related_entity_type` varchar(80) NOT NULL,
  `related_entity_id` char(36) NOT NULL,
  `envelope_reference` varchar(120) DEFAULT NULL,
  `title` varchar(255) NOT NULL,
  `status` varchar(30) NOT NULL DEFAULT 'draft',
  `signing_method` varchar(50) NOT NULL DEFAULT 'otp',
  `hash_checksum` varchar(128) DEFAULT NULL,
  `signed_file_id` char(36) DEFAULT NULL,
  `certificate_id` char(36) DEFAULT NULL,
  `sent_at` datetime DEFAULT NULL,
  `completed_at` datetime DEFAULT NULL,
  `created_by` char(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `signature_events`
--

CREATE TABLE `signature_events` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `envelope_id` char(36) NOT NULL,
  `signer_id` char(36) DEFAULT NULL,
  `event_type` varchar(50) NOT NULL,
  `event_status` varchar(30) DEFAULT NULL,
  `event_at` datetime NOT NULL,
  `ip_address` varchar(64) DEFAULT NULL,
  `user_agent` text DEFAULT NULL,
  `payload_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`payload_json`)),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `signature_providers`
--

CREATE TABLE `signature_providers` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `provider_code` varchar(50) NOT NULL,
  `provider_name` varchar(120) NOT NULL,
  `api_base_url` varchar(255) DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `signature_signers`
--

CREATE TABLE `signature_signers` (
  `id` char(36) NOT NULL,
  `envelope_id` char(36) NOT NULL,
  `signer_type` varchar(30) NOT NULL,
  `customer_id` char(36) DEFAULT NULL,
  `user_id` char(36) DEFAULT NULL,
  `full_name` varchar(255) NOT NULL,
  `email` varchar(255) DEFAULT NULL,
  `phone` varchar(50) DEFAULT NULL,
  `signing_order` int(11) NOT NULL DEFAULT 1,
  `auth_mode` varchar(50) NOT NULL DEFAULT 'otp',
  `status` varchar(30) NOT NULL DEFAULT 'pending',
  `signed_at` datetime DEFAULT NULL,
  `ip_address` varchar(64) DEFAULT NULL,
  `certificate_reference` varchar(255) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `system_settings`
--

CREATE TABLE `system_settings` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `company_id` char(36) NOT NULL,
  `setting_key` varchar(120) NOT NULL,
  `setting_value` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`setting_value`)),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `taxes`
--

CREATE TABLE `taxes` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `company_id` char(36) NOT NULL,
  `tax_code` varchar(50) NOT NULL,
  `tax_name` varchar(120) NOT NULL,
  `tax_type` varchar(50) NOT NULL,
  `rate_percent` decimal(8,4) NOT NULL,
  `application_scope` varchar(50) NOT NULL,
  `account_collected_id` bigint(20) UNSIGNED DEFAULT NULL,
  `account_deductible_id` bigint(20) UNSIGNED DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `used_car_evaluations`
--

CREATE TABLE `used_car_evaluations` (
  `id` char(36) NOT NULL,
  `listing_id` char(36) NOT NULL,
  `evaluated_by` char(36) DEFAULT NULL,
  `evaluation_date` date NOT NULL,
  `mileage_km` decimal(18,2) DEFAULT NULL,
  `condition_grade` varchar(30) DEFAULT NULL,
  `mechanical_notes` text DEFAULT NULL,
  `cosmetic_notes` text DEFAULT NULL,
  `estimated_value` decimal(18,2) NOT NULL,
  `recommended_sale_price` decimal(18,2) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `used_car_listings`
--

CREATE TABLE `used_car_listings` (
  `id` char(36) NOT NULL,
  `vehicle_id` char(36) NOT NULL,
  `listing_code` varchar(80) NOT NULL,
  `title` varchar(255) NOT NULL,
  `listing_status` varchar(30) NOT NULL DEFAULT 'draft',
  `listing_price` decimal(18,2) NOT NULL,
  `minimum_price` decimal(18,2) DEFAULT NULL,
  `estimated_market_value` decimal(18,2) DEFAULT NULL,
  `published_at` datetime DEFAULT NULL,
  `sold_at` datetime DEFAULT NULL,
  `created_by` char(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `used_car_sales`
--

CREATE TABLE `used_car_sales` (
  `id` char(36) NOT NULL,
  `listing_id` char(36) NOT NULL,
  `contract_id` char(36) DEFAULT NULL,
  `buyer_customer_id` char(36) NOT NULL,
  `sale_date` date NOT NULL,
  `sale_price` decimal(18,2) NOT NULL,
  `tax_mode` varchar(50) NOT NULL DEFAULT 'vat_margin',
  `ownership_transfer_status` varchar(30) NOT NULL DEFAULT 'pending',
  `payment_status` varchar(30) NOT NULL DEFAULT 'pending',
  `notes` text DEFAULT NULL,
  `created_by` char(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` char(36) NOT NULL,
  `company_id` char(36) NOT NULL,
  `branch_id` char(36) DEFAULT NULL,
  `employee_code` varchar(50) DEFAULT NULL,
  `first_name` varchar(120) NOT NULL,
  `last_name` varchar(120) NOT NULL,
  `full_name` varchar(255) GENERATED ALWAYS AS (concat(`first_name`,' ',`last_name`)) STORED,
  `email` varchar(255) NOT NULL,
  `phone` varchar(50) DEFAULT NULL,
  `password_hash` varchar(255) NOT NULL,
  `locale` varchar(10) NOT NULL DEFAULT 'fr',
  `timezone` varchar(100) NOT NULL DEFAULT 'Africa/Casablanca',
  `avatar_path` varchar(255) DEFAULT NULL,
  `status` varchar(30) NOT NULL DEFAULT 'active',
  `last_login_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `user_roles`
--

CREATE TABLE `user_roles` (
  `user_id` char(36) NOT NULL,
  `role_id` bigint(20) UNSIGNED NOT NULL,
  `assigned_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `user_sessions`
--

CREATE TABLE `user_sessions` (
  `id` char(36) NOT NULL,
  `user_id` char(36) NOT NULL,
  `ip_address` varchar(64) DEFAULT NULL,
  `user_agent` text DEFAULT NULL,
  `device_name` varchar(120) DEFAULT NULL,
  `started_at` datetime NOT NULL,
  `expires_at` datetime DEFAULT NULL,
  `revoked_at` datetime DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `vehicles`
--

CREATE TABLE `vehicles` (
  `id` char(36) NOT NULL,
  `company_id` char(36) NOT NULL,
  `branch_id` char(36) DEFAULT NULL,
  `vehicle_code` varchar(50) NOT NULL,
  `brand_id` bigint(20) UNSIGNED NOT NULL,
  `model_id` bigint(20) UNSIGNED NOT NULL,
  `vin` varchar(100) DEFAULT NULL,
  `registration_number` varchar(100) NOT NULL,
  `chassis_number` varchar(100) DEFAULT NULL,
  `engine_number` varchar(100) DEFAULT NULL,
  `year_of_manufacture` int(11) DEFAULT NULL,
  `color` varchar(80) DEFAULT NULL,
  `mileage_current` decimal(18,2) NOT NULL DEFAULT 0.00,
  `acquisition_type` varchar(50) NOT NULL DEFAULT 'purchase',
  `acquisition_date` date DEFAULT NULL,
  `purchase_price` decimal(18,2) DEFAULT NULL,
  `residual_value` decimal(18,2) DEFAULT NULL,
  `book_value` decimal(18,2) DEFAULT NULL,
  `daily_rental_price` decimal(18,2) DEFAULT NULL,
  `monthly_rental_price` decimal(18,2) DEFAULT NULL,
  `status` varchar(40) NOT NULL DEFAULT 'available',
  `availability_status` varchar(40) NOT NULL DEFAULT 'available',
  `gps_enabled` tinyint(1) NOT NULL DEFAULT 0,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `deleted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `vehicle_brands`
--

CREATE TABLE `vehicle_brands` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `name` varchar(120) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `vehicle_geofence_assignments`
--

CREATE TABLE `vehicle_geofence_assignments` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `vehicle_id` char(36) NOT NULL,
  `geofence_id` char(36) NOT NULL,
  `alert_on_exit` tinyint(1) NOT NULL DEFAULT 1,
  `alert_on_entry` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `vehicle_insurance_policies`
--

CREATE TABLE `vehicle_insurance_policies` (
  `id` char(36) NOT NULL,
  `vehicle_id` char(36) NOT NULL,
  `insurer_name` varchar(255) NOT NULL,
  `policy_number` varchar(120) NOT NULL,
  `start_date` date NOT NULL,
  `end_date` date NOT NULL,
  `premium_amount` decimal(18,2) DEFAULT NULL,
  `coverage_details` text DEFAULT NULL,
  `file_id` char(36) DEFAULT NULL,
  `status` varchar(30) NOT NULL DEFAULT 'active',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `vehicle_maintenance_events`
--

CREATE TABLE `vehicle_maintenance_events` (
  `id` char(36) NOT NULL,
  `vehicle_id` char(36) NOT NULL,
  `event_type` varchar(80) NOT NULL,
  `title` varchar(255) NOT NULL,
  `description` text DEFAULT NULL,
  `vendor_name` varchar(255) DEFAULT NULL,
  `scheduled_date` date DEFAULT NULL,
  `completed_date` date DEFAULT NULL,
  `mileage_at_service` decimal(18,2) DEFAULT NULL,
  `cost_amount` decimal(18,2) DEFAULT NULL,
  `status` varchar(30) NOT NULL DEFAULT 'scheduled',
  `invoice_file_id` char(36) DEFAULT NULL,
  `created_by` char(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `vehicle_models`
--

CREATE TABLE `vehicle_models` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `brand_id` bigint(20) UNSIGNED NOT NULL,
  `model_name` varchar(120) NOT NULL,
  `body_type` varchar(80) DEFAULT NULL,
  `fuel_type` varchar(50) DEFAULT NULL,
  `transmission` varchar(50) DEFAULT NULL,
  `seating_capacity` int(11) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `vehicle_odometer_readings`
--

CREATE TABLE `vehicle_odometer_readings` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `vehicle_id` char(36) NOT NULL,
  `reading_source` varchar(50) NOT NULL,
  `reading_value` decimal(18,2) NOT NULL,
  `reading_at` datetime NOT NULL,
  `entered_by` char(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `vehicle_registrations`
--

CREATE TABLE `vehicle_registrations` (
  `id` char(36) NOT NULL,
  `vehicle_id` char(36) NOT NULL,
  `registration_number` varchar(100) NOT NULL,
  `registration_date` date DEFAULT NULL,
  `expiry_date` date DEFAULT NULL,
  `vignette_due_date` date DEFAULT NULL,
  `file_id` char(36) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `vehicle_status_history`
--

CREATE TABLE `vehicle_status_history` (
  `id` bigint(20) UNSIGNED NOT NULL,
  `vehicle_id` char(36) NOT NULL,
  `previous_status` varchar(40) DEFAULT NULL,
  `new_status` varchar(40) NOT NULL,
  `changed_by` char(36) DEFAULT NULL,
  `reason` varchar(255) DEFAULT NULL,
  `changed_at` datetime NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Indexes for dumped tables
--

--
-- Indexes for table `accounting_journals`
--
ALTER TABLE `accounting_journals`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_accounting_journals_company_code` (`company_id`,`journal_code`),
  ADD KEY `fk_accounting_journals_default_account` (`default_account_id`);

--
-- Indexes for table `ai_models`
--
ALTER TABLE `ai_models`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `model_code` (`model_code`);

--
-- Indexes for table `ai_predictions`
--
ALTER TABLE `ai_predictions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_ai_predictions_model` (`model_id`),
  ADD KEY `idx_ai_predictions_entity` (`entity_type`,`entity_id`);

--
-- Indexes for table `arrears_actions`
--
ALTER TABLE `arrears_actions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_arrears_actions_case` (`arrears_case_id`),
  ADD KEY `fk_arrears_actions_user` (`performed_by`);

--
-- Indexes for table `arrears_cases`
--
ALTER TABLE `arrears_cases`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_arrears_cases_contract` (`contract_id`),
  ADD KEY `fk_arrears_cases_customer` (`customer_id`),
  ADD KEY `fk_arrears_cases_assigned_to` (`assigned_to`),
  ADD KEY `idx_arrears_cases_stage` (`current_stage`);

--
-- Indexes for table `asset_depreciation_schedule`
--
ALTER TABLE `asset_depreciation_schedule`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_asset_depreciation_schedule_asset` (`asset_id`),
  ADD KEY `fk_asset_depreciation_schedule_period` (`fiscal_period_id`),
  ADD KEY `fk_asset_depreciation_schedule_entry` (`journal_entry_id`);

--
-- Indexes for table `assistant_conversations`
--
ALTER TABLE `assistant_conversations`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_assistant_conversations_company` (`company_id`),
  ADD KEY `fk_assistant_conversations_user` (`user_id`),
  ADD KEY `fk_assistant_conversations_customer` (`customer_id`);

--
-- Indexes for table `assistant_messages`
--
ALTER TABLE `assistant_messages`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_assistant_messages_conversation` (`conversation_id`);

--
-- Indexes for table `audit_logs`
--
ALTER TABLE `audit_logs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_audit_logs_branch` (`branch_id`),
  ADD KEY `fk_audit_logs_user` (`user_id`),
  ADD KEY `idx_audit_logs_entity` (`entity_type`,`entity_id`),
  ADD KEY `idx_audit_logs_company_created_at` (`company_id`,`created_at`);

--
-- Indexes for table `bank_accounts`
--
ALTER TABLE `bank_accounts`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_bank_accounts_company` (`company_id`),
  ADD KEY `fk_bank_accounts_branch` (`branch_id`);

--
-- Indexes for table `bank_transactions`
--
ALTER TABLE `bank_transactions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_bank_transactions_payment` (`payment_id`),
  ADD KEY `idx_bank_transactions_account_date` (`bank_account_id`,`transaction_date`);

--
-- Indexes for table `branches`
--
ALTER TABLE `branches`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_branch_company_code` (`company_id`,`code`);

--
-- Indexes for table `chart_of_accounts`
--
ALTER TABLE `chart_of_accounts`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_chart_of_accounts_company_code` (`company_id`,`account_code`),
  ADD KEY `fk_chart_of_accounts_parent` (`parent_account_id`);

--
-- Indexes for table `companies`
--
ALTER TABLE `companies`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `code` (`code`);

--
-- Indexes for table `contracts`
--
ALTER TABLE `contracts`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_contracts_company_number` (`company_id`,`contract_number`),
  ADD KEY `fk_contracts_branch` (`branch_id`),
  ADD KEY `fk_contracts_template` (`template_id`),
  ADD KEY `fk_contracts_credit_application` (`credit_application_id`),
  ADD KEY `fk_contracts_created_by` (`created_by`),
  ADD KEY `fk_contracts_approved_by` (`approved_by`),
  ADD KEY `idx_contracts_customer` (`customer_id`),
  ADD KEY `idx_contracts_vehicle` (`vehicle_id`),
  ADD KEY `idx_contracts_status` (`status`);

--
-- Indexes for table `contract_clauses`
--
ALTER TABLE `contract_clauses`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_contract_clauses_contract` (`contract_id`);

--
-- Indexes for table `contract_installments`
--
ALTER TABLE `contract_installments`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_contract_installments_contract_number` (`contract_id`,`installment_number`),
  ADD KEY `idx_contract_installments_due_date` (`due_date`);

--
-- Indexes for table `contract_mileage_logs`
--
ALTER TABLE `contract_mileage_logs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_contract_mileage_logs_contract` (`contract_id`),
  ADD KEY `fk_contract_mileage_logs_vehicle` (`vehicle_id`);

--
-- Indexes for table `contract_status_history`
--
ALTER TABLE `contract_status_history`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_contract_status_history_contract` (`contract_id`),
  ADD KEY `fk_contract_status_history_user` (`changed_by`);

--
-- Indexes for table `contract_templates`
--
ALTER TABLE `contract_templates`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_contract_templates` (`company_id`,`code`,`template_version`),
  ADD KEY `fk_contract_templates_created_by` (`created_by`);

--
-- Indexes for table `credit_applications`
--
ALTER TABLE `credit_applications`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_credit_applications_company` (`company_id`),
  ADD KEY `fk_credit_applications_branch` (`branch_id`),
  ADD KEY `fk_credit_applications_customer` (`customer_id`),
  ADD KEY `fk_credit_applications_decided_by` (`decided_by`);

--
-- Indexes for table `credit_decisions`
--
ALTER TABLE `credit_decisions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_credit_decisions_application` (`application_id`),
  ADD KEY `fk_credit_decisions_decided_by` (`decided_by`);

--
-- Indexes for table `credit_scores`
--
ALTER TABLE `credit_scores`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_credit_scores_application` (`application_id`);

--
-- Indexes for table `currencies`
--
ALTER TABLE `currencies`
  ADD PRIMARY KEY (`code`);

--
-- Indexes for table `customers`
--
ALTER TABLE `customers`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_customers_company_code` (`company_id`,`customer_code`),
  ADD KEY `fk_customers_branch` (`branch_id`),
  ADD KEY `fk_customers_assigned_to` (`assigned_to_user_id`),
  ADD KEY `idx_customers_type_status` (`customer_type`,`status`);

--
-- Indexes for table `customer_addresses`
--
ALTER TABLE `customer_addresses`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_customer_addresses_customer` (`customer_id`);

--
-- Indexes for table `customer_bank_accounts`
--
ALTER TABLE `customer_bank_accounts`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_customer_bank_accounts_customer` (`customer_id`);

--
-- Indexes for table `customer_blacklist_entries`
--
ALTER TABLE `customer_blacklist_entries`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_customer_blacklist_customer` (`customer_id`),
  ADD KEY `fk_customer_blacklist_added_by` (`added_by`),
  ADD KEY `fk_customer_blacklist_removed_by` (`removed_by`);

--
-- Indexes for table `customer_company_profiles`
--
ALTER TABLE `customer_company_profiles`
  ADD PRIMARY KEY (`customer_id`);

--
-- Indexes for table `customer_contacts`
--
ALTER TABLE `customer_contacts`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_customer_contacts_customer` (`customer_id`);

--
-- Indexes for table `customer_employment_profiles`
--
ALTER TABLE `customer_employment_profiles`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_customer_employment_profiles_customer` (`customer_id`);

--
-- Indexes for table `customer_individual_profiles`
--
ALTER TABLE `customer_individual_profiles`
  ADD PRIMARY KEY (`customer_id`);

--
-- Indexes for table `customer_kyc_cases`
--
ALTER TABLE `customer_kyc_cases`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_customer_kyc_cases_customer` (`customer_id`),
  ADD KEY `fk_customer_kyc_cases_reviewed_by` (`reviewed_by`);

--
-- Indexes for table `customer_kyc_documents`
--
ALTER TABLE `customer_kyc_documents`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_customer_kyc_documents_case` (`kyc_case_id`),
  ADD KEY `fk_customer_kyc_documents_file` (`file_id`),
  ADD KEY `fk_customer_kyc_documents_verified_by` (`verified_by`);

--
-- Indexes for table `customer_notes`
--
ALTER TABLE `customer_notes`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_customer_notes_customer` (`customer_id`),
  ADD KEY `fk_customer_notes_user` (`created_by`);

--
-- Indexes for table `electronic_certificates`
--
ALTER TABLE `electronic_certificates`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_certificates_user` (`user_id`);

--
-- Indexes for table `entity_attachments`
--
ALTER TABLE `entity_attachments`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_entity_attachments_file` (`file_id`),
  ADD KEY `fk_entity_attachments_uploaded_by` (`uploaded_by`),
  ADD KEY `idx_entity_attachments_entity` (`entity_type`,`entity_id`),
  ADD KEY `idx_entity_attachments_category` (`category`);

--
-- Indexes for table `files`
--
ALTER TABLE `files`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_files_company` (`company_id`),
  ADD KEY `fk_files_branch` (`branch_id`),
  ADD KEY `fk_files_uploaded_by` (`uploaded_by`);

--
-- Indexes for table `fiscal_periods`
--
ALTER TABLE `fiscal_periods`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_fiscal_periods_year_number` (`fiscal_year_id`,`period_number`);

--
-- Indexes for table `fiscal_years`
--
ALTER TABLE `fiscal_years`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_fiscal_years_company_label` (`company_id`,`year_label`);

--
-- Indexes for table `fixed_assets`
--
ALTER TABLE `fixed_assets`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_fixed_assets_company_code` (`company_id`,`asset_code`),
  ADD KEY `fk_fixed_assets_vehicle` (`source_vehicle_id`),
  ADD KEY `fk_fixed_assets_asset_account` (`asset_account_id`),
  ADD KEY `fk_fixed_assets_acc_dep_account` (`accumulated_depreciation_account_id`),
  ADD KEY `fk_fixed_assets_dep_expense_account` (`depreciation_expense_account_id`);

--
-- Indexes for table `geofences`
--
ALTER TABLE `geofences`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_geofences_company` (`company_id`),
  ADD KEY `fk_geofences_created_by` (`created_by`);

--
-- Indexes for table `gps_alerts`
--
ALTER TABLE `gps_alerts`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_gps_alerts_device` (`gps_device_id`),
  ADD KEY `fk_gps_alerts_resolved_by` (`resolved_by`),
  ADD KEY `idx_gps_alerts_vehicle_triggered_at` (`vehicle_id`,`triggered_at`);

--
-- Indexes for table `gps_devices`
--
ALTER TABLE `gps_devices`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `device_imei` (`device_imei`),
  ADD KEY `fk_gps_devices_company` (`company_id`);

--
-- Indexes for table `gps_device_assignments`
--
ALTER TABLE `gps_device_assignments`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_gps_assignments_device` (`gps_device_id`),
  ADD KEY `fk_gps_assignments_vehicle` (`vehicle_id`);

--
-- Indexes for table `gps_positions`
--
ALTER TABLE `gps_positions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_gps_positions_vehicle_recorded_at` (`vehicle_id`,`recorded_at`),
  ADD KEY `idx_gps_positions_device_recorded_at` (`gps_device_id`,`recorded_at`);

--
-- Indexes for table `gps_trips`
--
ALTER TABLE `gps_trips`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_gps_trips_vehicle` (`vehicle_id`),
  ADD KEY `fk_gps_trips_device` (`gps_device_id`);

--
-- Indexes for table `invoices`
--
ALTER TABLE `invoices`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_invoices_company_number` (`company_id`,`invoice_number`),
  ADD KEY `fk_invoices_branch` (`branch_id`),
  ADD KEY `fk_invoices_contract` (`contract_id`),
  ADD KEY `fk_invoices_pdf_file` (`pdf_file_id`),
  ADD KEY `fk_invoices_created_by` (`created_by`),
  ADD KEY `idx_invoices_customer_status` (`customer_id`,`status`);

--
-- Indexes for table `invoice_lines`
--
ALTER TABLE `invoice_lines`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_invoice_lines_invoice_line` (`invoice_id`,`line_number`),
  ADD KEY `fk_invoice_lines_installment` (`contract_installment_id`);

--
-- Indexes for table `journal_entries`
--
ALTER TABLE `journal_entries`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_journal_entries_company_number` (`company_id`,`entry_number`),
  ADD KEY `fk_journal_entries_branch` (`branch_id`),
  ADD KEY `fk_journal_entries_journal` (`journal_id`),
  ADD KEY `fk_journal_entries_posted_by` (`posted_by`),
  ADD KEY `fk_journal_entries_created_by` (`created_by`);

--
-- Indexes for table `journal_entry_lines`
--
ALTER TABLE `journal_entry_lines`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_journal_entry_lines_entry_line` (`journal_entry_id`,`line_number`),
  ADD KEY `fk_journal_entry_lines_account` (`account_id`),
  ADD KEY `fk_journal_entry_lines_tax` (`tax_id`),
  ADD KEY `fk_journal_entry_lines_customer` (`customer_id`),
  ADD KEY `fk_journal_entry_lines_vehicle` (`vehicle_id`),
  ADD KEY `fk_journal_entry_lines_contract` (`contract_id`);

--
-- Indexes for table `languages`
--
ALTER TABLE `languages`
  ADD PRIMARY KEY (`code`);

--
-- Indexes for table `legal_cases`
--
ALTER TABLE `legal_cases`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_legal_cases_arrears` (`arrears_case_id`),
  ADD KEY `fk_legal_cases_contract` (`contract_id`),
  ADD KEY `fk_legal_cases_customer` (`customer_id`),
  ADD KEY `fk_legal_cases_created_by` (`created_by`);

--
-- Indexes for table `missions`
--
ALTER TABLE `missions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_missions_company` (`company_id`),
  ADD KEY `fk_missions_branch` (`branch_id`),
  ADD KEY `fk_missions_reservation` (`reservation_id`),
  ADD KEY `fk_missions_contract` (`contract_id`),
  ADD KEY `fk_missions_vehicle` (`vehicle_id`),
  ADD KEY `fk_missions_signature_file` (`customer_signature_file_id`),
  ADD KEY `fk_missions_created_by` (`created_by`),
  ADD KEY `idx_missions_assigned_status` (`assigned_user_id`,`status`);

--
-- Indexes for table `mission_checklist_items`
--
ALTER TABLE `mission_checklist_items`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_mission_checklist_items_mission` (`mission_id`);

--
-- Indexes for table `notifications`
--
ALTER TABLE `notifications`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_notifications_company` (`company_id`),
  ADD KEY `fk_notifications_user` (`user_id`),
  ADD KEY `fk_notifications_customer` (`customer_id`),
  ADD KEY `fk_notifications_template` (`template_id`);

--
-- Indexes for table `notification_templates`
--
ALTER TABLE `notification_templates`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_notification_templates` (`company_id`,`code`,`channel`);

--
-- Indexes for table `number_sequences`
--
ALTER TABLE `number_sequences`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_sequences` (`company_id`,`branch_id`,`entity_name`),
  ADD KEY `fk_sequences_branch` (`branch_id`);

--
-- Indexes for table `password_reset_tokens`
--
ALTER TABLE `password_reset_tokens`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_password_resets_user` (`user_id`);

--
-- Indexes for table `payments`
--
ALTER TABLE `payments`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_payments_company_reference` (`company_id`,`payment_reference`),
  ADD KEY `fk_payments_branch` (`branch_id`),
  ADD KEY `fk_payments_contract` (`contract_id`),
  ADD KEY `fk_payments_bank_account` (`bank_account_id`),
  ADD KEY `fk_payments_method` (`payment_method_id`),
  ADD KEY `fk_payments_created_by` (`created_by`),
  ADD KEY `idx_payments_customer_date` (`customer_id`,`payment_date`);

--
-- Indexes for table `payment_allocations`
--
ALTER TABLE `payment_allocations`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_payment_allocations_payment` (`payment_id`),
  ADD KEY `fk_payment_allocations_invoice` (`invoice_id`),
  ADD KEY `fk_payment_allocations_installment` (`contract_installment_id`);

--
-- Indexes for table `payment_methods`
--
ALTER TABLE `payment_methods`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `code` (`code`);

--
-- Indexes for table `permissions`
--
ALTER TABLE `permissions`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `code` (`code`);

--
-- Indexes for table `reservations`
--
ALTER TABLE `reservations`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_reservations_company_number` (`company_id`,`reservation_number`),
  ADD KEY `fk_reservations_branch` (`branch_id`),
  ADD KEY `fk_reservations_customer` (`customer_id`),
  ADD KEY `fk_reservations_vehicle` (`vehicle_id`),
  ADD KEY `fk_reservations_created_by` (`created_by`);

--
-- Indexes for table `roles`
--
ALTER TABLE `roles`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_roles_company_code` (`company_id`,`code`);

--
-- Indexes for table `role_permissions`
--
ALTER TABLE `role_permissions`
  ADD PRIMARY KEY (`role_id`,`permission_id`),
  ADD KEY `fk_role_permissions_permission` (`permission_id`);

--
-- Indexes for table `signature_envelopes`
--
ALTER TABLE `signature_envelopes`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_signature_envelopes_company` (`company_id`),
  ADD KEY `fk_signature_envelopes_provider` (`provider_id`),
  ADD KEY `fk_signature_envelopes_signed_file` (`signed_file_id`),
  ADD KEY `fk_signature_envelopes_certificate` (`certificate_id`),
  ADD KEY `fk_signature_envelopes_created_by` (`created_by`),
  ADD KEY `idx_signature_envelopes_entity` (`related_entity_type`,`related_entity_id`),
  ADD KEY `idx_signature_envelopes_status` (`status`);

--
-- Indexes for table `signature_events`
--
ALTER TABLE `signature_events`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_signature_events_envelope` (`envelope_id`),
  ADD KEY `fk_signature_events_signer` (`signer_id`);

--
-- Indexes for table `signature_providers`
--
ALTER TABLE `signature_providers`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `provider_code` (`provider_code`);

--
-- Indexes for table `signature_signers`
--
ALTER TABLE `signature_signers`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_signature_signers_envelope` (`envelope_id`),
  ADD KEY `fk_signature_signers_customer` (`customer_id`),
  ADD KEY `fk_signature_signers_user` (`user_id`);

--
-- Indexes for table `system_settings`
--
ALTER TABLE `system_settings`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_system_settings` (`company_id`,`setting_key`);

--
-- Indexes for table `taxes`
--
ALTER TABLE `taxes`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_taxes_company_code` (`company_id`,`tax_code`),
  ADD KEY `fk_taxes_account_collected` (`account_collected_id`),
  ADD KEY `fk_taxes_account_deductible` (`account_deductible_id`);

--
-- Indexes for table `used_car_evaluations`
--
ALTER TABLE `used_car_evaluations`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_used_car_evaluations_listing` (`listing_id`),
  ADD KEY `fk_used_car_evaluations_user` (`evaluated_by`);

--
-- Indexes for table `used_car_listings`
--
ALTER TABLE `used_car_listings`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_used_car_listings_code` (`listing_code`),
  ADD KEY `fk_used_car_listings_vehicle` (`vehicle_id`),
  ADD KEY `fk_used_car_listings_created_by` (`created_by`);

--
-- Indexes for table `used_car_sales`
--
ALTER TABLE `used_car_sales`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_used_car_sales_listing` (`listing_id`),
  ADD KEY `fk_used_car_sales_contract` (`contract_id`),
  ADD KEY `fk_used_car_sales_buyer` (`buyer_customer_id`),
  ADD KEY `fk_used_car_sales_created_by` (`created_by`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_users_company_email` (`company_id`,`email`),
  ADD KEY `fk_users_branch` (`branch_id`);

--
-- Indexes for table `user_roles`
--
ALTER TABLE `user_roles`
  ADD PRIMARY KEY (`user_id`,`role_id`),
  ADD KEY `fk_user_roles_role` (`role_id`);

--
-- Indexes for table `user_sessions`
--
ALTER TABLE `user_sessions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_user_sessions_user` (`user_id`);

--
-- Indexes for table `vehicles`
--
ALTER TABLE `vehicles`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_vehicles_company_code` (`company_id`,`vehicle_code`),
  ADD UNIQUE KEY `uq_vehicles_registration` (`registration_number`),
  ADD KEY `fk_vehicles_branch` (`branch_id`),
  ADD KEY `fk_vehicles_brand` (`brand_id`),
  ADD KEY `fk_vehicles_model` (`model_id`),
  ADD KEY `idx_vehicles_status` (`status`);

--
-- Indexes for table `vehicle_brands`
--
ALTER TABLE `vehicle_brands`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `name` (`name`);

--
-- Indexes for table `vehicle_geofence_assignments`
--
ALTER TABLE `vehicle_geofence_assignments`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_vehicle_geofence` (`vehicle_id`,`geofence_id`),
  ADD KEY `fk_vehicle_geofence_assignments_geofence` (`geofence_id`);

--
-- Indexes for table `vehicle_insurance_policies`
--
ALTER TABLE `vehicle_insurance_policies`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_vehicle_insurance_vehicle` (`vehicle_id`),
  ADD KEY `fk_vehicle_insurance_file` (`file_id`);

--
-- Indexes for table `vehicle_maintenance_events`
--
ALTER TABLE `vehicle_maintenance_events`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_vehicle_maintenance_vehicle` (`vehicle_id`),
  ADD KEY `fk_vehicle_maintenance_invoice_file` (`invoice_file_id`),
  ADD KEY `fk_vehicle_maintenance_created_by` (`created_by`);

--
-- Indexes for table `vehicle_models`
--
ALTER TABLE `vehicle_models`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_vehicle_models_brand_model` (`brand_id`,`model_name`);

--
-- Indexes for table `vehicle_odometer_readings`
--
ALTER TABLE `vehicle_odometer_readings`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_vehicle_odometer_entered_by` (`entered_by`),
  ADD KEY `idx_vehicle_odometer_vehicle_reading_at` (`vehicle_id`,`reading_at`);

--
-- Indexes for table `vehicle_registrations`
--
ALTER TABLE `vehicle_registrations`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_vehicle_registrations_vehicle` (`vehicle_id`),
  ADD KEY `fk_vehicle_registrations_file` (`file_id`);

--
-- Indexes for table `vehicle_status_history`
--
ALTER TABLE `vehicle_status_history`
  ADD PRIMARY KEY (`id`),
  ADD KEY `fk_vehicle_status_history_vehicle` (`vehicle_id`),
  ADD KEY `fk_vehicle_status_history_user` (`changed_by`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `accounting_journals`
--
ALTER TABLE `accounting_journals`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `ai_models`
--
ALTER TABLE `ai_models`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `arrears_actions`
--
ALTER TABLE `arrears_actions`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `asset_depreciation_schedule`
--
ALTER TABLE `asset_depreciation_schedule`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `assistant_messages`
--
ALTER TABLE `assistant_messages`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `audit_logs`
--
ALTER TABLE `audit_logs`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `chart_of_accounts`
--
ALTER TABLE `chart_of_accounts`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `contract_clauses`
--
ALTER TABLE `contract_clauses`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `contract_mileage_logs`
--
ALTER TABLE `contract_mileage_logs`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `contract_status_history`
--
ALTER TABLE `contract_status_history`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `customer_addresses`
--
ALTER TABLE `customer_addresses`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `customer_contacts`
--
ALTER TABLE `customer_contacts`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `customer_notes`
--
ALTER TABLE `customer_notes`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `entity_attachments`
--
ALTER TABLE `entity_attachments`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `fiscal_periods`
--
ALTER TABLE `fiscal_periods`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `fiscal_years`
--
ALTER TABLE `fiscal_years`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `gps_positions`
--
ALTER TABLE `gps_positions`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `invoice_lines`
--
ALTER TABLE `invoice_lines`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `journal_entry_lines`
--
ALTER TABLE `journal_entry_lines`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `mission_checklist_items`
--
ALTER TABLE `mission_checklist_items`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `notification_templates`
--
ALTER TABLE `notification_templates`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `number_sequences`
--
ALTER TABLE `number_sequences`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `password_reset_tokens`
--
ALTER TABLE `password_reset_tokens`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `payment_allocations`
--
ALTER TABLE `payment_allocations`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `payment_methods`
--
ALTER TABLE `payment_methods`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `permissions`
--
ALTER TABLE `permissions`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `roles`
--
ALTER TABLE `roles`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `signature_events`
--
ALTER TABLE `signature_events`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `signature_providers`
--
ALTER TABLE `signature_providers`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `system_settings`
--
ALTER TABLE `system_settings`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `taxes`
--
ALTER TABLE `taxes`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `vehicle_brands`
--
ALTER TABLE `vehicle_brands`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `vehicle_geofence_assignments`
--
ALTER TABLE `vehicle_geofence_assignments`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `vehicle_models`
--
ALTER TABLE `vehicle_models`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `vehicle_odometer_readings`
--
ALTER TABLE `vehicle_odometer_readings`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `vehicle_status_history`
--
ALTER TABLE `vehicle_status_history`
  MODIFY `id` bigint(20) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `accounting_journals`
--
ALTER TABLE `accounting_journals`
  ADD CONSTRAINT `fk_accounting_journals_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  ADD CONSTRAINT `fk_accounting_journals_default_account` FOREIGN KEY (`default_account_id`) REFERENCES `chart_of_accounts` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `ai_predictions`
--
ALTER TABLE `ai_predictions`
  ADD CONSTRAINT `fk_ai_predictions_model` FOREIGN KEY (`model_id`) REFERENCES `ai_models` (`id`);

--
-- Constraints for table `arrears_actions`
--
ALTER TABLE `arrears_actions`
  ADD CONSTRAINT `fk_arrears_actions_case` FOREIGN KEY (`arrears_case_id`) REFERENCES `arrears_cases` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_arrears_actions_user` FOREIGN KEY (`performed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `arrears_cases`
--
ALTER TABLE `arrears_cases`
  ADD CONSTRAINT `fk_arrears_cases_assigned_to` FOREIGN KEY (`assigned_to`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_arrears_cases_contract` FOREIGN KEY (`contract_id`) REFERENCES `contracts` (`id`),
  ADD CONSTRAINT `fk_arrears_cases_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`);

--
-- Constraints for table `asset_depreciation_schedule`
--
ALTER TABLE `asset_depreciation_schedule`
  ADD CONSTRAINT `fk_asset_depreciation_schedule_asset` FOREIGN KEY (`asset_id`) REFERENCES `fixed_assets` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_asset_depreciation_schedule_entry` FOREIGN KEY (`journal_entry_id`) REFERENCES `journal_entries` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_asset_depreciation_schedule_period` FOREIGN KEY (`fiscal_period_id`) REFERENCES `fiscal_periods` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `assistant_conversations`
--
ALTER TABLE `assistant_conversations`
  ADD CONSTRAINT `fk_assistant_conversations_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  ADD CONSTRAINT `fk_assistant_conversations_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_assistant_conversations_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `assistant_messages`
--
ALTER TABLE `assistant_messages`
  ADD CONSTRAINT `fk_assistant_messages_conversation` FOREIGN KEY (`conversation_id`) REFERENCES `assistant_conversations` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `audit_logs`
--
ALTER TABLE `audit_logs`
  ADD CONSTRAINT `fk_audit_logs_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`),
  ADD CONSTRAINT `fk_audit_logs_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  ADD CONSTRAINT `fk_audit_logs_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `bank_accounts`
--
ALTER TABLE `bank_accounts`
  ADD CONSTRAINT `fk_bank_accounts_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`),
  ADD CONSTRAINT `fk_bank_accounts_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`);

--
-- Constraints for table `bank_transactions`
--
ALTER TABLE `bank_transactions`
  ADD CONSTRAINT `fk_bank_transactions_bank_account` FOREIGN KEY (`bank_account_id`) REFERENCES `bank_accounts` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_bank_transactions_payment` FOREIGN KEY (`payment_id`) REFERENCES `payments` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `branches`
--
ALTER TABLE `branches`
  ADD CONSTRAINT `fk_branches_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`);

--
-- Constraints for table `chart_of_accounts`
--
ALTER TABLE `chart_of_accounts`
  ADD CONSTRAINT `fk_chart_of_accounts_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  ADD CONSTRAINT `fk_chart_of_accounts_parent` FOREIGN KEY (`parent_account_id`) REFERENCES `chart_of_accounts` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `contracts`
--
ALTER TABLE `contracts`
  ADD CONSTRAINT `fk_contracts_approved_by` FOREIGN KEY (`approved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_contracts_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`),
  ADD CONSTRAINT `fk_contracts_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  ADD CONSTRAINT `fk_contracts_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_contracts_credit_application` FOREIGN KEY (`credit_application_id`) REFERENCES `credit_applications` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_contracts_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`),
  ADD CONSTRAINT `fk_contracts_template` FOREIGN KEY (`template_id`) REFERENCES `contract_templates` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_contracts_vehicle` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles` (`id`);

--
-- Constraints for table `contract_clauses`
--
ALTER TABLE `contract_clauses`
  ADD CONSTRAINT `fk_contract_clauses_contract` FOREIGN KEY (`contract_id`) REFERENCES `contracts` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `contract_installments`
--
ALTER TABLE `contract_installments`
  ADD CONSTRAINT `fk_contract_installments_contract` FOREIGN KEY (`contract_id`) REFERENCES `contracts` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `contract_mileage_logs`
--
ALTER TABLE `contract_mileage_logs`
  ADD CONSTRAINT `fk_contract_mileage_logs_contract` FOREIGN KEY (`contract_id`) REFERENCES `contracts` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_contract_mileage_logs_vehicle` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `contract_status_history`
--
ALTER TABLE `contract_status_history`
  ADD CONSTRAINT `fk_contract_status_history_contract` FOREIGN KEY (`contract_id`) REFERENCES `contracts` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_contract_status_history_user` FOREIGN KEY (`changed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `contract_templates`
--
ALTER TABLE `contract_templates`
  ADD CONSTRAINT `fk_contract_templates_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  ADD CONSTRAINT `fk_contract_templates_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `credit_applications`
--
ALTER TABLE `credit_applications`
  ADD CONSTRAINT `fk_credit_applications_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`),
  ADD CONSTRAINT `fk_credit_applications_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  ADD CONSTRAINT `fk_credit_applications_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`),
  ADD CONSTRAINT `fk_credit_applications_decided_by` FOREIGN KEY (`decided_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `credit_decisions`
--
ALTER TABLE `credit_decisions`
  ADD CONSTRAINT `fk_credit_decisions_application` FOREIGN KEY (`application_id`) REFERENCES `credit_applications` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_credit_decisions_decided_by` FOREIGN KEY (`decided_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `credit_scores`
--
ALTER TABLE `credit_scores`
  ADD CONSTRAINT `fk_credit_scores_application` FOREIGN KEY (`application_id`) REFERENCES `credit_applications` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `customers`
--
ALTER TABLE `customers`
  ADD CONSTRAINT `fk_customers_assigned_to` FOREIGN KEY (`assigned_to_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_customers_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`),
  ADD CONSTRAINT `fk_customers_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`);

--
-- Constraints for table `customer_addresses`
--
ALTER TABLE `customer_addresses`
  ADD CONSTRAINT `fk_customer_addresses_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `customer_bank_accounts`
--
ALTER TABLE `customer_bank_accounts`
  ADD CONSTRAINT `fk_customer_bank_accounts_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `customer_blacklist_entries`
--
ALTER TABLE `customer_blacklist_entries`
  ADD CONSTRAINT `fk_customer_blacklist_added_by` FOREIGN KEY (`added_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_customer_blacklist_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_customer_blacklist_removed_by` FOREIGN KEY (`removed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `customer_company_profiles`
--
ALTER TABLE `customer_company_profiles`
  ADD CONSTRAINT `fk_customer_company_profile_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `customer_contacts`
--
ALTER TABLE `customer_contacts`
  ADD CONSTRAINT `fk_customer_contacts_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `customer_employment_profiles`
--
ALTER TABLE `customer_employment_profiles`
  ADD CONSTRAINT `fk_customer_employment_profiles_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `customer_individual_profiles`
--
ALTER TABLE `customer_individual_profiles`
  ADD CONSTRAINT `fk_customer_individual_profile_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `customer_kyc_cases`
--
ALTER TABLE `customer_kyc_cases`
  ADD CONSTRAINT `fk_customer_kyc_cases_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_customer_kyc_cases_reviewed_by` FOREIGN KEY (`reviewed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `customer_kyc_documents`
--
ALTER TABLE `customer_kyc_documents`
  ADD CONSTRAINT `fk_customer_kyc_documents_case` FOREIGN KEY (`kyc_case_id`) REFERENCES `customer_kyc_cases` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_customer_kyc_documents_file` FOREIGN KEY (`file_id`) REFERENCES `files` (`id`),
  ADD CONSTRAINT `fk_customer_kyc_documents_verified_by` FOREIGN KEY (`verified_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `customer_notes`
--
ALTER TABLE `customer_notes`
  ADD CONSTRAINT `fk_customer_notes_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_customer_notes_user` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `electronic_certificates`
--
ALTER TABLE `electronic_certificates`
  ADD CONSTRAINT `fk_certificates_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `entity_attachments`
--
ALTER TABLE `entity_attachments`
  ADD CONSTRAINT `fk_entity_attachments_file` FOREIGN KEY (`file_id`) REFERENCES `files` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_entity_attachments_uploaded_by` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `files`
--
ALTER TABLE `files`
  ADD CONSTRAINT `fk_files_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`),
  ADD CONSTRAINT `fk_files_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  ADD CONSTRAINT `fk_files_uploaded_by` FOREIGN KEY (`uploaded_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `fiscal_periods`
--
ALTER TABLE `fiscal_periods`
  ADD CONSTRAINT `fk_fiscal_periods_year` FOREIGN KEY (`fiscal_year_id`) REFERENCES `fiscal_years` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `fiscal_years`
--
ALTER TABLE `fiscal_years`
  ADD CONSTRAINT `fk_fiscal_years_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`);

--
-- Constraints for table `fixed_assets`
--
ALTER TABLE `fixed_assets`
  ADD CONSTRAINT `fk_fixed_assets_acc_dep_account` FOREIGN KEY (`accumulated_depreciation_account_id`) REFERENCES `chart_of_accounts` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_fixed_assets_asset_account` FOREIGN KEY (`asset_account_id`) REFERENCES `chart_of_accounts` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_fixed_assets_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  ADD CONSTRAINT `fk_fixed_assets_dep_expense_account` FOREIGN KEY (`depreciation_expense_account_id`) REFERENCES `chart_of_accounts` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_fixed_assets_vehicle` FOREIGN KEY (`source_vehicle_id`) REFERENCES `vehicles` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `geofences`
--
ALTER TABLE `geofences`
  ADD CONSTRAINT `fk_geofences_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  ADD CONSTRAINT `fk_geofences_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `gps_alerts`
--
ALTER TABLE `gps_alerts`
  ADD CONSTRAINT `fk_gps_alerts_device` FOREIGN KEY (`gps_device_id`) REFERENCES `gps_devices` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_gps_alerts_resolved_by` FOREIGN KEY (`resolved_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_gps_alerts_vehicle` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles` (`id`);

--
-- Constraints for table `gps_devices`
--
ALTER TABLE `gps_devices`
  ADD CONSTRAINT `fk_gps_devices_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`);

--
-- Constraints for table `gps_device_assignments`
--
ALTER TABLE `gps_device_assignments`
  ADD CONSTRAINT `fk_gps_assignments_device` FOREIGN KEY (`gps_device_id`) REFERENCES `gps_devices` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_gps_assignments_vehicle` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `gps_positions`
--
ALTER TABLE `gps_positions`
  ADD CONSTRAINT `fk_gps_positions_device` FOREIGN KEY (`gps_device_id`) REFERENCES `gps_devices` (`id`),
  ADD CONSTRAINT `fk_gps_positions_vehicle` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles` (`id`);

--
-- Constraints for table `gps_trips`
--
ALTER TABLE `gps_trips`
  ADD CONSTRAINT `fk_gps_trips_device` FOREIGN KEY (`gps_device_id`) REFERENCES `gps_devices` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_gps_trips_vehicle` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles` (`id`);

--
-- Constraints for table `invoices`
--
ALTER TABLE `invoices`
  ADD CONSTRAINT `fk_invoices_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`),
  ADD CONSTRAINT `fk_invoices_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  ADD CONSTRAINT `fk_invoices_contract` FOREIGN KEY (`contract_id`) REFERENCES `contracts` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_invoices_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_invoices_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`),
  ADD CONSTRAINT `fk_invoices_pdf_file` FOREIGN KEY (`pdf_file_id`) REFERENCES `files` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `invoice_lines`
--
ALTER TABLE `invoice_lines`
  ADD CONSTRAINT `fk_invoice_lines_installment` FOREIGN KEY (`contract_installment_id`) REFERENCES `contract_installments` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_invoice_lines_invoice` FOREIGN KEY (`invoice_id`) REFERENCES `invoices` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `journal_entries`
--
ALTER TABLE `journal_entries`
  ADD CONSTRAINT `fk_journal_entries_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`),
  ADD CONSTRAINT `fk_journal_entries_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  ADD CONSTRAINT `fk_journal_entries_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_journal_entries_journal` FOREIGN KEY (`journal_id`) REFERENCES `accounting_journals` (`id`),
  ADD CONSTRAINT `fk_journal_entries_posted_by` FOREIGN KEY (`posted_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `journal_entry_lines`
--
ALTER TABLE `journal_entry_lines`
  ADD CONSTRAINT `fk_journal_entry_lines_account` FOREIGN KEY (`account_id`) REFERENCES `chart_of_accounts` (`id`),
  ADD CONSTRAINT `fk_journal_entry_lines_contract` FOREIGN KEY (`contract_id`) REFERENCES `contracts` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_journal_entry_lines_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_journal_entry_lines_entry` FOREIGN KEY (`journal_entry_id`) REFERENCES `journal_entries` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_journal_entry_lines_tax` FOREIGN KEY (`tax_id`) REFERENCES `taxes` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_journal_entry_lines_vehicle` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `legal_cases`
--
ALTER TABLE `legal_cases`
  ADD CONSTRAINT `fk_legal_cases_arrears` FOREIGN KEY (`arrears_case_id`) REFERENCES `arrears_cases` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_legal_cases_contract` FOREIGN KEY (`contract_id`) REFERENCES `contracts` (`id`),
  ADD CONSTRAINT `fk_legal_cases_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_legal_cases_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`);

--
-- Constraints for table `missions`
--
ALTER TABLE `missions`
  ADD CONSTRAINT `fk_missions_assigned_user` FOREIGN KEY (`assigned_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_missions_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`),
  ADD CONSTRAINT `fk_missions_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  ADD CONSTRAINT `fk_missions_contract` FOREIGN KEY (`contract_id`) REFERENCES `contracts` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_missions_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_missions_reservation` FOREIGN KEY (`reservation_id`) REFERENCES `reservations` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_missions_signature_file` FOREIGN KEY (`customer_signature_file_id`) REFERENCES `files` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_missions_vehicle` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `mission_checklist_items`
--
ALTER TABLE `mission_checklist_items`
  ADD CONSTRAINT `fk_mission_checklist_items_mission` FOREIGN KEY (`mission_id`) REFERENCES `missions` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `notifications`
--
ALTER TABLE `notifications`
  ADD CONSTRAINT `fk_notifications_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  ADD CONSTRAINT `fk_notifications_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_notifications_template` FOREIGN KEY (`template_id`) REFERENCES `notification_templates` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_notifications_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `notification_templates`
--
ALTER TABLE `notification_templates`
  ADD CONSTRAINT `fk_notification_templates_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`);

--
-- Constraints for table `number_sequences`
--
ALTER TABLE `number_sequences`
  ADD CONSTRAINT `fk_sequences_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`),
  ADD CONSTRAINT `fk_sequences_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`);

--
-- Constraints for table `password_reset_tokens`
--
ALTER TABLE `password_reset_tokens`
  ADD CONSTRAINT `fk_password_resets_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `payments`
--
ALTER TABLE `payments`
  ADD CONSTRAINT `fk_payments_bank_account` FOREIGN KEY (`bank_account_id`) REFERENCES `bank_accounts` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_payments_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`),
  ADD CONSTRAINT `fk_payments_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  ADD CONSTRAINT `fk_payments_contract` FOREIGN KEY (`contract_id`) REFERENCES `contracts` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_payments_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_payments_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_payments_method` FOREIGN KEY (`payment_method_id`) REFERENCES `payment_methods` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `payment_allocations`
--
ALTER TABLE `payment_allocations`
  ADD CONSTRAINT `fk_payment_allocations_installment` FOREIGN KEY (`contract_installment_id`) REFERENCES `contract_installments` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_payment_allocations_invoice` FOREIGN KEY (`invoice_id`) REFERENCES `invoices` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_payment_allocations_payment` FOREIGN KEY (`payment_id`) REFERENCES `payments` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `reservations`
--
ALTER TABLE `reservations`
  ADD CONSTRAINT `fk_reservations_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`),
  ADD CONSTRAINT `fk_reservations_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  ADD CONSTRAINT `fk_reservations_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_reservations_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`),
  ADD CONSTRAINT `fk_reservations_vehicle` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles` (`id`);

--
-- Constraints for table `roles`
--
ALTER TABLE `roles`
  ADD CONSTRAINT `fk_roles_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`);

--
-- Constraints for table `role_permissions`
--
ALTER TABLE `role_permissions`
  ADD CONSTRAINT `fk_role_permissions_permission` FOREIGN KEY (`permission_id`) REFERENCES `permissions` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_role_permissions_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `signature_envelopes`
--
ALTER TABLE `signature_envelopes`
  ADD CONSTRAINT `fk_signature_envelopes_certificate` FOREIGN KEY (`certificate_id`) REFERENCES `electronic_certificates` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_signature_envelopes_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  ADD CONSTRAINT `fk_signature_envelopes_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_signature_envelopes_provider` FOREIGN KEY (`provider_id`) REFERENCES `signature_providers` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_signature_envelopes_signed_file` FOREIGN KEY (`signed_file_id`) REFERENCES `files` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `signature_events`
--
ALTER TABLE `signature_events`
  ADD CONSTRAINT `fk_signature_events_envelope` FOREIGN KEY (`envelope_id`) REFERENCES `signature_envelopes` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_signature_events_signer` FOREIGN KEY (`signer_id`) REFERENCES `signature_signers` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `signature_signers`
--
ALTER TABLE `signature_signers`
  ADD CONSTRAINT `fk_signature_signers_customer` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_signature_signers_envelope` FOREIGN KEY (`envelope_id`) REFERENCES `signature_envelopes` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_signature_signers_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `system_settings`
--
ALTER TABLE `system_settings`
  ADD CONSTRAINT `fk_system_settings_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`);

--
-- Constraints for table `taxes`
--
ALTER TABLE `taxes`
  ADD CONSTRAINT `fk_taxes_account_collected` FOREIGN KEY (`account_collected_id`) REFERENCES `chart_of_accounts` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_taxes_account_deductible` FOREIGN KEY (`account_deductible_id`) REFERENCES `chart_of_accounts` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_taxes_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`);

--
-- Constraints for table `used_car_evaluations`
--
ALTER TABLE `used_car_evaluations`
  ADD CONSTRAINT `fk_used_car_evaluations_listing` FOREIGN KEY (`listing_id`) REFERENCES `used_car_listings` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_used_car_evaluations_user` FOREIGN KEY (`evaluated_by`) REFERENCES `users` (`id`) ON DELETE SET NULL;

--
-- Constraints for table `used_car_listings`
--
ALTER TABLE `used_car_listings`
  ADD CONSTRAINT `fk_used_car_listings_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_used_car_listings_vehicle` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `used_car_sales`
--
ALTER TABLE `used_car_sales`
  ADD CONSTRAINT `fk_used_car_sales_buyer` FOREIGN KEY (`buyer_customer_id`) REFERENCES `customers` (`id`),
  ADD CONSTRAINT `fk_used_car_sales_contract` FOREIGN KEY (`contract_id`) REFERENCES `contracts` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_used_car_sales_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_used_car_sales_listing` FOREIGN KEY (`listing_id`) REFERENCES `used_car_listings` (`id`);

--
-- Constraints for table `users`
--
ALTER TABLE `users`
  ADD CONSTRAINT `fk_users_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`),
  ADD CONSTRAINT `fk_users_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`);

--
-- Constraints for table `user_roles`
--
ALTER TABLE `user_roles`
  ADD CONSTRAINT `fk_user_roles_role` FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_user_roles_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `user_sessions`
--
ALTER TABLE `user_sessions`
  ADD CONSTRAINT `fk_user_sessions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `vehicles`
--
ALTER TABLE `vehicles`
  ADD CONSTRAINT `fk_vehicles_branch` FOREIGN KEY (`branch_id`) REFERENCES `branches` (`id`),
  ADD CONSTRAINT `fk_vehicles_brand` FOREIGN KEY (`brand_id`) REFERENCES `vehicle_brands` (`id`),
  ADD CONSTRAINT `fk_vehicles_company` FOREIGN KEY (`company_id`) REFERENCES `companies` (`id`),
  ADD CONSTRAINT `fk_vehicles_model` FOREIGN KEY (`model_id`) REFERENCES `vehicle_models` (`id`);

--
-- Constraints for table `vehicle_geofence_assignments`
--
ALTER TABLE `vehicle_geofence_assignments`
  ADD CONSTRAINT `fk_vehicle_geofence_assignments_geofence` FOREIGN KEY (`geofence_id`) REFERENCES `geofences` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_vehicle_geofence_assignments_vehicle` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `vehicle_insurance_policies`
--
ALTER TABLE `vehicle_insurance_policies`
  ADD CONSTRAINT `fk_vehicle_insurance_file` FOREIGN KEY (`file_id`) REFERENCES `files` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_vehicle_insurance_vehicle` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `vehicle_maintenance_events`
--
ALTER TABLE `vehicle_maintenance_events`
  ADD CONSTRAINT `fk_vehicle_maintenance_created_by` FOREIGN KEY (`created_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_vehicle_maintenance_invoice_file` FOREIGN KEY (`invoice_file_id`) REFERENCES `files` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_vehicle_maintenance_vehicle` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `vehicle_models`
--
ALTER TABLE `vehicle_models`
  ADD CONSTRAINT `fk_vehicle_models_brand` FOREIGN KEY (`brand_id`) REFERENCES `vehicle_brands` (`id`);

--
-- Constraints for table `vehicle_odometer_readings`
--
ALTER TABLE `vehicle_odometer_readings`
  ADD CONSTRAINT `fk_vehicle_odometer_entered_by` FOREIGN KEY (`entered_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_vehicle_odometer_vehicle` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `vehicle_registrations`
--
ALTER TABLE `vehicle_registrations`
  ADD CONSTRAINT `fk_vehicle_registrations_file` FOREIGN KEY (`file_id`) REFERENCES `files` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_vehicle_registrations_vehicle` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `vehicle_status_history`
--
ALTER TABLE `vehicle_status_history`
  ADD CONSTRAINT `fk_vehicle_status_history_user` FOREIGN KEY (`changed_by`) REFERENCES `users` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_vehicle_status_history_vehicle` FOREIGN KEY (`vehicle_id`) REFERENCES `vehicles` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
