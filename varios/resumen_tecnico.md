# Resumen Técnico: Moltbot

**Moltbot** es una plataforma de gateway para asistentes de IA personales y multi-canal. Permite centralizar la interacción con modelos de IA (como Claude o GPT) a través de canales de mensajería comunes.

## Arquitectura

- **Gateway**: El plano de control central que gestiona sesiones, canales y ejecución de herramientas.
- **Agent Runtime**: Basado en el framework Pi, orquestra la lógica del agente y la integración con LLMs.
- **Canales**: Adaptadores para WhatsApp, Telegram, Slack, Discord, Signal, iMessage, etc.
- **Skills**: Sistema de herramientas modulares (búsqueda web, resúmenes, control de navegador, capturas de pantalla).

## Tecnologías Clave

- **Lenguaje**: TypeScript (ESM) sobre Node.js 22+.
- **Gestión de Paquetes**: PNPM.
- **Mensajería**:
  - WhatsApp: `baileys`
  - Telegram: `grammY`
  - Slack/Discord: SDKs oficiales.
- **Infraestructura**: Docker para sandboxing de sesiones no principales.
- **Apps Companion**: Soporte nativo para macOS, iOS y Android (nodos remotos).

## Flujo de Trabajo

1. Entrada de mensaje por canal.
2. Enrutamiento al agente/sesión correspondiente.
3. El agente razona y ejecuta herramientas (skills) si es necesario.
4. Respuesta final entregada al canal de origen.
