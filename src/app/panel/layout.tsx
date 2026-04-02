import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth";
import { PanelSidebar } from "./sidebar";

export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession();

  if (!session) {
    redirect("/login");
  }

  if (session.tenant.isAdmin) {
    redirect("/admin");
  }

  if (!session.tenant.isApproved) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">Hesabiniz Henuz Onaylanmadi</h1>
          <p className="text-sm text-gray-500 mb-6">
            Basvurunuz inceleniyor. Onaylandiginda size e-posta ile bilgi verilecektir.
            Sorulariniz icin destek ekibimize ulasabilirsiniz.
          </p>
          <div className="text-xs text-gray-400">
            <p>{session.tenant.company}</p>
            <p>{session.tenant.email}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <PanelSidebar
        tenantName={session.tenant.name}
        companyName={session.tenant.company}
      />
      <main className="flex-1 ml-0 md:ml-[260px] bg-gray-50 min-h-screen">
        <div className="p-4 md:p-8">{children}</div>
      </main>
    </div>
  );
}
