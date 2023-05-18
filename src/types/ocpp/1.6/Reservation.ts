
export interface OCPP16Reservation {
  id: number;
  connectorId: number;
  expiryDate: Date;
  idTag: string;
  parentIdTag?: string;
}
