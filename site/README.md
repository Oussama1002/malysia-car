# Site public — Malysia Car

Site vitrine de l'agence. **Il ne fait pas partie de l'application DriveFlow** :
pas de build, pas de dépendances, pas de framework. Trois fichiers statiques que
l'on peut ouvrir et corriger directement sur le serveur.

```
site/
  index.html
  assets/styles.css
  assets/app.js
  assets/config.js   ← le seul fichier à adapter
  nginx.conf.example
```

## Ce qu'il touche de DriveFlow

Deux routes publiques, et rien d'autre :

| Route | Rôle |
|---|---|
| `GET  /api/v1/public/site/vehicles` | la flotte visible (marque, modèle, année, carburant, boîte, tarif/jour, photo). Mise en cache 5 min, 60 appels/min max. |
| `POST /api/v1/public/site/reservation-requests` | dépose une demande. 10 appels/min max, champ piège anti-robot. |

Aucune authentification, aucune donnée interne (ni prix d'achat, ni valeur
comptable, ni franchise, ni client). Une demande n'écrit **pas** dans les
réservations : elle atterrit dans `website_leads`, qu'un agent qualifie depuis
**Opérations → Demandes du site**. Il crée ensuite le client et la réservation
normalement.

## Configuration

`assets/config.js` :

```js
window.MALYSIA = {
  apiBase: 'http://79.143.180.186:8080/api', // API DriveFlow, sans barre finale
  phone: '+212 6 00 00 00 00',
  whatsapp: '212600000000',                  // format international, sans +
  email: 'contact@malysiacar.ma',
  address: 'Casablanca, Maroc',
};
```

## Mise en ligne

Le site est servi par son propre vhost, sur son propre port (8090 par défaut).
Un déploiement de DriveFlow ne le touche pas, et une panne du site ne touche pas
l'application.

```
sudo cp /var/www/driveflow/site/nginx.conf.example /etc/nginx/sites-available/malysia-site
sudo ln -sf /etc/nginx/sites-available/malysia-site /etc/nginx/sites-enabled/malysia-site
sudo nginx -t && sudo systemctl reload nginx
```

Puis, une fois pour toutes, autoriser l'origine du site dans
`backend/config/cors.php` → `allowed_origins`, sinon le navigateur bloquera les
deux appels.

## Nom de domaine

Quand le domaine sera prêt : pointer l'enregistrement A sur le serveur, remplacer
`listen 8090;` par `listen 80; server_name malysiacar.ma www.malysiacar.ma;` puis
`sudo certbot --nginx -d malysiacar.ma -d www.malysiacar.ma` pour le HTTPS.
