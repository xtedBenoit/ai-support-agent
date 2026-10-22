import { CustomerProfile, RideTelemetry, MomoTransaction } from '../types/index.js';

export const MOCK_CUSTOMERS: Record<string, CustomerProfile> = {
  'CUST-001': {
    customerId: 'CUST-001',
    name: 'Koffi Mensah',
    phone: '+228 90 12 34 56',
    city: 'Lomé',
    walletBalanceFcfa: 450,
    refundsLast30Days: 0,
    accountStanding: 'GOOD_STANDING',
  },
  'CUST-002': {
    customerId: 'CUST-002',
    name: 'Awa Dossou',
    phone: '+229 97 45 67 89',
    city: 'Cotonou',
    walletBalanceFcfa: 1200,
    refundsLast30Days: 1,
    accountStanding: 'GOOD_STANDING',
  },
  'CUST-003': {
    customerId: 'CUST-003',
    name: 'Yao Agbeko',
    phone: '+228 92 88 99 00',
    city: 'Lomé',
    walletBalanceFcfa: 0,
    refundsLast30Days: 0,
    accountStanding: 'GOOD_STANDING',
  },
  'CUST-004-ABUSE': {
    customerId: 'CUST-004-ABUSE',
    name: 'Honoré Gbadamassi',
    phone: '+228 91 77 66 55',
    city: 'Lomé',
    walletBalanceFcfa: 3500,
    refundsLast30Days: 4, // 4 remboursements en 30 jours -> Suspect pour l'agent de vérification
    accountStanding: 'FLAGGED_ABUSE',
  },
  'CUST-005-VIP': {
    customerId: 'CUST-005-VIP',
    name: 'Dr. Suzanne Lawson',
    phone: '+228 93 11 22 33',
    city: 'Lomé',
    walletBalanceFcfa: 15000,
    refundsLast30Days: 0,
    accountStanding: 'GOOD_STANDING',
  },
};

export const MOCK_RIDES: Record<string, RideTelemetry> = {
  // Scénario 1: Surfacturation par détour injustifié (Zem à Lomé)
  'RIDE-LOME-001': {
    rideId: 'RIDE-LOME-001',
    customerId: 'CUST-001',
    driverId: 'DRV-78',
    driverName: 'Kodjo Champion Zem',
    serviceType: 'ZEM',
    pickupAddress: 'Campus Universitaire Lomé',
    dropoffAddress: 'Grand Marché Assigamé',
    estimatedFareFcfa: 800,
    chargedFareFcfa: 1600, // +100%
    estimatedDistanceKm: 3.5,
    actualDistanceKm: 7.2, // Grand détour anormal
    estimatedDurationMin: 12,
    actualDurationMin: 28,
    status: 'COMPLETED',
    paymentMethod: 'GOZEM_MONEY',
  },
  // Scénario 2: Frais d'annulation injustifiés (Taxi à Cotonou)
  'RIDE-COT-002': {
    rideId: 'RIDE-COT-002',
    customerId: 'CUST-002',
    driverId: 'DRV-102',
    driverName: 'Patrice Taxi Confort',
    serviceType: 'TAXI',
    pickupAddress: 'Aéroport Cadjehoun Cotonou',
    dropoffAddress: 'Haie Vive',
    estimatedFareFcfa: 2500,
    chargedFareFcfa: 400, // Frais d'annulation indûment prélevés
    estimatedDistanceKm: 5.0,
    actualDistanceKm: 0.1,
    estimatedDurationMin: 15,
    actualDurationMin: 1,
    cancellationTimeAfterBookingSec: 45, // Annulé rapidement par le chauffeur
    status: 'CANCELLED_BY_DRIVER',
    paymentMethod: 'GOZEM_MONEY',
  },
  // Scénario 4: Course conforme (Tarif normal avec léger embouteillage)
  'RIDE-LOME-004': {
    rideId: 'RIDE-LOME-004',
    customerId: 'CUST-001',
    driverId: 'DRV-45',
    driverName: 'Folly Champion Zem',
    serviceType: 'ZEM',
    pickupAddress: 'Baguida Plage',
    dropoffAddress: 'Hôtel 2 Février',
    estimatedFareFcfa: 1000,
    chargedFareFcfa: 1050, // Moins de 10% d'écart
    estimatedDistanceKm: 6.0,
    actualDistanceKm: 6.2,
    estimatedDurationMin: 20,
    actualDurationMin: 22,
    status: 'COMPLETED',
    paymentMethod: 'GOZEM_MONEY',
  },
  // Scénario 5: Course longue distance avec litige élevé (> 3000 FCFA plafond auto)
  'RIDE-LOME-005-HIGH': {
    rideId: 'RIDE-LOME-005-HIGH',
    customerId: 'CUST-005-VIP',
    driverId: 'DRV-90',
    driverName: 'Ablam Taxi Climatisé',
    serviceType: 'TAXI',
    pickupAddress: 'Lomé Port Autonome',
    dropoffAddress: 'Kpalimé',
    estimatedFareFcfa: 18000,
    chargedFareFcfa: 23500, // Écart de 5500 FCFA (> 3000 FCFA)
    estimatedDistanceKm: 115.0,
    actualDistanceKm: 160.0,
    estimatedDurationMin: 120,
    actualDurationMin: 185,
    status: 'COMPLETED',
    paymentMethod: 'GOZEM_MONEY',
  },
  // Scénario 6: Client avec historique de fraude / réclamations abusives
  'RIDE-LOME-006-FRAUD': {
    rideId: 'RIDE-LOME-006-FRAUD',
    customerId: 'CUST-004-ABUSE',
    driverId: 'DRV-33',
    driverName: 'Messan Zem',
    serviceType: 'ZEM',
    pickupAddress: 'Tokoin Doumasséssé',
    dropoffAddress: 'Bè Beach',
    estimatedFareFcfa: 600,
    chargedFareFcfa: 1200, // Écart de 600 FCFA
    estimatedDistanceKm: 3.0,
    actualDistanceKm: 6.0,
    estimatedDurationMin: 10,
    actualDurationMin: 20,
    status: 'COMPLETED',
    paymentMethod: 'GOZEM_MONEY',
  },
};

export const MOCK_MOMO_TRANSACTIONS: Record<string, MomoTransaction> = {
  // Scénario 3: Recharge TMoney débitée côté opérateur mais non créditée chez Gozem
  'TX-TMONEY-303': {
    txId: 'TX-TMONEY-303',
    customerId: 'CUST-003',
    provider: 'TMONEY',
    amountFcfa: 5000,
    externalReference: 'TMONEY-REF-88492019',
    operatorStatus: 'SUCCESSFUL_ON_OPERATOR_SIDE',
    gozemWalletCredited: false, // Échec du webhook Gozem
    timestamp: '2026-10-20T10:15:00Z',
  },
};
