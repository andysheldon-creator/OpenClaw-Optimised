# ✅ Moltbot Configurado con Gemini

## Estado Actual

🟢 **Gateway corriendo exitosamente**

- **URL Web**: http://localhost:18789
- **WebSocket**: ws://127.0.0.1:18789
- **Modelo IA**: Google Gemini 2.5 Flash
- **PID**: 15732

## Archivos de Configuración

### `.env` (raíz del proyecto)

```
GEMINI_API_KEY=AIzaSyCOJSJ-b78CFSOcXy0lCdtKi4m2P_jHpS0
```

### `~/.clawdbot/moltbot.json`

```json
{
  "gateway": {
    "mode": "local",
    "auth": {
      "token": "local-dev-token"
    }
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "google/gemini-2.5-flash"
      }
    }
  }
}
```

## Cómo Usar

### 1. Acceder a la Interfaz Web

Abre tu navegador en: **http://localhost:18789**

### 2. Iniciar el Gateway (si no está corriendo)

```bash
cd c:\Users\PC Blado\Desktop\AIDO\moltbot
node scripts/run-node.mjs gateway
```

### 3. Detener el Gateway

Presiona `Ctrl+C` en la terminal donde está corriendo.

## Próximos Pasos

1. **Conectar WhatsApp** (opcional):

   ```bash
   pnpm moltbot channels login
   ```

2. **Explorar la interfaz web** en http://localhost:18789

3. **Chatear con el agente** directamente desde la interfaz

## Notas Importantes

- El gateway debe estar corriendo para usar la interfaz web
- La API key de Gemini está en el archivo `.env` (no compartir)
- El modelo configurado es `google/gemini-2.5-flash` (gratuito)
- El token de autenticación local es `local-dev-token`
