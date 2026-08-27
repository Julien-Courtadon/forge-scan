FORGE SCAN - GENERATION AUTOMATIQUE DU RAPPORT

1. Creer un projet Supabase Free.
2. Dans Storage, creer un bucket PRIVE nomme : forge-reports
3. Dans Netlify > Site configuration > Environment variables, ajouter :
   SUPABASE_URL
   SUPABASE_SERVICE_ROLE_KEY
   SUPABASE_BUCKET=forge-reports

IMPORTANT :
- La SERVICE_ROLE_KEY reste uniquement dans Netlify.
- Ne jamais la mettre dans index.html.
- Le PDF est genere cote serveur.
- Le rapport est stocke dans un bucket prive.
- Un lien signe valable 7 jours est genere.
- Le lien apparait dans le message WhatsApp envoye au numero FORGE.

DEPLOIEMENT :
- Dezipper le dossier.
- Glisser/deployer le projet sur Netlify (Git recommande pour installer les dependances).
- Netlify installe package.json et publie la fonction automatiquement.

PARCOURS :
Scan -> calcul des scores -> clic WhatsApp -> generation PDF -> stockage prive -> lien signe -> ouverture WhatsApp -> message contenant numero client + scores + 3 priorites + lien PDF.
