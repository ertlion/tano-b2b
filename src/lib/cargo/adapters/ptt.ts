/* eslint-disable @typescript-eslint/no-unused-vars */
import type { CargoAdapter, CargoShipment, CargoShipmentParams } from "../types";

/**
 * PTT Kargo API Adapter
 *
 * API Docs: https://gonderitakip.ptt.gov.tr
 * WSDL: https://pttws.ptt.gov.tr/PttKargoOperasyonService/PttKargoOperasyonService?wsdl
 *
 * TODO: Implement actual SOAP API integration
 */
export const pttAdapter: CargoAdapter = {
  name: "ptt",
  displayName: "PTT Kargo",

  async createShipment(
    _config: Record<string, string>,
    _params: CargoShipmentParams
  ): Promise<CargoShipment> {
    // TODO: Implement PTT Kargo SOAP API call
    // Required config: ptt_username, ptt_password, ptt_customer_id
    //
    // SOAP Request structure:
    // <havaleBarkodOlustur>
    //   <musteri_id>{customerId}</musteri_id>
    //   <kullanici>{username}</kullanici>
    //   <sifre>{password}</sifre>
    //   <gonderi_bilgi>
    //     <MusBarkod>{orderNumber}</MusBarkod>
    //     <AliciAdi>{receiverName}</AliciAdi>
    //     <AliciAdres>{receiverAddress}</AliciAdres>
    //     <AliciTel>{receiverPhone}</AliciTel>
    //     <AliciIl>{receiverCity}</AliciIl>
    //     <Agirlik>{weight}</Agirlik>
    //   </gonderi_bilgi>
    // </havaleBarkodOlustur>

    throw new Error("PTT Kargo API entegrasyonu yakinda aktif olacak");
  },

  getTrackingUrl(trackingNumber: string): string {
    return `https://gonderitakip.ptt.gov.tr/Track/Verify?q=${encodeURIComponent(trackingNumber)}`;
  },
};
