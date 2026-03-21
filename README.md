# Poké Role - Roll Requester

Un modulo per **FoundryVTT v13** che aggiunge al Game Master la possibilità di richiedere tiri combinati ai giocatori direttamente dal menu contestuale dei token.

## Funzionalità

- **Menu contestuale token**: Cliccando con il tasto destro su un token, il GM troverà un nuovo pulsante **"Richiedi Tiro"** (visibile solo al master).
- **Finestra di richiesta**: Il GM può:
  - Scrivere un messaggio descrittivo per il giocatore (es. "Tira per evitare la trappola!")
  - Selezionare una combinazione di **attributi** (Fisici/Mentali e Sociali) e **abilità**
  - Impostare i **successi richiesti** e scegliere se applicare la **penalità dolore**
- **Messaggio in chat**: La richiesta appare come messaggio whisper al giocatore proprietario del personaggio, contenente:
  - Il messaggio del GM
  - Un pulsante "**Tiro su [Attributi + Abilità selezionate]**" (es. "Tiro su Destrezza + Allerta")
- **Tiro automatico**: Cliccando il pulsante, il giocatore esegue automaticamente il tiro combinato con le meccaniche del sistema Poké Role (pool di d6, successi su 4+, penalità dolore).

## Requisiti

- **FoundryVTT**: v13 (verificato su Build 351)
- **Sistema**: [Poké Role System](https://github.com/RiccardoMont1/Pok-Role-Module) v0.16.0+

## Installazione

### Metodo 1 - URL del Manifesto
1. In FoundryVTT, vai su **Impostazioni → Gestisci Moduli → Installa Modulo**
2. Incolla l'URL del manifesto:
   ```
   https://github.com/LinguardEvergreen/poke-role-roll-requester/releases/latest/download/module.json
   ```
3. Clicca **Installa**

### Metodo 2 - Manuale
1. Scarica l'ultima release da [GitHub Releases](https://github.com/LinguardEvergreen/poke-role-roll-requester/releases)
2. Estrai la cartella in `Data/modules/`
3. Riavvia FoundryVTT

## Utilizzo

1. **Attiva il modulo** nelle impostazioni del mondo
2. Come GM, fai **tasto destro** su un token nella scena
3. Clicca **"Richiedi Tiro"** nel menu contestuale
4. Nella finestra di dialogo:
   - Scrivi un messaggio descrittivo (opzionale)
   - Seleziona gli attributi e/o abilità desiderati
   - Imposta i successi richiesti
   - Scegli se applicare la penalità dolore
5. Clicca **"Invia Richiesta"**
6. Il giocatore proprietario del personaggio vedrà il messaggio in chat con il pulsante per eseguire il tiro

## Attributi Disponibili

### Fisici / Mentali
Forza, Destrezza, Vitalità, Speciale, Intuito

### Sociali
Tenacia, Bellezza, Classe, Grazia, Arguzia, Fascino

### Abilità
Allerta, Atletica, Lotta, Canalizzare, Scontro, Artigianato, Empatia, Etichetta, Evasione, Intimidire, Sapienza, Medicina, Natura, Esibizione, Scienza, Furtività, Lanciare, Armi

## Meccaniche di Tiro

Il modulo utilizza le stesse meccaniche del **Tiro Combinato** del sistema Poké Role:
- **Pool di dadi**: somma dei valori di tutti gli attributi/abilità selezionati → Nd6
- **Successo**: ogni dado che mostra 4 o più è un successo
- **Penalità dolore**: 0 se HP > metà max, 1 se HP ≤ metà max, 2 se HP ≤ 1
- **Risultato**: Successi netti (raw - rimossi) confrontati con i successi richiesti → HIT o MISS

## Lingue Supportate

- Italiano 🇮🇹
- English 🇬🇧

## Licenza

Questo modulo è distribuito come software libero per uso con FoundryVTT e il sistema Poké Role.
