import { useState, useEffect } from 'react';
import { X, TrendingUp, AlertCircle, Shield, Loader2, Calendar } from 'lucide-react';
import { supabase, QuoteRequest } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { validateQuotePricing } from '../utils/marketPriceCalculation';
import { validateNoContactInfo } from '../utils/contactInfoValidator';

interface QuoteBidModalProps {
  quoteRequest: QuoteRequest;
  onClose: () => void;
  onSuccess: () => void;
}

type AIIndicator = 'conforme' | 'proche' | 'eloigne_bas' | 'eloigne_haut';

interface AIEstimation {
  indicator: AIIndicator;
  confidence?: number;
  reasoning?: string;
  method: string;
}

export default function QuoteBidModal({ quoteRequest, onClose, onSuccess }: QuoteBidModalProps) {
  const { user } = useAuth();
  const [proposedPrice, setProposedPrice] = useState<string>('');
  const [proposedMovingDate, setProposedMovingDate] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [notesError, setNotesError] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [priceAnalysis, setPriceAnalysis] = useState<{
    marketPrice: number;
    priceIndicator: 'green' | 'orange' | 'red';
    clientDisplayPrice: number;
  } | null>(null);
  const [aiEstimation, setAiEstimation] = useState<AIEstimation | null>(null);
  const [estimationLoading, setEstimationLoading] = useState(false);
  const [validityDays, setValidityDays] = useState(30);

  useEffect(() => {
    const movingDate = new Date(quoteRequest.moving_date);
    setProposedMovingDate(movingDate.toISOString().split('T')[0]);
  }, [quoteRequest]);

  useEffect(() => {
    if (proposedPrice && !isNaN(parseFloat(proposedPrice))) {
      const price = parseFloat(proposedPrice);
      const analysis = validateQuotePricing(quoteRequest, price);
      setPriceAnalysis(analysis);
      
      // Fetch AI estimation with debounce
      const timer = setTimeout(() => {
        fetchAIEstimation(price);
      }, 500);
      
      return () => clearTimeout(timer);
    } else {
      setPriceAnalysis(null);
      setAiEstimation(null);
    }
  }, [proposedPrice, quoteRequest]);

  const fetchAIEstimation = async (price: number) => {
    setEstimationLoading(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      
      const response = await fetch(`${supabaseUrl}/functions/v1/estimate-market-price`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseAnonKey}`,
        },
        body: JSON.stringify({
          quoteRequest: {
            volume_m3: quoteRequest.volume_m3,
            surface_m2: quoteRequest.surface_m2,
            distance_km: (quoteRequest as any).distance_km,
            from_city: quoteRequest.from_city,
            to_city: quoteRequest.to_city,
            floor_from: quoteRequest.floor_from,
            floor_to: quoteRequest.floor_to,
            elevator_from: quoteRequest.elevator_from,
            elevator_to: quoteRequest.elevator_to,
            services_needed: quoteRequest.services_needed,
            furniture_lift_needed_departure: (quoteRequest as any).furniture_lift_needed_departure,
            furniture_lift_needed_arrival: (quoteRequest as any).furniture_lift_needed_arrival,
            accepts_groupage: (quoteRequest as any).accepts_groupage,
            moving_date: quoteRequest.moving_date,
          },
          moverPrice: price,
        }),
      });

      const data = await response.json();
      if (data.success) {
        setAiEstimation(data);
      }
    } catch (err) {
      console.error('Error fetching AI estimation:', err);
      // Use basic indicator from priceAnalysis as fallback
    } finally {
      setEstimationLoading(false);
    }
  };

  const getAvailableDates = () => {
    const movingDate = new Date(quoteRequest.moving_date);
    const flexibilityDays = quoteRequest.date_flexibility_days || 0;
    const dates = [];

    for (let i = 0; i <= flexibilityDays; i++) {
      const date = new Date(movingDate);
      date.setDate(date.getDate() + i);
      dates.push(date);
    }

    return dates;
  };

  const formatDateDisplay = (date: Date) => {
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    };
    return date.toLocaleDateString('fr-FR', options);
  };

  const getAIIndicatorDisplay = (indicator: AIIndicator) => {
    switch (indicator) {
      case 'conforme':
        return {
          label: 'Prix conforme au marché',
          icon: '✅',
          color: 'bg-green-100 text-green-800 border-green-300',
          description: 'Votre prix est dans la fourchette habituelle du marché. Ce devis a de bonnes chances d\'être accepté.'
        };
      case 'proche':
        return {
          label: 'Prix proche du marché',
          icon: '📊',
          color: 'bg-blue-100 text-blue-800 border-blue-300',
          description: 'Votre prix est légèrement au-dessus ou en-dessous de la moyenne. Restez compétitif.'
        };
      case 'eloigne_bas':
        return {
          label: 'Prix très bas',
          icon: '⚠️',
          color: 'bg-amber-100 text-amber-800 border-amber-300',
          description: 'Votre prix est significativement en-dessous du marché. Le client pourrait douter de la qualité du service.'
        };
      case 'eloigne_haut':
        return {
          label: 'Prix élevé',
          icon: '💰',
          color: 'bg-orange-100 text-orange-800 border-orange-300',
          description: 'Votre prix est au-dessus du marché. Le client pourrait préférer un devis moins cher.'
        };
    }
  };

  // Fallback indicator from basic analysis
  const getFallbackIndicator = (): AIIndicator => {
    if (!priceAnalysis) return 'conforme';
    switch (priceAnalysis.priceIndicator) {
      case 'green': return 'conforme';
      case 'orange': return 'proche';
      case 'red': 
        const price = parseFloat(proposedPrice);
        return price < priceAnalysis.marketPrice ? 'eloigne_bas' : 'eloigne_haut';
      default: return 'conforme';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!proposedPrice || isNaN(parseFloat(proposedPrice))) {
      setError('Veuillez entrer un prix valide');
      return;
    }

    const price = parseFloat(proposedPrice);
    if (price <= 0) {
      setError('Le prix doit être supérieur à 0');
      return;
    }

    const notesValidation = validateNoContactInfo(notes);
    if (!notesValidation.isValid) {
      setError('Votre message contient des informations interdites. Veuillez retirer toute tentative d\'échange de coordonnées.');
      setNotesError(notesValidation.blockedReasons);
      return;
    }

    if (!priceAnalysis) {
      setError('Erreur de calcul du prix');
      return;
    }

    setLoading(true);

    try {
      const { data: mover } = await supabase
        .from('movers')
        .select('id')
        .eq('user_id', user?.id)
        .maybeSingle();

      if (!mover) {
        throw new Error('Profil déménageur non trouvé');
      }

      const movingDate = new Date(quoteRequest.moving_date);
      const flexibilityDays = quoteRequest.date_flexibility_days || 0;
      // Validity date = proposed moving date (the date the mover selected for the move)
      const proposedDate = new Date(proposedMovingDate);
      const finalValidityDate = proposedDate;
      // Set to end of day for same-day acceptance
      finalValidityDate.setHours(23, 59, 59, 999);

      const { error: insertError } = await supabase.from('quotes').insert({
        quote_request_id: quoteRequest.id,
        mover_id: mover.id,
        price: price,
        client_display_price: priceAnalysis.clientDisplayPrice,
        market_price_estimate: priceAnalysis.marketPrice,
        price_indicator: priceAnalysis.priceIndicator,
        proposed_moving_date: proposedMovingDate,
        notes: notes || null,
        status: 'pending',
        validity_date: finalValidityDate.toISOString().split('T')[0],
      });

      if (insertError) throw insertError;

      const { error: updateError } = await supabase
        .from('quote_requests')
        .update({ status: 'quoted' })
        .eq('id', quoteRequest.id);

      if (updateError) throw updateError;

      onSuccess();
    } catch (err: any) {
      console.error('Error submitting quote:', err);
      setError(err.message || 'Erreur lors de la soumission du devis');
    } finally {
      setLoading(false);
    }
  };

  const currentIndicator = aiEstimation?.indicator || getFallbackIndicator();
  const indicatorDisplay = getAIIndicatorDisplay(currentIndicator);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-2xl font-bold text-slate-800">Soumettre un devis</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-red-800">{error}</p>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Votre prix (€) *
            </label>
            <input
              type="number"
              step="0.01"
              value={proposedPrice}
              onChange={(e) => setProposedPrice(e.target.value)}
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
              placeholder="Ex: 1200.00"
              required
            />
            <p className="mt-1 text-xs text-slate-500">
              Le prix que vous proposez pour effectuer ce déménagement
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Date proposée pour le déménagement *
            </label>
            <select
              value={proposedMovingDate}
              onChange={(e) => setProposedMovingDate(e.target.value)}
              className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-base"
              required
            >
              {getAvailableDates().map((date) => {
                const dateStr = date.toISOString().split('T')[0];
                return (
                  <option key={dateStr} value={dateStr}>
                    {formatDateDisplay(date)}
                  </option>
                );
              })}
            </select>
            <p className="mt-1 text-xs text-slate-500">
              {quoteRequest.date_flexibility_days && quoteRequest.date_flexibility_days > 0
                ? `Le client accepte une flexibilité de ${quoteRequest.date_flexibility_days} jour(s). Choisissez la date qui vous convient.`
                : 'Le client souhaite un déménagement à cette date précise.'}
            </p>
          </div>

          {priceAnalysis && (
            <div className="space-y-4">
              {/* Price Summary */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between items-center py-1">
                    <span className="text-slate-700">Votre prix:</span>
                    <span className="font-bold text-lg text-slate-900">{parseFloat(proposedPrice).toFixed(2)} €</span>
                  </div>
                </div>
              </div>

              {/* AI Price Indicator - NO actual market price shown */}
              <div className={`border-2 rounded-lg p-4 ${
                estimationLoading ? 'bg-slate-50 border-slate-200' : indicatorDisplay.color
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  {estimationLoading ? (
                    <>
                      <Loader2 className="w-5 h-5 text-slate-500 animate-spin" />
                      <span className="font-semibold text-slate-600">Analyse du prix en cours...</span>
                    </>
                  ) : (
                    <>
                      <span className="text-xl">{indicatorDisplay.icon}</span>
                      <span className="font-semibold">{indicatorDisplay.label}</span>
                    </>
                  )}
                </div>
                
                {!estimationLoading && (
                  <p className="text-sm">
                    {indicatorDisplay.description}
                  </p>
                )}

                {aiEstimation?.reasoning && !estimationLoading && (
                  <p className="mt-2 text-xs text-slate-600 italic border-t border-current/20 pt-2">
                    💡 {aiEstimation.reasoning.replace(/\d[\d\s]*€/g, '').replace(/\d[\d\s]*\s*euros?/gi, '')}
                  </p>
                )}
              </div>

              {/* Payment info */}
              <div className="p-3 bg-blue-100 border border-blue-300 rounded-lg">
                <p className="text-xs text-blue-900 font-medium mb-1">📅 Calendrier des paiements:</p>
                <ul className="text-xs text-blue-800 space-y-1 list-disc list-inside">
                  <li>Le client vous paie directement <strong>à la fin du déménagement</strong> (solde restant)</li>
                  <li>Si aucun dommage n'est signalé par le client sous <strong>48h</strong> (avec justificatifs), l'admin vous verse la garantie retenue</li>
                </ul>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Notes ou message pour le client (optionnel)
            </label>
            <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start gap-2">
                <Shield className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <div className="text-xs text-amber-800">
                  <strong>Protection anti-fraude :</strong> L'échange de coordonnées (téléphone, email, réseaux sociaux, noms d'entreprise) est strictement interdit avant le paiement. Tout contournement entraînera le blocage de votre compte.
                </div>
              </div>
            </div>
            <textarea
              value={notes}
              onChange={(e) => {
                const value = e.target.value;
                setNotes(value);
                const validation = validateNoContactInfo(value);
                setNotesError(validation.blockedReasons);
              }}
              rows={4}
              className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:border-transparent ${
                notesError.length > 0
                  ? 'border-red-500 focus:ring-red-500 bg-red-50'
                  : 'border-slate-300 focus:ring-blue-500'
              }`}
              placeholder="Ajoutez des détails sur votre offre, votre disponibilité, etc."
            />
            {notesError.length > 0 && (
              <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-red-800 mb-1">
                      Message bloqué - Contenu interdit détecté :
                    </p>
                    <ul className="text-sm text-red-700 list-disc list-inside space-y-1">
                      {notesError.map((reason, idx) => (
                        <li key={idx}>{reason}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Validité du devis
            </label>
            <div className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-500" />
                <span>
                  Valide jusqu'au <strong>{new Date(proposedMovingDate || quoteRequest.moving_date).toLocaleDateString('fr-FR')}</strong> (date du déménagement)
                </span>
              </div>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Le devis est automatiquement valable jusqu'à la date de déménagement proposée.
            </p>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-6 py-3 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-medium"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={loading || !proposedPrice || !priceAnalysis}
              className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Envoi en cours...' : 'Soumettre le devis'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
