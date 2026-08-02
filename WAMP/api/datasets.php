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
            'table' => 'parametres_impression',
            'columns' => ['facility_name' => 'facilityName', 'currency' => 'currency'],
        ],

        'users' => [
            'type' => 'list',
            'table' => 'utilisateurs',
            'columns' => ['name' => 'name', 'role' => 'role'],
        ],
        'patients' => [
            'type' => 'list',
            'table' => 'patients',
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
            'table' => 'consultations',
            'columns' => [
                'patient_id' => 'patientId', 'doctor_id' => 'doctorId',
                'doctor_name' => 'doctorName', 'date' => 'date',
            ],
        ],
        'invoices' => [
            'type' => 'list',
            'table' => 'factures',
            'columns' => [
                'patient_id' => 'patientId', 'consultation_id' => 'consultationId',
                'client_type' => 'clientType', 'status' => 'status',
                'total_amount' => 'totalAmount', 'created_at' => 'createdAt',
            ],
        ],
        'ventes' => [
            'type' => 'list',
            'table' => 'ventes',
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
            'table' => 'lignes_vente',
            'columns' => [
                'vente_id' => 'venteId', 'article_id' => 'articleId',
                'article_name' => 'articleName', 'quantity' => 'quantity',
                'unit_price' => 'unitPrice',
            ],
        ],
        'ventePayments' => [
            'type' => 'list',
            'table' => 'paiements_vente',
            'columns' => [
                'vente_id' => 'venteId', 'amount' => 'amount',
                'method' => 'method', 'date' => 'date',
            ],
        ],
        'articles' => [
            'type' => 'list',
            'table' => 'articles',
            'columns' => [
                'name' => 'name', 'family' => 'family', 'unit' => 'unit',
                'stock_central' => 'stockCentral', 'stock_pharmacie' => 'stockPharmacie',
                'barcode' => 'barcode',
            ],
        ],
        'companies' => [
            'type' => 'list',
            'table' => 'societes',
            'columns' => ['name' => 'name', 'settlement_mode' => 'settlementMode'],
        ],
        'companyBillingAccounts' => [
            'type' => 'list',
            'table' => 'comptes_facturation_societes',
            'columns' => [
                'company' => 'company', 'month' => 'month', 'status' => 'status',
                'total_amount' => 'totalAmount', 'paid_amount' => 'paidAmount',
            ],
        ],
        'fournisseurs' => [
            'type' => 'list',
            'table' => 'fournisseurs',
            'columns' => ['name' => 'name', 'phone' => 'phone'],
        ],
        'familles' => [
            'type' => 'list',
            'table' => 'familles',
            'columns' => ['code' => 'code', 'name' => 'name', 'color' => 'color'],
        ],
        'warehouseServices' => [
            'type' => 'list',
            'table' => 'services_depot',
            'columns' => ['code' => 'code', 'name' => 'name', 'kind' => 'kind', 'active' => 'active'],
        ],
        'labCatalog' => [
            'type' => 'list',
            'table' => 'catalogue_laboratoire',
            'columns' => ['code' => 'code', 'name' => 'name', 'category' => 'category'],
        ],
        'labRequests' => [
            'type' => 'list',
            'table' => 'demandes_laboratoire',
            'columns' => [
                'patient_id' => 'patientId', 'consultation_id' => 'consultationId',
                'exam_type' => 'examType', 'status' => 'status',
                'urgent' => 'urgent', 'requested_at' => 'requestedAt',
            ],
        ],
        'journey' => [
            'type' => 'list',
            'table' => 'parcours_patient',
            'columns' => [
                'patient_id' => 'patientId', 'timestamp' => 'timestamp',
                'department' => 'department', 'action' => 'action',
            ],
        ],
        'cashClosings' => [
            'type' => 'list',
            'table' => 'clotures_caisse',
            'columns' => ['date' => 'date', 'cashier_id' => 'cashierId', 'grand_total' => 'grandTotal'],
        ],
        'auditLogs' => [
            'type' => 'list',
            'table' => 'journaux_audit',
            'columns' => ['timestamp' => 'timestamp', 'user_id' => 'userId', 'action' => 'action'],
        ],
        'notifications' => [
            'type' => 'list',
            'table' => 'notifications',
            'columns' => ['target_role' => 'targetRole', 'type' => 'type', 'timestamp' => 'timestamp', 'read_flag' => 'read'],
        ],
        'messages' => [
            'type' => 'list',
            'table' => 'messages',
            'columns' => ['from_user_id' => 'fromUserId', 'to_user_id' => 'toUserId', 'timestamp' => 'timestamp', 'read_flag' => 'read'],
        ],
        'stockTransfers' => [
            'type' => 'list',
            'table' => 'transferts_stock',
            'columns' => [
                'article_id' => 'articleId', 'quantity' => 'quantity', 'status' => 'status',
                'target_service_id' => 'targetServiceId', 'requested_at' => 'requestedAt',
            ],
        ],
        'stockEntries' => [
            'type' => 'list',
            'table' => 'entrees_stock',
            'columns' => ['article_id' => 'articleId', 'quantity' => 'quantity', 'supplier' => 'supplier', 'date' => 'date'],
        ],
        'stockMovements' => [
            'type' => 'list',
            'table' => 'mouvements_stock',
            'columns' => [
                'type' => 'type', 'article_id' => 'articleId', 'quantity' => 'quantity',
                'date' => 'date', 'from_location' => 'fromLocation', 'to_location' => 'toLocation',
            ],
        ],
        'movementHeaders' => [
            'type' => 'list',
            'table' => 'entetes_mouvements',
            'columns' => ['type' => 'type', 'ref' => 'ref', 'date' => 'date', 'user_id' => 'userId'],
        ],
        'movementLines' => [
            'type' => 'list',
            'table' => 'lignes_mouvements',
            'columns' => [
                'movement_id' => 'movementId', 'article_id' => 'articleId',
                'article_name' => 'articleName', 'quantity' => 'quantity',
            ],
        ],
        'inventorySessions' => [
            'type' => 'list',
            'table' => 'sessions_inventaire',
            'columns' => ['location' => 'location', 'status' => 'status', 'started_at' => 'startedAt', 'started_by' => 'startedBy'],
        ],
        'pharmaDeliveryItems' => [
            'type' => 'list',
            'table' => 'lignes_livraison_pharmacie',
            'columns' => [
                'consultation_id' => 'consultationId', 'patient_id' => 'patientId',
                'article_name' => 'articleName', 'quantity' => 'quantity', 'delivered_at' => 'deliveredAt',
            ],
        ],
        'pharmaDeliveryClosings' => [
            'type' => 'list',
            'table' => 'clotures_livraison_pharmacie',
            'columns' => ['closing_number' => 'closingNumber', 'date' => 'date', 'total_amount' => 'totalAmount'],
        ],
        'hbRecords' => [
            'type' => 'list',
            'table' => 'dossiers_hospitalisation_bloc',
            'columns' => [
                'patient_id' => 'patientId', 'patient_name' => 'patientName',
                'type' => 'type', 'client_type' => 'clientType', 'opened_at' => 'openedAt',
            ],
        ],

        // Compteurs séquentiels (scalaires → table compteurs)
        'factureCounter' => ['type' => 'counter', 'table' => 'compteurs', 'counter_id' => 'factureCounter'],
        'pharmaClosingCounter' => ['type' => 'counter', 'table' => 'compteurs', 'counter_id' => 'pharmaClosingCounter'],
    ];
}
