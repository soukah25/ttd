import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { type, recipientEmail, data } = await req.json();

    if (!type || !recipientEmail) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: type, recipientEmail" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let subject = "";
    let htmlContent = "";

    switch (type) {
      case "quote_request_submitted":
        subject = "Bienvenue sur TrouveTonDéménageur - Votre demande a été envoyée!";
        htmlContent = `
          <h2>Bienvenue sur TrouveTonDéménageur!</h2>
          <p>Bonjour,</p>
          <p>Merci d'avoir choisi TrouveTonDéménageur! Nous avons bien reçu votre demande de déménagement.</p>

          <h3>📦 Récapitulatif de votre demande:</h3>

          <p><strong>📅 Date du déménagement:</strong> ${data.movingDate}</p>

          <p><strong>📍 Adresse de départ:</strong><br>
          ${data.fromAddress}<br>
          ${data.fromCity}</p>

          <p><strong>📍 Adresse d'arrivée:</strong><br>
          ${data.toAddress}<br>
          ${data.toCity}</p>

          <p><strong>🏠 Logement de départ:</strong> ${data.propertyType}${data.fromSurface ? ` (${data.fromSurface} m²)` : ''}<br>
          ${data.floorFrom ? `Étage: ${data.floorFrom}${data.elevatorFrom ? ' - Avec ascenseur' : ' - Sans ascenseur'}` : ''}</p>

          <p><strong>🏠 Logement d'arrivée:</strong> ${data.propertyType}${data.toSurface ? ` (${data.toSurface} m²)` : ''}<br>
          ${data.floorTo ? `Étage: ${data.floorTo}${data.elevatorTo ? ' - Avec ascenseur' : ' - Sans ascenseur'}` : ''}</p>

          <p><strong>📊 Volume estimé:</strong> ${data.volume} m³</p>

          ${data.servicesNeeded && data.servicesNeeded.length > 0 ? `
            <p><strong>✨ Services demandés:</strong></p>
            <ul>
              ${data.servicesNeeded.map((s: string) => `<li>${s}</li>`).join('')}
            </ul>
          ` : ''}

          ${data.additionalInfo ? `
            <p><strong>💬 Informations complémentaires:</strong><br>
            ${data.additionalInfo}</p>
          ` : ''}

          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">

          <h3>📬 Prochaines étapes:</h3>
          <ul>
            <li>✅ Votre demande est maintenant visible par nos déménageurs professionnels vérifiés</li>
            <li>📨 Vous recevrez des propositions de devis par email sous 24-48 heures</li>
            <li>💰 Comparez les offres et choisissez celle qui vous convient</li>
            <li>🔒 Paiement 100% sécurisé avec protection IA anti-litiges</li>
          </ul>

          <p style="margin-top: 30px;"><strong>💡 Conseil:</strong> Connectez-vous régulièrement à votre espace client pour suivre les devis reçus et échanger avec les déménageurs.</p>

          <p style="margin-top: 30px;">Merci de votre confiance!</p>
          <p>Cordialement,<br>L'équipe TrouveTonDéménageur</p>
        `;
        break;

      case "quote_received":
        subject = "Nouveau devis reçu pour votre déménagement";
        htmlContent = `
          <h2>Vous avez reçu un nouveau devis</h2>
          <p>Bonjour,</p>
          <p>La société <strong>${data.moverName}</strong> vient de vous envoyer une proposition pour votre déménagement.</p>
          <p><strong>Montant du devis: ${data.price} €</strong></p>
          <p>${data.message || ''}</p>
          <p>Connectez-vous à votre espace client pour consulter tous les détails et accepter ce devis.</p>
          <p>Cordialement,<br>L'équipe TrouveTonDéménageur</p>
        `;
        break;

      case "quote_accepted":
        subject = "Votre devis a été accepté";
        htmlContent = `
          <h2>Félicitations! Votre devis a été accepté</h2>
          <p>Bonjour,</p>
          <p>Le client a accepté votre devis de <strong>${data.price} €</strong> pour le déménagement du <strong>${data.movingDate}</strong>.</p>
          <p><strong>Informations:</strong></p>
          <ul>
            <li>De: ${data.fromCity}</li>
            <li>Vers: ${data.toCity}</li>
            <li>Contact client: ${data.clientEmail}</li>
          </ul>
          <p>Le client va procéder au paiement de l'acompte. Vous recevrez une confirmation une fois le paiement effectué.</p>
          <p>Cordialement,<br>L'équipe TrouveTonDéménageur</p>
        `;
        break;

      case "payment_received":
        subject = "Paiement de l'acompte confirmé";
        htmlContent = `
          <h2>L'acompte a été reçu</h2>
          <p>Bonjour,</p>
          <p>Le client a effectué le paiement de l'acompte pour le déménagement du <strong>${data.movingDate}</strong>.</p>
          <p><strong>Détails du paiement:</strong></p>
          <ul>
            <li>Montant de l'acompte: ${data.depositAmount} €</li>
            <li>Votre acompte immédiat: ${data.moverDeposit} €</li>
            <li>Montant en escrow: ${data.escrowAmount} €</li>
            <li>Solde à recevoir directement: ${data.remainingAmount} €</li>
          </ul>
          <p>L'acompte de ${data.moverDeposit} € a été crédité sur votre compte. Le montant escrow de ${data.escrowAmount} € sera libéré après la fin du déménagement.</p>
          <p>Cordialement,<br>L'équipe TrouveTonDéménageur</p>
        `;
        break;

      case "contract_sent":
        subject = `📄 Votre lettre de mission - Contrat n°${data.contractNumber}`;
        htmlContent = `
          <h2>Votre lettre de mission</h2>
          <p>Bonjour,</p>
          <p>Félicitations ! Votre déménagement est confirmé. Voici les détails de votre lettre de mission (contrat).</p>
          
          <div style="background: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6;">
            <h3 style="margin-top: 0; color: #1e40af;">📋 Contrat n°${data.contractNumber}</h3>
            <p><strong>Déménageur:</strong> ${data.moverCompanyName}</p>
            <p><strong>Date du déménagement:</strong> ${data.movingDate}</p>
            <p><strong>Trajet:</strong> ${data.fromCity} → ${data.toCity}</p>
          </div>
          
          <h3>💰 Détails financiers</h3>
          <ul>
            <li><strong>Montant total:</strong> ${data.totalAmount} €</li>
            <li><strong>Acompte versé:</strong> ${data.depositAmount} €</li>
            <li><strong>Solde à payer au déménageur:</strong> ${data.remainingAmount} €</li>
          </ul>
          
          <p style="background: #fef3c7; padding: 15px; border-radius: 8px;">
            ⚠️ <strong>Important:</strong> Le solde de ${data.remainingAmount} € sera à régler directement au déménageur le jour du déménagement (espèces ou virement).
          </p>
          
          <p>Vous pouvez télécharger votre contrat en PDF depuis votre espace client.</p>
          
          <p>Cordialement,<br>L'équipe TrouveTonDéménageur</p>
        `;
        break;

      case "contract_sent_mover":
        subject = `📄 Nouvelle mission confirmée - Contrat n°${data.contractNumber}`;
        htmlContent = `
          <h2>Nouvelle mission de déménagement</h2>
          <p>Bonjour,</p>
          <p>Félicitations ! Un client vient de confirmer sa réservation avec vous. Voici les détails de la mission.</p>
          
          <div style="background: #ecfdf5; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
            <h3 style="margin-top: 0; color: #065f46;">📋 Contrat n°${data.contractNumber}</h3>
            <p><strong>Client:</strong> ${data.clientName}</p>
            <p><strong>Email client:</strong> ${data.clientEmail}</p>
            <p><strong>Date du déménagement:</strong> ${data.movingDate}</p>
            <p><strong>Trajet:</strong> ${data.fromCity} → ${data.toCity}</p>
          </div>
          
          <h3>💰 Détails financiers</h3>
          <ul>
            <li><strong>Montant total:</strong> ${data.totalAmount} €</li>
            <li><strong>Acompte versé par le client:</strong> ${data.depositAmount} €</li>
            <li><strong>Solde que vous recevrez du client:</strong> ${data.remainingAmount} €</li>
          </ul>
          
          <p style="background: #dbeafe; padding: 15px; border-radius: 8px;">
            💡 <strong>À noter:</strong> Le client vous paiera le solde de ${data.remainingAmount} € directement le jour du déménagement.
          </p>
          
          <p>Vous pouvez télécharger la lettre de mission depuis votre espace déménageur.</p>
          
          <p>Cordialement,<br>L'équipe TrouveTonDéménageur</p>
        `;
        break;

      case "move_started":
        subject = "Votre déménagement a commencé";
        htmlContent = `
          <h2>Votre déménagement est en cours</h2>
          <p>Bonjour,</p>
          <p>Le déménageur a commencé votre déménagement.</p>
          <p>Vous pouvez suivre la progression en temps réel depuis votre espace client.</p>
          <p><strong>N'oubliez pas:</strong> Prenez des photos avant et après le déménagement pour documenter l'état de vos biens.</p>
          <p>Cordialement,<br>L'équipe TrouveTonDéménageur</p>
        `;
        break;

      case "move_completed":
        subject = "Déménagement terminé - Merci de confirmer";
        htmlContent = `
          <h2>Votre déménagement est terminé</h2>
          <p>Bonjour,</p>
          <p>Le déménageur a indiqué que votre déménagement est terminé.</p>
          <p>Merci de:</p>
          <ul>
            <li>Vérifier l'état de tous vos biens</li>
            <li>Prendre des photos après le déménagement</li>
            <li>Signaler tout dommage éventuel dans les 24 heures</li>
            <li>Effectuer le paiement du solde au déménageur</li>
          </ul>
          <p>Si tout s'est bien passé, l'escrow sera libéré automatiquement au déménageur dans 48 heures.</p>
          <p>Cordialement,<br>L'équipe TrouveTonDéménageur</p>
        `;
        break;

      case "damage_reported":
        subject = "Rapport de dommage soumis";
        htmlContent = `
          <h2>Un rapport de dommage a été soumis</h2>
          <p>Bonjour,</p>
          <p>Un rapport de dommage a été créé pour le déménagement du <strong>${data.movingDate}</strong>.</p>
          <p><strong>Détails:</strong></p>
          <ul>
            <li>Description: ${data.description}</li>
            <li>Sévérité: ${data.severity}</li>
            <li>Date: ${new Date().toLocaleDateString('fr-FR')}</li>
          </ul>
          <p>Notre équipe va examiner le rapport et vous contacter sous 24-48 heures.</p>
          <p>Cordialement,<br>L'équipe TrouveTonDéménageur</p>
        `;
        break;

      case "escrow_released":
        subject = "Escrow libéré - Paiement transféré";
        htmlContent = `
          <h2>L'escrow a été libéré</h2>
          <p>Bonjour,</p>
          <p>L'escrow de <strong>${data.escrowAmount} €</strong> a été libéré et transféré sur votre compte.</p>
          <p>Le déménagement du ${data.movingDate} est maintenant complètement finalisé.</p>
          <p>Merci d'avoir utilisé TrouveTonDéménageur!</p>
          <p>Cordialement,<br>L'équipe TrouveTonDéménageur</p>
        `;
        break;

      case "contract_signature_request":
        subject = "Signature de contrat requise";
        htmlContent = `
          <h2>Veuillez signer le contrat de déménagement</h2>
          <p>Bonjour,</p>
          <p>Le contrat de déménagement pour le <strong>${data.movingDate}</strong> est prêt et attend votre signature électronique.</p>
          <p><strong>Montant du devis: ${data.price} €</strong></p>
          <p>Connectez-vous à votre espace pour consulter et signer le contrat en ligne.</p>
          <p>La signature électronique est conforme à la réglementation eIDAS et a la même valeur juridique qu'une signature manuscrite.</p>
          <p>Cordialement,<br>L'équipe TrouveTonDéménageur</p>
        `;
        break;

      case "contract_fully_signed":
        subject = "Contrat signé - Déménagement confirmé";
        htmlContent = `
          <h2>Contrat entièrement signé</h2>
          <p>Bonjour,</p>
          <p>Le contrat de déménagement a été signé par toutes les parties.</p>
          <p><strong>Détails:</strong></p>
          <ul>
            <li>Date du déménagement: ${data.movingDate}</li>
            <li>Montant: ${data.price} €</li>
            <li>De: ${data.fromCity}</li>
            <li>Vers: ${data.toCity}</li>
          </ul>
          <p>Vous pouvez télécharger une copie du contrat signé depuis votre espace client.</p>
          <p>Cordialement,<br>L'équipe TrouveTonDéménageur</p>
        `;
        break;

      case "document_verified":
        subject = "Document vérifié avec succès";
        htmlContent = `
          <h2>Votre document a été vérifié</h2>
          <p>Bonjour,</p>
          <p>Votre <strong>${data.documentType}</strong> a été vérifié avec succès.</p>
          <p><strong>Statut:</strong> Vérifié</p>
          <p>Confiance: ${data.confidence}%</p>
          <p>Vous pouvez maintenant continuer à utiliser nos services.</p>
          <p>Cordialement,<br>L'équipe TrouveTonDéménageur</p>
        `;
        break;

      case "document_rejected":
        subject = "Document rejeté - Action requise";
        htmlContent = `
          <h2>Votre document a été rejeté</h2>
          <p>Bonjour,</p>
          <p>Votre <strong>${data.documentType}</strong> n'a pas pu être vérifié automatiquement.</p>
          <p><strong>Raison:</strong> ${data.rejectionReason}</p>
          <p>Veuillez:</p>
          <ul>
            <li>Vérifier que le document est valide et non expiré</li>
            <li>S'assurer que la photo est claire et lisible</li>
            <li>Télécharger un nouveau document de meilleure qualité</li>
          </ul>
          <p>Si vous pensez qu'il s'agit d'une erreur, contactez notre support.</p>
          <p>Cordialement,<br>L'équipe TrouveTonDéménageur</p>
        `;
        break;

      case "fraud_alert":
        subject = "⚠️ Alerte de sécurité - Action requise";
        htmlContent = `
          <h2>Alerte de sécurité sur votre compte</h2>
          <p>Bonjour,</p>
          <p>Nous avons détecté une activité suspecte sur votre compte.</p>
          <p><strong>Type d'alerte:</strong> ${data.alertType}</p>
          <p><strong>Sévérité:</strong> ${data.severity}</p>
          <p>Par mesure de sécurité, certaines fonctionnalités de votre compte peuvent être temporairement limitées.</p>
          <p>Notre équipe examine cette alerte et vous contactera sous 24-48 heures.</p>
          <p>Si vous pensez qu'il s'agit d'une erreur, contactez immédiatement notre support.</p>
          <p>Cordialement,<br>L'équipe TrouveTonDéménageur</p>
        `;
        break;

      case "review_request":
        subject = "Donnez votre avis sur votre déménagement";
        htmlContent = `
          <h2>Comment s'est passé votre déménagement?</h2>
          <p>Bonjour,</p>
          <p>Votre déménagement du ${data.movingDate} avec <strong>${data.moverName}</strong> est terminé.</p>
          <p>Votre avis nous intéresse! Prenez quelques minutes pour évaluer votre expérience:</p>
          <ul>
            <li>Ponctualité</li>
            <li>Professionnalisme</li>
            <li>Soin des biens</li>
            <li>Rapport qualité-prix</li>
          </ul>
          <p>Votre retour aide d'autres clients à faire le bon choix et permet aux déménageurs d'améliorer leurs services.</p>
          <p>Merci de votre confiance!</p>
          <p>Cordialement,<br>L'équipe TrouveTonDéménageur</p>
        `;
        break;

      case "mover_registration_received":
        subject = "Inscription reçue - Vérification en cours";
        htmlContent = `
          <h2>Merci pour votre inscription !</h2>
          <p>Bonjour ${data.company_name ? data.company_name : ''},</p>
          <p>Nous avons bien reçu votre demande d'adhésion en tant que déménageur professionnel sur TrouveTonDéménageur.</p>
          <p><strong>Prochaines étapes :</strong></p>
          <ul>
            <li>✓ Votre dossier est maintenant en cours de vérification par notre équipe</li>
            <li>Nous examinerons vos informations et documents sous 48 heures ouvrées</li>
            <li>Vous recevrez un email de confirmation dès validation de votre compte</li>
            <li>Vous pourrez alors accéder aux demandes de devis et développer votre activité</li>
          </ul>
          <p>Notre équipe vérifie notamment :</p>
          <ul>
            <li>Votre extrait KBIS</li>
            <li>Votre attestation d'assurance professionnelle</li>
            <li>Votre pièce d'identité</li>
            <li>Les cartes grises de vos véhicules</li>
          </ul>
          <p>Vous recevrez des notifications à chaque étape de validation.</p>
          <p>Si vous avez des questions, n'hésitez pas à nous contacter.</p>
          <p>Cordialement,<br>L'équipe TrouveTonDéménageur</p>
        `;
        break;

      case "mover_approval":
        subject = "Votre profil déménageur a été approuvé";
        htmlContent = `
          <h2>Bienvenue sur TrouveTonDéménageur!</h2>
          <p>Bonjour,</p>
          <p>Votre inscription en tant que déménageur professionnel a été approuvée.</p>
          <p>Vous pouvez maintenant:</p>
          <ul>
            <li>Consulter les demandes de devis</li>
            <li>Envoyer des propositions aux clients</li>
            <li>Gérer vos déménagements</li>
            <li>Recevoir des paiements sécurisés</li>
          </ul>
          <p><strong>Commission:</strong> 30% sur chaque paiement (versement immédiat de 10%, escrow de 20%)</p>
          <p>Connectez-vous à votre espace pour commencer!</p>
          <p>Cordialement,<br>L'équipe TrouveTonDéménageur</p>
        `;
        break;

      case "return_trip_opportunity":
        subject = "🚚 Opportunité de retour - Évitez le retour à vide!";
        htmlContent = `
          <h2>Nouvelle opportunité de retour!</h2>
          <p>Bonjour,</p>
          <p>Bonne nouvelle! Un déménagement correspond à votre itinéraire de retour.</p>
          <p><strong>Votre déménagement prévu:</strong></p>
          <ul>
            <li>Arrivée à: <strong>${data.yourArrivalCity}</strong></li>
            <li>Date d'arrivée estimée: <strong>${data.yourArrivalDate}</strong></li>
          </ul>
          <p><strong>Nouveau déménagement disponible:</strong></p>
          <ul>
            <li>Départ de: <strong>${data.newDepartureCity}</strong> (${data.newDeparturePostalCode})</li>
            <li>Arrivée à: <strong>${data.newArrivalCity}</strong> (${data.newArrivalPostalCode})</li>
            <li>Date: <strong>${data.newMovingDate}</strong></li>
            <li>Type: ${data.homeSize}</li>
            ${data.volumeM3 ? `<li>Volume: ${data.volumeM3} m³</li>` : ''}
          </ul>
          <p>🎯 <strong>Optimisez votre rentabilité en évitant le retour à vide!</strong></p>
          <p>Connectez-vous rapidement pour consulter cette demande et soumettre votre devis.</p>
          <p>Cordialement,<br>L'équipe TrouveTonDéménageur</p>
        `;
        break;

      case "activity_zone_new_quote":
        subject = "📍 Nouvelle demande dans votre zone d'activité";
        htmlContent = `
          <h2>Nouvelle demande de déménagement</h2>
          <p>Bonjour,</p>
          <p>Une nouvelle demande de devis correspond à votre zone d'activité.</p>
          <p><strong>Détails du déménagement:</strong></p>
          <ul>
            <li>Départ: <strong>${data.fromCity}</strong> (${data.fromPostalCode})</li>
            <li>Arrivée: <strong>${data.toCity}</strong> (${data.toPostalCode})</li>
            <li>Date: <strong>${data.movingDate}</strong></li>
            <li>Type de bien: ${data.homeSize}</li>
            ${data.volumeM3 ? `<li>Volume: ${data.volumeM3} m³</li>` : ''}
            ${data.surfaceM2 ? `<li>Surface: ${data.surfaceM2} m²</li>` : ''}
          </ul>
          ${data.servicesNeeded && data.servicesNeeded.length > 0 ? `
            <p><strong>Services demandés:</strong></p>
            <ul>
              ${data.servicesNeeded.map((s: string) => `<li>${s}</li>`).join('')}
            </ul>
          ` : ''}
          <p>Connectez-vous pour consulter tous les détails et soumettre votre devis.</p>
          <p>⏱️ <strong>Soyez rapide!</strong> Les premiers devis ont plus de chances d'être acceptés.</p>
          <p>Cordialement,<br>L'équipe TrouveTonDéménageur</p>
        `;
        break;

      case "quote_update":
        subject = "🔄 Demande de déménagement modifiée";
        htmlContent = `
          <h2>Une demande a été modifiée</h2>
          <p>Bonjour,</p>
          <p>${data.modifiedBy === 'admin' ? 'Un administrateur' : 'Le client'} a modifié la demande de déménagement pour laquelle vous avez soumis un devis.</p>
          <p><strong>Détails actualisés du déménagement:</strong></p>
          <ul>
            <li>Départ: <strong>${data.fromCity}</strong> (${data.fromPostalCode})</li>
            <li>Arrivée: <strong>${data.toCity}</strong> (${data.toPostalCode})</li>
            <li>Date: <strong>${data.movingDate}</strong></li>
            <li>Type de bien: ${data.homeSize}</li>
            ${data.volumeM3 ? `<li>Volume: ${data.volumeM3} m³</li>` : ''}
            ${data.surfaceM2 ? `<li>Surface: ${data.surfaceM2} m²</li>` : ''}
          </ul>
          ${data.servicesNeeded && data.servicesNeeded.length > 0 ? `
            <p><strong>Services demandés:</strong></p>
            <ul>
              ${data.servicesNeeded.map((s: string) => `<li>${s}</li>`).join('')}
            </ul>
          ` : ''}
          <p>⚠️ <strong>Action requise:</strong> Veuillez vérifier votre devis et l'ajuster si nécessaire pour tenir compte de ces modifications.</p>
          <p>Connectez-vous à votre espace déménageur pour consulter tous les détails et modifier votre proposition.</p>
          <p>Cordialement,<br>L'équipe TrouveTonDéménageur</p>
        `;
        break;

      default:
        return new Response(
          JSON.stringify({ error: "Unknown notification type" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    
    if (!resendApiKey) {
      console.log("Email notification (dev mode):");
      console.log("To:", recipientEmail);
      console.log("Subject:", subject);
      console.log("Content:", htmlContent);
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Email logged (dev mode - no API key configured)",
          preview: { subject, to: recipientEmail }
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "TrouveTonDéménageur <noreply@trouvetondemenageur.fr>",
        to: [recipientEmail],
        subject: subject,
        html: htmlContent,
      }),
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error("Resend API error:", errorText);
      throw new Error("Failed to send email");
    }

    const emailResult = await emailResponse.json();

    return new Response(
      JSON.stringify({
        success: true,
        emailId: emailResult.id,
        message: "Notification sent successfully",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in send-notification:", error);
    
    return new Response(
      JSON.stringify({ 
        error: error.message,
        details: "Failed to send notification"
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});