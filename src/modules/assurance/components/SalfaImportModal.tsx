import React, { useState, useRef } from 'react';
import { 
  X, 
  Upload, 
  FileText, 
  RefreshCw, 
  CheckCircle, 
  AlertCircle, 
  Download, 
  Info, 
  ArrowLeft, 
  FileSpreadsheet,
  ScanLine,
  Check,
  RotateCcw,
  Building,
  Building2,
  ShieldAlert,
  Ban,
  Layers,
  FastForward,
  CheckCircle2,
  Clock,
  Files
} from 'lucide-react';
import { Prestation, LignePrestation, Societe, Personne, Famille, ParsedFactureAssurance } from '../types';
import { formatMoney, generateId, normalizeDateISO } from '../utils/formatters';
import { downloadPrestationsExcelTemplate } from '../utils/excelTemplates';
import { findBestMatchingSociete } from '../utils/societyMatcher';
import * as XLSX from 'xlsx';
import { Select } from '../../../components/Select';

interface SalfaImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  societes: Societe[];
  personnes: Personne[];
  familles: Famille[];
  prestations?: Prestation[];
  defaultSocieteId?: string;
  onImportPrestations: (newPrestations: Prestation[], newSocietes?: Societe[], newPersonnes?: Personne[]) => void;
}

export function parseActesFromText(text: string, defaultTotal: number = 0): Array<{ code: string; libelle: string; montant: number }> {
  if (!text || !text.trim()) {
    return [{ code: 'CONS', libelle: 'Consultation', montant: defaultTotal || 0 }];
  }

  const lines = text.split(/[\n\r;|\/]+/).map(s => s.trim()).filter(Boolean);
  const results: Array<{ code: string; libelle: string; montant: number }> = [];

  for (const line of lines) {
    const match = line.match(/^([A-Za-zÀ-ÿ0-9_\s\-\.\'\(\)]+?)\s*(?:[:=–\-]\s*|\s{2,}|\s+)(\d[\d\s\.,]*)(?:\s*Ar|\s*FMG)?$/i);
    if (match) {
      const codeOrLibelle = match[1].trim();
      const numStr = match[2].replace(/\s+/g, '').replace(',', '.');
      const montant = parseFloat(numStr) || 0;
      const codeUpper = codeOrLibelle.toUpperCase().replace(/[^A-Z0-9]/g, '');
      results.push({
        code: codeUpper.length > 0 && codeUpper.length <= 8 ? codeUpper : codeOrLibelle.substring(0, 6).toUpperCase(),
        libelle: codeOrLibelle,
        montant: montant
      });
    } else {
      const cleanCode = line.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (cleanCode.length > 0) {
        results.push({
          code: cleanCode.substring(0, 6),
          libelle: line,
          montant: 0
        });
      }
    }
  }

  if (results.length === 0) {
    return [{ code: 'CONS', libelle: text, montant: defaultTotal || 0 }];
  }

  const zeroCount = results.filter(r => r.montant === 0).length;
  if (zeroCount > 0 && defaultTotal > 0) {
    const definedSum = results.reduce((s, r) => s + r.montant, 0);
    const remainder = Math.max(0, defaultTotal - definedSum);
    const perZero = Math.round(remainder / zeroCount);
    results.forEach(r => {
      if (r.montant === 0) r.montant = perZero;
    });
  }

  return results;
}

export const SalfaImportModal: React.FC<SalfaImportModalProps> = ({
  isOpen,
  onClose,
  societes,
  personnes,
  familles,
  prestations = [],
  defaultSocieteId,
  onImportPrestations,
}) => {
  const [targetSocietyName, setTargetSocietyName] = useState<string>('');
  const [parsedInvoice, setParsedInvoice] = useState<ParsedFactureAssurance | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastUploadedFile, setLastUploadedFile] = useState<File | null>(null);
  
  // Multi-file queue states for sequential processing
  const [fileQueue, setFileQueue] = useState<File[]>([]);
  const [currentFileIndex, setCurrentFileIndex] = useState<number>(0);
  const [batchHistory, setBatchHistory] = useState<Array<{ fileName: string; count: number; status: 'SUCCESS' | 'SKIPPED' }>>([]);
  const [batchNotice, setBatchNotice] = useState<string | null>(null);

  const [autoCreateMissingSocietes, setAutoCreateMissingSocietes] = useState(true);
  const [autoCreateMissingPersonnes, setAutoCreateMissingPersonnes] = useState(true);
  const [missingSocPrompt, setMissingSocPrompt] = useState<{ socName: string } | null>(null);
  const [selectedOverrideSocId, setSelectedOverrideSocId] = useState<string>('');
  const [selectedLines, setSelectedLines] = useState<Record<number, boolean>>({});
  const excelInputRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (isOpen) {
      if (defaultSocieteId) {
        const found = societes.find(s => s.id === defaultSocieteId);
        if (found) {
          setTargetSocietyName(found.nom);
          return;
        }
      }
      setTargetSocietyName(''); // Mode détection automatique par défaut
    }
  }, [isOpen, defaultSocieteId, societes]);

  const handleResetAndBack = () => {
    setParsedInvoice(null);
    setSelectedLines({});
    setErrorMessage(null);
    setIsProcessing(false);
    setLastUploadedFile(null);
    setFileQueue([]);
    setCurrentFileIndex(0);
    setBatchHistory([]);
    setBatchNotice(null);
    if (excelInputRef.current) {
      excelInputRef.current.value = '';
    }
  };

  const handleClose = () => {
    handleResetAndBack();
    onClose();
  };

  const processFile = async (file: File) => {
    setIsProcessing(true);
    setErrorMessage(null);
    setLastUploadedFile(file);

    try {
      if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls') && !file.name.endsWith('.csv')) {
        throw new Error('Seuls les fichiers Excel (.xlsx, .xls, .csv) sont pris en charge pour l\'importation des prestations.');
      }

      // Read Excel
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = new Uint8Array(event.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheetName = workbook.SheetNames[0];
          const firstSheet = workbook.Sheets[sheetName];
          const jsonRows: any[] = XLSX.utils.sheet_to_json(firstSheet, { defval: '' });

          if (jsonRows.length === 0) {
            throw new Error('Le fichier Excel est vide ou ne contient aucune ligne.');
          }

          // Détection automatique intelligente de la société / organisme
          let detectedSocName = targetSocietyName;
          if (!detectedSocName) {
            // 1. Détection depuis le nom de fichier (ex: FACTURE_MCI.xlsx, BORDEREAU_ASCOMA.xlsx, NY_HAVANA.xlsx)
            const fromFilename = findBestMatchingSociete(file.name, societes);
            if (fromFilename) {
              detectedSocName = fromFilename.nom;
            }

            // 2. Détection depuis les noms des onglets du classeur Excel
            if (!detectedSocName) {
              for (const sName of workbook.SheetNames) {
                const fromSheet = findBestMatchingSociete(sName, societes);
                if (fromSheet) {
                  detectedSocName = fromSheet.nom;
                  break;
                }
              }
            }

            // 3. Détection depuis le texte brut d'en-tête de la première feuille
            if (!detectedSocName) {
              try {
                const rawSheetText = XLSX.utils.sheet_to_txt(firstSheet).substring(0, 2500);
                const fromRawText = findBestMatchingSociete(rawSheetText, societes);
                if (fromRawText) {
                  detectedSocName = fromRawText.nom;
                }
              } catch (e) {
                // Ignore text conversion error
              }
            }
          }

          let inferredFactureNum = '';
          let inferredClient = detectedSocName || '';

          const lignes = jsonRows.map((row, idx) => {
            const getVal = (keys: string[]) => {
              for (const k of keys) {
                const cleanK = k.toLowerCase().replace(/[\s_\-\.\/]/g, '');
                const foundKey = Object.keys(row).find(rk => {
                  const cleanRk = rk.toLowerCase().replace(/[\s_\-\.\/]/g, '');
                  return cleanRk === cleanK;
                });
                if (foundKey && row[foundKey] !== undefined && row[foundKey] !== '') {
                  return row[foundKey];
                }
              }
              return '';
            };

            const rawFacture = String(getVal(['Numero_Facture', 'NumeroFacture', 'N° Facture', 'Num Facture', 'Facture']) || '').trim();
            if (rawFacture && !inferredFactureNum) inferredFactureNum = rawFacture;

            const nomPatientSoin = String(getVal([
              'Patient', 'Nom_Patient', 'Nom Patient', 'Nom du Patient', 'Nom_du_Patient',
              'Beneficiaire', 'Bénéficiaire', 'Nom_Beneficiaire', 'Nom_Bénéficiaire', 'Nom Bénéficiaire', 'Nom Beneficiaire',
              'Ayant_Droit', 'Ayant Droit', 'AyantDroit', 'Nom_Ayant_Droit', 'Nom Ayant Droit', 'Nom_AyantDroit',
              'Personne_Soignee', 'Personne Soignée', 'Nom_Soigne', 'Nom Soigné', 'Soigné', 'Soigne',
              'Nom_Soin', 'Nom Soin', 'Nom_Soins', 'Nom Soins', 'Nom_Date_Soin', 'Nom Date Soin', 'Nom_Date_Soins', 'Nom Date des Soins',
              'Malade', 'Nom_Malade', 'Nom Malade'
            ]) || '').trim();

            const nomAdherent = String(getVal([
              'Adherent', 'Adhérent', 'Nom_Adherent', 'Nom_Adhérent', 'Nom Adhérent', 'Nom Adherent', 'Adherent_Nom',
              'Adhesion', 'Adhésion', 'Titulaire', 'Nom_Titulaire', 'Nom Titulaire'
            ]) || '').trim();

            const nomGeneral = String(getVal([
              'Nom_Agent', 'Nom Agent', 'Nom et Prénom', 'Nom et Prenom', 'Nom_Prenom', 'Nom', 'Assuré', 'Assure', 'Nom Assuré', 'Nom Assure', 'Nom_Assure'
            ]) || '').trim();

            let rawNom = nomPatientSoin || (nomAdherent && !nomGeneral ? nomAdherent : nomGeneral) || nomAdherent || `Patient ${idx + 1}`;
            let sousSoc = String(getVal(['Sous_Societe', 'Sous-Société', 'Sous Societe', 'Département', 'Section', 'Service']) || '').trim();

            // Extract any sub-society within parentheses from patient or agent name
            const parenMatch = rawNom.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
            if (parenMatch) {
              rawNom = parenMatch[1].trim();
              if (!sousSoc) {
                sousSoc = parenMatch[2].trim();
              }
            }

            const matricule = String(getVal(['Matricule', 'N° Matricule', 'Immatriculation', 'Code']) || '').trim();
            const rawDateSoins = String(getVal(['Date_Soins', 'Date', 'Date Soins', 'Date des Soins', 'Date Prestation']) || new Date().toISOString().split('T')[0]).trim();
            const dateSoins = normalizeDateISO(rawDateSoins);
            const montantBrut = Number(getVal(['Montant_Total_Brut', 'Montant Total Brut', 'Montant Brut', 'Montant Total', 'Total Prestation', 'Montant Facture', 'Fr. Réels'])) || 0;
            const participation = Number(getVal(['Ticket_Moderateur', 'Ticket Moderateur', 'Ticket Modérateur', 'Part Assuré', 'Participation', 'Franchise'])) || 0;
            const netAPayer = Number(getVal(['Prise_En_Charge_Net', 'Net A Payer', 'Net Payé', 'Montant Remboursé', 'Prise En Charge', 'Montant Réglé'])) || (montantBrut - participation);
            
            // 4. Détection depuis les colonnes du tableau
            const rawSoc = String(getVal(['Societe', 'Société', 'Organisme', 'Client', 'Assureur', 'Assurance', 'Affiliation']) || '').trim();
            let socName = detectedSocName || rawSoc;
            if (rawSoc && !detectedSocName) {
              const matched = findBestMatchingSociete(rawSoc, societes);
              if (matched) {
                socName = matched.nom;
                if (!inferredClient) inferredClient = matched.nom;
              } else {
                socName = rawSoc;
                if (!inferredClient) inferredClient = rawSoc;
              }
            } else if (!socName && detectedSocName) {
              socName = detectedSocName;
            }

            const actesRaw = String(getVal(['Acte_Medicale_Prix', 'Acte médicale/Prix', 'Acte médicale / Prix', 'Acte medicale/Prix', 'Actes Médicaux', 'Actes', 'Prestations', 'Detail Actes Medicaux']) || 'CONS : ' + montantBrut);
            let observations = String(getVal(['Observations', 'Remarques', 'Commentaires', 'Motif']) || 'Import Excel').trim();
            if (nomAdherent && nomAdherent.toLowerCase() !== rawNom.toLowerCase() && !observations.toLowerCase().includes(nomAdherent.toLowerCase())) {
              observations = observations && observations !== 'Import Excel' ? `${observations} (Adhérent: ${nomAdherent})` : `Adhérent: ${nomAdherent}`;
            }

            const parsedActes = parseActesFromText(actesRaw, montantBrut);

            return {
              numeroLigne: idx + 1,
              dateSoins,
              matricule,
              nomPrenom: rawNom,
              societeAffiliee: socName,
              sousSociete: sousSoc,
              actes: parsedActes,
              actesTexte: actesRaw,
              montantBrut,
              montantExclu: 0,
              baseReglement: montantBrut,
              participation,
              netAPayer,
              observations
            };
          });

          // 5. Détection depuis le numéro de facture si toujours indéterminé
          if (!inferredClient && inferredFactureNum) {
            const fromFactureNum = findBestMatchingSociete(inferredFactureNum, societes);
            if (fromFactureNum) {
              inferredClient = fromFactureNum.nom;
            }
          }

          // Fallback sur la première société ou MCI CARE si rien n'a pu être détecté
          if (!inferredClient) {
            inferredClient = societes[0]?.nom || 'MCI CARE';
          }

          // Mise à jour de toutes les lignes avec la société déduite si elles étaient vides
          lignes.forEach(l => {
            if (!l.societeAffiliee) {
              l.societeAffiliee = inferredClient;
            }
          });

          const totalBrut = lignes.reduce((s, l) => s + l.montantBrut, 0);
          const totalPart = lignes.reduce((s, l) => s + l.participation, 0);
          const totalNet = lignes.reduce((s, l) => s + l.netAPayer, 0);

          const doc: ParsedFactureAssurance = {
            documentType: 'facture',
            etablissement: 'CENTRE MÉDICAL / HÔPITAL SALFA',
            numeroFacture: inferredFactureNum || `FACT-SALFA-${Date.now().toString().substring(6)}`,
            moisPriseEnCharge: new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }),
            clientDoit: inferredClient,
            dateEmission: new Date().toISOString().split('T')[0],
            totalMontantBrut: totalBrut,
            totalParticipation: totalPart,
            totalNetAPayer: totalNet,
            lignes
          };

          setParsedInvoice(doc);
          const initialSelected: Record<number, boolean> = {};
          doc.lignes.forEach((_, i) => { initialSelected[i] = true; });
          setSelectedLines(initialSelected);
          setIsProcessing(false);
        } catch (err: any) {
          setErrorMessage(err.message || 'Erreur lors de la lecture du fichier Excel.');
          setIsProcessing(false);
        }
      };
      reader.readAsArrayBuffer(file);
    } catch (err: any) {
      console.error('Erreur traitement fichier Excel:', err);
      setErrorMessage(err.message || 'Erreur lors de la lecture du fichier Excel.');
      setIsProcessing(false);
    }
  };

  const handleFilesSelected = (files: FileList | File[]) => {
    const validFiles = Array.from(files).filter(f => 
      f.name.endsWith('.xlsx') || f.name.endsWith('.xls') || f.name.endsWith('.csv')
    );

    if (validFiles.length === 0) {
      setErrorMessage('Aucun fichier Excel valide (.xlsx, .xls, .csv) sélectionné.');
      return;
    }

    setFileQueue(validFiles);
    setCurrentFileIndex(0);
    setBatchHistory([]);
    setBatchNotice(null);
    processFile(validFiles[0]);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const files = Array.from(e.target.files);
    e.target.value = '';
    handleFilesSelected(files);
  };

  const handleSkipCurrentFile = () => {
    const currentName = fileQueue[currentFileIndex]?.name || `Fichier ${currentFileIndex + 1}`;
    setBatchHistory(prev => [...prev, { fileName: currentName, count: 0, status: 'SKIPPED' }]);

    if (currentFileIndex + 1 < fileQueue.length) {
      const nextIdx = currentFileIndex + 1;
      setCurrentFileIndex(nextIdx);
      setParsedInvoice(null);
      setSelectedLines({});
      setBatchNotice(`Fichier "${currentName}" ignoré. Chargement du fichier ${nextIdx + 1}/${fileQueue.length}...`);
      setTimeout(() => setBatchNotice(null), 3500);
      processFile(fileQueue[nextIdx]);
    } else {
      handleClose();
    }
  };

  const handleRetryLastFile = () => {
    if (lastUploadedFile) {
      processFile(lastUploadedFile);
    } else {
      excelInputRef.current?.click();
    }
  };

  const handleToggleSelectAll = (checked: boolean) => {
    if (!parsedInvoice) return;
    const updated: Record<number, boolean> = {};
    parsedInvoice.lignes.forEach((_, i) => {
      updated[i] = checked;
    });
    setSelectedLines(updated);
  };

  const handleToggleSelectLine = (index: number) => {
    setSelectedLines(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  const executeImportWithSociety = (overrideExistingSocId?: string) => {
    if (!parsedInvoice) return;

    const chosenLignes = parsedInvoice.lignes.filter((_, idx) => selectedLines[idx]);
    if (chosenLignes.length === 0) {
      alert('Veuillez sélectionner au moins une ligne de soins à importer.');
      return;
    }

    const docSocName = (parsedInvoice.clientDoit || chosenLignes[0]?.societeAffiliee || targetSocietyName || 'MCI CARE').trim();

    let matchedSoc = overrideExistingSocId
      ? societes.find(s => s.id === overrideExistingSocId)
      : findBestMatchingSociete(docSocName, societes, targetSocietyName);

    const createdSocietes: Societe[] = [];
    const createdPersonnes: Personne[] = [];

    if (!matchedSoc) {
      setMissingSocPrompt({ socName: docSocName });
      return;
    }

    const isRealMatricule = (mat: string) => {
      const m = (mat || '').trim();
      return m !== '' && !m.toUpperCase().startsWith('MAT-');
    };

    const getBestMatricule = (mat1: string, mat2: string) => {
      if (isRealMatricule(mat1)) return mat1;
      if (isRealMatricule(mat2)) return mat2;
      return mat1 || mat2;
    };

    const fileBestMatricules: Record<string, string> = {};
    const fileBestSousSocietes: Record<string, string> = {};

    chosenLignes.forEach(l => {
      const nameKey = (l.nomPrenom || '').trim().toLowerCase();
      const mat = (l.matricule || '').replace(/\s+/g, '');
      const matKey = mat.toLowerCase();
      const ss = (l.sousSociete || '').trim();

      if (nameKey) {
        if (!fileBestMatricules[nameKey]) {
          fileBestMatricules[nameKey] = mat;
        } else {
          fileBestMatricules[nameKey] = getBestMatricule(fileBestMatricules[nameKey], mat);
        }
        if (ss) {
          fileBestSousSocietes[`name:${nameKey}`] = ss;
        }
      }
      if (matKey && ss) {
        fileBestSousSocietes[`mat:${matKey}`] = ss;
      }
    });

    const updateOrCreatePersonneRecord = (per: Personne) => {
      const existingIdx = createdPersonnes.findIndex(p => p.id === per.id);
      if (existingIdx >= 0) {
        createdPersonnes[existingIdx] = { ...per };
      } else {
        createdPersonnes.push({ ...per });
      }
    };

    const findExistingSousSocieteForPerson = (
      perObj?: Personne,
      nameKey?: string,
      matKey?: string
    ): string => {
      if (perObj?.sousSociete && perObj.sousSociete.trim()) {
        return perObj.sousSociete.trim();
      }

      const createdMatch = createdPersonnes.find(p => 
        (perObj && p.id === perObj.id) ||
        (nameKey && p.nomPrenom && p.nomPrenom.toLowerCase().trim() === nameKey) ||
        (matKey && p.matricule && p.matricule.replace(/\s+/g, '').toLowerCase() === matKey)
      );
      if (createdMatch?.sousSociete && createdMatch.sousSociete.trim()) {
        return createdMatch.sousSociete.trim();
      }

      if (nameKey && fileBestSousSocietes[`name:${nameKey}`]) {
        return fileBestSousSocietes[`name:${nameKey}`];
      }
      if (matKey && fileBestSousSocietes[`mat:${matKey}`]) {
        return fileBestSousSocietes[`mat:${matKey}`];
      }

      const dbPer = personnes.find(p => 
        (nameKey && p.nomPrenom && p.nomPrenom.toLowerCase().trim() === nameKey) ||
        (matKey && p.matricule && p.matricule.replace(/\s+/g, '').toLowerCase() === matKey)
      );
      if (dbPer?.sousSociete && dbPer.sousSociete.trim()) {
        return dbPer.sousSociete.trim();
      }

      const prevPrest = prestations.find(p => {
        if (!p.sousSociete || !p.sousSociete.trim()) return false;
        if (perObj && p.personneId === perObj.id) return true;
        if (nameKey && p.nomAgent && p.nomAgent.toLowerCase().trim() === nameKey) return true;
        if (matKey && p.matricule && p.matricule.replace(/\s+/g, '').toLowerCase() === matKey) return true;
        return false;
      });

      if (prevPrest?.sousSociete && prevPrest.sousSociete.trim()) {
        return prevPrest.sousSociete.trim();
      }

      return '';
    };

    const updatedOlderPrestationsMap: Record<string, Prestation> = {};

    const newPrestations: Prestation[] = chosenLignes.map((ligne, idx) => {
      const prestId = generateId(`prest-salfa-${idx}`);
      const mainSocName = docSocName;

      // Patient match / create
      const nameKey = (ligne.nomPrenom || '').trim().toLowerCase();
      const fileMat = fileBestMatricules[nameKey] || '';

      let matchedPer = personnes.find(p => 
        ligne.nomPrenom && (
          p.nomPrenom.toLowerCase() === ligne.nomPrenom.toLowerCase() ||
          p.nomPrenom.toLowerCase().includes(ligne.nomPrenom.toLowerCase()) ||
          ligne.nomPrenom.toLowerCase().includes(p.nomPrenom.toLowerCase())
        )
      );

      const rowMatricule = fileMat || (ligne.matricule || '').replace(/\s+/g, '');
      const matKey = rowMatricule.toLowerCase();

      if (!matchedPer && rowMatricule) {
        matchedPer = personnes.find(p => 
          p.matricule.replace(/\s+/g, '').toLowerCase() === rowMatricule.toLowerCase()
        );
      }

      let finalMatricule = rowMatricule;
      if (matchedPer) {
        finalMatricule = getBestMatricule(matchedPer.matricule, finalMatricule);
        
        if (isRealMatricule(finalMatricule) && finalMatricule.trim() !== (matchedPer.matricule || '').trim()) {
          matchedPer.matricule = finalMatricule;
          updateOrCreatePersonneRecord(matchedPer);
        }
      }

      // Sub-societé Auto-Attribution and Retroactive Update Logic
      const rawSousSoc = (ligne.sousSociete || '').trim();
      let finalSousSoc = rawSousSoc;

      if (!rawSousSoc) {
        // RULE 1: If person has no sub-company in import file, search DB / file for previously assigned sub-company
        const foundSousSoc = findExistingSousSocieteForPerson(matchedPer, nameKey, matKey);
        if (foundSousSoc) {
          finalSousSoc = foundSousSoc;
        }
      } else {
        // RULE 2: If person HAS sub-company in import file, update older prestations without sub-company
        const targetPerId = matchedPer?.id;
        const olderUnassigned = prestations.filter(oldP => {
          if (oldP.sousSociete && oldP.sousSociete.trim() !== '') return false;
          if (targetPerId && oldP.personneId === targetPerId) return true;
          if (nameKey && oldP.nomAgent && oldP.nomAgent.trim().toLowerCase() === nameKey) return true;
          if (matKey && oldP.matricule && oldP.matricule.replace(/\s+/g, '').toLowerCase() === matKey) return true;
          return false;
        });

        olderUnassigned.forEach(oldP => {
          updatedOlderPrestationsMap[oldP.id] = {
            ...oldP,
            sousSociete: finalSousSoc,
          };
        });
      }

      // Keep matched person's sub-company in sync
      if (matchedPer && finalSousSoc && (!matchedPer.sousSociete || matchedPer.sousSociete.trim() !== finalSousSoc)) {
        matchedPer.sousSociete = finalSousSoc;
        updateOrCreatePersonneRecord(matchedPer);
      }

      if (!matchedPer && autoCreateMissingPersonnes) {
        matchedPer = {
          id: generateId(`per-new-${idx}`),
          matricule: finalMatricule || `MAT-${100000 + idx}`,
          nomPrenom: ligne.nomPrenom,
          societeId: matchedSoc?.id || societes[0]?.id || 'soc-mcicare',
          sousSociete: finalSousSoc || undefined,
          qualite: (ligne.ayantDroit ? 'Ayant droit' : 'Adhérent Principal') as any,
        };
        updateOrCreatePersonneRecord(matchedPer);
      }

      // Build multiple sub-lines per act
      const subLines: LignePrestation[] = (ligne.actes && ligne.actes.length > 0)
        ? ligne.actes.map((a, actIdx) => {
            const actMontant = a.montant || Math.round(ligne.montantBrut / (ligne.actes?.length || 1));
            const partRatio = ligne.montantBrut > 0 ? actMontant / ligne.montantBrut : 1 / (ligne.actes?.length || 1);
            const actPart = Math.round((ligne.participation || 0) * partRatio);
            const actPaye = 0;

            const actARemb = Math.max(0, actMontant - actPart);
            return {
              id: generateId(`lig-${idx}-${actIdx}`),
              prestationId: prestId,
              code: a.code || 'CONS',
              libelle: a.libelle || a.code,
              totalPrestation: actMontant,
              ticketModerateur: actPart,
              montantARembourser: actARemb,
              totalPaye: actPaye,
              statut: 'En attente' as const,
            };
          })
        : [
            {
              id: generateId(`lig-${idx}`),
              prestationId: prestId,
              code: 'CONS',
              libelle: ligne.actesTexte || 'Consultation & Soins',
              totalPrestation: ligne.montantBrut,
              ticketModerateur: ligne.participation,
              montantARembourser: Math.max(0, ligne.montantBrut - ligne.participation),
              totalPaye: 0,
              statut: 'En attente' as const,
            }
          ];

      const montantARemb = Math.max(0, ligne.montantBrut - ligne.participation);

      return {
        id: prestId,
        numeroFacture: parsedInvoice.numeroFacture || `FA-SALFA-${idx + 1}`,
        date: ligne.dateSoins || parsedInvoice.dateEmission || new Date().toISOString().split('T')[0],
        societeId: matchedSoc?.id || societes[0]?.id || 'soc-1',
        societeNom: matchedSoc?.nom || mainSocName,
        sousSociete: finalSousSoc,
        personneId: matchedPer?.id || personnes[0]?.id || 'per-1',
        nomAgent: ligne.nomPrenom,
        matricule: finalMatricule || matchedPer?.matricule || '',
        totalPrestation: ligne.montantBrut,
        montantTotal: ligne.montantBrut,
        participation: ligne.participation,
        ticketModerateur: ligne.participation,
        montantARembourser: montantARemb,
        totalPaye: 0,
        resteAPayer: montantARemb,
        statut: 'En attente' as const,
        dateCreation: new Date().toISOString().split('T')[0],
        commentaires: `Facture Hôpital SALFA (${ligne.observations || parsedInvoice.numeroFacture})`,
        lignes: subLines,
      };
    });

    const retroUpdatedList = Object.values(updatedOlderPrestationsMap);
    const allPrestationsToPass = [...newPrestations, ...retroUpdatedList];

    onImportPrestations(allPrestationsToPass, createdSocietes, createdPersonnes);
    
    // Multi-file sequential processing handling:
    const currentFileName = fileQueue[currentFileIndex]?.name || parsedInvoice.numeroFacture || `Fichier ${currentFileIndex + 1}`;
    const updatedHistory = [...batchHistory, { fileName: currentFileName, count: newPrestations.length, status: 'SUCCESS' as const }];
    setBatchHistory(updatedHistory);

    if (fileQueue.length > 1 && currentFileIndex + 1 < fileQueue.length) {
      const nextIdx = currentFileIndex + 1;
      setCurrentFileIndex(nextIdx);
      setParsedInvoice(null);
      setSelectedLines({});
      setBatchNotice(`✅ "${currentFileName}" importé (${newPrestations.length} prestations) ! Chargement du fichier suivant ${nextIdx + 1}/${fileQueue.length}...`);
      setTimeout(() => setBatchNotice(null), 4000);
      processFile(fileQueue[nextIdx]);
    } else {
      handleResetAndBack();
      onClose();
    }
  };

  const handleValidateImport = () => {
    if (parsedInvoice && isDuplicateInvoice) {
      alert(`Attention : La facture N° "${parsedInvoice.numeroFacture}" existe déjà dans la base (${duplicatePrestationsCount} prescription(s) enregistrée(s)). Veuillez vérifier pour éviter les doublons.`);
      return;
    }
    executeImportWithSociety();
  };

  const cleanNum = (n?: string) => (n || '').replace(/[\s\-\_\.\/]/g, '').toUpperCase();
  const invoiceNumClean = parsedInvoice?.numeroFacture ? cleanNum(parsedInvoice.numeroFacture) : '';
  const duplicatePrestations = invoiceNumClean 
    ? prestations.filter(p => cleanNum(p.numeroFacture) === invoiceNumClean)
    : [];
  const isDuplicateInvoice = duplicatePrestations.length > 0;
  const duplicatePrestationsCount = duplicatePrestations.length;

  const selectedCount = parsedInvoice ? parsedInvoice.lignes.filter((_, i) => selectedLines[i]).length : 0;
  const totalDetectedCount = parsedInvoice ? parsedInvoice.lignes.length : 0;
  const totalSelectedBrut = parsedInvoice
    ? parsedInvoice.lignes.filter((_, i) => selectedLines[i]).reduce((s, l) => s + l.montantBrut, 0)
    : 0;
  const totalSelectedPart = parsedInvoice
    ? parsedInvoice.lignes.filter((_, i) => selectedLines[i]).reduce((s, l) => s + l.participation, 0)
    : 0;
  const totalSelectedNet = parsedInvoice
    ? parsedInvoice.lignes.filter((_, i) => selectedLines[i]).reduce((s, l) => s + l.netAPayer, 0)
    : 0;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-5xl rounded-2xl bg-surface shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-line px-6 py-4">
          <div className="flex items-center gap-3">
            {parsedInvoice && (
              <button
                onClick={handleResetAndBack}
                title="Retour au choix de document"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-line bg-surface text-ink hover:bg-surface-hover text-xs font-semibold shadow-xs transition cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Retour</span>
              </button>
            )}
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-ink-strong">
                {parsedInvoice ? `Aperçu Facture : ${parsedInvoice.numeroFacture || parsedInvoice.clientDoit}` : 'Importation Excel des Prestations de Soins'}
              </h3>
              <p className="text-xs text-ink-muted">
                {parsedInvoice ? `${totalDetectedCount} lignes de prestations extraites • Vérifiez et confirmez l'importation` : 'Importez vos données de prestations de soins directement depuis un fichier Excel.'}
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="rounded-lg p-1.5 text-ink-faint hover:bg-surface-hover hover:text-ink-secondary transition cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Multi-File Sequential Processing Header */}
        {fileQueue.length > 1 && (
          <div className="border-b border-indigo-100 bg-gradient-to-r from-indigo-50/90 via-sky-50/70 to-indigo-50/90 px-6 py-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white font-black text-xs shadow-xs">
                  <Files className="w-4 h-4" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase tracking-wider text-indigo-900">
                      File d'attente par lot : Fichier {currentFileIndex + 1} / {fileQueue.length}
                    </span>
                    <span className="text-[11px] font-bold text-indigo-700 bg-indigo-100/80 px-2 py-0.5 rounded-full">
                      Traitement séquentiel
                    </span>
                  </div>
                  <p className="text-[11px] text-ink-secondary font-medium truncate max-w-md">
                    Fichier en cours : <strong className="text-ink-strong font-bold">{fileQueue[currentFileIndex]?.name}</strong>
                  </p>
                </div>
              </div>

              {/* Progress Steps / Actions */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleSkipCurrentFile}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-surface border border-line-strong text-ink hover:bg-surface-muted text-[11px] font-semibold transition shadow-2xs cursor-pointer"
                  title="Ignorer ce fichier et passer au fichier suivant dans la file"
                >
                  <FastForward className="w-3.5 h-3.5 text-ink-muted" />
                  <span>Ignorer ce fichier</span>
                </button>
                <button
                  type="button"
                  onClick={handleResetAndBack}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 text-[11px] font-semibold transition cursor-pointer"
                  title="Arrêter l'importation de toute la liste de fichiers"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Arrêter la file</span>
                </button>
              </div>
            </div>

            {/* Queue Files Horizontal Stepper */}
            <div className="mt-2.5 flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px]">
              {fileQueue.map((file, idx) => {
                const isCurrent = idx === currentFileIndex;
                const isPassed = idx < currentFileIndex;
                const historyItem = batchHistory.find(h => h.fileName === file.name);
                const isSkipped = historyItem?.status === 'SKIPPED';

                return (
                  <div
                    key={`${file.name}-${idx}`}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium whitespace-nowrap shrink-0 border transition ${
                      isCurrent
                        ? 'bg-indigo-600 text-white font-bold border-indigo-700 shadow-xs'
                        : isPassed
                        ? isSkipped
                          ? 'bg-amber-50 text-amber-800 border-amber-200'
                          : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-surface/80 text-ink-muted border-line'
                    }`}
                  >
                    {isCurrent && <RefreshCw className="w-3 h-3 animate-spin shrink-0" />}
                    {isPassed && !isSkipped && <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />}
                    {isPassed && isSkipped && <FastForward className="w-3 h-3 text-amber-600 shrink-0" />}
                    {!isCurrent && !isPassed && <Clock className="w-3 h-3 text-ink-faint shrink-0" />}
                    <span className="truncate max-w-[140px]">{idx + 1}. {file.name}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Batch Success Notice */}
          {batchNotice && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-900 font-semibold shadow-2xs flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <span>{batchNotice}</span>
            </div>
          )}

          {/* Error Message with Immediate Retry Button */}
          {errorMessage && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 text-xs text-rose-900 shadow-2xs space-y-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 shrink-0 text-rose-600 mt-0.5" />
                <div>
                  <div className="font-bold text-rose-950 text-sm">Échec de l'importation</div>
                  <div className="font-medium text-rose-800 mt-0.5 leading-relaxed">{errorMessage}</div>
                  {lastUploadedFile && (
                    <div className="text-[11px] text-rose-700/80 font-mono mt-1">
                      Fichier sélectionné : {lastUploadedFile.name} ({(lastUploadedFile.size / 1024).toFixed(1)} Ko)
                    </div>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-rose-200">
                <button
                  type="button"
                  onClick={handleRetryLastFile}
                  disabled={isProcessing}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-700 text-white hover:bg-emerald-600 font-bold shadow-xs transition cursor-pointer"
                >
                  <RefreshCw className={`h-4 w-4 ${isProcessing ? 'animate-spin' : ''}`} />
                  <span>{isProcessing ? 'Lecture en cours...' : 'Réessayer la lecture Excel'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setErrorMessage(null);
                    excelInputRef.current?.click();
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-surface border border-rose-300 text-rose-800 hover:bg-rose-100 font-semibold transition cursor-pointer"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>Choisir un autre fichier</span>
                </button>
                {fileQueue.length > 1 && currentFileIndex + 1 < fileQueue.length && (
                  <button
                    type="button"
                    onClick={handleSkipCurrentFile}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-100 border border-amber-300 text-amber-900 hover:bg-amber-200 font-semibold transition cursor-pointer"
                  >
                    <FastForward className="h-3.5 w-3.5" />
                    <span>Passer au fichier suivant ({currentFileIndex + 2}/{fileQueue.length})</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setErrorMessage(null)}
                  className="ml-auto text-xs text-ink-muted hover:text-ink cursor-pointer"
                >
                  Ignorer
                </button>
              </div>
            </div>
          )}

          {!parsedInvoice && (
            <div className="space-y-4">
              {/* Mode: EXCEL */}
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-xl bg-emerald-50/80 border border-emerald-200 p-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700 mt-0.5">
                      <FileSpreadsheet className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-emerald-950">Modèle Excel pour Prestations de Soins</h4>
                      <p className="text-xs text-emerald-800 mt-0.5 max-w-lg">
                        Téléchargez le fichier modèle prêt à remplir contenant toutes les colonnes requises : 
                        <strong> Numero_Facture, Nom_Agent, Societe, Sous_Societe, Acte_Medicale_Prix, Montants</strong>...
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => downloadPrestationsExcelTemplate()}
                    className="flex items-center gap-1.5 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-600 shadow-xs shrink-0 cursor-pointer"
                  >
                    <Download className="h-4 w-4" />
                    <span>Télécharger le modèle Excel</span>
                  </button>
                </div>

                  <div
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const files = e.dataTransfer.files;
                      if (files && files.length > 0) {
                        handleFilesSelected(files);
                      }
                    }}
                    onClick={() => {
                      if (!isProcessing) {
                        excelInputRef.current?.click();
                      }
                    }}
                    className="flex min-h-52 flex-col items-center justify-center space-y-3 rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/30 p-8 text-center transition hover:border-emerald-500 hover:bg-emerald-50/50 cursor-pointer"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-surface shadow-xs text-emerald-600 border border-emerald-100">
                      {isProcessing ? <RefreshCw className="h-6 w-6 animate-spin" /> : <FileSpreadsheet className="h-6 w-6" />}
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-ink-strong">
                        {isProcessing ? 'Lecture du fichier Excel en cours...' : 'Déposez un ou plusieurs fichiers Excel (.xlsx, .xls, .csv)'}
                      </h4>
                      <p className="text-xs text-ink-muted mt-1 max-w-md">
                        Cliquez ou glissez-déposez vos fichiers Excel. Vous pouvez en sélectionner un ou <strong>plusieurs à la fois</strong>.
                      </p>
                    </div>
                    <input
                      id="excel-salfa-file-input"
                      type="file"
                      ref={excelInputRef}
                      onChange={handleFileUpload}
                      accept=".xlsx,.xls,.csv"
                      multiple
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        excelInputRef.current?.click();
                      }}
                      disabled={isProcessing}
                      className="rounded-xl bg-emerald-700 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-600 shadow-xs cursor-pointer flex items-center gap-2"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Parcourir des fichiers Excel (Mono ou Multi-fichiers)</span>
                    </button>
                  </div>
                </div>
            </div>
          )}

          {parsedInvoice && (
            <div className="space-y-4">
              {/* DUPLICATE WARNING BANNER IF INVOICE ALREADY EXISTS */}
              {isDuplicateInvoice && (
                <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 shadow-sm text-amber-900 animate-in fade-in">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white font-bold shadow-xs">
                      <ShieldAlert className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black uppercase tracking-wider text-amber-800 bg-amber-200 px-2 py-0.5 rounded-md">
                          Doublon Facture Détecté
                        </span>
                        <span className="text-xs font-bold text-amber-700">
                          {duplicatePrestationsCount} prescription(s) existante(s)
                        </span>
                      </div>
                      <p className="text-xs text-amber-800 mt-1 font-medium leading-relaxed">
                        Le numéro de facture <strong>« {parsedInvoice.numeroFacture} »</strong> est déjà présent dans la base de données des prescriptions. 
                        Pour éviter les doublons accidentels, l'enregistrement est verrouillé. Si vous souhaitez réimporter, modifiez le numéro de facture ou supprimez l'existante au préalable.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* PROMINENT EXTRACTION STATS BANNER: Display total number of items to import before rows */}
              <div className="rounded-2xl border-2 border-indigo-300 bg-gradient-to-r from-indigo-50/90 to-sky-50/80 p-4 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white font-bold shadow-sm">
                      <FileText className="h-6 w-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold uppercase tracking-wider text-indigo-700">Nombre de Prestations à Importer</span>
                        <span className="inline-flex items-center rounded-full bg-indigo-600 px-2.5 py-0.5 text-xs font-extrabold text-white">
                          {totalDetectedCount} lignes détectées
                        </span>
                        <span className="inline-flex items-center rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-bold text-white">
                          {selectedCount} sélectionnées
                        </span>
                      </div>
                      <p className="text-xs text-ink-secondary mt-1 font-medium">
                        Organisme : <strong className="text-ink-strong">{parsedInvoice.clientDoit}</strong> • Facture N° : <strong className="text-indigo-900">{parsedInvoice.numeroFacture}</strong>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleToggleSelectAll(true)}
                      className="px-3 py-1.5 rounded-lg bg-surface border border-indigo-200 text-xs font-bold text-indigo-700 hover:bg-indigo-50 shadow-2xs transition cursor-pointer"
                    >
                      Tout cocher ({totalDetectedCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => handleToggleSelectAll(false)}
                      className="px-3 py-1.5 rounded-lg bg-surface border border-line text-xs font-semibold text-ink-secondary hover:bg-surface-muted transition cursor-pointer"
                    >
                      Tout décocher
                    </button>
                  </div>
                </div>
              </div>

              {/* Document Parameters Editable Card */}
              <div className="rounded-xl border border-line bg-surface p-4 text-xs shadow-2xs">
                <div className="flex items-center justify-between mb-3 border-b border-line-soft pb-2">
                  <span className="font-bold text-ink uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <FileText className="h-4 w-4 text-indigo-600" />
                    Paramètres de la Facture Détectée
                  </span>
                  <span className="text-[11px] text-ink-faint">Modifiable avant validation</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-ink-secondary mb-1">
                      N° Facture <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={parsedInvoice.numeroFacture || ''}
                      onChange={(e) => setParsedInvoice({ ...parsedInvoice, numeroFacture: e.target.value })}
                      placeholder="ex: FA-04/MCI/26-030"
                      className="w-full rounded-lg border border-line-strong bg-surface-muted px-3 py-1.5 text-xs font-bold text-indigo-950 focus:border-indigo-500 focus:bg-surface focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-ink-secondary mb-1">
                      Mois de Prise en Charge
                    </label>
                    <input
                      type="text"
                      value={parsedInvoice.moisPriseEnCharge || ''}
                      onChange={(e) => setParsedInvoice({ ...parsedInvoice, moisPriseEnCharge: e.target.value })}
                      placeholder="ex: Avril 2026"
                      className="w-full rounded-lg border border-line-strong bg-surface-muted px-3 py-1.5 text-xs text-ink focus:border-indigo-500 focus:bg-surface focus:outline-hidden"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-ink-secondary mb-1">
                      Organisme / Client <span className="text-red-500">*</span>
                    </label>
                    <Select
                      value={
                        societes.find(s => s.nom.toLowerCase() === (parsedInvoice.clientDoit || '').toLowerCase())?.nom || 
                        parsedInvoice.clientDoit || ''
                      }
                      onChange={(e) => setParsedInvoice({ ...parsedInvoice, clientDoit: e.target.value })}
                      className="w-full rounded-lg border border-line-strong bg-surface-muted px-3 py-1.5 text-xs font-bold text-ink-strong focus:border-indigo-500 focus:bg-surface focus:outline-hidden cursor-pointer"
                    >
                      <option value="">-- Sélectionner l'organisme payeur --</option>
                      {societes.map((s) => (
                        <option key={s.id} value={s.nom}>
                          {s.nom} ({s.code})
                        </option>
                      ))}
                      {parsedInvoice.clientDoit && !societes.some(s => s.nom.toLowerCase() === parsedInvoice.clientDoit.toLowerCase()) && (
                        <option value={parsedInvoice.clientDoit}>
                          {parsedInvoice.clientDoit} (Détecté dans fichier)
                        </option>
                      )}
                    </Select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-ink-secondary mb-1">
                      Date d'Émission
                    </label>
                    <input
                      type="date"
                      value={parsedInvoice.dateEmission || ''}
                      onChange={(e) => setParsedInvoice({ ...parsedInvoice, dateEmission: e.target.value })}
                      className="w-full rounded-lg border border-line-strong bg-surface-muted px-3 py-1.5 text-xs text-ink focus:border-indigo-500 focus:bg-surface focus:outline-hidden"
                    />
                  </div>
                </div>
              </div>

              {/* Financial Recap Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 rounded-xl border border-line bg-surface-muted p-4 text-xs">
                <div>
                  <span className="text-ink-muted block mb-1 font-medium">Organisme / Client</span>
                  <strong className="text-ink-strong font-extrabold text-sm block truncate" title={parsedInvoice.clientDoit}>
                    {parsedInvoice.clientDoit || 'Non spécifié'}
                  </strong>
                </div>
                <div>
                  <span className="text-ink-muted block">Total Facturé (Sélection)</span>
                  <strong className="text-ink-strong font-bold text-sm">{formatMoney(totalSelectedBrut)}</strong>
                </div>
                <div>
                  <span className="text-ink-muted block">Ticket Modérateur</span>
                  <strong className="text-amber-700 font-bold text-sm">{formatMoney(totalSelectedPart)}</strong>
                </div>
                <div>
                  <span className="text-ink-muted block">Prise en Charge (Net)</span>
                  <strong className="text-emerald-700 font-bold text-sm">{formatMoney(totalSelectedNet)}</strong>
                </div>
              </div>

              {/* Ingestion Options */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-3 text-xs">
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer font-medium text-ink">
                    <input
                      type="checkbox"
                      checked={autoCreateMissingPersonnes}
                      onChange={(e) => setAutoCreateMissingPersonnes(e.target.checked)}
                      className="rounded text-indigo-600"
                    />
                    <span>Créer assurés manquants automatiquement</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer font-medium text-ink">
                    <input
                      type="checkbox"
                      checked={autoCreateMissingSocietes}
                      onChange={(e) => setAutoCreateMissingSocietes(e.target.checked)}
                      className="rounded text-indigo-600"
                    />
                    <span>Créer sous-sociétés (parenthèses)</span>
                  </label>
                </div>
              </div>

              {/* Extracted Lines Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-bold text-ink uppercase tracking-wide">
                    Lignes de soins extraites ({selectedCount} / {totalDetectedCount})
                  </span>
                </div>

                <div className="overflow-x-auto rounded-xl border border-line bg-surface">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-surface-muted text-[11px] font-semibold text-ink-secondary border-b border-line">
                      <tr>
                        <th className="py-2.5 px-3 w-8">
                          <input
                            type="checkbox"
                            checked={selectedCount === parsedInvoice.lignes.length && parsedInvoice.lignes.length > 0}
                            onChange={(e) => handleToggleSelectAll(e.target.checked)}
                            className="rounded text-indigo-600"
                          />
                        </th>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Matricule & Assuré</th>
                        <th className="py-2.5 px-3">Sous-Société</th>
                        <th className="py-2.5 px-3 min-w-[200px]">Acte médicale / Prix</th>
                        <th className="py-2.5 px-3 text-right">Montant Brut</th>
                        <th className="py-2.5 px-3 text-right">Ticket Modérateur</th>
                        <th className="py-2.5 px-3 text-right">Prise en Charge (Net)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {parsedInvoice.lignes.map((ligne, idx) => (
                        <tr
                          key={idx}
                          className={`hover:bg-surface-muted/80 transition ${
                            selectedLines[idx] ? 'bg-surface' : 'bg-surface-muted/50 opacity-60'
                          }`}
                        >
                          <td className="py-2.5 px-3">
                            <input
                              type="checkbox"
                              checked={!!selectedLines[idx]}
                              onChange={() => handleToggleSelectLine(idx)}
                              className="rounded text-indigo-600"
                            />
                          </td>
                          <td className="py-2.5 px-3 font-mono text-[11px] text-ink-secondary">
                            {ligne.dateSoins}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-semibold text-ink-strong">{ligne.nomPrenom}</div>
                            <div className="text-[11px] text-ink-muted font-mono">Mat: {ligne.matricule || '-'}</div>
                          </td>
                          <td className="py-2.5 px-3">
                            {ligne.sousSociete ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-amber-50 text-amber-900 border border-amber-200">
                                {ligne.sousSociete}
                              </span>
                            ) : (
                              <span className="text-ink-faint text-[11px]">-</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 min-w-[200px]">
                            {ligne.actes && ligne.actes.length > 0 ? (
                              <div className="flex flex-col gap-1">
                                {ligne.actes.map((a, i) => (
                                  <div
                                    key={i}
                                    className="flex items-center justify-between px-2 py-0.5 rounded text-[11px] font-mono bg-indigo-50/70 border border-indigo-100 text-indigo-900"
                                  >
                                    <span className="font-bold">{a.code}</span>
                                    <span className="font-semibold text-ink ml-2">
                                      {formatMoney(a.montant)}
                                    </span>
                                  </div>
                                ))}
                                {ligne.actes.length > 1 && (
                                  <div className="text-[10px] text-ink-faint font-medium px-1">
                                    {ligne.actes.length} actes cumulés
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-ink-secondary text-[11px]">{ligne.actesTexte}</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-medium text-ink-strong">
                            {formatMoney(ligne.montantBrut)}
                          </td>
                          <td className="py-2.5 px-3 text-right text-amber-700 font-medium">
                            {formatMoney(ligne.participation)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-emerald-700">
                            {formatMoney(ligne.netAPayer)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Bottom Reset Action */}
              <div className="flex justify-end">
                <button
                  onClick={handleResetAndBack}
                  className="text-xs text-ink-muted hover:text-ink cursor-pointer"
                >
                  Charger un autre document
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-line px-6 py-4 bg-surface-muted/70 rounded-b-2xl">
          <div>
            {parsedInvoice && (
              <div className="text-xs text-ink-secondary">
                <strong className="text-ink-strong font-bold">{selectedCount}</strong> sur <strong className="text-ink-strong font-bold">{totalDetectedCount}</strong> prestations sélectionnées •{' '}
                Total : <strong className="text-ink-strong font-bold">{formatMoney(totalSelectedBrut)}</strong> (Net prise en charge :{' '}
                <strong className="text-emerald-700 font-bold">{formatMoney(totalSelectedNet)}</strong>)
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {parsedInvoice && (
              <button
                onClick={handleResetAndBack}
                className="rounded-xl border border-line bg-surface px-4 py-2 text-xs font-semibold text-ink hover:bg-surface-muted transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Retour</span>
              </button>
            )}
            <button
              onClick={handleClose}
              className="rounded-xl border border-line bg-surface px-4 py-2 text-xs font-semibold text-ink hover:bg-surface-muted transition cursor-pointer"
            >
              Annuler
            </button>
            {parsedInvoice && (
              <button
                onClick={handleValidateImport}
                disabled={selectedCount === 0 || isDuplicateInvoice}
                className={`rounded-xl px-5 py-2 text-xs font-bold transition shadow-xs flex items-center gap-2 cursor-pointer ${
                  isDuplicateInvoice 
                    ? 'bg-amber-600 text-white hover:bg-amber-500 opacity-60 cursor-not-allowed' 
                    : 'bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50'
                }`}
                title={isDuplicateInvoice ? 'Facture déjà existante dans la base' : undefined}
              >
                {isDuplicateInvoice ? <Ban className="h-4 w-4" /> : <Check className="h-4 w-4" />}
                <span>
                  {isDuplicateInvoice 
                    ? 'Facture déjà existante (Doublon)' 
                    : fileQueue.length > 1 
                    ? `Valider et Importer (${currentFileIndex + 1}/${fileQueue.length})` 
                    : `Enregistrer ${selectedCount} Prestations`}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Modal d'Alerte : Société Inexistante dans la Base */}
      {missingSocPrompt && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-2xl border border-line space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-50 text-rose-600 border border-rose-200 shrink-0">
                <AlertCircle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-ink-strong">Société non répertoriée</h3>
                <p className="text-xs font-semibold text-rose-600">Création automatique interdite</p>
              </div>
            </div>

            <div className="rounded-xl bg-rose-50/80 p-4 border border-rose-200 text-xs sm:text-sm text-ink leading-relaxed space-y-2">
              <p>
                La société ou l'organisme payeur <strong className="font-bold text-rose-950">« {missingSocPrompt.socName} »</strong> figurant sur ce document n'existe pas dans la base de données.
              </p>
              <p className="text-xs text-ink-secondary">
                <strong>Information :</strong> Aucune nouvelle société ne peut être créée automatiquement lors d'une importation. Veuillez d'abord enregistrer cette société dans le paramétrage de l'application, ou sélectionner ci-dessous une société existante à laquelle rattacher cette facture.
              </p>
            </div>

            <div className="space-y-1.5 pt-1">
              <label className="block text-xs font-bold text-ink">Rattacher à une société existante (optionnel) :</label>
              <Select
                value={selectedOverrideSocId}
                onChange={(e) => setSelectedOverrideSocId(e.target.value)}
                className="w-full bg-surface text-xs font-semibold rounded-xl p-2.5 border border-line-strong focus:ring-2 focus:ring-indigo-500 focus:outline-none"
              >
                <option value="">-- Choisir une société existante --</option>
                {societes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nom} ({s.code})
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              {selectedOverrideSocId && (
                <button
                  type="button"
                  onClick={() => {
                    const socId = selectedOverrideSocId;
                    setMissingSocPrompt(null);
                    setSelectedOverrideSocId('');
                    executeImportWithSociety(socId);
                  }}
                  className="w-full inline-flex justify-center items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-indigo-500 transition focus:outline-none cursor-pointer"
                >
                  <CheckCircle className="h-4 w-4" />
                  Rattacher et poursuivre l'importation
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setMissingSocPrompt(null);
                  setSelectedOverrideSocId('');
                }}
                className="w-full inline-flex justify-center items-center gap-2 rounded-xl bg-surface-hover px-4 py-2.5 text-xs font-semibold text-ink hover:bg-surface-active transition focus:outline-none cursor-pointer"
              >
                <X className="h-4 w-4" />
                Fermer / Annuler l'importation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
