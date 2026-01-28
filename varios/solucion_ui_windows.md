# Problema: Control UI Assets No Disponibles

## Situación Actual

✅ **Gateway corriendo exitosamente**

- WebSocket: `ws://127.0.0.1:18789`
- Modelo: `google/gemini-2.5-flash`
- Estado: Funcionando correctamente

❌ **Interfaz Web no disponible**

- Error: "Control UI assets not found"
- Causa: `pnpm ui:build` requiere bash/WSL

## Soluciones

### Opción 1: Usar WSL2 (Recomendado por el proyecto)

Según la documentación oficial, Moltbot en Windows **requiere WSL2**:

> "Windows: use **WSL2** (Ubuntu recommended). WSL2 is strongly recommended; native Windows is untested, more problematic, and has poorer tool compatibility."

**Pasos:**

1. Instalar WSL2 (Ubuntu)
2. Clonar el proyecto dentro de WSL2
3. Ejecutar `pnpm install && pnpm ui:build && pnpm build`
4. Iniciar el gateway desde WSL2

### Opción 2: Usar CLI en lugar de Web UI

Puedes interactuar con el agente directamente desde la terminal:

```bash
# Chatear con el agente
node scripts/run-node.mjs agent "Hola, ¿cómo estás?"

# O usando pnpm
pnpm moltbot agent "Tu mensaje aquí"
```

### Opción 3: Conectar un Canal (WhatsApp/Telegram)

El gateway está funcionando, puedes conectar WhatsApp o Telegram:

```bash
# WhatsApp (requiere escanear QR)
pnpm moltbot channels login

# Telegram (requiere bot token)
# Configurar en ~/.clawdbot/moltbot.json
```

## Recomendación

Para una experiencia completa con interfaz web, **usa WSL2**. Es la configuración oficialmente soportada y probada.

Si solo necesitas probar el agente rápidamente, usa la **Opción 2 (CLI)**.

## Estado del Gateway

El gateway está completamente funcional y configurado con Gemini. Solo falta la interfaz web, que requiere WSL2 para compilarse en Windows.
