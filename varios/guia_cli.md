# Guía de Uso del CLI de Moltbot

## Gateway Activo

✅ El gateway está corriendo en `ws://127.0.0.1:18789`
✅ Modelo configurado: `google/gemini-2.5-flash`

## Comandos CLI Disponibles

### 1. Chatear con el Agente

```bash
# Crear una sesión de chat
pnpm moltbot agent --session-id mi-sesion --message "Tu mensaje aquí"

# Ejemplo
pnpm moltbot agent --session-id cli-test --message "Hola, ¿cómo estás?"
```

### 2. Ver Estado del Sistema

```bash
# Ver estado general
pnpm moltbot status

# Ver salud del gateway
pnpm moltbot health

# Listar agentes configurados
pnpm moltbot agents list
```

### 3. Gestionar Canales (Opcional)

```bash
# Conectar WhatsApp
pnpm moltbot channels login

# Ver estado de canales
pnpm moltbot channels status
```

## Notas Importantes

- **Sesión ID**: Usa `--session-id` para mantener el contexto de conversación
- **Seguridad**: El gateway solo escucha en localhost (127.0.0.1), completamente seguro
- **Sin UI Web**: No necesitas la interfaz web para usar el agente
- **Recursos**: El CLI consume muy pocos recursos comparado con WSL2

## Ejemplo de Uso Completo

```bash
# Primera interacción
pnpm moltbot agent --session-id alexis --message "Hola, preséntate"

# Continuar la conversación (misma sesión)
pnpm moltbot agent --session-id alexis --message "¿Qué puedes hacer?"

# Nueva sesión
pnpm moltbot agent --session-id trabajo --message "Ayúdame con código Python"
```

## Solución de Problemas

Si el comando falla:

1. Verifica que el gateway esté corriendo: `pnpm moltbot status`
2. Revisa la configuración: `cat ~/.clawdbot/moltbot.json`
3. Verifica la API key: `cat .env`
