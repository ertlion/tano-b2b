export interface CargoShipmentParams {
  senderName: string;
  senderAddress: string;
  senderCity: string;
  senderPhone: string;
  receiverName: string;
  receiverAddress: string;
  receiverCity: string;
  receiverPhone: string;
  weight: number;
  description: string;
  orderNumber: string;
}

export interface CargoShipment {
  trackingNumber: string;
  trackingUrl: string;
  label?: string; // base64 PDF
}

export interface CargoAdapter {
  name: string;
  displayName: string;
  createShipment(
    config: Record<string, string>,
    params: CargoShipmentParams
  ): Promise<CargoShipment>;
  getTrackingUrl(trackingNumber: string): string;
  getLabel?(
    config: Record<string, string>,
    trackingNumber: string
  ): Promise<string>; // base64 PDF
}

export type CargoProviderName =
  | "yurtici"
  | "aras"
  | "mng"
  | "surat"
  | "ptt";
