/* eslint-disable @typescript-eslint/no-unused-vars */
import type { CargoAdapter, CargoShipment, CargoShipmentParams } from "../types";

/**
 * Surat Kargo API Adapter
 *
 * API Docs: https://www.suratkargo.com.tr/entegrasyon
 * WSDL: https://sfrwebservices.suratkargo.com.tr/services/ShipmentServiceV1?wsdl
 *
 * TODO: Implement actual SOAP API integration
 */
export const suratAdapter: CargoAdapter = {
  name: "surat",
  displayName: "Surat Kargo",

  async createShipment(
    _config: Record<string, string>,
    _params: CargoShipmentParams
  ): Promise<CargoShipment> {
    // TODO: Implement Surat Kargo SOAP API call
    // Required config: surat_username, surat_password, surat_customer_code
    //
    // SOAP Request structure:
    // <createShipment>
    //   <customerCode>{customerCode}</customerCode>
    //   <userName>{username}</userName>
    //   <password>{password}</password>
    //   <referenceNo>{orderNumber}</referenceNo>
    //   <receiverName>{receiverName}</receiverName>
    //   <receiverAddress>{receiverAddress}</receiverAddress>
    //   <receiverPhone>{receiverPhone}</receiverPhone>
    //   <receiverCity>{receiverCity}</receiverCity>
    //   <desi>{weight}</desi>
    // </createShipment>

    throw new Error("Surat Kargo API entegrasyonu yakinda aktif olacak");
  },

  getTrackingUrl(trackingNumber: string): string {
    return `https://www.suratkargo.com.tr/gonderi-takip?code=${encodeURIComponent(trackingNumber)}`;
  },
};
