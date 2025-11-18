# Padel Community

Eine moderne Single-Page-App, die Padel-Spieler:innen dabei unterstützt, sich
schnell zu vernetzen, gemeinsame Sessions zu planen und passende Clubs zu
entdecken.

## Features

- 📅 **Kalender & Dashboard** – Visualisiere anstehende Matches in einer
  Wochenübersicht und behalte offene Plätze im Blick.
- 🧑‍🤝‍🧑 **Matchmaking** – Filtere nach Skill-Level und Ort, tritt bestehenden
  Terminen bei oder erstelle eigene Sessions mit allen relevanten Infos.
- 📍 **Spot-Finder** – Entdecke kuratierte Padel-Spots in deutschen Städten mit
  direkten Links zur Buchung.
- 🔐 **Sichere Accounts** – Registriere dich per E-Mail oder nutze die
  Google-Anmeldung, um deine Daten zu schützen.
- 🧠 **Synchronisierte Events** – Alle Termine werden automatisch über Supabase
  geladen und gespeichert, sodass deine eigenen Matches sowie Zusagen zwischen
  Sessions bestehen bleiben.
- ✨ **Modernes Interface** – Glas-Effekt, Animationen und Dark-UI sorgen für
  eine zeitgemäße Nutzererfahrung. Animationen lassen sich auf Wunsch
  deaktivieren.

## Projektstruktur

```
├── index.html          # Einstiegspunkt der Anwendung
└── src/
    ├── main.js         # Initialisierung, Wiring von Views und Controllern
    ├── controllers/    # Event-, Navigations- und Kalenderlogik
    ├── state/          # Lokaler Storage und globaler Zustand
    ├── utils/          # Formatierungs- und Zeit-Helferfunktionen
    ├── views/          # Renderer für Dashboard, Sessions, Kalender & Spots
    └── styles/         # Aufgeteilte Stylesheets (base/components/views/responsive)
```

## Entwicklung & Nutzung

1. Öffne `index.html` direkt im Browser deiner Wahl.
2. Registriere dich mit deiner E-Mail-Adresse oder verwende den Google-Login.
3. Verwende das Dashboard, um passende Sessions zu finden oder zu filtern.
4. Über den Tab „Termin erstellen“ kannst du eigene Events anlegen.
5. Unter „Padel-Spots“ findest du inspirierende Locations inklusive externer
   Links zur Buchung.

> Tipp: Events werden direkt in der Supabase-Tabelle `events` verwaltet. Stelle
> sicher, dass die Supabase-Umgebung erreichbar ist, damit neue Termine und
> Zusagen korrekt synchronisiert werden.

## Google Anmeldung aktivieren

Damit die Google-Anmeldung funktioniert, benötigst du eine eigene Client-ID aus
der [Google Cloud Console](https://console.cloud.google.com/). Trage die
Client-ID anschließend im Markup ein:

```html
<div id="googleSignInButton" class="auth-google" data-client-id="DEINE_CLIENT_ID"></div>
```

Alternativ kannst du die ID auch global über ein `data-google-client-id`-Attribut
auf dem `body`-Element hinterlegen. Ohne eine gültige ID wird der Google-Login
automatisch deaktiviert und ein Hinweis angezeigt.

## Weiterführende Ideen

- Integration einer echten Nutzer-Authentifizierung und Team-Chat-Funktion.
- Echtzeit-Updates über WebSockets, um Zusagen mehrerer Spieler synchron zu
  halten.
- Native App mit Push-Benachrichtigungen für spontane Match-Anfragen.

Viel Spaß beim Organisieren deiner nächsten Padel-Session! 🟢
