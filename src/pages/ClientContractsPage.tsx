import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Download, Eye, Calendar, MapPin, Euro, Building2, User, ArrowLeft, Search, Filter, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { showToast } from '../utils/toast';
import { generateContractPDF, buildContractPDFData } from '../utils/generateContractPDF';
import { ClientLayout } from '../components/ClientLayout';

interface Contract {
  id: string;
  contract_number?: string;
  contract_text?: string;
  contract_data?: any;
  status: string;
  created_at: string;
  pdf_url?: string | null;
  quote_id?: string;
  client_id?: string;
  mover_id?: string;
}

export default function ClientContractsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    if (user) {
      fetchContracts();
    }
  }, [user]);

  const fetchContracts = async () => {
    try {
      setLoading(true);
      let allContracts: any[] = [];
      
      // Try new schema (client_user_id) first
      const { data: byUserIdNew } = await supabase
        .from('contracts')
        .select('*')
        .eq('client_user_id', user?.id)
        .order('created_at', { ascending: false });
      
      if (byUserIdNew && byUserIdNew.length > 0) {
        allContracts = [...byUserIdNew];
      }

      // Also try old schema (client_id)
      const { data: byUserIdOld } = await supabase
        .from('contracts')
        .select('*')
        .eq('client_id', user?.id)
        .order('created_at', { ascending: false });
      
      if (byUserIdOld && byUserIdOld.length > 0) {
        // Merge without duplicates
        const existingIds = new Set(allContracts.map(c => c.id));
        byUserIdOld.forEach(c => {
          if (!existingIds.has(c.id)) {
            allContracts.push(c);
          }
        });
      }

      // Also try finding contracts via quote_requests owned by this user
      if (allContracts.length === 0) {
        const { data: userRequests } = await supabase
          .from('quote_requests')
          .select('id')
          .eq('client_user_id', user?.id);
        
        if (userRequests && userRequests.length > 0) {
          const requestIds = userRequests.map(r => r.id);
          const { data: byRequestId } = await supabase
            .from('contracts')
            .select('*')
            .in('quote_request_id', requestIds)
            .order('created_at', { ascending: false });
          
          if (byRequestId && byRequestId.length > 0) {
            const existingIds = new Set(allContracts.map(c => c.id));
            byRequestId.forEach(c => {
              if (!existingIds.has(c.id)) {
                allContracts.push(c);
              }
            });
          }
        }
      }

      setContracts(allContracts);
    } catch (error) {
      console.error('Error fetching contracts:', error);
      showToast('Erreur lors du chargement des contrats', 'error');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; color: string }> = {
      active: { label: 'Actif', color: 'bg-green-100 text-green-800' },
      completed: { label: 'Terminé', color: 'bg-blue-100 text-blue-800' },
      cancelled: { label: 'Annulé', color: 'bg-gray-100 text-gray-800' },
      disputed: { label: 'Litige', color: 'bg-red-100 text-red-800' },
    };
    const config = statusConfig[status] || statusConfig.active;
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.color}`}>
        {config.label}
      </span>
    );
  };

  const handleDownloadPDF = async (contract: Contract) => {
    showToast('Génération du PDF en cours...', 'info');
    try {
      // Fetch related data for a complete PDF
      let quoteRequest = null;
      let mover = null;
      let payment = null;
      let quote = null;

      if (contract.quote_id) {
        const { data: q } = await supabase
          .from('quotes')
          .select('*, quote_request:quote_requests(*)')
          .eq('id', contract.quote_id)
          .maybeSingle();
        if (q) {
          quote = q;
          quoteRequest = q.quote_request;
        }

        const { data: m } = await supabase
          .from('movers')
          .select('*')
          .eq('id', contract.mover_id)
          .maybeSingle();
        mover = m;

        const { data: p } = await supabase
          .from('payments')
          .select('*')
          .eq('quote_id', contract.quote_id)
          .maybeSingle();
        payment = p;
      }

      const pdfData = buildContractPDFData(contract, quoteRequest, quote, mover, payment);
      generateContractPDF(pdfData);
      showToast('PDF téléchargé avec succès', 'success');
    } catch (error) {
      console.error('Error generating PDF:', error);
      showToast('Erreur lors de la génération du PDF', 'error');
    }
  };

  const filteredContracts = contracts.filter(contract => {
    const contractNum = contract.contract_number || contract.id?.substring(0, 8) || '';
    const contractText = contract.contract_text || '';
    const cd = contract.contract_data;
    const searchable = [
      contractNum,
      cd?.mover?.company_name || '',
      cd?.departure?.city || '',
      cd?.arrival?.city || '',
      contractText,
    ].join(' ').toLowerCase();
    
    const matchesSearch = searchable.includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || contract.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return (
      <ClientLayout title="Mes Contrats">
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </ClientLayout>
    );
  }

  return (
    <ClientLayout title="Mes Contrats" subtitle={`${contracts.length} contrat${contracts.length > 1 ? 's' : ''}`}>
      <div className="max-w-6xl mx-auto">
        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Rechercher par numéro, déménageur, ville..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-5 h-5 text-gray-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">Tous les statuts</option>
                <option value="active">Actif</option>
                <option value="completed">Terminé</option>
                <option value="cancelled">Annulé</option>
                <option value="disputed">Litige</option>
              </select>
            </div>
          </div>
        </div>

        {/* Contracts List */}
        {filteredContracts.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
            <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Aucun contrat</h3>
            <p className="text-gray-600">
              {searchTerm || statusFilter !== 'all' 
                ? 'Aucun contrat ne correspond à vos critères de recherche.'
                : 'Vos contrats apparaîtront ici après acceptation d\'un devis.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredContracts.map((contract) => (
              <div
                key={contract.id}
                className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition"
              >
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900">
                          {contract.contract_number || `CTR-${contract.id?.substring(0, 8)?.toUpperCase()}`}
                        </h3>
                        {getStatusBadge(contract.status)}
                      </div>
                      <div className="flex items-center gap-4 text-sm text-gray-600">
                        {contract.contract_data?.moving_date && (
                          <span className="flex items-center gap-1">
                            <Calendar className="w-4 h-4" />
                            {new Date(contract.contract_data.moving_date).toLocaleDateString('fr-FR')}
                          </span>
                        )}
                        {contract.contract_data?.mover?.company_name && (
                          <span className="flex items-center gap-1">
                            <Building2 className="w-4 h-4" />
                            {contract.contract_data.mover.company_name}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      {contract.contract_data?.financial?.total_amount ? (
                        <>
                          <div className="text-2xl font-bold text-gray-900">
                            {contract.contract_data.financial.total_amount.toLocaleString('fr-FR')} €
                          </div>
                          <div className="text-xs text-gray-500">Montant total</div>
                        </>
                      ) : (
                        <div className="text-sm text-gray-400">—</div>
                      )}
                    </div>
                  </div>

                  {(contract.contract_data?.departure?.city || contract.contract_data?.arrival?.city) && (
                    <div className="flex items-center gap-2 text-sm text-gray-600 mb-4">
                      <MapPin className="w-4 h-4 text-blue-600" />
                      <span>{contract.contract_data?.departure?.city || '?'}</span>
                      <span>→</span>
                      <span>{contract.contract_data?.arrival?.city || '?'}</span>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                    <div className="text-xs text-gray-500">
                      Créé le {new Date(contract.created_at).toLocaleDateString('fr-FR')}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setSelectedContract(contract)}
                        className="flex items-center gap-2 px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg transition"
                      >
                        <Eye className="w-4 h-4" />
                        Voir détails
                      </button>
                      <button
                        onClick={() => handleDownloadPDF(contract)}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                      >
                        <Download className="w-4 h-4" />
                        Télécharger PDF
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Contract Detail Modal */}
        {selectedContract && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">
                    Contrat {selectedContract.contract_number || `CTR-${selectedContract.id?.substring(0, 8)?.toUpperCase()}`}
                  </h2>
                  <p className="text-gray-600">Détails complets du contrat</p>
                </div>
                <button
                  onClick={() => setSelectedContract(null)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition"
                >
                  ✕
                </button>
              </div>

              <div className="p-6 space-y-6">
                {/* Contract text (old schema) or structured data (new schema) */}
                {selectedContract.contract_text && !selectedContract.contract_data && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="font-semibold text-gray-900 mb-3">Contenu du contrat</h3>
                    <pre className="text-sm whitespace-pre-wrap font-mono text-gray-700">{selectedContract.contract_text}</pre>
                  </div>
                )}

                {/* Client Info */}
                {selectedContract.contract_data?.client && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <User className="w-5 h-5 text-blue-600" />
                    Vos informations
                  </h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Nom:</span>
                      <span className="ml-2 font-medium">{selectedContract.contract_data?.client?.name || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Email:</span>
                      <span className="ml-2 font-medium">{selectedContract.contract_data?.client?.email || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Téléphone:</span>
                      <span className="ml-2 font-medium">{selectedContract.contract_data?.client?.phone || 'N/A'}</span>
                    </div>
                  </div>
                </div>
                )}

                {/* Mover Info */}
                {selectedContract.contract_data?.mover && (
                <div className="bg-blue-50 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-blue-600" />
                    Déménageur
                  </h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Entreprise:</span>
                      <span className="ml-2 font-medium">{selectedContract.contract_data?.mover?.company_name || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">SIRET:</span>
                      <span className="ml-2 font-medium">{selectedContract.contract_data?.mover?.siret || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Responsable:</span>
                      <span className="ml-2 font-medium">{selectedContract.contract_data?.mover?.manager_name || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">Téléphone:</span>
                      <span className="ml-2 font-medium">{selectedContract.contract_data?.mover?.phone || 'N/A'}</span>
                    </div>
                    <div className="col-span-2">
                      <span className="text-gray-500">Email:</span>
                      <span className="ml-2 font-medium">{selectedContract.contract_data?.mover?.email || 'N/A'}</span>
                    </div>
                  </div>
                </div>
                )}

                {/* Addresses */}
                {(selectedContract.contract_data?.departure || selectedContract.contract_data?.arrival) && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-green-50 rounded-lg p-4">
                    <h3 className="font-semibold text-gray-900 mb-3">📍 Départ</h3>
                    <div className="text-sm space-y-1">
                      <p className="font-medium">{selectedContract.contract_data?.departure?.address || 'N/A'}</p>
                      <p>{selectedContract.contract_data?.departure?.postal_code || ''} {selectedContract.contract_data?.departure?.city || ''}</p>
                      <p className="text-gray-500">
                        Étage: {selectedContract.contract_data?.departure?.floor || 'RDC'} | 
                        Ascenseur: {selectedContract.contract_data?.departure?.elevator ? 'Oui' : 'Non'}
                      </p>
                    </div>
                  </div>
                  <div className="bg-orange-50 rounded-lg p-4">
                    <h3 className="font-semibold text-gray-900 mb-3">📍 Arrivée</h3>
                    <div className="text-sm space-y-1">
                      <p className="font-medium">{selectedContract.contract_data?.arrival?.address || 'N/A'}</p>
                      <p>{selectedContract.contract_data?.arrival?.postal_code || ''} {selectedContract.contract_data?.arrival?.city || ''}</p>
                      <p className="text-gray-500">
                        Étage: {selectedContract.contract_data?.arrival?.floor || 'RDC'} | 
                        Ascenseur: {selectedContract.contract_data?.arrival?.elevator ? 'Oui' : 'Non'}
                      </p>
                    </div>
                  </div>
                </div>
                )}

                {/* Financial */}
                {selectedContract.contract_data?.financial && (
                <div className="bg-slate-50 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                    <Euro className="w-5 h-5 text-green-600" />
                    Détails financiers
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Montant total</span>
                      <span className="font-bold">{selectedContract.contract_data?.financial?.total_amount?.toLocaleString('fr-FR') || '—'} €</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Acompte versé</span>
                      <span className="font-medium text-green-600">{selectedContract.contract_data?.financial?.deposit_amount?.toLocaleString('fr-FR') || '—'} €</span>
                    </div>
                    <hr className="my-2" />
                    <div className="flex justify-between">
                      <span className="text-gray-600">Solde à payer au déménageur</span>
                      <span className="font-bold text-blue-600">{selectedContract.contract_data?.financial?.remaining_amount?.toLocaleString('fr-FR') || '—'} €</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      * Le solde est à régler directement au déménageur le jour du déménagement (espèces ou virement)
                    </p>
                  </div>
                </div>
                )}

                {/* Services */}
                {selectedContract.contract_data?.services && selectedContract.contract_data.services.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-3">Services inclus</h3>
                    <div className="flex flex-wrap gap-2">
                      {selectedContract.contract_data?.services?.map((service: string, idx: number) => (
                        <span key={idx} className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm">
                          {service}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-3 pt-4 border-t">
                  <button
                    onClick={() => handleDownloadPDF(selectedContract)}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-semibold"
                  >
                    <Download className="w-5 h-5" />
                    Télécharger le contrat PDF
                  </button>
                  <button
                    onClick={() => setSelectedContract(null)}
                    className="px-6 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
                  >
                    Fermer
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </ClientLayout>
  );
}
