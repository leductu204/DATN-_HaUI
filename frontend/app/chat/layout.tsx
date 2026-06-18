import Sidebar from "@/components/Sidebar";
import AssetLibrary from "@/components/AssetLibrary";

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0">{children}</main>
      <AssetLibrary />
    </div>
  );
}
