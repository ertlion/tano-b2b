/* eslint-disable @typescript-eslint/no-unused-vars */
import type { CargoAdapter, CargoShipment, CargoShipmentParams } from "../types";

/**
 * MNG Kargo API Adapter
 *
 * API Docs: https://www.mngkargo.com.tr/web-servisler
 * REST API Base: https://api.mngkargo.com.tr/mngapi/api
 *
 * TODO: Implement actual REST API integration
 */
export const mngAdapter: CargoAdapter = {
  name: "mng",
  displayName: "MNG Kargo",

  async createShipment(
    _config: Record<string, string>,
    _params: CargoShipmentParams
  ): Promise<CargoShipment> {
    // TODO: Implement MNG Kargo REST API call
    // Required config: mng_username, mng_password, mng_customer_number
    //
    // POST /mngapi/api/standardcmdservice/order
    // Headers: Authorization: Basic base64(username:password)
    // Body:
    // {
    //   "Order": {
    //     "ReferenceId": "{orderNumber}",
    //     "Barcode": "",
    //     "BillOfLandingId": "{customerNumber}",
    //     "IsCOD": 0,
    //     "CodAmount": 0,
    //     "ShipmentServiceType": 1,
    //     "PackageType": 1,
    //     "NumberOfPackages": 1,
    //     "Weight": {weight},
    //     "Description": "{description}",
    //     "SenderAddress": { ... },
    //     "ConsigneeAddress": { ... }
    //   }
    // }

    throw new Error("MNG Kargo API entegrasyonu yakinda aktif olacak");
  },

  getTrackingUrl(trackingNumber: string): string {
    return `https://www.mngkargo.com.tr/gonderi-takip?code=${encodeURIComponent(trackingNumber)}`;
  },
};
