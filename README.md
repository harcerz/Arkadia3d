# Arkadia 3D

Nieoficjalny, **w pełni trójwymiarowy klient przeglądarkowy** polskiego MUD-a
[Arkadia](https://arkadia.rpg.pl) (świat Wiedźmina i Warhammera). Czysty
HTML + JavaScript — bez backendu, bez build stepu — zaprojektowany pod
smartfony i hostowanie na **GitHub Pages**.

## Co potrafi

- **Diorama 3D** — izometryczna makieta krainy zbudowana ze społecznościowej
  mapy (~27 000 lokacji): kafelki kolorowane środowiskiem, łączniki wyjść,
  poziomy pionowe, etykiety. Tapnięcie sąsiedniej lokacji = krok; tapnięcie
  dalszej = automatyczny marsz (BFS po znanej mapie).
- **Widok pierwszoosobowy (FPP)** — proceduralne wnętrza bieżącej lokacji
  z portalami wyjść i wirtualnym joystickiem.
- **Pełny klient MUD** — konsola z kolorami ANSI, historia komend, tryb hasła,
  paski stanu postaci (kondycja, zmęczenie, mana…), szybkie przyciski komend.
- **Pozycjonowanie przez GMCP** — gra sama melduje współrzędne lokacji
  (`room.info`), klient dopasowuje je do mapy i animuje awatar.
- **Pora dnia** (`room.time`) steruje oświetleniem sceny.
- **PWA** — da się zainstalować na telefonie; powłoka i mapa działają z cache.

## Uruchomienie na GitHub Pages

1. W repozytorium: **Settings → Pages**.
2. *Source*: **Deploy from a branch**, wybierz branch z tym kodem oraz
   katalog **/ (root)**. Zapisz.
3. Po chwili klient będzie dostępny pod `https://<użytkownik>.github.io/<repo>/`.

Nic więcej nie trzeba wgrywać — repozytorium *jest* aplikacją.

## Jak to się łączy z grą

Przeglądarka łączy się **bezpośrednio** z serwerem gry:

- natywny WebSocket Arkadii: `wss://arkadia.rpg.pl/wss`
  (strumień telnet zakodowany base64 w ramkach tekstowych),
- awaryjnie publiczny mostek `wss://arkadia-proxy.delwing.workers.dev`
  (autorstwa Delwinga) — klient przełącza się sam, gdy połączenie
  bezpośrednie zostanie odrzucone.

W kliencie zaimplementowana jest negocjacja telnet (GMCP `0xC9`, ECHO dla
haseł, odmowa MCCP2) oraz parser pakietów GMCP (`room.info`, `char.state`,
`objects.*`, `room.time`, `gmcp_msgs`).

## Development lokalny

```bash
python3 -m http.server 8080
# http://localhost:8080         — klient (tryb „demo bez sieci" na ekranie startowym)
# http://localhost:8080/?mock=login   — automatyczne odtworzenie nagranego logowania
# http://localhost:8080/test/   — testy jednostkowe w przeglądarce
node test/node-smoke.mjs        # testy stosu protokołu w Node
```

Tryb demo odtwarza `test/transcripts/login.json` (format identyczny z ramkami
natywnego endpointu), więc ćwiczy cały stos od kodeka w górę — bez dostępu
do sieci. Transkrypt regeneruje `node tools/make-transcript.mjs`.

### Aktualizacja mapy świata

```bash
node tools/build-map-data.mjs            # pobiera najnowszy release mapy
# albo z lokalnych plików:
node tools/build-map-data.mjs --input /ścieżka/do/katalogu
```

Wynik (katalog `data/`: indeks krain + kompaktowe pliki per-kraina) jest
commitowany do repo — GitHub Pages serwuje go statycznie, a klient dociąga
tylko krainę, w której jesteś.

## Struktura

```
js/net/    transport (kodeki base64/binary), telnet, składanie linii, połączenie
js/gmcp/   kodek i stan gry (GMCP)
js/ui/     konsola ANSI, wejście, paski stanu, przyciski, ekrany
js/world/  mapa, model krainy, scena Three.js, diorama, FPP, światło dobowe
data/      przetworzona mapa świata (generowana przez tools/)
tools/     skrypty: mapa, ikony, transkrypt demo
test/      testy Node + przeglądarkowe + transkrypty
```

## Podziękowania

- **[Delwing/arkadia-mapa](https://github.com/Delwing/arkadia-mapa)** — mapa
  świata utrzymywana przez społeczność Arkadii (Delwing i współtwórcy);
  to z niej generowany jest świat 3D.
- **[Delwing/arkadia-web-client-extension](https://github.com/Delwing/arkadia-web-client-extension)**
  — referencja protokołu połączenia i publiczny mostek proxy.
- **[tjurczyk/arkadia](https://github.com/tjurczyk/arkadia)** — skrypty
  Mudleta, z których pochodzi semantyka GMCP i pasków stanu.
- **Ekipa Arkadii** ([arkadia.rpg.pl](https://arkadia.rpg.pl)) — za grę
  i publiczny endpoint WebSocket.

Three.js (MIT) jest dołączone w `js/vendor/` (licencja w `THREE-LICENSE`).

Projekt nieoficjalny — niezwiązany z administracją Arkadii. Szanuj zasady gry.
