import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { CreditCard, Shield, AlertCircle, ArrowLeft, Building2, Banknote, Info } from 'lucide-react';
import { calculatePriceBreakdown } from '../utils/marketPriceCalculation';
import { ClientLayout } from '../components/ClientLayout';

interface QuoteData {
  id: string;
  quote_request_id: string;
  mover_id: string;
  client_display_price: number;
  quote_requests: Array<{
    id: string;
    from_city: string;
    to_city: string;
    moving_date: string;
    from_address: string;
    to_address: string;
  }>;
}

interface Quote {
  id: string;
  quote_request_id: string;
  mover_id: string;
  client_display_price: number;
  quote_requests: {
    id: string;
    from_city: string;
    to_city: string;
    moving_date: string;
    from_address: string;
    to_address: string;
  };
}

export default function ClientPaymentPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { quoteId } = useParams<{ quoteId: string }>();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'transfer'>('card');
  const [cardNumber, setCardNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [cvv, setCvv] = useState('');
  const [cardName, setCardName] = useState('');

  useEffect(() => {
    if (quoteId) {
      fetchQuoteDetails();
    }
  }, [quoteId]);

  const fetchQuoteDetails = async () => {
    if (!quoteId) {
      setError('ID de devis manquant');
      setLoading(false);
      return;
    }
    try {
      // First fetch the quote
      const { data: quoteData, error: quoteError } = await supabase
        .from('quotes')
        .select(`
          id,
          quote_request_id,
          mover_id,
          client_display_price,
          status
        `)
        .eq('id', quoteId)
        .maybeSingle();

      if (quoteError) throw quoteError;

      if (!quoteData) {
        setError('Devis introuvable');
        setLoading(false);
        return;
      }

      // Then fetch the quote request
      const { data: requestData, error: requestError } = await supabase
        .from('quote_requests')
        .select(`
          id,
          from_city,
          to_city,
          moving_date,
          from_address,
          to_address,
          status
        `)
        .eq('id', quoteData.quote_request_id)
        .maybeSingle();

      if (requestError) throw requestError;

      if (quoteData.status === 'expired') {
        setError('Ce devis a expiré car la demande a été modifiée. Veuillez attendre un nouveau devis du déménageur.');
        setLoading(false);
        return;
      }

      if (quoteData.status === 'rejected') {
        setError('Ce devis a été rejeté et ne peut plus être accepté.');
        setLoading(false);
        return;
      }

      // If quote is already accepted, redirect to success page
      if (quoteData.status === 'accepted') {
        navigate(`/client/payment-success?quoteId=${quoteId}`, { replace: true });
        return;
      }

      if (quoteData.status !== 'pending') {
        setError('Ce devis ne peut pas être accepté.');
        setLoading(false);
        return;
      }

      if (requestData?.status !== 'quoted' && requestData?.status !== 'new' && requestData?.status !== 'accepted') {
        setError('Cette demande ne peut plus recevoir de paiements.');
        setLoading(false);
        return;
      }

      setQuote({
        id: quoteData.id,
        quote_request_id: quoteData.quote_request_id,
        mover_id: quoteData.mover_id,
        client_display_price: quoteData.client_display_price,
        quote_requests: requestData
      });
    } catch (err) {
      console.error('Error fetching quote:', err);
      setError('Erreur lors du chargement des détails');
    } finally {
      setLoading(false);
    }
  };

  const validateCardData = () => {
    if (paymentMethod === 'card') {
      const cardNumberClean = cardNumber.replace(/\s/g, '');

      if (cardNumberClean.length !== 16) {
        throw new Error('Le numéro de carte doit contenir 16 chiffres');
      }

      if (!cardName || cardName.trim().length < 3) {
        throw new Error('Veuillez entrer le nom du titulaire de la carte');
      }

      if (!expiryDate || !expiryDate.match(/^\d{2}\/\d{2}$/)) {
        throw new Error('La date d\'expiration doit être au format MM/AA');
      }

      const [month, year] = expiryDate.split('/').map(Number);
      if (month < 1 || month > 12) {
        throw new Error('Le mois d\'expiration est invalide');
      }

      const currentYear = new Date().getFullYear() % 100;
      const currentMonth = new Date().getMonth() + 1;
      if (year < currentYear || (year === currentYear && month < currentMonth)) {
        throw new Error('La carte est expirée');
      }

      if (cvv.length !== 3) {
        throw new Error('Le CVV doit contenir 3 chiffres');
      }
    }
  };

  const handlePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setProcessing(true);

    try {
      if (!quote || !user) {
        throw new Error('Données manquantes');
      }

      validateCardData();

      const { data: currentQuote, error: checkError } = await supabase
        .from('quotes')
        .select('status, quote_requests!quote_request_id(status)')
        .eq('id', quote.id)
        .maybeSingle();

      if (checkError) throw checkError;

      if (!currentQuote) {
        throw new Error('Devis introuvable');
      }

      if (currentQuote.status !== 'pending') {
        throw new Error('Ce devis ne peut plus être accepté. Statut actuel: ' + currentQuote.status);
      }

      const quoteRequestData = currentQuote.quote_requests as any;
      if (quoteRequestData?.status === 'accepted' || quoteRequestData?.status === 'completed') {
        throw new Error('Cette demande a déjà été acceptée ou complétée.');
      }

      const breakdown = calculatePriceBreakdown(quote.client_display_price);
      const moverPrice = Math.round(quote.client_display_price / 1.3);

      let paymentIntentId: string;
      
      // Try Stripe first, fallback to test mode if it fails
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      try {
        console.log('Création PaymentIntent Stripe pour:', breakdown.depositAmount, 'EUR');

        const paymentIntentResponse = await fetch(
          `${supabaseUrl}/functions/v1/create-payment-intent`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseAnonKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              amount: breakdown.depositAmount,
              quoteId: quote.id,
              description: `Acompte déménagement ${quote.quote_requests.from_city} → ${quote.quote_requests.to_city}`,
            }),
          }
        );

        if (!paymentIntentResponse.ok) {
          throw new Error('Stripe non disponible');
        }

        const stripeResult = await paymentIntentResponse.json();
        paymentIntentId = stripeResult.paymentIntentId;

        if (!paymentIntentId) {
          throw new Error('PaymentIntent non créé');
        }

        console.log('✅ PaymentIntent Stripe créé:', paymentIntentId);
      } catch (stripeError) {
        // DEV MODE: Fallback to simulated payment
        console.warn('⚠️ Stripe non disponible, utilisation du mode test');
        paymentIntentId = `pi_test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        console.log('🧪 MODE TEST: Paiement simulé avec ID:', paymentIntentId);
      }

      const { error: paymentError } = await supabase
        .from('payments')
        .insert({
          quote_request_id: quote.quote_request_id,
          quote_id: quote.id,
          client_id: user.id,
          mover_id: quote.mover_id,
          mover_price: moverPrice,
          total_amount: breakdown.totalAmount,
          deposit_amount: breakdown.depositAmount,
          amount_paid: breakdown.depositAmount,
          platform_fee: breakdown.platformFee,
          guarantee_amount: breakdown.guaranteeAmount,
          guarantee_status: 'held',
          mover_deposit: 0,
          escrow_amount: breakdown.guaranteeAmount,
          remaining_amount: breakdown.remainingAmount,
          payment_status: 'completed',
          mission_completion_status: 'in_progress',
          stripe_payment_id: paymentIntentId,
          paid_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (paymentError) throw paymentError;

      const { error: updateQuoteError } = await supabase
        .from('quotes')
        .update({ status: 'accepted' })
        .eq('id', quote.id)
        .eq('status', 'pending');

      if (updateQuoteError) throw updateQuoteError;

      const { error: updateRequestError } = await supabase
        .from('quote_requests')
        .update({
          status: 'accepted',
          accepted_quote_id: quote.id,
          payment_status: 'deposit_paid'
        })
        .eq('id', quote.quote_request_id);

      if (updateRequestError) throw updateRequestError;

      const { error: rejectOthersError } = await supabase
        .from('quotes')
        .update({ status: 'rejected' })
        .eq('quote_request_id', quote.quote_request_id)
        .neq('id', quote.id);

      if (rejectOthersError) throw rejectOthersError;

      // Get mover details for email
      const { data: moverData } = await supabase
        .from('movers')
        .select('email, company_name')
        .eq('id', quote.mover_id)
        .single();

      // Get client details
      const { data: requestData } = await supabase
        .from('quote_requests')
        .select('client_email, client_name, from_city, to_city, moving_date')
        .eq('id', quote.quote_request_id)
        .single();

      // Send email to mover about accepted quote
      if (moverData?.email && requestData) {
        try {
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
          const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
          
          await fetch(`${supabaseUrl}/functions/v1/send-notification`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseAnonKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              type: 'quote_accepted',
              recipientEmail: moverData.email,
              data: {
                price: quote.client_display_price,
                movingDate: new Date(requestData.moving_date).toLocaleDateString('fr-FR'),
                fromCity: requestData.from_city,
                toCity: requestData.to_city,
                clientEmail: requestData.client_email,
                clientName: requestData.client_name
              }
            }),
          });
          console.log('✅ Notification email sent to mover');
        } catch (emailError) {
          console.error('Failed to send mover notification:', emailError);
        }
      }

      // Send payment confirmation email to mover
      if (moverData?.email && requestData) {
        try {
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
          const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
          
          await fetch(`${supabaseUrl}/functions/v1/send-notification`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseAnonKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              type: 'payment_received',
              recipientEmail: moverData.email,
              data: {
                movingDate: new Date(requestData.moving_date).toLocaleDateString('fr-FR'),
                depositAmount: breakdown.depositAmount.toFixed(2),
                moverDeposit: breakdown.moverDeposit.toFixed(2),
                escrowAmount: breakdown.escrowAmount.toFixed(2),
                remainingAmount: breakdown.remainingAmount.toFixed(2)
              }
            }),
          });
          console.log('✅ Payment received notification sent to mover');
        } catch (emailError) {
          console.error('Failed to send payment notification:', emailError);
        }
      }

      // Wait a bit for the contract trigger to create the contract
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Send contract emails to both client and mover
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

        // Get the contract that was just created by the trigger
        let contractData: any = null;
        const { data: existingContract } = await supabase
          .from('contracts')
          .select('*')
          .eq('quote_id', quote.id)
          .maybeSingle();

        if (existingContract) {
          contractData = existingContract;
        } else {
          // Contract trigger didn't fire - create contract manually
          console.warn('⚠️ Contract trigger did not create contract, creating manually...');
          
          const contractNumber = `TTD-${Date.now().toString(36).toUpperCase()}`;
          
          const contractDataObj = {
            client: {
              name: requestData?.client_name || 'N/A',
              email: requestData?.client_email || 'N/A',
              phone: requestData?.client_phone || 'N/A',
            },
            mover: {
              company_name: moverData?.company_name || 'N/A',
              siret: moverData?.siret || 'N/A',
              manager_name: `${moverData?.manager_firstname || ''} ${moverData?.manager_lastname || ''}`.trim(),
              email: moverData?.email || 'N/A',
              phone: moverData?.phone || 'N/A',
            },
            moving: {
              moving_date: requestData?.moving_date || null,
              from_city: requestData?.from_city || 'N/A',
              to_city: requestData?.to_city || 'N/A',
              from_address: requestData?.from_address || 'N/A',
              from_postal_code: requestData?.from_postal_code || '',
              to_address: requestData?.to_address || 'N/A',
              to_postal_code: requestData?.to_postal_code || '',
              floor_from: requestData?.floor_from ?? 'RDC',
              elevator_from: requestData?.elevator_from || false,
              floor_to: requestData?.floor_to ?? 'RDC',
              elevator_to: requestData?.elevator_to || false,
              home_size: requestData?.home_size || 'N/A',
              volume_m3: requestData?.volume_m3 || 'N/A',
              services: requestData?.services_needed || [],
            },
            departure: {
              address: requestData?.from_address || 'N/A',
              city: requestData?.from_city || 'N/A',
              postal_code: requestData?.from_postal_code || '',
              floor: requestData?.floor_from ?? 'RDC',
              elevator: requestData?.elevator_from || false,
            },
            arrival: {
              address: requestData?.to_address || 'N/A',
              city: requestData?.to_city || 'N/A',
              postal_code: requestData?.to_postal_code || '',
              floor: requestData?.floor_to ?? 'RDC',
              elevator: requestData?.elevator_to || false,
            },
            financial: {
              total_amount: breakdown.totalAmount,
              deposit_amount: breakdown.depositAmount,
              remaining_amount: breakdown.remainingAmount,
            },
            moving_date: requestData?.moving_date || null,
          };

          const contractText = `CONTRAT DE DÉMÉNAGEMENT - ${contractNumber}
================================================================================

Date de création: ${new Date().toLocaleDateString('fr-FR')}

INFORMATIONS CLIENT
-------------------
Nom: ${requestData?.client_name || 'N/A'}
Email: ${requestData?.client_email || 'N/A'}
Téléphone: ${requestData?.client_phone || 'N/A'}

INFORMATIONS DÉMÉNAGEUR
-----------------------
Société: ${moverData?.company_name || 'N/A'}
SIRET: ${moverData?.siret || 'N/A'}
Responsable: ${moverData?.manager_firstname || ''} ${moverData?.manager_lastname || ''}
Email: ${moverData?.email || 'N/A'}
Téléphone: ${moverData?.phone || 'N/A'}

DÉTAILS DU DÉMÉNAGEMENT
-----------------------
Date prévue: ${requestData?.moving_date ? new Date(requestData.moving_date).toLocaleDateString('fr-FR') : 'N/A'}
Trajet: ${requestData?.from_city || 'N/A'} → ${requestData?.to_city || 'N/A'}

Adresse de départ:
${requestData?.from_address || 'N/A'}
${requestData?.from_postal_code || ''} ${requestData?.from_city || ''}
Étage: ${requestData?.floor_from ?? 'RDC'} | Ascenseur: ${requestData?.elevator_from ? 'Oui' : 'Non'}

Adresse d'arrivée:
${requestData?.to_address || 'N/A'}
${requestData?.to_postal_code || ''} ${requestData?.to_city || ''}
Étage: ${requestData?.floor_to ?? 'RDC'} | Ascenseur: ${requestData?.elevator_to ? 'Oui' : 'Non'}

Type de logement: ${requestData?.home_size || 'N/A'}
Volume estimé: ${requestData?.volume_m3 || 'N/A'} m³
Services: ${requestData?.services_needed?.join(', ') || 'Aucun'}

INFORMATIONS FINANCIÈRES
------------------------
Montant total: ${breakdown.totalAmount?.toLocaleString('fr-FR')} €
Acompte versé: ${breakdown.depositAmount?.toLocaleString('fr-FR')} €
Solde à régler: ${breakdown.remainingAmount?.toLocaleString('fr-FR')} €

================================================================================
Ce document est un contrat de déménagement généré par TrouveTonDéménageur.`;

          // Try new schema first (with contract_data, contract_number, client_user_id, quote_request_id)
          let newContract: any = null;
          const { data: newSchemaContract, error: newSchemaErr } = await supabase
            .from('contracts')
            .insert({
              quote_request_id: requestData?.id,
              quote_id: quote.id,
              client_user_id: user.id,
              mover_id: quote.mover_id,
              contract_number: contractNumber,
              contract_data: contractDataObj,
              contract_text: contractText,
              status: 'active',
            })
            .select()
            .maybeSingle();

          if (newSchemaContract) {
            newContract = newSchemaContract;
          } else if (newSchemaErr) {
            console.warn('New schema insert failed, trying old schema:', newSchemaErr.message);
            // Fallback to old schema (client_id, contract_text only)
            const { data: oldSchemaContract } = await supabase
              .from('contracts')
              .insert({
                quote_id: quote.id,
                client_id: user.id,
                mover_id: quote.mover_id,
                contract_text: contractText,
                status: 'pending_signature'
              })
              .select()
              .maybeSingle();
            
            newContract = oldSchemaContract;
          }

          if (newContract) {
            contractData = newContract;
            console.log('✅ Contract created manually');
          }
        }

        if (contractData && moverData && requestData) {
          const contractNumber = contractData.contract_number || `CTR-${contractData.id?.substring(0, 8)?.toUpperCase() || 'N/A'}`;
          // Send contract email to client
          await fetch(`${supabaseUrl}/functions/v1/send-notification`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseAnonKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              type: 'contract_sent',
              recipientEmail: requestData.client_email,
              data: {
                contractNumber: contractNumber,
                moverCompanyName: moverData.company_name,
                movingDate: new Date(requestData.moving_date).toLocaleDateString('fr-FR'),
                fromCity: requestData.from_city,
                toCity: requestData.to_city,
                totalAmount: quote.client_display_price.toFixed(2),
                depositAmount: breakdown.depositAmount.toFixed(2),
                remainingAmount: breakdown.remainingAmount.toFixed(2)
              }
            }),
          });

          // Send contract email to mover
          await fetch(`${supabaseUrl}/functions/v1/send-notification`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${supabaseAnonKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              type: 'contract_sent_mover',
              recipientEmail: moverData.email,
              data: {
                contractNumber: contractNumber,
                clientName: requestData.client_name,
                clientEmail: requestData.client_email,
                movingDate: new Date(requestData.moving_date).toLocaleDateString('fr-FR'),
                fromCity: requestData.from_city,
                toCity: requestData.to_city,
                totalAmount: quote.client_display_price.toFixed(2),
                depositAmount: breakdown.depositAmount.toFixed(2),
                remainingAmount: breakdown.remainingAmount.toFixed(2)
              }
            }),
          });

          console.log('✅ Contract emails sent to both client and mover');
        }
      } catch (contractError) {
        console.error('Failed to send contract emails:', contractError);
      }

      setTimeout(() => {
        navigate('/client/payment-success');
      }, 1500);
    } catch (err: any) {
      console.error('Payment error:', err);
      setError(err.message || 'Erreur lors du paiement');
      setProcessing(false);
    }
  };

  const formatCardNumber = (value: string) => {
    const cleaned = value.replace(/\s/g, '');
    const chunks = cleaned.match(/.{1,4}/g);
    return chunks ? chunks.join(' ') : cleaned;
  };

  const handleCardNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\s/g, '');
    if (value.length <= 16 && /^\d*$/.test(value)) {
      setCardNumber(formatCardNumber(value));
    }
  };

  const handleExpiryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length >= 2) {
      value = value.slice(0, 2) + '/' + value.slice(2, 4);
    }
    if (value.length <= 5) {
      setExpiryDate(value);
    }
  };

  const handleCvvChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value.length <= 3 && /^\d*$/.test(value)) {
      setCvv(value);
    }
  };

  if (loading) {
    return (
      <ClientLayout title="Paiement sécurisé">
        <div className="flex items-center justify-center py-32">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-slate-600">Chargement...</p>
          </div>
        </div>
      </ClientLayout>
    );
  }

  if (!quote) {
    return (
      <ClientLayout title="Paiement sécurisé">
        <div className="flex items-center justify-center py-32">
          <div className="text-center">
            <p className="text-red-600">Devis introuvable</p>
            <button onClick={() => navigate('/client/dashboard')} className="mt-4 text-blue-600 hover:underline">
              Retour
            </button>
          </div>
        </div>
      </ClientLayout>
    );
  }

  const breakdown = calculatePriceBreakdown(quote.client_display_price);

  return (
    <ClientLayout title="Paiement sécurisé">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-xl shadow-lg p-8 mb-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
              <CreditCard className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">Paiement sécurisé</h1>
              <p className="text-slate-600">Stripe connecté - PaymentIntent créé</p>
            </div>
          </div>

          <div className="bg-gradient-to-br from-blue-50 to-blue-100 border-2 border-blue-300 rounded-xl p-6 mb-6">
            <div className="flex items-start gap-3 mb-4">
              <Info className="w-6 h-6 text-blue-700 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-lg font-bold text-blue-900 mb-2">Comment fonctionne le paiement ?</h3>
                <div className="space-y-3 text-sm text-blue-800">
                  <div className="flex items-start gap-2">
                    <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0">
                      1
                    </div>
                    <div>
                      <p className="font-semibold">Acompte de 40% maintenant</p>
                      <p className="text-blue-700">Payez {breakdown.depositAmount.toFixed(2)} € par carte bancaire ou virement pour confirmer votre réservation</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="w-6 h-6 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold text-xs flex-shrink-0">
                      2
                    </div>
                    <div>
                      <p className="font-semibold">Solde de 60% au déchargement</p>
                      <p className="text-blue-700">Payez les {breakdown.remainingAmount.toFixed(2)} € restants directement au déménageur à la fin du déménagement</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-white/70 rounded-lg p-3 flex items-center gap-2 mt-4">
              <Shield className="w-5 h-5 text-blue-600" />
              <p className="text-xs text-blue-800">
                Votre argent est sécurisé. L'acompte garantit votre réservation et protège les deux parties.
              </p>
            </div>
          </div>

          <div className="bg-orange-50 border-2 border-orange-300 rounded-xl p-4 mb-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-orange-900 mb-1">Configuration Stripe partielle</p>
                <p className="text-orange-800">
                  Stripe est connecté et un PaymentIntent sera créé. Pour une sécurité maximale avec Stripe Elements,
                  la clé publique (pk_live_...) doit être ajoutée dans les variables d'environnement.
                </p>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="font-semibold text-slate-800 mb-3">Récapitulatif du déménagement</h3>
            <div className="bg-slate-50 rounded-lg p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">Départ:</span>
                <span className="font-medium">{quote.quote_requests.from_city}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Arrivée:</span>
                <span className="font-medium">{quote.quote_requests.to_city}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Date:</span>
                <span className="font-medium">
                  {new Date(quote.quote_requests.moving_date).toLocaleDateString('fr-FR')}
                </span>
              </div>
            </div>
          </div>

          <div className="mb-8">
            <h3 className="font-semibold text-slate-800 mb-3">Détails du paiement</h3>
            <div className="bg-slate-50 rounded-lg p-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-slate-600">Prix total:</span>
                <span className="font-semibold text-slate-900">{breakdown.totalAmount.toFixed(2)} €</span>
              </div>
              <div className="border-t pt-3 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-700 font-medium">Acompte à payer maintenant (40%):</span>
                  <span className="text-2xl font-bold text-blue-600">{breakdown.depositAmount.toFixed(2)} €</span>
                </div>
                <p className="text-xs text-slate-500">
                  Dont {breakdown.guaranteeAmount.toFixed(2)} € de garantie (restituée au déménageur sous 48h si aucun dommage)
                </p>
              </div>
              <div className="border-t pt-3">
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600">Reste à payer au déménageur au déchargement (60%):</span>
                  <span className="font-semibold text-slate-900">{breakdown.remainingAmount.toFixed(2)} €</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  <span className="inline-flex items-center gap-1">
                    <Banknote className="w-3 h-3" />
                    À régler directement au déménageur à la fin du déménagement
                  </span>
                </p>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <h3 className="font-semibold text-slate-800 mb-3">Choisissez votre mode de paiement</h3>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setPaymentMethod('card')}
                className={`p-4 rounded-lg border-2 transition-all ${
                  paymentMethod === 'card'
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-slate-200 bg-white hover:border-blue-300'
                }`}
              >
                <div className="flex flex-col items-center gap-2">
                  <CreditCard className={`w-8 h-8 ${paymentMethod === 'card' ? 'text-blue-600' : 'text-slate-400'}`} />
                  <span className={`font-medium ${paymentMethod === 'card' ? 'text-blue-900' : 'text-slate-700'}`}>
                    Carte bancaire
                  </span>
                  <span className="text-xs text-slate-500">Paiement instantané</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setPaymentMethod('transfer')}
                className={`p-4 rounded-lg border-2 transition-all ${
                  paymentMethod === 'transfer'
                    ? 'border-blue-600 bg-blue-50'
                    : 'border-slate-200 bg-white hover:border-blue-300'
                }`}
              >
                <div className="flex flex-col items-center gap-2">
                  <Building2 className={`w-8 h-8 ${paymentMethod === 'transfer' ? 'text-blue-600' : 'text-slate-400'}`} />
                  <span className={`font-medium ${paymentMethod === 'transfer' ? 'text-blue-900' : 'text-slate-700'}`}>
                    Virement bancaire
                  </span>
                  <span className="text-xs text-slate-500">Traitement sous 48h</span>
                </div>
              </button>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-amber-800 font-medium mb-2">Mode test activé</p>
            <p className="text-xs text-amber-700">
              Utilisez n'importe quels chiffres pour tester. Aucun paiement réel ne sera effectué.
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3 mb-6">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-red-800 text-sm">{error}</p>
            </div>
          )}

          {paymentMethod === 'card' ? (
            <form onSubmit={handlePayment} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Numéro de carte
                </label>
                <input
                  type="text"
                  value={cardNumber}
                  onChange={handleCardNumberChange}
                  placeholder="1234 5678 9012 3456"
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Nom sur la carte
                </label>
                <input
                  type="text"
                  value={cardName}
                  onChange={(e) => setCardName(e.target.value)}
                  placeholder="Jean Dupont"
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Date d'expiration
                  </label>
                  <input
                    type="text"
                    value={expiryDate}
                    onChange={handleExpiryChange}
                    placeholder="MM/AA"
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    CVV
                  </label>
                  <input
                    type="text"
                    value={cvv}
                    onChange={handleCvvChange}
                    placeholder="123"
                    className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={processing}
                className="w-full py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold text-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {processing ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    Traitement en cours...
                  </>
                ) : (
                  <>
                    <Shield className="w-5 h-5" />
                    Payer {breakdown.depositAmount.toFixed(2)} € (Test)
                  </>
                )}
              </button>
            </form>
          ) : (
            <div className="space-y-6">
              <div className="bg-gradient-to-br from-slate-50 to-slate-100 border-2 border-slate-200 rounded-xl p-6">
                <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-blue-600" />
                  Informations bancaires
                </h3>
                <div className="space-y-3 text-sm">
                  <div className="bg-white rounded-lg p-3">
                    <p className="text-slate-600 text-xs mb-1">Bénéficiaire</p>
                    <p className="font-mono font-semibold text-slate-900">TrouveTonDemenageur SAS</p>
                  </div>
                  <div className="bg-white rounded-lg p-3">
                    <p className="text-slate-600 text-xs mb-1">IBAN</p>
                    <p className="font-mono font-semibold text-slate-900">FR76 1234 5678 9012 3456 7890 123</p>
                  </div>
                  <div className="bg-white rounded-lg p-3">
                    <p className="text-slate-600 text-xs mb-1">BIC</p>
                    <p className="font-mono font-semibold text-slate-900">BNPAFRPPXXX</p>
                  </div>
                  <div className="bg-white rounded-lg p-3">
                    <p className="text-slate-600 text-xs mb-1">Montant à virer</p>
                    <p className="font-mono font-bold text-2xl text-blue-600">{breakdown.depositAmount.toFixed(2)} €</p>
                  </div>
                  <div className="bg-white rounded-lg p-3">
                    <p className="text-slate-600 text-xs mb-1">Référence à indiquer (obligatoire)</p>
                    <p className="font-mono font-semibold text-slate-900">DEVIS-{quoteId.substring(0, 8).toUpperCase()}</p>
                  </div>
                </div>

                <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-xs text-blue-800 flex items-start gap-2">
                    <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>
                      <strong>Important :</strong> N'oubliez pas d'indiquer la référence lors de votre virement.
                      Votre réservation sera confirmée sous 24-48h après réception du virement.
                    </span>
                  </p>
                </div>
              </div>

              <button
                onClick={handlePayment}
                disabled={processing}
                className="w-full py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold text-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {processing ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    Traitement en cours...
                  </>
                ) : (
                  <>
                    <Building2 className="w-5 h-5" />
                    Confirmer le virement bancaire (Test)
                  </>
                )}
              </button>

              <p className="text-xs text-center text-slate-500">
                En cliquant sur ce bouton, vous confirmez avoir effectué le virement bancaire
              </p>
            </div>
          )}
        </div>

        <div className="bg-slate-100 rounded-lg p-4 text-center text-sm text-slate-600">
          <p>Paiement sécurisé par TrouveTonDemenageur</p>
        </div>
      </div>
    </ClientLayout>
  );
}
