# BoardCue: applicazione della Draft UI Language v1.2

Questa cartella contiene il pacchetto **Draft UI Language v1.2** così come fornito dal titolare: è la fonte di verità per la UI. Questo file descrive solo come il pacchetto è applicato a BoardCue.

## Autorità della palette

Come previsto da `assets/brand/colors.md`, i colori del prodotto hanno la precedenza sulla palette di riferimento Draft. BoardCue mantiene le proprie palette **Paper** (chiaro) e **Graphite** (scuro), definite in `app/tokens.css`. La UI language si applica attraverso geometria, tipografia, bordi, densità, componenti e movimento.

| Ruolo UI language | Token BoardCue |
|---|---|
| `bg`, `surface`, `surface-raised`, `surface-soft` | `--bg`, `--surface`, `--surface` + `--shadow-3`, `--surface-2` / `--column` |
| `text`, `text-muted`, `text-subtle` | `--text`, `--text-2`, `--text-3` |
| `border`, `border-strong` | `--border`, `--border-strong` |
| primary (azione principale) | `--primary-solid`, `--primary` (testo/link) |
| segnale / evidenza (voce, AI, offset accent) | `--signal-solid`, `--signal`, `--signal-soft` |
| success / warning / danger / info | token semantici omonimi (mai colori di brand) |
| focus | `--focus` (distinto dal colore primario) |
| glass | `--glass` + `backdrop-filter: blur(16px)` solo sulla barra superiore |

## Scelte applicate

- **Geometria**: `--radius-structural: 0` per pannelli, card, colonne, bottoni, campi e tabelle. `--radius-sm: 4px` solo per menu e dialog. Pill (`--radius-pill`) solo per chip, tag, badge di stato, switch e contatori. Restano circolari solo avatar, spinner e pallini di stato.
- **Tipografia**: Inter (self-hosted con `@fontsource-variable/inter`), display 850–900 con tracking fino a −0.042em, testo 400–500. Monospace di sistema per etichette tecniche (`.eyebrow`, `.meta`), intestazioni di tabella, contatori, date e diff.
- **Signal rail** (`--rail: 3px`): card al passaggio del mouse, voci di menu, notifiche, toast, proposta AI (con etichetta `SISTEMA / PROPOSTA AI`), piano in evidenza, giorno corrente nel calendario.
- **Offset accent** (`--offset: 4px`): hover dei bottoni (bordo) e dei bottoni primari (arancio segnale); compositore della board (grigio, blu al focus, arancio in registrazione); anteprima animata della landing come unico oggetto speciale della pagina.
- **Movimento**: 120/180/260 ms con `cubic-bezier(.22,1,.36,1)`; spostamenti al passaggio del mouse di al massimo 2px; nessuno scale bounce; tutto azzerato con `prefers-reduced-motion`.
- **Target**: bottoni 44px (48px i grandi); 36px solo per controlli compatti desktop; con puntatore touch i controlli compatti tornano a 44px.
- **Modalità**: prodotto (board, impostazioni, account, backoffice) in *Signature* con densità *Utility*; landing in *Showcase* solo nell'hero.
- **Logo**: colonne squadrate e punto "cue" tondo (pallino di stato), senza gradienti.
