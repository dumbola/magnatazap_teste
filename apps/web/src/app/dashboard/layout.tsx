import { Sidebar } from '../../components/Sidebar';

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-background text-text-main flex">
            {/* Sidebar Fixa */}
            <Sidebar />

            {/* Content */}
            <main className="flex-1 md:pl-72 pt-4 md:pt-0 transition-all pb-24 md:pb-8">
                <div className="p-4 md:p-8 min-h-screen">
                    {children}
                </div>
            </main>
        </div>
    );
}
