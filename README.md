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
- 🧠 **Lokale Speicherung** – Events werden lokal gespeichert, sodass deine
  eigenen Termine und Zusagen beim nächsten Besuch erhalten bleiben.
- ✨ **Modernes Interface** – Glas-Effekt, Animationen und Dark-UI sorgen für
  eine zeitgemäße Nutzererfahrung. Animationen lassen sich auf Wunsch
  deaktivieren.

## Projektstruktur

```
├── app.js        # Kernlogik für Event-Management, Kalender und Interaktionen
├── index.html    # Einstiegspunkt der Anwendung
└── styles.css    # Stildefinitionen im modernen Neumorphismus-/Glassmorphism-Look
```

## Entwicklung & Nutzung

1. Öffne `index.html` direkt im Browser deiner Wahl.
2. Verwende das Dashboard, um passende Sessions zu finden oder zu filtern.
3. Über den Tab „Termin erstellen“ kannst du eigene Events anlegen.
4. Unter „Padel-Spots“ findest du inspirierende Locations inklusive externer
   Links zur Buchung.

> Tipp: Die App speichert Events im `localStorage` des Browsers. Beim Einsatz im
> privaten Modus oder nach dem Löschen der Browserdaten werden Einträge erneut
> mit Demo-Inhalten initialisiert.

## Weiterführende Ideen

- Integration einer echten Nutzer-Authentifizierung und Team-Chat-Funktion.
- Echtzeit-Updates über WebSockets, um Zusagen mehrerer Spieler synchron zu
  halten.
- Native App mit Push-Benachrichtigungen für spontane Match-Anfragen.

Viel Spaß beim Organisieren deiner nächsten Padel-Session! 🟢
