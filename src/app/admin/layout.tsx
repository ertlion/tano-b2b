import { redirect } from "next/navigation";
import { getServerSession } from "@/lib/auth";
import { AdminSidebar } from "./sidebar";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession();

  if (!session || !session.tenant.isAdmin) {
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen">
      <AdminSidebar tenantName={session.tenant.name} />
      <main className="flex-1 ml-0 md:ml-[250px] bg-gray-50 min-h-screen">
        <div className="p-4 md:p-8">{children}</div>
      </main>
    </div>
  );
}
