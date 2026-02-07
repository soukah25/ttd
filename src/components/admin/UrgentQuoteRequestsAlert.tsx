import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { AlertTriangle, Calendar, MapPin, User, Eye } from 'lucide-react';
import QuoteRequestDetailModal from './QuoteRequestDetailModal';

interface UrgentQuoteRequest {
  id: string;
  client_name: string;
  client_email: string;
  client_phone: string;
  from_address: string;
  from_city: string;
  to_address: string;
  to_city: string;
  moving_date: string;
  date_flexibility_days: number | null;
  days_until_move: number;
  quote_count: number;
}

export default function UrgentQuoteRequestsAlert() {
  const [urgentRequests, setUrgentRequests] = useState<UrgentQuoteRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string | null>(null);

  useEffect(() => {
    loadUrgentRequests();

    const interval = setInterval(() => {
      loadUrgentRequests();
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  const loadUrgentRequests = async () => {
    try {
      const { data, error } = await supabase
        .from('urgent_quote_requests')
        .select('*')
        .order('days_until_move', { ascending: true });

      if (error) throw error;

      setUrgentRequests(data || []);

      if (data && data.length > 0) {
        await supabase.rpc('create_admin_alerts_for_urgent_quote_requests');
      }
    } catch (error) {
      console.error('Error loading urgent requests:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return null;
  }

  if (urgentRequests.length === 0) {
    return null;
  }

  return (
    <>
      <div className="bg-orange-50 dark:bg-orange-900/20 border-2 border-orange-500 rounded-xl p-6 mb-6">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-orange-500 rounded-lg">
            <AlertTriangle className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-orange-900 dark:text-orange-100 mb-2">
              Demandes Urgentes Sans Devis ({urgentRequests.length})
            </h3>
            <p className="text-sm text-orange-800 dark:text-orange-200 mb-4">
              Les demandes suivantes approchent de leur date de déménagement et n'ont reçu aucun devis de la part des déménageurs.
            </p>

            <div className="space-y-3">
              {urgentRequests.map((request) => (
                <div
                  key={request.id}
                  className="bg-white dark:bg-gray-800 border border-orange-200 dark:border-orange-800 rounded-lg p-4"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <User className="w-4 h-4 text-gray-500" />
                        <span className="font-semibold text-gray-900 dark:text-white">
                          {request.client_name}
                        </span>
                        <span className="text-sm text-gray-500">
                          {request.client_phone}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 text-green-600 mt-0.5" />
                          <div>
                            <p className="text-gray-500 dark:text-gray-400">Départ</p>
                            <p className="text-gray-900 dark:text-white font-medium">
                              {request.from_address}, {request.from_city}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-start gap-2">
                          <MapPin className="w-4 h-4 text-red-600 mt-0.5" />
                          <div>
                            <p className="text-gray-500 dark:text-gray-400">Arrivée</p>
                            <p className="text-gray-900 dark:text-white font-medium">
                              {request.to_address}, {request.to_city}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 mt-3">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-4 h-4 text-orange-600" />
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            {new Date(request.moving_date).toLocaleDateString('fr-FR')}
                            {request.date_flexibility_days && request.date_flexibility_days > 0 && (
                              <span className="ml-1 text-orange-600">
                                (±{request.date_flexibility_days} jour{request.date_flexibility_days > 1 ? 's' : ''})
                              </span>
                            )}
                          </span>
                        </div>

                        <div className="px-3 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200 rounded-full text-xs font-bold">
                          Dans {request.days_until_move} jour{request.days_until_move > 1 ? 's' : ''}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => setSelectedQuoteId(request.id)}
                      className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                      Voir
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {selectedQuoteId && (
        <QuoteRequestDetailModal
          quoteRequestId={selectedQuoteId}
          onClose={() => setSelectedQuoteId(null)}
          onSave={loadUrgentRequests}
        />
      )}
    </>
  );
}
