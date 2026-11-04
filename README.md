# 🔵⚪ FC Porto Wiki

Un wiki du FC Porto : matchs, classements, effectif, histoire, palmarès et stade, toujours à jour.

Le projet est en trois parties :
- **`api.py`** : une API FastAPI qui récupère et met en forme les données (avec un cache pour ne pas surcharger les sources), et qui sert aussi le site
- **`static/`** : le site en HTML, CSS et JavaScript, sans framework ni étape de build. Ambiance « Nuit au Dragão » : bleu nuit, projecteurs, typographie de stade
- **`desktop/`** : l'app Windows et Linux (Electron)

## Sources de données

Toutes les sources sont **gratuites, sans inscription et sans clé API**.

| Source | Ce qu'elle fournit |
|---|---|
| [ESPN](https://github.com/pseudo-r/Public-ESPN-API) (API publique non officielle) | Matchs à venir, résultats, classements Liga Portugal et Ligue des champions, effectif et stats |
| [Wikipédia](https://fr.wikipedia.org/wiki/FC_Porto) | Histoire du club, palmarès, stade, et matchs de Coupe de la Ligue et de Supercoupe (qu'ESPN ne couvre pas) |
| [TheSportsDB](https://www.thesportsdb.com) (clé publique `123`) | Images du club, fiche du stade |
| [openfootball/football.json](https://github.com/openfootball/football.json) | Résultats des saisons passées de Liga Portugal (depuis 2018-19) |

## Pages

- **Accueil** : position en championnat, prochain match avec compte à rebours et forme des deux équipes, score en direct (rafraîchi toutes les 30 s) pendant le match
- **Matchs** : calendrier et résultats, filtrables par compétition
- **Fiche match** : buteurs et passeurs, cartons, compositions, statistiques et forme des deux équipes
- **Classements** : Liga Portugal et Ligue des champions
- **Effectif** : joueurs par poste avec leurs stats
- **Histoire** : de la fondation à aujourd'hui
- **Palmarès** : tous les trophées avec les années
- **Stade** : le stade du Dragon
- **Saisons passées** : classement, courbe de la position journée par journée et matchs de Porto, saison par saison

Si une source ne répond plus, l'API renvoie la dernière version connue, et l'accueil s'affiche même sans les images ou les textes de Wikipédia.

## Les apps

### Windows et Linux

Une vraie app de bureau, à télécharger depuis les [releases](https://github.com/alnrfLO/fc_porto_wiki/releases/latest) (ou le bouton « Installer l'app » du site) :
- **Windows** : `FC-Porto-Wiki-Setup.exe`, installeur en français avec raccourcis sur le Bureau et dans le menu Démarrer. L'app n'étant pas signée, Windows peut afficher « Windows a protégé votre ordinateur » : « Informations complémentaires », puis « Exécuter quand même ».
- **Linux** : `FC-Porto-Wiki.AppImage` (à rendre exécutable) ou `fc-porto-wiki_amd64.deb`

L'app (dossier `desktop/`, faite avec Electron) ouvre le site dans sa propre fenêtre : elle est toujours à jour, garde les pages déjà vues hors ligne, et ouvre les liens externes dans le navigateur. Raccourcis : F5 pour actualiser, Alt+flèches pour naviguer, Ctrl +/- pour zoomer, F11 pour le plein écran.

Pour la tester ou construire l'installeur en local (Node.js requis) :

```bash
cd desktop
npm install
npm start          # lance l'app
npm run windows    # crée desktop/dist/FC-Porto-Wiki-Setup.exe
```

**Publier une nouvelle version** : créer un tag, GitHub construit les versions Windows et Linux et les publie dans une release (`.github/workflows/app-bureau.yml`) :

```bash
git tag v1.0.1
git push origin v1.0.1
```

### Téléphone

Le site s'installe comme une app, sans passer par un store :
- **Android** : bouton « Installer l'app » en haut à droite (ou le menu de Chrome)
- **iPhone, iPad** : dans Safari, Partager puis « Sur l'écran d'accueil » (le bouton du site rappelle le geste)

L'app s'ouvre en plein écran avec sa propre icône. Sans réseau, elle affiche les dernières données consultées, avec un bandeau « Hors ligne ». En ligne, tout vient du serveur, donc l'app se met à jour en même temps que le site. Le fonctionnement hors ligne est dans `static/sw.js`, la description de l'app dans `static/manifest.json`.

## Lancer le projet

```bash
python -m venv venv
venv\Scripts\activate        # Windows (sur Mac/Linux : source venv/bin/activate)
pip install -r requirements.txt
```

Puis une seule commande :

```bash
uvicorn api:app --reload
```

Le site est sur http://127.0.0.1:8000, et la doc de l'API sur http://127.0.0.1:8000/docs.

## Mettre en ligne sur Vercel

Le projet est prêt pour Vercel, sans réglage : `pyproject.toml` indique que l'application est dans `api.py`. Sur [vercel.com/new](https://vercel.com/new), importe le dépôt GitHub et clique sur **Deploy**. Ensuite, chaque push sur `main` met le site à jour.

## Routes de l'API

| Route | Description |
|---|---|
| `/porto/matchs` | Matchs à venir, toutes compétitions |
| `/porto/resultats` | Résultats de la saison |
| `/matchs/{ligue}/{id}` | Fiche d'un match (buteurs, compos, stats, forme) |
| `/classement/liga-portugal` | Classement de Liga Portugal |
| `/classement/champions-league` | Classement de la phase de ligue |
| `/porto/club` | Infos et images du club |
| `/porto/effectif` | Effectif et statistiques |
| `/porto/histoire` | Histoire du club (Wikipédia) |
| `/porto/palmares` | Palmarès (Wikipédia) |
| `/porto/stade` | Stade du Dragon |
| `/saisons` | Saisons disponibles |
| `/saisons/{saison}` | Classement, courbe et matchs d'une saison passée (ex. `2024-25`) |
