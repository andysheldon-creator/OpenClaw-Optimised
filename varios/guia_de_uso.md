# Guía de Uso: Moltbot 🦞

Moltbot funciona como un "puente" (gateway) entre tus aplicaciones de mensajería (WhatsApp, Telegram, etc.) y un asistente de IA. Aquí tienes los pasos para ponerlo en marcha.

## 1. Preparación (Entorno)

Moltbot requiere **Node.js 22+**. En Windows, se recomienda usar **WSL2** para una mejor experiencia, aunque puede funcionar de forma nativa.

Desde la carpeta raíz del proyecto, instala las dependencias y compila:

```bash
pnpm install
pnpm ui:build
pnpm build
```

## 2. Configuración Inicial (Onboarding)

El comando `onboard` te guiará para configurar tus API keys (Claude, OpenAI), tu espacio de trabajo y las habilidades (skills) del bot.

```bash
pnpm moltbot onboard
```

## 3. Conectar Canales (Ejemplo: WhatsApp)

Para conectar tu WhatsApp, necesitas vincular la sesión mediante un código QR (similar a WhatsApp Web):

```bash
pnpm moltbot channels login
```

## 4. Iniciar el Gateway

El Gateway es el proceso principal que debe estar corriendo para que el bot responda.

```bash
# Para desarrollo (recarga automática al cambiar código)
pnpm gateway:watch

# Para uso normal
pnpm moltbot gateway
```

## 5. Formas de Interactuar

### A través de Mensajería

Una vez configurado y con el Gateway corriendo, simplemente escribe a tu propio número de WhatsApp (o al bot de Telegram configurado).

### A través de la CLI (Terminal)

Puedes hablar con el agente directamente desde la terminal:

```bash
pnpm moltbot agent "Hola, ¿quién eres?"
```

### A través de la Interfaz Web (Dashboard)

Si el Gateway está corriendo localmente, abre tu navegador en:
[http://localhost:18789](http://localhost:18789)

Ahí podrás ver los chats, estados de los canales y la configuración.

## Comandos Útiles

- `pnpm moltbot doctor`: Verifica que todo esté bien configurado.
- `pnpm moltbot channels status`: Muestra el estado de conexión de tus canales.
- `pnpm moltbot config list`: Muestra tu configuración actual.

---

_Nota: Si estás en Windows nativo y tienes problemas, intenta usar WSL2._
