from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo
import unicodedata
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
import requests
import html
import re
import time

app = FastAPI(title="FC Porto Wiki 🔵⚪")

# toutes les sources sont gratuites et sans inscription, pas de cle api
ESPN = "https://site.api.espn.com/apis/site/v2/sports/soccer"
ESPN_CLASSEMENTS = "https://site.api.espn.com/apis/v2/sports/soccer"
WIKIPEDIA = "https://fr.wikipedia.org"
SPORTSDB = "https://www.thesportsdb.com/api/v1/json/123"  # 123 c est la cle publique, tout le monde peut l utiliser
OPENFOOTBALL = "https://raw.githubusercontent.com/openfootball/football.json/master"

PORTO_ESPN = "437"
PORTO_SPORTSDB = 134114
STADE_SPORTSDB = 16021

# les compet espn ou porto peut jouer, celles ou y a pas de match cette saison sont zappees
COMPETITIONS = {
    "por.1": "Liga Portugal",
    "uefa.champions": "Ligue des champions",
    "uefa.europa": "Ligue Europa",
    "uefa.europa.conf": "Ligue Conférence",
    "por.taca.portugal": "Coupe du Portugal",
}

ZONES = {
    "Champions League": "Ligue des champions",
    "Champions League qualifying": "Qualif. Ligue des champions",
    "Europa League": "Ligue Europa",
    "Europa League qualifying": "Qualif. Ligue Europa",
    "Conference League": "Ligue Conférence",
    "Conference League qualifying": "Qualif. Ligue Conférence",
    "Relegation": "Relégation",
    "Relegation playoff": "Barrage de relégation",
    "Qualifies for round of 16": "Qualifié en 8es",
    "Knockout phase playoffs - seeded": "Barrages (tête de série)",
    "Knockout phase playoffs - unseeded": "Barrages",
    "Eliminated": "Éliminé",
}

POSTES = {"G": "Gardiens", "D": "Défenseurs", "M": "Milieux", "F": "Attaquants"}

# espn donne les pays en anglais donc je traduis (ceux qui sont pas dans la liste restent en anglais)
PAYS = {
    "Algeria": "Algérie", "Angola": "Angola", "Argentina": "Argentine", "Australia": "Australie",
    "Austria": "Autriche", "Belgium": "Belgique", "Brazil": "Brésil", "Cameroon": "Cameroun",
    "Canada": "Canada", "Cape Verde": "Cap-Vert", "Cape Verde Islands": "Cap-Vert", "Chile": "Chili",
    "Colombia": "Colombie", "Croatia": "Croatie", "Czech Republic": "Tchéquie", "Czechia": "Tchéquie",
    "Denmark": "Danemark", "Dominican Republic": "République dominicaine", "Ecuador": "Équateur",
    "England": "Angleterre", "France": "France", "Georgia": "Géorgie", "Germany": "Allemagne",
    "Ghana": "Ghana", "Greece": "Grèce", "Guinea": "Guinée", "Guinea-Bissau": "Guinée-Bissau",
    "Hungary": "Hongrie", "Iran": "Iran", "Ireland": "Irlande", "Italy": "Italie",
    "Ivory Coast": "Côte d’Ivoire", "Japan": "Japon", "Mali": "Mali", "Mexico": "Mexique",
    "Morocco": "Maroc", "Mozambique": "Mozambique", "Netherlands": "Pays-Bas", "Nigeria": "Nigeria",
    "Norway": "Norvège", "Paraguay": "Paraguay", "Peru": "Pérou", "Poland": "Pologne",
    "Portugal": "Portugal", "Romania": "Roumanie", "Russia": "Russie", "Scotland": "Écosse",
    "Senegal": "Sénégal", "Serbia": "Serbie", "Slovakia": "Slovaquie", "Slovenia": "Slovénie",
    "South Korea": "Corée du Sud", "Spain": "Espagne", "Sweden": "Suède", "Switzerland": "Suisse",
    "Turkey": "Turquie", "Ukraine": "Ukraine", "United States": "États-Unis", "Uruguay": "Uruguay",
    "Venezuela": "Venezuela", "Wales": "Pays de Galles",
}

# les parties de l article wikipedia que j affiche deja ailleurs (ou qui servent a rien ici)
WIKI_EXCLUS = {"Palmarès et records", "Effectif professionnel actuel", "Transferts",
               "Notes et références", "Voir aussi", "Liens externes", "Annexes"}

HEADERS = {"User-Agent": "fc-porto-wiki/1.0 (github.com/alnrfLO/fc_porto_wiki)"}
CACHE_DIRECT = 30  # 30 s pour une fiche de match vu qu il peut etre en cours
CACHE_MATCHS = 120  # 2 min pour les calendriers
CACHE_DUREE = 600  # 10 min pour les classements
CACHE_LONG = 86400  # 24 h pour wikipedia et les images, sa bouge pas
_cache = {}


def get_json(url, params=None, duree=CACHE_DUREE):
    cle = (url, tuple(sorted((params or {}).items())))
    if cle in _cache and time.time() - _cache[cle][0] < duree:
        return _cache[cle][1]
    try:
        r = requests.get(url, params=params, headers=HEADERS, timeout=15)
        r.raise_for_status()
        data = r.json()
    except requests.RequestException:
        # si la source est en panne je renvoie la derniere version que j ai, si y en a une
        if cle in _cache:
            return _cache[cle][1]
        raise
    _cache[cle] = (time.time(), data)
    return data


def optionnel(charger, defaut):
    try:
        return charger()
    except requests.RequestException:
        return defaut


@app.exception_handler(requests.RequestException)
def source_indisponible(request, exc):
    return JSONResponse(status_code=502, content={"detail": f"Source indisponible : {exc}"})


def logo(equipe_id):
    return f"https://a.espncdn.com/i/teamlogos/soccer/500/{equipe_id}.png"


def est_porto(nom):
    return "Porto" in nom.split()


def resultat(pour, contre):
    return "V" if pour > contre else "D" if pour < contre else "N"


def score(equipe):
    s = equipe.get("score")
    return s.get("displayValue") if isinstance(s, dict) else s


def format_match(event, ligue):
    c = event["competitions"][0]
    equipes = {e["homeAway"]: e for e in c["competitors"]}
    dom, ext = equipes["home"], equipes["away"]
    statut = c["status"]["type"]
    etat = statut["state"]  # pre = pas commence, in = en cours, post = fini
    if etat == "post" and not statut["completed"]:
        etat = "reporte"

    match = {
        "id": event["id"],
        "ligue": ligue,
        "date": event["date"],
        "competition": COMPETITIONS[ligue],
        "domicile": dom["team"]["displayName"],
        "domicile_logo": logo(dom["team"]["id"]),
        "exterieur": ext["team"]["displayName"],
        "exterieur_logo": logo(ext["team"]["id"]),
        "etat": etat,
        "score_domicile": None,
        "score_exterieur": None,
        "resultat": None,
        "stade": c.get("venue", {}).get("fullName", ""),
    }
    if etat in ("in", "post"):
        match["score_domicile"] = int(float(score(dom)))
        match["score_exterieur"] = int(float(score(ext)))
    if etat == "post":
        porto, adversaire = (dom, ext) if dom["team"]["id"] == PORTO_ESPN else (ext, dom)
        match["resultat"] = resultat(float(score(porto)), float(score(adversaire)))
        # match nul mais gagne aux tirs au but (en coupe)
        if match["resultat"] == "N" and (porto.get("winner") or adversaire.get("winner")):
            match["resultat"] = "V" if porto.get("winner") else "D"
    return match


def matchs_porto(a_venir):
    params = {"fixture": "true"} if a_venir else None

    def charger(slug):
        data = get_json(f"{ESPN}/{slug}/teams/{PORTO_ESPN}/schedule", params, CACHE_MATCHS)
        return [format_match(e, slug) for e in data.get("events", [])]

    with ThreadPoolExecutor() as pool:
        matchs = [m for liste in pool.map(charger, COMPETITIONS) for m in liste]
    # les coupes qu espn a pas je les prends sur wikipedia (en bonus : si la page marche pas le calendrier s affiche quand meme)
    matchs += [m for m in optionnel(matchs_wikipedia, []) if (m["etat"] == "pre") == a_venir]
    return sorted(matchs, key=lambda m: m["date"], reverse=not a_venir)


# les compet qu espn couvre pas : je les lis dans le calendrier de la page wikipedia de la saison
COMPETITIONS_WIKIPEDIA = {"Coupe de la Ligue", "Supercoupe du Portugal"}
MOIS = {"janvier": 1, "février": 2, "mars": 3, "avril": 4, "mai": 5, "juin": 6, "juillet": 7,
        "août": 8, "septembre": 9, "octobre": 10, "novembre": 11, "décembre": 12}


def sans_accents(texte):
    return "".join(c for c in unicodedata.normalize("NFD", texte.lower()) if unicodedata.category(c) != "Mn")


def cellules_html(ligne):
    return [re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", c))).strip()
            for c in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", ligne, flags=re.S)]


def date_wikipedia(jour, heure):
    # genre « 1 er août 2026 » et « 21:15 », heure de paris ; None si la date est pas encore fixee
    d = re.match(r"(\d{1,2})\s*(?:er\s+)?([a-zéû]+)\s+(\d{4})", jour)
    h = re.match(r"(\d{1,2}):(\d{2})", heure)
    if not d or d.group(2) not in MOIS:
        return None
    locale = datetime(int(d.group(3)), MOIS[d.group(2)], int(d.group(1)),
                      int(h.group(1)) if h else 0, int(h.group(2)) if h else 0, tzinfo=ZoneInfo("Europe/Paris"))
    return locale.astimezone(timezone.utc)


def matchs_wikipedia():
    saison = classement("por.1")["saison"]  # genre « 2026-27 »
    debut = int(saison[:4])
    page = get_json(f"{WIKIPEDIA}/w/api.php", {
        "action": "parse", "page": f"Saison_{debut}-{debut + 1}_du_FC_Porto", "redirects": 1,
        "prop": "text", "format": "json", "formatversion": 2,
    })["parse"]["text"]
    lignes = [cellules_html(tr) for tr in re.findall(r"<tr.*?</tr>", re.sub(r"<style.*?</style>", "", page, flags=re.S), flags=re.S)]

    # les stades je les prends dans les fiches de match de la page (« domicile | score | exterieur | stade, ville »)
    stades = {(c[1], c[3]): c[4].split(",")[0].strip() for c in lignes
              if len(c) == 5 and re.fullmatch(r"\d+\s*-\s*\d+|-", c[2])}
    equipes = optionnel(lambda: [t["team"] for t in get_json(f"{ESPN}/por.1/teams", duree=CACHE_LONG)
                                 ["sports"][0]["leagues"][0]["teams"]], [])

    def logo_equipe(nom):
        nom_simple = sans_accents(nom)
        for cle in ("displayName", "shortDisplayName"):
            for e in equipes:
                if sans_accents(e.get(cle, "")) in nom_simple:
                    return logo(e["id"])
        return None

    matchs = []
    for c in lignes:
        # une ligne du calendrier : competition | tour | date | heure | domicile | score | exterieur | statut
        if len(c) < 7 or c[0] not in COMPETITIONS_WIKIPEDIA:
            continue
        date = date_wikipedia(c[2], c[3])
        if not date:
            continue
        domicile, score, exterieur = c[4], c[5], c[6]
        buts = [int(n) for n in re.findall(r"\d+", score)]
        joue = len(buts) >= 2
        if not joue and date < datetime.now(timezone.utc) - timedelta(hours=3):
            continue  # match deja joue mais wikipedia l a pas encore mis a jour
        match = {
            "id": None, "ligue": "wikipedia", "date": date.strftime("%Y-%m-%dT%H:%MZ"), "competition": c[0],
            "domicile": domicile, "domicile_logo": logo_equipe(domicile),
            "exterieur": exterieur, "exterieur_logo": logo_equipe(exterieur),
            "etat": "post" if joue else "pre",
            "score_domicile": buts[0] if joue else None, "score_exterieur": buts[1] if joue else None,
            "resultat": None, "stade": stades.get((domicile, exterieur), ""),
        }
        if joue:
            pour, contre = (buts[0], buts[1]) if est_porto(domicile) else (buts[1], buts[0])
            match["resultat"] = resultat(pour, contre)
            if match["resultat"] == "N" and len(buts) >= 4:  # qualif aux tirs au but
                tab_pour, tab_contre = (buts[2], buts[3]) if est_porto(domicile) else (buts[3], buts[2])
                match["resultat"] = resultat(tab_pour, tab_contre)
        matchs.append(match)
    return matchs


@app.get("/porto/matchs")
def get_matchs_porto():
    return matchs_porto(a_venir=True)


@app.get("/porto/resultats")
def get_resultats_porto():
    return matchs_porto(a_venir=False)


STATUTS = {
    "Scheduled": "À venir", "First Half": "1re mi-temps", "Halftime": "Mi-temps",
    "Second Half": "2e mi-temps", "Full Time": "Terminé", "Final": "Terminé",
    "Extra Time": "Prolongation", "Penalties": "Tirs au but", "Postponed": "Reporté",
}

# les stats de match que j affiche, dans l ordre (les pourcentages je les calcule a part)
STATS_MATCH = {
    "possessionPct": "Possession", "totalShots": "Tirs", "shotsOnTarget": "Tirs cadrés",
    "wonCorners": "Corners", "saves": "Arrêts", "foulsCommitted": "Fautes",
    "yellowCards": "Cartons jaunes", "redCards": "Cartons rouges", "offsides": "Hors-jeu",
}


def nombre_ou_zero(valeur):
    try:
        return float(valeur)
    except (TypeError, ValueError):
        return 0


def forme_equipe(resume, equipe_id):
    bloc = next((b for b in resume.get("lastFiveGames", []) if b.get("team", {}).get("id") == equipe_id), {})
    return [{
        "resultat": {"W": "V", "D": "N", "L": "D"}.get(e.get("gameResult"), "N"),
        "adversaire": e.get("opponent", {}).get("displayName", ""),
        "score": e.get("score", ""),
        "date": e.get("gameDate", ""),
    } for e in bloc.get("events", [])]


def composition(resume, equipe_id):
    bloc = next((r for r in resume.get("rosters", []) if r.get("team", {}).get("id") == equipe_id), {})
    joueurs = [{
        "numero": j.get("jersey", ""),
        "nom": j["athlete"]["displayName"],
        "poste": j.get("position", {}).get("abbreviation", ""),
        "titulaire": j.get("starter", False),
        "entre": j.get("subbedIn", False),
        "sorti": j.get("subbedOut", False),
        "ordre": int(j.get("formationPlace") or 99),
    } for j in bloc.get("roster", [])]
    return {
        "formation": bloc.get("formation", ""),
        "titulaires": sorted((j for j in joueurs if j["titulaire"]), key=lambda j: j["ordre"]),
        "remplacants": [j for j in joueurs if not j["titulaire"]],
    }


@app.get("/matchs/{ligue}/{match_id}")
def get_match(ligue: str, match_id: str):
    if ligue not in COMPETITIONS or not match_id.isdigit():
        raise HTTPException(404, "Match introuvable")
    resume = get_json(f"{ESPN}/{ligue}/summary", {"event": match_id}, CACHE_DIRECT)
    c = resume["header"]["competitions"][0]
    statut = c["status"]["type"]
    etat = "reporte" if statut["state"] == "post" and not statut["completed"] else statut["state"]
    equipes = {e["homeAway"]: e for e in c["competitors"]}

    def equipe(cote):
        e = equipes[cote]
        return {
            "id": e["team"]["id"],
            "nom": e["team"]["displayName"],
            "logo": logo(e["team"]["id"]),
            "score": int(nombre_ou_zero(e.get("score"))) if etat in ("in", "post") else None,
            "forme": forme_equipe(resume, e["team"]["id"]),
            **composition(resume, e["team"]["id"]),
        }

    domicile, exterieur = equipe("home"), equipe("away")

    evenements = []
    for k in resume.get("keyEvents", []):
        texte = k.get("type", {}).get("text", "")
        if k.get("scoringPlay"):
            genre = "csc" if "Own" in texte else "penalty" if "Penalty" in texte else "but"
        elif "Red" in texte:
            genre = "rouge"
        elif "Yellow" in texte:
            genre = "jaune"
        else:
            continue
        joueurs = [p["athlete"]["displayName"] for p in k.get("participants", [])]
        evenements.append({
            "minute": k.get("clock", {}).get("displayValue", ""),
            "type": genre,
            "joueur": joueurs[0] if joueurs else "",
            "passeur": joueurs[1] if genre == "but" and len(joueurs) > 1 else "",
            "cote": "domicile" if k.get("team", {}).get("id") == domicile["id"] else "exterieur",
        })

    stats_equipes = {t["team"]["id"]: {s["name"]: s.get("displayValue") for s in t.get("statistics", [])}
                     for t in resume.get("boxscore", {}).get("teams", [])}
    stats_dom, stats_ext = stats_equipes.get(domicile["id"], {}), stats_equipes.get(exterieur["id"], {})
    stats = [{"nom": nom, "domicile": nombre_ou_zero(stats_dom.get(cle)), "exterieur": nombre_ou_zero(stats_ext.get(cle)),
              "pourcentage": cle == "possessionPct"}
             for cle, nom in STATS_MATCH.items() if cle in stats_dom or cle in stats_ext]
    if nombre_ou_zero(stats_dom.get("totalPasses")) and nombre_ou_zero(stats_ext.get("totalPasses")):
        precision = lambda s: round(100 * nombre_ou_zero(s.get("accuratePasses")) / nombre_ou_zero(s.get("totalPasses")))
        stats.insert(1, {"nom": "Passes réussies", "domicile": precision(stats_dom), "exterieur": precision(stats_ext),
                         "pourcentage": True})

    spectateurs = resume.get("gameInfo", {}).get("attendance")
    return {
        "id": match_id,
        "ligue": ligue,
        "competition": COMPETITIONS[ligue],
        "date": c["date"],
        "etat": etat,
        "statut": STATUTS.get(statut.get("description"), statut.get("description", "")),
        "minute": statut.get("shortDetail", "") if etat == "in" else "",
        "stade": resume.get("gameInfo", {}).get("venue", {}).get("fullName", ""),
        "spectateurs": spectateurs or None,
        "domicile": domicile,
        "exterieur": exterieur,
        "evenements": evenements,
        "stats": stats,
    }


def classement(slug):
    data = get_json(f"{ESPN_CLASSEMENTS}/{slug}/standings")
    lignes = []
    for groupe in data["children"]:
        for e in groupe["standings"]["entries"]:
            s = {x["name"]: x["displayValue"] for x in e["stats"]}
            zone = (e.get("note") or {}).get("description", "")
            lignes.append({
                "groupe": groupe["name"],
                "rang": int(s["rank"]),
                "logo": logo(e["team"]["id"]),
                "equipe": e["team"]["displayName"],
                "joues": int(s["gamesPlayed"]),
                "victoires": int(s["wins"]),
                "nuls": int(s["ties"]),
                "defaites": int(s["losses"]),
                "buts_pour": int(s["pointsFor"]),
                "buts_contre": int(s["pointsAgainst"]),
                "difference": int(s["pointDifferential"]),
                "points": int(s["points"]),
                "zone": ZONES.get(zone, zone),
                "porto": e["team"]["id"] == PORTO_ESPN,
            })
    saison = re.search(r"\d{4}-\d{2}", data["children"][0]["standings"].get("seasonDisplayName", ""))
    return {
        "saison": saison.group() if saison else "",
        "classement": sorted(lignes, key=lambda l: (l["groupe"], l["rang"])),
    }


@app.get("/classement/liga-portugal")
def get_classement_liga():
    return classement("por.1")


@app.get("/classement/champions-league")
def get_classement_ucl():
    return classement("uefa.champions")


@app.get("/porto/club")
def get_club():
    equipe = get_json(f"{ESPN}/por.1/teams/{PORTO_ESPN}")["team"]
    # les images et le texte c est du bonus : la fiche marche meme si thesportsdb ou wikipedia tombent
    sportsdb = optionnel(lambda: get_json(f"{SPORTSDB}/lookupteam.php", {"id": PORTO_SPORTSDB}, CACHE_LONG)["teams"][0], {})
    wiki = optionnel(lambda: get_json(f"{WIKIPEDIA}/api/rest_v1/page/summary/FC_Porto", duree=CACHE_LONG), {})
    return {
        "nom": equipe["displayName"],
        "logo": equipe["logos"][0]["href"],
        "fondation": sportsdb.get("intFormedYear"),
        "stade": sportsdb.get("strStadium"),
        "site": sportsdb.get("strWebsite"),
        "images": [sportsdb[k] for k in ("strFanart1", "strFanart2", "strFanart3", "strFanart4") if sportsdb.get(k)],
        "maillot": sportsdb.get("strEquipment"),
        "intro": wiki.get("extract", ""),
        "wikipedia": f"{WIKIPEDIA}/wiki/FC_Porto",
    }


@app.get("/porto/effectif")
def get_effectif():
    data = get_json(f"{ESPN}/por.1/teams/{PORTO_ESPN}/roster")
    joueurs = []
    for j in data.get("athletes", []):
        categories = (j.get("statistics") or {}).get("splits", {}).get("categories", [])
        stats = {s["name"]: s.get("value") or 0 for c in categories for s in c["stats"]}
        joueurs.append({
            "numero": int(j["jersey"]) if j.get("jersey", "").isdigit() else None,
            "nom": j["displayName"],
            "poste": POSTES.get(j.get("position", {}).get("abbreviation"), "Autres"),
            "age": j.get("age"),
            "nationalite": PAYS.get(j.get("citizenship", ""), j.get("citizenship", "")),
            "drapeau": (j.get("flag") or {}).get("href"),
            "matchs": int(stats.get("appearances", 0)),
            "buts": int(stats.get("totalGoals", 0)),
            "passes_decisives": int(stats.get("goalAssists", 0)),
            "cartons_jaunes": int(stats.get("yellowCards", 0)),
            "cartons_rouges": int(stats.get("redCards", 0)),
        })
    ordre = [*POSTES.values(), "Autres"]
    return sorted(joueurs, key=lambda j: (ordre.index(j["poste"]), j["numero"] or 99))


def nettoyer(texte):
    texte = re.sub(r"\[[^\]]*\]", "", texte)  # je vire les renvois genre [1], [réf. nécessaire]...
    texte = re.sub(r"^={4,} (.+?) =+\s*$", r"#### \1", texte, flags=re.M)
    return texte.strip()


def article_wikipedia(titre, exclus=WIKI_EXCLUS):
    data = get_json(f"{WIKIPEDIA}/w/api.php", {
        "action": "query", "prop": "extracts", "explaintext": 1, "titles": titre,
        "redirects": 1, "format": "json", "formatversion": 2,
    }, CACHE_LONG)
    texte = data["query"]["pages"][0]["extract"]
    morceaux = re.split(r"^(={2,3}) (.+?) ={2,3}\s*$", texte, flags=re.M)

    sections, partie = [], None
    for i in range(1, len(morceaux), 3):
        niveau, titre_section, contenu = morceaux[i], morceaux[i + 1], nettoyer(morceaux[i + 2])
        if niveau == "==":
            partie = titre_section
        if partie in exclus or len(contenu) < 50:
            continue
        sections.append({"partie": partie, "titre": titre_section, "texte": contenu})
    return {"intro": nettoyer(morceaux[0]), "sections": sections}


@app.get("/porto/histoire")
def get_histoire():
    article = article_wikipedia("FC Porto")
    article["wikipedia"] = f"{WIKIPEDIA}/wiki/FC_Porto"
    return article


def html_en_texte(contenu):
    contenu = re.sub(r"<style.*?</style>", "", contenu, flags=re.S)
    contenu = re.sub(r"<(br|/tr|/li|/p|/th|/dd|/dt)[^>]*>", "\n", contenu)
    contenu = html.unescape(re.sub(r"<[^>]+>", " ", contenu))
    contenu = re.sub(r"[ \t\xa0 ]+", " ", contenu)  # les espaces insecables aussi
    return re.sub(r"\n\s*\n+", "\n", contenu)


@app.get("/porto/palmares")
def get_palmares():
    params = {"action": "parse", "page": "FC_Porto", "redirects": 1, "format": "json", "formatversion": 2}
    sections = get_json(f"{WIKIPEDIA}/w/api.php", {**params, "prop": "sections"}, CACHE_LONG)["parse"]["sections"]
    index = next((s["index"] for s in sections if s["line"] == "Palmarès"), None)
    if index is None:
        raise HTTPException(502, "Section « Palmarès » introuvable sur Wikipédia")
    page = get_json(f"{WIKIPEDIA}/w/api.php", {**params, "prop": "text", "section": index}, CACHE_LONG)
    texte = html_en_texte(page["parse"]["text"])

    trophees = []
    for m in re.finditer(r"^ *(.+?) \((\d+)\) *\n *(?:Vainqueur|Champion) *: *(.+)$", texte, re.M):
        annees = re.sub(r"\s+([,.])", r"\1", m.group(3)).strip(" .,")
        trophees.append({"trophee": m.group(1).strip(), "titres": int(m.group(2)), "annees": annees})

    sections = article_wikipedia("FC Porto", exclus=set())["sections"]
    intro = next((s["texte"] for s in sections if s["titre"] == "Palmarès"), "")
    return {"intro": intro, "trophees": trophees, "wikipedia": f"{WIKIPEDIA}/wiki/FC_Porto#Palmarès"}


@app.get("/porto/stade")
def get_stade():
    stade = get_json(f"{SPORTSDB}/lookupvenue.php", {"id": STADE_SPORTSDB}, CACHE_LONG)["venues"][0]
    resume = get_json(f"{WIKIPEDIA}/api/rest_v1/page/summary/Stade_du_Dragon", duree=CACHE_LONG)
    article = article_wikipedia("Stade du Dragon")

    # la vraie capacite c est celle de l infobox wikipedia (thesportsdb donne un autre chiffre), thesportsdb si wikipedia repond pas
    infobox = optionnel(lambda: get_json(f"{WIKIPEDIA}/w/api.php", {
        "action": "parse", "page": "Stade_du_Dragon", "redirects": 1, "section": 0,
        "prop": "text", "format": "json", "formatversion": 2,
    }, CACHE_LONG)["parse"]["text"], "")
    capacite = re.search(r"Capacité\s*\n\s*(\d[\d ]*)", html_en_texte(infobox))
    return {
        "nom": stade["strVenue"],
        "nom_fr": resume.get("title"),
        "ville": stade.get("strLocation"),
        "capacite": int(capacite.group(1).replace(" ", "")) if capacite else int(stade["intCapacity"]),
        "inauguration": stade.get("intFormedYear"),
        "photos": [p for p in ((resume.get("originalimage") or {}).get("source"), stade.get("strThumb")) if p],
        "intro": article["intro"],
        "sections": article["sections"],
        "wikipedia": resume["content_urls"]["desktop"]["page"],
    }


@app.get("/saisons")
def get_saisons():
    try:
        arbre = get_json("https://api.github.com/repos/openfootball/football.json/git/trees/master",
                         {"recursive": 1}, CACHE_LONG)
    except requests.RequestException:
        # l api github limite les requetes par ip (et en ligne l ip est partagee) donc je teste les fichiers un par un
        return saisons_par_fichiers()
    return sorted((f["path"].split("/")[0] for f in arbre["tree"] if f["path"].endswith("/pt.1.json")), reverse=True)


def saisons_par_fichiers():
    if "saisons" in _cache and time.time() - _cache["saisons"][0] < CACHE_LONG:
        return _cache["saisons"][1]

    def existe(saison):
        try:
            return requests.head(f"{OPENFOOTBALL}/{saison}/pt.1.json", headers=HEADERS, timeout=10).ok
        except requests.RequestException:
            return False

    candidates = [f"{a}-{(a + 1) % 100:02d}" for a in range(datetime.now().year, 2009, -1)]
    with ThreadPoolExecutor(8) as pool:
        saisons = [s for s, ok in zip(candidates, pool.map(existe, candidates)) if ok]
    if not saisons:
        raise HTTPException(502, "Impossible de récupérer la liste des saisons")
    _cache["saisons"] = (time.time(), saisons)
    return saisons


@app.get("/saisons/{saison}")
def get_saison(saison: str):
    if not re.fullmatch(r"\d{4}-\d{2}", saison):
        raise HTTPException(400, "Format de saison attendu : 2024-25")
    data = get_json(f"{OPENFOOTBALL}/{saison}/pt.1.json", duree=3600)

    def score_final(m):
        # le score c est soit {"ft": [2, 1], "ht": [...]}, soit direct [2, 1]
        score = m.get("score")
        return score.get("ft") if isinstance(score, dict) else score

    def journee(m):
        numero = re.search(r"\d+", m.get("round", ""))
        return int(numero.group()) if numero else 0

    def classer(table):
        return sorted(table.values(), key=lambda t: (-t["points"], t["buts_contre"] - t["buts_pour"], -t["buts_pour"]))

    # je recalcule le classement avec les scores, journee par journee pour faire la courbe de porto
    table, matchs, evolution = {}, [], []
    joues = sorted((m for m in data["matches"] if score_final(m)), key=journee)
    for i, m in enumerate(joues):
        score = score_final(m)
        for equipe, pour, contre in ((m["team1"], *score), (m["team2"], *reversed(score))):
            t = table.setdefault(equipe, {"equipe": equipe, "joues": 0, "victoires": 0, "nuls": 0,
                                          "defaites": 0, "buts_pour": 0, "buts_contre": 0, "points": 0})
            t["joues"] += 1
            t["buts_pour"] += pour
            t["buts_contre"] += contre
            r = resultat(pour, contre)
            t[{"V": "victoires", "N": "nuls", "D": "defaites"}[r]] += 1
            t["points"] += {"V": 3, "N": 1, "D": 0}[r]
        if est_porto(m["team1"]) or est_porto(m["team2"]):
            porto_dom = est_porto(m["team1"])
            matchs.append({
                "date": m["date"],
                "competition": m.get("round", "").replace("Matchday", "Journée"),
                "domicile": m["team1"],
                "exterieur": m["team2"],
                "score_domicile": score[0],
                "score_exterieur": score[1],
                "etat": "post",
                "resultat": resultat(*(score if porto_dom else reversed(score))),
            })
        fin_de_journee = i == len(joues) - 1 or journee(joues[i + 1]) != journee(m)
        if fin_de_journee:
            classement = classer(table)
            porto = next((t for t in classement if est_porto(t["equipe"])), None)
            if porto:
                evolution.append({"journee": journee(m), "rang": classement.index(porto) + 1, "points": porto["points"]})

    lignes = classer(table)
    for rang, t in enumerate(lignes, 1):
        t.update(rang=rang, difference=t["buts_pour"] - t["buts_contre"], porto=est_porto(t["equipe"]))
    return {"saison": saison, "classement": lignes, "evolution": evolution,
            "matchs": sorted(matchs, key=lambda m: m["date"], reverse=True)}


@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    return RedirectResponse(logo(PORTO_ESPN))


SITE = Path(__file__).parent / "static"


@app.get("/", include_in_schema=False)
def accueil(request: Request):
    # whatsapp, discord etc veulent l adresse complete de l image d apercu donc je la construis
    # avec l adresse du site (localhost, vercel ou un nom de domaine)
    hote = request.headers.get("x-forwarded-host") or request.headers.get("host", "")
    protocole = request.headers.get("x-forwarded-proto") or request.url.scheme
    page = (SITE / "index.html").read_text(encoding="utf-8")
    return HTMLResponse(page.replace('content="/og.jpg"', f'content="{html.escape(f"{protocole}://{hote}")}/og.jpg"'))


# le reste du site (dossier static/) est servi a la racine, apres les routes de l api
app.mount("/", StaticFiles(directory=SITE, html=True), name="site")
