import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import StoreLogo from '@/components/store/StoreLogo';

export default function PageNotFound() {
    return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-gray-50/50">
            <div className="max-w-md w-full text-center space-y-6">
                <div className="flex justify-center">
                    <StoreLogo />
                </div>

                <div className="space-y-2">
                    <h1 className="text-7xl font-light text-gray-300">404</h1>
                    <div className="h-0.5 w-16 bg-gray-200 mx-auto" />
                </div>

                <div className="space-y-2">
                    <h2 className="text-2xl font-bold font-heading text-foreground">Pagina nu a fost găsită</h2>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        Pagina căutată nu există sau a fost mutată.
                    </p>
                </div>

                <div className="pt-2">
                    <Link
                        to="/store"
                        className="inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" /> Înapoi în magazin
                    </Link>
                </div>
            </div>
        </div>
    );
}
