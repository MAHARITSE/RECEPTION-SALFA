# Suivi assurance — base commune Réception SALFA

## Fonctionnement actuel

Le module utilise **la base et le mécanisme de sauvegarde de l'application** : IndexedDB dans le navigateur, ou l'API `api/index.php` de Réception sur WAMP. Il n'utilise ni serveur autonome ni base `suivi_assurance_salfa` séparée.

| Vue assurance | Source commune |
|---|---|
| Sociétés | `companies` ; identifiant et nom de Réception, taux de couverture partagé |
| Assurés | `patients` ; même dossier, matricule, société, sous-société, contact et lien familial |
| Actes | `familles` ; codes et libellés du catalogue commun |
| Prestations de Caisse | `invoices`, avec référence/numéro historique dans `ventes` |
| Règlements historiques | `companyBillingAccounts.payments` et situation documentée des factures |
| Paramètres d'entête | `ticketSettings.assuranceHeader` |

`sharedData.ts` fournit ces vues sans copier les factures de Caisse. Une nouvelle facture société apparaît automatiquement dans le suivi. Les factures sans société reconnue et celles liées à une vente annulée restent dans les archives, hors calcul du suivi ; elles restent conservées dans la base commune.

Les modifications de sociétés et de couvertures d'assurés sont répercutées dans `companies` et `patients`. Les données médicales ne sont pas réécrites. Les pièces historiques conservent autant que possible le payeur enregistré dans la vente, plutôt que la nouvelle affiliation du patient.

## Deux grandes familles de sociétés

Chaque société appartient à l'une de ces familles, choisie dans la fiche **Sociétés** :

| Famille | Comportement |
|---|---|
| **Payeur global** | Règle la totalité de la facture en une seule fois, sans distinction de personne ni d'acte (taux proposé à 100 %). |
| **Paiement partiel (assurance)** | Règle partiellement, assuré par assuré et/ou acte par acte, selon le taux contractuel de la société. |

Le choix est enregistré dans la base commune : `payeur` (Payeur global) ou `assurance` (Paiement partiel) sur `companies`, complété par `modePaiement` dans `assuranceSocietes`. Le taux de couverture reste modifiable à la main dans les deux cas.

## Exclusions d'une société

Une société peut **exclure** ce qu'elle ne prend pas en charge. Le bloc *Exclusions* de la fiche société (et le bouton **Exclusions** de chaque carte) permet d'ajouter :

- **une personne cliente** : un assuré exclu n'est plus remboursé du tout, quel que soit l'acte ;
- **une famille d'articles** : tous les actes de cette famille sont bloqués (ex. **ÉCHOGRAPHIE**, **LABORATOIRE**). La recherche accepte un code du catalogue, un libellé ou un mot-clé libre saisi directement.

Une exclusion bloque la prise en charge par la société : le montant reste dû par le patient. S'il faut malgré tout prescrire l'acte, le patient doit être facturé en **client comptoir**.

Les règles sont appliquées **à la saisie** :

- à la création/modification d'une prestation, le ticket modérateur est recalculé acte par acte (0 % de remboursement sur un acte exclu) et l'acte est signalé *Exclu* ;
- à la préparation d'un règlement, une ligne exclue n'est pas sélectionnée et son commentaire rappelle le motif ;
- les prestations déjà enregistrées ne sont jamais recalculées rétroactivement.

Les exclusions sont conservées dans `assuranceSocietes[].exclusions`, donc dans la même sauvegarde que le reste de la base.

## Liste noire des sociétés

Comme pour les patients de Réception, une société peut être **mise en liste noire** : aucune consultation ni prise en charge ne doit alors être ouverte à ses frais (impayé, suspension temporaire de la convention, contentieux…). Si un acte est malgré tout nécessaire, le patient est facturé en **client comptoir**.

| Champ | Rôle |
|---|---|
| `blacklisted` | Société bloquée |
| `blacklistReason` | Motif saisi (impayé, suspension temporaire, contentieux…) |
| `blacklistDate` | Date du blocage |
| `blacklistUntil` | Fin de la suspension, facultative : passée cette date, la société redevient active d'elle-même |

**Où la gérer**

- **Administration → Sociétés & Conventions** : bouton **Liste noire** (liste complète, motifs, rétablissement), bouton 🚫 / 🛡️ sur chaque ligne, filtre **Bloquées**.
- **Suivi assurance → Sociétés** : bloc *Liste noire / suspension* dans la fiche société, badge 🚫 sur la carte et filtre dédié.

**Effets**

- Une société bloquée est retirée des listes de sélection (Réception, Caisse, Médecin, Laboratoire). Une fiche déjà enregistrée sur cette société n'est jamais modifiée en silence : la société reste affichée, marquée *bloquée*.
- Chaque mise en liste noire et chaque rétablissement sont tracés dans le journal d'audit (`SOCIETE_LISTE_NOIRE`, `SOCIETE_RETABLE`).

## Saisie assistée et sociétés bloquées dans les formulaires

- **Sociétés bloquées** : elles ne sont jamais retirées des listes de saisie (Réception, Caisse, Médecin, Laboratoire, paramètres). Elles restent affichées, en **rouge** et précédées de 🚫, avec le motif en dessous du champ : l'opérateur voit immédiatement le problème et facture en client comptoir.
- **Combobox saisissables** : tous les champs « Société » et « Sous-société » acceptent la frappe (filtrage au clavier, choix à la souris, saisie libre conservée). Seuls les **types client** (Comptoir / Société / Externe) restent des listes fermées.
- **Sous-sociétés assistées** : les suggestions proposées sont celles déjà enregistrées pour la société choisie (patients, ventes et prestations), et non la liste complète.
- **Nouveau patient** : Adresse, Nom, Prénom et N° de dossier restent des champs de **saisie libre avec suggestions** (historique de la base proposé pendant la frappe, jamais imposé).

## Facturation : vue « Par N° de facture »

En plus de la vue mensuelle et de la vue détaillée, la Facturation propose un onglet **Par N° de facture** : une ligne par numéro de facture, avec la période, le nombre d'actes, le total brut, le ticket modérateur, la part à réclamer, l'encaissé, le reste à réclamer, le taux de recouvrement, le statut et l'impression — les mêmes repères que la vue **Prestations**. Le détail des actes se déplie sous chaque facture.

Les numéros qui ne suivent pas la numérotation officielle en vigueur (`26FA0427102` pour le comptoir et les externes, `FA-07/CODE/26-014` pour les sociétés) sont signalés « ancien format » dans cette vue.

## Compléments assurance, dans la même base

Les collections `assuranceSocietes`, `assurancePersonnes` et `assuranceFamilles` conservent les attributs propres au suivi (coordonnées du garant, taux par assuré, alias des actes, etc.). Les identités de Réception sont prioritaires : il ne s'agit plus de référentiels indépendants.

`assurancePrestations` conserve uniquement les prestations externes saisies/importées ; aucune facture de Caisse n'y est dupliquée. `assurancePaiements` conserve les nouveaux bordereaux assurance et leurs lignes. Ces collections sont incluses dans la même base, synchronisation inter-onglets et sauvegarde globale que les patients, factures et stocks.

Une prestation saisie/importée dans le suivi **ne crée pas artificiellement une consultation, une sortie de stock ni un encaissement Caisse**. Une facture déjà présente dans la Caisse ne doit pas être réimportée : l'import de son même numéro pour le même garant est refusé.

## Utilisation et protections

- Accès par **Personnel → Responsable assurance**, ou **Administration → Suivi assurance**. Le rôle technique `billing` et les comptes existants sont conservés.
- Les dossiers patients se créent dans **Réception**. **Nouvel Adhérent / Assuré** sélectionne un dossier existant et renseigne sa couverture : aucun deuxième patient n'est créé.
- Le nom et la date de naissance du dossier se corrigent dans Réception. La suppression d'un dossier partagé n'est pas autorisée depuis le suivi assurance.
- Les factures issues de Caisse sont repérées **Caisse · base commune**. Leurs montants, actes et bénéficiaires ne sont pas modifiables depuis le suivi ; les règlements peuvent être rattachés à leurs lignes.
- Les nouveaux règlements et rejets mettent à jour `invoices[].assuranceSuivi` (`montantRegle`, `montantRejete`, date du dernier règlement), sans toucher au ticket, à `creditSociete`, au statut d'encaissement, au stock ou à une clôture.
- Une facture `paid` avec `creditSociete: true` correspond à une validation de crédit en Caisse, **pas** à un règlement reçu de l'assureur.
- Les imports multi-tables sont validés avant écriture. Un assuré inconnu de Réception doit d'abord avoir un dossier ou être rapproché d'une identité existante ; un import rejeté ne doit pas laisser des sociétés créées partiellement.
- Les pièces et règlements historiques sont protégés en lecture seule. Un règlement historique global couvrant plusieurs factures reste **non ventilé** : son montant n'est pas multiplié par le nombre de factures et aucune répartition par facture n'est inventée. Les soldes détaillés peuvent donc différer du total des encaissements globaux jusqu'à une reprise comptable validée.

## Reprise du premier module

`linkReferences.ts` effectue un raccordement idempotent : société par identifiant ou nom normalisé, assuré par identifiant ou matricule **unique au sein du même garant**. Les références des prestations et paiements sont remappées sans effacer les données médicales ou financières.

Les anciens assurés sans correspondance certaine restent identifiés comme **non reliés à Réception** ; ils ne sont jamais fusionnés sur le seul nom. Les données sont conservées pour un rapprochement ultérieur. Une société commune supprimée ne doit pas être recréée depuis ses anciennes métadonnées assurance.

L'ancienne préférence locale d'entête, si elle existe, est reprise une fois dans `ticketSettings.assuranceHeader`. Les simples sélections de lignes et filtres/masquages d'affichage peuvent encore être locaux au navigateur ; ils ne constituent pas des écritures comptables.

## Sauvegarde

La sauvegarde globale reste disponible dans **Administration → Sauvegarde & Restauration**, ou avec le raccourci **Exporter Base (JSON)**. Elle exporte l'état complet de Réception, y compris le suivi assurance, sans session utilisateur. L'export SQL autonome créant `suivi_assurance_salfa` a été retiré.

Les en-têtes de présentation (titre du rôle, ligne de connexion, entête SALFA), le bandeau explicatif de base commune et le panneau d'archives avec ses boutons ont été retirés de l'écran assurance. Celui-ci commence directement par le filtre des garants et les onglets métier. Ce retrait est uniquement visuel : les factures, règlements, données communes et protections sont conservés. L'avertissement conditionnel de lecture seule WAMP reste présent lorsqu'il est nécessaire.

## WAMP / MySQL

Le frontend utilise **la même API et la même base MySQL de Réception** ; aucune deuxième connexion ou base n'est prévue. Cependant, le code PHP et le schéma MySQL déployés ne sont pas présents dans ce dépôt : leur mise à jour et leur validation doivent se faire sur le serveur réel.

L'API doit conserver :

1. Les cinq collections `assuranceSocietes`, `assurancePersonnes`, `assuranceFamilles`, `assurancePrestations`, `assurancePaiements`, avec leurs identifiants et objets/lignes imbriqués, dans **la base Réception existante**.
2. Les champs complémentaires `assuranceSuivi.montantRegle`, `assuranceSuivi.legacyMontantRejete`, les autres attributs de suivi des factures, et `ticketSettings.assuranceHeader`.
3. Les suppressions explicites du payload `deletions`, sans supprimer les pièces de Caisse.

Le client attend les cinq tableaux (même vides) dans `datasets` de `read_all` comme indication de compatibilité. Tant qu'ils sont absents, les données communes sont consultables, mais **les écritures du suivi sont bloquées** pour éviter une perte silencieuse. Les anciens payloads de Caisse continuent de fonctionner sans envoyer les clés assurance non prises en charge.

La présence des tableaux ne prouve pas leur persistance : vérifier création, modification, suppression, rechargement et deux postes simultanés sur le serveur avant mise en production. La compilation WAMP seule ne valide pas le backend.

## Facturation Comptoir, Externes et factures mensuelles

Dans **Suivi assurance → Facturation** :

- Les pièces **Sociétés**, **Comptoir** et **Externes** sont consultées dans la même vue, sans onglets ni compteurs par catégorie. Les ventes autonomes sont également incluses ; les miroirs d’anciennes factures et les ventes annulées ne sont pas comptés deux fois.
- **Vue par Facture** présente les regroupements mensuels : une facture globale Comptoir/mois, une globale Externes/mois, une par société/mois (toutes ses sous-entités). Son compteur indique le nombre de regroupements, pas le nombre de dossiers.
- **Vue Détaillée (Dossiers)** présente les pièces d’origine et leur impression individuelle. La gestion des prestations sociétés est conservée ; les pièces Comptoir/Externes sont consultées sans les transformer en comptes assurance.
- Le filtre **Société / Garant** du haut pilote les deux vues et leurs compteurs : un garant sélectionné affiche uniquement ses propres pièces et factures mensuelles, y compris parmi les instantanés déjà émis. **Tous les Garants** / **Réinitialiser** rétablit la vue globale, incluant les Comptoir/Externes, sans effacer de données ni modifier les numéros émis. Le champ **Mois** reste un filtre complémentaire (vide : tous les mois) et n’est pas effacé par la réinitialisation du garant. Le filtre sous-entité s’applique aux dossiers sociétés, pas au regroupement mensuel global de la société.

### Première impression et réimpressions

Le bouton **Imprimer** enregistre un instantané dans `AppState.monthlyInvoices`, puis lance l’impression A4 par la file d’impression commune. Exemple : **FM-2026-09-0001**. Le compteur est commun aux catégories pour le même mois ; chaque nouveau mois recommence à 0001. Les dates de facturation sont interprétées à Madagascar (`Indian/Antananarivo`).

La première émission fige les pièces, bénéficiaires, références, actes, montants, règlements affectés et destinataire. **Réimprimer** reprend ces mêmes données financières et ce même numéro. Les coordonnées historiques restent conservées dans l’archive ; l’en-tête imprimé est désormais un réglage de présentation commun, lu dans Administration au moment de l’impression, conformément à la demande de personnalisation. Annuler la boîte d’impression n’annule pas l’émission. Les opérations ajoutées après émission ne sont pas incorporées aux réimpressions ; aucun mécanisme d’avenant/réémission n’est introduit ici.

Le document est un **récapitulatif des pièces existantes**, pas une nouvelle créance ou un nouvel encaissement. Les règlements historiques globaux non ventilés ne sont pas attribués arbitrairement aux pièces ; le document avertit que le solde doit être rapproché avant relance.

### Modèles d’impression (captures de référence)

Les corps de facture reproduisent les présentations fournies. À la demande suivante de l’utilisateur, l’en-tête d’**Administration → En-tête Facture** est désormais ajouté aux factures individuelles et sociétés, y compris aux réimpressions. Sans personnalisation active, Facturation affiche les coordonnées communes de l’établissement.

Dans cette zone d’Administration : choix de police (Arial, Helvetica, Times New Roman, Georgia, Verdana, Tahoma, Courier New), taille de **6 à 36 points**, boutons **A− / A+**, aperçu et enregistrement commun. Ces réglages concernent toute la zone de texte de l’en-tête, sans modifier la police des tableaux ni les montants. Le gras, l’italique, les alignements et les images sont conservés. Le HTML est nettoyé avant sauvegarde, aperçu et impression (DOMPurify et styles autorisés).

Les paramètres `ticketSettings.invoiceHeaderFontFamily` et `invoiceHeaderFontSize` accompagnent `customInvoiceHeader` et `invoiceHeaderHtml` dans la base et la sauvegarde existantes. Les factures SALFA de Caisse utilisent aussi cette typographie pour leur en-tête personnalisé. **Les tickets POS 58/80 mm restent indépendants**, ainsi que l’en-tête des autres rapports assurance. Les en-têtes reflètent les réglages courants d’Administration ; leur modification ne réécrit pas les factures mensuelles figées.

- **Individuelle, depuis Vue Détaillée (Dossiers)** : titre FACTURE et numéro de la pièce, date de consultation (date de la pièce à défaut), nom, prise en charge, tableau N° / Libellé Article / Qté / Prix / Montant, Total Brut, Remise/Participation, Net à payer, montant en lettres et date d’impression. Les factures natives utilisent le `patientCharge` enregistré ; les ventes autonomes leur sous-total et montant final ; les prestations manuelles sans net individuel leur net documenté. Aucun taux de couverture actuel n’est appliqué rétroactivement. Quantité/prix inconnus restent « — » au lieu d’être inventés.
- **Société mensuelle, depuis Vue par Facture** : Doit / destinataire, mois de prise en charge, numéro mensuel inchangé, tableau N° / Date / Mlle / Nom et Prénom / Acte médicale/Prix / Montant / Participat° / Net à Payer. Le matricule est utilisé s’il est disponible, sinon le dossier. La sous-entité figure sous le nom. Dans « Acte médicale/Prix », une seule ligne par famille totalise les montants des actes de chaque pièce/bénéficiaire. La famille du catalogue (article lié par identifiant ou code unique) est prioritaire sur la catégorie générale de Caisse ; les prestations manuelles utilisent leur famille et ses alias déclarés. Les codes équivalents (PHAR/MEDIC, LAB/LABO) sont réunis. Les actes sans famille enregistrée sont regroupés sous « Famille non renseignée », sans inventer de classement à partir de leur libellé. La facture individuelle conserve tous les articles.
- Les trois colonnes financières mensuelles restent le montant brut, la participation et le net facturé au destinataire, **avant règlements**, et non le solde restant dû. Une note le rappelle pour éviter un double encaissement. L’impression ne modifie aucun montant source ni règlement.
- **Facture société : A4 portrait (210 × 297 mm). Facture individuelle : A5 portrait (148 × 210 mm).** Les dimensions des PDF générés sont vérifiées automatiquement. Lignes de tableau non coupées autant que possible, titres de colonnes répétés et numérotation Page x/y via les marges paginées des navigateurs Chromium récents. La pagination a aussi été contrôlée sur un PDF de 75 bénéficiaires (3 pages). Désactiver les en-têtes/pieds de page automatiques du navigateur pour éviter l’ajout de son URL/date.

Les nouveaux champs d’affichage sont optionnels dans les instantanés. Une réimpression ordinaire ne modifie pas l’instantané ni son numéro. La seule exception de maintenance est la réorganisation automatique des familles absentes décrite ci-dessous ; elle ne modifie jamais les données financières.

### Réorganisation automatique des familles dans la base commune

Les boutons de vérification et de réparation ont été supprimés à la demande de l’utilisateur. La réorganisation est **automatique en mode IndexedDB** : au chargement, lors des sauvegardes/restaurations et avant l’impression mensuelle. Il s’agit d’une écriture dans la base commune, pas d’une correction temporaire du rendu imprimé.

- Les références de famille certaines des articles sont normalisées (code, alias ou identifiant de famille reconnu). Une famille manquante ou ambiguë n’est jamais inventée et aucune ligne n’est supprimée.
- Les anciennes factures sans `actCode` récupèrent les familles par rapprochement avec leurs lignes d’origine (description, montant et quantité/prix présents) ou par nom d’article exact et unique. Les familles déjà enregistrées ne sont pas reclassées.
- Seules les références de famille et les métadonnées manquantes changent : numéros, bénéficiaires, lignes, dates, montants, règlements, stocks et historique sont conservés. La trace `familyMetadataRepairs` identifie les corrections automatiques par `migration:families-v1`.
- La lecture/migration/écriture est atomique. Deux onglets ne dupliquent pas la correction ; une sauvegarde périmée ne la supprime pas. Une réorganisation déjà terminée ne réécrit plus les factures ni leur trace.
- Si l’écriture échoue, le chargement conserve la base originale au lieu de la traiter comme vide et d’y réinjecter des données de démonstration. La synchronisation suivante peut réessayer. Le repli localStorage ne simule pas une migration financière validée.
- Les anomalies qui restent non résolues sont signalées sans bouton de contrôle. La famille reste obligatoire en création/modification d’article et pour toute nouvelle émission mensuelle.

La résolution reconnaît les identifiants d’articles stockés dans `InvoiceItem.code` (ancien format), les codes commerciaux et, à défaut, un nom exact et unique. Les homonymes ne sont pas départagés arbitrairement ; la catégorie générale ne masque pas une famille invalide sur un article identifié.

**WAMP/MySQL :** cette migration n’est pas exécutée via le `sync_all` générique. Le serveur PHP et le schéma n’étant pas fournis dans ce dépôt, la réorganisation transactionnelle de la vraie base MySQL doit être déployée côté serveur. La compilation ne constitue pas une exécution sur la base de l’utilisateur. En mode navigateur, la migration s’applique automatiquement au prochain chargement de la version mise à jour, sans action métier supplémentaire.

### Persistance et concurrence

En mode navigateur, attribution du numéro et sauvegarde du contenu se font dans **une transaction IndexedDB**. Une double demande ou deux onglets sur cette même base obtiennent le même instantané ; deux catégories obtiennent des numéros distincts. La transaction travaille sur les pièces durables et refuse une vue encore en cours d’enregistrement/synchronisation. Après quelques secondes, l’utilisateur peut réessayer.

Une erreur d’écriture empêche l’impression et ne consomme aucun numéro. Il n’existe pas de repli non atomique vers localStorage pour l’émission. Les sauvegardes ordinaires, restaurations et fusions conservent les instantanés déjà enregistrés (archive additive, version durable prioritaire). L’export global JSON les inclut. **Sauvegardez cette base** : effacer les données du navigateur efface aussi cet historique ; deux navigateurs/bases indépendants ne partagent pas leur séquence.

**Limite WAMP/MySQL :** l’impression individuelle reste disponible. Les instantanés renvoyés dans `read_all.datasets.monthlyInvoices` peuvent être réimprimés, mais la création de factures mensuelles est volontairement désactivée dans la compilation WAMP. Le PHP n’étant pas dans ce dépôt, une opération serveur atomique reste à développer et valider dans la base Réception : authentification, unicité de `(mois, catégorie, société)`, compteur verrouillé par mois, gel des pièces et réponse après commit. Il faudra ensuite relier le bouton à cette opération. Un simple `sync_all` de l’état complet ne garantit pas ces propriétés et n’est pas utilisé pour émettre ni modifier ces factures.

## Origine et maintenance

Le module provient de `https://github.com/MAHARITSE/suivi_assurance`, révision `dfcf39cfe6dbaea50bba012b84f2ae3384de9f19`, adaptée dans `src/modules/assurance/`.

Les anciens écrans `ModuleFacturationAccueil`, `ModuleFacturationSocietes` et `SuiviAssurance` sont supprimés ; la Caisse, les tickets et l'historique sont conservés. Les imports Excel/CSV et exports PDF/Excel sont exécutés dans le navigateur, sans Gemini ou serveur supplémentaire. Les rapports utilisent la file d'impression de Réception.

Dépendances : Recharts, jsPDF, jsPDF AutoTable, et `xlsx` via l'alias épinglé `@e965/xlsx@0.20.3` (miroir SheetJS, remplaçant la version npm 0.18.5 vulnérable du dépôt source).

## Vérifications

```bash
npm run lint
npm run test:assurance
npm run test:printing
npm run test:monthly-billing
npm run build
VITE_WAMP_MODE=1 npm run build:wamp
```

Les tests couvrent les référentiels partagés, les factures sans copie, l'affiliation d'un dossier existant, les soldes et rejets, leur suppression, les protections historiques, la reprise idempotente, la fusion de règlements de plusieurs postes, la sauvegarde complète et les impressions Caisse.

La suite historique `test:theme` conserve un décalage préexistant : elle attend le sombre par défaut alors que la révision de départ définit le clair. Le défaut n'est pas modifié ici. L'audit des dépendances conserve également les alertes préexistantes Vite/esbuild pour Windows.
