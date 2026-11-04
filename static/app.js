// FC Porto Wiki · site sur mesure, servi par api.py

const vue = document.getElementById("vue");
const LOGO_PORTO = "https://a.espncdn.com/i/teamlogos/soccer/500/437.png";
const reduit = matchMedia("(prefers-reduced-motion: reduce)").matches;

const COMPETITIONS = {
  "Liga Portugal": "liga",
  "Ligue des champions": "ldc",
  "Ligue Europa": "europa",
  "Ligue Conférence": "conf",
  "Coupe du Portugal": "coupe",
  "Coupe de la Ligue": "coupe",
  "Supercoupe du Portugal": "coupe",
};

const ZONES = {
  "Ligue des champions": "#5a8dff",
  "Qualif. Ligue des champions": "#9bb8ff",
  "Ligue Europa": "#ff9f43",
  "Qualif. Ligue Europa": "#ffc078",
  "Ligue Conférence": "#2bd67b",
  "Qualif. Ligue Conférence": "#7be3a8",
  "Qualifié en 8es": "#2bd67b",
  "Barrages (tête de série)": "#5a8dff",
  "Barrages": "#9bb8ff",
  "Relégation": "#ff4d5e",
  "Barrage de relégation": "#ff8a5c",
  "Éliminé": "#ff4d5e",
};

const RESULTATS = { V: "Victoire", N: "Match nul", D: "Défaite" };
const GRANDS_TROPHEES = ["Ligue des champions", "Ligue Europa", "intercontinentale", "Supercoupe de l", "Championnat du Portugal", "Coupe du Portugal"];
const INTERNATIONAUX = ["Ligue des champions", "Ligue Europa", "intercontinentale", "Supercoupe de l"];

// ---------- Outils ----------

// Bandeau affiché quand les données viennent de la mémoire de l'app (voir sw.js)
const bandeauHorsLigne = document.querySelector(".hors-ligne");
const signalerHorsLigne = (actif) => (bandeauHorsLigne.hidden = !actif);

// Cache d'une minute côté navigateur ; `frais` force un nouvel appel (matchs en direct)
const DUREE_CACHE = 60_000;
const cache = new Map();
function api(chemin, frais = false) {
  const entree = cache.get(chemin);
  if (!frais && entree && Date.now() - entree.date < DUREE_CACHE) return entree.requete;
  const requete = fetch(chemin).then(async (r) => {
    signalerHorsLigne(r.headers.has("x-hors-ligne"));
    if (!r.ok) {
      const corps = await r.json().catch(() => ({}));
      throw new Error(corps.detail || `Erreur ${r.status}`);
    }
    return r.json();
  }, () => {
    // Aucune réponse du réseau et rien en mémoire pour cette page
    signalerHorsLigne(true);
    throw Object.assign(new Error("Pas de connexion"), { horsLigne: true });
  });
  requete.catch(() => cache.delete(chemin));
  cache.set(chemin, { date: Date.now(), requete });
  return requete;
}

const resultatsOptionnels = async (promesses) =>
  (await Promise.allSettled(promesses)).map((r) => (r.status === "fulfilled" ? r.value : null));

const esc = (texte) => String(texte ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const enDate = (iso) => new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
const format = (options) => new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", ...options });
const premier = (texte) => texte.replace(/(^|\s)1(\s)/, "$11er$2"); // « 1 août » → « 1er août »
const jour = (iso) => premier(format({ weekday: "short", day: "numeric", month: "short" }).format(enDate(iso)));
const jourLong = (iso) => premier(format({ weekday: "long", day: "numeric", month: "long" }).format(enDate(iso)));
const heure = (iso) => format({ hour: "2-digit", minute: "2-digit" }).format(enDate(iso));
const mois = (iso) => format({ month: "long", year: "numeric" }).format(enDate(iso));
const nombre = (n) => new Intl.NumberFormat("fr-FR").format(n);
const rang = (n) => `${n}<sup>${n === 1 ? "er" : "e"}</sup>`;
const signe = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");
const pluriel = (n, mot) => `${mot}${n > 1 ? "s" : ""}`;
const estPorto = (nom) => nom.split(" ").includes("Porto");

function paragraphes(texte, lettrine = false) {
  return texte.split("\n").map((l) => l.trim()).filter(Boolean).map((ligne, i) => {
    if (ligne.startsWith("#### ")) return `<h4>${esc(ligne.slice(5))}</h4>`;
    return `<p${lettrine && i === 0 ? ' class="lettrine"' : ""}>${esc(ligne)}</p>`;
  }).join("");
}

// ---------- Composants ----------

const chargeur = (petit = false) => `<div class="chargeur${petit ? " petit" : ""}" aria-busy="true"><img src="${LOGO_PORTO}" alt=""><span>Chargement…</span></div>`;

const erreur = (e) => `
  <div class="conteneur"><div class="erreur">
    <h2>Hors-jeu</h2>
    <p>${e.horsLigne
      ? "Pas de connexion, et cette page n'a pas encore été enregistrée&#8239;: elle le sera à la prochaine visite en ligne."
      : `Une source de données ne répond pas&#8239;: ${esc(e.message)}`}</p>
    <button class="bouton" onclick="location.reload()">Réessayer</button>
  </div></div>`;

const enteteDePage = (surtitre, contour, plein, intro = "") => `
  <header class="page-entete conteneur">
    <span class="surtitre">${surtitre}</span>
    <h1 class="page-titre">${contour ? `<span class="contour">${contour}</span> ` : ""}${plein}</h1>
    ${intro ? `<p class="page-intro">${intro}</p>` : ""}
  </header>`;

const enteteDeSection = (surtitre, titre, lien = "", libelle = "") => `
  <div class="entete-section">
    <div>${surtitre ? `<span class="surtitre">${surtitre}</span>` : ""}<h2 class="titre-section">${titre}</h2></div>
    ${lien ? `<a class="lien-fleche" href="${lien}">${libelle}&nbsp;→</a>` : ""}
  </div>`;

function bandeStats(p, titre, avecRang = true) {
  return `
    <div class="stats${avecRang ? "" : " trois"}">
      ${avecRang ? `<div class="stat"><div class="stat-valeur">${rang(p.rang)}</div><div class="stat-label">${esc(titre)}</div></div>` : ""}
      <div class="stat"><div class="stat-valeur" data-compte="${p.points}">${p.points}</div><div class="stat-label">Points · ${p.joues} matchs</div></div>
      <div class="stat"><div class="stat-valeur">${p.victoires}<i>–</i>${p.nuls}<i>–</i>${p.defaites}</div><div class="stat-label">Victoires · nuls · défaites</div></div>
      <div class="stat"><div class="stat-valeur">${signe(p.difference)}</div><div class="stat-label">Buts ${p.buts_pour} pour · ${p.buts_contre} contre</div></div>
    </div>`;
}

// Logo manquant (ou absent du CDN d'ESPN pour les petits clubs) : initiale du club dans un rond
document.addEventListener("error", (e) => {
  const img = e.target;
  if (img.tagName !== "IMG") return;
  if (img.dataset.initiale) {
    img.replaceWith(Object.assign(document.createElement("span"), { className: "sans-logo", textContent: img.dataset.initiale }));
  } else {
    img.style.visibility = "hidden";
  }
}, true);

function equipe(nom, logo, cote) {
  const porto = estPorto(nom);
  const image = logo || (porto ? LOGO_PORTO : "");
  const initiale = esc(nom.replace(/^(FC|SC|CD|GD|CF|SL|AC|FK|Sport|Clube)\s+/i, "").charAt(0));
  const visuel = image
    ? `<img src="${esc(image)}" alt="" loading="lazy" data-initiale="${initiale}">`
    : `<span class="sans-logo">${initiale}</span>`;
  return `<div class="match-equipe ${cote}${porto ? " porto" : ""}">${visuel}<span class="nom">${esc(nom)}</span></div>`;
}

function ligneMatch(m) {
  let centre;
  if (m.etat === "pre") centre = `<div class="match-score heure">${heure(m.date)}</div>`;
  else if (m.etat === "reporte") centre = `<div class="match-score heure">Reporté</div>`;
  else centre = `<div class="match-score">${m.score_domicile}<i>–</i>${m.score_exterieur}</div>`;

  let badge = "";
  if (m.resultat) badge = `<span class="res ${m.resultat}" title="${RESULTATS[m.resultat]}">${m.resultat}</span>`;
  else if (m.etat === "in") badge = `<span class="direct">Live</span>`;

  // Les matchs ESPN ont une fiche détaillée ; ceux d'openfootball (saisons passées) non
  const balise = m.id ? "a" : "article";
  const lien = m.id ? ` href="#/match/${esc(m.ligue)}/${esc(m.id)}"` : "";
  return `
    <${balise} class="match"${lien}>
      <div class="match-date"><strong>${esc(jour(m.date))}</strong><span class="tag ${COMPETITIONS[m.competition] ?? ""}">${esc(m.competition)}</span></div>
      ${equipe(m.domicile, m.domicile_logo, "dom")}
      ${centre}
      ${equipe(m.exterieur, m.exterieur_logo, "ext")}
      <div class="match-res">${badge}</div>
    </${balise}>`;
}

const formeMini = (forme) => `<div class="forme mini">${forme.map((f) => `<span class="res ${f.resultat}" title="${esc(`${RESULTATS[f.resultat]} ${f.score} contre ${f.adversaire}`)}">${f.resultat}</span>`).join("")}</div>`;

const ICONES = {
  but: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#eef2ff"/><path d="M12 6.8l4.2 3-1.6 4.9H9.4L7.8 9.8z" fill="#040919"/></svg>`,
  jaune: `<i class="carton jaune"></i>`,
  rouge: `<i class="carton rouge"></i>`,
};
ICONES.penalty = ICONES.but;
ICONES.csc = ICONES.but;
const PRECISIONS = { penalty: "sur penalty", csc: "contre son camp", jaune: "Carton jaune", rouge: "Carton rouge" };

function buteurs(d) {
  const buts = d.evenements.filter((e) => ["but", "penalty", "csc"].includes(e.type));
  if (!buts.length) return "";
  const colonne = (cote) => `<ul>${buts.filter((e) => e.cote === cote).map((e) => `<li>${esc(e.joueur)} <span>${esc(e.minute)}${e.type === "penalty" ? " (pen.)" : e.type === "csc" ? " (c.s.c.)" : ""}</span></li>`).join("")}</ul>`;
  return `<div class="buteurs">${colonne("domicile")}<span class="buteurs-icone">${ICONES.but}</span>${colonne("exterieur")}</div>`;
}

function listeMatchs(matchs) {
  if (!matchs.length) return `<p class="vide">Aucun match à afficher.</p>`;
  let html = "";
  let courant = "";
  for (const m of matchs) {
    const titre = mois(m.date);
    if (titre !== courant) {
      html += `<h3 class="mois">${esc(titre)}</h3>`;
      courant = titre;
    }
    html += ligneMatch(m);
  }
  return `<div class="matchs">${html}</div>`;
}

const forme = (matchs) => `<div class="forme">${matchs.filter((m) => m.resultat).map((m) => `<span class="res ${m.resultat}" title="${esc(`${RESULTATS[m.resultat]} · ${m.domicile} ${m.score_domicile}–${m.score_exterieur} ${m.exterieur}`)}">${m.resultat}</span>`).join("")}</div>`;

function tableau(lignes, compact = false) {
  const corps = lignes.map((l) => `
    <tr class="${l.porto ? "porto" : ""}" style="--zone: ${ZONES[l.zone] ?? "transparent"}"${l.zone ? ` title="${esc(l.zone)}"` : ""}>
      <td class="rang">${l.rang}</td>
      <td class="col-equipe"><div class="equipe-cell">${l.logo ? `<img src="${esc(l.logo)}" alt="" loading="lazy">` : ""}<span>${esc(l.equipe)}</span></div></td>
      <td>${l.joues}</td>
      <td class="detail">${l.victoires}</td>
      <td class="detail">${l.nuls}</td>
      <td class="detail">${l.defaites}</td>
      <td class="detail">${l.buts_pour}</td>
      <td class="detail">${l.buts_contre}</td>
      <td>${signe(l.difference)}</td>
      <td class="pts">${l.points}</td>
    </tr>`).join("");
  return `
    <div class="tableau-cadre"><table class="tableau${compact ? " compact" : ""}">
      <thead><tr>
        <th class="rang">#</th><th class="col-equipe">Équipe</th><th>J</th>
        <th class="detail">V</th><th class="detail">N</th><th class="detail">D</th>
        <th class="detail">BP</th><th class="detail">BC</th><th>Diff.</th><th>Pts</th>
      </tr></thead>
      <tbody>${corps}</tbody>
    </table></div>`;
}

function legende(lignes) {
  const zones = [...new Set(lignes.map((l) => l.zone).filter(Boolean))];
  return `<ul class="legende">${zones.map((z) => `<li><i style="background: ${ZONES[z] ?? "#888"}"></i>${esc(z)}</li>`).join("")}</ul>`;
}

// ---------- Animations ----------

// Minuteurs de la page en cours (compte à rebours, suivi du direct), arrêtés à chaque navigation
let minuteurs = [];
const repeter = (fonction, ms) => {
  const id = setInterval(fonction, ms);
  minuteurs.push(id);
  return id;
};

function compter(el) {
  const fin = Number(el.dataset.compte);
  if (reduit || !Number.isFinite(fin)) return;
  const debut = performance.now();
  const etape = (t) => {
    const avancement = Math.min(1, (t - debut) / 1300);
    const valeur = Math.round(fin * (1 - Math.pow(1 - avancement, 3)));
    el.textContent = el.dataset.format === "nombre" ? nombre(valeur) : valeur;
    if (avancement < 1) requestAnimationFrame(etape);
  };
  requestAnimationFrame(etape);
}

const observateur = new IntersectionObserver((entrees) => {
  for (const entree of entrees) {
    if (!entree.isIntersecting) continue;
    const el = entree.target;
    observateur.unobserve(el);
    if (el.classList.contains("apparait")) el.classList.add("visible");
    if (el.dataset.compte) compter(el);
  }
}, { threshold: 0.15 });

function animer(racine) {
  racine.querySelectorAll(".apparait:not(.visible), [data-compte]").forEach((el) => observateur.observe(el));
}

// Compte à rebours dans #compte ; appelle `auCoupDEnvoi` une fois arrivé à zéro
function demarrerCompteARebours(date, auCoupDEnvoi) {
  const el = document.getElementById("compte");
  if (!el) return;
  const cible = enDate(date).getTime();
  const bloc = (valeur, unite) => `<div><b>${String(valeur).padStart(2, "0")}</b><small>${unite}</small></div>`;
  let id;
  const maj = () => {
    const reste = cible - Date.now();
    if (reste <= 0) {
      clearInterval(id);
      el.innerHTML = `<div class="direct">C’est parti</div>`;
      auCoupDEnvoi?.();
      return;
    }
    const j = Math.floor(reste / 864e5);
    const h = Math.floor(reste / 36e5) % 24;
    const min = Math.floor(reste / 6e4) % 60;
    const s = Math.floor(reste / 1e3) % 60;
    el.innerHTML = (j ? bloc(j, pluriel(j, "jour")) : "") + bloc(h, "h") + bloc(min, "min") + bloc(s, "s");
  };
  id = repeter(maj, 1000);
  maj();
}

// Recharge une fiche de match toutes les 30 s tant qu'il est en cours
function suivreLeDirect(chemin, rendu) {
  const id = repeter(async () => {
    const detail = await api(chemin, true).catch(() => null);
    if (!detail) return;
    rendu(detail);
    if (detail.etat !== "in" && detail.etat !== "pre") clearInterval(id);
  }, 30_000);
}

// ---------- Pages ----------

// Partie centrale de l'affiche : compte à rebours avant le match, score ensuite
function centreAffiche(d) {
  if (d.etat === "pre") {
    return `<div class="compte" id="compte"></div><div class="affiche-heure">Coup d’envoi <strong>${heure(d.date)}</strong></div>`;
  }
  const statut = d.etat === "in" ? `<span class="direct">En direct</span> · ${esc(d.minute)}` : esc(d.statut);
  return `<div class="score-direct"><b>${d.domicile.score ?? 0}</b><i>–</i><b>${d.exterieur.score ?? 0}</b></div><div class="affiche-heure">${statut}</div>`;
}

function affiche(m) {
  return `
    <section class="conteneur section">
      <div class="apparait">${m.id
        ? enteteDeSection(esc(m.competition), `<span id="affiche-titre">Prochain match</span>`, `#/match/${esc(m.ligue)}/${esc(m.id)}`, "Fiche du match")
        : enteteDeSection(esc(m.competition), "Prochain match", "#/matchs", "Calendrier")}</div>
      <article class="affiche apparait">
        <div class="affiche-meta"><span>${esc(jourLong(m.date))}</span><span>${esc(m.stade)}</span></div>
        <div class="affiche-duel">
          <div class="affiche-equipe"><img src="${esc(m.domicile_logo)}" alt=""><div>${esc(m.domicile)}<small>Domicile</small></div><div id="forme-domicile"></div></div>
          <div class="affiche-centre" id="affiche-centre">${centreAffiche({ ...m, statut: m.etat === "reporte" ? "Reporté" : "", minute: "", domicile: { score: m.score_domicile }, exterieur: { score: m.score_exterieur } })}</div>
          <div class="affiche-equipe"><img src="${esc(m.exterieur_logo)}" alt=""><div>${esc(m.exterieur)}<small>Extérieur</small></div><div id="forme-exterieur"></div></div>
        </div>
        <div id="affiche-buts"></div>
      </article>
    </section>`;
}

// Branche l'affiche sur la fiche du match : forme des équipes, puis score en direct
function brancherAffiche(m) {
  const chemin = `/matchs/${m.ligue}/${m.id}`;
  let suivi = false;
  const rendu = (d) => {
    document.getElementById("forme-domicile").innerHTML = formeMini(d.domicile.forme);
    document.getElementById("forme-exterieur").innerHTML = formeMini(d.exterieur.forme);
    if (d.etat === "pre") return;
    document.getElementById("affiche-titre").textContent = d.etat === "in" ? "En direct" : "Score final";
    document.getElementById("affiche-centre").innerHTML = centreAffiche(d);
    document.getElementById("affiche-buts").innerHTML = buteurs(d);
  };
  const suivre = () => {
    if (suivi) return;
    suivi = true;
    suivreLeDirect(chemin, rendu);
  };
  if (m.etat === "pre") demarrerCompteARebours(m.date, suivre);
  api(chemin).then((d) => {
    rendu(d);
    if (d.etat === "in") suivre();
  }).catch(() => {});
}

async function accueil() {
  // Matchs et classement sont indispensables ; le reste est un bonus qui peut manquer
  const optionnels = resultatsOptionnels([api("/porto/club"), api("/porto/stade"), api("/porto/palmares")]);
  const [liga, prochains, resultats] = await Promise.all([
    api("/classement/liga-portugal"), api("/porto/matchs"), api("/porto/resultats"),
  ]);
  const [club, stade, palmares] = await optionnels;

  const porto = liga.classement.find((l) => l.porto);
  const enDirect = resultats.find((m) => m.etat === "in");
  const suivant = enDirect ?? prochains[0];
  const derniers = resultats.filter((m) => m.etat === "post").slice(0, 5);
  const titres = (mot) => palmares?.trophees.find((t) => t.trophee.includes(mot))?.titres ?? 0;
  const internationaux = (palmares?.trophees ?? [])
    .filter((t) => INTERNATIONAUX.some((mot) => t.trophee.includes(mot)))
    .reduce((total, t) => total + t.titres, 0);

  const chiffres = palmares ? `
    <div class="chiffres">
      <div><strong data-compte="${titres("Championnat du Portugal")}">${titres("Championnat du Portugal")}</strong><span>Championnats</span></div>
      <div><strong data-compte="${titres("Coupe du Portugal")}">${titres("Coupe du Portugal")}</strong><span>Coupes du Portugal</span></div>
      <div><strong data-compte="${internationaux}">${internationaux}</strong><span>Trophées internationaux</span></div>
    </div>` : "";

  const blocClub = club?.intro ? `
    <section class="conteneur section club">
      <figure class="club-image apparait"><img src="${esc(club.images[0] ?? club.logo)}" alt="" loading="lazy"></figure>
      <div class="apparait">
        <span class="surtitre">Le club</span>
        <h2 class="titre-section">Os Dragões</h2>
        <p class="club-texte">${esc(club.intro)}</p>
        ${chiffres}
        <div class="boutons">
          <a class="bouton" href="#/histoire">Lire l’histoire</a>
          <a class="bouton fantome" href="#/palmares">Voir le palmarès</a>
        </div>
      </div>
    </section>` : "";

  return {
    titre: "Accueil",
    html: `
      <section class="hero">
        <div class="hero-photo" style="--photo: url('${esc(stade?.photos[0] ?? "")}')"></div>
        <div class="hero-teinte"></div>
        <div class="projecteurs" aria-hidden="true"></div>
        <div class="conteneur hero-grille">
          <div>
            <p class="hero-sur">Futebol Clube do Porto${club?.fondation ? ` · depuis ${esc(club.fondation)}` : ""}</p>
            <h1 class="hero-titre"><span class="contour">FC</span><span class="plein">Porto</span></h1>
            ${porto ? bandeStats(porto, `Liga Portugal ${liga.saison}`) : ""}
          </div>
          <img class="hero-blason" src="${esc(club?.logo ?? LOGO_PORTO)}" alt="Blason du FC Porto">
        </div>
      </section>

      ${suivant ? affiche(suivant) : ""}

      <section class="conteneur section duo">
        <div class="apparait">
          ${enteteDeSection("Les 5 derniers matchs", "Forme du moment", "#/matchs", "Résultats")}
          ${forme([...derniers].reverse())}
          <div class="matchs">${derniers.map(ligneMatch).join("")}</div>
        </div>
        <div class="apparait">
          ${enteteDeSection(`Liga Portugal ${esc(liga.saison)}`, "Classement", "#/classements", "Complet")}
          ${tableau(liga.classement.filter((l) => l.rang <= 6 || l.porto), true)}
        </div>
      </section>

      ${blocClub}`,
    // Les coupes lues sur Wikipédia n'ont pas de fiche ESPN : compte à rebours seul, sans suivi du direct
    init: () => suivant && (suivant.id ? brancherAffiche(suivant) : demarrerCompteARebours(suivant.date)),
  };
}

function ficheMatch(d) {
  const dom = d.domicile;
  const ext = d.exterieur;
  const portoADomicile = estPorto(dom.nom);
  const centre = d.etat === "pre"
    ? `<div class="compte" id="compte"></div><div class="fiche-statut">Coup d’envoi ${heure(d.date)}</div>`
    : `<div class="fiche-score"><b>${dom.score}</b><i>–</i><b>${ext.score}</b></div>
       <div class="fiche-statut">${d.etat === "in" ? `<span class="direct">En direct</span> · ${esc(d.minute)}` : esc(d.statut)}</div>`;

  const equipeFiche = (e) => `
    <div class="fiche-equipe">
      <img src="${esc(e.logo)}" alt="">
      <h2>${esc(e.nom)}</h2>
      ${e.forme.length ? formeMini(e.forme) : ""}
    </div>`;

  const chrono = d.evenements.map((e) => `
    <li class="evt ${e.cote}">
      <span class="evt-texte"><strong>${esc(e.joueur)}</strong>${e.passeur ? `<small>Passe de ${esc(e.passeur)}</small>` : PRECISIONS[e.type] ? `<small>${PRECISIONS[e.type]}</small>` : ""}</span>
      <span class="evt-icone">${ICONES[e.type]}</span>
      <span class="evt-minute">${esc(e.minute)}</span>
    </li>`).join("");

  const barres = d.stats.map((s) => {
    const total = s.domicile + s.exterieur;
    const part = total ? (s.domicile / total) * 100 : 50;
    const valeur = (v) => `${Math.round(v)}${s.pourcentage ? "&#8239;%" : ""}`;
    return `
      <div class="barre-stat">
        <div class="barre-stat-valeurs"><b>${valeur(s.domicile)}</b><span>${esc(s.nom)}</span><b>${valeur(s.exterieur)}</b></div>
        <div class="barre-stat-piste${portoADomicile ? "" : " inverse"}"><i style="width: ${part}%"></i><i style="width: ${100 - part}%"></i></div>
      </div>`;
  }).join("");

  const compo = (e) => `
    <div class="compo">
      <div class="compo-entete"><img src="${esc(e.logo)}" alt=""><div><strong>${esc(e.nom)}</strong>${e.formation ? `<span>${esc(e.formation)}</span>` : ""}</div></div>
      <ol class="compo-liste">${e.titulaires.map((j) => `<li><span class="num">${esc(j.numero)}</span>${esc(j.nom)}${j.sorti ? `<i class="sortie" title="Remplacé">↓</i>` : ""}</li>`).join("")}</ol>
      ${e.remplacants.length ? `<h4>Remplaçants</h4><ul class="compo-liste banc">${e.remplacants.map((j) => `<li><span class="num">${esc(j.numero)}</span>${esc(j.nom)}${j.entre ? `<i class="entree" title="Entré en jeu">↑</i>` : ""}</li>`).join("")}</ul>` : ""}
    </div>`;

  const formeDetaillee = (e) => `
    <div class="forme-detail">
      <h4>${esc(e.nom)}</h4>
      <ul>${[...e.forme].reverse().map((f) => `<li><span class="res ${f.resultat}">${f.resultat}</span><span class="forme-adv">${esc(f.adversaire)}</span><span class="forme-score">${esc(f.score)}</span></li>`).join("")}</ul>
    </div>`;

  const aDesCompos = dom.titulaires.length && ext.titulaires.length;
  const aUneForme = dom.forme.length || ext.forme.length;

  return `
    <section class="fiche-entete" style="--logo-dom: url('${esc(dom.logo)}'); --logo-ext: url('${esc(ext.logo)}')">
      <div class="conteneur">
        <a class="lien-fleche retour" href="#/matchs">←&nbsp;Matchs</a>
        <div class="fiche-meta">
          <span class="tag ${COMPETITIONS[d.competition] ?? ""}">${esc(d.competition)}</span>
          <span>${esc(jourLong(d.date))} · ${heure(d.date)}</span>
          ${d.stade ? `<span>${esc(d.stade)}</span>` : ""}
          ${d.spectateurs ? `<span>${nombre(d.spectateurs)} spectateurs</span>` : ""}
        </div>
        <div class="fiche-duel">${equipeFiche(dom)}<div class="fiche-centre">${centre}</div>${equipeFiche(ext)}</div>
        ${buteurs(d)}
      </div>
    </section>
    <section class="conteneur section-courte fiche-corps">
      <div class="fiche-colonne">
        ${chrono ? `<div class="bloc">${enteteDeSection("", "Le film du match")}<ol class="chrono">${chrono}</ol></div>` : ""}
        ${barres ? `<div class="bloc">${enteteDeSection("", "Statistiques")}<div class="barres-stats">${barres}</div></div>` : ""}
        ${aUneForme ? `<div class="bloc">${enteteDeSection("5 derniers matchs", "Forme")}<div class="formes">${formeDetaillee(dom)}${formeDetaillee(ext)}</div></div>` : ""}
      </div>
      <div class="fiche-colonne">
        <div class="bloc">
          ${enteteDeSection("", "Compositions")}
          ${aDesCompos ? `<div class="compos">${compo(dom)}${compo(ext)}</div>` : `<p class="vide">Les compositions sont annoncées environ une heure avant le coup d’envoi.</p>`}
        </div>
      </div>
    </section>`;
}

async function pageMatch(ligue, id) {
  const chemin = `/matchs/${ligue}/${id}`;
  const d = await api(chemin);
  return {
    titre: `${d.domicile.nom} – ${d.exterieur.nom}`,
    html: `<div id="fiche">${ficheMatch(d)}</div>`,
    init: (racine) => {
      const rendu = (detail) => {
        racine.querySelector("#fiche").innerHTML = ficheMatch(detail);
        if (detail.etat === "pre") demarrerCompteARebours(detail.date);
      };
      if (d.etat === "pre") demarrerCompteARebours(d.date, () => suivreLeDirect(chemin, rendu));
      if (d.etat === "in") suivreLeDirect(chemin, rendu);
    },
  };
}

async function matchs() {
  const [prochains, resultats] = await Promise.all([api("/porto/matchs"), api("/porto/resultats")]);
  const competitions = [...new Set([...resultats, ...prochains].map((m) => m.competition))];

  return {
    titre: "Matchs",
    html: `
      ${enteteDePage("Saison en cours", "Les", "matchs", "Calendrier et résultats du FC Porto dans toutes les compétitions. Horaires à l’heure de Paris.")}
      <section class="conteneur section-courte">
        <div class="outils">
          <div class="segment" role="tablist">
            <button role="tab" aria-selected="true" data-onglet="venir">À venir <span>${prochains.length}</span></button>
            <button role="tab" aria-selected="false" data-onglet="resultats">Résultats <span>${resultats.length}</span></button>
          </div>
          <div class="puces">${competitions.map((c) => `<button class="puce" aria-pressed="true" data-comp="${esc(c)}">${esc(c)}</button>`).join("")}</div>
        </div>
        <div id="liste"></div>
      </section>`,
    init: (racine) => {
      let onglet = "venir";
      const actives = new Set(competitions);
      const rendu = () => {
        const liste = (onglet === "venir" ? prochains : resultats).filter((m) => actives.has(m.competition));
        const bilan = onglet === "resultats" && liste.length
          ? `<div class="bloc-forme"><span class="surtitre">Forme · du plus ancien au plus récent</span>${forme([...liste].reverse())}</div>` : "";
        racine.querySelector("#liste").innerHTML = bilan + listeMatchs(liste);
      };
      racine.querySelectorAll("[data-onglet]").forEach((bouton) => bouton.addEventListener("click", () => {
        onglet = bouton.dataset.onglet;
        racine.querySelectorAll("[data-onglet]").forEach((b) => b.setAttribute("aria-selected", b === bouton));
        rendu();
      }));
      racine.querySelectorAll("[data-comp]").forEach((bouton) => bouton.addEventListener("click", () => {
        const c = bouton.dataset.comp;
        if (actives.has(c)) actives.delete(c); else actives.add(c);
        bouton.setAttribute("aria-pressed", actives.has(c));
        rendu();
      }));
      rendu();
    },
  };
}

async function classements() {
  const [liga, ucl] = await Promise.all([api("/classement/liga-portugal"), api("/classement/champions-league")]);
  const vues = {
    liga: { data: liga, note: `Liga Portugal · saison ${liga.saison} · source ESPN` },
    ucl: { data: ucl, note: `Ligue des champions · phase de ligue ${ucl.saison} · source ESPN` },
  };

  return {
    titre: "Classements",
    html: `
      ${enteteDePage(`Saison ${esc(liga.saison)}`, "Les", "classements")}
      <section class="conteneur section-courte">
        <div class="outils">
          <div class="segment" role="tablist">
            <button role="tab" aria-selected="true" data-vue="liga">Liga Portugal</button>
            <button role="tab" aria-selected="false" data-vue="ucl">Ligue des champions</button>
          </div>
        </div>
        <div id="classement"></div>
      </section>`,
    init: (racine) => {
      const rendu = (cle) => {
        const { data, note } = vues[cle];
        const groupes = [...new Set(data.classement.map((l) => l.groupe))];
        racine.querySelector("#classement").innerHTML = groupes.map((g) =>
          (groupes.length > 1 ? `<h3 class="mois">${esc(g)}</h3>` : "") + tableau(data.classement.filter((l) => l.groupe === g)),
        ).join("") + legende(data.classement) + `<p class="note">${esc(note)}</p>`;
      };
      racine.querySelectorAll("[data-vue]").forEach((bouton) => bouton.addEventListener("click", () => {
        racine.querySelectorAll("[data-vue]").forEach((b) => b.setAttribute("aria-selected", b === bouton));
        rendu(bouton.dataset.vue);
      }));
      rendu("liga");
    },
  };
}

function carteJoueur(j) {
  const mots = j.nom.split(" ");
  const prenom = mots.length > 1 ? mots[0] : "";
  const nom = mots.length > 1 ? mots.slice(1).join(" ") : j.nom;
  return `
    <article class="joueur apparait">
      <span class="joueur-num" aria-hidden="true">${j.numero ?? ""}</span>
      <div>
        <div class="joueur-nom">${prenom ? `<small>${esc(prenom)}</small>` : ""}${esc(nom)}</div>
        <div class="joueur-pays">${j.drapeau ? `<img src="${esc(j.drapeau)}" alt="" loading="lazy">` : ""}${esc(j.nationalite)}${j.age ? ` · ${j.age}&nbsp;ans` : ""}</div>
      </div>
      <div class="joueur-stats">
        <div>${j.matchs}<span>Matchs</span></div>
        <div>${j.buts}<span>Buts</span></div>
        <div>${j.passes_decisives}<span>Passes D.</span></div>
      </div>
    </article>`;
}

async function effectif() {
  const [joueurs, liga] = await Promise.all([api("/porto/effectif"), api("/classement/liga-portugal")]);
  const meilleur = (cle) => joueurs.reduce((a, b) => (b[cle] > a[cle] ? b : a));
  const leaders = [
    ["Meilleur buteur", meilleur("buts"), "buts"],
    ["Meilleur passeur", meilleur("passes_decisives"), "passes_decisives"],
    ["Le plus utilisé", meilleur("matchs"), "matchs"],
  ];
  const ages = joueurs.filter((j) => j.age).map((j) => j.age);
  const ageMoyen = (ages.reduce((a, b) => a + b, 0) / ages.length).toFixed(1).replace(".", ",");
  const postes = [...new Set(joueurs.map((j) => j.poste))];

  return {
    titre: "Effectif",
    html: `
      ${enteteDePage(`Saison ${esc(liga.saison)}`, "Os", "Dragões", `${joueurs.length} joueurs, ${ageMoyen}&nbsp;ans de moyenne. Statistiques en Liga Portugal, source ESPN.`)}
      <section class="conteneur section-courte">
        <div class="leaders">
          ${leaders.map(([label, j, cle]) => `
            <div class="leader apparait">
              <div><div class="leader-label">${label}</div><div class="leader-nom">${esc(j.nom)}</div></div>
              <div class="leader-valeur" data-compte="${j[cle]}">${j[cle]}</div>
            </div>`).join("")}
        </div>
        ${postes.map((poste) => {
          const groupe = joueurs.filter((j) => j.poste === poste);
          return `<h2 class="poste">${esc(poste)} <span>${groupe.length}</span></h2><div class="joueurs">${groupe.map(carteJoueur).join("")}</div>`;
        }).join("")}
      </section>`,
  };
}

async function histoire() {
  const article = await api("/porto/histoire");
  const parties = [...new Set(article.sections.map((s) => s.partie))];
  let sommaire = "";
  let corps = "";
  parties.forEach((partie, i) => {
    sommaire += `<span class="partie">${esc(partie)}</span>`;
    corps += `<h2><span>${String(i + 1).padStart(2, "0")}</span>${esc(partie)}</h2>`;
    article.sections.filter((s) => s.partie === partie).forEach((s, k) => {
      const id = `section-${i}-${k}`;
      sommaire += `<a href="#/histoire" data-cible="${id}">${esc(s.titre)}</a>`;
      corps += `<h3 id="${id}">${esc(s.titre)}</h3>${paragraphes(s.texte, i === 0 && k === 0)}`;
    });
  });

  return {
    titre: "Histoire",
    html: `
      ${enteteDePage("Depuis 1893", "L’", "histoire")}
      <section class="conteneur section-courte">
        <p class="chapo apparait">${esc(article.intro)}</p>
      </section>
      <section class="conteneur section-courte lecture">
        <nav class="sommaire" aria-label="Sommaire">${sommaire}</nav>
        <article class="article">${corps}
          <p class="note">Texte&#8239;: <a href="${esc(article.wikipedia)}">Wikipédia</a>, licence <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.fr">CC BY-SA 4.0</a>.</p>
        </article>
      </section>`,
    init: (racine) => {
      const liens = racine.querySelectorAll(".sommaire a");
      liens.forEach((lien) => lien.addEventListener("click", (e) => {
        e.preventDefault();
        document.getElementById(lien.dataset.cible)?.scrollIntoView({ behavior: reduit ? "auto" : "smooth" });
      }));
      const suivi = new IntersectionObserver((entrees) => {
        for (const entree of entrees) {
          if (!entree.isIntersecting) continue;
          liens.forEach((l) => l.classList.toggle("actif", l.dataset.cible === entree.target.id));
        }
      }, { rootMargin: "-20% 0px -70% 0px" });
      racine.querySelectorAll(".article h3").forEach((h) => suivi.observe(h));
    },
  };
}

async function palmares() {
  const data = await api("/porto/palmares");
  const grands = data.trophees.filter((t) => GRANDS_TROPHEES.some((mot) => t.trophee.includes(mot)));
  const autres = data.trophees.filter((t) => !grands.includes(t));
  const somme = (liste) => liste.reduce((total, t) => total + t.titres, 0);
  const internationaux = somme(data.trophees.filter((t) => INTERNATIONAUX.some((mot) => t.trophee.includes(mot))));
  const championnats = data.trophees.find((t) => t.trophee.includes("Championnat du Portugal"));
  const coupes = data.trophees.find((t) => t.trophee.includes("Coupe du Portugal"));
  const annees = (texte) => texte.split(/,\s*|\s+et\s+/).filter(Boolean);

  return {
    titre: "Palmarès",
    html: `
      ${enteteDePage("Salle des trophées", "Le", "palmarès")}
      <section class="conteneur section-courte">
        <div class="stats or apparait">
          <div class="stat"><div class="stat-valeur" data-compte="${internationaux}">${internationaux}</div><div class="stat-label">Trophées internationaux</div></div>
          <div class="stat"><div class="stat-valeur" data-compte="${championnats?.titres ?? 0}">${championnats?.titres ?? 0}</div><div class="stat-label">Championnats du Portugal</div></div>
          <div class="stat"><div class="stat-valeur" data-compte="${coupes?.titres ?? 0}">${coupes?.titres ?? 0}</div><div class="stat-label">Coupes du Portugal</div></div>
          <div class="stat"><div class="stat-valeur" data-compte="${somme(data.trophees)}">${somme(data.trophees)}</div><div class="stat-label">Titres au total</div></div>
        </div>
      </section>
      <section class="conteneur section">
        <div class="apparait">${enteteDeSection("Europe, monde et Portugal", "Les grands titres")}</div>
        <div class="vitrine">
          ${grands.map((t) => `
            <article class="trophee apparait">
              <div class="trophee-nombre" data-compte="${t.titres}">${t.titres}</div>
              <h3 class="trophee-nom">${esc(t.trophee.split(" / ").at(-1))}</h3>
              <ul class="annees">${annees(t.annees).map((a) => `<li>${esc(a)}</li>`).join("")}</ul>
            </article>`).join("")}
        </div>
      </section>
      <section class="conteneur section-courte">
        <div class="apparait">${enteteDeSection("Coupes régionales et tournois", "Et aussi")}</div>
        <div class="autres">
          ${autres.map((t) => `
            <div class="autre apparait">
              <strong>${t.titres}</strong>
              <div><h3>${esc(t.trophee)}</h3><p>${esc(t.annees)}</p></div>
            </div>`).join("")}
        </div>
        <p class="note">${esc(data.intro.split("\n")[0] ?? "")} Source&#8239;: <a href="${esc(data.wikipedia)}">Wikipédia</a>.</p>
      </section>`,
  };
}

async function stade() {
  const s = await api("/porto/stade");
  return {
    titre: "Stade",
    html: `
      <section class="stade-hero">
        <div class="photo" style="--photo: url('${esc(s.photos[0] ?? "")}')"></div>
        <div class="conteneur">
          <span class="surtitre">${esc(s.nom_fr)} · ${esc(s.ville)}</span>
          <h1 class="page-titre">${esc(s.nom)}</h1>
          <div class="stats trois">
            <div class="stat"><div class="stat-valeur" data-compte="${s.capacite}" data-format="nombre">${nombre(s.capacite)}</div><div class="stat-label">Places</div></div>
            <div class="stat"><div class="stat-valeur">${esc(s.inauguration)}</div><div class="stat-label">Inauguration</div></div>
            <div class="stat"><div class="stat-valeur">${esc(s.ville)}</div><div class="stat-label">Ville</div></div>
          </div>
        </div>
      </section>
      <section class="conteneur section stade-corps">
        <div>
          <div class="apparait">${paragraphes(s.intro)}</div>
          <div class="accordeon">
            ${s.sections.map((section) => `
              <details class="apparait">
                <summary>${esc(section.titre)}</summary>
                <div class="contenu">${paragraphes(section.texte)}</div>
              </details>`).join("")}
          </div>
          <p class="note">Texte&#8239;: <a href="${esc(s.wikipedia)}">Wikipédia</a>, licence <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.fr">CC BY-SA 4.0</a>.</p>
        </div>
        ${s.photos[1] ? `<figure class="stade-figure apparait"><img src="${esc(s.photos[1])}" alt="Le stade du Dragão" loading="lazy"><figcaption>Photo&#8239;: TheSportsDB</figcaption></figure>` : ""}
      </section>`,
  };
}

// Courbe de la position de Porto journée par journée (1er en haut), redessinée à la largeur du conteneur
let observateurCourbe = null;
const rangTexte = (n) => `${n}${n === 1 ? "er" : "e"}`;

function dessinerCourbe(conteneur, evolution, nbEquipes) {
  const n = evolution.length;
  if (!n) return;
  let largeurPrecedente = 0;

  const dessiner = () => {
    const largeur = conteneur.clientWidth;
    if (!largeur || largeur === largeurPrecedente) return;
    largeurPrecedente = largeur;
    const etroit = largeur < 560;
    const hauteur = etroit ? 220 : 290;
    const m = { haut: 16, droite: etroit ? 48 : 96, bas: 30, gauche: 42 };
    const largeurUtile = largeur - m.gauche - m.droite;
    const x = (i) => m.gauche + (n > 1 ? (i / (n - 1)) * largeurUtile : largeurUtile / 2);
    const y = (r) => m.haut + ((r - 1) / Math.max(1, nbEquipes - 1)) * (hauteur - m.haut - m.bas);
    const rangs = [...new Set([1, 5, 10, 15, nbEquipes])].filter((r) => r <= nbEquipes);
    const reperes = evolution.map((e, i) => [e, i]).filter(([e, i]) => i === 0 || i === n - 1 || e.journee % (etroit ? 10 : 5) === 0);
    const fin = evolution[n - 1];

    conteneur.innerHTML = `
      <svg width="${largeur}" height="${hauteur}" role="img" aria-label="Position de Porto journée par journée, ${rangTexte(fin.rang)} à l’arrivée avec ${fin.points} points">
        ${rangs.map((r) => `
          <line class="courbe-grille" x1="${m.gauche}" x2="${largeur - m.droite}" y1="${y(r)}" y2="${y(r)}"/>
          <text class="courbe-axe" x="${m.gauche - 10}" y="${y(r)}" text-anchor="end" dominant-baseline="middle">${rangTexte(r)}</text>`).join("")}
        ${reperes.map(([e, i]) => `<text class="courbe-axe" x="${x(i)}" y="${hauteur - 8}" text-anchor="middle">J${e.journee}</text>`).join("")}
        <polyline class="courbe-ligne" points="${evolution.map((e, i) => `${x(i).toFixed(1)},${y(e.rang).toFixed(1)}`).join(" ")}"/>
        <line class="courbe-viseur" y1="${m.haut}" y2="${hauteur - m.bas}" visibility="hidden"/>
        <circle class="courbe-point" cx="${x(n - 1)}" cy="${y(fin.rang)}" r="5"/>
        <text class="courbe-etiquette" x="${x(n - 1) + 12}" y="${y(fin.rang)}" dominant-baseline="middle">${rangTexte(fin.rang)}${etroit ? "" : ` · ${fin.points} pts`}</text>
        <circle class="courbe-point survol" r="5" visibility="hidden"/>
        <rect class="courbe-zone" x="${m.gauche - 8}" y="0" width="${largeurUtile + 16}" height="${hauteur}"/>
      </svg>
      <div class="infobulle" hidden></div>`;

    const svg = conteneur.querySelector("svg");
    const viseur = svg.querySelector(".courbe-viseur");
    const point = svg.querySelector(".courbe-point.survol");
    const bulle = conteneur.querySelector(".infobulle");
    const montrer = (evt) => {
      const px = evt.clientX - svg.getBoundingClientRect().left;
      const i = Math.max(0, Math.min(n - 1, Math.round(((px - m.gauche) / largeurUtile) * (n - 1))));
      const e = evolution[i];
      for (const [cle, valeur] of [["x1", x(i)], ["x2", x(i)], ["visibility", "visible"]]) viseur.setAttribute(cle, valeur);
      for (const [cle, valeur] of [["cx", x(i)], ["cy", y(e.rang)], ["visibility", "visible"]]) point.setAttribute(cle, valeur);
      bulle.hidden = false;
      bulle.innerHTML = `<strong>Journée ${e.journee}</strong><span>${rang(e.rang)} · ${e.points}&nbsp;pts</span>`;
      bulle.style.left = `${Math.min(largeur - bulle.offsetWidth, Math.max(0, x(i) - bulle.offsetWidth / 2))}px`;
      bulle.style.top = `${Math.max(0, y(e.rang) - bulle.offsetHeight - 14)}px`;
    };
    const cacher = () => {
      viseur.setAttribute("visibility", "hidden");
      point.setAttribute("visibility", "hidden");
      bulle.hidden = true;
    };
    const zone = svg.querySelector(".courbe-zone");
    zone.addEventListener("pointermove", montrer);
    zone.addEventListener("pointerdown", montrer);
    zone.addEventListener("pointerleave", cacher);
  };

  observateurCourbe?.disconnect();
  observateurCourbe = new ResizeObserver(dessiner);
  observateurCourbe.observe(conteneur);
  dessiner();
}

function blocCourbe(evolution) {
  if (!evolution.length) return "";
  return `
    <div class="bloc-courbe apparait">
      ${enteteDeSection("Position en Liga Portugal", "Journée par journée")}
      <div class="courbe"><div class="courbe-trace" id="courbe"></div></div>
      <details class="donnees">
        <summary>Voir les données</summary>
        <table class="tableau-donnees">
          <thead><tr><th>Journée</th><th>Position</th><th>Points</th></tr></thead>
          <tbody>${evolution.map((e) => `<tr><td>${e.journee}</td><td>${rang(e.rang)}</td><td>${e.points}</td></tr>`).join("")}</tbody>
        </table>
      </details>
    </div>`;
}

async function saisons() {
  const [liste, liga] = await Promise.all([api("/saisons"), api("/classement/liga-portugal")]);
  const passees = liste.filter((s) => s !== liga.saison);

  return {
    titre: "Saisons passées",
    html: `
      ${enteteDePage("Archives", "Saisons", "passées", "Le parcours de Porto en Liga Portugal, saison par saison, d’après les résultats d’openfootball.")}
      <section class="conteneur section-courte">
        <div class="saisons-choix">${passees.map((s, i) => `<button class="puce" aria-pressed="${i === 0}" data-saison="${esc(s)}">${esc(s)}</button>`).join("")}</div>
        <div id="saison"></div>
      </section>`,
    init: (racine) => {
      const zone = racine.querySelector("#saison");
      const charger = async (saison) => {
        zone.innerHTML = chargeur(true);
        try {
          const data = await api(`/saisons/${saison}`);
          const porto = data.classement.find((l) => l.porto);
          const champion = porto?.rang === 1;
          zone.innerHTML = `
            ${porto ? `
              <div class="bilan apparait">
                <div>
                  <div class="bilan-rang${champion ? " champion" : ""}">${rang(porto.rang)}</div>
                  <div class="bilan-titre${champion ? " champion" : ""}">${champion ? "Champion du Portugal" : `Liga Portugal ${esc(saison)}`}</div>
                </div>
                ${bandeStats(porto, "", false)}
              </div>` : ""}
            ${blocCourbe(data.evolution)}
            <div class="duo">
              <div>
                ${enteteDeSection("", "Classement")}
                ${tableau(data.classement)}
                <p class="note">Classement recalculé à partir des scores. Il ne tient compte ni des pénalités de points, ni du départage par confrontations directes.</p>
              </div>
              <div>
                ${enteteDeSection("", "Matchs de Porto")}
                ${forme([...data.matchs].reverse())}
                ${listeMatchs(data.matchs)}
              </div>
            </div>`;
          animer(zone);
          const courbe = zone.querySelector("#courbe");
          if (courbe) dessinerCourbe(courbe, data.evolution, data.classement.length);
        } catch (e) {
          zone.innerHTML = erreur(e);
        }
      };
      racine.querySelectorAll("[data-saison]").forEach((bouton) => bouton.addEventListener("click", () => {
        racine.querySelectorAll("[data-saison]").forEach((b) => b.setAttribute("aria-pressed", b === bouton));
        charger(bouton.dataset.saison);
      }));
      if (passees.length) charger(passees[0]);
    },
  };
}

// ---------- Routeur ----------

const routes = { "": accueil, matchs, classements, effectif, histoire, palmares, stade, saisons, match: pageMatch };
let navigationEnCours = 0;

const boutonMenu = document.querySelector(".menu-bouton");
function basculerMenu(ouvert) {
  document.documentElement.classList.toggle("menu-ouvert", ouvert);
  boutonMenu.setAttribute("aria-expanded", ouvert);
  boutonMenu.setAttribute("aria-label", ouvert ? "Fermer le menu" : "Ouvrir le menu");
}
boutonMenu.addEventListener("click", () => basculerMenu(!document.documentElement.classList.contains("menu-ouvert")));
document.querySelectorAll(".nav a").forEach((a) => a.addEventListener("click", () => basculerMenu(false)));
addEventListener("keydown", (e) => e.key === "Escape" && basculerMenu(false));

async function naviguer() {
  const [nom, ...params] = location.hash.replace(/^#\/?/, "").split("/");
  const route = routes[nom] ? nom : "";
  const numero = ++navigationEnCours;

  minuteurs.forEach(clearInterval);
  minuteurs = [];
  basculerMenu(false);
  const rubrique = route === "match" ? "matchs" : route;
  document.querySelectorAll(".nav a").forEach((a) => a.classList.toggle("actif", a.dataset.route === rubrique));
  vue.innerHTML = chargeur();
  window.scrollTo({ top: 0 });

  try {
    const { titre, html, init } = await routes[route](...params.map(decodeURIComponent));
    if (numero !== navigationEnCours) return;
    document.title = route ? `${titre} · FC Porto Wiki` : "FC Porto Wiki";
    vue.innerHTML = `<div class="entree">${html}</div>`;
    init?.(vue);
    animer(vue);
    vue.focus({ preventScroll: true });
  } catch (e) {
    if (numero === navigationEnCours) vue.innerHTML = erreur(e);
  }
}

addEventListener("hashchange", naviguer);
naviguer();

// ---------- App installable ----------

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});

const boutonInstaller = document.querySelector(".installer");
const astuceIos = document.querySelector(".astuce");
const dejaInstallee = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const surIos = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
let invitation = null;

// Chrome, Edge et Android proposent l'installation : on la garde pour notre bouton
addEventListener("beforeinstallprompt", (e) => {
  invitation = e;
  boutonInstaller.hidden = false;
});
addEventListener("appinstalled", () => {
  invitation = null;
  boutonInstaller.hidden = true;
});

// Sur iPhone et iPad, Safari ne propose rien : le bouton explique le geste à faire
if (surIos && !dejaInstallee) boutonInstaller.hidden = false;

boutonInstaller.addEventListener("click", async () => {
  if (invitation) {
    invitation.prompt();
    await invitation.userChoice;
    invitation = null;
    boutonInstaller.hidden = true;
  } else if (surIos) {
    astuceIos.hidden = false;
  }
});
astuceIos.querySelector(".astuce-fermer").addEventListener("click", () => (astuceIos.hidden = true));

// Hors ligne : bandeau d'information, puis données fraîches dès le retour du réseau
addEventListener("offline", () => signalerHorsLigne(true));
addEventListener("online", () => {
  cache.clear();
  naviguer();
});
if (!navigator.onLine) signalerHorsLigne(true);
