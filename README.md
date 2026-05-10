# 📅 Stundenplan + Lernbüros PWA

Eine Progressive Web App für den Schulalltag – mit eigenem Stundenplan (via Untis) und smarter Lernbüro-Verwaltung.

## Features

- **Heute-Ansicht** – Dein Tagesplan auf einen Blick
- **Wochenplan** – Grid-Übersicht mit Navigation zwischen Wochen
- **Lernbüros (LB)** – Wähle pro LB-Stunde aus den verfügbaren Lernbüros des Tages
- **PDF-Import** – Lade den Lernbüroplan als PDF hoch, die App liest alle Einträge automatisch aus
- **Manuell bearbeiten** – Füge Lernbüros per Hand hinzu oder lösche sie
- **Untis-Integration** – Verbinde dich mit deinem WebUntis-Account (EF, Q1, Q2, OS_LB)
- **Offline-fähig** – Service Worker cacht die App für den Offline-Betrieb
- **Installierbar** – Als PWA auf dem Home-Screen installierbar

## Nutzung

### Direktstart mit Demo-Daten
1. App öffnen → **Einstellungen** → **Demo-Stundenplan laden**
2. Auf **Heute** oder **Woche** wechseln
3. LB-Stunden (gelb markiert) anklicken → Lernbüro auswählen

### Untis verbinden
1. Einstellungen → Untis-Felder ausfüllen
   - URL: z.B. `https://mese.webuntis.com`
   - Schule: Kurzname deiner Schule
   - Benutzername + Passwort
   - Klassen: `EF,Q1,Q2,OS_LB`
2. **Verbinden & Stundenplan laden** klicken

> ⚠️ **CORS-Hinweis**: Browser blockieren direkte Untis-Anfragen. Für Produktion wird ein Backend-Proxy oder die Untis iCal-URL empfohlen.

### Lernbüros per PDF importieren
1. **Lernbüros** → PDF-Bereich → PDF hochladen oder reinziehen
2. Erkannte Einträge prüfen → **Importieren** klicken

### Lernbüros manuell pflegen
1. **Lernbüros** → **+ Eintrag hinzufügen**
2. Tag, Stunde, Lehrer, Raum, Fach eingeben

## Deployment

Die App besteht aus reinen statischen Dateien und kann auf jedem Webserver oder GitHub Pages betrieben werden.

```bash
# GitHub Pages aktivieren:
# Repository Settings → Pages → Branch: main → / (root)
```

## Technologie

- Vanilla JS (kein Framework)
- PDF.js für PDF-Parsing
- Service Worker für Offline-Support
- localStorage für persistente Datenspeicherung
- WebUntis JSON-RPC API

## Struktur

```
├── index.html       # Haupt-HTML
├── style.css        # Dark-Theme Styles
├── app.js           # Gesamte App-Logik
├── sw.js            # Service Worker
└── manifest.json    # PWA Manifest
```
