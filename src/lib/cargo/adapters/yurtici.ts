/* eslint-disable @typescript-eslint/no-unused-vars */
import type { CargoAdapter, CargoShipment, CargoShipmentParams } from "../types";

/**
 * Yurtici Kargo API Adapter
 *
 * API Docs: https://www.yurticikargo.com/tr/kurumsal/web-servisleri
 * WSDL: https://ws.yurticikargo.com/KOPSWebServices/ShippingOrderDispatcherServices?wsdl
 *
 * TODO: Implement actual SOAP API integration
 */
export const yurticiAdapter: CargoAdapter = {
  name: "yurtici",
  displayName: "Yurtici Kargo",

  async createShipment(
    _config: Record<string, string>,
    _params: CargoShipmentParams
  ): Promise<CargoShipment> {
    // TODO: Implement Yurtici Kargo SOAP API call
    // Required config: yurtici_username, yurtici_password, yurtici_user_language
    //
    // SOAP Request structure:
    // <createShipment>
    //   <ShippingOrderVO>
    //     <cargoKey>{orderNumber}</cargoKey>
    //     <receiverCustName>{receiverName}</receiverCustName>
    //     <receiverAddress>{receiverAddress}</receiverAddress>
    //     <receiverPhone1>{receiverPhone}</receiverPhone1>
    //     <cityName>{receiverCity}</cityName>
    //     <desi>{weight}</desi>
    //     <description>{description}</description>
    //   </ShippingOrderVO>
    // </createShipment>

    throw new Error("Yurtici Kargo API entegrasyonu yakinda aktif olacak");
  },

  getTrackingUrl(trackingNumber: string): string {
    return `https://www.yurticikargo.com/tr/online-servisler/gonderi-sorgula?code=${encodeURIComponent(trackingNumber)}`;
  },

  async getLabel(
    _config: Record<string, string>,
    _trackingNumber: string
  ): Promise<string> {
    // TODO: Implement label fetch via SOAP queryShipmentLabel
    throw new Error("Yurtici Kargo etiket servisi yakinda aktif olacak");
  },
};
