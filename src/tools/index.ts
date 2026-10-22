import {
  MOCK_CUSTOMERS,
  MOCK_RIDES,
  MOCK_MOMO_TRANSACTIONS,
} from '../data/mockGozemDb.js';
import {
  CustomerProfile,
  RideTelemetry,
  MomoTransaction,
  DiagnosticsOutput,
  VerificationOutput,
  CommandActionOutput,
} from '../types/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// TOOL 1 (Utilisé par DataCollectorAgent): Récupération des données télémétriques
// ─────────────────────────────────────────────────────────────────────────────
export async function fetchSupportContextTool(params: {
  customerId: string;
  rideId?: string;
  txId?: string;
}): Promise<{
  customer?: CustomerProfile;
  ride?: RideTelemetry;
  momoTransaction?: MomoTransaction;
}> {
  const customer = MOCK_CUSTOMERS[params.customerId];
  const ride = params.rideId ? MOCK_RIDES[params.rideId] : undefined;
  const momoTransaction = params.txId ? MOCK_MOMO_TRANSACTIONS[params.txId] : undefined;

  return { customer, ride, momoTransaction };
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL 2 (Utilisé par DiagnosticsAgent): Évaluation des règles de politique Gozem
// ─────────────────────────────────────────────────────────────────────────────
export async function evaluateGozemPoliciesTool(params: {
  complaintText: string;
  context: {
    customer?: CustomerProfile;
    ride?: RideTelemetry;
    momoTransaction?: MomoTransaction;
  };
}): Promise<DiagnosticsOutput> {
  const { ride, momoTransaction } = params.context;
  const rulesTriggered: string[] = [];

  // Règle A : Vérification de la recharge Mobile Money (TMoney/Moov/MTN)
  if (momoTransaction) {
    if (
      momoTransaction.operatorStatus === 'SUCCESSFUL_ON_OPERATOR_SIDE' &&
      !momoTransaction.gozemWalletCredited
    ) {
      rulesTriggered.push('RULE_MOMO_OPERATOR_PAID_BUT_WALLET_NOT_CREDITED');
      return {
        ticketId: 'TCK-MOMO',
        category: 'MOMO_DEPOSIT_NOT_CREDITED',
        isEligibleForRemediation: true,
        refundAmountFcfa: momoTransaction.amountFcfa,
        confidence: 0.99,
        explanation: `La transaction ${momoTransaction.txId} de ${momoTransaction.amountFcfa} FCFA a été confirmée par ${momoTransaction.provider} mais n'a pas été créditée sur le portefeuille Gozem.`,
        rulesTriggered,
      };
    }
  }

  // Règle B : Frais d'annulation injustifiés
  if (ride && ride.status === 'CANCELLED_BY_DRIVER') {
    if (ride.chargedFareFcfa > 0) {
      rulesTriggered.push('RULE_DRIVER_CANCELLED_FEES_REVERSAL');
      return {
        ticketId: 'TCK-CANCEL',
        category: 'UNJUSTIFIED_CANCELLATION_FEE',
        isEligibleForRemediation: true,
        refundAmountFcfa: ride.chargedFareFcfa,
        confidence: 0.98,
        explanation: `La course a été annulée par le chauffeur (${ride.driverName}) après ${ride.cancellationTimeAfterBookingSec || 0}s. Le client ne doit pas supporter les frais d'annulation de ${ride.chargedFareFcfa} FCFA.`,
        rulesTriggered,
      };
    }
  }

  // Règle C : Surfacturation par détour / distance anormale
  if (ride && ride.status === 'COMPLETED') {
    const distanceDelta = ride.actualDistanceKm - ride.estimatedDistanceKm;
    const distanceRatio = ride.actualDistanceKm / (ride.estimatedDistanceKm || 1);
    const fareDelta = ride.chargedFareFcfa - ride.estimatedFareFcfa;

    // Si distance réelle > +30% et surcoût > 200 FCFA
    if (distanceRatio > 1.3 && fareDelta > 200) {
      rulesTriggered.push('RULE_ROUTE_DEVIATION_SIGNIFICANT');
      return {
        ticketId: 'TCK-DEVIATION',
        category: 'ROUTE_DEVIATION_OVERCHARGE',
        isEligibleForRemediation: true,
        refundAmountFcfa: fareDelta,
        confidence: 0.94,
        explanation: `Détour anormal détecté : ${ride.actualDistanceKm} km parcourus vs ${ride.estimatedDistanceKm} km estimés (+${Math.round((distanceRatio - 1) * 100)}%). Écart tarifaire de ${fareDelta} FCFA à rembourser.`,
        rulesTriggered,
      };
    }

    // Écart minime admissible (ex: léger trafic ou détour minime < 15%)
    if (fareDelta <= 200 && fareDelta >= 0) {
      rulesTriggered.push('RULE_ACCEPTABLE_FARE_VARIANCE');
      return {
        ticketId: 'TCK-VALID',
        category: 'VALID_CHARGES_CONFIRMED',
        isEligibleForRemediation: false,
        refundAmountFcfa: 0,
        confidence: 0.91,
        explanation: `L'écart de ${fareDelta} FCFA est conforme aux variations légitimes de temps de trajet et conditions de circulation à ${ride.pickupAddress}.`,
        rulesTriggered,
      };
    }
  }

  // Cas par défaut : Données insuffisantes ou cas non prévu -> Escalade
  return {
    ticketId: 'TCK-ESCALATE',
    category: 'INSUFFICIENT_DATA_ESCALATION',
    isEligibleForRemediation: false,
    refundAmountFcfa: 0,
    confidence: 0.5,
    explanation: 'Cas complexe nécessitant une analyse manuelle par un agent support humain.',
    rulesTriggered: ['RULE_FALLBACK_ESCALATION'],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL 3 (Utilisé par VerificationAgent): Contrôles de conformité, sécurité & anti-fraude
// ─────────────────────────────────────────────────────────────────────────────
export const MAX_AUTO_REFUND_FCFA = 3000;
export const MAX_MONTHLY_REFUNDS_ALLOWED = 3;

export async function verifyComplianceTool(params: {
  customer?: CustomerProfile;
  ride?: RideTelemetry;
  diagnostics: DiagnosticsOutput;
}): Promise<VerificationOutput> {
  const { customer, ride, diagnostics } = params;
  const flags: string[] = [];

  // Si aucune remédiation n'est demandée par le diagnostic
  if (!diagnostics.isEligibleForRemediation || diagnostics.refundAmountFcfa === 0) {
    return {
      verified: true,
      status: 'PASSED_NO_REMEDIATION_NEEDED',
      authorizedAmountFcfa: 0,
      riskLevel: 'LOW',
      requiresSupervisorApproval: false,
      verificationAudit: '[VÉRIFICATION PASSÉE] Aucun remboursement requis.',
      flags: ['NO_FINANCIAL_IMPACT'],
    };
  }

  // CONTRÔLE 1 : Détection d'abus et récidive client
  if (customer) {
    if (customer.accountStanding === 'FLAGGED_ABUSE' || customer.refundsLast30Days >= MAX_MONTHLY_REFUNDS_ALLOWED) {
      flags.push('FLAG_FREQUENT_REFUND_ABUSE');
      return {
        verified: false,
        status: 'BLOCKED_FRAUD_RISK',
        authorizedAmountFcfa: 0,
        riskLevel: 'HIGH',
        requiresSupervisorApproval: true,
        verificationAudit: `[VÉRIFICATION BLOQUÉE - RISQUE FRAUDE] Le client a déjà cumulé ${customer.refundsLast30Days} remboursements ces 30 derniers jours (Statut: ${customer.accountStanding}).`,
        flags,
      };
    }
  }

  // CONTRÔLE 2 : Cohérence mathématique (Remboursement ne peut dépasser le montant débité)
  if (ride && diagnostics.refundAmountFcfa > ride.chargedFareFcfa) {
    flags.push('FLAG_AMOUNT_EXCEEDS_CHARGED_FARE');
    return {
      verified: false,
      status: 'BLOCKED_INCOHERENT_AMOUNT',
      authorizedAmountFcfa: ride.chargedFareFcfa,
      riskLevel: 'HIGH',
      requiresSupervisorApproval: true,
      verificationAudit: `[VÉRIFICATION BLOQUÉE - INCOHÉRENCE] Remboursement proposé (${diagnostics.refundAmountFcfa} FCFA) supérieur au montant payé (${ride.chargedFareFcfa} FCFA).`,
      flags,
    };
  }

  // CONTRÔLE 3 : Plafond financier automatique (Seuil max 3000 FCFA)
  // Note: Les recharges MoMo vérifiées ont une exception car validées par l'opérateur
  const isMomoDirectDeposit = diagnostics.category === 'MOMO_DEPOSIT_NOT_CREDITED';
  if (!isMomoDirectDeposit && diagnostics.refundAmountFcfa > MAX_AUTO_REFUND_FCFA) {
    flags.push('FLAG_EXCEEDS_AUTO_REFUND_LIMIT');
    return {
      verified: false,
      status: 'BLOCKED_ABOVE_THRESHOLD',
      authorizedAmountFcfa: diagnostics.refundAmountFcfa,
      riskLevel: 'MEDIUM',
      requiresSupervisorApproval: true,
      verificationAudit: `[VÉRIFICATION SUSPENDUE - SEUIL FINANCIER] Montant (${diagnostics.refundAmountFcfa} FCFA) supérieur au plafond automatique (${MAX_AUTO_REFUND_FCFA} FCFA). Approbation d'un superviseur requise.`,
      flags,
    };
  }

  // TOUS LES CONTRÔLES SONT VALIDES
  flags.push('COMPLIANCE_CHECKS_PASSED');
  return {
    verified: true,
    status: 'APPROVED_FOR_AUTO_RESOLUTION',
    authorizedAmountFcfa: diagnostics.refundAmountFcfa,
    riskLevel: 'LOW',
    requiresSupervisorApproval: false,
    verificationAudit: `[VÉRIFICATION VALIDÉE] Montant (${diagnostics.refundAmountFcfa} FCFA) conforme aux plafonds. Client sain (${customer?.name || 'Inconnu'}, 0 signalement).`,
    flags,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// TOOL 4 (Utilisé par ResolutionAgent): Exécution des actions de remédiation
// ─────────────────────────────────────────────────────────────────────────────
export async function executeGozemActionTool(params: {
  customerId: string;
  diagnostics: DiagnosticsOutput;
  verification: VerificationOutput;
}): Promise<CommandActionOutput> {
  const { customerId, diagnostics, verification } = params;
  const customer = MOCK_CUSTOMERS[customerId];
  const customerName = customer ? customer.name : 'Cher client';

  // ── 1. Traitement des blocages de l'Agent de Vérification ──
  if (verification.status === 'BLOCKED_ABOVE_THRESHOLD') {
    return {
      actionId: `ACT-${Date.now()}-ESC_SUPERVISOR`,
      actionTaken: 'ESCALATE_SUPERVISOR_HIGH_AMOUNT',
      amountFcfa: verification.authorizedAmountFcfa,
      currency: 'FCFA',
      customerMessage: `Bonjour ${customerName}, votre dossier pour un remboursement de ${verification.authorizedAmountFcfa} FCFA a été validé techniquement et transmis à notre superviseur financier pour validation finale sous 15 minutes.`,
      auditTrail: `[ACTION SÉCURISÉE] Montant élevé (${verification.authorizedAmountFcfa} FCFA). Escaladé au superviseur. Aucun débit automatique effectué.`,
    };
  }

  if (verification.status === 'BLOCKED_FRAUD_RISK') {
    return {
      actionId: `ACT-${Date.now()}-ESC_FRAUD`,
      actionTaken: 'ESCALATE_FRAUD_INVESTIGATION',
      amountFcfa: 0,
      currency: 'FCFA',
      customerMessage: `Bonjour ${customerName}, votre réclamation nécessite une vérification approfondie par notre cellule d'audit interne. Un agent vous contactera par téléphone.`,
      auditTrail: `[ACTION SÉCURISÉE] Alerte abus/fraude (récidive de réclamations). Bloqué par l'Agent de Vérification.`,
    };
  }

  if (verification.status === 'BLOCKED_INCOHERENT_AMOUNT') {
    return {
      actionId: `ACT-${Date.now()}-INCOHERENCE`,
      actionTaken: 'ESCALATE_TO_TIER2_HUMAN',
      amountFcfa: 0,
      currency: 'FCFA',
      customerMessage: `Bonjour ${customerName}, une anomalie dans le calcul tarifaire a été détectée. Notre équipe d'assistance réajuste votre dossier manuellement.`,
      auditTrail: `[ACTION SÉCURISÉE] Incohérence montants. Transféré au support humain.`,
    };
  }

  // ── 2. Exécution des actions validées par l'Agent de Vérification ──
  switch (diagnostics.category) {
    case 'ROUTE_DEVIATION_OVERCHARGE': {
      const amount = verification.authorizedAmountFcfa;
      if (customer) {
        customer.walletBalanceFcfa += amount;
        customer.refundsLast30Days += 1;
      }
      return {
        actionId: `ACT-${Date.now()}-REFUND`,
        actionTaken: 'CREDIT_WALLET_REFUND',
        amountFcfa: amount,
        currency: 'FCFA',
        customerMessage: `Bonjour ${customerName}, suite à l'analyse de votre trajet, nous avons constaté un détour anormal. Un montant de ${amount} FCFA a été immédiatement recrédité sur votre portefeuille Gozem Money.`,
        auditTrail: `[ACTION SUCCESS] Portefeuille ${customerId} recrédité de ${amount} FCFA (Détour). Nouveau solde: ${customer?.walletBalanceFcfa} FCFA.`,
      };
    }

    case 'UNJUSTIFIED_CANCELLATION_FEE': {
      const amount = verification.authorizedAmountFcfa;
      if (customer) {
        customer.walletBalanceFcfa += amount;
        customer.refundsLast30Days += 1;
      }
      return {
        actionId: `ACT-${Date.now()}-CANCEL_REVERSE`,
        actionTaken: 'REVERSE_CANCELLATION_FEE',
        amountFcfa: amount,
        currency: 'FCFA',
        customerMessage: `Bonjour ${customerName}, les frais d'annulation de ${amount} FCFA ont été annulés et reversés sur votre compte Gozem Money car l'annulation provient du chauffeur.`,
        auditTrail: `[ACTION SUCCESS] Frais d'annulation de ${amount} FCFA annulés pour ${customerId}.`,
      };
    }

    case 'MOMO_DEPOSIT_NOT_CREDITED': {
      const amount = verification.authorizedAmountFcfa;
      if (customer) {
        customer.walletBalanceFcfa += amount;
      }
      return {
        actionId: `ACT-${Date.now()}-MOMO_MANUAL`,
        actionTaken: 'MANUALLY_CREDIT_MOMO_DEPOSIT',
        amountFcfa: amount,
        currency: 'FCFA',
        customerMessage: `Bonjour ${customerName}, votre recharge Mobile Money de ${amount} FCFA a bien été validée et créditée manuellement sur votre solde Gozem. Toutes nos excuses pour ce retard technique.`,
        auditTrail: `[ACTION SUCCESS] Transaction MoMo régularisée. ${amount} FCFA crédités sur le compte de ${customerId}.`,
      };
    }

    case 'VALID_CHARGES_CONFIRMED': {
      return {
        actionId: `ACT-${Date.now()}-NO_ACTION`,
        actionTaken: 'SEND_EXPLANATION_NO_REFUND',
        amountFcfa: 0,
        currency: 'FCFA',
        customerMessage: `Bonjour ${customerName}, nous avons vérifié votre trajet. Le montant facturé correspond exactement au temps réel et aux conditions de trafic rencontrées. Aucun prélèvement anormal n'a été détecté.`,
        auditTrail: `[INFO] Réclamation rejetée après vérification télémétrique. Explication transmise au client.`,
      };
    }

    case 'INSUFFICIENT_DATA_ESCALATION':
    default: {
      return {
        actionId: `ACT-${Date.now()}-ESCALATION`,
        actionTaken: 'ESCALATE_TO_TIER2_HUMAN',
        amountFcfa: 0,
        currency: 'FCFA',
        customerMessage: `Bonjour ${customerName}, votre demande a été transmise à notre équipe support niveau 2 pour un examen approfondi. Un conseiller Gozem vous répondra d'ici 30 minutes.`,
        auditTrail: `[ESCALATION] Ticket transféré vers la file Zendesk Support Humain Niveau 2.`,
      };
    }
  }
}
