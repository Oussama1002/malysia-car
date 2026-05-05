# Guide Client — DriveFlow OS

**Version** : Production 1.0  
**URL d'accès** : http://79.143.180.186:8080  
**Public visé** : Direction, Gestionnaires, Agents commerciaux, Comptables, Responsables flotte

---

## 1. Démarrage rapide

### 1.1 Se connecter

1. Ouvrez votre navigateur (Chrome, Firefox ou Edge récent).
2. Allez sur **http://79.143.180.186:8080/login**
3. Saisissez votre **admin@driveflow.local** et votre **Driveflow!2026#Admin**.
4. Cliquez sur **Se connecter**.

> Si vous oubliez votre mot de passe, cliquez sur **Mot de passe oublié** puis suivez le lien reçu par e-mail.

### 1.2 Première connexion (administrateur)

À la première connexion :
1. Allez dans **Profil** (icône en haut à droite).
2. Cliquez sur **Modifier** → **Changer le mot de passe**.
3. Saisissez un mot de passe fort (12 caractères, majuscules, chiffres, symboles).
4. Sauvegardez.

### 1.3 Naviguer dans l'application

- **Barre latérale** (à gauche) : accès aux modules métier.
- **En-tête** : recherche globale, notifications, profil.
- **Fil d'Ariane** : indique votre position dans l'application.
- **Boutons d'action** (en haut à droite) : créer, exporter, filtrer.

---

## 2. Tableau de bord (Direction)

### 2.1 Cockpit exécutif (`/dashboard`)

Vue d'ensemble en temps réel : KPIs stratégiques, trésorerie prévisionnelle, risque client, santé de la flotte.

**KPIs principaux** :
- **Valeur du parc** — Valeur nette comptable des véhicules actifs.
- **CA mensuel** — Loyers + mensualités encaissés.
- **Taux d'impayés** — % d'échéances en retard (objectif < 3 %).
- **Prévision cash 30j** — Trésorerie prévisionnelle (scénario central).
- **Rentabilité / véhicule** — Marge opérationnelle moyenne.
- **Rentabilité / client** — Valeur vie client moyenne.

**Filtres** :
- Période (7 jours, 30 jours, 90 jours, YTD).
- Agence (toutes les agences ou agence spécifique).

**Graphiques** :
- Encaissements (courbe + scénarios pire/central/optimiste).
- Mix contrats (camembert).
- Tendance taux d'impayés.
- Occupation véhicules.
- Charges maintenance.

### 2.2 Tableaux de bord spécialisés

| URL | Public | Contenu |
|---|---|---|
| `/dashboard/finance` | Comptable, Direction | CA, encaissements, créances, trésorerie. |
| `/dashboard/risk` | Direction, Crédit | Impayés, scoring, dossiers à risque. |
| `/dashboard/fleet` | Gestionnaire flotte | Occupation, maintenance, kilométrages. |

---

## 3. Flotte automobile (`/fleet`)

### 3.1 Liste des véhicules

Affichage de **tous les véhicules** avec filtres : statut (DISPONIBLE, LOUÉ, EN MAINTENANCE, etc.), agence, marque, modèle.

**Actions** :
- **Voir fiche** → détails + historique du véhicule.
- **Nouveau Véhicule** → ajout d'un véhicule au parc.
- **Export CSV** → exporter la liste filtrée.

### 3.2 Ajouter un nouveau véhicule

1. Cliquez sur **+ Nouveau Véhicule**.
2. Remplissez le formulaire :
   - **Identification** : Plaque, VIN, année, couleur.
   - **Marque & Modèle** : sélectionnez dans la liste, ou cliquez sur **+ Ajouter** pour créer une nouvelle marque/modèle.
   - **Caractéristiques** : carburant, transmission, puissance, places.
   - **Achat** : prix, date, fournisseur, immatriculation.
   - **Affectation** : agence, statut initial.
3. Cliquez sur **Enregistrer**.

### 3.3 Fiche véhicule (`/fleet/:id`)

La fiche véhicule centralise toutes les informations d'un véhicule :

- **Identité & Photo** — image principale, plaque, VIN, marque/modèle.
- **Statut & Disponibilité** — DISPONIBLE / LOUÉ / EN MAINTENANCE / ACCIDENTÉ.
- **Historique de statut** — chronologie complète.
- **Maintenance** — interventions, plans préventifs, alertes kilométrages.
- **Compliance** — vignette, assurance, contrôle technique (avec alertes d'expiration).
- **Documents** — carte grise, contrat d'achat, photos d'état.
- **Coûts** — TCO, rentabilité.
- **Trips & GPS** — trajets historiques, position en direct.

### 3.4 Maintenance (`/fleet/maintenance`)

- **Plans de maintenance** par véhicule (intervalles km/temps).
- **Événements** : entretien, vidange, pneus, accidents, réparations.
- **Coûts** intégrés à la rentabilité du véhicule.
- **Alertes** : rappels d'échéances.

### 3.5 Conformité (`/fleet/compliance`)

Suivi consolidé des **expirations** :
- Vignette
- Assurance
- Contrôle technique
- Carte grise

> ⚠️ Couleur rouge = expiré, orange = sous 30 jours, vert = OK.

---

## 4. Clients (`/customers`)

### 4.1 Liste des clients

Affichage des clients particuliers et entreprises avec filtres : type (PARTICULIER / ENTREPRISE), statut, agence, blacklist.

**Actions** :
- **Nouveau Client** → création.
- **Voir dossier** → fiche client complète.
- **Importer** → import CSV (selon vos droits).

### 4.2 Création client

Le formulaire s'adapte au type :

**Particulier** :
- Nom, prénom, CIN, date de naissance.
- Téléphone, email, adresse.
- Permis de conduire (numéro, date d'émission, expiration).

**Entreprise** :
- Raison sociale, ICE, RC, IF.
- Forme juridique, capital.
- Personne de contact.
- Représentant légal.

### 4.3 Dossier client (`/customers/:id`)

Vue 360° du client :
- **Identité & coordonnées**.
- **Adresses** (résidence, livraison, facturation).
- **Comptes bancaires** (RIB pour prélèvements).
- **Notes & relances**.
- **Documents** (CNI, permis, justificatifs).
- **KYC** : statut de vérification (PENDING / VERIFIED / REJECTED).
- **Contrats** liés.
- **Factures & paiements**.
- **Historique** (logs d'audit).

### 4.4 KYC (Know Your Customer)

Procédure de vérification client :
1. Créer un dossier KYC.
2. Téléverser les documents (CNI recto/verso, justificatif domicile, RIB, permis).
3. Le **vérificateur** valide ou rejette chaque document.
4. Décision finale : APPROVED / REJECTED.

> Sans KYC validé, certaines opérations (signature de contrat, prélèvement) sont bloquées.

### 4.5 Blacklist

Pour bloquer un client à risque :
1. Dans la fiche client → **Blacklister**.
2. Saisir motif + référence.
3. Le client est bloqué pour toute nouvelle réservation/contrat.

---

## 5. Contrats (`/contracts`)

### 5.1 Liste des contrats

Filtres : statut (BROUILLON / EN ATTENTE / ACTIF / TERMINÉ), type (LOCATION / LLD / LOA / CRÉDIT), agence.

### 5.2 Créer un contrat (`/contracts/new`)

1. **Sélectionner le client** (recherche).
2. **Sélectionner le véhicule** (filtré sur DISPONIBLE).
3. **Type de contrat** :
   - **Location courte durée** (LCD).
   - **LLD** (Location Longue Durée).
   - **LOA** (Location avec Option d'Achat).
   - **Crédit-bail / Vente à crédit**.
4. **Dates** : début, fin, durée.
5. **Tarification** : loyer mensuel/journalier, kilométrage inclus, dépassement.
6. **Cautions & frais** : caution, frais de dossier, garanties.
7. **Échéancier** : généré automatiquement.
8. **Sauvegarder en brouillon** ou **Soumettre pour approbation**.

### 5.3 Cycle de vie d'un contrat

```
BROUILLON → SOUMIS → APPROUVÉ → SIGNÉ → ACTIF → TERMINÉ
                              ↓
                          REJETÉ
```

À chaque étape : actions disponibles selon votre rôle.

### 5.4 Activation

Quand le client signe :
1. **Activer le contrat** → bascule en ACTIF.
2. Génération de la **facture initiale**.
3. Le véhicule passe en LOUÉ.
4. Mission de livraison créée (si applicable).

### 5.5 Templates (`/contracts/templates`)

Modèles PDF personnalisés par type de contrat (en-tête, clauses, conditions générales).

---

## 6. Location courte durée — Mobile Ops (`/mobile-ops`)

### 6.1 Réservations & Missions

Workflow opérationnel terrain :
1. **Réservation** créée par l'agent commercial.
2. **Mission de livraison** assignée à un agent terrain.
3. L'agent **prend le véhicule** (mission start).
4. **Checklist état** + **photos** d'état des lieux.
5. **Signature client** (tablette) à la livraison.
6. **Mission complétée**.
7. À la restitution : nouveau check-in (kilométrage, état, dommages).

### 6.2 Module Location (`/rentals`)

Vue dédiée location courte durée :
- **Disponibilités** (calendrier).
- **Prise en charge** (handover pickup).
- **Restitution** (handover return).
- **Prolongation**.
- **Rapports de dommages**.
- **Clôture facturation**.

---

## 7. Crédit & Risque (`/credit`)

### 7.1 Dossiers de crédit

Liste des dossiers : NOUVEAU, EN ANALYSE, APPROUVÉ, REJETÉ.

### 7.2 Workflow

1. **Création** : client + montant + durée + véhicule.
2. **Scoring automatique** (basé sur historique, KYC, garanties).
3. **Analyse manuelle** par l'analyste crédit.
4. **Décision** : APPROUVÉ / REJETÉ avec motif.
5. **Conditions** : taux, durée, garanties exigées.

### 7.3 IA — Risque crédit (`/ai/predictions/credit-risk`)

Modèle prédictif déterministe : score 0–100 basé sur signaux objectifs (régularité paiements, KYC complet, ancienneté, garanties). Ne se substitue pas à la décision humaine.

---

## 8. Finance & Facturation

### 8.1 Vue d'ensemble (`/finance`)

KPIs financiers : CA, encaissements, créances, retards.

### 8.2 Factures (`/finance/invoices`)

Liste des factures avec filtres : statut (BROUILLON / ÉMISE / ENCAISSÉE / EN RETARD / ANNULÉE), type, période.

**Actions** :
- **Émettre une facture** depuis un contrat.
- **Annuler** (avec motif).
- **Télécharger PDF**.
- **Envoyer par email** au client.

### 8.3 Paiements (`/finance/payments`)

- Saisie des paiements reçus.
- **Allocation automatique** sur factures ouvertes (FIFO ou manuelle).
- Multi-modes : virement, espèces, chèque, carte, prélèvement SEPA.

### 8.4 Trésorerie (`/finance/treasury`)

- Synthèse soldes bancaires.
- **Import relevés bancaires** (CSV/OFX).
- **Rapprochement automatique** avec les paiements.

### 8.5 Relevé client (`/customers/:id/statement`)

État de compte détaillé d'un client : factures, paiements, solde, balance âgée.

---

## 9. Comptabilité (`/accounting`)

### 9.1 Plan comptable (`/accounting/chart`)

Plan comptable marocain (CGNC) chargé par défaut. Personnalisable.

### 9.2 Journaux (`/accounting/journals`)

Journaux par défaut : VTE (ventes), ACH (achats), BNK (banque), CSH (caisse), OD (opérations diverses).

### 9.3 Écritures (`/accounting/entries`)

- **Saisie manuelle** d'écritures comptables.
- **Génération automatique** depuis factures/paiements (Bridge).
- **Validation** (POSTED) puis verrouillage.
- **Annulation** avec écriture inverse.

### 9.4 Immobilisations (`/accounting/fixed-assets`)

- Suivi du parc immobilisé.
- Calcul automatique des **amortissements**.
- Cession / mise au rebut.

### 9.5 Rapports

| Rapport | URL | Contenu |
|---|---|---|
| Balance générale | `/accounting/reports/trial-balance` | Soldes par compte. |
| Bilan | `/accounting/reports/balance-sheet` | Actif / Passif. |
| Compte de résultat | `/accounting/reports/income-statement` | Charges / Produits. |
| Déclaration TVA | `/accounting/reports/tax-report` | TVA collectée / déductible. |

### 9.6 Paramètres comptables (`/accounting/settings`)

- Numérotation pièces (préfixe + compteur par journal).
- Comptes de contrepartie par défaut.
- Année fiscale active.

---

## 10. Recouvrement (`/arrears`)

### 10.1 Dossiers d'impayés

Liste des contrats avec impayés actifs : montant dû, jours de retard, dernière action.

### 10.2 Workflow de recouvrement

```
DÉTECTÉ → RELANCE 1 (J+5) → RELANCE 2 (J+15) → MISE EN DEMEURE (J+30) → CONTENTIEUX (J+60)
```

### 10.3 Actions disponibles

- **Relance amiable** (email, SMS, courrier).
- **Mise en demeure** (PDF généré).
- **Plan d'apurement** (échelonnement négocié).
- **Escalade contentieux**.

### 10.4 Contentieux (`/arrears/legal`)

Volet juridique :
- Saisine huissier / avocat.
- Procédure judiciaire.
- **Reprise de véhicule** (geo-localisation + mission).

---

## 11. Signatures électroniques (`/signatures`)

### 11.1 Enveloppes

Dossiers d'envoi pour signature :
1. Choisir un **document PDF**.
2. Définir les **signataires** (email + ordre).
3. Placer les **zones de signature**.
4. **Envoyer** → email automatique avec lien sécurisé.
5. Signataire signe (clic + saisie code OTP).
6. PDF final scellé + traçabilité.

### 11.2 Statuts

- DRAFT : en préparation
- SENT : envoyée
- IN_PROGRESS : signature en cours
- COMPLETED : tous signataires ont signé
- DECLINED : refusée
- VOIDED : annulée

---

## 12. Véhicules d'occasion (`/used-cars`)

Module dédié à la **revente** des véhicules sortis du parc :

### 12.1 Workflow

1. **Évaluation** (estimation prix de revente).
2. **Publication** (annonce avec photos).
3. **Réservation** (acompte client).
4. **Vente** (génération facture + transfert propriété).

### 12.2 Tarification

- Valeur d'achat
- Valeur résiduelle théorique
- Prix de marché estimé
- Prix de vente final

---

## 13. GPS & Géolocalisation (`/gps`)

### 13.1 Carte temps réel

- Position en direct de chaque véhicule équipé GPS.
- État : en mouvement / arrêté / connecté / déconnecté.

### 13.2 Trajets (`/gps/vehicles/:id/trips`)

Historique détaillé : départ, arrivée, distance, durée, vitesse moyenne/max.

### 13.3 Geofences (`/gps/geofences`)

Zones virtuelles :
- Création (zone géographique).
- Affectation à un ou plusieurs véhicules.
- Alertes en cas d'entrée/sortie de zone.

### 13.4 Alertes (`/gps/alerts`)

- Sortie de zone autorisée.
- Vitesse excessive.
- Conduite hors plage horaire.
- Perte de signal.

---

## 14. Intelligence artificielle (`/ai`)

> Toutes les prédictions sont **déterministes** et basées sur des règles métier objectives. Aucune dépendance externe.

### 14.1 Vue d'ensemble (`/ai`)

Tableau de bord IA : derniers signaux, anomalies détectées.

### 14.2 Assistant (`/ai/assistant`)

Recherche en langage naturel sur l'ensemble des données (clients, véhicules, contrats).

### 14.3 Prédictions

| Module | URL | Cas d'usage |
|---|---|---|
| Maintenance prédictive | `/ai/predictions/maintenance` | Risque panne / révision à venir. |
| Risque crédit | `/ai/predictions/credit-risk` | Score 0–100 par client. |
| Cash-flow | `/ai/predictions/cash-flow` | Prévision trésorerie 30/60/90j. |
| Pricing véhicule | `/ai/predictions/vehicle-pricing` | Estimation valeur revente. |

### 14.4 Anomalies (`/ai/anomalies`)

Détection automatique d'anomalies :
- Kilométrages incohérents.
- Paiements anormaux.
- Comportements suspects.

---

## 15. Notifications (`/notifications`)

Centre de notifications système :
- Échéances clients.
- Alertes flotte.
- Validations en attente.
- Erreurs techniques.

Vous pouvez les **marquer lues**, les **filtrer par type**, et configurer vos préférences dans **Profil → Notifications**.

---

## 16. Documents (`/documents`)

Centre documentaire central :
- Recherche transverse (par client, par véhicule, par contrat).
- Téléversement.
- Génération de documents standards (contrats, factures, attestations).

---

## 17. Paramètres (`/settings`)

⚠️ Réservé **ADMIN** et **DIRECTEUR**.

### 17.1 Utilisateurs (`/settings/users`)

- Créer / modifier / désactiver un utilisateur.
- Assigner un ou plusieurs **rôles**.
- Affecter à une ou plusieurs **agences**.
- Réinitialiser mot de passe.
- Voir l'historique de connexion.

### 17.2 Rôles (`/settings/roles`)

Rôles système :

| Rôle | Description |
|---|---|
| ADMIN | Accès complet. |
| DIRECTEUR | Direction, accès à tous les modules. |
| AGENT_COMMERCIAL | Création clients, contrats, devis. |
| GESTIONNAIRE_FLOTTE | Flotte, maintenance, conformité. |
| ANALYSTE_CREDIT | Crédit & scoring. |
| COMPTABLE | Finance & comptabilité. |
| CONTENTIEUX | Recouvrement & contentieux. |
| AGENT_LIVRAISON | Mobile Ops (livraison/restitution). |
| CLIENT_PORTAL | Accès client en lecture. |

Les **permissions** sont attachées aux rôles. Vous pouvez :
- Créer des rôles personnalisés.
- Synchroniser les permissions par module.

### 17.3 Agences (`/settings/branches`)

- Créer / modifier / désactiver une agence.
- Adresse, contact, horaires.
- Une agence appartient à une **société**.

---

## 18. Profil utilisateur (`/profile`)

- **Photo** : cliquer sur l'avatar → choisir une image.
- **Informations** : nom, prénom, téléphone, email.
- **Mot de passe** : changement sécurisé.
- **Préférences** : langue (fr / ar / en), fuseau horaire, thème (clair / sombre).
- **Notifications** : choisir les canaux (email, in-app).

---

## 19. Audit (`/audit`)

⚠️ Réservé ADMIN.

Journal d'audit complet : toute action sensible est tracée :
- Qui, Quand, Quoi, Avant/Après.
- Filtres par utilisateur, module, action, période.
- **Export CSV**.

---

## 20. Bonnes pratiques

### 20.1 Sécurité
- Changez votre mot de passe à la première connexion.
- Ne partagez jamais vos identifiants.
- Déconnectez-vous après chaque session sur un poste partagé.
- Signalez toute activité suspecte à votre administrateur.

### 20.2 Saisie de données
- Toujours **valider le KYC** avant signature de contrat.
- Renseigner le **VIN complet** (17 caractères) pour chaque véhicule.
- Téléverser les documents en **PDF** ou **JPG** (max 10 Mo par fichier).

### 20.3 Gestion des contrats
- Vérifier les **dates** et le **kilométrage initial** avant activation.
- Joindre systématiquement les **photos d'état des lieux** à la livraison.
- Faire **signer électroniquement** plutôt que papier (traçabilité).

### 20.4 Comptabilité
- **Verrouiller** les écritures en fin de mois (POSTED).
- Faire le **rapprochement bancaire** au moins 1×/semaine.
- Préparer la **clôture annuelle** un mois avant la fin d'exercice.

---

## 21. Dépannage

### 21.1 "Identifiants invalides" (HTTP 422)
- Vérifiez la casse de l'email.
- Vérifiez le verrouillage majuscules.
- Demandez à un admin de réinitialiser votre mot de passe.

### 21.2 "Accès refusé" (HTTP 403)
- Votre rôle n'a pas accès à cette fonctionnalité.
- Demandez à votre admin d'ajuster vos permissions.

### 21.3 "Élément introuvable" (HTTP 404)
- L'élément a été supprimé ou ne dépend pas de votre agence/société.
- Rafraîchissez la liste.

### 21.4 Page blanche / erreur d'affichage
- Videz le cache navigateur : **Ctrl+Shift+R** (Windows) / **Cmd+Shift+R** (Mac).
- Essayez en navigation privée.
- Si le problème persiste, contactez le support.

### 21.5 Téléversement échoué
- Vérifiez la taille (< 10 Mo).
- Format autorisé : PDF, JPG, PNG.
- Vérifiez votre connexion internet.

---

## 22. Glossaire

| Terme | Définition |
|---|---|
| **CIN** | Carte d'Identité Nationale |
| **ICE** | Identifiant Commun de l'Entreprise |
| **VIN** | Numéro de châssis (17 caractères) |
| **KYC** | Know Your Customer (vérification client) |
| **LCD** | Location Courte Durée |
| **LLD** | Location Longue Durée |
| **LOA** | Location avec Option d'Achat |
| **TCO** | Total Cost of Ownership (coût total de possession) |
| **VNC** | Valeur Nette Comptable |
| **YTD** | Year-To-Date (depuis le début de l'année) |
| **RBAC** | Role-Based Access Control |
| **API** | Application Programming Interface |

---

## 23. Support

Pour toute question ou incident :
- **Administrateur interne** : votre interlocuteur niveau 1.
- **Support technique éditeur** : voir contrat de service.

Lors d'un signalement, joindre :
- URL exacte de la page concernée.
- Capture d'écran du message d'erreur.
- Date, heure, votre identifiant utilisateur.

---

*Document généré le 5 mai 2026 — DriveFlow OS v1.0*
