-- ============================================================================
-- RECEPTION SALFA — Données initiales minimales (WAMP / MySQL)
-- À importer APRÈS `schema.sql` (phpMyAdmin → base `reception_salfa`).
--
-- Contenu : comptes de connexion par défaut, familles d'articles,
-- services du dépôt, paramètres d'impression. AUCUN patient, AUCUNE
-- vente : la base métier part vide et ne contient que ce qui est saisi.
--
-- ⚠️ MOTS DE PASSE PAR DÉFAUT — À CHANGER IMMÉDIATEMENT après la
-- première connexion (Administration → Utilisateurs). Voir SECURITE.md.
-- ============================================================================

USE `reception_salfa`;

-- --------------------------------------------------------------------------
-- Comptes de connexion (mots de passe par défaut : voir cartouche ci-dessus)
-- --------------------------------------------------------------------------

INSERT IGNORE INTO `utilisateurs` (`id`, `donnees`) VALUES
('USR-ADMIN', '{"id":"USR-ADMIN","name":"Admin Système","role":"admin","password":"admin123","roles":["admin","doctor","cashier","pharmacy","magasinier","laboratory","billing"]}'),
('USR-REC', '{"id":"USR-REC","name":"Aina Rakoto","role":"receptionist","password":"rec123"}'),
('USR-DOC', '{"id":"USR-DOC","name":"Dr. Feno Rasoana","role":"doctor","password":"doc123"}'),
('USR-DOC2', '{"id":"USR-DOC2","name":"Dr. Mialy Andria","role":"doctor","password":"doc123"}'),
('USR-CASH', '{"id":"USR-CASH","name":"Caisse 1 - Miora Kanto","role":"cashier","password":"caisse123","roles":["cashier","billing","receptionist"]}'),
('USR-CASH2', '{"id":"USR-CASH2","name":"Caisse 2 - Pierre Duval","role":"cashier","password":"caisse123"}'),
('USR-PHA', '{"id":"USR-PHA","name":"Pharmacie 1 - Tiana Soa","role":"pharmacy","password":"pharma123"}'),
('USR-PHA2', '{"id":"USR-PHA2","name":"Pharmacie 2 - Fatima Benali","role":"pharmacy","password":"pharma123"}'),
('USR-LAB', '{"id":"USR-LAB","name":"Hery Lanto","role":"laboratory","password":"labo123"}'),
('USR-MAG', '{"id":"USR-MAG","name":"Niry Tahina","role":"magasinier","password":"mag123"}'),
('USR-BIL', '{"id":"USR-BIL","name":"Lova Sitraka","role":"billing","password":"fact123"}');

-- --------------------------------------------------------------------------
-- Familles d'articles (MEDIC / LABO / ECHO / HOSP / DENT)
-- --------------------------------------------------------------------------

INSERT IGNORE INTO `familles` (`id`, `donnees`) VALUES
('fam-medic', '{"id":"fam-medic","code":"MEDIC","name":"Médicaments","color":"#0D47A1","order":1}'),
('fam-labo', '{"id":"fam-labo","code":"LABO","name":"Laboratoire","color":"#10B981","order":2}'),
('fam-echo', '{"id":"fam-echo","code":"ECHO","name":"Échographie","color":"#F59E0B","order":3}'),
('fam-hosp', '{"id":"fam-hosp","code":"HOSP","name":"Hospitalisation","color":"#F97316","order":4,"manageStock":false}'),
('fam-dent', '{"id":"fam-dent","code":"DENT","name":"Dentaire","color":"#8B5CF6","order":5}');

-- --------------------------------------------------------------------------
-- Services destinataires du dépôt
-- --------------------------------------------------------------------------

INSERT IGNORE INTO `services_depot` (`id`, `donnees`) VALUES
('svc-pharmacie', '{"id":"svc-pharmacie","code":"PHA","name":"Pharmacie","kind":"pharmacie","color":"purple","active":true,"createdAt":"2026-01-05T08:00:00.000Z"}'),
('svc-bloc', '{"id":"svc-bloc","code":"BLOC","name":"Bloc opératoire","kind":"service","color":"blue","active":true,"createdAt":"2026-01-05T08:00:00.000Z"}'),
('svc-soins', '{"id":"svc-soins","code":"SOINS","name":"Soins / Hospitalisation","kind":"service","color":"rose","active":true,"createdAt":"2026-01-05T08:00:00.000Z"}'),
('svc-labo', '{"id":"svc-labo","code":"LABO","name":"Laboratoire","kind":"service","color":"emerald","active":true,"createdAt":"2026-01-05T08:00:00.000Z"}'),
('svc-urgence', '{"id":"svc-urgence","code":"URG","name":"Urgences","kind":"service","color":"amber","active":true,"createdAt":"2026-01-05T08:00:00.000Z"}');

-- --------------------------------------------------------------------------
-- Paramètres d'impression par défaut (modifiables dans l'application)
-- --------------------------------------------------------------------------

INSERT IGNORE INTO `parametres` (`cle`, `valeur`) VALUES
('ticketSettings', '{"facilityName":"SALFA — Centre de Santé","address":"Antananarivo, Madagascar","phone":"","nif":"","logoUrl":"","secondLogoUrl":"","receiptTitle":"REÇU DE PAIEMENT","footerMessage":"Merci de votre visite. Prompt rétablissement !","paperWidth":80,"autoPrint":true,"showLogo":true,"showBarcode":true,"showSignature":true,"copies":1,"currency":"Ar","paymentMethods":["Espèces","Carte bancaire","Mobile Money","Virement","Chèque"],"invoicePrefix":"FAC"}');
