// le service worker de l app : le site et les dernieres donnees marchent meme sans reseau.
// en ligne tout vient du serveur (donc le site se met a jour a chaque push),
// hors ligne sa affiche la derniere version enregistree.

const CACHE = "fc-porto-v1";
const POLICES = "fc-porto-polices";
const COQUILLE = ["/", "/app.js", "/style.css", "/manifest.json", "/icons/icone-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(COQUILLE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((cles) => Promise.all(cles.filter((c) => c !== CACHE && c !== POLICES).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

// les polices google changent jamais donc je les garde des le premier chargement
async function police(requete) {
  const cache = await caches.open(POLICES);
  const enregistree = await cache.match(requete);
  if (enregistree) return enregistree;
  const reponse = await fetch(requete);
  if (reponse.ok || reponse.type === "opaque") cache.put(requete, reponse.clone());
  return reponse;
}

// une reponse qui vient de la memoire a l en-tete x-hors-ligne, comme sa la page affiche le bandeau
function horsLigne(reponse) {
  const entetes = new Headers(reponse.headers);
  entetes.set("x-hors-ligne", "1");
  return new Response(reponse.body, { status: reponse.status, statusText: reponse.statusText, headers: entetes });
}

// site et donnees : la version en ligne d abord, sinon la derniere enregistree
async function reseauDAbord(requete) {
  try {
    const reponse = await fetch(requete);
    if (reponse.ok) {
      const copie = reponse.clone();
      caches.open(CACHE).then((c) => c.put(requete, copie));
    }
    return reponse;
  } catch (e) {
    const enregistree = (await caches.match(requete, { ignoreVary: true }))
      || (requete.mode === "navigate" && (await caches.match("/")));
    if (enregistree) return horsLigne(enregistree);
    throw e;
  }
}

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(police(request));
  } else if (url.origin === location.origin && !url.pathname.startsWith("/docs") && url.pathname !== "/openapi.json") {
    e.respondWith(reseauDAbord(request));
  }
  // les logos (espn) et les images (wikipedia, thesportsdb) je laisse le navigateur gerer
});
