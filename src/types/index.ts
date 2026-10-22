import { z } from 'zod';

export type ServiceType = 'ZEM' | 'TAXI' | 'TRICYCLE';
export type RideStatus = 'COMPLETED' | 'CANCELLED_BY_DRIVER' | 'CANCELLED_BY_CUSTOMER';

export interface CustomerProfile {
  customerId: string;
  name: string;
  phone: string;
  city: string; // e.g. "Lomé", "Cotonou"
  walletBalanceFcfa: number;
  refundsLast30Days: number; // Historique pour l'agent de vérification
  accountStanding: 'GOOD_STANDING' | 'UNDER_REVIEW' | 'FLAGGED_ABUSE';
}

export interface RideTelemetry {
  rideId: string;
  customerId: string;
  driverId: string;
  driverName: string;
  serviceType: ServiceType;
  pickupAddress: string;
  dropoffAddress: string;
  estimatedFareFcfa: number;
  chargedFareFcfa: number;
  estimatedDistanceKm: number;
  actualDistanceKm: number;
  estimatedDurationMin: number;
  actualDurationMin: number;
  cancellationTimeAfterBookingSec?: number;
  status: RideStatus;
  paymentMethod: 'GOZEM_MONEY' | 'CASH' | 'AIRTEL_MONEY' | 'TMONEY' | 'MOOV_MONEY' | 'MTN_MOMO';
}

export interface MomoTransaction {
  txId: string;
  customerId: string;
  provider: 'TMONEY' | 'MOOV_MONEY' | 'MTN_MOMO';
  amountFcfa: number;
  externalReference: string;
  operatorStatus: 'SUCCESSFUL_ON_OPERATOR_SIDE' | 'FAILED' | 'PENDING';
  gozemWalletCredited: boolean;
  timestamp: string;
}

export interface SupportTicketInput {
  ticketId: string;
  customerId: string;
  rideId?: string;
  txId?: string;
  complaintText: string;
}

export type DisputeCategory =
  | 'ROUTE_DEVIATION_OVERCHARGE'
  | 'UNJUSTIFIED_CANCELLATION_FEE'
  | 'MOMO_DEPOSIT_NOT_CREDITED'
  | 'VALID_CHARGES_CONFIRMED'
  | 'INSUFFICIENT_DATA_ESCALATION';

export interface DiagnosticsOutput {
  ticketId: string;
  category: DisputeCategory;
  isEligibleForRemediation: boolean;
  refundAmountFcfa: number;
  confidence: number;
  explanation: string;
  rulesTriggered: string[];
}

export type VerificationStatus =
  | 'APPROVED_FOR_AUTO_RESOLUTION'
  | 'BLOCKED_ABOVE_THRESHOLD'
  | 'BLOCKED_FRAUD_RISK'
  | 'BLOCKED_INCOHERENT_AMOUNT'
  | 'PASSED_NO_REMEDIATION_NEEDED';

export interface VerificationOutput {
  verified: boolean;
  status: VerificationStatus;
  authorizedAmountFcfa: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  requiresSupervisorApproval: boolean;
  verificationAudit: string;
  flags: string[];
}

export interface CommandActionOutput {
  actionId: string;
  actionTaken:
    | 'CREDIT_WALLET_REFUND'
    | 'REVERSE_CANCELLATION_FEE'
    | 'MANUALLY_CREDIT_MOMO_DEPOSIT'
    | 'SEND_EXPLANATION_NO_REFUND'
    | 'ESCALATE_TO_TIER2_HUMAN'
    | 'ESCALATE_SUPERVISOR_HIGH_AMOUNT'
    | 'ESCALATE_FRAUD_INVESTIGATION';
  amountFcfa: number;
  currency: 'FCFA';
  customerMessage: string;
  auditTrail: string;
}

export interface CoordinatorPipelineReport {
  ticketId: string;
  customerId: string;
  timestamp: string;
  collectedContext: {
    customer?: CustomerProfile;
    ride?: RideTelemetry;
    momoTransaction?: MomoTransaction;
  };
  diagnostics: DiagnosticsOutput;
  verification: VerificationOutput;
  resolution: CommandActionOutput;
}

// Zod validation for HTTP Requests
export const SupportTicketSchema = z.object({
  ticketId: z.string().default(() => `TCK-${Date.now()}`),
  customerId: z.string({ required_error: 'customerId est requis' }),
  rideId: z.string().optional(),
  txId: z.string().optional(),
  complaintText: z.string({ required_error: 'complaintText est requis' }).min(5),
});
