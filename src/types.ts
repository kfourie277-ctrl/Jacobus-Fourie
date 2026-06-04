export type JobStatus = 'Check-in' | 'In Progress' | 'Awaiting Parts' | 'Quality Control' | 'Ready for Collection' | 'Completed';

export interface ClientInfo {
  companyName: string;
  firstName: string;
  surname: string;
  email: string;
  tel: string;
  cell: string;
  address: string;
}

export interface VehicleDetails {
  make: string;
  model: string;
  year: string;
  color: string;
  registrationNo: string;
  engineNo: string;
  chassisNo: string;
  odometerIn: string;
  kmIn?: string;
  odometerOut: string;
  transmission: 'Automatic' | 'Manual';
  driveType: '4x4' | '4x2';
  fuelType: 'Petrol' | 'Diesel';
}

export interface WorkDetails {
  workRequested: string;
  workshopNotes: string;
  serviceType: string[];
  estimatedCost: number;
  authorisedCost: number;
}

export interface VehicleCondition {
  hasDents: boolean;
  hasScratches: boolean;
  fuelLevel: string;
  otherNotes: string;
}

export interface Recording {
  url: string;
  thumbnail?: string;
  description?: string;
  type?: 'check-in' | 'check-out';
}

export interface Technician {
  id: string;
  name: string;
  specialization?: string;
  active: boolean;
}

export interface ChecklistItem {
  id: string;
  task: string;
  completed: boolean;
  completedAt?: any;
  completedBy?: string;
}

export interface JobCard {
  id: string;
  jobCardNo: string;
  customerCode: string;
  clientName?: string;
  status: JobStatus;
  assignedTechnician?: string; // Technician ID or Name
  assignedTechnicianName?: string;
  clientInfo: ClientInfo;
  vehicleDetails: VehicleDetails;
  workDetails: WorkDetails;
  condition: VehicleCondition;
  recordings: Recording[];
  checklist?: ChecklistItem[];
  diagnosticsReport?: {
    obdScanStatus: 'Passed' | 'Faults Found' | 'Not Run';
    dtcCodes: string;
    batteryVoltage: string;
    batteryHealth: string;
    alternatorOutput: string;
    engineCompression: string;
    absStatus: 'Good' | 'Fault' | 'Not Inspected';
    airbagsStatus: 'Good' | 'Fault' | 'Not Inspected';
    ecuStatus: 'Good' | 'Fault' | 'Not Inspected';
    transmissionStatus: 'Good' | 'Fault' | 'Not Inspected';
    fuelSystemStatus: 'Good' | 'Fault' | 'Not Inspected';
    coolantSystemStatus: 'Good' | 'Fault' | 'Not Inspected';
    diagnosticNotes: string;
    technicianName: string;
    timestamp?: any;
  };
  createdAt: any;
  updatedAt: any;
}

export interface ChatMessage {
  id: string;
  text: string;
  senderId: string;
  senderName: string;
  senderEmail: string;
  timestamp: any;
  audioUrl?: string;
  audioDuration?: number;
  senderRole?: string;
}

export interface JobNote {
  id: string;
  jobCardId: string;
  text: string;
  authorName: string;
  authorEmail: string;
  createdAt: any;
  audioUrl?: string;
  audioDuration?: number;
}

export interface Part {
  id: string;
  jobCardId: string;
  name: string;
  quantity: number;
  price: number;
  description: string;
  sku?: string;
  category?: string;
  assignedTechnician?: string;
  assignedTechnicianName?: string;
}

export interface QuoteItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface Quote {
  id?: string;
  quoteNo: string;
  jobCardId?: string;
  jobCardNo?: string;
  date: string;
  expiryDate: string;
  clientInfo: ClientInfo;
  vehicleDetails: VehicleDetails;
  items: QuoteItem[];
  subtotal: number;
  includeVat: boolean;
  vatAmount: number;
  totalAmount: number;
  status: 'Draft' | 'Sent' | 'Accepted' | 'Rejected';
  notes: string;
  createdAt: any;
  updatedAt: any;
  sharedWithOffice?: boolean;
}

