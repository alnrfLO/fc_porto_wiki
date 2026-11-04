// fc porto wiki pour windows et linux : une fenetre rien que pour le site.
// tout vient du site en ligne donc l app est toujours a jour, et les pages deja vues
// marchent hors ligne grace au service worker du site.

const { app, BrowserWindow, Menu, shell } = require("electron");
const path = require("node:path");

const SITE = "https://fc-porto-wiki.vercel.app";
const PAGE_HORS_LIGNE = path.join(__dirname, "hors-ligne.html");

const estDuSite = (url) => {
  try {
    return new URL(url).origin === SITE;
  } catch {
    return false;
  }
};

// les liens vers wikipedia, espn etc s ouvrent dans le navigateur, pas dans l app
function ouvrirDansLeNavigateur(url) {
  if (/^https?:\/\//.test(url)) shell.openExternal(url);
}

let fenetre = null;

function creerFenetre() {
  fenetre = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 380,
    minHeight: 560,
    title: "FC Porto Wiki",
    icon: path.join(__dirname, "icone.png"),
    backgroundColor: "#040919",
    show: false,
    webPreferences: { contextIsolation: true, sandbox: true },
  });

  fenetre.once("ready-to-show", () => fenetre.show());

  const contenu = fenetre.webContents;
  contenu.setWindowOpenHandler(({ url }) => {
    if (estDuSite(url)) contenu.loadURL(url);
    else ouvrirDansLeNavigateur(url);
    return { action: "deny" };
  });
  contenu.on("will-navigate", (evenement, url) => {
    if (estDuSite(url) || url.startsWith("file:")) return;
    evenement.preventDefault();
    ouvrirDansLeNavigateur(url);
  });

  // premier lancement sans reseau (y a encore rien d enregistre) : j affiche une page locale
  contenu.on("did-fail-load", (_e, code, _description, url, principale) => {
    if (principale && code !== -3 && estDuSite(url)) fenetre.loadFile(PAGE_HORS_LIGNE);
  });

  // les raccourcis classiques : F5 / Ctrl+R pour actualiser, Alt+fleches pour naviguer, Ctrl +/- pour zoomer, F11 plein ecran
  contenu.on("before-input-event", (evenement, touche) => {
    if (touche.type !== "keyDown") return;
    const ctrl = touche.control || touche.meta;
    const historique = contenu.navigationHistory;
    let gere = true;
    if (touche.key === "F5" || (ctrl && touche.key.toLowerCase() === "r")) {
      if (contenu.getURL().startsWith("file:")) contenu.loadURL(SITE);
      else contenu.reload();
    } else if (touche.alt && touche.key === "ArrowLeft" && historique.canGoBack()) historique.goBack();
    else if (touche.alt && touche.key === "ArrowRight" && historique.canGoForward()) historique.goForward();
    else if (ctrl && (touche.key === "+" || touche.key === "=")) contenu.setZoomLevel(contenu.getZoomLevel() + 0.5);
    else if (ctrl && touche.key === "-") contenu.setZoomLevel(contenu.getZoomLevel() - 0.5);
    else if (ctrl && touche.key === "0") contenu.setZoomLevel(0);
    else if (touche.key === "F11") fenetre.setFullScreen(!fenetre.isFullScreen());
    else gere = false;
    if (gere) evenement.preventDefault();
  });

  // les boutons precedent / suivant de la souris sous windows
  fenetre.on("app-command", (_e, commande) => {
    const historique = contenu.navigationHistory;
    if (commande === "browser-backward" && historique.canGoBack()) historique.goBack();
    if (commande === "browser-forward" && historique.canGoForward()) historique.goForward();
  });

  fenetre.loadURL(SITE);
}

// une seule fenetre : si on relance l app sa ramene juste celle qui est deja ouverte
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!fenetre) return;
    if (fenetre.isMinimized()) fenetre.restore();
    fenetre.focus();
  });

  Menu.setApplicationMenu(null);
  app.whenReady().then(creerFenetre);
  app.on("window-all-closed", () => app.quit());
}
