export const queryKeys = {
  auth: ['auth'] as const,
  dashboard: {
    executive: (filters: Record<string, unknown>) => ['dashboard', 'executive', filters] as const,
  },
  fleet: {
    all: ['fleet', 'vehicles'] as const,
    one: (id: number) => ['fleet', 'vehicles', id] as const,
  },
  customers: {
    all: ['customers'] as const,
    one: (id: number) => ['customers', id] as const,
  },
  contracts: {
    all: ['contracts'] as const,
    one: (id: number | string) => ['contracts', id] as const,
  },
  credit: {
    cases: ['credit', 'cases'] as const,
    one: (id: number) => ['credit', 'cases', id] as const,
  },
  finance: {
    schedule: ['finance', 'schedule'] as const,
  },
  arrears: {
    cases: ['arrears', 'cases'] as const,
  },
  usedCars: {
    listings: ['used-cars', 'listings'] as const,
  },
  gps: {
    alerts: ['gps', 'alerts'] as const,
    geofences: ['gps', 'geofences'] as const,
    live: ['gps', 'vehicles', 'live'] as const,
  },
  notifications: {
    all: ['notifications'] as const,
  },
  missions: ['missions'] as const,
  reservations: ['reservations'] as const,
  audit: ['audit'] as const,
  rentals: ['rentals'] as const,
  settings: {
    users: ['settings', 'users'] as const,
  },
} as const;
