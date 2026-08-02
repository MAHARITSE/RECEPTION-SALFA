<?php
/**
 * Correspondance explicite entre les collections de l'application
 * (objet d'état React) et les tables MySQL normalisées — RECEPTION SALFA.
 *
 * Chaque « dataset » correspond à une entité métier et possède :
 *   - `table`  : la table MySQL dans laquelle les lignes sont stockées ;
 *   - `type`   : 'list' (tableau d'objets) | 'single' (1 objet) | 'counter' (valeur scalaire) ;
 *   - `columns`: extractions (colonne MySQL => chemin de propriété dans l'objet)
 *                servant à l'interrogation en base. L'intégralité de l'objet
 *                est TOUJOURS conservée fidèlement dans `data_json`.
 *
 * Aucun nom de table ni de colonne fourni par le navigateur n'est injecté
 * en SQL : tout passe par cette table de correspondance (même principe de
 * sécurité que LogBara / Bar POS).
 */

declare(strict_types=1);

function reception_salfa_datasets(): array
{
    return [
        'ticketSettings' => [
            'type' => 'single',
            'table' => 'salfa_ticket_settings',
            'columns' => ['facility_name' => 'facilityName', 'currency' => 'currency'],
        ],

        'users' => [
            'type' => 'list',
            'table' => 'salfa_users',
            'columns' => ['name' => 'name', 'role' => 'role'],
        ],
        'patients' => [
            'type' => 'list',
            'table' => 'salfa_patients',
            'columns' => [
                'dossier' => 'dossier', 'matricule' => 'matricule',
                'first_name' => 'firstName', 'last_name' => 'lastName',
                'gender' => 'gender', 'status' => 'status',
                'client_type' => 'clientType', 'company' => 'company',
                'registered_at' => 'registeredAt',
            ],
        ],
        'consultations' => [
            'type' => 'list',
            'table' => 'salfa_consultations',
            'columns' => [
                'patient_id' => 'patientId', 'doctor_id' => 'doctorId',
                'doctor_name' => 'doctorName', 'date' => 'date',
            ],
        ],
        'invoices' => [
            'type' => 'list',
            'table' => 'salfa_invoices',
            'columns' => [
                'patient_id' => 'patientId', 'consultation_id' => 'consultationId',
                'client_type' => 'clientType', 'status' => 'status',
                'total_amount' => 'totalAmount', 'created_at' => 'createdAt',
            ],
        ],
        'ventes' => [
            'type' => 'list',
            'table' => 'salfa_ventes',
            'columns' => [
                'patient_id' => 'patientId', 'consultation_id' => 'consultationId',
                'numero_facture' => 'numeroFacture', 'type' => 'type',
                'client_type' => 'clientType', 'company' => 'company',
                'status' => 'status', 'montant_facture' => 'montantFacture',
                'montant_paye' => 'montantPaye', 'date_vente' => 'dateVente',
                'source' => 'source', 'closing_id' => 'closingId',
            ],
        ],
        'venteLines' => [
            'type' => 'list',
            'table' => 'salfa_vente_lines',
            'columns' => [
                'vente_id' => 'venteId', 'article_id' => 'articleId',
                'article_name' => 'articleName', 'quantity' => 'quantity',
                'unit_price' => 'unitPrice',
            ],
        ],
        'ventePayments' => [
            'type' => 'list',
            'table' => 'salfa_vente_payments',
            'columns' => [
                'vente_id' => 'venteId', 'amount' => 'amount',
                'method' => 'method', 'date' => 'date',
            ],
        ],
        'articles' => [
            'type' => 'list',
            'table' => 'salfa_articles',
            'columns' => [
                'name' => 'name', 'family' => 'family', 'unit' => 'unit',
                'stock_central' => 'stockCentral', 'stock_pharmacie' => 'stockPharmacie',
                'barcode' => 'barcode',
            ],
        ],
        'companies' => [
            'type' => 'list',
            'table' => 'salfa_companies',
            'columns' => ['name' => 'name', 'settlement_mode' => 'settlementMode'],
        ],
        'companyBillingAccounts' => [
            'type' => 'list',
            'table' => 'salfa_company_billing_accounts',
            'columns' => [
                'company' => 'company', 'month' => 'month', 'status' => 'status',
                'total_amount' => 'totalAmount', 'paid_amount' => 'paidAmount',
            ],
        ],
        'fournisseurs' => [
            'type' => 'list',
            'table' => 'salfa_fournisseurs',
            'columns' => ['name' => 'name', 'phone' => 'phone'],
        ],
        'familles' => [
            'type' => 'list',
            'table' => 'salfa_familles',
            'columns' => ['code' => 'code', 'name' => 'name', 'color' => 'color'],
        ],
        'warehouseServices' => [
            'type' => 'list',
            'table' => 'salfa_warehouse_services',
            'columns' => ['code' => 'code', 'name' => 'name', 'kind' => 'kind', 'active' => 'active'],
        ],
        'labCatalog' => [
            'type' => 'list',
            'table' => 'salfa_lab_catalog',
            'columns' => ['code' => 'code', 'name' => 'name', 'category' => 'category'],
        ],
        'labRequests' => [
            'type' => 'list',
            'table' => 'salfa_lab_requests',
            'columns' => [
                'patient_id' => 'patientId', 'consultation_id' => 'consultationId',
                'exam_type' => 'examType', 'status' => 'status',
                'urgent' => 'urgent', 'requested_at' => 'requestedAt',
            ],
        ],
        'journey' => [
            'type' => 'list',
            'table' => 'salfa_journey',
            'columns' => [
                'patient_id' => 'patientId', 'timestamp' => 'timestamp',
                'department' => 'department', 'action' => 'action',
            ],
        ],
        'cashClosings' => [
            'type' => 'list',
            'table' => 'salfa_cash_closings',
            'columns' => ['date' => 'date', 'cashier_id' => 'cashierId', 'grand_total' => 'grandTotal'],
        ],
        'auditLogs' => [
            'type' => 'list',
            'table' => 'salfa_audit_logs',
            'columns' => ['timestamp' => 'timestamp', 'user_id' => 'userId', 'action' => 'action'],
        ],
        'notifications' => [
            'type' => 'list',
            'table' => 'salfa_notifications',
            'columns' => ['target_role' => 'targetRole', 'type' => 'type', 'timestamp' => 'timestamp', 'read_flag' => 'read'],
        ],
        'messages' => [
            'type' => 'list',
            'table' => 'salfa_messages',
            'columns' => ['from_user_id' => 'fromUserId', 'to_user_id' => 'toUserId', 'timestamp' => 'timestamp', 'read_flag' => 'read'],
        ],
        'stockTransfers' => [
            'type' => 'list',
            'table' => 'salfa_stock_transfers',
            'columns' => [
                'article_id' => 'articleId', 'quantity' => 'quantity', 'status' => 'status',
                'target_service_id' => 'targetServiceId', 'requested_at' => 'requestedAt',
            ],
        ],
        'stockEntries' => [
            'type' => 'list',
            'table' => 'salfa_stock_entries',
            'columns' => ['article_id' => 'articleId', 'quantity' => 'quantity', 'supplier' => 'supplier', 'date' => 'date'],
        ],
        'stockMovements' => [
            'type' => 'list',
            'table' => 'salfa_stock_movements',
            'columns' => [
                'type' => 'type', 'article_id' => 'articleId', 'quantity' => 'quantity',
                'date' => 'date', 'from_location' => 'fromLocation', 'to_location' => 'toLocation',
            ],
        ],
        'movementHeaders' => [
            'type' => 'list',
            'table' => 'salfa_movement_headers',
            'columns' => ['type' => 'type', 'ref' => 'ref', 'date' => 'date', 'user_id' => 'userId'],
        ],
        'movementLines' => [
            'type' => 'list',
            'table' => 'salfa_movement_lines',
            'columns' => [
                'movement_id' => 'movementId', 'article_id' => 'articleId',
                'article_name' => 'articleName', 'quantity' => 'quantity',
            ],
        ],
        'inventorySessions' => [
            'type' => 'list',
            'table' => 'salfa_inventory_sessions',
            'columns' => ['location' => 'location', 'status' => 'status', 'started_at' => 'startedAt', 'started_by' => 'startedBy'],
        ],
        'pharmaDeliveryItems' => [
            'type' => 'list',
            'table' => 'salfa_pharma_delivery_items',
            'columns' => [
                'consultation_id' => 'consultationId', 'patient_id' => 'patientId',
                'article_name' => 'articleName', 'quantity' => 'quantity', 'delivered_at' => 'deliveredAt',
            ],
        ],
        'pharmaDeliveryClosings' => [
            'type' => 'list',
            'table' => 'salfa_pharma_delivery_closings',
            'columns' => ['closing_number' => 'closingNumber', 'date' => 'date', 'total_amount' => 'totalAmount'],
        ],
        'hbRecords' => [
            'type' => 'list',
            'table' => 'salfa_hb_records',
            'columns' => [
                'patient_id' => 'patientId', 'patient_name' => 'patientName',
                'type' => 'type', 'client_type' => 'clientType', 'opened_at' => 'openedAt',
            ],
        ],

        // Compteurs séquentiels (scalaires → table salfa_counters)
        'factureCounter' => ['type' => 'counter', 'table' => 'salfa_counters', 'counter_id' => 'factureCounter'],
        'pharmaClosingCounter' => ['type' => 'counter', 'table' => 'salfa_counters', 'counter_id' => 'pharmaClosingCounter'],
    ];
}
