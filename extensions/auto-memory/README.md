# Auto-Memory Plugin

Plugin per OpenClaw che scrive automaticamente nella memoria (`memory/YYYY-MM-DD.md`) i fatti importanti estratti dalle conversazioni.

## Funzionalità

- **Analisi automatica**: Analizza le conversazioni per estrarre fatti importanti, decisioni e preferenze
- **Scrittura periodica**: Scrive nella memoria ogni N messaggi (configurabile, default: 5)
- **Notifiche**: Notifica l'utente nella chat quando aggiorna la memoria
- **Filtraggio per importanza**: Salva solo i fatti con un'importanza superiore alla soglia configurata

## Configurazione

Aggiungi la configurazione nel file `openclaw.json`:

```json
{
  "plugins": {
    "@openclaw/auto-memory": {
      "enabled": true,
      "messageThreshold": 5,
      "minImportance": 0.7,
      "notificationEnabled": true,
      "notificationMessage": "💾 Memoria aggiornata"
    }
  }
}
```

### Opzioni

- `enabled` (boolean, default: `true`): Abilita/disabilita il plugin
- `messageThreshold` (number, default: `5`): Numero di messaggi dopo i quali analizzare e scrivere nella memoria
- `minImportance` (number, default: `0.7`): Soglia minima di importanza (0-1) per i fatti da salvare
- `notificationEnabled` (boolean, default: `true`): Se inviare una notifica quando la memoria viene aggiornata
- `notificationMessage` (string, default: `"💾 Memoria aggiornata"`): Messaggio da inviare come notifica

## Come funziona

1. Il plugin registra un hook `agent_end` che viene chiamato dopo ogni esecuzione dell'agente
2. Conta i messaggi processati per sessione
3. Quando raggiunge la soglia configurata (`messageThreshold`), analizza la conversazione usando l'LLM
4. Estrae fatti importanti, decisioni e preferenze
5. Scrive i fatti nella memoria (`memory/YYYY-MM-DD.md`) organizzati per categoria
6. Invia una notifica all'utente nella chat corrente

## Formato della memoria

I fatti vengono scritti in `memory/YYYY-MM-DD.md` con il seguente formato:

```markdown
# 2026-02-08

## 14:30

### Decisioni

- Deciso di usare PostgreSQL per il nuovo progetto

### Preferenze

- L'utente preferisce ricevere notifiche via email

### Fatti

- Il progetto deve essere completato entro fine mese
```

## Categorie

I fatti vengono categorizzati in:

- **Decisioni**: Decisioni prese durante la conversazione
- **Preferenze**: Preferenze dell'utente
- **Informazioni personali**: Informazioni personali rilevanti
- **Fatti**: Altri fatti importanti
