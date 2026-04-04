/* eslint-disable @typescript-eslint/no-unused-vars */
import type { CargoAdapter, CargoShipment, CargoShipmentParams } from "../types";

/**
 * Aras Kargo API Adapter
 *
 * API Docs: https://customerservices.araskargo.com.tr/ArasCargoCustomerIntegrationService/ArasCargoIntegrationService.svc
 * WSDL: https://customerservices.araskargo.com.tr/ArasCargoCustomerIntegrationService/ArasCargoIntegrationService.svc?wsdl
 *
 * TODO: Implement actual SOAP API integration
 */
export const arasAdapter: CargoAdapter = {
  name: "aras",
  displayName: "Aras Kargo",

  async createShipment(
    _config: Record<string, string>,
    _params: CargoShipmentParams
  ): Promise<CargoShipment> {
    // TODO: Implement Aras Kargo SOAP API call
    // Required config: aras_username, aras_password, aras_customer_code
    //
    // SOAP Request structure:
    // <SetOrder>
    //   <UserName>{username}</UserName>
    //   <Password>{password}</Password>
    //   <TradingWaybillNumber>{customerCode}</TradingWaybillNumber>
    //   <InvoiceNumber>{orderNumber}</InvoiceNumber>
    //   <ReceiverName>{receiverName}</ReceiverName>
    //   <ReceiverAddress>{receiverAddress}</ReceiverAddress>
    //   <ReceiverPhone1>{receiverPhone}</ReceiverPhone1>
    //   <ReceiverCityName>{receiverCity}</ReceiverCityName>
    //   <PieceCount>1</PieceCount>
    // </SetOrder>

    throw new Error("Aras Kargo API entegrasyonu yakinda aktif olacak");
  },

  getTrackingUrl(trackingNumber: string): string {
    return `https://www.araskargo.com.tr/taki.php?code=${encodeURIComponent(trackingNumber)}`;
  },
};
